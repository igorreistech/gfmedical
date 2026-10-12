// Rastreio no SSW (ssw.inf.br) para o Controle de Fretes (fretes.html).
// O SSW não deixa ser aberto dentro de outro site (X-Frame-Options) nem lido pelo navegador
// (sem CORS), então esta função da Vercel faz a consulta e devolve as linhas em JSON.
//
// POST /api/rastreio  { tipo: 'dest' | 'rem' | 'gollog' (nfs = Nº dos CT-es), cnpj: '07356800000199', nfs: ['929351', ...], detalhes?: false }
//   dest = "pelo destinatário" (ssw.inf.br/2/rastreamento_dest?pwd=2) — cnpj de quem recebe
//   rem  = "pelo remetente"    (ssw.inf.br/2/rastreamento)            — cnpj de quem emitiu a NF
// Resposta: { ok, linhas: [{ nf, pedido, unidade, dataHora, situacao, detalhe, link }], vazio }

const ACOES = { dest: ['resultSSW_dest_nro', 'cnpjdest'], rem: ['resultSSW', 'cnpj'] };

const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', ccedil: 'ç', Ccedil: 'Ç', atilde: 'ã', otilde: 'õ', aacute: 'á', eacute: 'é',
  iacute: 'í', oacute: 'ó', uacute: 'ú', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Atilde: 'Ã' };
const texto = h => (h || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&([a-zA-Z]+);/g, (m, e) => ENT[e] ?? m)
  .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

function linkDe(html) {
  const m = /href="([^"#][^"]*)"/i.exec(html) || /(?:onclick|href)="[^"]*?['"](\/[^'"]+|https?:\/\/[^'"]+)['"]/i.exec(html);
  if (!m || /rastreamento_dest\?pwd|^javascript/i.test(m[1])) return null;
  return m[1].startsWith('http') ? m[1] : 'https://ssw.inf.br' + (m[1].startsWith('/') ? '' : '/2/') + m[1];
}

export function lerResultado(html) {
  const linhas = [];
  for (const tr of html.split(/<tr\b/i).slice(1)) {
    const tds = [...tr.matchAll(/<td\b[^>]*class="?rastreamento"?[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (tds.length < 3) continue;
    const [a, b, c] = tds.map(texto);
    linhas.push({ nf: a[0] || '', pedido: a.slice(1).join(' '), unidade: b[0] || '', dataHora: b.slice(1).join(' '),
      situacao: c[0] || '', detalhe: c.slice(1).join(' · '), link: linkDe(tds.join(' ')) });
  }
  const vazio = /Nenhuma informa/i.test(html) && !linhas.length;
  return { linhas, vazio };
}

// Página "Mais detalhes" (ssw_SSWDetalhado): todos os eventos + contato da transportadora.
export function lerDetalhe(html) {
  const eventos = lerResultado(html).linhas.map(l => ({ dataHora: [l.nf, l.pedido].filter(Boolean).join(' '), unidade: [l.unidade, l.dataHora].filter(Boolean).join(' · '),
    situacao: l.situacao, detalhe: l.detalhe }));
  const campo = rot => { const m = new RegExp(rot + '[\\s\\S]{0,300}?<td class=old_rastreamento>([\\s\\S]*?)</td>', 'i').exec(html); return m ? texto(m[1]).join(' ') : ''; };
  return { eventos, transportadora: campo('Estamos transportando'), email: campo('E-mail:'), telefone: campo('Telefone:') };
}

// GOLLOG: API pública do site (servicos.gollog.com.br/app/site/tracking), pelo Nº do CT-e/AWB.
const dhBR = iso => { if (!iso) return ''; const d = new Date(new Date(iso).getTime() - 3 * 3600e3); const p = n => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };
// "09/09" (dia/mês) → AAAA-MM-DD, no ano da emissão (ou no seguinte, se o mês já passou)
function previsaoGollog(ddmm, emissaoIso) {
  const m = /^(\d{2})\/(\d{2})$/.exec(ddmm || ''); if (!m) return null;
  const em = emissaoIso ? new Date(emissaoIso) : new Date();
  let ano = em.getUTCFullYear(); if (+m[2] < em.getUTCMonth() + 1) ano++;
  return `${ano}-${m[2]}-${m[1]}`;
}
async function rastrearGollog(codigos) {
  const url = 'https://servicos.gollog.com.br/api/services/app/Tracking/GetAllByCodes?' + codigos.map(c => 'values=' + encodeURIComponent(c)).join('&');
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Controle de Fretes GF Medical)' } });
  const j = await r.json();
  const linhas = (j.result || []).map((x, i) => {
    const h = x.header || {}, ev = x.events || [], ult = ev[0];
    if (!x.found) return { codigo: String(codigos[i] || h.code || ''), nf: '', situacao: 'Informação não disponível', dataHora: '', unidade: '', detalhe: '', link: null };
    const entregue = x.dlv || x.lastStatus?.code === 'DLV';
    const situacao = x.isCancelled ? 'CT-e CANCELADO' : entregue ? 'MERCADORIA ENTREGUE' : (ult?.codeDescription || x.lastStatus?.description || '').toUpperCase();
    return { codigo: String(h.code || codigos[i] || ''), nf: String(h.nf || '').replace(/^0+/, ''), situacao, dataHora: dhBR(ult?.date), unidade: ult?.station || '',
      detalhe: [x.lastStatus?.description, x.expectedDeliveryDate && !entregue ? `Previsão de entrega: ${x.expectedDeliveryDate}` : '', `${x.originAdvancedPost || ''} → ${x.destinationAdvancedPost || ''}`, h.serviceName, h.pieces ? `${h.pieces} volume(s), ${h.weight} kg` : ''].filter(Boolean).join(' · '),
      eventos: [...ev].reverse().map(e => ({ dataHora: dhBR(e.date), unidade: e.station || '', situacao: (e.codeDescription || '').toUpperCase(), detalhe: e.message || '' })), // do mais antigo ao mais recente (como no SSW)
      previsao: previsaoGollog(x.expectedDeliveryDate, ev[ev.length - 1]?.date),
      transportadora: 'GOLLOG', telefone: x.routing?.destination?.phoneNumber || '', email: x.routing?.destination?.email || '', link: null };
  });
  return { linhas, vazio: !linhas.length };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'use POST' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const { tipo, cnpj, nfs, detalhes = true } = body || {};
  if (tipo === 'gollog') {
    const cods = (Array.isArray(nfs) ? nfs : []).map(n => String(n).replace(/\D/g, '')).filter(n => n && n.length <= 14).slice(0, 50);
    if (!cods.length) return res.status(400).json({ ok: false, erro: 'informe o Nº do CT-e da Gollog' });
    try { return res.status(200).json({ ok: true, ...(await rastrearGollog(cods)) }); }
    catch (e) { return res.status(502).json({ ok: false, erro: 'Gollog não respondeu: ' + (e.message || e) }); }
  }
  const acao = ACOES[tipo];
  const doc = String(cnpj || '').replace(/\D/g, '');
  const lista = (Array.isArray(nfs) ? nfs : []).map(n => String(n).replace(/\D/g, '')).filter(n => n && n.length <= 12).slice(0, 100);
  if (!acao || !(doc.length === 14 || doc.length === 11) || !lista.length)
    return res.status(400).json({ ok: false, erro: 'informe tipo (dest/rem), CNPJ e ao menos uma NF' });
  try {
    const form = new URLSearchParams({ [acao[1]]: doc, NR: lista.join('\n'), chave: '' });
    const r = await fetch('https://ssw.inf.br/2/' + acao[0], {
      method: 'POST', body: form, signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 (Controle de Fretes GF Medical)',
        Referer: tipo === 'dest' ? 'https://ssw.inf.br/2/rastreamento_dest?pwd=2&' : 'https://ssw.inf.br/2/rastreamento?' },
    });
    const html = await r.text();
    const out = lerResultado(html);
    // histórico completo de cada NF (até 10), pelo link "Mais detalhes"
    // (detalhes: false = só a situação atual — usado na atualização em lote dos status)
    if (detalhes) await Promise.all(out.linhas.slice(0, 10).map(async l => {
      if (!l.link || !/ssw\.inf\.br\/2\/ssw_SSWDetalhado/i.test(l.link)) return;
      try {
        const d = await fetch(l.link, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0 (Controle de Fretes GF Medical)' } });
        Object.assign(l, lerDetalhe(await d.text()));
      } catch (e) { /* sem detalhe: fica só a situação atual */ }
    }));
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return res.status(502).json({ ok: false, erro: 'SSW não respondeu: ' + (e.message || e) });
  }
}
