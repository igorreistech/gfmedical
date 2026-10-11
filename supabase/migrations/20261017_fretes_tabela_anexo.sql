-- Controle de Fretes: arquivo da tabela enviada pela transportadora (anexo).
-- Rodar no SQL Editor de CADA projeto Supabase de filial (Cuiabá e Campo Grande).

alter table public.frete_tabelas
  add column if not exists anexo_url  text,
  add column if not exists anexo_nome text;

notify pgrst, 'reload schema';
