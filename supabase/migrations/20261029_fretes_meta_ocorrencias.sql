-- Controle de Fretes: meta de gasto mensal por transportadora e acompanhamento das ocorrências.
-- Rodar no SQL Editor de CADA projeto (Cuiabá e Campo Grande). Pode rodar mais de uma vez.
alter table public.frete_transportadoras
  add column if not exists meta_mensal numeric(14,2);            -- meta de gasto no mês (R$)
alter table public.frete_ctes
  add column if not exists ocorrencia_status text,               -- Aberta | Em negociação | Resolvida | Indenizada
  add column if not exists ocorrencia_prazo  date;               -- prazo de resposta da transportadora
notify pgrst, 'reload schema';
