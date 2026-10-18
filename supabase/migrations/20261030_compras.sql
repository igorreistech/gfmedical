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

-- Prazo de entrega por fabricante (Parâmetros da filial): {"JOTEC BRASIL": 30, ...}; vazio = usa o prazo geral
alter table public.compras_config add column if not exists prazos_fabricante jsonb not null default '{}';
notify pgrst, 'reload schema';

-- Base do consumo da programação: 'ano' (média do C1060) | '3m' (últimos 3 meses) | 'maior' (o maior dos dois)
alter table public.compras_config add column if not exists base_consumo text;

-- Pedidos de compra: gerados na programação, um por fabricante; o aprovador (admin) aprova.
-- Aguardando/aprovado e não recebido contam como "em pedido" (estoque a caminho) na programação.
create table if not exists public.compras_pedidos (
  id            uuid primary key default gen_random_uuid(),
  numero        bigint generated always as identity,
  filial        text not null,
  fabricante    text,
  status        text not null default 'aguardando',   -- aguardando | aprovado | recebido | cancelado
  itens         jsonb not null default '[]',           -- [{codigo, descricao, unidade, sugerido, qtd, caixa, preco, disp, consumo}]
  valor         numeric(14,2),
  obs           text,
  criado_por    text,
  criado_em     timestamptz not null default now(),
  aprovado_por  text,
  aprovado_em   timestamptz,
  recebido_em   timestamptz,
  cancelado_em  timestamptz
);
create index if not exists compras_pedidos_filial on public.compras_pedidos (filial);
alter table public.compras_pedidos enable row level security;
drop policy if exists compras_pedidos_select on public.compras_pedidos;
drop policy if exists compras_pedidos_write on public.compras_pedidos;
create policy compras_pedidos_select on public.compras_pedidos for select to authenticated using (true);
create policy compras_pedidos_write on public.compras_pedidos for all to authenticated
  using (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'))
  with check (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'));
notify pgrst, 'reload schema';

-- Reserva de estoque de segurança para cliente (C904 - Pedidos com saldo pendente analítico, filtrado pelo cliente)
create table if not exists public.compras_reserva (
  id            uuid primary key default gen_random_uuid(),
  filial        text not null,
  cliente       text,                          -- ex.: PEDIDO RESERVADO DO HOSPITAL UNIMED
  pedido        text,
  data_emissao  date,
  data_entrega  date,
  codigo        text,                          -- código alternativo (o mesmo do S013/C1060)
  produto       text,
  saldo         numeric(14,4),                 -- saldo a faturar = estoque que precisa ficar reservado
  valor_unit    numeric(14,2),
  valor_total   numeric(14,2),
  importado_em  timestamptz not null default now()
);
create index if not exists compras_reserva_filial on public.compras_reserva (filial);
alter table public.compras_reserva enable row level security;
drop policy if exists compras_reserva_select on public.compras_reserva;
drop policy if exists compras_reserva_write on public.compras_reserva;
create policy compras_reserva_select on public.compras_reserva for select to authenticated using (true);
create policy compras_reserva_write on public.compras_reserva for all to authenticated
  using (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'))
  with check (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'));
notify pgrst, 'reload schema';

-- Consumo mensal de UM cliente (C1060 filtrado pelo cliente) para a análise da reserva (C904); não mexe no consumo geral
create table if not exists public.compras_consumo_cliente (
  id               uuid primary key default gen_random_uuid(),
  filial           text not null,
  cliente          text,                       -- cliente do C1060 (ex.: HOSPITAL UNIMED CAMPO GRANDE MS)
  reserva_cliente  text,                       -- cliente da reserva no C904 (ex.: PEDIDO RESERVADO DO HOSPITAL UNIMED)
  codigo           text not null,
  descricao        text,
  meses            jsonb not null default '[]',
  total            numeric(14,4),
  media            numeric(14,4),
  ano              integer,
  importado_em     timestamptz not null default now()
);
create index if not exists compras_consumo_cliente_filial on public.compras_consumo_cliente (filial);
alter table public.compras_consumo_cliente enable row level security;
drop policy if exists compras_consumo_cliente_select on public.compras_consumo_cliente;
drop policy if exists compras_consumo_cliente_write on public.compras_consumo_cliente;
create policy compras_consumo_cliente_select on public.compras_consumo_cliente for select to authenticated using (true);
create policy compras_consumo_cliente_write on public.compras_consumo_cliente for all to authenticated
  using (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'))
  with check (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'));

-- Quantos dias de consumo do cliente a reserva deve cobrir
alter table public.compras_config add column if not exists reserva_dias integer;
notify pgrst, 'reload schema';

-- Grupo/linha do produto (Coronária, Periférica, Vascular…) quando o PDF vem filtrado por "Grupo:" no Callisto
alter table public.compras_estoque    add column if not exists grupo text;
alter table public.compras_consumo    add column if not exists grupo text;
alter table public.compras_pendente   add column if not exists grupo text;
alter table public.compras_consignado add column if not exists grupo text;
notify pgrst, 'reload schema';

-- Sistema profissional: cadastro de fornecedores, fluxo do pedido (enviado/recebimentos), orçamento, múltiplo por produto e período dos relatórios
create table if not exists public.compras_fornecedores (
  id              uuid primary key default gen_random_uuid(),
  filial          text not null,
  nome            text not null,
  contato         text,
  email           text,
  telefone        text,
  prazo_dias      integer,
  seguranca_dias  integer,
  cobertura_dias  integer,
  ciclo_dias      integer,
  pedido_minimo   numeric(14,2),
  frete           text,
  linhas          text,
  modelo          text,
  obs             text,
  ativo           boolean not null default true,
  atualizado_em   timestamptz not null default now()
);
create unique index if not exists compras_fornecedores_nome on public.compras_fornecedores (filial, nome);
alter table public.compras_fornecedores enable row level security;
drop policy if exists compras_fornecedores_select on public.compras_fornecedores;
drop policy if exists compras_fornecedores_write on public.compras_fornecedores;
create policy compras_fornecedores_select on public.compras_fornecedores for select to authenticated using (true);
create policy compras_fornecedores_write on public.compras_fornecedores for all to authenticated
  using (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'))
  with check (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'));
alter table public.compras_pedidos
  add column if not exists enviado_em timestamptz,
  add column if not exists enviado_por text,
  add column if not exists recebimentos jsonb not null default '[]',
  add column if not exists previsao_entrega date;
alter table public.compras_config add column if not exists orcamento_mensal numeric(14,2);
alter table public.compras_config add column if not exists multiplos jsonb;
alter table public.compras_importacoes add column if not exists periodo text;
notify pgrst, 'reload schema';

-- Fabricante corrigido à mão por produto (ficha do produto na programação)
alter table public.compras_config add column if not exists fab_produto jsonb;
notify pgrst, 'reload schema';

-- Modelos de pedido do fornecedor (planilhas .xlsx em base64), valem para qualquer computador/endereço da filial
create table if not exists public.compras_modelos (
  id             uuid primary key default gen_random_uuid(),
  filial         text not null,
  nome           text not null,
  b64            text not null,
  atualizado_em  timestamptz not null default now()
);
create unique index if not exists compras_modelos_nome on public.compras_modelos (filial, nome);
alter table public.compras_modelos enable row level security;
drop policy if exists compras_modelos_select on public.compras_modelos;
drop policy if exists compras_modelos_write on public.compras_modelos;
create policy compras_modelos_select on public.compras_modelos for select to authenticated using (true);
create policy compras_modelos_write on public.compras_modelos for all to authenticated
  using (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'))
  with check (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'));
notify pgrst, 'reload schema';
