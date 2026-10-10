-- Controle de Fretes: remetente e previsão de entrega do CT-e.
-- Rodar no SQL Editor de CADA projeto Supabase de filial (Cuiabá e Campo Grande),
-- depois de 20261010_controle_fretes.sql.

alter table public.frete_ctes
  add column if not exists remetente        text,
  add column if not exists previsao_entrega date;

-- Atualiza o cache de schema do PostgREST para a API enxergar as colunas já.
notify pgrst, 'reload schema';
