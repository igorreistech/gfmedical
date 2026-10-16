// Teste rápido do Controle de Fretes (fretes.html) — rode antes de publicar.
// Uso: sirva a pasta (ex.: python -m http.server 8765) e rode:
//   node tests/fretes-smoke.cjs http://localhost:8765/fretes.html
// Precisa do Playwright (npm i -D playwright, ou PLAYWRIGHT=<caminho do pacote>). O Supabase é simulado:
// nada é gravado no banco. Qualquer linha "PAGEERROR" ou "FALHOU" indica problema.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const ROLE = process.env.ROLE || 'admin';
const ctes = [
  { id: 'c1', numero_cte: '39562', data_emissao: '2026-10-10', numero_nfe: '63600', transportadora: 'VIATUR', remetente: 'GF MEDICAL', destino: 'HOSPITAL PRESBITERIANO', destino_cnpj: '60.967.551/0027-90', tipo_saida: 'VENDA', observacoes: 'CAMPO GRANDE/MS → DOURADOS/MS', valor_frete: 149.75, valor_nfe: 6950, prazo_dias: 2, status_entrega: 'Em trânsito', filial: 'CBA' },
  { id: 'c2', numero_cte: '39570', data_emissao: '2026-10-11', numero_nfe: '63610', transportadora: 'VIATUR', remetente: 'GF MEDICAL', destino: 'UNIMED DOURADOS', tipo_saida: 'VENDA', valor_frete: 300, valor_nfe: 5000, status_entrega: 'Entregue', data_entrega: '2026-10-12', ocorrencia: 'Avaria', ocorrencia_custo: 850, ocorrencia_obs: 'caixa amassada', ocorrencia_status: 'Aberta', ocorrencia_prazo: '2026-10-13', filial: 'CBA' }];
const cots = [{ id: 'k1', numero: 'COT-0001', data_cotacao: '2026-10-15', transportadora: 'VIATUR', origem: 'CAMPO GRANDE', uf_origem: 'MS', destino: 'DOURADOS', uf_destino: 'MS', peso_kg: 29.4, volume_m3: 0.39, valor_mercadoria: 6950, valor_frete: 149.75, status: 'Aguardando',
  observacoes: 'Remetente: GF Medical (07.356.800/0001-99) · Coleta em: Av. Mato Grosso, 3049 – CEP 79021-002 · Destinatário: Hospital Presbiteriano · Entrega em: Rua X, 10 · Frete CIF · 5 volume(s): 1× 52x71x51 cm', filial: 'CBA' }];
const transp = [{ id: 't1', nome: 'VIATUR', meta_mensal: 400, email: 'cargas@viaturms.com.br' }];
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })}.x`;
const user = { id: 'u1', email: 'a@b.c', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true }); const page = await ctx.newPage();
  const posts = [];
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('dialog', d => d.accept());
  await page.route(/supabase\.co\/auth\/v1\/token/, r => r.fulfill({ json: { access_token: jwt, token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user } }));
  await page.route(/supabase\.co\/rest\/v1\//, r => { const req = r.request(), u = decodeURIComponent(req.url());
    if (req.method() !== 'GET') { posts.push(req.method() + ' ' + u.split('/rest/v1/')[1].split('?')[0] + ' ' + (req.postData() || '').slice(0, 220)); return r.fulfill({ status: req.method() === 'POST' ? 201 : 204, body: '' }); }
    if (/usuarios/.test(u)) return r.fulfill({ json: { role: ROLE } });
    return r.fulfill({ json: /frete_ctes/.test(u) ? ctes : /frete_cotacoes/.test(u) ? cots : /frete_transp/.test(u) ? transp : [] }); });
  await page.route(/supabase\.co\/realtime/, r => r.abort());
  await page.route(/\/api\/rastreio/, r => r.fulfill({ json: { ok: true, linhas: [] } }));
  await page.goto(process.argv[2]);
  await page.waitForFunction(() => typeof window.doLogin === 'function', null, { timeout: 30000 });
  await page.fill('#l-email', 'a@b.c'); await page.fill('#l-senha', 'x'); await page.click('.login-btn');
  await page.waitForSelector('#app-root', { state: 'visible' }); await page.waitForTimeout(1200);
  const t = async sel => (await page.textContent(sel)).replace(/\s+/g, ' ');
  console.log('DASH backup:', ((await t('#view-dashboard')).match(/💾 Nenhum backup[^.]*\./) || ['—'])[0], '| meta:', ((await t('#view-dashboard')).match(/🎯 Gasto do mês.{0,140}/) || ['—'])[0]);
  await page.evaluate(() => { window.open = u => { window._wa = decodeURIComponent(u); }; });
  await page.click('.nav-item[data-view="ctes"]'); await page.waitForTimeout(300);
  console.log('CTES stats:', (await t('#ctes-stats')).slice(0, 260), '| filtros card:', await page.locator('.ctes-filtros .dcard-head').count());
  await page.locator('#tb-ctes button[title^="Avisar"]').first().click();
  console.log('AVISAR:', (await page.evaluate(() => window._wa)).replace(/\n/g, ' | ').slice(0, 300));
  await page.screenshot({ path: require('os').tmpdir() + '/fretes-teste.png' });
  await page.click('.nav-item[data-view="cotacoes"]'); await page.waitForTimeout(300);
  await page.locator('#tb-cot button[title^="Pedir coleta"]').first().click();
  console.log('COLETA:', (await page.evaluate(() => window._wa)).replace(/\n/g, ' | ').slice(0, 420));
  await page.evaluate(() => abrirModal('cot'));
  await page.fill('#fm-destino', 'HOSPITAL PRESBITERIANO — DOURADOS/MS'); await page.dispatchEvent('#fm-destino', 'change');
  console.log('CLIENTE:', await page.inputValue('#fm-destino'), await page.inputValue('#fm-uf_destino'), '| obs:', await page.inputValue('#fm-observacoes'));
  const dl = await page.$$eval('#dl-dest option', os => os.map(o => o.value).filter(v => v.includes('—')));
  console.log('DATALIST clientes:', dl.join(' | '));
  // aprovação
  await page.fill('#fm-origem', 'CAMPO GRANDE'); await page.selectOption('#fm-uf_origem', 'MS');
  await page.selectOption('#fm-transportadora', 'VIATUR'); await page.fill('#fm-valor_mercadoria', '1000'); await page.fill('#fm-valor_frete', '200'); await page.dispatchEvent('#fm-valor_frete', 'input');
  await page.selectOption('#fm-status', 'Aprovado'); await page.click('#modal .mfoot .tbtn-p'); await page.waitForTimeout(500);
  console.log('APROVAÇÃO (' + ROLE + '):', (posts.filter(p => /frete_cotacoes/.test(p)).pop() || '').match(/"status":"[^"]*"/)?.[0], '| toast:', (await page.locator('.toast').allTextContents()).filter(x => /administrador/.test(x))[0] || '—');
  await page.click('.nav-item[data-view="auditoria"]'); await page.waitForTimeout(400);
  console.log('OCORRÊNCIAS:', (await t('#oc-wrap')).slice(0, 220));
  await page.click('.nav-item[data-view="cirurgias"]'); await page.waitForTimeout(300);
  const [dlx] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('button[onclick="exportarClientes()"]')]);
  console.log('EXPORT clientes:', dlx ? dlx.suggestedFilename() : 'nenhum');
  console.log('RESUMO:', await page.evaluate(() => { const L = []; window.open = u => L.push(decodeURIComponent(u)); enviarResumoDia(); return (L[0] || '').match(/Ocorrências em aberto[\s\S]{0,120}|acima da meta[\s\S]{0,80}/g)?.join(' || ').replace(/\n/g, ' | '); }));
  await browser.close();
})().catch(e => { console.error('FALHOU', e.message); process.exit(1); });
