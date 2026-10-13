-- Controle de Fretes: tabela combinada por componentes (como vêm na proposta), ICMS pelo sentido da
-- viagem, validade da tabela e versão do banco. Rodar no SQL Editor de CADA projeto (Cuiabá e Campo Grande);
-- pode rodar mais de uma vez.

-- 1) Colunas novas da tabela de frete
alter table public.frete_tabelas
  add column if not exists pedagio_valor     numeric(12,2),             -- R$ por fração de peso
  add column if not exists pedagio_fracao_kg numeric(10,2),             -- tamanho da fração (padrão 100 kg)
  add column if not exists gris_pct          numeric(8,4),              -- % da NF
  add column if not exists gris_min          numeric(12,2),             -- GRIS mínimo (R$)
  add column if not exists coleta_valor      numeric(12,2),             -- coleta no remetente (R$), quando há
  add column if not exists icms_modo         text not null default 'incluso',  -- 'incluso' | 'somar' (por dentro, pela rota)
  add column if not exists icms_pct          numeric(5,2),              -- alíquota fixa (em branco = 7%/12% pela rota)
  add column if not exists vigencia_fim      date;                      -- válida até

-- 2) Versão do banco (a página avisa quando o banco está mais velho que ela)
alter table public.frete_config add column if not exists versao_banco text;

-- 3) Andorinha: proposta de 13/10/26 por componentes — troca as 16 linhas "Proposta 13/10/26" por 4
--    (uma por rota). Valores SEM ICMS, como na proposta; o sistema soma 7% ou 12% pelo sentido.
delete from public.frete_tabelas where transportadora = 'ANDORINHA' and observacoes like 'Proposta 13/10/26%';
insert into public.frete_tabelas (transportadora, rota, peso_ate, nf_ate, valor_fixo, valor_kg, pct_nf, frete_minimo, minimo_base, cubagem_kg_m3,
  pedagio_valor, pedagio_fracao_kg, gris_pct, gris_min, coleta_valor, icms_modo, vigencia_inicio, vigencia_fim, observacoes, filial)
select 'ANDORINHA', v.rota, null, null, v.fixo::numeric, v.kg::numeric, v.pct::numeric, null, 'total', 300,
       10.51, 100, 0.3, 8.77, v.coleta::numeric, 'somar', '2026-10-13'::date, '2027-07-28'::date, v.obs, f.filial
from (values
  ('MS - MT', 66.53, 0.84066, 0.5, null,  'Proposta 13/10/26 (ate 28/07/27): MS-MT (Cuiaba e regiao). Despacho 49,03 + TAS 17,50; 840,66/ton; frete valor 0,4% + POS 0,1%; GRIS 0,3% min 8,77; pedagio 10,51/100kg; ICMS somado pela rota.'),
  ('MS - PR', 78.80, 0.92823, 0.6, null,  'Proposta 13/10/26 (ate 28/07/27): MS-PR (Maringa e regiao). Despacho 61,30 + TAS 17,50; 928,23/ton; frete valor 0,5% + POS 0,1%; GRIS 0,3% min 8,77; pedagio 10,51/100kg; ICMS somado pela rota.'),
  ('MS - SP', 78.80, 0.92823, 0.6, 33.29, 'Proposta 13/10/26 (ate 28/07/27): MS-SP (Sao Paulo e Pres. Prudente). Despacho 61,30 + TAS 17,50; 928,23/ton; frete valor 0,5% + POS 0,1%; GRIS 0,3% min 8,77; pedagio 10,51/100kg; coleta 33,29 (Sao Paulo); ICMS somado pela rota.'),
  ('MS - RJ', 209.03, 1.59609, 0.6, 33.29, 'Proposta 13/10/26 (ate 28/07/27): MS-RJ (Rio de Janeiro e regiao). Despacho 191,53 + TAS 17,50; 1.596,09/ton; frete valor 0,5% + POS 0,1%; GRIS 0,3% min 8,77; pedagio 10,51/100kg; coleta 33,29; ICMS somado pela rota.')
) v(rota, fixo, kg, pct, coleta, obs)
cross join (values ('CBA'), ('CGR')) f(filial);

-- 4) Marca a versão do banco nas duas filiais (por último: só fica marcada se tudo acima rodou)
insert into public.frete_config (filial, versao_banco) values ('CBA', '20261023'), ('CGR', '20261023')
on conflict (filial) do update set versao_banco = excluded.versao_banco, atualizado_em = now();

notify pgrst, 'reload schema';
