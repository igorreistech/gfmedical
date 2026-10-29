-- Monitor Cirúrgico — 28/10/2026: situação "Caixa não localizada" para as caixas/bags/sacolas.
-- Rodar no SQL Editor de CADA projeto (Campo Grande e Cuiabá). Pode rodar mais de uma vez.
alter table public.caixas_bags drop constraint if exists caixas_bags_status_check;
alter table public.caixas_bags add constraint caixas_bags_status_check check (status in ('Disponível', 'Fora', 'Pendente', 'Consignado', 'Não localizada', 'Em limpeza', 'Esterilização', 'Manutenção', 'Baixada'));
notify pgrst, 'reload schema';
select 'ok' as caixas_nao_localizada;
