-- Tabela VIATUR refeita pela proposta de 14/11/2025 e conferida com 18 CT-es reais (Campo Grande -> Dourados, set/2026): todos batem.
-- Como a Viatur cobra (componentes do CT-e):
--   frete peso = R$/kg x peso (cubagem 300 kg/m3) - sem minimo
--   frete valor = % da NF (1,1% nas Tabelas 01/02; 1,2% na 03) com MINIMO de 26,50 / 36,20 / 42,50
--   GRIS 0,4% da NF; despacho 3,00; TAS 3,00; entrega (ou coleta) 8,00 quando houver; pedagio 5,00 a cada 100 kg nas cidades sublinhadas
--   ICMS 17%: vem destacado, mas JA DENTRO do total (o total e a soma dos componentes) -> icms_modo incluso
-- O frete valor com minimo vai na coluna "% com minimo" (gris_pct/gris_min); o GRIS 0,4% no % da NF; a entrega (8,00) na coluna de coleta
-- (a conferencia do CT-e reconhece sozinha quando ela foi cobrada; no Calculo de frete, marque "com coleta").
-- Rota MS - MS saindo de Campo Grande, uma linha por cidade de destino. Grava para as duas filiais; pode rodar mais de uma vez.
delete from public.frete_tabelas where transportadora = 'VIATUR';
insert into public.frete_tabelas (transportadora, rota, origens, destinos, peso_ate, nf_ate, valor_fixo, valor_kg, pct_nf, frete_minimo, minimo_base, cubagem_kg_m3,
  pedagio_valor, pedagio_fracao_kg, gris_pct, gris_min, coleta_valor, icms_modo, icms_pct, vigencia_inicio, vigencia_fim, observacoes, filial)
select 'VIATUR', 'MS - MS', 'CAMPO GRANDE', v.cidade, null, null, 6.00, v.kg::numeric, 0.4, null, 'total', 300,
       v.ped::numeric, case when v.ped is null then null else 100 end, v.fv::numeric, v.minimo::numeric, 8.00, 'incluso', null, '2025-11-14'::date, '2026-11-14'::date, v.obs, f.filial
from (values
  ('AGUA CLARA', 0.41, 1.1, 26.50, null, 'Proposta Viatur 14/11/2025 (Tabela 01): Campo Grande -> AGUA CLARA. Frete peso 0.41/kg; frete valor 1.1% da NF com minimo 26.50; GRIS 0,4%; despacho 3,00 + TAS 3,00; entrega/coleta 8,00 quando houver. ICMS 17% ja dentro do total (como nos CT-es).'),
  ('DOURADOS', 0.41, 1.1, 26.50, 5.00, 'Proposta Viatur 14/11/2025 (Tabela 01): Campo Grande -> DOURADOS. Frete peso 0.41/kg; frete valor 1.1% da NF com minimo 26.50; GRIS 0,4%; despacho 3,00 + TAS 3,00; entrega/coleta 8,00 quando houver; pedagio 5,00 a cada 100 kg. ICMS 17% ja dentro do total (como nos CT-es).'),
  ('NOVA ALVORADA DO SUL', 0.41, 1.1, 26.50, 5.00, 'Proposta Viatur 14/11/2025 (Tabela 01): Campo Grande -> NOVA ALVORADA DO SUL. Frete peso 0.41/kg; frete valor 1.1% da NF com minimo 26.50; GRIS 0,4%; despacho 3,00 + TAS 3,00; entrega/coleta 8,00 quando houver; pedagio 5,00 a cada 100 kg. ICMS 17% ja dentro do total (como nos CT-es).'),
  ('RIO BRILHANTE', 0.41, 1.1, 26.50, 5.00, 'Proposta Viatur 14/11/2025 (Tabela 01): Campo Grande -> RIO BRILHANTE. Frete peso 0.41/kg; frete valor 1.1% da NF com minimo 26.50; GRIS 0,4%; despacho 3,00 + TAS 3,00; entrega/coleta 8,00 quando houver; pedagio 5,00 a cada 100 kg. ICMS 17% ja dentro do total (como nos CT-es).'),
  ('RIBAS DO RIO PARDO', 0.41, 1.1, 26.50, null, 'Proposta Viatur 14/11/2025 (Tabela 01): Campo Grande -> RIBAS DO RIO PARDO. Frete peso 0.41/kg; frete valor 1.1% da NF com minimo 26.50; GRIS 0,4%; despacho 3,00 + TAS 3,00; entrega/coleta 8,00 quando houver. ICMS 17% ja dentro do total (como nos CT-es).'),
  ('DEODAPOLIS', 0.52, 1.1, 36.20, 5.00, 'Proposta Viatur 14/11/2025 (Tabela 02): Campo Grande -> DEODAPOLIS. Frete peso 0.52/kg; frete valor 1.1% da NF com minimo 36.20; GRIS 0,4%; despacho 3,00 + TAS 3,00; entrega/coleta 8,00 quando houver; pedagio 5,00 a cada 100 kg. ICMS 17% ja dentro do total (como nos CT-es).'),
  ('GLORIA DE DOURADOS', 0.52, 1.1, 36.20, 5.00, 'Proposta Viatur 14/11/2025 (Tabela 02): Campo Grande -> GLORIA DE DOURADOS. Frete peso 0.52/kg; frete valor 1.1% da NF com minimo 36.20; GRIS 0,4%; despacho 3,00 + TAS 3,00; entrega/coleta 8,00 quando houver; pedagio 5,00 a cada 100 kg. ICMS 17% ja dentro do total (como nos CT-es).'),
  ('IVINHEMA', 0.52, 1.1, 36.20, 5.00, 'Proposta Viatur 14/11/2025 (Tabela 02): Campo Grande -> IVINHEMA. Frete peso 0.52/kg; frete valor 1.1% da NF com minimo 36.20; GRIS 0,4%; despacho 3,00 + TAS 3,00; entrega/coleta 8,00 quando houver; pedagio 5,00 a cada 100 kg. ICMS 17% ja dentro do total (como nos CT-es).'),
  ('PONTA PORA', 0.52, 1.1, 36.20, 5.00, 'Proposta Viatur 14/11/2025 (Tabela 02): Campo Grande -> PONTA PORA. Frete peso 0.52/kg; frete valor 1.1% da NF com minimo 36.20; GRIS 0,4%; despacho 3,00 + TAS 3,00; entrega/coleta 8,00 quando houver; pedagio 5,00 a cada 100 kg. ICMS 17% ja dentro do total (como nos CT-es).'),
  ('TRES LAGOAS', 0.52, 1.1, 36.20, null, 'Proposta Viatur 14/11/2025 (Tabela 02): Campo Grande -> TRES LAGOAS. Frete peso 0.52/kg; frete valor 1.1% da NF com minimo 36.20; GRIS 0,4%; despacho 3,00 + TAS 3,00; entrega/coleta 8,00 quando houver. ICMS 17% ja dentro do total (como nos CT-es).'),
  ('BATAGUASSU', 0.68, 1.2, 42.50, 5.00, 'Proposta Viatur 14/11/2025 (Tabela 03): Campo Grande -> BATAGUASSU. Frete peso 0.68/kg; frete valor 1.2% da NF com minimo 42.50; GRIS 0,4%; despacho 3,00 + TAS 3,00; entrega/coleta 8,00 quando houver; pedagio 5,00 a cada 100 kg. ICMS 17% ja dentro do total (como nos CT-es).'),
  ('BRASILANDIA', 0.68, 1.2, 42.50, 5.00, 'Proposta Viatur 14/11/2025 (Tabela 03): Campo Grande -> BRASILANDIA. Frete peso 0.68/kg; frete valor 1.2% da NF com minimo 42.50; GRIS 0,4%; despacho 3,00 + TAS 3,00; entrega/coleta 8,00 quando houver; pedagio 5,00 a cada 100 kg. ICMS 17% ja dentro do total (como nos CT-es).'),
  ('NOVA ANDRADINA', 0.68, 1.2, 42.50, 5.00, 'Proposta Viatur 14/11/2025 (Tabela 03): Campo Grande -> NOVA ANDRADINA. Frete peso 0.68/kg; frete valor 1.2% da NF com minimo 42.50; GRIS 0,4%; despacho 3,00 + TAS 3,00; entrega/coleta 8,00 quando houver; pedagio 5,00 a cada 100 kg. ICMS 17% ja dentro do total (como nos CT-es).')
) v(cidade, kg, fv, minimo, ped, obs)
cross join (values ('CBA'), ('CGR')) f(filial);
notify pgrst, 'reload schema';

select filial, count(*) as cidades, max(icms_modo) as icms from public.frete_tabelas where transportadora = 'VIATUR' group by 1 order by 1;
