-- Controle de Fretes: CNPJ/CPF do remetente e do destinatário do CT-e.
-- Rodar no SQL Editor de CADA projeto Supabase de filial (Cuiabá e Campo Grande).

alter table public.frete_ctes
  add column if not exists remetente_cnpj text,
  add column if not exists destino_cnpj   text;

notify pgrst, 'reload schema';
