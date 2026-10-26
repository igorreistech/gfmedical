-- Monitor Cirúrgico — 26/10/2026: volumes que saem para a cirurgia (várias caixas e bags, com os itens de cada uma).
-- Rodar no SQL Editor de CADA projeto (gfcuiaba e gfcampogrande). Pode rodar mais de uma vez.
create table if not exists public.volumes_cirurgia (
  id             uuid primary key default gen_random_uuid(),
  filial         text,
  proc_id        text not null,
  nf             text,
  ordem          int  not null default 1,
  tipo           text not null default 'Caixa' check (tipo in ('Caixa','Bag')),
  identificacao  text,
  itens          jsonb not null default '[]'::jsonb,   -- [{cod, nome, lote, qtd}]
  montado_por    text,
  montado_em     timestamptz not null default now()
);
create index if not exists volumes_cirurgia_proc on public.volumes_cirurgia (proc_id);
alter table public.volumes_cirurgia enable row level security;
drop policy if exists volumes_cirurgia_select on public.volumes_cirurgia;
drop policy if exists volumes_cirurgia_write on public.volumes_cirurgia;
create policy volumes_cirurgia_select on public.volumes_cirurgia for select to authenticated using (true);
create policy volumes_cirurgia_write on public.volumes_cirurgia for all to authenticated using (true) with check (true);
notify pgrst, 'reload schema';



-- Remessas sem cirurgia (consignação, comodato…): os volumes delas ficam em volumes_cirurgia com proc_id = 'rem:<id>'
create table if not exists public.remessas_volumes (
  id            uuid primary key default gen_random_uuid(),
  filial        text,
  tipo          text not null default 'Remessa em consignação',
  nf            text,
  nf_data       date,
  cliente       text,
  cidade        text,
  data_envio    date,
  status        text not null default 'No cliente' check (status in ('No cliente','Retornou parcial','Retornou','Cancelada')),
  data_retorno  date,
  obs           text,
  criado_por    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists remessas_volumes_envio on public.remessas_volumes (data_envio desc);
alter table public.remessas_volumes enable row level security;
drop policy if exists remessas_volumes_select on public.remessas_volumes;
drop policy if exists remessas_volumes_write on public.remessas_volumes;
create policy remessas_volumes_select on public.remessas_volumes for select to authenticated using (true);
create policy remessas_volumes_write on public.remessas_volumes for all to authenticated using (true) with check (true);
notify pgrst, 'reload schema';

select 'ok' as remessas, (select count(*) from public.remessas_volumes) as remessas_lancadas;
