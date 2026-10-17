-- Transferências entre filiais (transferencias.html): NF de transferência para cirurgia × devolução.
-- Rodar uma vez no SQL Editor de CADA projeto (Campo Grande e Cuiabá). Pode rodar mais de uma vez.

create table if not exists public.transf_nf (
  id             uuid primary key default gen_random_uuid(),
  filial         text not null,                 -- CGR | CBA (banco/site onde foi importada)
  tipo           text not null,                 -- envio (saída desta filial) | retorno (entrada vinda da outra filial)
  chave          text not null,                 -- chave de acesso da NF-e (44 dígitos)
  numero         bigint,
  serie          integer,
  data_emissao   date,
  emitente_cnpj  text,
  emitente_nome  text,
  dest_cnpj      text,
  dest_nome      text,
  natureza       text,
  valor_total    numeric(14,2),
  info           text,
  arquivo        text,
  usuario        text,
  importado_em   timestamptz not null default now()
);
create unique index if not exists transf_nf_chave on public.transf_nf (filial, chave);

create table if not exists public.transf_itens (
  id             uuid primary key default gen_random_uuid(),
  filial         text not null,
  chave          text not null,                 -- NF de origem
  tipo           text not null,
  numero         bigint,
  data_emissao   date,
  codigo         text,                          -- código do produto na NF
  codigo_alt     text,                          -- "Cód.Alt." (o mesmo do Callisto/S013)
  descricao      text,
  quantidade     numeric(14,4),
  valor_unit     numeric(14,2),
  valor_total    numeric(14,2),
  lotes          jsonb not null default '[]',   -- [{lote, qtd, validade}]
  validade       date,
  importado_em   timestamptz not null default now()
);
create index if not exists transf_itens_filial on public.transf_itens (filial);

create table if not exists public.transf_baixas (
  id             uuid primary key default gen_random_uuid(),
  filial         text not null,
  item_id        uuid not null,                 -- transf_itens.id
  quantidade     numeric(14,4) not null,
  motivo         text,                          -- usado (cirurgia na outra filial) | devolvido (sem NF importada) | outro
  obs            text,
  usuario        text,
  criado_em      timestamptz not null default now()
);
create index if not exists transf_baixas_filial on public.transf_baixas (filial);

do $$
declare t text;
begin
  foreach t in array array['transf_nf','transf_itens','transf_baixas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = ''visualizacao''))
         with check (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = ''visualizacao''))',
      t || '_write', t);
  end loop;
end $$;
notify pgrst, 'reload schema';
