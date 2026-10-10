-- Controle de Cotação e Frete (fretes.html)
-- Equivalente web da planilha "Controle_Cotacao_Frete_v2": abas
-- Transportadoras, Cotações e CT-e/NF-e. Comparativo e Dashboard são
-- calculados no navegador a partir dessas três tabelas.
--
-- Rodar uma vez no SQL Editor de CADA projeto Supabase de filial:
--   Cuiabá       → cyztucqhfotqhauavepu  (coluna filial = 'CBA')
--   Campo Grande → rqzqetfoxiutabsooqqn  (coluna filial = 'CGR')

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
  filial       text not null,
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
  filial          text not null,
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
  filial          text not null,
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
