-- Monitor Cirúrgico — 26/10/2026: o QR da etiqueta da CAIXA abre etiqueta.html com a cirurgia atual e os itens.
-- Rodar no SQL Editor de CADA projeto (Campo Grande e Cuiabá). Pode rodar mais de uma vez.
-- Precisa antes: 20261102_caixas_bags.sql e 20261103_etiqueta_publica.sql.
alter table public.caixas_bags add column if not exists token uuid not null default gen_random_uuid();

-- leitura pública de UMA caixa pelo código + código secreto (que só existe no QR impresso)
create or replace function public.caixa_publica(p_codigo text, p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'caixa', jsonb_build_object('codigo', c.codigo, 'tipo', c.tipo, 'descricao', c.descricao, 'status', c.status, 'local_atual', c.local_atual, 'saida_em', c.saida_em, 'nf', c.nf_atual, 'filial', c.filial),
    'etiqueta', (select to_jsonb(e) - 'impresso_por' - 'proc_id' from public.etiquetas_qr e
                 where c.status = 'Fora' and c.proc_id_atual is not null and e.proc_id = c.proc_id_atual
                 order by e.impresso_em desc limit 1))
  from public.caixas_bags c where upper(c.codigo) = upper(p_codigo) and c.token = p_token limit 1
$$;
revoke all on function public.caixa_publica(text, uuid) from public;
grant execute on function public.caixa_publica(text, uuid) to anon, authenticated;
notify pgrst, 'reload schema';
select 'ok' as caixa_publica;
