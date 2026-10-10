-- Controle de Fretes: transportadoras lidas dos PDFs de CT-e (10/10/2026).
-- Rodar no SQL Editor de CADA projeto Supabase de filial (Cuiabá e Campo Grande).
-- Grava para as duas filiais (CBA e CGR) — a página só mostra as da filial
-- dela, então rodar o mesmo arquivo nos dois projetos é seguro.
-- Já cadastradas (ex.: vindas da planilha) só recebem CNPJ/contato/modal que
-- estiverem vazios; nada que você já preencheu é sobrescrito.

with dados(nome, cnpj, telefone, email, modal, observacoes) as (values
  ('ANDORINHA',            '46.435.293/0002-11', '(67) 4009-5352', 'cobranca@andorinhaexpress.com.br',              'Rodoviário', 'ANDORINHA TRANSPORTADORA LTDA'),
  ('AZUL EXPRESS',         '09.296.295/0010-50', null,             null,                                            'Aéreo',      'AZUL LINHAS AEREAS BRASILEIRAS SA'),
  ('BRINGER',              '94.001.641/0005-38', '(11) 5033-2400', null,                                            'Rodoviário', 'BRINGER DO BRASIL AGENCIAMENTO DE CARGAS NACIONAIS E INTERNACIONAIS'),
  ('CARVALIMA',            '33.070.814/0009-09', '(67) 3316-3900', 'expedicao7.cgr@carvalima.com.br',               'Rodoviário', 'CARVALIMA TRANSPORTES LTDA'),
  ('EUCATUR',              '76.080.738/0010-69', '(45) 3902-1205', 'ronaldoadm12@gmail.com',                        'Rodoviário', 'EUCATUR - EMP UNIAO CASCAVEL DE TRANSPORTES'),
  ('GOLLOG',               '07.575.651/0058-94', null,             null,                                            'Aéreo',      'GOL LINHAS AEREAS S/A'),
  ('LOGMED',               '09.303.268/0002-58', null,             null,                                            'Rodoviário', 'LOGMED ARMAZENAGEM E LOGISTICA LTDA'),
  ('PANTANAL TRANSPORTES', '46.970.030/0002-02', '(11) 2081-2836', 'pantanaltransp@gmail.com',                      'Rodoviário', 'PANTANAL OPERADOR DE TRANSPORTE MULTIMODAL'),
  ('TRANSET / 7 EXPRESS',  '05.464.895/0005-62', '(65) 3634-3099', 'express.financeiro@transetetransportes.com.br', 'Rodoviário', 'TRANSETE TRANSPORTES SEGURO LTDA'),
  ('VIATUR',               '03.409.286/0001-51', '(67) 3363-1200', 'cargas@viaturms.com.br',                        'Rodoviário', 'VIATUR TRANSPORTES E TURISMO LTDA')
), filiais(filial) as (values ('CBA'), ('CGR'))
insert into public.frete_transportadoras (nome, cnpj, telefone, email, modal, observacoes, filial)
select d.nome, d.cnpj, d.telefone, d.email, d.modal, d.observacoes, f.filial
from dados d cross join filiais f
on conflict (filial, (upper(nome))) do update set
  cnpj          = coalesce(frete_transportadoras.cnpj, excluded.cnpj),
  telefone      = coalesce(frete_transportadoras.telefone, excluded.telefone),
  email         = coalesce(frete_transportadoras.email, excluded.email),
  modal         = coalesce(frete_transportadoras.modal, excluded.modal),
  observacoes   = coalesce(frete_transportadoras.observacoes, excluded.observacoes),
  atualizado_em = now();
