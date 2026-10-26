-- Monitor Cirúrgico — 26/10/2026: o QR da etiqueta abre etiqueta.html com a etiqueta completa (todos os itens).
-- Rodar no SQL Editor de CADA projeto (Campo Grande e Cuiabá). Pode rodar mais de uma vez.
alter table public.etiquetas_qr add column if not exists itens jsonb;
alter table public.etiquetas_qr add column if not exists vendedor text;
alter table public.etiquetas_qr add column if not exists tipo text;
alter table public.etiquetas_qr add column if not exists emp jsonb;

-- leitura pública de UMA etiqueta pelo id (o id é aleatório e só existe no QR impresso)
create or replace function public.etiqueta_publica(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(e) - 'impresso_por' - 'proc_id' from public.etiquetas_qr e where e.id = p_id
$$;
revoke all on function public.etiqueta_publica(uuid) from public;
grant execute on function public.etiqueta_publica(uuid) to anon, authenticated;
notify pgrst, 'reload schema';
select 'ok' as etiqueta_publica;
