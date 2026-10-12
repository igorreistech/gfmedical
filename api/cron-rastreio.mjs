// Tarefa agendada da Vercel (vercel.json → crons): atualiza o status dos CT-es pelo rastreio
// do SSW mesmo com o Controle de Fretes fechado. Mesma regra da página (fretes.html):
// ENTREGUE → Entregue (com a data do SSW); movimento com o CT-e Pendente → Em trânsito;
// avaria/extravio/devolução/cliente ausente → ocorrência (se o CT-e ainda não tiver).
//
// Configuração (Vercel → Settings → Environment Variables). Sem ela a tarefa não faz nada.
//   FRETES_ALVOS = [{"url":"https://xxxx.supabase.co","key":"<service_role key>","filial":"CBA"}]
//   CRON_SECRET  = (opcional) a Vercel manda "Authorization: Bearer <CRON_SECRET>" nas chamadas agendadas
import { lerResultado } from './rastreio.mjs';

const GF = '07356800';
const dig = v => String(v || '').replace(/\D/g, '');
const nfsDe = c => String(c.numero_nfe || '').split(/[^0-9]+/).filter(Boolean).map(n => n.replace(/^0+/, ''));
const naoDisp = t => /n[ãa]o dispon/i.test(t || '');
const ehEntregue = t => /ENTREGUE/i.test(t || '') && !/N[ÃA]O ENTREGUE/i.test(t || '');
const ocorrenciaDoSsw = s => /AVARIA/i.test(s) ? 'Avaria' : /EXTRAVI/i.test(s) ? 'Extravio' : /DEVOLU|DEVOLVID/i.test(s) ? 'Devolução'
  : /AUSENTE|ENDERE[ÇC]O (N[ÃA]O|INCORRET|INSUFIC)|RECUS|REENTREGA|ESTABELECIMENTO FECHADO|N[ÃA]O LOCALIZAD/i.test(s) ? 'Reentrega' : null;
const dataSsw = dh => { const m = /(\d{2})\/(\d{2})\/(\d{2,4})/.exec(dh || ''); return m ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2]}-${m[1]}` : null; };

function tentativas(c, cnpjGf) {
  const nfs = nfsDe(c); if (!nfs.length) return [];
  const rem = dig(c.remetente_cnpj), dest = dig(c.destino_cnpj), ok = d => d.length === 14 || d.length === 11;
  const gfDestino = /GF MEDICAL/i.test(c.destino || '') || /COMPRA/i.test(c.tipo_saida || '') || dest.startsWith(GF);
  const t = gfDestino ? [{ tipo: 'dest', cnpj: dest.startsWith(GF) ? dest : cnpjGf }, ok(rem) && { tipo: 'rem', cnpj: rem }]
    : [{ tipo: 'rem', cnpj: ok(rem) ? rem : cnpjGf }, ok(dest) && { tipo: 'dest', cnpj: dest }];
  return t.filter(Boolean).map(x => ({ ...x, nfs }));
}
async function consultar(tipo, cnpj, nfs) {
  const [acao, campo] = tipo === 'dest' ? ['resultSSW_dest_nro', 'cnpjdest'] : ['resultSSW', 'cnpj'];
  const r = await fetch('https://ssw.inf.br/2/' + acao, { method: 'POST', signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ [campo]: cnpj, NR: nfs.join('\n'), chave: '' }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 (Controle de Fretes GF Medical)' } });
  return lerResultado(await r.text()).linhas;
}

async function atualizarFilial({ url, key, filial }) {
  const h = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const desde = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const q = `${url}/rest/v1/frete_ctes?select=*&filial=eq.${filial}&status_entrega=neq.Entregue&data_emissao=gte.${desde}`;
  const ctes = await (await fetch(q, { headers: h })).json();
  if (!Array.isArray(ctes)) throw new Error('Supabase: ' + JSON.stringify(ctes).slice(0, 200));
  // CNPJ da GF desta filial: o mais usado nos CT-es
  const cont = new Map();
  ctes.flatMap(c => [dig(c.remetente_cnpj), dig(c.destino_cnpj)]).filter(d => d.length === 14 && d.startsWith(GF)).forEach(d => cont.set(d, (cont.get(d) || 0) + 1));
  const cnpjGf = [...cont].sort((a, b) => b[1] - a[1])[0]?.[0] || '07356800000199';
  const achados = new Map();
  for (let passo = 0; passo < 2; passo++) {
    const grupos = new Map();
    ctes.filter(c => !achados.has(c.id)).forEach(c => { const t = tentativas(c, cnpjGf)[passo]; if (!t) return; const k = t.tipo + '|' + t.cnpj;
      if (!grupos.has(k)) grupos.set(k, { ...t, ctes: [] }); grupos.get(k).ctes.push(c); });
    for (const g of grupos.values()) {
      const nfs = [...new Set(g.ctes.flatMap(nfsDe))];
      for (let i = 0; i < nfs.length; i += 100) {
        try {
          (await consultar(g.tipo, g.cnpj, nfs.slice(i, i + 100))).filter(l => !naoDisp(l.situacao)).forEach(l => {
            const n = (String(l.nf).trim().split(/\s+/).pop() || '').replace(/^0+/, '');
            g.ctes.filter(c => !achados.has(c.id) && nfsDe(c).includes(n)).forEach(c => achados.set(c.id, l));
          });
        } catch (e) { /* SSW fora: tenta na próxima execução */ }
      }
    }
  }
  const alterados = [];
  for (const [id, l] of achados) {
    const c = ctes.find(x => x.id === id), upd = {};
    if (ehEntregue(l.situacao)) Object.assign(upd, { status_entrega: 'Entregue', data_entrega: dataSsw(l.dataHora) });
    else if (c.status_entrega === 'Pendente') upd.status_entrega = 'Em trânsito';
    const oc = ocorrenciaDoSsw(l.situacao + ' ' + (l.detalhe || ''));
    if (oc && !c.ocorrencia && 'ocorrencia' in c) Object.assign(upd, { ocorrencia: oc, ocorrencia_obs: `SSW ${l.dataHora || ''}: ${l.situacao}`.slice(0, 300) });
    if (!Object.keys(upd).length) continue;
    const r = await fetch(`${url}/rest/v1/frete_ctes?id=eq.${id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ ...upd, atualizado_em: new Date().toISOString() }) });
    if (r.ok) alterados.push(`${c.numero_cte}: ${upd.status_entrega ? `${c.status_entrega} → ${upd.status_entrega}` : ''}${upd.data_entrega ? ' em ' + upd.data_entrega : ''}${upd.ocorrencia ? ' · ocorrência ' + upd.ocorrencia : ''}`);
  }
  if (alterados.length) await fetch(`${url}/rest/v1/frete_log`, { method: 'POST', headers: h,
    body: JSON.stringify({ acao: 'status pelo rastreio SSW (automático)', tabela: 'frete_ctes', registro: `${alterados.length} CT-e(s)`, detalhes: { alterados }, usuario: 'tarefa agendada', filial }) });
  return { filial, consultados: ctes.length, alterados };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.CRON_SECRET && req.headers?.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ ok: false });
  let alvos = [];
  try { alvos = JSON.parse(process.env.FRETES_ALVOS || '[]'); } catch (e) { return res.status(500).json({ ok: false, erro: 'FRETES_ALVOS não é um JSON válido' }); }
  if (!alvos.length) return res.status(200).json({ ok: true, aviso: 'FRETES_ALVOS não configurado — nada a fazer' });
  const out = [];
  for (const a of alvos) { try { out.push(await atualizarFilial(a)); } catch (e) { out.push({ filial: a.filial, erro: e.message }); } }
  return res.status(200).json({ ok: true, resultado: out });
}
