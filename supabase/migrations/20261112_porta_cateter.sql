-- Monitor Cirúrgico — 29/10/2026: novo tipo "Porta cateter" (PC-001…) com o mesmo controle de saída/retorno das caixas, bags e sacolas.
-- Rodar no SQL Editor de CADA projeto (Campo Grande e Cuiabá). Pode rodar mais de uma vez.
alter table public.caixas_bags drop constraint if exists caixas_bags_tipo_check;
alter table public.caixas_bags add constraint caixas_bags_tipo_check check (tipo in ('Caixa', 'Bag', 'Sacola', 'Porta cateter'));
alter table public.volumes_cirurgia drop constraint if exists volumes_cirurgia_tipo_check;
alter table public.volumes_cirurgia add constraint volumes_cirurgia_tipo_check check (tipo in ('Caixa', 'Bag', 'Sacola', 'Porta cateter'));
notify pgrst, 'reload schema';
select 'ok' as porta_cateter;
