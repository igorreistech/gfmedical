-- Atualização do sistema de compras (2026-10-18) — rodar uma vez em CADA projeto (Campo Grande e Cuiabá).
-- Pode rodar de novo sem problema: nada é apagado ou duplicado.

-- 1) Grupo/linha do produto (Coronária, Periférica, Vascular)
alter table public.compras_estoque    add column if not exists grupo text;
alter table public.compras_consumo    add column if not exists grupo text;
alter table public.compras_pendente   add column if not exists grupo text;
alter table public.compras_consignado add column if not exists grupo text;

-- 2) Cadastro de fornecedores
create table if not exists public.compras_fornecedores (
  id uuid primary key default gen_random_uuid(), filial text not null, nome text not null,
  contato text, email text, telefone text, prazo_dias integer, seguranca_dias integer, cobertura_dias integer,
  ciclo_dias integer, pedido_minimo numeric(14,2), frete text, linhas text, modelo text, obs text,
  ativo boolean not null default true, atualizado_em timestamptz not null default now());
create unique index if not exists compras_fornecedores_nome on public.compras_fornecedores (filial, nome);

-- 3) Modelos de pedido do fornecedor (planilhas guardadas no banco)
create table if not exists public.compras_modelos (
  id uuid primary key default gen_random_uuid(), filial text not null, nome text not null,
  b64 text not null, atualizado_em timestamptz not null default now());
create unique index if not exists compras_modelos_nome on public.compras_modelos (filial, nome);

-- 4) Estoque da outra filial (sugerir transferência em vez de compra)
create table if not exists public.compras_estoque_outra (
  id uuid primary key default gen_random_uuid(), filial text not null, origem text, codigo text not null, descricao text,
  estoque_disp numeric(14,4), ultimo_preco numeric(14,4), importado_em timestamptz not null default now());
create index if not exists compras_estoque_outra_filial on public.compras_estoque_outra (filial);

-- 5) Consumo de anos anteriores (sazonalidade)
create table if not exists public.compras_consumo_hist (
  id uuid primary key default gen_random_uuid(), filial text not null, codigo text not null, descricao text,
  meses jsonb not null default '[]', total numeric(14,4), media numeric(14,4), ano integer not null,
  importado_em timestamptz not null default now());
create index if not exists compras_consumo_hist_filial on public.compras_consumo_hist (filial, ano);

-- Permissões das tabelas novas (todos leem; usuário "visualizacao" não grava)
do $$ declare t text; begin
  foreach t in array array['compras_fornecedores', 'compras_modelos', 'compras_estoque_outra', 'compras_consumo_hist'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = ''visualizacao'')) with check (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = ''visualizacao''))', t || '_write', t);
  end loop; end $$;

-- 6) Fluxo do pedido (enviado, recebimentos com NF, previsão de entrega)
alter table public.compras_pedidos
  add column if not exists enviado_em timestamptz,
  add column if not exists enviado_por text,
  add column if not exists recebimentos jsonb not null default '[]',
  add column if not exists previsao_entrega date;

-- 7) Configurações: orçamento, múltiplo por produto, fabricante corrigido, prazo real, sazonalidade
alter table public.compras_config add column if not exists orcamento_mensal numeric(14,2);
alter table public.compras_config add column if not exists multiplos jsonb;
alter table public.compras_config add column if not exists fab_produto jsonb;
alter table public.compras_config add column if not exists prazo_real boolean;
alter table public.compras_config add column if not exists sazonal boolean;

-- 8) Período dos relatórios importados (aviso de relatório repetido)
alter table public.compras_importacoes add column if not exists periodo text;

notify pgrst, 'reload schema';

-- 22/10/2026: estoque mínimo para itens de giro baixo (manter N unidades de quem vendeu nos últimos M meses)
alter table public.compras_config add column if not exists estoque_min_un integer;
alter table public.compras_config add column if not exists estoque_min_meses integer;
notify pgrst, 'reload schema';
