-- Monitor Cirúrgico — 26/10/2026: volume do tipo "Sacola" (sacola plástica branca) além de Caixa e Bag.
-- Rodar no SQL Editor de CADA projeto (Campo Grande e Cuiabá). Pode rodar mais de uma vez.
alter table public.volumes_cirurgia drop constraint if exists volumes_cirurgia_tipo_check;
alter table public.volumes_cirurgia add constraint volumes_cirurgia_tipo_check check (tipo in ('Caixa', 'Bag', 'Sacola'));
notify pgrst, 'reload schema';
select 'ok' as volumes_sacola;
