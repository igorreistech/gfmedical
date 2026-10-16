-- Programação de Compras (compras.html): estoque próprio (S013), consignado (C457), consumo mensal (C1060),
-- parâmetros da filial e registro das importações.
-- Rodar uma vez no SQL Editor de CADA projeto (Cuiabá e Campo Grande). Pode rodar mais de uma vez.

create table if not exists public.compras_estoque (
  id            uuid primary key default gen_random_uuid(),
  filial        text not null,                 -- CBA | CGR
  codigo        text not null,                 -- Cód. Alt do S013
  descricao     text,
  estoque       numeric(14,4),                 -- estoque físico
  estoque_disp  numeric(14,4),                 -- Estoque Disp. (o que vale para compra)
  unidade       text,
  localizacao   text,
  est_minimo    numeric(14,4),
  qt_reposicao  numeric(14,4),
  ultimo_preco  numeric(14,2),
  importado_em  timestamptz not null default now()
);
create index if not exists compras_estoque_filial on public.compras_estoque (filial);

create table if not exists public.compras_consignado (
  id            uuid primary key default gen_random_uuid(),
  filial        text not null,
  data_emissao  date,
  documento     text,
  pedido        text,
  cliente       text,
  codigo        text,                          -- código interno do Callisto
  codigo_alt    text,                          -- código alternativo (o mesmo do S013)
  produto       text,
  quantidade    numeric(14,4),                 -- quantidade enviada na remessa
  saldo         numeric(14,4),                 -- Saldo = saldo atual no cliente
  valor         numeric(14,2),                 -- valor da remessa
  importado_em  timestamptz not null default now()
);
create index if not exists compras_consignado_filial on public.compras_consignado (filial);

create table if not exists public.compras_consumo (
  id            uuid primary key default gen_random_uuid(),
  filial        text not null,
  codigo        text not null,                 -- código alternativo (C1060)
  descricao     text,
  meses         jsonb not null default '[]',   -- consumo de JAN a DEZ
  total         numeric(14,4),
  media         numeric(14,4),                 -- MÉDIA do C1060 = consumo médio mensal
  ano           integer,
  importado_em  timestamptz not null default now()
);
create index if not exists compras_consumo_filial on public.compras_consumo (filial);

create table if not exists public.compras_config (
  filial          text primary key,
  prazo_dias      integer,                     -- prazo de entrega do fornecedor
  seguranca_dias  integer,                     -- estoque de segurança
  cobertura_dias  integer,                     -- comprar para cobrir N dias
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.compras_importacoes (
  id            uuid primary key default gen_random_uuid(),
  filial        text not null,
  tipo          text not null,                 -- S013 | C457
  arquivo       text,
  linhas        integer,
  usuario       text,
  importado_em  timestamptz not null default now()
);

-- Mesmo modelo do Controle de Fretes: logado lê; papel "visualizacao" não escreve.
do $$
declare t text;
begin
  foreach t in array array['compras_estoque','compras_consignado','compras_importacoes','compras_consumo','compras_config'] loop
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
