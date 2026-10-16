-- Programação de Compras (compras.html): estoque próprio (S013), consignado (C457), consumo mensal (C1060),
-- pendente de faturamento (C723), parâmetros da filial e registro das importações.
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
alter table public.compras_estoque add column if not exists fabricante text;   -- vem do S013 filtrado por fabricante (ex.: JOTEC BRASIL)

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

create table if not exists public.compras_pendente (
  id            uuid primary key default gen_random_uuid(),
  filial        text not null,
  pedido        text,
  nf            text,
  convenio      text,
  medico        text,
  data_cirurgia date,                          -- o pendente conta no consumo do mês da cirurgia
  cliente       text,
  paciente      text,
  codigo        text,
  codigo_alt    text,                          -- código alternativo (o mesmo do S013/C1060)
  produto       text,
  quantidade    numeric(14,4),
  valor_unit    numeric(14,2),
  valor_total   numeric(14,2),
  fabricante    text,                          -- quando o C723 vem filtrado por fabricante
  importado_em  timestamptz not null default now()
);
create index if not exists compras_pendente_filial on public.compras_pendente (filial);

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
  foreach t in array array['compras_estoque','compras_consignado','compras_importacoes','compras_consumo','compras_config','compras_pendente'] loop
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

-- Fabricante também no consumo (C1060) e no consignado (C457) quando o relatório vem filtrado por fabricante/fornecedor:
-- a programação parte do consumo (venda) e precisa saber o fabricante mesmo dos itens zerados (fora do S013).
alter table public.compras_consumo    add column if not exists fabricante text;
alter table public.compras_consignado add column if not exists fabricante text;
notify pgrst, 'reload schema';
