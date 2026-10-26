-- Monitor Cirúrgico — caixas e bags cadastradas (código + QR) e rastreio de saída/retorno.
-- Rodar no SQL Editor de CADA projeto (Campo Grande e Cuiabá). Pode rodar mais de uma vez.
create table if not exists public.caixas_bags (
  id             uuid primary key default gen_random_uuid(),
  filial         text,
  codigo         text not null,                 -- CX-001, BG-001…
  tipo           text not null default 'Caixa' check (tipo in ('Caixa','Bag')),
  descricao      text,
  status         text not null default 'Disponível' check (status in ('Disponível','Fora','Manutenção','Baixada')),
  local_atual    text,
  saida_em       timestamptz,
  retorno_em     timestamptz,
  proc_id_atual  text,
  nf_atual       text,
  criado_por     text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create unique index if not exists caixas_bags_codigo on public.caixas_bags (filial, codigo);

create table if not exists public.caixas_bags_mov (
  id           uuid primary key default gen_random_uuid(),
  filial       text,
  caixa_id     uuid references public.caixas_bags(id) on delete cascade,
  codigo       text,
  tipo_mov     text not null,                   -- Cadastro, Saída, Retorno, Manutenção, Baixa
  data         timestamptz not null default now(),
  destino      text,
  cidade       text,
  proc_id      text,
  nf           text,
  paciente     text,
  obs          text,
  responsavel  text,
  criado_em    timestamptz not null default now()
);
create index if not exists caixas_bags_mov_caixa on public.caixas_bags_mov (caixa_id, data desc);

do $$ declare t text; begin
  foreach t in array array['caixas_bags', 'caixas_bags_mov'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t || '_write', t);
  end loop; end $$;
notify pgrst, 'reload schema';
select 'ok' as caixas_bags;
