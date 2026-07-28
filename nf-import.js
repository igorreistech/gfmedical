(function () {
    var PDF_JS_SRCS = [
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/legacy/build/pdf.min.js',
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
        'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js'
    ];
    var PDF_JS_WORKERS = [
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/legacy/build/pdf.worker.min.js',
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
        'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
    ];

    function carregarPdfJs() {
        if (window.pdfjsLib) return Promise.resolve();
        function tentarCarregar(idx) {
            if (idx >= PDF_JS_SRCS.length) return Promise.reject(new Error('Falha ao carregar PDF.js (todas as fontes falharam)'));
            return new Promise(function (ok, fail) {
                var timer = setTimeout(function () { fail(new Error('timeout')); }, 12000);
                var s = document.createElement('script');
                s.src = PDF_JS_SRCS[idx];
                s.onload = function () {
                    clearTimeout(timer);
                    try { pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKERS[idx]; ok(); }
                    catch (e) { fail(e); }
                };
                s.onerror = function () { clearTimeout(timer); fail(new Error('onerror')); };
                document.head.appendChild(s);
            }).catch(function() { return tentarCarregar(idx + 1); });
        }
        return tentarCarregar(0);
    }

    // Converte dd/mm/yy, dd/mm/yyyy, dd-mm-yyyy ou dd.mm.yyyy para yyyy-mm-dd
    function converterData(raw) {
        if (!raw) return null;
        var s = raw.replace(/[;,\s]/g, '').replace(/[\/\-\.]/g, '');
        if (s.length === 6) return '20' + s.slice(4,6) + '-' + s.slice(2,4) + '-' + s.slice(0,2);
        if (s.length === 8) return s.slice(4) + '-' + s.slice(2,4) + '-' + s.slice(0,2);
        return null;
    }

    function parsearTextoNF(raw) {
        // Normaliza mantendo quebras de linha reais
        var t = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ');

        // Debug: loga no console o texto extraído
        console.log('[PDF NF] Texto completo extraído:\n' + t);

        var paciente = null, hospital = null, data = null, medico = null, convenio = null;

        // ── Busca :: diretamente no texto (formato GF Medical) ──
        // Campo pode ter valor na mesma linha ou na linha seguinte
        function campo(label) {
            var re1 = new RegExp('::\\s*' + label + '\\s*:\\s*([\\s\\S]+?)(?=\\s*\\||\\s*::|INFORMA[CÇ]|$)', 'i');
            var m = t.match(re1);
            if (m && m[1].trim()) return m[1].replace(/\n/g, ' ').trim();
            var re2 = new RegExp('(?:^|[ \\t])' + label + '[ \\t]*:[ \\t]*([^\\n|]{2,80})', 'im');
            m = t.match(re2);
            return m ? m[1].trim() : null;
        }

        hospital  = campo('Local');
        convenio  = campo('Conv.nio');
        var medRaw = campo('M.dico');
        var pacRaw = campo('Paciente');
        var datRaw = campo('Data(?:\\s*d[ae])?\\s*[ _]?[Cc]irurgia');

        if (convenio) convenio = convenio.replace(/\s*[-–]\s*CONVENIO\s*$/i, '').trim();
        if (medRaw)   medico   = medRaw.replace(/\s*CRM[:\s].*/i, '').trim();
        if (pacRaw)   paciente = pacRaw.trim();
        if (datRaw) {
            var dm = datRaw.match(/\d{2}[\/\-\.]\d{2}[\/\-\.]\d{2,4}/);
            if (dm) data = converterData(dm[0]);
        }

        // ── Número da NF ──
        var nf = null;
        var mNf = t.match(/N[°º\s\.]{0,3}(\d[\d.]{2,})/i);
        if (mNf) nf = mNf[1].replace(/\./g, '');

        // ── Nº NF de Compra — vem embutido na chave de acesso da NF-e referenciada
        // no CT-e (seção "DOCUMENTOS ORIGINÁRIOS"). Duas transportadoras já vistas
        // usam formatos diferentes: "NF-e <CNPJ> <chave 44 dígitos>" (com CNPJ no
        // meio) ou "NFe CHAVE: <chave 44 dígitos>" (direto). O CNPJ é opcional aqui.
        // O número da nota é os 9 dígitos entre a posição 26 e 34 da chave (padrão
        // oficial da chave de acesso NFe/CTe), sem os zeros à esquerda.
        // Ex.: ...550010000013311227859232 → dígitos 000001331 → NF nº 1331.
        var nfCompra = null;
        var mNfCompraChave = t.match(/NF-?e\s*(?:CHAVE\s*:\s*)?(?:\d{14}\s+)?(\d{44})/i);
        if (mNfCompraChave) {
            var numNfEmbutido = mNfCompraChave[1].slice(25, 34).replace(/^0+/, '');
            nfCompra = numNfEmbutido || '0';
        }

        // ── CT-e — número operacional (AWB), que é o número que de fato identifica
        // o conhecimento de transporte na prática (rótulo "NÚMERO OPERACIONAL" ou
        // "NÚMERO OPERACIONAL DO CONHECIMENTO AÉREO"). O AWB IATA tem sempre 11
        // dígitos (3 do prefixo da companhia + 8 de série), mas a formatação varia
        // por transportadora: "127-4689 2333" (com hífen/espaço) ou "57759653786"
        // (corrido). Em vez de fixar o formato, captura exatamente 11 dígitos
        // (tolerando hífen/espaço isolado entre eles) — isso impede vazar pros
        // dígitos de blocos vizinhos (ex.: chave de acesso colada na mesma linha
        // quando o PDF tem colunas muito próximas), já que para exatamente no 11º. ──
        var cte = null;
        var mCteAwb = t.match(/N[ÚU]MERO OPERACIONAL(?:\s+DO\s+CONHECIMENTO\s+A[ÉE]REO)?[^\n]*\n?\s*((?:\d[\s\-]?){10}\d)\b/i);
        if (mCteAwb) cte = mCteAwb[1].trim();
        if (!cte) {
            var mCte = t.match(/CT-?e\b[^\d]{0,25}(\d{3,9})/i) || t.match(/CONHECIMENTO\s+DE\s+TRANSPORTE[^\d]{0,30}(\d{3,9})/i);
            if (mCte) cte = mCte[1].replace(/\./g, '');
        }

        // ── Emitente do CT-e (a transportadora que emitiu o documento) — usado como
        // Transportadora. O rótulo do CNPJ varia por layout ("CNPJ:" só, ou "CNPJ/
        // CPF:" igual ao do remetente/destinatário), então em vez de ancorar no
        // rótulo, ancora no sufixo jurídico do nome (S/A, LTDA, EIRELI...), que só a
        // transportadora tem tão cedo no documento — busca só ANTES do primeiro
        // "REMETENTE" pra não pegar o nome de outra parte que também termine assim. ──
        var coletaTransportadora = null;
        // Busca "REMETENTE:" (com dois-pontos) e não só "REMETENTE" — documentos têm
        // um cabeçalho genérico "EXPEDIDOR/REMETENTE" (sem dois-pontos) bem no topo,
        // antes até do nome da transportadora, que faria a área de busca cortar cedo demais.
        var idxRemetenteBusca = t.search(/REMETENTE\s*:/i);
        var areaEmitente = idxRemetenteBusca > 0 ? t.slice(0, idxRemetenteBusca) : t;
        var mEmitenteCte = areaEmitente.match(/([A-ZÀ-Ú][A-ZÀ-Ú0-9À-Ú&.,\/\- ]{3,70}\b(?:S\/?A|LTDA\.?|EIRELI|M\.?E\.?|EPP))\b/);
        if (mEmitenteCte) coletaTransportadora = mEmitenteCte[1].replace(/\s{2,}/g, ' ').trim();

        // ── Fornecedor = REMETENTE do CT-e (quem envia a mercadoria, não a
        // transportadora que emitiu o documento). O rótulo pode vir com ou sem
        // espaço antes dos dois-pontos ("REMETENTE:" ou "REMETENTE :"). O layout do
        // DACTE costuma pôr REMETENTE e DESTINATÁRIO lado a lado na mesma linha
        // (colunas), então a captura para no próximo rótulo, não só na quebra de linha.
        var coletaFornecedor = null;
        var mRemetente = t.match(/REMETENTE\s*:\s*([A-ZÀ-Ú][A-ZÀ-Ú0-9À-Ú\s&.,'\-]*?)(?=\s+[A-ZÀ-Ú]{3,25}\s*:|\s*\n|$)/i);
        if (mRemetente) coletaFornecedor = mRemetente[1].trim();
        if (!coletaFornecedor) coletaFornecedor = coletaTransportadora;

        // ── Chave de acesso (44 dígitos) — DANFE/CT-e, usada pro rastreio SSW.
        // "CHAVE DE ACESSO" costuma vir num cabeçalho de coluna junto com outros
        // rótulos (NÚMERO OPERACIONAL, DATA...), com os valores de todas as colunas
        // amontoados na linha seguinte — não necessariamente começando por ela. Por
        // isso procura, numa janela depois do rótulo, o formato em 11 grupos de 4
        // dígitos separados por ponto OU espaço (varia por transportadora: "3326.
        // 0707.5756...2951" ou "3524 1009 2962...7867") — esse agrupamento é
        // exclusivo da chave formatada e evita pegar a chave "corrida" (sem
        // separador) de uma NF-e referenciada em "DOCUMENTOS ORIGINÁRIOS". ──
        var coletaChaveAcesso = null;
        // O separador precisa ser CONSISTENTE (só ponto OU só espaço) em todos os 10
        // grupos — uma classe de caracteres [.\s] misturando os dois deixava o regex
        // "engatar" no meio de outro número vizinho (ex.: fim do AWB + início da
        // chave), formando um falso início de 11 grupos.
        var mChavePontuada = t.match(/CHAVE\s+DE\s+ACESSO[\s\S]{0,150}?(?<!\d)((?:\d{4}\.){10}\d{4}|(?:\d{4}\s){10}\d{4})/i);
        if (mChavePontuada) coletaChaveAcesso = mChavePontuada[1].replace(/\D/g, '');
        if (!coletaChaveAcesso) {
            var mChaveLabel = t.match(/CHAVE\s+DE\s+ACESSO[^\n]*\n\s*((?:\d[\s.]?){44,60})/i);
            if (mChaveLabel) {
                var soDigitos = mChaveLabel[1].replace(/\D/g, '');
                if (soDigitos.length >= 44) coletaChaveAcesso = soDigitos.slice(0, 44);
            }
        }
        if (!coletaChaveAcesso) {
            var mChave44 = t.match(/\b\d{44}\b/);
            if (mChave44) coletaChaveAcesso = mChave44[0];
        }

        // ── Data de emissão da NF ──
        // Pega a última data dd/mm/yyyy antes do primeiro "Lote:" (área do cabeçalho).
        // Datas de fabricação/validade dos lotes ficam depois de "Lote:" e são ignoradas.
        var dataEmissao = null;
        var idxLote = t.search(/Lote\s*:/i);
        var areaHeader = idxLote > 0 ? t.slice(0, idxLote) : t;
        var datasHeader = areaHeader.match(/\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}/g);
        if (datasHeader) dataEmissao = converterData(datasHeader[datasHeader.length - 1]);

        // ── Valor total da nota ──
        // Na extração posicional, o rótulo fica numa linha e os valores na linha seguinte;
        // o total é o ÚLTIMO número da linha de valores (coluna mais à direita).
        var valor = null;
        var mValLine = t.match(/VALOR TOTAL DA NOTA[^\n]*\n([^\n]+)/i);
        if (mValLine) {
            var nums = mValLine[1].match(/[\d]+(?:\.[\d.]*)?(?:,\d{2})/g);
            if (nums) valor = parseFloat(nums[nums.length - 1].replace(/\./g,'').replace(',','.'));
        }
        if (!valor) {
            var sepValor = '[:\\s]*R?\\$?\\s*';
            var valorPatterns = [
                new RegExp('VALOR TOTAL DA NOTA' + sepValor + '([\\d.,]+)', 'i'),
                new RegExp('TOTAL DA NOTA FISCAL' + sepValor + '([\\d.,]+)', 'i'),
                new RegExp('VALOR L[IÍ]QUIDO DA NOTA' + sepValor + '([\\d.,]+)', 'i'),
                new RegExp('VALOR TOTAL DO DOCUMENTO' + sepValor + '([\\d.,]+)', 'i'),
                new RegExp('VALOR A PAGAR' + sepValor + '([\\d.,]+)', 'i'),
                new RegExp('VALOR TOTAL' + sepValor + '([\\d.,]+)', 'i'),
            ];
            for (var vi = 0; vi < valorPatterns.length; vi++) {
                var mVal = t.match(valorPatterns[vi]);
                if (mVal) { valor = parseFloat(mVal[1].replace(/\./g,'').replace(',','.')); break; }
            }
        }

        // ── Fallback: regex genéricas (outros layouts de NF) ──
        function primeiro(patterns) {
            for (var i = 0; i < patterns.length; i++) {
                var m = t.match(patterns[i]);
                if (m && m[1] && m[1].trim().length > 1) return m[1].trim();
            }
            return null;
        }

        if (!paciente) paciente = primeiro([
            /PACIENTE[:\s]+([A-ZÀ-ÿa-z\s]{4,60})(?=\s*(?:IDADE|SEXO|CPF|DATA|RG|\d{2}[\/\-]|\n\n))/i,
            /BENEFICI[AÁ]RIO[:\s]+([A-ZÀ-ÿa-z\s]{4,60})(?=\s*(?:CPF|RG|DATA|\n\n))/i,
        ]);
        if (!hospital) hospital = primeiro([
            /TOMADOR[:\s]+([A-ZÀ-ÿa-z\s&.,'\-]{3,80})(?=\s*(?:CNPJ|CPF|END|RUA|AV\.))/i,
            /DESTINAT[AÁ]RIO[:\s]+([A-ZÀ-ÿa-z\s&.,'\-]{3,80})(?=\s*(?:CNPJ|CPF|END))/i,
        ]);
        if (!data) {
            var rawData = primeiro([
                /DATA(?:\s*D[AE])?\s*CIRURGIA[\s:]*\n?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{2,4})/i,
                /CIRURGIA[\s:]*\n?\s*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{2,4})/i,
            ]);
            if (rawData) data = converterData(rawData);
        }
        if (!medico) medico = primeiro([
            /M[EÉ]DICO[:\s]+(?:DR\.?\s*|DRA\.?\s*)?([A-ZÀ-ÿa-z\s]{4,60})(?=\s*(?:CRM|CPF|\n))/i,
            /(?:DR\.|DRA\.)\s+([A-ZÀ-ÿa-z\s]{5,60})(?=\s*(?:CRM|CPF|\n))/i,
        ]);
        if (!convenio) convenio = primeiro([
            /CONV[EÊ]NIO[:\s]+([A-ZÀ-ÿa-z\s&.']{3,60})(?=\s*(?:\n|CART[AÃ]O|MAT|\d))/i,
            /PLANO[:\s]+([A-ZÀ-ÿa-z\s&.']{3,60})(?=\s*(?:\n|CART[AÃ]O|\d))/i,
        ]);

        return { paciente: paciente, hospital: hospital, data: data, medico: medico, convenio: convenio, nf: nf, valor: valor, dataEmissao: dataEmissao, cte: cte, coletaChaveAcesso: coletaChaveAcesso, coletaFornecedor: coletaFornecedor, coletaTransportadora: coletaTransportadora, nfCompra: nfCompra };
    }

    // Retorna array de { code, desc, lote, qty }
    function parsearProdutos(raw) {
        var t = raw.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ');
        var produtos = [];

        // Extrair quantidades dos rows NCM (NCM CST CFOP UNID QTDE ...)
        // Padrão: \d{4}.\d{2}.\d{2} \d{3} \d.\d{3} PC 2,00 ...
        var qtdes = [];
        var reQtd = /\d{4}\.\d{2}\.\d{2}\s+\d{3,4}\s+\d+\.\d{3}\s+\w{2,3}\s+(\d+(?:,\d+)?)/g;
        var mq;
        while ((mq = reQtd.exec(t)) !== null) {
            qtdes.push(Math.round(parseFloat(mq[1].replace(',', '.'))));
        }

        // Extrair produtos a partir de cada ocorrência de "Cód.Alt.:"
        // Antes de cada Cód.Alt.: temos a descrição e os lotes do produto
        var partes = t.split(/C.d\.Alt\./i);
        var idx = 0;
        for (var i = 0; i < partes.length - 1; i++) {
            var antes = partes[i];
            var depois = partes[i + 1];

            // Código: primeiro token após "Cód.Alt.:"
            var mCod = depois.match(/^[:\s]*([\w.\-\/]+)/);
            if (!mCod) continue;
            var code = mCod[1].trim();

            // Lotes: cada "Lote: XXXX x<n>" vira um item separado
            var reLote = /Lote:\s*([\w\-\/]+)\s*(?:x\s*(\d+))?/gi;
            var lotes = [];
            var ml;
            while ((ml = reLote.exec(antes)) !== null) {
                lotes.push({ lote: ml[1], qty: ml[2] ? parseInt(ml[2]) : null });
            }

            // Descrição: último grupo de texto em MAIÚSCULAS antes do primeiro "Lote:"
            var parteAntesLote = antes.split(/Lote:/i)[0];
            parteAntesLote = parteAntesLote
                .replace(/Registro com Validade Indeterminada/gi, ' ')
                .replace(/Dt\. Validade:[^\n]*/gi, ' ')
                .replace(/Dt\. Fab\.[^\n]*/gi, ' ')
                .replace(/MS:\s*\d[\d.]*/gi, ' ')
                .replace(/[-–]\s*$/, '')
                .trim();
            var capsMatches = parteAntesLote.match(/[A-Z]{2}[A-Z0-9\s\.\-\/\(\)]{3,}/g);
            var desc = capsMatches ? capsMatches[capsMatches.length - 1].replace(/\s+/g, ' ').trim() : '';

            if (!desc || lotes.length === 0) continue;

            var totalQty = qtdes[idx] !== undefined ? qtdes[idx] : lotes.length;
            lotes.forEach(function(l) {
                produtos.push({
                    code: code,
                    desc: desc,
                    lote: l.lote,
                    qty: l.qty !== null ? l.qty : Math.round(totalQty / lotes.length)
                });
            });
            idx++;
        }

        return produtos;
    }

    function preencherFormularioPdf(dados, produtos) {
        // No modo Retirada de Material só interessam os campos de coleta
        // (cte/chave/fornecedor/nfCompra) — os campos de cirurgia (hospital, NF,
        // médico, convênio...) ficam ocultos nesse modo mas continuam graváveis
        // via JS, então preenchê-los aqui só suja o registro salvo com dado de
        // outro contexto (ex.: "hospital" pegando o destinatário do CT-e).
        var fStatusEl = document.getElementById('f-status');
        var emModoColeta = !!fStatusEl && fStatusEl.value === 'coleta_urgente';

        if (!emModoColeta && dados.hospital) {
            var h = document.getElementById('f-hospital');
            if (h) { h.value = dados.hospital; h.dispatchEvent(new Event('input')); }
        }
        if (!emModoColeta && dados.data) {
            var d = document.getElementById('f-data');
            if (d) {
                d.value = dados.data;
                d.dispatchEvent(new Event('change'));
                d.dispatchEvent(new Event('input'));
            }
        }
        if (!emModoColeta && dados.paciente) {
            var p = document.getElementById('f-paciente');
            if (p) p.value = dados.paciente;
        }
        if (!emModoColeta && dados.medico) {
            var sel = document.getElementById('f-medico');
            if (sel) {
                var nomeU = dados.medico.toUpperCase().replace(/\s+/g, ' ').trim();
                var opts = Array.from(sel.options);
                var match = opts.find(function (o) { return o.value.toUpperCase() === nomeU; });
                if (match) {
                    sel.value = match.value;
                    sel.dispatchEvent(new Event('change'));
                } else {
                    sel.value = '__outro';
                    sel.dispatchEvent(new Event('change'));
                    var om = document.getElementById('f-outro-medico');
                    if (om) om.value = dados.medico;
                }
            }
        }
        if (!emModoColeta && dados.convenio) {
            var selC = document.getElementById('f-convenio');
            if (selC) {
                var convU = dados.convenio.toUpperCase().replace(/\s+/g, ' ').trim();
                var optsC = Array.from(selC.options);
                var matchC = optsC.find(function (o) {
                    var tv = o.text.toUpperCase();
                    return tv === convU || tv.includes(convU) || convU.includes(tv);
                });
                if (matchC && matchC.value && matchC.value !== '' && matchC.value !== '__outro') {
                    selC.value = matchC.value;
                } else {
                    selC.value = '__outro';
                    var gOC = document.getElementById('g-outro-conv');
                    if (gOC) gOC.style.display = 'block';
                    var fOC = document.getElementById('f-outro-convenio');
                    if (fOC) fOC.value = dados.convenio;
                }
            }
        }
        if (!emModoColeta && dados.nf) {
            var fnf = document.getElementById('f-nf');
            if (fnf) fnf.value = dados.nf;
        }
        if (!emModoColeta && dados.dataEmissao) {
            var fde = document.getElementById('f-nf-data');
            if (fde) fde.value = dados.dataEmissao;
        }
        if (!emModoColeta && dados.valor) {
            var fval = document.getElementById('f-valor');
            if (fval) fval.value = dados.valor;
        }
        if (dados.cte) {
            var fcte = document.getElementById('f-cte');
            if (fcte) fcte.value = dados.cte;
        }
        if (dados.coletaChaveAcesso) {
            var fchave = document.getElementById('f-coleta-chave-acesso');
            if (fchave) fchave.value = dados.coletaChaveAcesso;
        }
        if (dados.coletaFornecedor) {
            var ffornecedor = document.getElementById('f-coleta-fornecedor');
            if (ffornecedor) ffornecedor.value = dados.coletaFornecedor;
        }
        if (dados.coletaTransportadora) {
            var ftransp = document.getElementById('f-coleta-transportadora');
            if (ftransp) ftransp.value = dados.coletaTransportadora;
        }
        if (dados.nfCompra) {
            var fnfCompra = document.getElementById('f-nf-compra');
            if (fnfCompra) fnfCompra.value = dados.nfCompra;
        }
        // Preencher itens
        if (produtos && produtos.length > 0 && typeof addItemRow === 'function') {
            var container = document.getElementById('itens-list');
            if (container) {
                container.innerHTML = '';
                produtos.forEach(function (p) {
                    var nome = (window._prodMap && window._prodMap[p.code.toUpperCase()]) || '';
                    addItemRow(p.code, nome, p.qty, p.lote);
                });
            }
        }
    }

    window.importarPdfNF = async function (input) {
        var file = input.files[0];
        if (!file) return;
        var status = document.getElementById('pdf-import-status');
        var result = document.getElementById('pdf-import-result');
        status.textContent = '⏳ Lendo PDF...';
        result.style.display = 'none';
        try {
            await carregarPdfJs();
            var buf = await file.arrayBuffer();
            var loadTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
            loadTask.onPassword = function(updateCb) { updateCb(''); };
            var pdf = await loadTask.promise;
            var texto = '';
            for (var i = 1; i <= pdf.numPages; i++) {
                try {
                    var page = await pdf.getPage(i);
                    var content = await page.getTextContent({ includeMarkedContent: false });
                    var items = (content && content.items || []).filter(function(it){ return it && typeof it.str === 'string' && it.str !== ''; });
                    if (!items.length) { texto += '\n'; continue; }
                    // Ordenar por y desc (topo→base) depois x asc (esq→dir)
                    items.sort(function(a, b){
                        var dy = (b.transform && b.transform[5] || 0) - (a.transform && a.transform[5] || 0);
                        if (Math.abs(dy) > 3) return dy;
                        return (a.transform && a.transform[4] || 0) - (b.transform && b.transform[4] || 0);
                    });
                    var pageText = items[0].str;
                    var prevY = items[0].transform && items[0].transform[5] || 0;
                    var prevEnd = (items[0].transform && items[0].transform[4] || 0) + (items[0].width || 0);
                    for (var j = 1; j < items.length; j++) {
                        var it = items[j];
                        var curX = it.transform && it.transform[4] || 0;
                        var curY = it.transform && it.transform[5] || 0;
                        var gap = curX - prevEnd;
                        if (Math.abs(curY - prevY) > 3) {
                            pageText += '\n';
                        } else if (gap >= 1) {
                            pageText += ' ';
                        }
                        pageText += it.str;
                        prevY = curY;
                        prevEnd = curX + (it.width || 0);
                    }
                    texto += pageText + '\n';
                } catch(pageErr) {
                    console.warn('[PDF NF] Erro na página ' + i + ':', pageErr);
                    texto += '\n';
                }
            }
            var dados = parsearTextoNF(texto);
            var produtos = parsearProdutos(texto);
            preencherFormularioPdf(dados, produtos);

            var fStatusChk = document.getElementById('f-status');
            var emColetaChk = !!fStatusChk && fStatusChk.value === 'coleta_urgente';
            var labels = emColetaChk
                ? { cte: 'Nº CTE', coletaFornecedor: 'Fornecedor', coletaTransportadora: 'Transportadora', nfCompra: 'Nº NF de Compra', coletaChaveAcesso: 'Chave de Acesso (rastreio)' }
                : { paciente: 'Paciente', hospital: 'Hospital', data: 'Data Cirurgia', medico: 'Médico', convenio: 'Convênio', nf: 'Nº NF', dataEmissao: 'Emissão NF', valor: 'Valor Total' };
            var html = '';
            Object.keys(labels).forEach(function (k) {
                var v = dados[k];
                if (v) html += '<span style="color:#4ade80;">✔ ' + labels[k] + ': <b>' + v + '</b></span><br>';
                else    html += '<span style="color:#f59e0b;">– ' + labels[k] + ': não encontrado</span><br>';
            });
            if (!emColetaChk) {
                if (produtos.length > 0) {
                    html += '<span style="color:#4ade80;">✔ Produtos: <b>' + produtos.length + ' item(ns) importado(s)</b></span><br>';
                } else {
                    html += '<span style="color:#f59e0b;">– Produtos: não encontrados</span><br>';
                }
            }
            var faltouAlgo = emColetaChk
                ? (!dados.cte || !dados.coletaFornecedor || !dados.coletaTransportadora || !dados.nfCompra)
                : (!dados.medico || !dados.convenio || !dados.nf || !dados.valor || produtos.length === 0);
            if (faltouAlgo) {
                var dbIdx = texto.toUpperCase().indexOf('COMPLEMENTAR');
                var dbTxt = dbIdx >= 0
                    ? texto.slice(Math.max(0, dbIdx - 50), dbIdx + 3000)
                    : texto.slice(-3000);
                html += '<p style="margin:8px 0 2px;color:#8a9e97;font-size:0.74rem;">Texto extraído (seção complementar):</p>' +
                    '<textarea readonly style="width:100%;height:160px;background:#0a0f0d;color:#8a9e97;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:8px;font-family:monospace;font-size:0.72rem;resize:vertical;display:block;">' +
                    dbTxt.replace(/</g,'&lt;') + '</textarea>';
            }
            result.innerHTML = html;
            result.style.display = 'block';
            var totalCampos = Object.keys(labels).length;
            var nok = Object.keys(labels).filter(function (k) { return !dados[k]; }).length;
            status.textContent = (totalCampos - nok) + '/' + totalCampos + ' campos' + (emColetaChk ? '' : ' + ' + produtos.length + ' produto(s)');
        } catch (err) {
            var msg = err && err.message ? err.message : String(err);
            var dica = msg.toLowerCase().includes('password') || msg.toLowerCase().includes('encrypt')
                ? '⚠ PDF protegido por senha — não é possível ler automaticamente.'
                : msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('falha') || msg.toLowerCase().includes('load')
                    ? '⚠ Falha ao carregar leitor de PDF. Verifique sua conexão e tente novamente.'
                    : '⚠ Erro ao ler PDF: ' + msg;
            status.textContent = dica;
            console.error('PDF NF import:', err);
        }
        input.value = '';
    };
})();
