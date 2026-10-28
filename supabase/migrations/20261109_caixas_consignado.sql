-- Caixas/bags/sacolas: nova situação "Consignado" (ficou no cliente; sem alerta de atraso nem cobrança de devolução)
alter table public.caixas_bags drop constraint if exists caixas_bags_status_check;
alter table public.caixas_bags add constraint caixas_bags_status_check check (status in ('Disponível', 'Fora', 'Pendente', 'Consignado', 'Em limpeza', 'Manutenção', 'Baixada'));
notify pgrst, 'reload schema';
