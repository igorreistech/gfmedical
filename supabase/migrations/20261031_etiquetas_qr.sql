-- Monitor Cirúrgico — 26/10/2026: registro de cada etiqueta QR impressa (relatório "🏷 Etiquetas QR").
-- Rodar no SQL Editor de CADA projeto (gfcuiaba e gfcampogrande). Pode rodar mais de uma vez.
create table if not exists public.etiquetas_qr (
  id            uuid primary key default gen_random_uuid(),
  filial        text,
  proc_id       text,
  nf            text,
  nf_data       text,
  caixa         text,
  paciente      text,
  medico        text,
  hospital      text,
  cidade        text,
  convenio      text,
  cirurgia      text,
  procedimento  text,
  impresso_por  text,
  impresso_em   timestamptz not null default now()
);
create index if not exists etiquetas_qr_impresso_em on public.etiquetas_qr (impresso_em desc);
create index if not exists etiquetas_qr_proc on public.etiquetas_qr (proc_id);
alter table public.etiquetas_qr enable row level security;
drop policy if exists etiquetas_qr_select on public.etiquetas_qr;
drop policy if exists etiquetas_qr_insert on public.etiquetas_qr;
create policy etiquetas_qr_select on public.etiquetas_qr for select to authenticated using (true);
create policy etiquetas_qr_insert on public.etiquetas_qr for insert to authenticated with check (true);
notify pgrst, 'reload schema';

select 'ok' as atualizado, (select count(*) from public.etiquetas_qr) as etiquetas;
