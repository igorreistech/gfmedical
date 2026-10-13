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

-- ───────────── 20261020 (coluna de cubagem) ─────────────
alter table public.frete_tabelas
  add column if not exists cubagem_kg_m3 numeric(8,2);  -- peso cubado = m³ × este fator (ex.: 300 kg/m³)
notify pgrst, 'reload schema';

-- ───────────── 20261022_fretes_tabela_andorinha_proposta.sql ─────────────
-- Tabela da ANDORINHA: Proposta Comercial de Frete (tabela combinada) de 13/10/2026, vigência até 28/07/2027.
-- Origem Campo Grande/MS (praça polo CGEP), IDA/VOLTA, todas as mercadorias:
--   MS-MT  Cuiabá polo e região ............ despacho 49,03 · frete valor 0,4% · 840,66/ton
--   MS-PR  Maringá polo e região ........... despacho 61,30 · frete valor 0,5% · 928,23/ton
--   MS-SP  São Paulo e Pres. Prudente ...... despacho 61,30 · frete valor 0,5% · 928,23/ton (+ coleta mín. 33,29 em SP capital)
--   MS-RJ  Rio de Janeiro polo e região .... despacho 191,53 · frete valor 0,5% · 1.596,09/ton (+ coleta mín. 33,29)
--   Todas: pedágio 10,51 por fração de 100 kg · GRIS 0,3% (mín. 8,77) · POS 0,1% · TAS 17,50 · cubagem 300 kg/m³.
-- O ICMS é somado ao frete (como sai no total do CT-e), então os valores abaixo JÁ ESTÃO COM ICMS "por dentro":
--   12% em MS-MT (as duas mãos); 7% em PR/SP/RJ → MS (fornecedores mandando para Campo Grande).
--   Para envio MS → PR/SP/RJ o ICMS é 12%: o frete real fica ~5,7% acima do calculado.
-- Faixas: até 100 kg (pedágio 10,51 fixo) e acima (pedágio aprox. 0,105/kg); NF até 2.923,33 (GRIS no mínimo) e acima.
-- Coleta (R$ 33,29) não incluída, igual à tabela deduzida. Reentrega 50% e devolução 100% do frete.
-- Vale a partir de 13/10/2026; CT-es anteriores continuam conferidos pela tabela deduzida (20261021).
-- Grava para as duas filiais (CBA e CGR): pode rodar nos dois projetos e quantas vezes quiser.
delete from public.frete_tabelas where transportadora = 'ANDORINHA' and observacoes like 'Proposta 13/10/26%';
insert into public.frete_tabelas (transportadora, rota, peso_ate, nf_ate, valor_fixo, valor_kg, pct_nf, frete_minimo, minimo_base, cubagem_kg_m3, vigencia_inicio, observacoes, filial)
select v.transportadora, v.rota, v.peso_ate::numeric, v.nf_ate::numeric, v.valor_fixo::numeric, v.valor_kg::numeric, v.pct_nf::numeric, null::numeric,
       'total', 300, '2026-10-13'::date, v.observacoes, f.filial
from (values
  -- MS ↔ MT (ICMS 12%)
  ('ANDORINHA', 'MS - MT', 100,  2923.33, 97.51, 0.9553, 0.5682, 'Proposta 13/10/26 (ate 28/07/27): MS-MT ate 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77). Peso 840,66/ton, valor 0,4%, GRIS 0,3% min 8,77, POS 0,1%, despacho 49,03, TAS 17,50, pedagio 10,51/100kg, ICMS 12% por dentro.'),
  ('ANDORINHA', 'MS - MT', 100,  null,    87.55, 0.9553, 0.9091, 'Proposta 13/10/26 (ate 28/07/27): MS-MT ate 100 kg. Peso 840,66/ton, valor 0,4%, GRIS 0,3%, POS 0,1%, despacho 49,03, TAS 17,50, pedagio 10,51/100kg, ICMS 12% por dentro.'),
  ('ANDORINHA', 'MS - MT', null, 2923.33, 85.57, 1.0747, 0.5682, 'Proposta 13/10/26 (ate 28/07/27): MS-MT acima de 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77; pedagio aprox. 0,105/kg). ICMS 12% por dentro.'),
  ('ANDORINHA', 'MS - MT', null, null,    75.60, 1.0747, 0.9091, 'Proposta 13/10/26 (ate 28/07/27): MS-MT acima de 100 kg (pedagio aprox. 0,105/kg). ICMS 12% por dentro.'),
  -- MS ↔ PR (ICMS 7%, PR → MS)
  ('ANDORINHA', 'MS - PR', 100,  2923.33, 105.46, 0.9981, 0.6452, 'Proposta 13/10/26 (ate 28/07/27): MS-PR (Maringa) ate 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77). Peso 928,23/ton, valor 0,5%, GRIS 0,3% min 8,77, POS 0,1%, despacho 61,30, TAS 17,50, pedagio 10,51/100kg, ICMS 7% por dentro.'),
  ('ANDORINHA', 'MS - PR', 100,  null,    96.03,  0.9981, 0.9677, 'Proposta 13/10/26 (ate 28/07/27): MS-PR (Maringa) ate 100 kg. Peso 928,23/ton, valor 0,5%, GRIS 0,3%, POS 0,1%, despacho 61,30, TAS 17,50, pedagio 10,51/100kg, ICMS 7% por dentro.'),
  ('ANDORINHA', 'MS - PR', null, 2923.33, 94.16,  1.1111, 0.6452, 'Proposta 13/10/26 (ate 28/07/27): MS-PR (Maringa) acima de 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77; pedagio aprox. 0,105/kg). ICMS 7% por dentro.'),
  ('ANDORINHA', 'MS - PR', null, null,    84.73,  1.1111, 0.9677, 'Proposta 13/10/26 (ate 28/07/27): MS-PR (Maringa) acima de 100 kg (pedagio aprox. 0,105/kg). ICMS 7% por dentro.'),
  -- MS ↔ SP (ICMS 7%, SP → MS) — São Paulo e Presidente Prudente têm o mesmo preço
  ('ANDORINHA', 'MS - SP', 100,  2923.33, 105.46, 0.9981, 0.6452, 'Proposta 13/10/26 (ate 28/07/27): MS-SP (Sao Paulo / Pres. Prudente) ate 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77). Peso 928,23/ton, valor 0,5%, GRIS 0,3% min 8,77, POS 0,1%, despacho 61,30, TAS 17,50, pedagio 10,51/100kg, ICMS 7% por dentro. Coleta 33,29 a parte.'),
  ('ANDORINHA', 'MS - SP', 100,  null,    96.03,  0.9981, 0.9677, 'Proposta 13/10/26 (ate 28/07/27): MS-SP (Sao Paulo / Pres. Prudente) ate 100 kg. Peso 928,23/ton, valor 0,5%, GRIS 0,3%, POS 0,1%, despacho 61,30, TAS 17,50, pedagio 10,51/100kg, ICMS 7% por dentro. Coleta 33,29 a parte.'),
  ('ANDORINHA', 'MS - SP', null, 2923.33, 94.16,  1.1111, 0.6452, 'Proposta 13/10/26 (ate 28/07/27): MS-SP (Sao Paulo / Pres. Prudente) acima de 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77; pedagio aprox. 0,105/kg). ICMS 7% por dentro. Coleta 33,29 a parte.'),
  ('ANDORINHA', 'MS - SP', null, null,    84.73,  1.1111, 0.9677, 'Proposta 13/10/26 (ate 28/07/27): MS-SP (Sao Paulo / Pres. Prudente) acima de 100 kg (pedagio aprox. 0,105/kg). ICMS 7% por dentro. Coleta 33,29 a parte.'),
  -- MS ↔ RJ (ICMS 7%, RJ → MS)
  ('ANDORINHA', 'MS - RJ', 100,  2923.33, 245.49, 1.7162, 0.6452, 'Proposta 13/10/26 (ate 28/07/27): MS-RJ ate 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77). Peso 1.596,09/ton, valor 0,5%, GRIS 0,3% min 8,77, POS 0,1%, despacho 191,53, TAS 17,50, pedagio 10,51/100kg, ICMS 7% por dentro. Coleta 33,29 a parte.'),
  ('ANDORINHA', 'MS - RJ', 100,  null,    236.06, 1.7162, 0.9677, 'Proposta 13/10/26 (ate 28/07/27): MS-RJ ate 100 kg. Peso 1.596,09/ton, valor 0,5%, GRIS 0,3%, POS 0,1%, despacho 191,53, TAS 17,50, pedagio 10,51/100kg, ICMS 7% por dentro. Coleta 33,29 a parte.'),
  ('ANDORINHA', 'MS - RJ', null, 2923.33, 234.19, 1.8292, 0.6452, 'Proposta 13/10/26 (ate 28/07/27): MS-RJ acima de 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77; pedagio aprox. 0,105/kg). ICMS 7% por dentro. Coleta 33,29 a parte.'),
  ('ANDORINHA', 'MS - RJ', null, null,    224.76, 1.8292, 0.9677, 'Proposta 13/10/26 (ate 28/07/27): MS-RJ acima de 100 kg (pedagio aprox. 0,105/kg). ICMS 7% por dentro. Coleta 33,29 a parte.')
) v(transportadora, rota, peso_ate, nf_ate, valor_fixo, valor_kg, pct_nf, observacoes)
cross join (values ('CBA'), ('CGR')) f(filial);
notify pgrst, 'reload schema';

-- ───────────── 20261021_fretes_tabela_andorinha.sql ─────────────
-- Tabela da ANDORINHA deduzida dos CT-es (XML) de 30/09 a 09/10/2026 — os componentes do frete
-- de cada CT-e (frete peso, frete valor, GRIS, POS, despacho, TAS, pedágio, ICMS) batem com estes valores.
-- Valores JÁ COM O ICMS "por dentro" (12% MS→MT, 7% SP→MS), como sai no total do CT-e.
-- Pedágio: R$ 10,51 a cada 100 kg (acima de 100 kg vira aprox. R$ 0,105/kg). Cubagem: 300 kg/m³.
-- Grava para as duas filiais (CBA e CGR): pode rodar nos dois projetos e quantas vezes quiser.
delete from public.frete_tabelas where transportadora = 'ANDORINHA' and observacoes like 'Deduzida dos CT-es%';
insert into public.frete_tabelas (transportadora, rota, peso_ate, nf_ate, valor_fixo, valor_kg, pct_nf, frete_minimo, minimo_base, cubagem_kg_m3, vigencia_inicio, observacoes, filial)
select v.transportadora, v.rota, v.peso_ate::numeric, v.nf_ate::numeric, v.valor_fixo::numeric, v.valor_kg::numeric, v.pct_nf::numeric, v.frete_minimo::numeric,
       'total', 300, '2026-09-30'::date, v.observacoes, f.filial
from (values
  -- MS → MT (Campo Grande → Cuiabá): frete peso 0,84/kg · frete valor 0,4% · GRIS 0,3% (mín. 8,77) · POS 0,1% · despacho 49,03 · TAS 17,50 · pedágio 10,51 · ICMS 12%
  ('ANDORINHA', 'MS - MT', 100, 2923.33, 97.51, 0.9545, 0.5682, null, 'Deduzida dos CT-es: MS-MT ate 100 kg, NF ate 2.923 (GRIS no minimo 8,77). Componentes: peso 0,84/kg, valor 0,4%, GRIS 0,3% min 8,77, POS 0,1%, despacho 49,03, TAS 17,50, pedagio 10,51/100kg, ICMS 12% por dentro.'),
  ('ANDORINHA', 'MS - MT', 100, null,    87.55, 0.9545, 0.9091, null, 'Deduzida dos CT-es: MS-MT ate 100 kg. Componentes: peso 0,84/kg, valor 0,4%, GRIS 0,3%, POS 0,1%, despacho 49,03, TAS 17,50, pedagio 10,51/100kg, ICMS 12% por dentro.'),
  ('ANDORINHA', 'MS - MT', null, 2923.33, 85.57, 1.0740, 0.5682, null, 'Deduzida dos CT-es: MS-MT acima de 100 kg, NF ate 2.923 (pedagio aprox. 0,105/kg). ICMS 12% por dentro.'),
  ('ANDORINHA', 'MS - MT', null, null,    75.60, 1.0740, 0.9091, null, 'Deduzida dos CT-es: MS-MT acima de 100 kg (pedagio aprox. 0,105/kg). ICMS 12% por dentro.'),
  -- SP → MS (fornecedores de SP → Campo Grande): frete peso 0,928/kg · frete valor 0,5% · GRIS 0,3% · POS 0,1% · despacho 61,30 · TAS 17,50 · pedágio 10,51 · ICMS 7%
  -- (+ COLETA R$ 33,29 quando há coleta no fornecedor — não incluída)
  ('ANDORINHA', 'SP - MS', 100, null,    96.03, 0.9978, 0.9677, null, 'Deduzida dos CT-es: SP-MS ate 100 kg. Componentes: peso 0,928/kg, valor 0,5%, GRIS 0,3%, POS 0,1%, despacho 61,30, TAS 17,50, pedagio 10,51/100kg, ICMS 7% por dentro. Coleta 33,29 a parte.'),
  ('ANDORINHA', 'SP - MS', null, null,   84.73, 1.1109, 0.9677, null, 'Deduzida dos CT-es: SP-MS acima de 100 kg (pedagio aprox. 0,105/kg). ICMS 7% por dentro. Coleta 33,29 a parte.')
) v(transportadora, rota, peso_ate, nf_ate, valor_fixo, valor_kg, pct_nf, frete_minimo, observacoes)
cross join (values ('CBA'), ('CGR')) f(filial);
notify pgrst, 'reload schema';

-- ───────────── 20261023_fretes_tabela_componentes.sql ─────────────
-- Controle de Fretes: tabela combinada por componentes (como vêm na proposta), ICMS pelo sentido da
-- viagem, validade da tabela e versão do banco. Rodar no SQL Editor de CADA projeto (Cuiabá e Campo Grande);
-- pode rodar mais de uma vez.

-- 1) Colunas novas da tabela de frete
alter table public.frete_tabelas
  add column if not exists pedagio_valor     numeric(12,2),             -- R$ por fração de peso
  add column if not exists pedagio_fracao_kg numeric(10,2),             -- tamanho da fração (padrão 100 kg)
  add column if not exists gris_pct          numeric(8,4),              -- % da NF
  add column if not exists gris_min          numeric(12,2),             -- GRIS mínimo (R$)
  add column if not exists coleta_valor      numeric(12,2),             -- coleta no remetente (R$), quando há
  add column if not exists icms_modo         text not null default 'incluso',  -- 'incluso' | 'somar' (por dentro, pela rota)
  add column if not exists icms_pct          numeric(5,2),              -- alíquota fixa (em branco = 7%/12% pela rota)
  add column if not exists vigencia_fim      date;                      -- válida até

-- 2) Versão do banco (a página avisa quando o banco está mais velho que ela)
alter table public.frete_config add column if not exists versao_banco text;

-- 3) Andorinha: proposta de 13/10/26 por componentes — troca as 16 linhas "Proposta 13/10/26" por 4
--    (uma por rota). Valores SEM ICMS, como na proposta; o sistema soma 7% ou 12% pelo sentido.
delete from public.frete_tabelas where transportadora = 'ANDORINHA' and observacoes like 'Proposta 13/10/26%';
insert into public.frete_tabelas (transportadora, rota, peso_ate, nf_ate, valor_fixo, valor_kg, pct_nf, frete_minimo, minimo_base, cubagem_kg_m3,
  pedagio_valor, pedagio_fracao_kg, gris_pct, gris_min, coleta_valor, icms_modo, vigencia_inicio, vigencia_fim, observacoes, filial)
select 'ANDORINHA', v.rota, null, null, v.fixo::numeric, v.kg::numeric, v.pct::numeric, null, 'total', 300,
       10.51, 100, 0.3, 8.77, v.coleta::numeric, 'somar', '2026-10-13'::date, '2027-07-28'::date, v.obs, f.filial
from (values
  ('MS - MT', 66.53, 0.84066, 0.5, null,  'Proposta 13/10/26 (ate 28/07/27): MS-MT (Cuiaba e regiao). Despacho 49,03 + TAS 17,50; 840,66/ton; frete valor 0,4% + POS 0,1%; GRIS 0,3% min 8,77; pedagio 10,51/100kg; ICMS somado pela rota.'),
  ('MS - PR', 78.80, 0.92823, 0.6, null,  'Proposta 13/10/26 (ate 28/07/27): MS-PR (Maringa e regiao). Despacho 61,30 + TAS 17,50; 928,23/ton; frete valor 0,5% + POS 0,1%; GRIS 0,3% min 8,77; pedagio 10,51/100kg; ICMS somado pela rota.'),
  ('MS - SP', 78.80, 0.92823, 0.6, 33.29, 'Proposta 13/10/26 (ate 28/07/27): MS-SP (Sao Paulo e Pres. Prudente). Despacho 61,30 + TAS 17,50; 928,23/ton; frete valor 0,5% + POS 0,1%; GRIS 0,3% min 8,77; pedagio 10,51/100kg; coleta 33,29 (Sao Paulo); ICMS somado pela rota.'),
  ('MS - RJ', 209.03, 1.59609, 0.6, 33.29, 'Proposta 13/10/26 (ate 28/07/27): MS-RJ (Rio de Janeiro e regiao). Despacho 191,53 + TAS 17,50; 1.596,09/ton; frete valor 0,5% + POS 0,1%; GRIS 0,3% min 8,77; pedagio 10,51/100kg; coleta 33,29; ICMS somado pela rota.')
) v(rota, fixo, kg, pct, coleta, obs)
cross join (values ('CBA'), ('CGR')) f(filial);

-- 4) Marca a versão do banco nas duas filiais (por último: só fica marcada se tudo acima rodou)
insert into public.frete_config (filial, versao_banco) values ('CBA', '20261023'), ('CGR', '20261023')
on conflict (filial) do update set versao_banco = excluded.versao_banco, atualizado_em = now();

notify pgrst, 'reload schema';
