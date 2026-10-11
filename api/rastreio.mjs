// Rastreio no SSW (ssw.inf.br) para o Controle de Fretes (fretes.html).
// O SSW não deixa ser aberto dentro de outro site (X-Frame-Options) nem lido pelo navegador
// (sem CORS), então esta função da Vercel faz a consulta e devolve as linhas em JSON.
//
// POST /api/rastreio  { tipo: 'dest' | 'rem', cnpj: '07356800000199', nfs: ['929351', ...] }
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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'use POST' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const { tipo, cnpj, nfs } = body || {};
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
    await Promise.all(out.linhas.slice(0, 10).map(async l => {
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
