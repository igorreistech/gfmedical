-- Monitor Cirúrgico — 26/10/2026: caixa/bag/sacola "Pendente" (o material voltou, a embalagem não) para a cobrança.
-- Rodar no SQL Editor de CADA projeto (Campo Grande e Cuiabá). Pode rodar mais de uma vez.
alter table public.caixas_bags drop constraint if exists caixas_bags_status_check;
alter table public.caixas_bags add constraint caixas_bags_status_check check (status in ('Disponível', 'Fora', 'Pendente', 'Manutenção', 'Baixada'));
notify pgrst, 'reload schema';
select 'ok' as caixas_pendente;
