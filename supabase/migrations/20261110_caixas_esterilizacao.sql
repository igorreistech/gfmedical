-- nova situação: caixa de instrumental enviada para esterilização (na tela: "Em esterilização")
alter table public.caixas_bags drop constraint if exists caixas_bags_status_check;
alter table public.caixas_bags add constraint caixas_bags_status_check check (status in ('Disponível', 'Fora', 'Pendente', 'Consignado', 'Em limpeza', 'Esterilização', 'Manutenção', 'Baixada'));
notify pgrst, 'reload schema';
