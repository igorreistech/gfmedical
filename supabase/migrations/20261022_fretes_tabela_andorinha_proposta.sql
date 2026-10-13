-- Tabela da ANDORINHA: Proposta Comercial de Frete (tabela combinada) de 13/10/2026, vigência até 28/07/2027.
-- Origem Campo Grande/MS (praça polo CGEP), IDA/VOLTA, todas as mercadorias:
--   MS-MT  Cuiabá polo e região ............ despacho 49,03 · frete valor 0,4% · 840,66/ton
--   MS-PR  Maringá polo e região ........... despacho 61,30 · frete valor 0,5% · 928,23/ton
--   MS-SP  São Paulo e Pres. Prudente ...... despacho 61,30 · frete valor 0,5% · 928,23/ton (+ coleta mín. 33,29 em SP capital)
--   MS-RJ  Rio de Janeiro polo e região .... despacho 191,53 · frete valor 0,5% · 1.596,09/ton (+ coleta mín. 33,29)
--   Todas: pedágio 10,51 por fração de 100 kg · GRIS 0,3% (mín. 8,77) · POS 0,1% · TAS 17,50 · cubagem 300 kg/m³.
-- O ICMS é somado ao frete (como sai no total do CT-e), então os valores abaixo JÁ ESTÃO COM ICMS "por dentro":
--   12% em MS-MT (as duas mãos); 7% em PR/SP/RJ → MS (fornecedores mandando para Campo Grande).
--   Para envio MS → PR/SP/RJ o ICMS é 12%: o frete real fica ~5,7% acima do calculado.
-- Faixas: até 100 kg (pedágio 10,51 fixo) e acima (pedágio aprox. 0,105/kg); NF até 2.923,33 (GRIS no mínimo) e acima.
-- Coleta (R$ 33,29) não incluída, igual à tabela deduzida. Reentrega 50% e devolução 100% do frete.
-- Vale a partir de 13/10/2026; CT-es anteriores continuam conferidos pela tabela deduzida (20261021).
-- Grava para as duas filiais (CBA e CGR): pode rodar nos dois projetos e quantas vezes quiser.
delete from public.frete_tabelas where transportadora = 'ANDORINHA' and observacoes like 'Proposta 13/10/26%';
insert into public.frete_tabelas (transportadora, rota, peso_ate, nf_ate, valor_fixo, valor_kg, pct_nf, frete_minimo, minimo_base, cubagem_kg_m3, vigencia_inicio, observacoes, filial)
select v.transportadora, v.rota, v.peso_ate::numeric, v.nf_ate::numeric, v.valor_fixo::numeric, v.valor_kg::numeric, v.pct_nf::numeric, null::numeric,
       'total', 300, '2026-10-13'::date, v.observacoes, f.filial
from (values
  -- MS ↔ MT (ICMS 12%)
  ('ANDORINHA', 'MS - MT', 100,  2923.33, 97.51, 0.9553, 0.5682, 'Proposta 13/10/26 (ate 28/07/27): MS-MT ate 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77). Peso 840,66/ton, valor 0,4%, GRIS 0,3% min 8,77, POS 0,1%, despacho 49,03, TAS 17,50, pedagio 10,51/100kg, ICMS 12% por dentro.'),
  ('ANDORINHA', 'MS - MT', 100,  null,    87.55, 0.9553, 0.9091, 'Proposta 13/10/26 (ate 28/07/27): MS-MT ate 100 kg. Peso 840,66/ton, valor 0,4%, GRIS 0,3%, POS 0,1%, despacho 49,03, TAS 17,50, pedagio 10,51/100kg, ICMS 12% por dentro.'),
  ('ANDORINHA', 'MS - MT', null, 2923.33, 85.57, 1.0747, 0.5682, 'Proposta 13/10/26 (ate 28/07/27): MS-MT acima de 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77; pedagio aprox. 0,105/kg). ICMS 12% por dentro.'),
  ('ANDORINHA', 'MS - MT', null, null,    75.60, 1.0747, 0.9091, 'Proposta 13/10/26 (ate 28/07/27): MS-MT acima de 100 kg (pedagio aprox. 0,105/kg). ICMS 12% por dentro.'),
  -- MS ↔ PR (ICMS 7%, PR → MS)
  ('ANDORINHA', 'MS - PR', 100,  2923.33, 105.46, 0.9981, 0.6452, 'Proposta 13/10/26 (ate 28/07/27): MS-PR (Maringa) ate 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77). Peso 928,23/ton, valor 0,5%, GRIS 0,3% min 8,77, POS 0,1%, despacho 61,30, TAS 17,50, pedagio 10,51/100kg, ICMS 7% por dentro.'),
  ('ANDORINHA', 'MS - PR', 100,  null,    96.03,  0.9981, 0.9677, 'Proposta 13/10/26 (ate 28/07/27): MS-PR (Maringa) ate 100 kg. Peso 928,23/ton, valor 0,5%, GRIS 0,3%, POS 0,1%, despacho 61,30, TAS 17,50, pedagio 10,51/100kg, ICMS 7% por dentro.'),
  ('ANDORINHA', 'MS - PR', null, 2923.33, 94.16,  1.1111, 0.6452, 'Proposta 13/10/26 (ate 28/07/27): MS-PR (Maringa) acima de 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77; pedagio aprox. 0,105/kg). ICMS 7% por dentro.'),
  ('ANDORINHA', 'MS - PR', null, null,    84.73,  1.1111, 0.9677, 'Proposta 13/10/26 (ate 28/07/27): MS-PR (Maringa) acima de 100 kg (pedagio aprox. 0,105/kg). ICMS 7% por dentro.'),
  -- MS ↔ SP (ICMS 7%, SP → MS) — São Paulo e Presidente Prudente têm o mesmo preço
  ('ANDORINHA', 'MS - SP', 100,  2923.33, 105.46, 0.9981, 0.6452, 'Proposta 13/10/26 (ate 28/07/27): MS-SP (Sao Paulo / Pres. Prudente) ate 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77). Peso 928,23/ton, valor 0,5%, GRIS 0,3% min 8,77, POS 0,1%, despacho 61,30, TAS 17,50, pedagio 10,51/100kg, ICMS 7% por dentro. Coleta 33,29 a parte.'),
  ('ANDORINHA', 'MS - SP', 100,  null,    96.03,  0.9981, 0.9677, 'Proposta 13/10/26 (ate 28/07/27): MS-SP (Sao Paulo / Pres. Prudente) ate 100 kg. Peso 928,23/ton, valor 0,5%, GRIS 0,3%, POS 0,1%, despacho 61,30, TAS 17,50, pedagio 10,51/100kg, ICMS 7% por dentro. Coleta 33,29 a parte.'),
  ('ANDORINHA', 'MS - SP', null, 2923.33, 94.16,  1.1111, 0.6452, 'Proposta 13/10/26 (ate 28/07/27): MS-SP (Sao Paulo / Pres. Prudente) acima de 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77; pedagio aprox. 0,105/kg). ICMS 7% por dentro. Coleta 33,29 a parte.'),
  ('ANDORINHA', 'MS - SP', null, null,    84.73,  1.1111, 0.9677, 'Proposta 13/10/26 (ate 28/07/27): MS-SP (Sao Paulo / Pres. Prudente) acima de 100 kg (pedagio aprox. 0,105/kg). ICMS 7% por dentro. Coleta 33,29 a parte.'),
  -- MS ↔ RJ (ICMS 7%, RJ → MS)
  ('ANDORINHA', 'MS - RJ', 100,  2923.33, 245.49, 1.7162, 0.6452, 'Proposta 13/10/26 (ate 28/07/27): MS-RJ ate 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77). Peso 1.596,09/ton, valor 0,5%, GRIS 0,3% min 8,77, POS 0,1%, despacho 191,53, TAS 17,50, pedagio 10,51/100kg, ICMS 7% por dentro. Coleta 33,29 a parte.'),
  ('ANDORINHA', 'MS - RJ', 100,  null,    236.06, 1.7162, 0.9677, 'Proposta 13/10/26 (ate 28/07/27): MS-RJ ate 100 kg. Peso 1.596,09/ton, valor 0,5%, GRIS 0,3%, POS 0,1%, despacho 191,53, TAS 17,50, pedagio 10,51/100kg, ICMS 7% por dentro. Coleta 33,29 a parte.'),
  ('ANDORINHA', 'MS - RJ', null, 2923.33, 234.19, 1.8292, 0.6452, 'Proposta 13/10/26 (ate 28/07/27): MS-RJ acima de 100 kg, NF ate 2.923,33 (GRIS no minimo 8,77; pedagio aprox. 0,105/kg). ICMS 7% por dentro. Coleta 33,29 a parte.'),
  ('ANDORINHA', 'MS - RJ', null, null,    224.76, 1.8292, 0.9677, 'Proposta 13/10/26 (ate 28/07/27): MS-RJ acima de 100 kg (pedagio aprox. 0,105/kg). ICMS 7% por dentro. Coleta 33,29 a parte.')
) v(transportadora, rota, peso_ate, nf_ate, valor_fixo, valor_kg, pct_nf, observacoes)
cross join (values ('CBA'), ('CGR')) f(filial);
notify pgrst, 'reload schema';
