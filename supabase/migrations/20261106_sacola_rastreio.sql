-- Monitor Cirúrgico — 26/10/2026: sacolas cadastradas (SC-001…) com o mesmo rastreio de saída/retorno das caixas e bags.
-- Rodar no SQL Editor de CADA projeto (Campo Grande e Cuiabá). Pode rodar mais de uma vez.
alter table public.caixas_bags drop constraint if exists caixas_bags_tipo_check;
alter table public.caixas_bags add constraint caixas_bags_tipo_check check (tipo in ('Caixa', 'Bag', 'Sacola'));
notify pgrst, 'reload schema';
select 'ok' as sacola_rastreio;
