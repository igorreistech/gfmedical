-- ════════════════════════════════════════════════════════════════════════
-- Controle de Fretes — TODAS as migrações juntas (20261010 a 20261018).
-- Pode rodar inteiro, quantas vezes quiser, no SQL Editor de CADA projeto
-- (Cuiabá e Campo Grande): nada que já existe é apagado ou sobrescrito.
-- ════════════════════════════════════════════════════════════════════════


-- ───────────── 20261010_controle_fretes.sql ─────────────
-- Controle de Cotação e Frete (fretes.html)
-- Equivalente web da planilha "Controle_Cotacao_Frete_v2": abas
-- Transportadoras, Cotações e CT-e/NF-e. Comparativo e Dashboard são
-- calculados no navegador a partir dessas três tabelas.
--
-- Rodar uma vez no SQL Editor do Supabase (projeto cyztucqhfotqhauavepu).

-- ───────────────────────── Tabelas ─────────────────────────

create table if not exists public.frete_transportadoras (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  cnpj         text,
  contato      text,
  telefone     text,
  email        text,
  modal        text,            -- 'Rodoviário' | 'Aéreo'
  avaliacao    smallint check (avaliacao between 1 and 5),
  observacoes  text,
  filial       text not null default 'CBA',
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.frete_cotacoes (
  id              uuid primary key default gen_random_uuid(),
  numero          text,
  data_cotacao    date,
  validade        date,
  origem          text,
  destino         text,
  uf_origem       text,
  uf_destino      text,
  transportadora  text,
  contato         text,
  telefone        text,
  peso_kg         numeric(12,3),
  volume_m3       numeric(12,3),
  tipo_carga      text,
  prazo_dias      integer,
  valor_frete     numeric(12,2),
  ad_valorem      numeric(12,2),
  status          text not null default 'Aguardando'
                  check (status in ('Aprovado','Reprovado','Em análise','Aguardando')),
  observacoes     text,
  filial          text not null default 'CBA',
  criado_por      text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.frete_ctes (
  id              uuid primary key default gen_random_uuid(),
  numero_cte      text not null,
  data_emissao    date,
  numero_nfe      text,
  serie_nf        text,
  origem          text,
  destino         text,
  valor_frete     numeric(12,2),
  valor_nfe       numeric(14,2),
  transportadora  text,
  prazo_dias      integer,
  status_entrega  text not null default 'Pendente'
                  check (status_entrega in ('Entregue','Em trânsito','Pendente','Atrasado')),
  data_entrega    date,
  tipo_saida      text,            -- COMPRA, VENDA, TRANSFERENCIA, CONSIGNADO, REPARO E CONCERTO…
  observacoes     text,
  filial          text not null default 'CBA',
  criado_por      text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- Evita duplicar o mesmo CT-e ao reimportar a planilha.
create unique index if not exists frete_ctes_numero_filial_uk
  on public.frete_ctes (filial, numero_cte);
create unique index if not exists frete_transportadoras_nome_filial_uk
  on public.frete_transportadoras (filial, upper(nome));

-- ───────────────────────── RLS ─────────────────────────
-- Mesmo modelo das outras tabelas: qualquer usuário logado lê; papel
-- "visualizacao" (tabela usuarios) não escreve.

alter table public.frete_transportadoras enable row level security;
alter table public.frete_cotacoes        enable row level security;
alter table public.frete_ctes            enable row level security;

do $$
declare t text;
begin
  foreach t in array array['frete_transportadoras','frete_cotacoes','frete_ctes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = ''visualizacao''))
         with check (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = ''visualizacao''))',
      t || '_write', t);
  end loop;
end $$;

-- ───────────────────────── Realtime ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array['frete_transportadoras','frete_cotacoes','frete_ctes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ───────────── 20261011_fretes_remetente_previsao.sql ─────────────
-- Controle de Fretes: remetente e previsão de entrega do CT-e.
-- Rodar no SQL Editor de CADA projeto Supabase de filial (Cuiabá e Campo Grande),
-- depois de 20261010_controle_fretes.sql.

alter table public.frete_ctes
  add column if not exists remetente        text,
  add column if not exists previsao_entrega date;

-- Atualiza o cache de schema do PostgREST para a API enxergar as colunas já.
notify pgrst, 'reload schema';

-- ───────────── 20261012_fretes_transportadoras_ctes.sql ─────────────
-- Controle de Fretes: transportadoras lidas dos PDFs de CT-e (10/10/2026).
-- Rodar no SQL Editor de CADA projeto Supabase de filial (Cuiabá e Campo Grande).
-- Grava para as duas filiais (CBA e CGR) — a página só mostra as da filial
-- dela, então rodar o mesmo arquivo nos dois projetos é seguro.
-- Já cadastradas (ex.: vindas da planilha) só recebem CNPJ/contato/modal que
-- estiverem vazios; nada que você já preencheu é sobrescrito.

with dados(nome, cnpj, telefone, email, modal, observacoes) as (values
  ('ANDORINHA',            '46.435.293/0002-11', '(67) 4009-5352', 'cobranca@andorinhaexpress.com.br',              'Rodoviário', 'ANDORINHA TRANSPORTADORA LTDA'),
  ('AZUL EXPRESS',         '09.296.295/0010-50', null,             null,                                            'Aéreo',      'AZUL LINHAS AEREAS BRASILEIRAS SA'),
  ('BRINGER',              '94.001.641/0005-38', '(11) 5033-2400', null,                                            'Rodoviário', 'BRINGER DO BRASIL AGENCIAMENTO DE CARGAS NACIONAIS E INTERNACIONAIS'),
  ('CARVALIMA',            '33.070.814/0009-09', '(67) 3316-3900', 'expedicao7.cgr@carvalima.com.br',               'Rodoviário', 'CARVALIMA TRANSPORTES LTDA'),
  ('EUCATUR',              '76.080.738/0010-69', '(45) 3902-1205', 'ronaldoadm12@gmail.com',                        'Rodoviário', 'EUCATUR - EMP UNIAO CASCAVEL DE TRANSPORTES'),
  ('GOLLOG',               '07.575.651/0058-94', null,             null,                                            'Aéreo',      'GOL LINHAS AEREAS S/A'),
  ('LOGMED',               '09.303.268/0002-58', null,             null,                                            'Rodoviário', 'LOGMED ARMAZENAGEM E LOGISTICA LTDA'),
  ('PANTANAL TRANSPORTES', '46.970.030/0002-02', '(11) 2081-2836', 'pantanaltransp@gmail.com',                      'Rodoviário', 'PANTANAL OPERADOR DE TRANSPORTE MULTIMODAL'),
  ('TRANSET / 7 EXPRESS',  '05.464.895/0005-62', '(65) 3634-3099', 'express.financeiro@transetetransportes.com.br', 'Rodoviário', 'TRANSETE TRANSPORTES SEGURO LTDA'),
  ('VIATUR',               '03.409.286/0001-51', '(67) 3363-1200', 'cargas@viaturms.com.br',                        'Rodoviário', 'VIATUR TRANSPORTES E TURISMO LTDA')
), filiais(filial) as (values ('CBA'), ('CGR'))
insert into public.frete_transportadoras (nome, cnpj, telefone, email, modal, observacoes, filial)
select d.nome, d.cnpj, d.telefone, d.email, d.modal, d.observacoes, f.filial
from dados d cross join filiais f
on conflict (filial, (upper(nome))) do update set
  cnpj          = coalesce(frete_transportadoras.cnpj, excluded.cnpj),
  telefone      = coalesce(frete_transportadoras.telefone, excluded.telefone),
  email         = coalesce(frete_transportadoras.email, excluded.email),
  modal         = coalesce(frete_transportadoras.modal, excluded.modal),
  observacoes   = coalesce(frete_transportadoras.observacoes, excluded.observacoes),
  atualizado_em = now();

-- ───────────── 20261013_fretes_calculos.sql ─────────────
-- Controle de Fretes: histórico da calculadora de frete.
-- Rodar no SQL Editor de CADA projeto Supabase de filial (Cuiabá e Campo Grande).

create table if not exists public.frete_calculos (
  id                uuid primary key default gen_random_uuid(),
  valor_mercadoria  numeric(14,2) not null,
  opcoes            jsonb not null default '[]',  -- [{transportadora, frete, prazo, pct}]
  melhor_transportadora text,
  melhor_frete      numeric(12,2),
  melhor_pct        numeric(8,6),
  observacao        text,
  filial            text not null,
  criado_por        text,
  criado_em         timestamptz not null default now()
);
create index if not exists frete_calculos_filial_data on public.frete_calculos (filial, criado_em desc);

-- Mesmo modelo das outras tabelas: logado lê; papel "visualizacao" não escreve.
alter table public.frete_calculos enable row level security;
drop policy if exists frete_calculos_select on public.frete_calculos;
drop policy if exists frete_calculos_write on public.frete_calculos;
create policy frete_calculos_select on public.frete_calculos for select to authenticated using (true);
create policy frete_calculos_write on public.frete_calculos for all to authenticated
  using (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'))
  with check (not exists (select 1 from public.usuarios u where u.id::text = auth.uid()::text and u.role = 'visualizacao'));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'frete_calculos') then
    alter publication supabase_realtime add table public.frete_calculos;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ───────────── 20261014_fretes_cotacao_cte.sql ─────────────
-- Controle de Fretes: cotação ↔ CT-e e valor da mercadoria na cotação.
-- Rodar no SQL Editor de CADA projeto Supabase de filial (Cuiabá e Campo Grande).

alter table public.frete_cotacoes
  add column if not exists valor_mercadoria numeric(14,2),  -- base do % frete ÷ mercadoria
  add column if not exists calculo_id       uuid,           -- cálculo da calculadora que gerou a cotação
  add column if not exists numero_cte       text;           -- CT-e que efetivou a cotação

alter table public.frete_ctes
  add column if not exists numero_cotacao   text;           -- cotação conferida na importação

notify pgrst, 'reload schema';

-- ───────────── 20261015_fretes_cnpj_partes.sql ─────────────
-- Controle de Fretes: CNPJ/CPF do remetente e do destinatário do CT-e.
-- Rodar no SQL Editor de CADA projeto Supabase de filial (Cuiabá e Campo Grande).

alter table public.frete_ctes
  add column if not exists remetente_cnpj text,
  add column if not exists destino_cnpj   text;

notify pgrst, 'reload schema';

-- ───────────── 20261016_fretes_completo.sql ─────────────
-- Controle de Fretes: peso, ocorrências, chave da NF, tabela de frete negociada,
-- faturas das transportadoras, registro de alterações e meta compartilhada.
-- Rodar no SQL Editor de CADA projeto Supabase de filial (Cuiabá e Campo Grande).

-- ── CT-es: peso (R$/kg), ocorrência e chave da NF-e (rastreio)
alter table public.frete_ctes
  add column if not exists peso_kg          numeric(12,3),
  add column if not exists ocorrencia       text,          -- Avaria, Extravio, Reentrega, Devolução, Atraso grave, Outro
  add column if not exists ocorrencia_custo numeric(12,2),
  add column if not exists ocorrencia_obs   text,
  add column if not exists chave_nfe        text;

-- ── Tabela de frete combinada com cada transportadora
create table if not exists public.frete_tabelas (
  id              uuid primary key default gen_random_uuid(),
  transportadora  text not null,
  rota            text,                 -- em branco = vale para todas as rotas
  peso_ate        numeric(12,3),        -- faixa de peso (kg); em branco = sem limite
  valor_fixo      numeric(12,2),        -- taxa fixa por CT-e (despacho, emissão…)
  valor_kg        numeric(12,4),        -- R$ por kg
  pct_nf          numeric(8,4),         -- ad valorem / GRIS: % do valor da NF
  frete_minimo    numeric(12,2),
  vigencia_inicio date,
  observacoes     text,
  filial          text not null,
  criado_por      text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- ── Faturas (cobranças) das transportadoras
create table if not exists public.frete_faturas (
  id              uuid primary key default gen_random_uuid(),
  transportadora  text not null,
  numero          text,
  emissao         date,
  vencimento      date,
  valor           numeric(14,2),
  ctes            text[] not null default '{}',   -- Nº dos CT-es cobrados
  status          text not null default 'Aberta' check (status in ('Aberta','Paga','Contestada')),
  observacoes     text,
  filial          text not null,
  criado_por      text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- ── Registro de alterações (só inclusão; ninguém altera nem apaga)
create table if not exists public.frete_log (
  id        uuid primary key default gen_random_uuid(),
  tabela    text,
  registro  text,
  acao      text,
  detalhes  jsonb,
  usuario   text,
  filial    text,
  em        timestamptz not null default now()
);
create index if not exists frete_log_filial_em on public.frete_log (filial, em desc);

-- ── Configurações por filial (meta de % de frete compartilhada)
create table if not exists public.frete_config (
  filial         text primary key,
  meta_pct       numeric(8,6),
  atualizado_em  timestamptz not null default now()
);

-- ── RLS: logado lê; "visualizacao" não escreve; log é só inclusão
alter table public.frete_tabelas enable row level security;
alter table public.frete_faturas enable row level security;
alter table public.frete_config  enable row level security;
alter table public.frete_log     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['frete_tabelas','frete_faturas','frete_config'] loop
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

drop policy if exists frete_log_select on public.frete_log;
drop policy if exists frete_log_insert on public.frete_log;
create policy frete_log_select on public.frete_log for select to authenticated using (true);
create policy frete_log_insert on public.frete_log for insert to authenticated with check (true);

do $$
declare t text;
begin
  foreach t in array array['frete_tabelas','frete_faturas'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ───────────── 20261017_fretes_tabela_anexo.sql ─────────────
-- Controle de Fretes: arquivo da tabela enviada pela transportadora (anexo).
-- Rodar no SQL Editor de CADA projeto Supabase de filial (Cuiabá e Campo Grande).

alter table public.frete_tabelas
  add column if not exists anexo_url  text,
  add column if not exists anexo_nome text;

notify pgrst, 'reload schema';

-- ───────────── 20261018_fretes_tabela_faixa_nf.sql ─────────────
-- Controle de Fretes: faixa por valor da NF e base do frete mínimo na tabela combinada.
-- Rodar no SQL Editor de CADA projeto Supabase de filial (Cuiabá e Campo Grande).
alter table public.frete_tabelas
  add column if not exists nf_ate      numeric(14,2),
  add column if not exists minimo_base text not null default 'total';  -- 'total' | 'peso'
notify pgrst, 'reload schema';
