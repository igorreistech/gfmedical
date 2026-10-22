-- Controle de Fretes — 22/10/2026: componentes do CT-e, registro das cobranças e colunas da tabela "cobra o maior".
-- Rodar no SQL Editor de CADA projeto (gfcuiaba e gfcampogrande). Pode rodar mais de uma vez.

-- 1) Componentes do CT-e (frete peso, frete valor, GRIS, pedágio, TAS, adicional…), lidos do XML/PDF na importação
alter table public.frete_ctes add column if not exists componentes jsonb;

-- 2) Tabela "cobra o maior" (mínimo / % NF / R$ por kg) e adicional % sobre o frete (ex.: Carvalima)
alter table public.frete_tabelas add column if not exists calculo text not null default 'soma';
alter table public.frete_tabelas add column if not exists adicional_pct numeric(6,3);

-- 3) Cobranças enviadas às transportadoras: enviada -> respondida -> creditada (ou recusada)
create table if not exists public.frete_cobrancas (
  id               uuid primary key default gen_random_uuid(),
  filial           text not null,
  transportadora   text not null,
  periodo          text,
  ctes             text[],
  valor            numeric(14,2),             -- valor cobrado (desconto pedido)
  canal            text,                      -- whatsapp | email
  origem           text,                      -- relatório | auditoria
  status           text not null default 'Enviada' check (status in ('Enviada','Respondida','Creditada','Recusada')),
  valor_creditado  numeric(14,2),
  observacoes      text,
  criado_por       text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists frete_cobrancas_filial on public.frete_cobrancas (filial);
alter table public.frete_cobrancas enable row level security;
drop policy if exists frete_cobrancas_select on public.frete_cobrancas;
drop policy if exists frete_cobrancas_write on public.frete_cobrancas;
create policy frete_cobrancas_select on public.frete_cobrancas for select to authenticated using (true);
create policy frete_cobrancas_write on public.frete_cobrancas for all to authenticated
  using (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'))
  with check (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'frete_cobrancas') then
    alter publication supabase_realtime add table public.frete_cobrancas;
  end if;
end $$;

-- 4) Versão do banco (a página avisa quando falta rodar)
insert into public.frete_config (filial, versao_banco) values ('CBA', '20261030'), ('CGR', '20261030')
on conflict (filial) do update set versao_banco = excluded.versao_banco, atualizado_em = now();
notify pgrst, 'reload schema';

select 'ok' as atualizado, (select count(*) from public.frete_cobrancas) as cobrancas;
