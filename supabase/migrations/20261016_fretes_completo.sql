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
