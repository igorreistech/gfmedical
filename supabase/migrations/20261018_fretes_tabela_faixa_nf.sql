-- Controle de Fretes: faixa por valor da NF e base do frete mínimo na tabela combinada.
-- Rodar no SQL Editor de CADA projeto Supabase de filial (Cuiabá e Campo Grande).
alter table public.frete_tabelas
  add column if not exists nf_ate      numeric(14,2),
  add column if not exists minimo_base text not null default 'total';  -- 'total' | 'peso'
notify pgrst, 'reload schema';
