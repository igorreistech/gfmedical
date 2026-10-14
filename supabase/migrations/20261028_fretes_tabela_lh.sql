-- Tabela LH TRANSPORTES atual ("TABELA LH - GF MEDICAL", recebida em 14/10/2026) — substitui a proposta de 09/11/2020.
-- Conferida com 6 CT-es reais da capital (set/2026): todos batem (39,60 até 10 kg + 0,44/kg excedente).
--   Campo Grande -> Campo Grande: frete mínimo R$ 39,60 (até 10 kg) + R$ 0,44 por kg acima de 10 kg
--   Campo Grande -> interior de MS: % da NF (até 10 mil 2,60% · até 20 mil 2,08% · até 40 mil 1,56% · acima 1,04%)
--     + R$ 0,66 por kg acima de 50 kg; frete mínimo R$ 62,70
--   Cubagem 1 m³ = 300 kg. ICMS: os CT-es da capital vêm "não tributada" -> incluso (nada somado).
-- Grava para as duas filiais (CBA e CGR); pode rodar mais de uma vez.
delete from public.frete_tabelas where transportadora = 'LH TRANSPORTES';
insert into public.frete_tabelas (transportadora, rota, origens, destinos, peso_ate, nf_ate, valor_fixo, valor_kg, pct_nf, frete_minimo, minimo_base, cubagem_kg_m3,
  pedagio_valor, pedagio_fracao_kg, gris_pct, gris_min, coleta_valor, icms_modo, icms_pct, vigencia_inicio, vigencia_fim, observacoes, filial)
select 'LH TRANSPORTES', 'MS - MS', 'CAMPO GRANDE', v.destinos, v.peso_ate::numeric, v.nf_ate::numeric, v.fixo::numeric, v.kg::numeric, v.pct::numeric, v.minimo::numeric, 'total', 300,
       null, null, null, null, null, 'incluso', null, '2026-10-14'::date, null, v.obs, f.filial
from (values
  -- capital: mínimo 39,60 cobre até 10 kg; acima, 35,20 + 0,44/kg (= 39,60 + 0,44 x kg acima de 10)
  ('CAMPO GRANDE', null, null, 35.20, 0.44, null, 39.60, 'Tabela LH atual: Campo Grande -> Campo Grande. Minimo 39,60 ate 10 kg + 0,44/kg acima de 10 kg.'),
  -- interior: % da NF por faixa de valor (+ 0,66/kg acima de 50 kg), mínimo 62,70
  (null, 50, 10000, null, null, 2.60, 62.70, 'Tabela LH atual: Campo Grande -> interior MS. 2,60% da NF (NF ate 10.000); minimo 62,70; ate 50 kg.'),
  (null, null, 10000, -33.00, 0.66, 2.60, 62.70, 'Tabela LH atual: Campo Grande -> interior MS. 2,60% da NF (NF ate 10.000) + 0,66/kg acima de 50 kg; minimo 62,70.'),
  (null, 50, 20000, null, null, 2.08, 62.70, 'Tabela LH atual: Campo Grande -> interior MS. 2,08% da NF (NF ate 20.000); minimo 62,70; ate 50 kg.'),
  (null, null, 20000, -33.00, 0.66, 2.08, 62.70, 'Tabela LH atual: Campo Grande -> interior MS. 2,08% da NF (NF ate 20.000) + 0,66/kg acima de 50 kg; minimo 62,70.'),
  (null, 50, 40000, null, null, 1.56, 62.70, 'Tabela LH atual: Campo Grande -> interior MS. 1,56% da NF (NF ate 40.000); minimo 62,70; ate 50 kg.'),
  (null, null, 40000, -33.00, 0.66, 1.56, 62.70, 'Tabela LH atual: Campo Grande -> interior MS. 1,56% da NF (NF ate 40.000) + 0,66/kg acima de 50 kg; minimo 62,70.'),
  (null, 50, null, null, null, 1.04, 62.70, 'Tabela LH atual: Campo Grande -> interior MS. 1,04% da NF (NF acima de 40.000); minimo 62,70; ate 50 kg.'),
  (null, null, null, -33.00, 0.66, 1.04, 62.70, 'Tabela LH atual: Campo Grande -> interior MS. 1,04% da NF (NF acima de 40.000) + 0,66/kg acima de 50 kg; minimo 62,70.')
) v(destinos, peso_ate, nf_ate, fixo, kg, pct, minimo, obs)
cross join (values ('CBA'), ('CGR')) f(filial);
notify pgrst, 'reload schema';

select filial, count(*) as linhas from public.frete_tabelas where transportadora = 'LH TRANSPORTES' group by 1 order by 1;
