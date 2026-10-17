// Lembrete diário: transferências entre filiais ainda não devolvidas (nos dois sentidos).
// Aparece uma vez por dia (por navegador e filial) depois do login, no Monitor, Compras e Fretes.
// Só LÊ a sessão já salva pela página (não renova token), para não interferir no login dela.
(function () {
  if (window.__avisoTransf) return; window.__avisoTransf = true;
  var BR = {
    cgr: { url: 'https://rqzqetfoxiutabsooqqn.supabase.co', key: 'sb_publishable_P3EggMdsxQUoKnX_pLMaRQ_ZrGEYpIP', ref: 'rqzqetfoxiutabsooqqn', nome: 'Campo Grande' },
    cba: { url: 'https://cyztucqhfotqhauavepu.supabase.co', key: 'sb_publishable_LnJYIlIDvTF6l4MMQwZ-Kg_uCBXnZRM', ref: 'cyztucqhfotqhauavepu', nome: 'Cuiabá' }
  };
  var fixa = (window.FRETES_CONFIG || {}).filialFixa, code = fixa || window._fretesBranch;
  try { code = code || localStorage.getItem('gf_branch') || localStorage.getItem('gf_fretes_branch'); } catch (e) {}
  code = code === 'cba' ? 'cba' : 'cgr';
  var outra = code === 'cba' ? 'cgr' : 'cba', F = code.toUpperCase();
  var hoje = new Date().toISOString().slice(0, 10), chaveDia = 'gf_aviso_transf_' + code;
  try { if (localStorage.getItem(chaveDia) === hoje) return; } catch (e) { return; }

  function token() {
    var chaves = fixa ? ['sb-' + BR[code].ref + '-auth-token'] : ['sb-' + code + '-auth', 'sb-' + BR[code].ref + '-auth-token'];
    for (var i = 0; i < chaves.length; i++) {
      try { var s = JSON.parse(localStorage.getItem(chaves[i]) || 'null'); s = s && (s.currentSession || s);
        if (s && s.access_token && (!s.expires_at || s.expires_at * 1000 > Date.now() + 60000)) return s.access_token; } catch (e) {}
    }
    return null;
  }
  function telaLivre() {
    return !document.querySelector('.login-overlay:not(.hidden), .modal-ov.open, .modal-overlay.open, #modalNomeOp.open') &&
      !(document.getElementById('login-screen') && getComputedStyle(document.getElementById('login-screen')).display !== 'none');
  }
  var tentativas = 0;
  function esperar() {
    if (++tentativas > 120) return;                       // desiste depois de ~30 min sem login
    var tk = token();
    if (!tk || !telaLivre()) { setTimeout(esperar, 15000); return; }
    buscar(tk);
  }
  async function sel(tab, tk) {
    var out = [];
    for (var de = 0; ; de += 1000) {
      var r = await fetch(BR[code].url + '/rest/v1/' + tab + '?select=*&filial=eq.' + F, { headers: { apikey: BR[code].key, Authorization: 'Bearer ' + tk, Range: de + '-' + (de + 999) } });
      if (!r.ok) throw new Error(tab + ' ' + r.status);
      var rows = await r.json(); out = out.concat(rows); if (rows.length < 1000) break;
    }
    return out;
  }
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
  var norm = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\/BR$/, ''); };
  async function buscar(tk) {
    var its, bx;
    try { its = await sel('transf_itens', tk); bx = await sel('transf_baixas', tk); } catch (e) { return; }   // tabelas ainda não criadas
    // mesma conta da tela de Transferências: por produto, em ordem de data, uma direção compensa a outra
    var baix = {}; bx.forEach(function (b) { baix[b.item_id] = (baix[b.item_id] || 0) + num(b.quantidade); });
    its.forEach(function (i) { i.livre = Math.max(0, num(i.quantidade) - (baix[i.id] || 0)); });
    var filas = {};
    its.slice().sort(function (a, b) { return String(a.data_emissao || '').localeCompare(String(b.data_emissao || '')) || num(a.numero) - num(b.numero); }).forEach(function (m) {
      var k = norm(m.codigo_alt || m.codigo); filas[k] = filas[k] || { envio: [], retorno: [] };
      var lot = (m.lotes || []).map(function (l) { return norm(l.lote); }), op = filas[k][m.tipo === 'envio' ? 'retorno' : 'envio'];
      var comp = function (e) { if (m.livre <= 0 || e.livre <= 0) return; var t = Math.min(m.livre, e.livre); m.livre -= t; e.livre -= t; };
      op.filter(function (e) { return (e.lotes || []).some(function (l) { return lot.indexOf(norm(l.lote)) >= 0; }); }).forEach(comp);
      op.forEach(comp);
      if (m.livre > 0) filas[k][m.tipo].push(m);
    });
    var hojeMs = Date.parse(hoje), lado = function (tipo) {
      var l = its.filter(function (i) { return i.tipo === tipo && i.livre > 0; }).map(function (i) { i.dias = i.data_emissao ? Math.max(0, Math.floor((hojeMs - Date.parse(i.data_emissao)) / 864e5)) : 0; return i; })
        .sort(function (a, b) { return b.dias - a.dias; });
      return { l: l, un: l.reduce(function (a, i) { return a + i.livre; }, 0), valor: l.reduce(function (a, i) { return a + i.livre * num(i.valor_unit); }, 0), dias: l.length ? l[0].dias : 0 };
    };
    var devolver = lado('retorno'), receber = lado('envio');
    if (!devolver.l.length && !receber.l.length) { try { localStorage.setItem(chaveDia, hoje); } catch (e) {} return; }
    mostrar(devolver, receber);
  }
  var brl = function (v) { return num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
  var q = function (v) { return num(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 }); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function bloco(t, cor, titulo, sub) {
    if (!t.l.length) return '';
    return '<div style="border:1px solid ' + cor + ';border-left:4px solid ' + cor + ';border-radius:10px;padding:10px 12px;margin-top:10px;background:#fff">' +
      '<div style="font-weight:700;color:#1f2937">' + titulo + '</div>' +
      '<div style="font-size:12px;color:#475569;margin:2px 0 6px">' + q(t.un) + ' un · ' + brl(t.valor) + ' · mais antigo há <b style="color:' + (t.dias > 30 ? '#dc2626' : '#1f2937') + '">' + t.dias + ' dia(s)</b>' + (sub || '') + '</div>' +
      t.l.slice(0, 6).map(function (i) { return '<div style="font-size:12px;color:#334155;padding:2px 0;border-top:1px dashed #e2e8f0">• <b>' + esc(i.codigo_alt || i.codigo) + '</b> ' + esc(String(i.descricao || '').slice(0, 48)) + ' — <b>' + q(i.livre) + '</b> <span style="color:#64748b">(NF ' + num(i.numero).toLocaleString('pt-BR') + ', ' + i.dias + ' d)</span></div>'; }).join('') +
      (t.l.length > 6 ? '<div style="font-size:11px;color:#64748b;margin-top:3px">+ ' + (t.l.length - 6) + ' item(ns)</div>' : '') + '</div>';
  }
  function mostrar(devolver, receber) {
    var ov = document.createElement('div');
    ov.id = 'aviso-transf';
    ov.style.cssText = 'position:fixed;inset:0;z-index:20000;background:rgba(10,42,24,.45);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,system-ui,sans-serif';
    ov.innerHTML = '<div style="background:#f6fbf8;border-radius:16px;max-width:560px;width:100%;max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.25);padding:18px 20px">' +
      '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:22px">🔁</span><div style="font-weight:800;font-size:16px;color:#0f3d26">Lembrete do dia — transferências entre filiais</div>' +
      '<button id="aviso-transf-x" style="margin-left:auto;border:0;background:transparent;font-size:18px;cursor:pointer;color:#64748b" title="Fechar">✕</button></div>' +
      '<div style="font-size:13px;color:#334155;margin-top:4px">Produtos enviados para cirurgia que ainda não voltaram. Devolva o que não foi usado ou informe o paciente/pedido dos que foram usados.</div>' +
      bloco(devolver, '#d97706', '📥 GF ' + BR[code].nome + ' tem para devolver à GF ' + BR[outra].nome) +
      bloco(receber, '#dc2626', '📤 GF ' + BR[outra].nome + ' tem para devolver à GF ' + BR[code].nome) +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;justify-content:flex-end">' +
      '<button id="aviso-transf-ok" style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:8px 12px;cursor:pointer">Ok, lembrar amanhã</button>' +
      '<button id="aviso-transf-ver" style="border:0;background:#1a7a4a;color:#fff;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer">🔁 Abrir transferências</button></div></div>';
    document.body.appendChild(ov);
    var fechar = function () { try { localStorage.setItem(chaveDia, hoje); } catch (e) {} ov.remove(); };
    document.getElementById('aviso-transf-x').onclick = fechar;
    document.getElementById('aviso-transf-ok').onclick = fechar;
    document.getElementById('aviso-transf-ver').onclick = function () { fechar(); window.open('transferencias.html' + (fixa ? '' : '?filial=' + code), '_blank'); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(esperar, 5000); });
  else setTimeout(esperar, 5000);
})();
