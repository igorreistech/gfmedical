-- Tabela da ANDORINHA deduzida dos CT-es (XML) de 30/09 a 09/10/2026 — os componentes do frete
-- de cada CT-e (frete peso, frete valor, GRIS, POS, despacho, TAS, pedágio, ICMS) batem com estes valores.
-- Valores JÁ COM O ICMS "por dentro" (12% MS→MT, 7% SP→MS), como sai no total do CT-e.
-- Pedágio: R$ 10,51 a cada 100 kg (acima de 100 kg vira aprox. R$ 0,105/kg). Cubagem: 300 kg/m³.
-- Grava para as duas filiais (CBA e CGR): pode rodar nos dois projetos e quantas vezes quiser.
delete from public.frete_tabelas where transportadora = 'ANDORINHA' and observacoes like 'Deduzida dos CT-es%';
insert into public.frete_tabelas (transportadora, rota, peso_ate, nf_ate, valor_fixo, valor_kg, pct_nf, frete_minimo, minimo_base, cubagem_kg_m3, vigencia_inicio, observacoes, filial)
select v.transportadora, v.rota, v.peso_ate::numeric, v.nf_ate::numeric, v.valor_fixo::numeric, v.valor_kg::numeric, v.pct_nf::numeric, v.frete_minimo::numeric,
       'total', 300, '2026-09-30'::date, v.observacoes, f.filial
from (values
  -- MS → MT (Campo Grande → Cuiabá): frete peso 0,84/kg · frete valor 0,4% · GRIS 0,3% (mín. 8,77) · POS 0,1% · despacho 49,03 · TAS 17,50 · pedágio 10,51 · ICMS 12%
  ('ANDORINHA', 'MS - MT', 100, 2923.33, 97.51, 0.9545, 0.5682, null, 'Deduzida dos CT-es: MS-MT ate 100 kg, NF ate 2.923 (GRIS no minimo 8,77). Componentes: peso 0,84/kg, valor 0,4%, GRIS 0,3% min 8,77, POS 0,1%, despacho 49,03, TAS 17,50, pedagio 10,51/100kg, ICMS 12% por dentro.'),
  ('ANDORINHA', 'MS - MT', 100, null,    87.55, 0.9545, 0.9091, null, 'Deduzida dos CT-es: MS-MT ate 100 kg. Componentes: peso 0,84/kg, valor 0,4%, GRIS 0,3%, POS 0,1%, despacho 49,03, TAS 17,50, pedagio 10,51/100kg, ICMS 12% por dentro.'),
  ('ANDORINHA', 'MS - MT', null, 2923.33, 85.57, 1.0740, 0.5682, null, 'Deduzida dos CT-es: MS-MT acima de 100 kg, NF ate 2.923 (pedagio aprox. 0,105/kg). ICMS 12% por dentro.'),
  ('ANDORINHA', 'MS - MT', null, null,    75.60, 1.0740, 0.9091, null, 'Deduzida dos CT-es: MS-MT acima de 100 kg (pedagio aprox. 0,105/kg). ICMS 12% por dentro.'),
  -- SP → MS (fornecedores de SP → Campo Grande): frete peso 0,928/kg · frete valor 0,5% · GRIS 0,3% · POS 0,1% · despacho 61,30 · TAS 17,50 · pedágio 10,51 · ICMS 7%
  -- (+ COLETA R$ 33,29 quando há coleta no fornecedor — não incluída)
  ('ANDORINHA', 'SP - MS', 100, null,    96.03, 0.9978, 0.9677, null, 'Deduzida dos CT-es: SP-MS ate 100 kg. Componentes: peso 0,928/kg, valor 0,5%, GRIS 0,3%, POS 0,1%, despacho 61,30, TAS 17,50, pedagio 10,51/100kg, ICMS 7% por dentro. Coleta 33,29 a parte.'),
  ('ANDORINHA', 'SP - MS', null, null,   84.73, 1.1109, 0.9677, null, 'Deduzida dos CT-es: SP-MS acima de 100 kg (pedagio aprox. 0,105/kg). ICMS 7% por dentro. Coleta 33,29 a parte.')
) v(transportadora, rota, peso_ate, nf_ate, valor_fixo, valor_kg, pct_nf, frete_minimo, observacoes)
cross join (values ('CBA'), ('CGR')) f(filial);
notify pgrst, 'reload schema';
