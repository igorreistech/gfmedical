// Teste rápido do Controle de Fretes (fretes.html) — rode antes de publicar.
// Uso: sirva a pasta (ex.: python -m http.server 8765) e rode:
//   node tests/fretes-smoke.cjs http://localhost:8765/fretes.html
// Precisa do Playwright (npm i -D playwright, ou PLAYWRIGHT=<caminho do pacote>). O Supabase é simulado:
// nada é gravado no banco. Qualquer linha "PAGEERROR" ou "FALHOU" indica problema.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const TEXTO = `Origem: Braile Biomédica Ind. Com. e Repr. Ltda.
CNPJ: 52.828.936/0001-09
Av. Pres. Juscelino Kubitschek de Oliveira, 1505 – Jd. Tarraf – CEP 15091-450 – São José do Rio Preto/SP

📍 Destino: GF Medical Com. e Repr. Ltda.
CNPJ: 07.356.800/0001-99
Av. Mato Grosso, 3049, Loja 01 – Santa Fé – CEP 79021-002 – Campo Grande/MS

🚚 Frete: FOB
📦 Mercadoria: produtos médico-hospitalares

OC 00272/26 – R$ 35.795,95
8 caixas – 74x69x74 cm – 160 kg

OC 00273/26 – R$ 3.650,00
1 caixa – 45x38x35 cm – 1 kg

OC 00274/26 – R$ 6.360,00
1 caixa – 45x38x35 cm – 1 kg

Pendência – R$ 1.585,00 e R$ 4.755,00
1 caixa – 45x38x35 cm – 1 kg

Total: 11 volumes | 163 kg | aprox. 3,20 m³ | R$ 52.145,95`;
const tab = [
  { id: 'a1', transportadora: 'ANDORINHA', rota: 'SP - MS', peso_ate: 100, valor_fixo: 96.03, valor_kg: 0.9978, pct_nf: 0.9677, minimo_base: 'total', cubagem_kg_m3: 300, vigencia_inicio: '2026-09-30', filial: 'CGR' },
  { id: 'a2', transportadora: 'ANDORINHA', rota: 'SP - MS', valor_fixo: 84.73, valor_kg: 1.1109, pct_nf: 0.9677, minimo_base: 'total', cubagem_kg_m3: 300, vigencia_inicio: '2026-09-30', filial: 'CGR' }];
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })}.x`;
const user = { id: 'u1', email: 'a@b.c', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route(/supabase\.co\/auth\/v1\/token/, r => r.fulfill({ json: { access_token: jwt, token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user } }));
  await page.route(/supabase\.co\/rest\/v1\//, r => { const u = decodeURIComponent(r.request().url());
    if (/usuarios/.test(u)) return r.fulfill({ json: { role: 'admin' } });
    return r.fulfill({ json: /frete_tabelas/.test(u) ? tab : /frete_transp/.test(u) ? [{ id: 't', nome: 'ANDORINHA' }] : [] }); });
  await page.route(/supabase\.co\/realtime/, r => r.abort());
  await page.route(/\/api\/rastreio/, r => r.fulfill({ json: { ok: true, linhas: [] } }));
  await page.goto(process.argv[2]);
  await page.waitForFunction(() => typeof window.doLogin === 'function', null, { timeout: 30000 });
  await page.fill('#l-email', 'a@b.c'); await page.fill('#l-senha', 'x'); await page.click('.login-btn');
  await page.waitForSelector('#app-root', { state: 'visible' }); await page.waitForTimeout(1200);
  await page.evaluate(() => goView('cotacoes')); await page.waitForTimeout(200);
  await page.click('text=Cotar por texto'); await page.waitForTimeout(200);
  await page.fill('#cot-texto', TEXTO);
  await page.click('text=Ler texto e preencher'); await page.waitForTimeout(300);
  console.log('LIDO:', (await page.textContent('#cot-lido')).replace(/\s+/g, ' ').slice(0, 200));
  console.log('CAMPOS:', await page.evaluate(() => ['origem', 'uf_origem', 'destino', 'uf_destino', 'valor_mercadoria', 'peso_kg', 'volume_m3'].map(k => k + '=' + document.getElementById('fm-' + k)?.value).join(' ')));
  console.log('OBS:', await page.inputValue('#fm-observacoes'));
  await page.selectOption('#fm-transportadora', 'ANDORINHA'); await page.dispatchEvent('#fm-transportadora', 'change'); await page.waitForTimeout(200);
  console.log('PREVIEW:', (await page.textContent('#fpreview')).replace(/\s+/g, ' ').slice(0, 300));
  await page.locator('#modal .modal').screenshot({ path: require('os').tmpdir() + '/fretes-teste.png' });
  await browser.close();
})().catch(e => { console.error('FALHOU', e.message); process.exit(1); });
