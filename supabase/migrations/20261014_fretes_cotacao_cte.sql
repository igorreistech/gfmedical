-- Controle de Fretes: cotação ↔ CT-e e valor da mercadoria na cotação.
-- Rodar no SQL Editor de CADA projeto Supabase de filial (Cuiabá e Campo Grande).

alter table public.frete_cotacoes
  add column if not exists valor_mercadoria numeric(14,2),  -- base do % frete ÷ mercadoria
  add column if not exists calculo_id       uuid,           -- cálculo da calculadora que gerou a cotação
  add column if not exists numero_cte       text;           -- CT-e que efetivou a cotação

alter table public.frete_ctes
  add column if not exists numero_cotacao   text;           -- cotação conferida na importação

notify pgrst, 'reload schema';
