// ─── DATA STORE ───
let procedimentos = []; // preenchido em tempo real pelo Firebase
let nextId = 1;

// ─── AUDIO CONTEXT COMPARTILHADO ───
let _sharedAudioCtx = null;

function getAudioCtx() {
    if (!_sharedAudioCtx || _sharedAudioCtx.state === 'closed') {
        _sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_sharedAudioCtx.state === 'suspended') {
        _sharedAudioCtx.resume();
    }
    return _sharedAudioCtx;
}

// ─── DESBLOQUEIO AUTOMÁTICO DE ÁUDIO SEM INTERAÇÃO ───
// Estratégia: toca um buffer de 1 sample silencioso em loop para manter o contexto ativo.
// Navegadores modernos permitem isso se o site for adicionado como PWA ou se a política
// de autoplay for mais permissiva (ex: Chrome com flag, ou uso local via file://).
// Para garantia máxima, também tenta resume() a cada segundo até conseguir.
let _audioKeepAlive = null;
function _iniciarKeepAlive(ctx) {
    if (_audioKeepAlive) return;
    // Cria 1 frame de silêncio e fica repetindo — mantém o contexto "running"
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    function loop() {
        if (!_sharedAudioCtx || _sharedAudioCtx.state !== 'running') return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        _audioKeepAlive = setTimeout(loop, 500);
    }
    loop();
}

function _tentarDesbloquear() {
    try {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume().then(() => {
                if (ctx.state === 'running') _iniciarKeepAlive(ctx);
            }).catch(() => {});
        } else if (ctx.state === 'running') {
            _iniciarKeepAlive(ctx);
        }
    } catch(e) {}
}

// ─── ATIVAÇÃO DE SOM INTEGRADA AO HEADER ───
const _AUDIO_KEY = 'gf_audio_unlocked_cgr';

function _atualizarBotaoSom(ativo) {
    const btn = document.getElementById('btn-ativar-som');
    const label = document.getElementById('btn-som-label');
    const dot = btn ? btn.querySelector('.som-dot') : null;
    if (!btn || !label) return;
    if (ativo) {
        btn.classList.add('ativo');
        label.textContent = 'Som ativo';
        btn.title = 'Clique para desativar o som';
    } else {
        btn.classList.remove('ativo');
        label.textContent = 'Som desativado';
        btn.title = 'Clique para ativar o som';
    }
}

// Verifica se o som está ativo antes de tocar qualquer alerta
function _somEstaAtivo() {
    return localStorage.getItem(_AUDIO_KEY) === '1';
}

function ativarSom() {
    const jaAtivo = localStorage.getItem(_AUDIO_KEY) === '1';
    if (jaAtivo) {
        localStorage.removeItem(_AUDIO_KEY);
        _atualizarBotaoSom(false);
    } else {
        _tentarDesbloquear();
        localStorage.setItem(_AUDIO_KEY, '1');
        setTimeout(() => {
            try {
                const ctx = getAudioCtx();
                if (ctx.state === 'running') {
                    const o = ctx.createOscillator();
                    const g = ctx.createGain();
                    o.connect(g); g.connect(ctx.destination);
                    o.frequency.value = 880;
                    g.gain.setValueAtTime(0.15, ctx.currentTime);
                    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                    o.start(); o.stop(ctx.currentTime + 0.3);
                }
            } catch(e){}
        }, 100);
        _atualizarBotaoSom(true);
    }
}

function _iniciarUnlock() {
    // Unlock por qualquer interação (essencial para mobile iOS/Android)
    const _unlockByInteraction = () => {
        if (localStorage.getItem(_AUDIO_KEY) === '1') {
            _tentarDesbloquear();
        }
    };
    document.addEventListener('touchstart', _unlockByInteraction, { once: false, passive: true });
    document.addEventListener('touchend',   _unlockByInteraction, { once: false, passive: true });
    document.addEventListener('click',      _unlockByInteraction, { once: false, passive: true });

    if (localStorage.getItem(_AUDIO_KEY) === '1') {
        _tentarDesbloquear();
        const _retryUnlock = setInterval(() => {
            if (_sharedAudioCtx && _sharedAudioCtx.state === 'running') {
                clearInterval(_retryUnlock);
                _atualizarBotaoSom(true);
                return;
            }
            _tentarDesbloquear();
        }, 1000);
    }
    // Atualiza visual do botão conforme estado
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            _atualizarBotaoSom(localStorage.getItem(_AUDIO_KEY) === '1');
        });
    } else {
        _atualizarBotaoSom(localStorage.getItem(_AUDIO_KEY) === '1');
    }
}

_iniciarUnlock();

// ─── AVISO SONORO DE URGÊNCIA ───
let urgenciaSoundInterval = null;
function playUrgenciaBeep() {
    if (!_somEstaAtivo()) return;
    try {
        const ctx = getAudioCtx();
        const beep = (freq, start, dur) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = 'square';
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.3, ctx.currentTime + start);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
            o.start(ctx.currentTime + start);
            o.stop(ctx.currentTime + start + dur + 0.05);
        };
        beep(880, 0,    0.15);
        beep(880, 0.2,  0.15);
        beep(1200, 0.45, 0.3);
    } catch(e) {}
}
function startUrgenciaSound() {
    if (urgenciaSoundInterval) return;
    playUrgenciaBeep();
    urgenciaSoundInterval = setInterval(playUrgenciaBeep, 600000);
}
function stopUrgenciaSound() {
    if (urgenciaSoundInterval) { clearInterval(urgenciaSoundInterval); urgenciaSoundInterval = null; }
}

// ─── AVISO SONORO A RETIRAR ───
let retirarSoundInterval = null;
function playRetirarBeep() {
    if (!_somEstaAtivo()) return;
    try {
        const ctx = getAudioCtx();
        const beep = (freq, start, dur) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = 'sine';
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.25, ctx.currentTime + start);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
            o.start(ctx.currentTime + start);
            o.stop(ctx.currentTime + start + dur + 0.05);
        };
        beep(520, 0,   0.25);
        beep(420, 0.4, 0.25);
    } catch(e) {}
}
function startRetirarSound() {
    if (retirarSoundInterval) return;
    playRetirarBeep();
    retirarSoundInterval = setInterval(playRetirarBeep, 600000);
}
function stopRetirarSound() {
    if (retirarSoundInterval) { clearInterval(retirarSoundInterval); retirarSoundInterval = null; }
}

// ─── AVISO SONORO EM ANDAMENTO ───
let andamentoSoundInterval = null;
function playAndamentoBeep() {
    if (!_somEstaAtivo()) return;
    try {
        const ctx = getAudioCtx();
        const beep = (freq, start, dur) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = 'triangle';
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.2, ctx.currentTime + start);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
            o.start(ctx.currentTime + start);
            o.stop(ctx.currentTime + start + dur + 0.05);
        };
        beep(660, 0,   0.2);
        beep(660, 0.35, 0.2);
        beep(660, 0.7,  0.2);
    } catch(e) {}
}
function startAndamentoSound() {
    if (andamentoSoundInterval) return;
    playAndamentoBeep();
    andamentoSoundInterval = setInterval(playAndamentoBeep, 600000);
}
function stopAndamentoSound() {
    if (andamentoSoundInterval) { clearInterval(andamentoSoundInterval); andamentoSoundInterval = null; }
}

// ─── AVISO SONORO AUTORIZADO ───
let autorizadoSoundInterval = null;
function playAutorizadoBeep() {
    if (!_somEstaAtivo()) return;
    try {
        const ctx = getAudioCtx();
        const beep = (freq, start, dur) => {
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination); o.type = 'sine';
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.18, ctx.currentTime + start);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
            o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
        };
        beep(700, 0, 0.3);
    } catch(e) {}
}
function startAutorizadoSound() { if (autorizadoSoundInterval) return; playAutorizadoBeep(); autorizadoSoundInterval = setInterval(playAutorizadoBeep, 600000); }
function stopAutorizadoSound() { if (autorizadoSoundInterval) { clearInterval(autorizadoSoundInterval); autorizadoSoundInterval = null; } }

// ─── AVISO SONORO PREPARAÇÃO ───
let preparacaoSoundInterval = null;
function playPreparacaoBeep() {
    if (!_somEstaAtivo()) return;
    try {
        const ctx = getAudioCtx();
        const beep = (freq, start, dur) => {
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination); o.type = 'sine';
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.18, ctx.currentTime + start);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
            o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
        };
        beep(580, 0, 0.2); beep(720, 0.3, 0.2);
    } catch(e) {}
}
function startPreparacaoSound() { if (preparacaoSoundInterval) return; playPreparacaoBeep(); preparacaoSoundInterval = setInterval(playPreparacaoBeep, 600000); }
function stopPreparacaoSound() { if (preparacaoSoundInterval) { clearInterval(preparacaoSoundInterval); preparacaoSoundInterval = null; } }

// ─── AVISO SONORO AGENDADO ───
let agendadoSoundInterval = null;
function playAgendadoBeep() {
    if (!_somEstaAtivo()) return;
    try {
        const ctx = getAudioCtx();
        const beep = (freq, start, dur, vol) => {
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination); o.type = 'square';
            o.frequency.value = freq;
            g.gain.setValueAtTime(vol || 0.22, ctx.currentTime + start);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
            o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.02);
        };
        // Pulsos rápidos urgentes: 4 bips curtos + pausa + 4 bips
        beep(880, 0.00, 0.07); beep(880, 0.10, 0.07); beep(880, 0.20, 0.07); beep(880, 0.30, 0.07);
        beep(1047, 0.55, 0.07); beep(1047, 0.65, 0.07); beep(1047, 0.75, 0.07); beep(1047, 0.85, 0.12, 0.28);
    } catch(e) {}
}
function startAgendadoSound() { if (agendadoSoundInterval) return; playAgendadoBeep(); agendadoSoundInterval = setInterval(playAgendadoBeep, 600000); }
function stopAgendadoSound() { if (agendadoSoundInterval) { clearInterval(agendadoSoundInterval); agendadoSoundInterval = null; } }

// ─── AVISO SONORO REAGENDADO ───
let reagendadoSoundInterval = null;
function playReagendadoBeep() {
    if (!_somEstaAtivo()) return;
    try {
        const ctx = getAudioCtx();
        const beep = (freq, start, dur) => {
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination); o.type = 'sine';
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.18, ctx.currentTime + start);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
            o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
        };
        beep(700, 0, 0.15); beep(500, 0.25, 0.15); beep(700, 0.5, 0.15); beep(500, 0.75, 0.15);
    } catch(e) {}
}
function startReagendadoSound() { if (reagendadoSoundInterval) return; playReagendadoBeep(); reagendadoSoundInterval = setInterval(playReagendadoBeep, 600000); }
function stopReagendadoSound() { if (reagendadoSoundInterval) { clearInterval(reagendadoSoundInterval); reagendadoSoundInterval = null; } }

// ─── AVISO SONORO CIRURGIA AMANHÃ ───
let cirurgiaAmanhaSound = null;
function playCirurgiaAmanhaBeep() {
    if (!_somEstaAtivo()) return;
    try {
        const ctx = getAudioCtx();
        const beep = (freq, start, dur) => {
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination); o.type = 'triangle';
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.22, ctx.currentTime + start);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
            o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
        };
        // Melodia: dó-mi-sol (ascendente, tom de alerta amigável)
        beep(523, 0, 0.18); beep(659, 0.25, 0.18); beep(784, 0.50, 0.30);
    } catch(e) {}
}
function startCirurgiaAmanhaSound() { if (cirurgiaAmanhaSound) return; playCirurgiaAmanhaBeep(); cirurgiaAmanhaSound = setInterval(playCirurgiaAmanhaBeep, 600000); }
function stopCirurgiaAmanhaSound() { if (cirurgiaAmanhaSound) { clearInterval(cirurgiaAmanhaSound); cirurgiaAmanhaSound = null; } }

// ─── AVISO SONORO RETIRAR VOLUMES URGENTES ───
let coletaUrgenteSoundInterval = null;
function playColetaUrgenteBeep() {
    if (!_somEstaAtivo()) return;
    try {
        const ctx = getAudioCtx();
        const beep = (freq, start, dur, vol) => {
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination); o.type = 'sine';
            o.frequency.value = freq;
            g.gain.setValueAtTime(vol || 0.22, ctx.currentTime + start);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
            o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
        };
        // ✈️ Som de avião decolando: ascendente + 2 bips urgentes
        beep(440, 0.00, 0.12); beep(550, 0.15, 0.12); beep(660, 0.30, 0.12); beep(880, 0.45, 0.20);
        beep(1047, 0.75, 0.10); beep(1047, 0.90, 0.15, 0.28);
    } catch(e) {}
}
function startColetaUrgenteSound() { if (coletaUrgenteSoundInterval) return; playColetaUrgenteBeep(); coletaUrgenteSoundInterval = setInterval(playColetaUrgenteBeep, 600000); }
function stopColetaUrgenteSound() { if (coletaUrgenteSoundInterval) { clearInterval(coletaUrgenteSoundInterval); coletaUrgenteSoundInterval = null; } }

// ─── AVISO SONORO DATA DE RETIRADA ───
let dataRetiradaSoundInterval = null;
function playDataRetiradaBeep() {
    if (!_somEstaAtivo()) return;
    try {
        const ctx = getAudioCtx();
        const beep = (freq, start, dur, vol) => {
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination); o.type = 'sine';
            o.frequency.value = freq;
            g.gain.setValueAtTime(vol || 0.22, ctx.currentTime + start);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
            o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
        };
        beep(740, 0.00, 0.15);
        beep(587, 0.22, 0.15);
        beep(494, 0.44, 0.25);
    } catch(e) {}
}
function startDataRetiradaSound() { if (dataRetiradaSoundInterval) return; playDataRetiradaBeep(); dataRetiradaSoundInterval = setInterval(playDataRetiradaBeep, 600000); }
function stopDataRetiradaSound() { if (dataRetiradaSoundInterval) { clearInterval(dataRetiradaSoundInterval); dataRetiradaSoundInterval = null; } }
let currentFilter = 'all';
var mostrarOcultos = false;
let currentVendedorFilter = 'all';
let currentGroup = 'none';
let currentCityFilter = 'all';
let currentView = 'table';
let searchTerm = '';
let editingIndex = null;
let editingDocId = null;
let periodoDe = '';
let periodoAte = '';
let currentPreset = 'todos';

function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function autoRetirada(dataCirurgia) {
    if (!dataCirurgia) return;
    const d = new Date(dataCirurgia + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    const retirada = d.toISOString().slice(0, 10);
    const campo = document.getElementById('f-retirada');
    if (campo) campo.value = retirada;
}

function autoStatusByDate(dataCirurgia) {
    if (editingDocId !== null) return;
    const fStatus = document.getElementById('f-status');
    if (!fStatus || !dataCirurgia) return;
    const novoStatus = dataCirurgia > todayStr() ? 'agendado' : 'andamento';
    fStatus.value = novoStatus;
    fStatus.dispatchEvent(new Event('change'));
}

function autoTransitoNF(nfValue) {
    const fStatus = document.getElementById('f-status');
    if (!fStatus || !nfValue.trim()) return;
    if (fStatus.value === 'preparacao') {
        const _existente = editingDocId ? procedimentos.find(p => p._docId === editingDocId) : null;
        // Só auto-promover se: registro novo (sem editingDocId)
        // OU registro existente que NÃO tinha NF antes E NÃO estava em trânsito
        if (_existente && (_existente.status === 'em_transito' || (_existente.nf && _existente.nf.trim()))) return;
        fStatus.value = 'em_transito';
        fStatus.dispatchEvent(new Event('change'));
    }
}

function autoPreencherRetiradaColeta(dataCirurgia) {
    if (!dataCirurgia) return;
    const d = new Date(dataCirurgia + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    const retirada = d.toISOString().slice(0, 10);
    const campo = document.getElementById('f-data-retirar');
    if (campo) campo.value = retirada;
}

async function save() {
    // Operações já salvas diretamente no Firebase — onSnapshot atualiza a UI
}

// ─── FIREBASE: salvar/atualizar procedimento ───
async function fbSaveProc(proc) {
    try {
        const { collection: col, addDoc, setDoc, doc } = window._fbModules;
        const db = window._fbDb;
        const COLL = window._fbColl;
        if (!db || !COLL) { alert('❌ Banco não inicializado. Recarregue a página.'); return; }
        const { _docId, _filial, ...data } = proc;
        data._updatedAt = new Date().toISOString();
        // Histórico de status
        const userEmail = (window._fbAuth && window._fbAuth.currentUser) ? window._fbAuth.currentUser.email : 'sistema';
        if (_docId && proc.status !== undefined) {
            const existing = window.procedimentos ? window.procedimentos.find(p => p._docId === _docId) : null;
            if (existing && existing.status !== proc.status) {
                const hist = existing._statusHistory || [];
                hist.push({ de: existing.status, para: proc.status, em: new Date().toISOString(), por: userEmail });
                data._statusHistory = hist;
            } else if (existing) {
                data._statusHistory = existing._statusHistory || [];
            }
        }
        if (_docId) {
            await setDoc(doc(db, COLL, _docId), data);
        } else {
            await addDoc(col(db, COLL), data);
        }
    } catch(err) {
        console.error('Erro fbSaveProc:', err);
        alert('❌ Erro ao salvar no banco: ' + (err.message || err));
    }
}

// ─── FIREBASE: deletar procedimento ───
async function fbDeleteProc(docId) {
    const { deleteDoc, doc } = window._fbModules;
    await deleteDoc(doc(window._fbDb, window._fbColl, docId));
}

// ─── SYNC TOAST ───
function showSyncToast(msg) {
    let toast = document.getElementById('sync-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sync-toast';
        toast.style.cssText = `
            position:fixed;bottom:24px;left:24px;z-index:9999;
            background:#111827;border:1px solid rgba(0,212,255,0.4);
            color:#00d4ff;font-family:'JetBrains Mono',monospace;
            font-size:0.84rem;letter-spacing:0.08em;
            padding:10px 18px;border-radius:8px;
            box-shadow:0 4px 20px rgba(0,0,0,0.4);
            display:flex;align-items:center;gap:8px;
            transition:opacity 0.4s ease;opacity:0;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

// ─── AUTO BACKUP ───
let _autoBackupTimer = null;

function autoBackupJSON() {
    clearTimeout(_autoBackupTimer);
    _autoBackupTimer = setTimeout(() => {
        try {
            const backup = {
                versao: '1.0',
                exportadoEm: new Date().toISOString(),
                totalRegistros: procedimentos.length,
                autoBackup: true,
                procedimentos: procedimentos
            };
            const json = JSON.stringify(backup, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const dataHoje = new Date().toISOString().split('T')[0];
            const hora = new Date().toTimeString().slice(0,5).replace(':','-');
            a.href = url;
            a.download = `autobackup_campogrande_${dataHoje}_${hora}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showBackupToast();
        } catch(err) {
            console.warn('Auto backup falhou:', err);
        }
    }, 1500);
}

function showBackupToast() {
    let toast = document.getElementById('backup-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'backup-toast';
        toast.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; z-index: 9999;
            background: #111827; border: 1px solid rgba(16,185,129,0.5);
            color: #10b981; font-family: 'JetBrains Mono', monospace;
            font-size: 0.72rem; letter-spacing: 0.08em;
            padding: 10px 18px; border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            display: flex; align-items: center; gap: 8px;
            transition: opacity 0.4s ease;
        `;
        document.body.appendChild(toast);
    }
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    toast.innerHTML = `✅ Backup automático salvo — ${hora}`;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
}

// ─── CLOCK ───
function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('pt-BR');
    document.getElementById('dateDisplay').textContent = now.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
    updateTimers();
    updateAlerts();
    if (currentView === 'timeline') renderTimeline();
}

setInterval(updateClock, 1000);
updateClock();

// ─── HELPERS ───
function timeToMinutes(t) {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function minutesToStr(mins) {
    if (mins < 0) mins = -mins;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2,'0')}min` : `${m}min`;
}

function getElapsed(proc) {
    // SLA de Em Procedimento: 8 horas (480 minutos)
    const SLA_MINUTOS = 480;
    const inicio = proc.inicio; // ex: "08:30"
    if (!inicio) return null;
    const [h, m] = inicio.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const inicioMin = h * 60 + m;
    const elapsed = nowMin - inicioMin;
    if (elapsed < 0) return null; // ainda não começou
    const remaining = SLA_MINUTOS - elapsed;
    const progress = Math.min(100, Math.round((elapsed / SLA_MINUTOS) * 100));
    return {
        elapsed,
        remaining,
        progress,
        overdue: elapsed > SLA_MINUTOS
    };
}

// ─── STATS ───
function setPisca(id, anim, ativo) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.animation = ativo ? anim : '';
}

function updateStats() {
    document.getElementById('stat-total').textContent = procedimentos.length;
    ['a_agendar','andamento','preparacao','agendado','em_transito','concluido','cancelado','reagendado','a_retirar','urgencia','coleta_urgente'].forEach(s => {
        const el = document.getElementById('stat-' + s); if (el) el.textContent = procedimentos.filter(p => p.status === s).length;
    });

    // Limpar todas as animações antes de reaplicar
    ['a_agendar','andamento','preparacao','agendado','em_transito','reagendado','a_retirar','urgencia','coleta_urgente'].forEach(s => {
        const el = document.getElementById('stat-card-' + s);
        if (el) el.style.animation = '';
    });

    const hoje = todayStr();
    const amanhaD = new Date(); amanhaD.setDate(amanhaD.getDate() + 1);
    const amanhaStr = `${amanhaD.getFullYear()}-${String(amanhaD.getMonth()+1).padStart(2,"0")}-${String(amanhaD.getDate()).padStart(2,"0")}`;

    // Urgência — qualquer registro
    const temUrgencia = procedimentos.some(p => p.status === 'urgencia');
    temUrgencia ? startUrgenciaSound() : stopUrgenciaSound();
    setPisca('stat-card-urgencia', 'statPiscarUrgencia 0.5s ease-in-out infinite', temUrgencia);

    // Disponível p/ Retirar — qualquer registro
    const temRetirar = procedimentos.some(p => p.status === 'a_retirar');
    temRetirar ? startRetirarSound() : stopRetirarSound();
    setPisca('stat-card-a_retirar', 'statPiscarRetirar 0.8s ease-in-out infinite', temRetirar);

    // Em Procedimento (andamento) — qualquer registro
    const temAndamento = procedimentos.some(p => p.status === 'andamento');
    temAndamento ? startAndamentoSound() : stopAndamentoSound();
    setPisca('stat-card-andamento', 'statPiscarAndamento 1s ease-in-out infinite', temAndamento);

    // Autorizado — qualquer registro
    const autorizados = procedimentos.filter(p => p.status === 'a_agendar');
    const temAutorizado = autorizados.length > 0;
    temAutorizado ? startAutorizadoSound() : stopAutorizadoSound();
    setPisca('stat-card-a_agendar', 'statPiscarAutorizado 1.8s ease-in-out infinite', temAutorizado);

    // Faixa de alerta ativo autorizado
    const autorBar = document.getElementById('autorizado-alert-bar');
    if (autorBar) {
        if (temAutorizado) {
            const lista = autorizados.slice(0, 4).map(p => {
                const nome = p.paciente || p.hospital || 'Procedimento';
                const data = p.data ? new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR') : '⚠ SEM DATA';
                return `• ${nome} — ${data}`;
            }).join('<br>');
            const extra = autorizados.length > 4 ? `<br><span style="opacity:0.6;">+${autorizados.length - 4} outros</span>` : '';
            autorBar.innerHTML = `
                <div>
                    <div class="autor-alert-text">📅 ${autorizados.length} autorizado${autorizados.length > 1 ? 's' : ''} aguardando data de cirurgia — agendar</div>
                    <div class="autor-alert-list">${lista}${extra}</div>
                </div>
                <button class="autor-alert-btn" onclick="document.querySelector('[data-filter=a_agendar]').click()">Ver autorizados →</button>`;
            autorBar.style.display = 'flex';
        } else {
            autorBar.style.display = 'none';
        }
    }

    // Em Preparação — qualquer registro
    const temPreparacao = procedimentos.some(p => p.status === 'preparacao');
    temPreparacao ? startPreparacaoSound() : stopPreparacaoSound();
    setPisca('stat-card-preparacao', 'statPiscarPreparacao 1.5s ease-in-out infinite', temPreparacao);

    // Reagendado — qualquer registro
    const reagendados = procedimentos.filter(p => p.status === 'reagendado');
    const temReagendado = reagendados.length > 0;
    temReagendado ? startReagendadoSound() : stopReagendadoSound();
    setPisca('stat-card-reagendado', 'statPiscarReagendado 0.8s ease-in-out infinite', temReagendado);

    // Faixa de alerta ativo reagendado
    const reagBar = document.getElementById('reagendado-alert-bar');
    if (reagBar) {
        if (temReagendado) {
            const lista = reagendados.slice(0, 4).map(p => {
                const nome = p.paciente || p.hospital || 'Procedimento';
                const data = p.data ? new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR') : 'sem data';
                const vencido = p.data && p.data < todayStr() ? ' ⚠ VENCIDO' : '';
                return `• ${nome} — ${data}${vencido}`;
            }).join('<br>');
            const extra = reagendados.length > 4 ? `<br><span style="opacity:0.6;">+${reagendados.length - 4} outros</span>` : '';
            reagBar.innerHTML = `
                <div>
                    <div class="reag-alert-text">↺ ${reagendados.length} reagendado${reagendados.length > 1 ? 's' : ''} aguardando nova data — cobrar com vendedor</div>
                    <div class="reag-alert-list">${lista}${extra}</div>
                </div>
                <button class="reag-alert-btn" onclick="document.querySelector('[data-filter=reagendado]').click()">Ver reagendados →</button>`;
            reagBar.style.display = 'flex';
        } else {
            reagBar.style.display = 'none';
        }
    }

    // Faixa de alerta ativo agendado
    const agendados = procedimentos.filter(p => p.status === 'agendado');
    const agendBar = document.getElementById('agendado-alert-bar');
    if (agendBar) {
        if (agendados.length > 0) {
            const lista = agendados.slice(0, 4).map(p => {
                const nome = p.paciente || p.hospital || 'Procedimento';
                const data = p.data ? new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR') : '⚠ SEM DATA';
                const hora = p.inicio ? ` às ${p.inicio}` : '';
                return `• ${nome} — ${data}${hora}`;
            }).join('<br>');
            const extra = agendados.length > 4 ? `<br><span style="opacity:0.6;">+${agendados.length - 4} outros</span>` : '';
            agendBar.innerHTML = `
                <div>
                    <div class="agend-alert-text">📋 ${agendados.length} cirurgia${agendados.length > 1 ? 's' : ''} agendada${agendados.length > 1 ? 's' : ''} — acompanhar preparação</div>
                    <div class="agend-alert-list">${lista}${extra}</div>
                </div>
                <button class="agend-alert-btn" onclick="document.querySelector('[data-filter=agendado]').click()">Ver agendados →</button>`;
            agendBar.style.display = 'flex';
        } else {
            agendBar.style.display = 'none';
        }
    }

    // Agendado — somente hoje ou amanhã
    const temAgendado = procedimentos.some(p => (p.status === 'agendado' || p.status === 'preparacao') && (p.data === hoje || p.data === amanhaStr));
    temAgendado ? startAgendadoSound() : stopAgendadoSound();
    setPisca('stat-card-agendado', 'statPiscarAgendado 0.8s ease-in-out infinite', temAgendado);

    // Cirurgia hoje ou amanhã — alerta separado
    const temCirurgiaAmanha = procedimentos.some(p => (p.status === 'agendado' || p.status === 'preparacao') && (p.data === hoje || p.data === amanhaStr));
    temCirurgiaAmanha ? startCirurgiaAmanhaSound() : stopCirurgiaAmanhaSound();

    // Retirar Volumes Urgentes — qualquer registro
    const temColetaUrgente = procedimentos.some(p => p.status === 'coleta_urgente');
    temColetaUrgente ? startColetaUrgenteSound() : stopColetaUrgenteSound();
    setPisca('stat-card-coleta_urgente', 'pillPulseColeta 0.6s ease-in-out infinite', temColetaUrgente);

    // Data de Retirada — alertar 1 dia antes, no dia ou vencida
    const hojeS = todayStr();
    const amanha2 = new Date(); amanha2.setDate(amanha2.getDate() + 1);
    const amanhaSnd = amanha2.getFullYear()+'-'+String(amanha2.getMonth()+1).padStart(2,'0')+'-'+String(amanha2.getDate()).padStart(2,'0');
    const temDataRetirada = procedimentos.some(p =>
        p.retirada && p.retirada <= amanhaSnd &&
        p.status !== 'concluido' && p.status !== 'cancelado' && p.status !== 'a_retirar'
    );
    temDataRetirada ? startDataRetiradaSound() : stopDataRetiradaSound();

    // Som unificado a cada 5 min para QUALQUER status ativo
    _iniciarSomGeral(procedimentos);
}

// ─── SOM GERAL 5 MIN ───
let _somGeralInterval = null;
let _somGeralAtivo = false;
function _iniciarSomGeral(procs) {
    const statusAtivos = ['a_agendar','andamento','preparacao','agendado','em_transito','reagendado','a_retirar','urgencia','coleta_urgente'];
    const temQualquer = procs.some(p => statusAtivos.includes(p.status));
    if (temQualquer && !_somGeralAtivo) {
        _somGeralAtivo = true;
        _tocarSomGeral(procs);
        _somGeralInterval = setInterval(function() { _tocarSomGeral(procedimentos); }, 600000);
    } else if (!temQualquer && _somGeralAtivo) {
        _somGeralAtivo = false;
        if (_somGeralInterval) { clearInterval(_somGeralInterval); _somGeralInterval = null; }
    }
}
function _tocarSomGeral(procs) {
    if (!_somEstaAtivo()) return;
    const ctx = _getAudioCtx(); if (!ctx) return;
    const t = ctx.currentTime;
    // beep suave único — não repetitivo, apenas lembrete
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(660, t);
    o.frequency.exponentialRampToValueAtTime(440, t + 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.start(t); o.stop(t + 0.5);
}


// ─── HELPER WHATSAPP: copia texto e abre app ───
async function _abrirWhatsApp(texto) {
    const textoLimpo = texto
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]️?(‍[\p{Emoji_Presentation}\p{Extended_Pictographic}]️?)*/gu, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/^ /gm, '');
    window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(textoLimpo), '_blank');
}

// ─── EXPORTAR WHATSAPP — aguardando retirada ───
async function exportarWhatsApp() {
    await verificarPromocaoRetirada();

    var fmt = function(d) { return d ? new Date(d+'T00:00:00').toLocaleDateString('pt-BR') : '—'; };

    var cirurgias = procedimentos.filter(function(p) {
        if (_ehColeta(p) || p.isColeta) return false;
        return p.status === 'a_retirar';
    });
    cirurgias.sort(function(a,b) { return (a.retirada||'').localeCompare(b.retirada||''); });

    if (cirurgias.length === 0) {
        alert('✅ Sem pendências!\n\nNenhum material aguardando retirada.');
        return;
    }

    var linhas = [];
    linhas.push('Olá! 😊');
    linhas.push('Segue as pendências de *Monitor Cirúrgico* que ainda não foram devolvidos ao estoque:');
    cirurgias.forEach(function(p) {
        linhas.push('');
        linhas.push('---');
        linhas.push('👤 *Paciente:* ' + (p.paciente || '—'));
        linhas.push('🏥 *Hospital:* ' + (p.hospital || '—'));
        linhas.push('🧾 *Nº da Nota Fiscal:* ' + (p.nf || '—'));
        linhas.push('🙍 *Vendedor:* ' + (p.vendedor || '—'));
        linhas.push('📅 *Data de retirada:* ' + fmt(p.retirada));
    });
    linhas.push('');
    linhas.push('---');
    linhas.push('Por favor, providencie a devolução o quanto antes para garantir a disponibilidade dos produtos no estoque.');
    linhas.push('Qualquer dúvida, é só me chamar! 🙏');

    _abrirWhatsApp(linhas.join('\n'));
}


// ─── CONFIRMAR RETIRADA — TABELA MONITOR ───
async function confirmarRetiradaCirurgia(docId) {
    const proc = procedimentos.find(p => (p._docId || String(p.id)) === String(docId));
    if (!proc) return;

    const antigo = document.getElementById('modalConfRetiradaCirurgia');
    if (antigo) antigo.remove();

    const retFmt = proc.retirada ? new Date(proc.retirada+'T00:00:00').toLocaleDateString('pt-BR') : '—';
    const nomePac = proc.paciente || '—';

    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.id = 'modalConfRetiradaCirurgia';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:16px;';
        overlay.innerHTML =
            '<div style="background:var(--surface);border:1px solid var(--border);border-top:4px solid #f97316;border-radius:16px;padding:28px 26px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.35);">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">' +
                    '<span style="font-family:var(--mono);font-size:0.82rem;font-weight:700;letter-spacing:0.08em;color:#f97316;text-transform:uppercase;">📦 Confirmar Retirada</span>' +
                    '<button id="btnFecharConfCir" style="background:none;border:1px solid var(--border);color:var(--text-dim);width:28px;height:28px;border-radius:6px;cursor:pointer;">✕</button>' +
                '</div>' +
                '<div style="margin-bottom:18px;padding:12px 14px;background:rgba(249,115,22,0.06);border-radius:10px;border:1px solid rgba(249,115,22,0.2);">' +
                    '<div style="font-family:var(--sans);font-weight:700;font-size:0.95rem;color:var(--text);margin-bottom:4px;">' + nomePac + '</div>' +
                    '<div style="font-family:var(--mono);font-size:0.73rem;color:var(--text-dim);">' + (proc.hospital||'—') + ' · ' + (proc.medico||'—') + '</div>' +
                    '<div style="font-family:var(--mono);font-size:0.73rem;color:#f97316;margin-top:4px;font-weight:600;">Retirada prevista: ' + retFmt + '</div>' +
                '</div>' +
                '<div style="font-family:var(--mono);font-size:0.78rem;color:var(--text-dim);margin-bottom:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">O material foi retirado?</div>' +
                '<div style="display:flex;gap:10px;margin-bottom:16px;">' +
                    '<button id="btnConfCirSim" style="flex:1;padding:13px;border-radius:10px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.9rem;font-weight:700;cursor:pointer;transition:all 0.18s;">✅ SIM</button>' +
                    '<button id="btnConfCirNao" style="flex:1;padding:13px;border-radius:10px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.9rem;font-weight:700;cursor:pointer;transition:all 0.18s;">❌ NÃO</button>' +
                '</div>' +
                '<button id="btnConfirmarCirFinal" style="width:100%;padding:13px;border-radius:10px;background:#f97316;border:none;color:#fff;font-family:var(--mono);font-size:0.85rem;font-weight:700;cursor:pointer;opacity:0.4;pointer-events:none;transition:opacity 0.2s;">Confirmar</button>' +
            '</div>';
        document.body.appendChild(overlay);

        let escolha = null;
        const btnSim = overlay.querySelector('#btnConfCirSim');
        const btnNao = overlay.querySelector('#btnConfCirNao');
        const btnFinal = overlay.querySelector('#btnConfirmarCirFinal');

        function selecionar(val) {
            escolha = val;
            [btnSim, btnNao].forEach(b => {
                b.style.background = 'transparent';
                b.style.color = 'var(--text-dim)';
                b.style.borderColor = 'var(--border)';
            });
            const btn = val === 'sim' ? btnSim : btnNao;
            btn.style.background = val === 'sim' ? '#4db87a' : '#d94f4f';
            btn.style.color = '#fff';
            btn.style.borderColor = val === 'sim' ? '#4db87a' : '#d94f4f';
            btnFinal.style.opacity = '1';
            btnFinal.style.pointerEvents = 'auto';
            btnFinal.style.background = val === 'sim' ? '#4db87a' : '#d94f4f';
            btnFinal.textContent = val === 'sim' ? '✅ Confirmar Retirada' : '❌ Não foi retirado';
        }

        btnSim.onclick = () => selecionar('sim');
        btnNao.onclick = () => selecionar('nao');
        overlay.querySelector('#btnFecharConfCir').onclick = () => { overlay.remove(); resolve(null); };

        btnFinal.onclick = async () => {
            if (!escolha) return;
            overlay.remove();
            if (escolha === 'sim') {
                proc.status = 'concluido';
                proc.retiradaConfirmada = true;
                proc.dataConfirmacaoRetirada = todayStr();
            } else {
                proc.status = 'a_retirar';
            }
            try {
                await fbSaveProc(proc);
                renderTable && renderTable();
                renderCards && renderCards();
                updateStats && updateStats();
                showSyncToast(escolha === 'sim' ? '✅ Retirada confirmada — Concluído!' : '📦 Material ainda não retirado — Aguardando Retirada');
            } catch(e) { alert('Erro ao salvar: ' + e.message); }
            resolve(escolha);
        };
    });
}

// ─── CONFIRMAR SEPARAÇÃO → EM PROCEDIMENTO ───
async function confirmarSeparacao(docId) {
    const proc = procedimentos.find(p => (p._docId || String(p.id)) === String(docId));
    if (!proc) return;
    const antigo = document.getElementById('modalConfSeparacao');
    if (antigo) antigo.remove();
    const nomePac = proc.paciente || '—';
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.id = 'modalConfSeparacao';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:16px;';
        overlay.innerHTML =
            '<div style="background:var(--surface);border:1px solid var(--border);border-top:4px solid #d4920a;border-radius:16px;padding:28px 26px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.35);">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">' +
                    '<span style="font-family:var(--mono);font-size:0.82rem;font-weight:700;letter-spacing:0.08em;color:#d4920a;text-transform:uppercase;">⚙️ Em Separação</span>' +
                    '<button id="btnFecharConfSep" style="background:none;border:1px solid var(--border);color:var(--text-dim);width:28px;height:28px;border-radius:6px;cursor:pointer;">✕</button>' +
                '</div>' +
                '<div style="margin-bottom:18px;padding:12px 14px;background:rgba(212,146,10,0.06);border-radius:10px;border:1px solid rgba(212,146,10,0.2);">' +
                    '<div style="font-family:var(--sans);font-weight:700;font-size:0.95rem;color:var(--text);margin-bottom:4px;">' + nomePac + '</div>' +
                    '<div style="font-family:var(--mono);font-size:0.73rem;color:var(--text-dim);">' + (proc.hospital || '—') + ' · ' + (proc.medico || '—') + '</div>' +
                '</div>' +
                '<div style="font-family:var(--mono);font-size:0.78rem;color:var(--text-dim);margin-bottom:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Material separado e pronto para procedimento?</div>' +
                '<div style="display:flex;gap:10px;margin-bottom:16px;">' +
                    '<button id="btnConfSepSim" style="flex:1;padding:13px;border-radius:10px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.9rem;font-weight:700;cursor:pointer;transition:all 0.18s;">✅ SIM</button>' +
                    '<button id="btnConfSepNao" style="flex:1;padding:13px;border-radius:10px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.9rem;font-weight:700;cursor:pointer;transition:all 0.18s;">❌ NÃO</button>' +
                '</div>' +
                '<button id="btnConfirmarSepFinal" style="width:100%;padding:13px;border-radius:10px;background:#d4920a;border:none;color:#fff;font-family:var(--mono);font-size:0.85rem;font-weight:700;cursor:pointer;opacity:0.4;pointer-events:none;transition:opacity 0.2s;">Confirmar</button>' +
            '</div>';
        document.body.appendChild(overlay);
        let escolha = null;
        const btnSim = overlay.querySelector('#btnConfSepSim');
        const btnNao = overlay.querySelector('#btnConfSepNao');
        const btnFinal = overlay.querySelector('#btnConfirmarSepFinal');
        function selecionar(val) {
            escolha = val;
            [btnSim, btnNao].forEach(b => { b.style.background = 'transparent'; b.style.color = 'var(--text-dim)'; b.style.borderColor = 'var(--border)'; });
            const btn = val === 'sim' ? btnSim : btnNao;
            btn.style.background = val === 'sim' ? '#4db87a' : '#d94f4f';
            btn.style.color = '#fff';
            btn.style.borderColor = val === 'sim' ? '#4db87a' : '#d94f4f';
            btnFinal.style.opacity = '1';
            btnFinal.style.pointerEvents = 'auto';
            btnFinal.style.background = val === 'sim' ? '#4db87a' : '#d94f4f';
            btnFinal.textContent = val === 'sim' ? '✅ Iniciar Procedimento' : '❌ Manter em Separação';
        }
        btnSim.onclick = () => selecionar('sim');
        btnNao.onclick = () => selecionar('nao');
        overlay.querySelector('#btnFecharConfSep').onclick = () => { overlay.remove(); resolve(null); };
        btnFinal.onclick = async () => {
            if (!escolha) return;
            overlay.remove();
            if (escolha === 'sim') proc.status = 'andamento';
            try {
                await fbSaveProc(proc);
                renderTable && renderTable();
                renderCards && renderCards();
                updateStats && updateStats();
                showSyncToast(escolha === 'sim' ? '✅ Em Procedimento!' : '⚙️ Mantido em Separação');
            } catch(e) { alert('Erro ao salvar: ' + e.message); }
            resolve(escolha);
        };
    });
}

// ─── ALERTS ───
function updateAlerts() {
    // Alertas ocultos — estilo monitor
    const alertsContainer = document.getElementById('alertsPanel');
    if (alertsContainer) {
        alertsContainer.style.display = 'none';
        alertsContainer.classList.remove('visible');
    }
}

function getFiltered() {
    const statusOrder = { a_agendar: 0, urgencia: 1, coleta_urgente: 2, agendado: 3, preparacao: 4, andamento: 5, cancelado: 6, reagendado: 7, a_retirar: 8, concluido: 9 };
    return procedimentos.filter(p => {
        if (_ehColeta(p) && currentFilter !== 'coleta_urgente') return false; // Volumes Urgentes só aparecem na aba própria
        const matchFilter = !!searchTerm.trim()
            || mostrarOcultos
            || currentFilter === 'all'
            || (currentFilter === 'reagendado_vencido' ? (p.status === 'reagendado' && p.data && p.data < todayStr()) : p.status === currentFilter);
        const matchCity = true; // arquivo CG — mostra todos
        const matchVendedor = currentVendedorFilter === 'all' || (p.vendedor || '') === currentVendedorFilter;
        const q = searchTerm.toLowerCase();
        const matchSearch = !q || [p.hospital, p.medico, p.procedimento, p.vendedor, p.linha, p.equipe, p.convenio, p.paciente, p.nf].some(v => v && v.toLowerCase().includes(q));
        const matchPeriod = true;
        return matchFilter && matchCity && matchVendedor && matchSearch && matchPeriod;
    }).sort((a, b) => {
        const oa = statusOrder[a.status] ?? 99;
        const ob = statusOrder[b.status] ?? 99;
        if (oa !== ob) return oa - ob;
        // Dentro do mesmo status, ordena por data de cirurgia (mais recente primeiro)
        if (a.data && b.data) return a.data.localeCompare(b.data);
        return 0;
    });
}

function setCityFilter(city) {
    currentCityFilter = city;
    document.getElementById('city-btn-all').classList.toggle('active', city === 'all');
    document.getElementById('city-btn-cuiaba').classList.toggle('active', city === 'Cuiabá');
    document.getElementById('city-btn-campogran').classList.toggle('active', city === 'Campo Grande');
    renderCards();
}


function atualizarFiltroVendedor() {
    const sel = document.getElementById('vendedor-select');
    if (!sel) return;
    const vendedores = [...new Set(procedimentos.map(p => p.vendedor).filter(Boolean))].sort();
    const current = sel.value;
    sel.innerHTML = '<option value="all">Todos</option>' +
        vendedores.map(v => `<option value="${v}"${v === current ? ' selected' : ''}>${v}</option>`).join('');
    if (current && current !== 'all') sel.value = current;
}

function setVendedorFilter(val) {
    currentVendedorFilter = val;
    renderCards();
}

function statusLabel(s) {
    return { a_agendar:'Autorizado', andamento:'Em Procedimento', preparacao:'Em Separação', agendado:'Agendado', em_transito:'Em Trânsito', concluido:'Concluído', cancelado:'Cancelado', reagendado:'Reagendado', a_retirar:'Aguardando Retirada', urgencia:'🚨 URGÊNCIA', coleta_urgente:'✈️ Coleta Prioritária' }[s] || s;
}

function renderCards() {
    try { updateStats(); updatePeriodResult(); atualizarFiltroVendedor(); } catch(e) { console.warn(e); }
    // Notifica módulo OPME para atualizar lista de concluídos
    document.dispatchEvent(new CustomEvent('opme:refresh'));
    if (currentView === 'timeline') { try { renderTimeline(); } catch(e){} return; }
    if (currentView === 'table')    { try { renderTable(); }    catch(e){} return; }
    if (currentView === 'abc')      { try { renderABC(); }      catch(e){} return; }
    if (currentView === 'dashboard'){ try { renderDashboard(); }catch(e){} return; }
    if (currentView === 'calendar') { try { renderCalendar(); } catch(e){} return; }
    const grid = document.getElementById('cards-view');
    if (!grid) return;
    grid.style.display = 'grid';
    let list = [];
    try { list = getFiltered(); } catch(e) {
        grid.innerHTML = `<div style="grid-column:1/-1;padding:20px;color:red;">Erro: ${e.message}</div>`; return;
    }
    // Filtro de visibilidade: ocultos tem prioridade; busca ativa mostra todos os status
    if (mostrarOcultos) {
        list = list.filter(p => p.status === 'concluido' || p.status === 'cancelado');
    } else if (!searchTerm.trim()) {
        list = list.filter(p => p.status !== 'concluido' && p.status !== 'cancelado');
    }
    if (list.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-dim);">Nenhum procedimento encontrado</div>'; return;
    }
    const htmlParts = [];
    for (const proc of list) {
        try { htmlParts.push(buildCardHTML(proc)); }
        catch(e) { console.error('Erro card:', proc._docId, e.message); htmlParts.push(`<div style="background:#fee2e2;border:1px solid #f87171;border-radius:12px;padding:12px;color:#dc2626;font-size:0.75rem;">⚠ ${proc.hospital||'?'}: ${e.message}</div>`); }
    }
    grid.innerHTML = htmlParts.join('');
}

function _ehColeta(p) {
    return p.isColeta
        || p.status === 'coleta_urgente'
        || (p.hospital && (p.hospital.includes('Retirar Volumes Urgentes') || p.hospital.includes('Volumes Urgentes')))
        || (p.nfCompra || p.cte || p.coletaFornecedor || p.coletaTransportadora || p.coletaDataCirurgia || p.dataRetirar);
}

function buildCardHTML(proc) {
    const realIndex = proc._docId || proc.id;
        const dataFmt = proc.data ? new Date(proc.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
        const isToday = proc.data === todayStr();
        const active = (proc.status === 'andamento' || proc.status === 'preparacao') && isToday;
        const elapsed = active ? getElapsed(proc) : null;

        let timerHTML = '';
        if (elapsed && proc.status === 'andamento') {
            const cls = elapsed.overdue ? 'over' : (elapsed.progress > 80 ? 'warn' : 'ok');
            const overdueCls = elapsed.overdue ? 'overdue' : '';
            const timeStr = elapsed.overdue
                ? `+${minutesToStr(-elapsed.remaining)}`
                : minutesToStr(elapsed.elapsed);
            timerHTML = `
                <div class="timer-block">
                    <div class="timer-header">
                        <span class="timer-label">${elapsed.overdue ? '⚠ Atraso' : '⏱ Decorrido'}</span>
                        <span class="timer-value ${overdueCls}" id="timer-${proc.id}">${timeStr}</span>
                    </div>
                    <div class="progress-bar-wrap">
                        <div class="progress-bar ${cls}" id="prog-${proc.id}" style="width:${elapsed.progress}%"></div>
                    </div>
                </div>`;
        }

        const obsHTML = '';

        let itensHTML = '';
        if (proc.itens && proc.itens.trim()) {
            const linhas = proc.itens.split('\n').map(l => l.trim()).filter(l => l);
            itensHTML = `
                <div class="items-block">
                    <div class="items-block-title">📋 Itens da Autorização / Solicitação</div>
                    <ul class="items-list">
                        ${linhas.map(l => {
                            const qtyMatch  = l.match(/\[QTY:(\d+)\]$/);
                            const codeMatch = l.match(/^\[COD:([^\]]+)\]\s*/);
                            const loteMatch = l.match(/\[LOTE:([^\]]+)\]/);
                            const qty  = qtyMatch  ? qtyMatch[1]  : '1';
                            const code = codeMatch ? codeMatch[1].trim() : '';
                            const lote = loteMatch ? loteMatch[1].trim() : '';
                            let name = l;
                            if (codeMatch) name = name.replace(/^\[COD:[^\]]+\]\s*/, '');
                            if (loteMatch) name = name.replace(/\[LOTE:[^\]]+\]/, '');
                            name = name.replace(/\[QTY:\d+\]$/, '').trim();
                            if (!name && !code) return '';
                            const codeBadge  = code ? `<span style="background:rgba(0,0,0,0.08);color:#111111;border:1px solid rgba(0,0,0,0.18);border-radius:3px;padding:1px 5px;font-family:var(--mono);font-size:0.82rem;font-weight:700;margin-right:5px;">${code}</span>` : '';
                            const loteBadge  = lote ? `<span style="color:var(--green);font-family:var(--mono);font-size:0.76rem;margin-left:4px;opacity:0.85;">Lote:${lote}</span>` : '';
                            return `<li><span class="item-qty-badge">×${qty}</span>${codeBadge}${name}${loteBadge}</li>`;
                        }).join('')}
                    </ul>
                </div>`;
        }


        const retirarBtn = proc.status === 'concluido'
            ? `<button class="btn-act retirar" onclick="marcarRetirada('${realIndex}')" title="Marcar material como retirado">📦 Retirar Material</button>` : '';
        // a_retirar: botão de confirmação "Retirou?"
        const retirarConfBtn = proc.status === 'a_retirar'
            ? `<button class="btn-act" style="background:rgba(249,115,22,0.15);border:1.5px solid #f97316;color:#f97316;font-weight:700;animation:pillPulseRetirar 0.8s ease-in-out infinite;" onclick="confirmarRetiradaCirurgia('${realIndex}')" title="Confirmar se o material foi retirado">📦 Retirou?</button>` : '';
        const agendarRetiradaBtn = (proc.status !== 'concluido' && proc.status !== 'cancelado' && proc.status !== 'a_retirar' && proc.status !== 'coleta_urgente')
            ? `<button class="btn-act agendar-retirada" onclick="agendarDataRetirada('${realIndex}')" title="Confirmar data de retirada">✅ Confirmar Retirada</button>` : '';
        const coletaConfRetiradaBtn = (_ehColeta(proc) && proc.status !== 'concluido' && proc.status !== 'cancelado')
            ? `<button class="btn-act agendar-retirada" onclick="confirmarRetiradaVolumes('${realIndex}')" title="Confirmar se o material foi retirado">✅ Confirmar Retirada</button>` : '';
        const coletaInfoBtn = (_ehColeta(proc) && proc.status !== 'concluido' && proc.status !== 'cancelado')
            ? `<button class="btn-act" style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.5);color:#818cf8;font-weight:700;" onclick="abrirInfoVolumesUrgentes('${realIndex}')" title="Adicionar NF, CTE e data de retirada">✈️ Informações</button>` : '';

        const hoje2 = todayStr();
        const amanhaC = new Date(); amanhaC.setDate(amanhaC.getDate() + 1);
        const amanhaCS = `${amanhaC.getFullYear()}-${String(amanhaC.getMonth()+1).padStart(2,"0")}-${String(amanhaC.getDate()).padStart(2,"0")}`;
        const cardAnimMap = {
            'urgencia':    'cardPiscarUrgencia 0.5s ease-in-out infinite',
            'andamento':   'cardPiscarAndamento 1s ease-in-out infinite',
            'preparacao':  'cardPiscarPreparacao 1.5s ease-in-out infinite',
            'a_agendar':   'cardPiscarAutorizado 1.8s ease-in-out infinite',
            'em_transito': 'cardPiscarAgendado 0.8s ease-in-out infinite',
            'reagendado': 'cardPiscarReagendado 0.8s ease-in-out infinite',
            'a_retirar':  'cardPiscarRetirar 0.8s ease-in-out infinite',
            'coleta_urgente': 'cardPiscarColeta 0.6s ease-in-out infinite',
        };
        // Agendado só pisca se for hoje ou amanhã
        if ((proc.status === 'agendado' || proc.status === 'preparacao') && (proc.data === hoje2 || proc.data === amanhaCS)) {
            cardAnimMap['agendado'] = 'cardPiscarAgendado 0.8s ease-in-out infinite';
        }
        const cardAnimStyle_base = cardAnimMap[proc.status] ? `animation:${cardAnimMap[proc.status]};` : '';
        // Se tiver data de retirada e status ativo → pulsar borda ciano independente do status
        const amanhaCard = new Date(); amanhaCard.setDate(amanhaCard.getDate() + 1);
        const amanhaCardStr = `${amanhaCard.getFullYear()}-${String(amanhaCard.getMonth()+1).padStart(2,'0')}-${String(amanhaCard.getDate()).padStart(2,'0')}`;
        const temDataRet = proc.retirada && proc.retirada <= amanhaCardStr && proc.status !== 'concluido' && proc.status !== 'cancelado' && proc.status !== 'a_retirar';
        const cardAnimStyle = temDataRet && !cardAnimMap[proc.status]
            ? 'animation:cardPiscarDataRetirada 1.2s ease-in-out infinite;'
            : cardAnimStyle_base;

        const reagVencido = proc.status === 'reagendado' && proc.data && proc.data < todayStr();
        const reagCount = ((proc._statusHistory || []).filter(h => h.para === 'reagendado').length) || (proc.status === 'reagendado' ? 1 : 0);
        const reagBadge = reagCount > 0 ? `<span class="reagend-count-badge">↺ ${reagCount}x</span>` : '';
        return `
        <div class="proc-card status-${proc.status}${reagVencido ? ' reagendado-vencido' : ''}" data-id="${proc.id}" style="${cardAnimStyle}">
            <div class="card-header">
                <div class="hospital-name">${_ehColeta(proc) ? '✈️ Volumes Urgentes' : '🏥 ' + proc.hospital}</div>
                <div class="status-pill pill-${proc.status}">${statusLabel(proc.status)}</div>${reagBadge}${staleBadge(proc)}
            </div>
            <div class="card-body">
                ${!_ehColeta(proc) ? `
                <div class="card-row">
                    <span class="card-label">Médico</span>
                    <span class="card-value">${proc.medico}</span>
                </div>
                ${proc.paciente ? '<div class="card-row"><span class="card-label">Paciente</span><span class="card-value">' + proc.paciente + (proc.nf ? ' <span style="background:rgba(42,159,191,0.12);border:1px solid rgba(42,159,191,0.4);color:#2a9fbf;border-radius:4px;padding:1px 7px;font-family:var(--mono);font-size:0.78rem;font-weight:700;margin-left:6px;">NF\u00a0' + proc.nf + '</span>' : '') + '</span></div>' : ''}
                <div class="card-row">
                    <span class="card-label">Procedimento</span>
                    <span class="card-value">${proc.procedimento}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">Convênio</span>
                    <span class="card-value">${proc.convenio}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">Vendedor</span>
                    <span class="card-value">${proc.vendedor}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">Linha</span>
                    <span class="card-value">${proc.linha || '—'}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">Data</span>
                    <span class="card-value">${dataFmt}${proc.data ? diasBadge(proc.data) : ''}</span>
                </div>
                ${proc.inicio ? `<div class="card-row"><span class="card-label">Hora</span><span class="card-value">${proc.inicio}</span></div>` : ''}
                ${proc.nf ? `<div class="card-row"><span class="card-label">NF</span><span class="card-value" style="color:#2a9fbf;font-family:var(--mono);font-weight:700;">${proc.nf}</span></div>` : ''}
                ${(proc.retirada && !_ehColeta(proc)) ? `<div class="card-row"><span class="card-label">📦 Ret.</span><span class="card-value" style="color:#f97316;font-family:var(--mono);font-weight:700;">${new Date(proc.retirada+'T00:00:00').toLocaleDateString('pt-BR')}</span></div>` : ''}
                ${proc.equipe ? '<div class="card-row"><span class="card-label">Equipe</span><span class="card-value">' + proc.equipe + '</span></div>' : ''}
                ${proc.nf ? '<div class="card-row"><span class="card-label">Nota Fiscal</span><span class="card-value">NF ' + proc.nf + (proc.nfData ? ' · ' + new Date(proc.nfData + 'T00:00:00').toLocaleDateString('pt-BR') : '') + '</span></div>' : ''}
                ` : ''}
                ${proc.retirada ? (() => {
                    const hoje2 = todayStr();
                    const vencida = proc.retirada < hoje2;
                    const ehHoje = proc.retirada === hoje2;
                    const cor = vencida ? '#ff3333' : (ehHoje ? '#f97316' : '#4bb4d2');
                    const label = vencida ? '❌ VENCIDA' : (ehHoje ? '⏰ HOJE' : '📅 DATA RETIRADA');
                    const amanhaCd = new Date(); amanhaCd.setDate(amanhaCd.getDate() + 1);
                    const amanhaCdStr = `${amanhaCd.getFullYear()}-${String(amanhaCd.getMonth()+1).padStart(2,'0')}-${String(amanhaCd.getDate()).padStart(2,'0')}`;
                    const isAlerta = proc.retirada <= amanhaCdStr;
                    const pulseStyle = (isAlerta && proc.status !== 'concluido' && proc.status !== 'cancelado' && proc.status !== 'a_retirar')
                        ? 'animation:livePulse 1s infinite;display:inline-block;'
                        : '';
                    const dataBadge = `<span style="background:rgba(255,255,255,0.07);border:1px solid ${cor};color:${cor};border-radius:4px;padding:1px 7px;font-family:var(--mono);font-size:0.82rem;font-weight:700;${pulseStyle}">${label ? label + ' · ' : ''}${new Date(proc.retirada + 'T00:00:00').toLocaleDateString('pt-BR')}</span>`;
                    return `<div class="card-row" id="retirada-${proc.id}"><span class="card-label">📦 Retirada</span><span class="card-value">${dataBadge}</span></div>`;
                })() : (proc.status === 'a_retirar' ? `<div class="card-row"><span class="card-label">📦 Retirada</span><span class="card-value" style="color:#f97316;font-weight:700;animation:pillPulseRetirar 0.8s ease-in-out infinite;">⚠ Data não informada!</span></div>` : '')}
                ${proc.status === 'urgencia' ? `<div class="card-row" style="background:rgba(255,0,0,0.1);border-radius:6px;padding:6px 8px;margin-top:4px;animation:urgenciaRowBlink 0.5s ease-in-out infinite;"><span style="color:#ff3333;font-family:var(--mono);font-size:0.84rem;font-weight:700;letter-spacing:0.1em;">🚨 PROCEDIMENTO EM URGÊNCIA — AÇÃO IMEDIATA!</span></div>` : ''}
                ${reagVencido ? `<div class="card-row" style="background:rgba(239,68,68,0.08);border-radius:6px;padding:6px 8px;margin-top:4px;animation:cardPiscarReagVencido 1s ease-in-out infinite;"><span style="color:#ef4444;font-family:var(--mono);font-size:0.82rem;font-weight:700;letter-spacing:0.08em;">⚠ REAGENDADO SEM NOVA DATA — ATUALIZAR DATA DA CIRURGIA!</span></div>` : ''}
                                ${proc.status === 'coleta_urgente' ? `<div class="card-row" style="background:rgba(99,102,241,0.1);border-radius:6px;padding:6px 8px;margin-top:4px;animation:cardPiscarColeta 0.6s ease-in-out infinite;"><span style="color:#818cf8;font-family:var(--mono);font-size:0.84rem;font-weight:700;letter-spacing:0.08em;">✈️ AGUARDANDO RETIRADA — VOLUMES URGENTES</span></div>` : ''}
                ${_ehColeta(proc) && proc.coletaDataCirurgia ? `<div class="card-row"><span class="card-label">🗓 Cirurgia</span><span class="card-value" style="color:#818cf8;font-weight:700;">${new Date(proc.coletaDataCirurgia+'T00:00:00').toLocaleDateString('pt-BR')}</span></div>` : ''}
                ${_ehColeta(proc) && proc.coletaHoraCirurgia ? `<div class="card-row"><span class="card-label">⏰ Hr. Cir.</span><span class="card-value" style="color:#818cf8;font-weight:700;">${proc.coletaHoraCirurgia}</span></div>` : ''}
                ${_ehColeta(proc) && proc.dataRetirar ? `<div class="card-row"><span class="card-label">📦 Retirada</span><span class="card-value" style="color:#818cf8;font-weight:700;">${new Date(proc.dataRetirar+'T00:00:00').toLocaleDateString('pt-BR')}</span></div>` : ''}
                ${_ehColeta(proc) && proc.horaRetirar ? `<div class="card-row"><span class="card-label">⏰ Hr. Ret.</span><span class="card-value" style="color:#818cf8;font-weight:700;">${proc.horaRetirar}</span></div>` : ''}
                ${_ehColeta(proc) && proc.nfCompra ? `<div class="card-row"><span class="card-label">🧾 NF Compra</span><span class="card-value" style="color:#818cf8;font-weight:700;">${proc.nfCompra}</span></div>` : ''}
                ${_ehColeta(proc) && proc.cte ? `<div class="card-row"><span class="card-label">📦 CTE</span><span class="card-value" style="color:#818cf8;font-weight:700;">${proc.cte}</span></div>` : ''}
                ${_ehColeta(proc) && proc.coletaFornecedor ? `<div class="card-row"><span class="card-label">🏭 Fornecedor</span><span class="card-value" style="color:#818cf8;font-weight:700;">${proc.coletaFornecedor}</span></div>` : ''}
                ${_ehColeta(proc) && proc.coletaTransportadora ? `<div class="card-row"><span class="card-label">🚚 Transportadora</span><span class="card-value" style="color:#818cf8;font-weight:700;">${proc.coletaTransportadora}</span></div>` : ''}
                ${proc.anexo ? `<div class="card-row"><span class="card-label">📎 Anexo</span><span class="card-value"><button onclick="window.abrirAnexoProc('${realIndex}','anexo')" style="background:none;border:none;cursor:pointer;color:var(--accent);font-size:0.86rem;padding:0;font-family:inherit;text-decoration:underline;">📎 Ver imagem</button></span></div>` : ''}
                ${timerHTML}
                ${itensHTML}
                ${obsHTML}
            </div>
            ${buildObsInlineHTML(proc, realIndex)}
            <div class="card-actions">
                <button class="btn-act edit" onclick="editProc('${realIndex}')">✏ Editar</button>
                ${agendarRetiradaBtn}
                ${retirarConfBtn}
                ${coletaConfRetiradaBtn}
                ${retirarBtn}
                ${coletaInfoBtn}
                <button class="btn-act" style="background:rgba(42,159,191,0.1);border-color:var(--accent);color:var(--accent);" onclick="duplicarProc('${realIndex}')" title="Duplicar procedimento">⊕ Duplicar</button>
                <button class="btn-act" style="background:rgba(37,211,102,0.1);border-color:rgba(37,211,102,0.5);color:#25d366;" onclick="compartilharWhatsApp('${realIndex}')" title="Compartilhar via WhatsApp">📲 WhatsApp</button>
                <button class="btn-act del" onclick="deleteProc('${realIndex}')">✕ Excluir</button>
            </div>
            ${!_ehColeta(proc) ? buildQuickStatusHTML(proc, realIndex) : ''}
        </div>`;
}


// ─── CONFIRMAÇÃO DE COLETA — ALERT CLICK ───
function perguntarColetaRealizada(docId, tipo) {
    const proc = procedimentos.find(p => p._docId === docId);
    if (!proc) return;
    const label = tipo === 'coleta_urgente' ? 'Coleta Prioritária' : 'Aguardando Retirada';
    const hospital = proc.hospital || '—';
    const paciente = proc.paciente ? ` · ${proc.paciente}` : '';

    const overlay = document.createElement('div');
    overlay.id = 'modalColetaConfirm';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
        <div style="background:#f0faf3;border:1.5px solid #87c396;border-radius:18px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 12px 40px rgba(0,0,0,0.22);font-family:'Inter',sans-serif;">
            <div style="font-size:1.5rem;text-align:center;margin-bottom:10px;">📦✈️</div>
            <div style="font-weight:700;font-size:1.05rem;color:#0a2a35;text-align:center;margin-bottom:4px;">${label}</div>
            <div style="color:#2a8aa0;font-size:0.88rem;text-align:center;margin-bottom:20px;">${hospital}${paciente}</div>
            <div style="font-size:1rem;color:#0a2a35;font-weight:600;text-align:center;margin-bottom:22px;">A coleta foi realizada?</div>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button id="btnColetaSim" style="flex:1;padding:12px;background:linear-gradient(135deg,#2a9fbf,#4db87a);border:none;color:#fff;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.95rem;letter-spacing:0.04em;box-shadow:0 4px 14px rgba(77,184,122,0.35);">✅ Sim, foi coletado</button>
                <button id="btnColetaNao" style="flex:1;padding:12px;background:rgba(217,79,79,0.1);border:1.5px solid rgba(217,79,79,0.4);color:#d94f4f;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.95rem;letter-spacing:0.04em;">❌ Não</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector('#btnColetaSim').onclick = async () => {
        overlay.remove();
        const idx = procedimentos.findIndex(p => p._docId === docId);
        if (idx === -1) return;
        procedimentos[idx].status = 'concluido';
        try {
            const { setDoc, doc } = window._fbModules;
            await setDoc(doc(window._fbDb, window._fbColl, docId), procedimentos[idx]);
            window.showSyncToast('✅ Coleta marcada como concluída!');
        } catch(e) { console.error(e); }
        renderCards(); updateStats(); updateAlerts();
    };

    overlay.querySelector('#btnColetaNao').onclick = async () => {
        overlay.remove();
        const idx = procedimentos.findIndex(p => p._docId === docId);
        if (idx === -1) return;
        procedimentos[idx].status = 'a_retirar';
        try {
            const { setDoc, doc } = window._fbModules;
            await setDoc(doc(window._fbDb, window._fbColl, docId), procedimentos[idx]);
            window.showSyncToast('📦 Status atualizado para Aguardando Retirada');
        } catch(e) { console.error(e); }
        renderCards(); updateStats(); updateAlerts();
    };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

// ─── TOGGLE OCULTOS (concluído/cancelado) ───
function toggleOcultos() {
    mostrarOcultos = !mostrarOcultos;
    const btn = document.getElementById('btn-toggle-ocultos');
    if (btn) {
        btn.style.background = mostrarOcultos ? 'rgba(99,102,241,0.18)' : 'rgba(107,114,128,0.12)';
        btn.style.color = mostrarOcultos ? '#6366f1' : '#6b7280';
        btn.style.borderColor = mostrarOcultos ? 'rgba(99,102,241,0.5)' : 'rgba(107,114,128,0.35)';
        btn.textContent = mostrarOcultos ? '👁 Ocultos (visíveis)' : '👁 Ocultos';
    }
    renderCards();
}

// ─── MARCAR MATERIAL RETIRADO NA TABELA ───
async function marcarMaterialRetirado(docId, valor) {
    const idx = procedimentos.findIndex(p => (p._docId || p.id) == docId);
    if (idx === -1) return;
    procedimentos[idx].materialRetirado = procedimentos[idx].materialRetirado === valor ? null : valor;
    try {
        const { setDoc, doc } = window._fbModules;
        await setDoc(doc(window._fbDb, window._fbColl, procedimentos[idx]._docId), procedimentos[idx]);
        window.showSyncToast(valor === 'sim' ? '✅ Material marcado como retirado!' : '❌ Material marcado como não retirado');
    } catch(e) { console.error(e); }
    renderCards();
}

// ─── CONFIRMAÇÃO RETIRADA AGENDADA — ALERT CLICK ───
function perguntarMaterialRetirado(docId) {
    const proc = procedimentos.find(p => p._docId === docId);
    if (!proc) return;
    const hospital = proc.hospital || '—';
    const paciente = proc.paciente ? ` · ${proc.paciente}` : '';
    const dataFmt = proc.retirada ? new Date(proc.retirada+'T00:00:00').toLocaleDateString('pt-BR') : '—';

    const overlay = document.createElement('div');
    overlay.id = 'modalMatRetirado';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
        <div style="background:#f0faf3;border:1.5px solid #87c396;border-radius:18px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 12px 40px rgba(0,0,0,0.22);font-family:'Inter',sans-serif;">
            <div style="font-size:1.5rem;text-align:center;margin-bottom:10px;">🚚📦</div>
            <div style="font-weight:700;font-size:1.05rem;color:#0a2a35;text-align:center;margin-bottom:4px;">Retirada Agendada</div>
            <div style="color:#2a8aa0;font-size:0.88rem;text-align:center;margin-bottom:4px;">${hospital}${paciente}</div>
            <div style="color:#f97316;font-family:var(--mono);font-size:0.82rem;text-align:center;margin-bottom:20px;">📅 Data: ${dataFmt}</div>
            <div style="font-size:1rem;color:#0a2a35;font-weight:600;text-align:center;margin-bottom:22px;">O material foi retirado?</div>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button id="btnMatSim" style="flex:1;padding:12px;background:linear-gradient(135deg,#2a9fbf,#4db87a);border:none;color:#fff;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.95rem;letter-spacing:0.04em;box-shadow:0 4px 14px rgba(77,184,122,0.35);">✅ Sim, foi retirado</button>
                <button id="btnMatNao" style="flex:1;padding:12px;background:rgba(217,79,79,0.1);border:1.5px solid rgba(217,79,79,0.4);color:#d94f4f;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.95rem;letter-spacing:0.04em;">❌ Não</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector('#btnMatSim').onclick = async () => {
        overlay.remove();
        const idx = procedimentos.findIndex(p => p._docId === docId);
        if (idx === -1) return;
        procedimentos[idx].materialRetirado = 'sim';
        procedimentos[idx].status = 'concluido';
        try {
            const { setDoc, doc } = window._fbModules;
            await setDoc(doc(window._fbDb, window._fbColl, docId), procedimentos[idx]);
            window.showSyncToast('✅ Material retirado — marcado como concluído!');
        } catch(e) { console.error(e); }
        renderCards(); updateStats(); updateAlerts();
    };

    overlay.querySelector('#btnMatNao').onclick = async () => {
        overlay.remove();
        const idx = procedimentos.findIndex(p => p._docId === docId);
        if (idx === -1) return;
        procedimentos[idx].materialRetirado = 'nao';
        procedimentos[idx].status = 'a_retirar';
        try {
            const { setDoc, doc } = window._fbModules;
            await setDoc(doc(window._fbDb, window._fbColl, docId), procedimentos[idx]);
            window.showSyncToast('📦 Status atualizado para Aguardando Retirada');
        } catch(e) { console.error(e); }
        renderCards(); updateStats(); updateAlerts();
    };

    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

// ─── MODAL INFORMAÇÕES RETIRAR VOLUMES URGENTES ───
function abrirInfoVolumesUrgentes(docId) {
    const proc = procedimentos.find(p => (p._docId || String(p.id)) === String(docId));
    if (!proc) return;
    const antigo = document.getElementById('modalInfoVolumes');
    if (antigo) antigo.remove();

    const dataCirurgia  = proc.coletaDataCirurgia || proc.data   || '';
    const horaCirurgia  = proc.coletaHoraCirurgia || proc.inicio || '';
    const dataRetirar   = proc.dataRetirar  || '';
    const horaRetirar   = proc.horaRetirar  || '';
    const cte           = proc.cte          || '';
    const nfCompra      = proc.nfCompra     || '';

    const overlay = document.createElement('div');
    overlay.id = 'modalInfoVolumes';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);padding:16px;overflow-y:auto;';
    overlay.innerHTML = `
        <div style="background:var(--surface);border:1px solid var(--border);border-top:4px solid #6366f1;border-radius:20px;padding:28px 30px;width:100%;max-width:520px;box-shadow:0 24px 64px rgba(0,0,0,0.4);animation:modalIn 0.25s cubic-bezier(0.4,0,0.2,1);margin:auto;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
                <div>
                    <div style="font-family:var(--mono);font-size:0.82rem;font-weight:700;letter-spacing:0.1em;color:#818cf8;text-transform:uppercase;margin-bottom:2px;">✈️ Volumes Urgentes — Informações</div>
                    <div style="font-size:0.78rem;color:var(--text-dim);font-family:var(--mono);">${proc.hospital}</div>
                </div>
                <button id="btnFecharInfoColeta" style="background:none;border:1px solid var(--border);color:var(--text-dim);width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:1rem;line-height:1;flex-shrink:0;">✕</button>
            </div>
            <div style="background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:12px 16px;margin-bottom:22px;">
                <div style="font-weight:700;color:var(--text);font-size:0.88rem;margin-bottom:4px;">${proc.procedimento}</div>
                <div style="font-family:var(--mono);font-size:0.73rem;color:var(--text-dim);">${proc.medico}</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                <div>
                    <label style="display:block;font-family:var(--mono);font-size:0.68rem;letter-spacing:0.09em;color:#818cf8;text-transform:uppercase;margin-bottom:6px;font-weight:700;">📅 Data do Procedimento</label>
                    <input id="ic-data-cirurgia" type="date" value="${dataCirurgia}" style="width:100%;background:var(--bg);border:1.5px solid rgba(99,102,241,0.35);color:var(--text);padding:9px 12px;border-radius:9px;font-family:var(--mono);font-size:0.88rem;outline:none;" onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='rgba(99,102,241,0.35)'">
                </div>
                <div>
                    <label style="display:block;font-family:var(--mono);font-size:0.68rem;letter-spacing:0.09em;color:#818cf8;text-transform:uppercase;margin-bottom:6px;font-weight:700;">⏰ Hora do Procedimento</label>
                    <input id="ic-hora-cirurgia" type="time" value="${horaCirurgia}" style="width:100%;background:var(--bg);border:1.5px solid rgba(99,102,241,0.35);color:var(--text);padding:9px 12px;border-radius:9px;font-family:var(--mono);font-size:0.88rem;outline:none;" onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='rgba(99,102,241,0.35)'">
                </div>
                <div>
                    <label style="display:block;font-family:var(--mono);font-size:0.68rem;letter-spacing:0.09em;color:var(--text-dim);text-transform:uppercase;margin-bottom:6px;font-weight:700;">📦 Data de Retirada</label>
                    <input id="ic-data-retirar" type="date" value="${dataRetirar}" style="width:100%;background:var(--bg);border:1.5px solid rgba(99,102,241,0.35);color:var(--text);padding:9px 12px;border-radius:9px;font-family:var(--mono);font-size:0.88rem;outline:none;" onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='rgba(99,102,241,0.35)'">
                </div>
                <div>
                    <label style="display:block;font-family:var(--mono);font-size:0.68rem;letter-spacing:0.09em;color:var(--text-dim);text-transform:uppercase;margin-bottom:6px;font-weight:700;">⏰ Hora de Retirada</label>
                    <input id="ic-hora-retirar" type="time" value="${horaRetirar}" style="width:100%;background:var(--bg);border:1.5px solid rgba(99,102,241,0.35);color:var(--text);padding:9px 12px;border-radius:9px;font-family:var(--mono);font-size:0.88rem;outline:none;" onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='rgba(99,102,241,0.35)'">
                </div>
                <div>
                    <label style="display:block;font-family:var(--mono);font-size:0.68rem;letter-spacing:0.09em;color:var(--text-dim);text-transform:uppercase;margin-bottom:6px;font-weight:700;">📦 Nº CTE</label>
                    <input id="ic-cte" type="text" placeholder="Ex: 9876543" value="${cte}" style="width:100%;background:var(--bg);border:1.5px solid rgba(99,102,241,0.35);color:var(--text);padding:9px 12px;border-radius:9px;font-family:var(--mono);font-size:0.88rem;outline:none;" onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='rgba(99,102,241,0.35)'">
                </div>
                <div>
                    <label style="display:block;font-family:var(--mono);font-size:0.68rem;letter-spacing:0.09em;color:var(--text-dim);text-transform:uppercase;margin-bottom:6px;font-weight:700;">🧾 Nº Nota Fiscal</label>
                    <input id="ic-nf-compra" type="text" placeholder="Ex: 001234" value="${nfCompra}" style="width:100%;background:var(--bg);border:1.5px solid rgba(99,102,241,0.35);color:var(--text);padding:9px 12px;border-radius:9px;font-family:var(--mono);font-size:0.88rem;outline:none;" onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='rgba(99,102,241,0.35)'">
                </div>
            </div>
            <div style="display:flex;gap:10px;margin-top:24px;">
                <button id="btnCancelarInfoColeta" style="flex:1;padding:11px;background:transparent;border:1px solid var(--border);color:var(--text-dim);border-radius:10px;cursor:pointer;font-family:var(--mono);font-size:0.78rem;font-weight:600;">Cancelar</button>
                <button id="btnSalvarInfoColeta" style="flex:2;padding:11px;background:linear-gradient(135deg,#6366f1,#818cf8);border:none;color:#fff;border-radius:10px;cursor:pointer;font-family:var(--mono);font-size:0.78rem;font-weight:700;letter-spacing:0.06em;box-shadow:0 4px 14px rgba(99,102,241,0.35);">💾 Salvar Informações</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
    document.getElementById('btnFecharInfoColeta').onclick   = () => overlay.remove();
    document.getElementById('btnCancelarInfoColeta').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('btnSalvarInfoColeta').onclick = async () => {
        proc.coletaDataCirurgia = document.getElementById('ic-data-cirurgia').value;
        proc.coletaHoraCirurgia = document.getElementById('ic-hora-cirurgia').value;
        proc.dataRetirar        = document.getElementById('ic-data-retirar').value;
        proc.horaRetirar        = document.getElementById('ic-hora-retirar').value;
        proc.cte                = document.getElementById('ic-cte').value.trim();
        proc.nfCompra           = document.getElementById('ic-nf-compra').value.trim();
        try {
            const { setDoc, doc } = window._fbModules;
            await setDoc(doc(window._fbDb, window._fbColl, proc._docId), proc);
            showSyncToast('✈️ Informações de coleta salvas!');
            overlay.remove();
        } catch(err) { alert('Erro ao salvar: ' + err.message); }
    };
}


// Update timers without full re-render
function updateTimers() {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    procedimentos.forEach(proc => {
        if (proc.status !== 'andamento' || proc.data !== todayStr()) return;
        const el = document.getElementById('timer-' + proc.id);
        const prog = document.getElementById('prog-' + proc.id);
        if (!el) return;
        const e = getElapsed(proc);
        if (!e) return;
        const timeStr = e.overdue ? `+${minutesToStr(-e.remaining)}` : minutesToStr(e.elapsed);
        el.textContent = timeStr;
        if (e.overdue) el.classList.add('overdue'); else el.classList.remove('overdue');
        if (prog) {
            prog.style.width = e.progress + '%';
            prog.className = 'progress-bar ' + (e.overdue ? 'over' : (e.progress > 80 ? 'warn' : 'ok'));
        }
    });
}

// ─── TIMELINE ───
function renderTimeline() {
    const container = document.getElementById('timelineContainer');
    const today = todayStr();
    // Todos os procedimentos filtrados, ordenados por data+hora
    const list = getFiltered().slice().sort((a,b) => {
        const da = a.data || '9999-99-99';
        const db = b.data || '9999-99-99';
        if (da !== db) return da < db ? -1 : 1;
        const ha = a.inicio || '99:99';
        const hb = b.inicio || '99:99';
        return ha < hb ? -1 : 1;
    });

    // Determine time range (7h to 20h default)
    let minH = 7, maxH = 20;
    list.forEach(p => {
        if (p.inicio) minH = Math.min(minH, Math.floor(timeToMinutes(p.inicio) / 60) - 1);
    });
    minH = Math.max(0, minH);
    maxH = Math.min(24, maxH);
    const totalMins = (maxH - minH) * 60;

    // Now position
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowPct = Math.max(0, Math.min(100, (nowMin - minH * 60) / totalMins * 100));

    // Hours header
    const hours = [];
    for (let h = minH; h <= maxH; h++) {
        hours.push(`<div class="tl-hour">${String(h).padStart(2,'0')}:00</div>`);
    }

    // Rows
    const rows = list.length === 0
        ? '<div class="empty-state">Nenhum procedimento para hoje</div>'
        : list.map((proc) => {
            const start = timeToMinutes(proc.inicio);
            if (start === null) return '';
            const leftPct = (start - minH * 60) / totalMins * 100;
            return `
            <div class="timeline-row">
                <div class="tl-label">
                    ${proc.hospital.replace('Hospital ', '')}
                    <span>${proc.medico}</span>
                </div>
                <div class="tl-track">
                    <div class="tl-track-bg">${hours.map(() => '<div class="tl-segment"></div>').join('')}</div>
                    <div class="tl-now-line" style="left:${nowPct}%"></div>
                    <div class="tl-bar ${proc.status}" style="left:${Math.max(0,leftPct - 0.5)}%;width:auto;min-width:fit-content;" title="${proc.procedimento}">
                        ${proc.inicio} · ${proc.procedimento || proc.hospital}
                    </div>
                </div>
            </div>`;
        }).join('');

    // Mini-cards coluna esquerda
    const statusColors = {
        a_agendar:'#06b6d4', agendado:'#4db87a', em_transito:'#6366f1', preparacao:'#d4920a',
        andamento:'#d94f4f', concluido:'#64748b', cancelado:'#f87171',
        reagendado:'#a78bfa', a_retirar:'#f97316', urgencia:'#ff0000'
    };
    const statusNames = {
        a_agendar:'Autorizado', agendado:'Agendado', em_transito:'Em Trânsito', preparacao:'Em Separação',
        andamento:'Em Procedimento', concluido:'Concluído', cancelado:'Cancelado',
        reagendado:'Reagendado', a_retirar:'A Retirar', urgencia:'🚨 Urgência'
    };

    const miniCards = list.length === 0
        ? '<div style="padding:20px;color:var(--text-dim);font-size:0.82rem;text-align:center;">Nenhum procedimento nos próximos 7 dias</div>'
        : list.map(proc => {
            const cor = statusColors[proc.status] || 'var(--border)';
            const docId = proc._docId || String(proc.id);
            const dataFmt = proc.data
                ? new Date(proc.data+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})
                : null;
            const isToday = proc.data === today;
            return `<div class="tl-mini-card status-${proc.status}" onclick="editProc('${docId}')">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
                    <div class="tl-mc-hospital" style="flex:1">${proc.hospital || '—'}</div>
                    ${dataFmt ? `<span style="font-family:var(--mono);font-size:0.62rem;font-weight:700;color:${isToday?'var(--accent)':'var(--text-dim)'};white-space:nowrap;">${isToday?'HOJE':dataFmt}</span>` : '<span style="font-size:0.6rem;color:var(--text-dim)">s/ data</span>'}
                </div>
                <div class="tl-mc-medico">${proc.medico || '—'}</div>
                <div class="tl-mc-row">
                    <span class="tl-mc-time">${proc.inicio || '— s/ hora'}</span>
                    <span class="tl-mc-pill" style="background:${cor}22;color:${cor};border:1px solid ${cor}55;">
                        ${statusNames[proc.status] || proc.status}
                    </span>
                </div>
                ${proc.procedimento ? `<div class="tl-mc-proc">🔬 ${proc.procedimento}</div>` : ''}
                ${proc.paciente   ? `<div class="tl-mc-paciente">👤 ${proc.paciente}</div>` : ''}
                ${proc.vendedor   ? `<div class="tl-mc-vendedor">👤 ${proc.vendedor}</div>` : ''}
            </div>`;
        }).join('');

    container.innerHTML = `<div class="timeline-wrapper">
        <div class="tl-cards-col">${miniCards}</div>
        <div class="tl-bars-col">
            <div class="timeline-container">
                <div class="timeline-header">
                    <div class="tl-hours">${hours.join('')}</div>
                </div>
                ${rows}
            </div>
        </div>
    </div>`;
}

// ─── ACTIONS ───
async function conclude(docId) {
    const proc = procedimentos.find(p => (p._docId || String(p.id)) === String(docId));
    if (!proc) return;
    const resposta = await promptConcluir(proc);
    if (!resposta) return;
    proc.procedimentoOcorreu = resposta.ocorreu;
    proc.produtoRetornou = resposta.retornou;
    if (resposta.retornou === 'sim') {
        proc.status = 'concluido';
    } else if (resposta.retornou === 'nao') {
        proc.status = 'a_retirar';
    } else {
        proc.status = 'concluido';
    }
    await fbSaveProc(proc);

    // ── Abrir Ficha OPME pré-montada após conclusão ──
    if (proc.status === 'concluido') {
        setTimeout(() => abrirOpmePosConclusao(proc), 400);
    }
}

// ── MODAL FICHA OPME PÓS-CONCLUSÃO ──
window.abrirOpmePosConclusao = function(proc) {
    const antigo = document.getElementById('modal-opme-conclusao');
    if (antigo) antigo.remove();

    const dataISO = proc.data || new Date().toISOString().split('T')[0];
    const dataFmt = dataISO ? dataISO.split('-').reverse().join('/') : '—';
    let opmeItemIdx = 0;

    const overlay = document.createElement('div');
    overlay.id = 'modal-opme-conclusao';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,40,20,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);overflow-y:auto;padding:20px 0;';

    overlay.innerHTML = `
    <div id="opme-conclusao-box" style="
        background:rgba(240,250,244,0.98);
        border:1px solid rgba(135,195,150,0.3);
        border-top:3px solid #87c396;
        border-radius:20px;
        width:90%;max-width:620px;
        max-height:92vh;
        overflow-y:auto;
        box-shadow:0 28px 70px rgba(10,40,20,0.3);
        animation:modalIn 0.28s cubic-bezier(0.4,0,0.2,1);
        padding-bottom:8px;
    ">
        <!-- Cabeçalho -->
        <div style="background:linear-gradient(90deg,#0a2a35 0%,#1a5570 55%,#2a9fbf 100%);border-radius:17px 17px 0 0;padding:14px 22px;display:flex;align-items:center;gap:12px;">
            <span style="font-family:var(--mono);font-size:0.68rem;background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:2px 9px;color:#fff;letter-spacing:0.06em;">📋 FICHA OPME</span>
            <span style="font-family:'Space Grotesk',sans-serif;font-size:1.0rem;font-weight:700;color:#fff;flex:1;">${proc.paciente || proc.procedimento || '—'}</span>
            <span style="font-family:var(--mono);font-size:0.7rem;color:rgba(255,255,255,0.75);">🗓️ ${dataFmt}</span>
            <button onclick="document.getElementById('modal-opme-conclusao').remove()" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:0.9rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;">✕</button>
        </div>

        <!-- Meta -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid rgba(135,195,150,0.22);">
            <div style="padding:9px 16px;border-right:1px solid rgba(135,195,150,0.2);">
                <div style="font-family:var(--mono);font-size:0.58rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:2px;">Médico</div>
                <div style="font-size:0.82rem;font-weight:600;color:var(--text);">${proc.medico || '—'}</div>
            </div>
            <div style="padding:9px 16px;border-right:1px solid rgba(135,195,150,0.2);">
                <div style="font-family:var(--mono);font-size:0.58rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:2px;">Hospital</div>
                <div style="font-size:0.82rem;font-weight:600;color:var(--text);">${proc.hospital || '—'}</div>
            </div>
            <div style="padding:9px 16px;">
                <div style="font-family:var(--mono);font-size:0.58rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:2px;">Convênio</div>
                <div style="font-size:0.82rem;font-weight:600;color:var(--text);">${proc.convenio || proc.plano || '—'}</div>
            </div>
        </div>

        <!-- Formulário de itens -->
        <div style="padding:16px 20px 12px;">
            <div style="font-family:var(--mono);font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:10px;display:flex;align-items:center;gap:6px;">
                🔩 Itens OPME Utilizados
                <span style="font-size:0.58rem;opacity:0.6;">(preencha descrição, referência, lote e quantidade)</span>
            </div>

            <!-- Header colunas -->
            <div style="display:grid;grid-template-columns:2.2fr 1.3fr 0.95fr 0.6fr 32px;gap:7px;padding:4px 2px;font-family:var(--mono);font-size:0.58rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-dim);border-bottom:1.5px solid rgba(135,195,150,0.3);margin-bottom:8px;">
                <span>Descrição</span><span>Referência / Cód.</span><span>Lote</span><span>Qtd.</span><span></span>
            </div>

            <div id="opme-conc-itens"></div>

            <button onclick="opmeConc_addItem()" style="display:inline-flex;align-items:center;gap:6px;background:rgba(135,195,150,0.12);border:1.5px dashed rgba(135,195,150,0.5);color:var(--text-dim);border-radius:8px;padding:7px 14px;font-family:var(--mono);font-size:0.72rem;font-weight:700;cursor:pointer;margin-top:4px;transition:all 0.18s;" onmouseover="this.style.borderColor='#87c396';this.style.color='var(--accent)'" onmouseout="this.style.borderColor='rgba(135,195,150,0.5)';this.style.color='var(--text-dim)'">
                ＋ Adicionar Item
            </button>
        </div>

        <!-- Assinaturas (visual apenas) -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid rgba(135,195,150,0.22);margin:0 20px;">
            ${[['Médico Responsável', proc.medico||''],['Representante / Técnico','GF Medical'],['Enfermagem / Recebimento','']].map(([lbl,nm])=>`
            <div style="padding:12px 8px 10px;text-align:center;border-right:1px solid rgba(135,195,150,0.2);">
                <div style="border-top:1.5px solid #2a9fbf;margin:18px 6px 5px;"></div>
                <div style="font-family:var(--mono);font-size:0.58rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-dim);">${lbl}</div>
                ${nm ? `<div style="font-size:0.72rem;font-weight:600;color:var(--text);margin-top:2px;">${nm}</div>` : ''}
            </div>`).join('')}
        </div>

        <!-- Ações -->
        <div style="display:flex;gap:10px;padding:14px 20px 6px;flex-wrap:wrap;">
            <button onclick="opmeConc_gerar('${proc._docId||proc.id}', ${JSON.stringify(proc).replace(/'/g,"\\'")})" style="flex:2;padding:11px;background:linear-gradient(135deg,#4bb4d2,#87c396);color:#fff;border:none;border-radius:10px;font-family:'Space Grotesk',sans-serif;font-size:0.82rem;font-weight:700;cursor:pointer;text-transform:uppercase;letter-spacing:0.05em;box-shadow:0 4px 14px rgba(75,180,210,0.3);">
                📄 Gerar Ficha OPME
            </button>
            <button onclick="document.getElementById('modal-opme-conclusao').remove()" style="flex:1;padding:11px;background:transparent;border:1px solid rgba(135,195,150,0.35);color:var(--text-dim);border-radius:10px;font-family:var(--mono);font-size:0.75rem;font-weight:700;cursor:pointer;">
                Agora não
            </button>
        </div>
        <div style="padding:6px 20px 10px;font-family:var(--mono);font-size:0.6rem;color:var(--text-dim);display:flex;justify-content:space-between;">
            <span>Gerado em: ${new Date().toLocaleString('pt-BR')}</span>
            <span>GF Medical · Campo Grande/MS</span>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Adicionar 1 item inicial
    window._opmeConc_idx = 0;
    opmeConc_addItem();

    // ── Funções internas do modal ──
    window.opmeConc_addItem = function() {
        window._opmeConc_idx = (window._opmeConc_idx || 0) + 1;
        const i = window._opmeConc_idx;
        const cont = document.getElementById('opme-conc-itens');
        if (!cont) return;
        const row = document.createElement('div');
        row.id = `opme-conc-row-${i}`;
        row.style.cssText = 'display:grid;grid-template-columns:2.2fr 1.3fr 0.95fr 0.6fr 32px;gap:7px;margin-bottom:7px;align-items:center;animation:cardIn 0.2s ease;';
        const inp = (ph, cls) => `<input type="text" class="${cls}" placeholder="${ph}" autocomplete="off" style="background:rgba(220,242,228,0.6);border:1px solid rgba(135,195,150,0.28);border-radius:9px;padding:8px 10px;color:#0d2d38;font-family:var(--sans);font-size:0.83rem;outline:none;width:100%;transition:border-color 0.2s;" onfocus="this.style.borderColor='#87c396'" onblur="this.style.borderColor='rgba(135,195,150,0.28)'">`;
        row.innerHTML = `
            ${inp('Ex: Stent Coronário...','opme-conc-desc')}
            ${inp('Ex: BSN-3518','opme-conc-ref')}
            ${inp('Ex: LOT24B','opme-conc-lote')}
            <input type="number" min="1" value="1" style="background:rgba(220,242,228,0.6);border:1px solid rgba(135,195,150,0.28);border-radius:9px;padding:8px 6px;color:var(--accent);font-family:var(--mono);font-size:0.85rem;font-weight:700;text-align:center;outline:none;width:100%;transition:border-color 0.2s;" class="opme-conc-qty" onfocus="this.style.borderColor='#87c396'" onblur="this.style.borderColor='rgba(135,195,150,0.28)'">
            <button onclick="document.getElementById('opme-conc-row-${i}').remove()" style="background:transparent;border:1px solid var(--border);color:var(--text-dim);border-radius:7px;width:30px;height:30px;cursor:pointer;font-size:0.85rem;display:flex;align-items:center;justify-content:center;transition:all 0.15s;flex-shrink:0;" onmouseover="this.style.color='var(--red)';this.style.borderColor='var(--red)'" onmouseout="this.style.color='var(--text-dim)';this.style.borderColor='var(--border)'">✕</button>`;
        cont.appendChild(row);
    };

    window.opmeConc_gerar = function(docId, procData) {
        const cont = document.getElementById('opme-conc-itens');
        if (!cont) return;
        const itens = [];
        cont.querySelectorAll('[id^="opme-conc-row-"]').forEach(row => {
            const desc = (row.querySelector('.opme-conc-desc').value || '').trim();
            const ref  = (row.querySelector('.opme-conc-ref').value || '').trim();
            const lote = (row.querySelector('.opme-conc-lote').value || '').trim();
            const qty  = parseInt(row.querySelector('.opme-conc-qty').value) || 1;
            if (desc) itens.push({ desc, ref, lote, qty });
        });
        if (itens.length === 0) {
            window.showSyncToast && window.showSyncToast('⚠️ Preencha ao menos um item OPME.');
            return;
        }

        // Monta a ficha no módulo OPME
        const p = typeof procData === 'string' ? JSON.parse(procData) : procData;
        const dataISO = p.data || new Date().toISOString().split('T')[0];

        // Garante que o módulo OPME está inicializado
        window.switchView && window.switchView('opme');

        // Aguarda renderização e injeta a ficha
        setTimeout(() => {
            const fichasMod = window._opme_fichas_ref;
            // Injeta diretamente no array global do módulo via evento customizado
            document.dispatchEvent(new CustomEvent('opme:inject-ficha', { detail: {
                paciente:    p.paciente || p.procedimento || '—',
                medico:      p.medico || '—',
                hospital:    p.hospital || '—',
                convenio:    p.convenio || p.plano || '—',
                representante: p.representante || '',
                data:        dataISO.split('-').reverse().join('/'),
                dataISO,
                itens,
                _procDocId:  docId,
                geradaEm:    new Date().toLocaleString('pt-BR')
            }}));
        }, 300);

        document.getElementById('modal-opme-conclusao') && document.getElementById('modal-opme-conclusao').remove();
        window.showSyncToast && window.showSyncToast('✅ Ficha OPME gerada! Acesse a aba 📋 Fichas OPME.');
    };
};

function promptConcluir(proc) {
    return new Promise(resolve => {
        const antigo = document.getElementById('modalConcluir');
        if (antigo) antigo.remove();
        const overlay = document.createElement('div');
        overlay.id = 'modalConcluir';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
        overlay.innerHTML = `
            <div style="background:var(--surface);border:1px solid var(--border);border-top:3px solid var(--green);border-radius:16px;padding:28px 32px;min-width:340px;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.35);animation:modalIn 0.25s cubic-bezier(0.4,0,0.2,1);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                    <span style="font-family:var(--mono);font-size:0.88rem;font-weight:700;letter-spacing:0.08em;color:var(--green);text-transform:uppercase;">✓ Concluir Procedimento</span>
                    <button id="btnFecharConcluir" style="background:none;border:1px solid var(--border);color:var(--text-dim);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:0.9rem;">✕</button>
                </div>
                <div style="margin-bottom:20px;font-size:0.82rem;color:var(--text-dim);line-height:1.5;">
                    <strong style="color:var(--text);">${proc.procedimento}</strong><br>
                    <span style="font-family:var(--mono);font-size:0.75rem;">${proc.medico} · ${proc.hospital}</span>
                </div>
                <div style="margin-bottom:16px;">
                    <div style="font-family:var(--mono);font-size:0.75rem;letter-spacing:0.08em;color:var(--text-dim);text-transform:uppercase;margin-bottom:10px;">O procedimento ocorreu?</div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn-ocorreu" data-val="sim" style="flex:1;padding:10px;border-radius:8px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s;">✅ SIM</button>
                        <button class="btn-ocorreu" data-val="nao" style="flex:1;padding:10px;border-radius:8px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s;">❌ NÃO</button>
                        <button class="btn-ocorreu" data-val="parcial" style="flex:1;padding:10px;border-radius:8px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s;">⚠️ PARCIAL</button>
                    </div>
                </div>
                <div style="margin-bottom:20px;">
                    <div style="font-family:var(--mono);font-size:0.75rem;letter-spacing:0.08em;color:var(--text-dim);text-transform:uppercase;margin-bottom:10px;">O produto retornou para a empresa?</div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn-retornou" data-val="sim" style="flex:1;padding:10px;border-radius:8px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s;">✅ SIM</button>
                        <button class="btn-retornou" data-val="nao" style="flex:1;padding:10px;border-radius:8px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s;">❌ NÃO</button>
                        <button class="btn-retornou" data-val="na" style="flex:1;padding:10px;border-radius:8px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s;">N/A</button>
                    </div>
                </div>
                <div style="display:flex;gap:10px;">
                    <button id="btnCancelarConcluir" style="flex:1;padding:10px;background:transparent;border:1px solid var(--border);color:var(--text-dim);border-radius:8px;cursor:pointer;font-family:var(--mono);font-size:0.78rem;font-weight:600;">Cancelar</button>
                    <button id="btnConfirmarConcluir" style="flex:2;padding:10px;background:var(--green);border:1px solid var(--green);color:#fff;border-radius:8px;cursor:pointer;font-family:var(--mono);font-size:0.78rem;font-weight:700;opacity:0.5;pointer-events:none;">✓ Confirmar Conclusão</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        let ocorreu = null, retornou = null;
        const fechar = (val) => { overlay.remove(); resolve(val); };

        const checkReady = () => {
            const btn = document.getElementById('btnConfirmarConcluir');
            if (ocorreu && retornou) { btn.style.opacity='1'; btn.style.pointerEvents='auto'; }
            else { btn.style.opacity='0.5'; btn.style.pointerEvents='none'; }
        };

        overlay.querySelectorAll('.btn-ocorreu').forEach(b => {
            b.onclick = () => {
                ocorreu = b.dataset.val;
                overlay.querySelectorAll('.btn-ocorreu').forEach(x => { x.style.background='transparent'; x.style.color='var(--text-dim)'; x.style.borderColor='var(--border)'; });
                b.style.background='rgba(16,185,129,0.15)'; b.style.color='var(--green)'; b.style.borderColor='var(--green)';
                checkReady();
            };
        });
        overlay.querySelectorAll('.btn-retornou').forEach(b => {
            b.onclick = () => {
                retornou = b.dataset.val;
                overlay.querySelectorAll('.btn-retornou').forEach(x => { x.style.background='transparent'; x.style.color='var(--text-dim)'; x.style.borderColor='var(--border)'; });
                b.style.background='rgba(16,185,129,0.15)'; b.style.color='var(--green)'; b.style.borderColor='var(--green)';
                checkReady();
            };
        });

        document.getElementById('btnFecharConcluir').onclick = () => fechar(null);
        document.getElementById('btnCancelarConcluir').onclick = () => fechar(null);
        document.getElementById('btnConfirmarConcluir').onclick = () => fechar({ ocorreu, retornou });
        overlay.onclick = (e) => { if (e.target === overlay) fechar(null); };
    });
}

async function marcarRetirada(docId) {
    const proc = procedimentos.find(p => (p._docId || String(p.id)) === String(docId));
    if (!proc) return;
    const hoje = new Date().toLocaleDateString('pt-BR');
    if (!confirm(`Confirmar retirada do material?\n\nProcedimento: ${proc.procedimento}\nMédico: ${proc.medico}\nData da retirada: ${hoje}`)) return;
    proc.status = 'a_retirar';
    proc.retirada = new Date().toISOString().split('T')[0];
    await fbSaveProc(proc);
}

async function agendarDataRetirada(docId) {
    const proc = procedimentos.find(p => (p._docId || String(p.id)) === String(docId));
    if (!proc) return;
    const resposta = await promptConfirmarRetirada(proc);
    if (!resposta) return;
    proc.retirada = resposta.data;
    proc.procedimentoOcorreu = proc.procedimentoOcorreu || resposta.ocorreu;
    proc.produtoRetornou = resposta.retornou;
    // Lógica de status:
    // Procedimento ocorreu E produto retornou → concluido
    // Procedimento ocorreu E produto NÃO retornou → a_retirar
    // Procedimento NÃO ocorreu → a_retirar
    // Lógica:
    // Produto retornou → concluido (independente de ocorreu)
    // Produto NÃO retornou → a_retirar (independente de ocorreu)
    if (resposta.retornou === 'sim') {
        proc.status = 'concluido';
    } else if (resposta.retornou === 'nao') {
        proc.status = 'a_retirar';
    } else {
        // N/A
        proc.status = 'concluido';
    }
    await fbSaveProc(proc);
}


// ─── CONFIRMAR RETIRADA — RETIRAR VOLUMES URGENTES (simplificado) ───
async function confirmarRetiradaVolumes(docId) {
    const proc = procedimentos.find(p => (p._docId || String(p.id)) === String(docId));
    if (!proc) return;
    const antigo = document.getElementById('modalConfRetiradaVolumes');
    if (antigo) antigo.remove();

    const dataAtual = proc.dataRetirar || new Date().toISOString().split('T')[0];

    const overlay = document.createElement('div');
    overlay.id = 'modalConfRetiradaVolumes';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:16px;';
    overlay.innerHTML = `
        <div style="background:var(--surface);border:1px solid var(--border);border-top:3px solid #6366f1;border-radius:16px;padding:28px 30px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,0.35);animation:modalIn 0.25s cubic-bezier(0.4,0,0.2,1);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
                <span style="font-family:var(--mono);font-size:0.82rem;font-weight:700;letter-spacing:0.08em;color:#818cf8;text-transform:uppercase;">✈️ Confirmar Retirada — Volumes Urgentes</span>
                <button id="btnFecharConfColeta" style="background:none;border:1px solid var(--border);color:var(--text-dim);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:0.9rem;">✕</button>
            </div>
            <div style="margin-bottom:20px;font-size:0.82rem;color:var(--text-dim);line-height:1.5;border-bottom:1px solid var(--border);padding-bottom:14px;">
                <strong style="color:var(--text);">${proc.procedimento}</strong><br>
                <span style="font-family:var(--mono);font-size:0.73rem;">${proc.medico} · ${proc.hospital}</span>
            </div>
            <div style="margin-bottom:20px;">
                <div style="font-family:var(--mono);font-size:0.75rem;letter-spacing:0.08em;color:var(--text-dim);text-transform:uppercase;margin-bottom:10px;">O material foi retirado?</div>
                <div style="display:flex;gap:10px;">
                    <button class="btn-coleta-retirou" data-val="sim" style="flex:1;padding:12px;border-radius:10px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.85rem;font-weight:700;cursor:pointer;transition:all 0.2s;">✅ SIM</button>
                    <button class="btn-coleta-retirou" data-val="nao" style="flex:1;padding:12px;border-radius:10px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.85rem;font-weight:700;cursor:pointer;transition:all 0.2s;">❌ NÃO</button>
                </div>
            </div>
            <div style="margin-bottom:20px;">
                <label style="display:block;font-size:0.75rem;font-family:var(--mono);letter-spacing:0.08em;color:var(--text-dim);text-transform:uppercase;margin-bottom:7px;">Data de Retirada</label>
                <input id="inputDataConfColeta" type="date" value="${dataAtual}" style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:10px 12px;border-radius:8px;font-family:var(--mono);font-size:0.9rem;outline:none;transition:border-color 0.2s;" onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='var(--border)'">
            </div>
            <div style="display:flex;gap:10px;">
                <button id="btnCancelarConfColeta" style="flex:1;padding:10px;background:transparent;border:1px solid var(--border);color:var(--text-dim);border-radius:8px;cursor:pointer;font-family:var(--mono);font-size:0.78rem;font-weight:600;">Cancelar</button>
                <button id="btnSalvarConfColeta" style="flex:2;padding:10px;background:linear-gradient(135deg,#6366f1,#818cf8);border:none;color:#fff;border-radius:8px;cursor:pointer;font-family:var(--mono);font-size:0.78rem;font-weight:700;letter-spacing:0.06em;opacity:0.45;pointer-events:none;box-shadow:0 4px 14px rgba(99,102,241,0.3);">✈️ Confirmar</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    let retirou = null;

    const checkReady = () => {
        const btn = document.getElementById('btnSalvarConfColeta');
        if (retirou) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
        else { btn.style.opacity = '0.45'; btn.style.pointerEvents = 'none'; }
    };

    overlay.querySelectorAll('.btn-coleta-retirou').forEach(b => {
        b.onclick = () => {
            retirou = b.dataset.val;
            overlay.querySelectorAll('.btn-coleta-retirou').forEach(x => {
                x.style.background = 'transparent'; x.style.color = 'var(--text-dim)'; x.style.borderColor = 'var(--border)';
            });
            const cor = retirou === 'sim' ? '#6366f1' : '#f97316';
            b.style.background = retirou === 'sim' ? 'rgba(99,102,241,0.15)' : 'rgba(249,115,22,0.15)';
            b.style.color = cor; b.style.borderColor = cor;
            checkReady();
        };
    });

    const fechar = () => { overlay.remove(); };

    document.getElementById('btnFecharConfColeta').onclick  = fechar;
    document.getElementById('btnCancelarConfColeta').onclick = fechar;
    overlay.onclick = e => { if (e.target === overlay) fechar(); };

    document.getElementById('btnSalvarConfColeta').onclick = async () => {
        const data = document.getElementById('inputDataConfColeta').value;
        proc.dataRetirar = data;
        proc.status = retirou === 'sim' ? 'concluido' : 'a_retirar';
        try {
            await fbSaveProc(proc);
            showSyncToast(retirou === 'sim' ? '✅ Coleta concluída!' : '📦 Aguardando retirada');
            fechar();
        } catch(e) {
            alert('Erro ao salvar: ' + e.message);
        }
    };
}

function promptConfirmarRetirada(proc) {
    return new Promise(resolve => {
        const antigo = document.getElementById('modalConfirmarRetirada');
        if (antigo) antigo.remove();
        const dataAtual = proc.retirada || new Date().toISOString().split('T')[0];
        const overlay = document.createElement('div');
        overlay.id = 'modalConfirmarRetirada';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
        overlay.innerHTML = `
            <div style="background:var(--surface);border:1px solid var(--border);border-top:3px solid #f97316;border-radius:16px;padding:28px 32px;min-width:360px;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,0.35);animation:modalIn 0.25s cubic-bezier(0.4,0,0.2,1);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
                    <span style="font-family:var(--mono);font-size:0.85rem;font-weight:700;letter-spacing:0.08em;color:#f97316;text-transform:uppercase;">✅ Confirmar Retirada</span>
                    <button id="btnFecharConfRetirada" style="background:none;border:1px solid var(--border);color:var(--text-dim);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:0.9rem;">✕</button>
                </div>
                <div style="margin-bottom:18px;font-size:0.82rem;color:var(--text-dim);line-height:1.5;">
                    <strong style="color:var(--text);">${proc.procedimento}</strong><br>
                    <span style="font-family:var(--mono);font-size:0.75rem;">${proc.medico} · ${proc.hospital}</span>
                </div>
                <div style="margin-bottom:14px;">
                    <div style="font-family:var(--mono);font-size:0.75rem;letter-spacing:0.08em;color:var(--text-dim);text-transform:uppercase;margin-bottom:8px;">O procedimento ocorreu?</div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn-cr-ocorreu" data-val="sim" style="flex:1;padding:9px;border-radius:8px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.78rem;font-weight:700;cursor:pointer;transition:all 0.2s;">✅ SIM</button>
                        <button class="btn-cr-ocorreu" data-val="nao" style="flex:1;padding:9px;border-radius:8px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.78rem;font-weight:700;cursor:pointer;transition:all 0.2s;">❌ NÃO</button>
                        <button class="btn-cr-ocorreu" data-val="parcial" style="flex:1;padding:9px;border-radius:8px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.78rem;font-weight:700;cursor:pointer;transition:all 0.2s;">⚠️ PARCIAL</button>
                    </div>
                </div>
                <div style="margin-bottom:16px;">
                    <div style="font-family:var(--mono);font-size:0.75rem;letter-spacing:0.08em;color:var(--text-dim);text-transform:uppercase;margin-bottom:8px;">O produto retornou para a empresa?</div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn-cr-retornou" data-val="sim" style="flex:1;padding:9px;border-radius:8px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.78rem;font-weight:700;cursor:pointer;transition:all 0.2s;">✅ SIM</button>
                        <button class="btn-cr-retornou" data-val="nao" style="flex:1;padding:9px;border-radius:8px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.78rem;font-weight:700;cursor:pointer;transition:all 0.2s;">❌ NÃO</button>
                        <button class="btn-cr-retornou" data-val="na" style="flex:1;padding:9px;border-radius:8px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.78rem;font-weight:700;cursor:pointer;transition:all 0.2s;">N/A</button>
                    </div>
                </div>
                <div style="margin-bottom:14px;">
                    <label style="display:block;font-size:0.75rem;font-family:var(--mono);letter-spacing:0.08em;color:var(--text-dim);text-transform:uppercase;margin-bottom:6px;">Data de Retirada</label>
                    <input id="inputDataCR" type="date" value="${dataAtual}" style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:10px 12px;border-radius:8px;font-family:var(--mono);font-size:0.9rem;outline:none;">
                </div>
                <div style="display:flex;gap:10px;">
                    <button id="btnCancelarCR" style="flex:1;padding:10px;background:transparent;border:1px solid var(--border);color:var(--text-dim);border-radius:8px;cursor:pointer;font-family:var(--mono);font-size:0.78rem;font-weight:600;">Cancelar</button>
                    <button id="btnConfirmarCR" style="flex:2;padding:10px;background:#f97316;border:1px solid #ea6c10;color:#fff;border-radius:8px;cursor:pointer;font-family:var(--mono);font-size:0.78rem;font-weight:700;opacity:0.5;pointer-events:none;">✅ Confirmar Retirada</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        let ocorreu = null, retornou = null;
        const fechar = (val) => { overlay.remove(); resolve(val); };

        const checkReady = () => {
            const btn = document.getElementById('btnConfirmarCR');
            if (ocorreu && retornou) { btn.style.opacity='1'; btn.style.pointerEvents='auto'; }
            else { btn.style.opacity='0.5'; btn.style.pointerEvents='none'; }
        };

        overlay.querySelectorAll('.btn-cr-ocorreu').forEach(b => {
            b.onclick = () => {
                ocorreu = b.dataset.val;
                overlay.querySelectorAll('.btn-cr-ocorreu').forEach(x => { x.style.background='transparent'; x.style.color='var(--text-dim)'; x.style.borderColor='var(--border)'; });
                b.style.background='rgba(249,115,22,0.15)'; b.style.color='#f97316'; b.style.borderColor='#f97316';
                checkReady();
            };
        });
        overlay.querySelectorAll('.btn-cr-retornou').forEach(b => {
            b.onclick = () => {
                retornou = b.dataset.val;
                overlay.querySelectorAll('.btn-cr-retornou').forEach(x => { x.style.background='transparent'; x.style.color='var(--text-dim)'; x.style.borderColor='var(--border)'; });
                b.style.background='rgba(249,115,22,0.15)'; b.style.color='#f97316'; b.style.borderColor='#f97316';
                checkReady();
            };
        });

        document.getElementById('btnFecharConfRetirada').onclick = () => fechar(null);
        document.getElementById('btnCancelarCR').onclick = () => fechar(null);
        document.getElementById('btnConfirmarCR').onclick = () => {
            const data = document.getElementById('inputDataCR').value;
            if (!data) { alert('Por favor, selecione a data de retirada.'); return; }
            fechar({ ocorreu, retornou, data });
        };
        overlay.onclick = (e) => { if (e.target === overlay) fechar(null); };
    });
}


async function deleteProc(docId) {
    const proc = procedimentos.find(p => (p._docId || String(p.id)) === String(docId));
    if (!proc) return;
    const nome = proc.paciente || proc.hospital || proc.coletaFornecedor || 'este registro';
    // Modal de confirmação visual ao invés de confirm() nativo
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);';
    overlay.innerHTML = `
        <div style="background:var(--surface,#fff);border:1px solid var(--border,#e5e7eb);border-top:3px solid #ef4444;border-radius:18px;padding:28px 24px;max-width:360px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:'Inter',sans-serif;">
            <div style="font-size:2rem;text-align:center;margin-bottom:10px;">🗑️</div>
            <div style="font-weight:700;font-size:1rem;color:#111;text-align:center;margin-bottom:6px;">Excluir registro?</div>
            <div style="color:#666;font-size:0.83rem;text-align:center;margin-bottom:22px;font-family:var(--mono);">${nome}</div>
            <div style="display:flex;gap:10px;">
                <button id="btnCancelDel" style="flex:1;padding:11px;border-radius:10px;border:1px solid var(--border,#e5e7eb);background:transparent;color:#555;font-family:var(--mono);font-size:0.8rem;font-weight:700;cursor:pointer;">Cancelar</button>
                <button id="btnConfirmDel" style="flex:1;padding:11px;border-radius:10px;border:none;background:#ef4444;color:#fff;font-family:var(--mono);font-size:0.8rem;font-weight:700;cursor:pointer;">✕ Excluir</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#btnCancelDel').onclick  = () => overlay.remove();
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    overlay.querySelector('#btnConfirmDel').onclick = async () => {
        overlay.remove();
        const idx = window.procedimentos.findIndex(p => p._docId === proc._docId);
        if (idx !== -1) window.procedimentos.splice(idx, 1);
        window.renderAgendadorLista && window.renderAgendadorLista();
        window.renderCards && window.renderCards();
        window.renderTable && window.renderTable();
        if (proc._docId) fbDeleteProc(proc._docId);
    };
}

function editProc(docId) {
    const p = procedimentos.find(proc => (proc._docId || String(proc.id)) === String(docId));
    if (!p) return;
    editingIndex = procedimentos.indexOf(p);
    editingDocId = p._docId || null;
    document.getElementById('modalTitle').textContent = 'Editar Procedimento';
    document.getElementById('editIndex').value = editingIndex;

    // Hospital
    // Hospital: verificar se está no datalist ou é "outro"
    (function() {
        const hospInput = document.getElementById('f-hospital');
        const opts = Array.from(document.querySelectorAll('#hospital-list option')).map(o => o.value);
        const hosp = p.hospital || '';
        if (hosp && !opts.includes(hosp)) {
            hospInput.value = 'Outro...';
            document.getElementById('g-outro-hospital').style.display = 'block';
            document.getElementById('f-outro-hospital').value = hosp;
        } else {
            hospInput.value = hosp;
            document.getElementById('g-outro-hospital').style.display = 'none';
            document.getElementById('f-outro-hospital').value = '';
        }
    })();

    // Convenio
    const cs = document.getElementById('f-convenio');
    const cOpts = Array.from(cs.options).map(o => o.value);
    if (cOpts.includes(p.convenio)) {
        cs.value = p.convenio;
        document.getElementById('g-outro-conv').style.display = 'none';
    } else {
        cs.value = '__outro';
        document.getElementById('g-outro-conv').style.display = 'block';
        document.getElementById('f-outro-convenio').value = p.convenio;
    }

    // Se for retirar volumes urgentes (independente do status atual), manter modo coleta no modal
    document.getElementById('f-status').value = _ehColeta(p) ? 'coleta_urgente' : p.status;
    document.getElementById('f-status').dispatchEvent(new Event('change'));
    // Restaurar o status real após ativar o modo coleta (para salvar corretamente)
    if (_ehColeta(p) && p.status !== 'coleta_urgente') {
        setTimeout(() => { document.getElementById('f-status').value = p.status; }, 10);
    }
    document.getElementById('f-data').value = p.data;
    // Médico: verificar se está na lista, senão usa 'outro'
    (function() {
        const selMed = document.getElementById('f-medico');
        const gMed   = document.getElementById('g-outro-medico');
        const omInput= document.getElementById('f-outro-medico');
        const medico = p.medico || '';
        const nomeU  = medico.toUpperCase().replace(/\s+/g,' ').trim();
        const match  = Array.from(selMed.options).find(o => o.value.toUpperCase().replace(/\s+/g,' ').trim() === nomeU);
        if (match && match.value && match.value !== '__outro') {
            selMed.value = match.value;
            if (gMed) gMed.style.display = 'none';
            if (omInput) omInput.value = '';
        } else if (medico) {
            selMed.value = '__outro';
            if (gMed) gMed.style.display = 'block';
            if (omInput) omInput.value = medico;
        } else {
            selMed.value = '';
            if (gMed) gMed.style.display = 'none';
            if (omInput) omInput.value = '';
        }
    })();
    document.getElementById('f-paciente').value = p.paciente || '';
    if (document.getElementById('f-pacienteIdade')) document.getElementById('f-pacienteIdade').value = p.pacienteIdade || '';
    document.getElementById('f-procedimento').value = p.procedimento;
    document.getElementById('f-vendedor').value = p.vendedor;
    if (document.getElementById('f-tipo-cirurgia')) document.getElementById('f-tipo-cirurgia').value = p.tipoCirurgia || '';
    document.getElementById('f-linha').value = p.linha || '';
    document.getElementById('f-inicio').value = p.inicio;
    document.getElementById('f-nf').value = p.nf || '';
    if (document.getElementById('f-valor')) document.getElementById('f-valor').value = p.valor || '';
    document.getElementById('f-nf-data').value = p.nfData || '';
    document.getElementById('f-retirada').value = p.retirada || '';
    if (document.getElementById('f-nf-compra'))     document.getElementById('f-nf-compra').value     = p.nfCompra    || '';
    if (document.getElementById('f-cte'))           document.getElementById('f-cte').value           = p.cte         || '';
    if (document.getElementById('f-data-retirar'))  document.getElementById('f-data-retirar').value  = p.dataRetirar || '';
    if (document.getElementById('f-hora-retirar'))          document.getElementById('f-hora-retirar').value          = p.horaRetirar        || '';
    if (document.getElementById('f-coleta-data-cirurgia')) document.getElementById('f-coleta-data-cirurgia').value = p.coletaDataCirurgia || '';
    if (document.getElementById('f-coleta-hora-cirurgia')) document.getElementById('f-coleta-hora-cirurgia').value = p.coletaHoraCirurgia || '';
    if (document.getElementById('f-coleta-fornecedor'))      document.getElementById('f-coleta-fornecedor').value      = p.coletaFornecedor      || '';
    if (document.getElementById('f-coleta-transportadora')) document.getElementById('f-coleta-transportadora').value = p.coletaTransportadora || '';
    if (document.getElementById('f-coleta-obs'))   document.getElementById('f-coleta-obs').value   = p.coletaObs   || '';
    if (document.getElementById('f-coleta-anexo')) document.getElementById('f-coleta-anexo').value = p.coletaAnexo || '';
    document.getElementById('f-anexo-data').value = p.anexo || '';
    if (p.anexo) {
        document.getElementById('f-anexo-preview').innerHTML = p.anexo.startsWith('data:image')
            ? `<img src="${p.anexo}" style="max-width:100%;max-height:120px;border-radius:6px;border:1px solid var(--border);cursor:pointer;" onclick="window.abrirAnexo(document.getElementById('f-anexo-data').value)" title="Clique para ver em tamanho cheio">`
            : `<span style="font-size:0.86rem;color:var(--green);">📎 Anexo salvo &nbsp;<button type="button" onclick="window.abrirAnexo(document.getElementById('f-anexo-data').value)" style="background:none;border:1px solid var(--green);color:var(--green);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:0.78rem;font-family:var(--mono);">Ver →</button></span>`;
        document.getElementById('btn-remover-anexo').style.display = 'inline-block';
    } else {
        document.getElementById('f-anexo-preview').innerHTML = '';
        document.getElementById('btn-remover-anexo').style.display = 'none';
    }
    document.getElementById('f-equipe').value = p.equipe || '';
    loadItensBuilder(p.itens || '');
    document.getElementById('f-obs').value = p.obs || '';
    document.getElementById('f-cidade').value = p.cidade || '';

    document.getElementById('modalOverlay').classList.add('open');

    // Se for retirar volumes urgentes, ajustar título e ocultar campos desnecessários
    if (_ehColeta(p)) {
        document.getElementById('modalTitle').textContent = '✈️ Editar Coleta Prioritária';
        const btnSave = document.getElementById('btn-save-main');
        if (btnSave) btnSave.textContent = 'Salvar Coleta Prioritária';
        const gOutroMedico = document.getElementById('g-outro-medico');
        if (gOutroMedico) gOutroMedico.style.display = 'none';
        // Garante painel coleta visível
        setTimeout(() => {
            const painel = document.getElementById('g-coleta-urgente');
            if (painel) painel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }
}

// ─── MODAL ───
function openModal() {
    editingIndex = null;
    editingDocId = null;
    document.getElementById('modalTitle').textContent = 'Adicionar Procedimento';
    document.getElementById('procForm').reset();
    document.getElementById('editIndex').value = '';
    document.getElementById('f-data').value = todayStr();
    autoRetirada(todayStr());
    // Garante que o status seja resetado e os campos corretos apareçam
    autoStatusByDate(todayStr());
    loadItensBuilder('');
    document.getElementById('g-outro-conv').style.display = 'none';
    const sReset3 = document.getElementById('f-subgrupo3'); if(sReset3) { sReset3.innerHTML='<option value="">Selecione a linha primeiro</option>'; }
    const sReset4 = document.getElementById('f-subgrupo4'); if(sReset4) { sReset4.innerHTML='<option value="">Selecione a linha primeiro</option>'; }
    const sReset5 = document.getElementById('f-subgrupo5'); if(sReset5) { sReset5.innerHTML='<option value="">Selecione a linha primeiro</option>'; }
    const sReset6 = document.getElementById('f-subgrupo6'); if(sReset6) { sReset6.innerHTML='<option value="">Selecione a linha primeiro</option>'; }
    const sReset7 = document.getElementById('f-subgrupo7'); if(sReset7) { sReset7.innerHTML='<option value="">Selecione a linha primeiro</option>'; }
    const sReset8 = document.getElementById('f-subgrupo8'); if(sReset8) { sReset8.innerHTML='<option value="">Selecione a linha primeiro</option>'; }
    const sReset9 = document.getElementById('f-subgrupo9'); if(sReset9) { sReset9.innerHTML='<option value="">Selecione a linha primeiro</option>'; }
    const sReset10 = document.getElementById('f-subgrupo10'); if(sReset10) { sReset10.innerHTML='<option value="">Selecione a linha primeiro</option>'; }
    document.getElementById('modalOverlay').classList.add('open');
}

let _modalCooldown = false;
function closeModal() {
    const btnSave = document.getElementById('btn-save-main');
    if (btnSave) btnSave.textContent = 'Salvar Procedimento';
    document.getElementById('modalOverlay').classList.remove('open');
    _modalCooldown = true;
    setTimeout(() => { _modalCooldown = false; }, 600);
}

function openModalVolumes() {
    openModal();
    setTimeout(() => {
        const sel = document.getElementById('f-status');
        if (sel) {
            sel.value = 'coleta_urgente';
            sel.dispatchEvent(new Event('change'));
        }
        document.getElementById('modalTitle').textContent = '✈️ Adicionar Coleta Prioritária';
        const btnSave = document.getElementById('btn-save-main');
        if (btnSave) btnSave.textContent = 'Salvar Coleta Prioritária';
        const painel = document.getElementById('g-coleta-urgente');
        if (painel) painel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
}


// ─── SUBGRUPOS ───
const SUBGRUPOS_MAP = {"Linha Biopsia": ["Agulha de Biopsia Coaxial", "Agulha de Biopsia Illinois", "Agulha de Biopsia Jamishiditj", "Agulha de Biopsia Jamshidi", "Agulha de Biopsia Magnum", "Fio de Localização", "Insersor", "Inst Semi Automatico", "Instrumento Descartavel", "Kit Inst Semi Automatico", "Lubrificantes", "Marcador", "Recipiente", "Sist Biopsia de Mama", "Sonda"], "Linha Cardiaca": ["Canula Aramada", "Cirurgia Cardiaca", "Clip Cirurgia Aberta", "Clip Cirurgia Fechada", "Enxerto Bifurcado", "Enxerto EPTFE", "Enxerto Tubular Reto", "Guia de Selecao", "Kit Auto Transfusao", "Kit CEC", "Medidor", "Perfurador", "Ponteira Extensora", "Selante", "Sistema Ablação", "Sistema de Sutura", "Valvula Cardiaca"], "Linha Coronaria": ["Agulha de Biopsia", "Balao Coronario", "Cateter Angiografico", "Cateter Balao PowerLine", "Cateter Balao Rise", "Cateter Diagnostico", "Cateter Guia", "Cateter Laco de Captura", "Dispositivo de Torque", "Fio Guia", "Insuflador", "Introdutor Siliconado Femoral", "Introdutor Siliconado Radial", "Kit Introdutor Valvulado", "Manifold", "Stent", "Torneirinha", "Tubo Extensor de Pressao", "Valvula Hemoastatica"], "Linha Endovascular": ["Cateter Balao", "Endoprotese Aortica", "Endoprotese BIF E-liac", "Endoprotese CL", "Endoprotese CP", "Endoprotese Extensao Eliaca", "Endoprotese Hibrida", "Endoprotese Toracica", "Fio Guia", "Radiointervencao", "Stent"], "Linha Nefro": ["Balao Super Altra Pressao", "Cateter de Longa Permanencia", "Endoprotese Wrapsody", "Hero Graft"], "Linha Periferica": ["Agulha de Biopsia", "Bainha Introdutora", "Balao Periferico", "Balao Super Altra Pressao", "Balao de Alta Pressao", "Balao de Scoring", "Bolsa Coletora", "Bolsa Succao", "Bomba de Drenagem", "Cateter Balao", "Cateter Diagnostico", "Cateter Laco de Captura", "Cateter de Aspiracao", "Cateter de Drenagem", "Cateter de Infusao", "Cateter de Longa Permanencia", "Cateter de Suporte", "Dispositivo Venoso", "Dispositivo de Compressão", "Filtro VCF", "Fio Guia", "Fio Guia Teflonado", "Introdutor Longo", "Kit Angiografico", "Kit Cateter", "Kit Drenagem Biliar", "Kit Drenagem Convencional", "Kit Introdutor", "Kit Micropuncao Pedal", "Micro Cateter", "Micro Esfera", "Micro Guia", "Particula de Embolizacao", "Protese Veia Cava", "Protese de Fechamento", "Radiointervencao", "Stent", "Stent Sinus Obliquuos", "Stent Sinus Venous"], "Linha Urologia": ["Acesso", "Calculo Renal", "Dilatacao", "Eletrodo", "Evacuador", "Extrator de Calculo", "Irrigacao", "Kit Dilatacao", "Kit Drenagem Convencional", "Kit Percutaneo", "Laser", "Protese Peniana", "Protese Testicular", "RTU Acessorios"]};

function atualizarSubgrupos(valorAtual, valorAtual2) {
    const linha = document.getElementById('f-linha').value;
    const sel = document.getElementById('f-subgrupo');
    const sel2 = document.getElementById('f-subgrupo2');
    const sel3 = document.getElementById('f-subgrupo3');
    const sel4 = document.getElementById('f-subgrupo4');
    const sel5 = document.getElementById('f-subgrupo5');
    const sel6 = document.getElementById('f-subgrupo6');
    const sel7 = document.getElementById('f-subgrupo7');
    const sel8 = document.getElementById('f-subgrupo8');
    const sel9 = document.getElementById('f-subgrupo9');
    const sel10 = document.getElementById('f-subgrupo10');

    if(sel) sel.innerHTML = '<option value="">Selecione</option>';
    if(sel2) sel2.innerHTML = '<option value="">Selecione</option>';
    if(sel3) sel3.innerHTML = '<option value="">Selecione</option>';
    if(sel4) sel4.innerHTML = '<option value="">Selecione</option>';
    if(sel5) sel5.innerHTML = '<option value="">Selecione</option>';
    if(sel6) sel6.innerHTML = '<option value="">Selecione</option>';
    if(sel7) sel7.innerHTML = '<option value="">Selecione</option>';
    if(sel8) sel8.innerHTML = '<option value="">Selecione</option>';
    if(sel9) sel9.innerHTML = '<option value="">Selecione</option>';
    if(sel10) sel10.innerHTML = '<option value="">Selecione</option>';

    if (linha && SUBGRUPOS_MAP[linha]) {
        SUBGRUPOS_MAP[linha].forEach(s => {
            [sel, sel2, sel3, sel4, sel5, sel6, sel7, sel8, sel9, sel10].forEach(el => {
                const opt = document.createElement('option');
                opt.value = s; opt.textContent = s;
                el.appendChild(opt);
            });
        });
        if (valorAtual)  sel.value   = valorAtual;
        if (valorAtual2) sel2.value  = valorAtual2;
    }
}

async function saveProcedure(e) {
    e.preventDefault();

    let hospital = document.getElementById('f-hospital').value.trim();
    if (hospital === 'Outro...') {
        hospital = document.getElementById('f-outro-hospital').value.trim().toUpperCase();
        if (!hospital) { alert('Informe o nome do hospital no campo de texto'); document.getElementById('f-outro-hospital').focus(); return; }
    }
    const _statusAtual = document.getElementById('f-status').value;
    const _existingForColeta = editingDocId ? procedimentos.find(p => p._docId === editingDocId) : null;
    const _isColeta = _statusAtual === 'coleta_urgente' || (_existingForColeta && _ehColeta(_existingForColeta));
    if (!_isColeta && !hospital) { alert('Informe o nome do hospital'); return; }
    if (_isColeta && !hospital) hospital = '✈️ Retirar Volumes Urgentes';

    let convenio = document.getElementById('f-convenio').value;
    if (!_isColeta && convenio === '__outro') {
        convenio = document.getElementById('f-outro-convenio').value.trim();
        if (!convenio) { alert('Informe o nome do convênio'); return; }
    }
    if (_isColeta && (!convenio || convenio === '__outro')) convenio = '—';

    // Validação médico
    let medico = document.getElementById('f-medico').value.trim();
    if (medico === '__outro') {
        medico = (document.getElementById('f-outro-medico')?.value || '').trim();
    }
    medico = medico.toUpperCase();
    if (!_isColeta && !medico) { alert('Informe o nome do médico'); document.getElementById('f-medico').focus(); return; }
    if (_isColeta && !medico) medico = '';

    // Validação: status Em Trânsito exige NF preenchida
    const status = document.getElementById('f-status').value;
    const nfVal = document.getElementById('f-nf').value.trim();
    if (status === 'em_transito' && !nfVal) {
        const inp = document.getElementById('f-nf');
        inp.style.borderColor = '#f97316';
        inp.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.3)';
        inp.focus();
        alert('⚠️ Informe o Número da NF para o status "Em Trânsito"!');
        return;
    }

    // Validação: status A Retirar, Em Procedimento e Retirar Volumes Urgentes exigem data de retirada
    const retirada = document.getElementById('f-retirada').value;
    const _isAgendador = window._currentUser && window._currentUser.role === 'agendador';
    const statusExigeRetirada = !_isAgendador && (status === 'a_retirar' || status === 'andamento' || status === 'coleta_urgente');
    if (statusExigeRetirada && !retirada) {
        const inp = document.getElementById('f-retirada');
        inp.style.borderColor = '#f97316';
        inp.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.3)';
        // Garantir que o campo está visível
        const grp = document.getElementById('g-retirada');
        if (grp) grp.style.display = '';
        inp.focus();
        const nomeStatus = status === 'andamento' ? 'Em Procedimento' : status === 'coleta_urgente' ? 'Retirar Volumes Urgentes' : 'A Retirar';
        alert('⚠️ Informe a Data de Retirada para o status "' + nomeStatus + '"!\n\nEssa data é necessária para o controle de cobranças via WhatsApp.');
        return;
    }

    const existingProc = editingDocId ? procedimentos.find(p => p._docId === editingDocId) : null;

    const cidadeVal = document.getElementById('f-cidade') ? document.getElementById('f-cidade').value : '';
    const filialLS  = localStorage.getItem('gf_filial') || 'cba';
    const filialProc = cidadeVal === 'Campo Grande' ? 'cgr' : cidadeVal === 'Cuiabá' ? 'cba' : (filialLS === 'cgr' ? 'cgr' : 'cba');

    const proc = {
        id: existingProc ? existingProc.id : nextId++,
        hospital,
        cidade: cidadeVal,
        status: document.getElementById('f-status').value,
        data: document.getElementById('f-data').value,
        medico: medico,
        paciente: document.getElementById('f-paciente').value,
        pacienteIdade: document.getElementById('f-pacienteIdade') ? document.getElementById('f-pacienteIdade').value.trim() : '',
        procedimento: _isColeta ? (document.getElementById('f-procedimento').value || '') : document.getElementById('f-procedimento').value,
        convenio: _isColeta && (!convenio || convenio === '—') ? '' : convenio,
        vendedor: _isColeta ? (document.getElementById('f-vendedor').value || '') : document.getElementById('f-vendedor').value,
        tipoCirurgia: document.getElementById('f-tipo-cirurgia') ? document.getElementById('f-tipo-cirurgia').value : '',
        linha: _isColeta ? (document.getElementById('f-linha').value || '') : document.getElementById('f-linha').value,
        subgrupo: document.getElementById('f-subgrupo') ? document.getElementById('f-subgrupo').value : '',
        subgrupo2: document.getElementById('f-subgrupo2') ? document.getElementById('f-subgrupo2').value : '',
        subgrupo3: document.getElementById('f-subgrupo3') ? document.getElementById('f-subgrupo3').value : '',
        subgrupo4: document.getElementById('f-subgrupo4') ? document.getElementById('f-subgrupo4').value : '',
        subgrupo5: document.getElementById('f-subgrupo5') ? document.getElementById('f-subgrupo5').value : '',
        subgrupo6: document.getElementById('f-subgrupo6') ? document.getElementById('f-subgrupo6').value : '',
        subgrupo7: document.getElementById('f-subgrupo7') ? document.getElementById('f-subgrupo7').value : '',
        subgrupo8: document.getElementById('f-subgrupo8') ? document.getElementById('f-subgrupo8').value : '',
        subgrupo9: document.getElementById('f-subgrupo9') ? document.getElementById('f-subgrupo9').value : '',
        subgrupo10: document.getElementById('f-subgrupo10') ? document.getElementById('f-subgrupo10').value : '',
        inicio: document.getElementById('f-inicio').value,
        nf: document.getElementById('f-nf').value,
        nfData: document.getElementById('f-nf-data').value,
        retirada: document.getElementById('f-retirada').value,
        nfCompra:          document.getElementById('f-nf-compra')           ? document.getElementById('f-nf-compra').value           : '',
        cte:               document.getElementById('f-cte')                 ? document.getElementById('f-cte').value                 : '',
        dataRetirar:       document.getElementById('f-data-retirar')        ? document.getElementById('f-data-retirar').value        : '',
        horaRetirar:       document.getElementById('f-hora-retirar')        ? document.getElementById('f-hora-retirar').value        : '',
        coletaDataCirurgia:document.getElementById('f-coleta-data-cirurgia')? document.getElementById('f-coleta-data-cirurgia').value: '',
        coletaHoraCirurgia:document.getElementById('f-coleta-hora-cirurgia')? document.getElementById('f-coleta-hora-cirurgia').value: '',
        coletaFornecedor:      document.getElementById('f-coleta-fornecedor')      ? document.getElementById('f-coleta-fornecedor').value.trim()      : '',
        coletaTransportadora: document.getElementById('f-coleta-transportadora') ? document.getElementById('f-coleta-transportadora').value.trim() : '',
        coletaObs:   document.getElementById('f-coleta-obs')   ? document.getElementById('f-coleta-obs').value.trim()   : '',
        coletaAnexo: document.getElementById('f-coleta-anexo') ? document.getElementById('f-coleta-anexo').value.trim() : '',
        anexo: document.getElementById('f-anexo-data').value,
        equipe: document.getElementById('f-equipe').value,
        itens: serializeItens(),
        obs: document.getElementById('f-obs').value,
        _filial: filialProc,
        isColeta: _isColeta || (existingProc && _ehColeta(existingProc)) || false
    };

    if (existingProc && existingProc._docId) {
        proc._docId = existingProc._docId;
    }

    if (existingProc && existingProc.cadastradoPor) {
        proc.cadastradoPor = existingProc.cadastradoPor;
    } else if (window._currentUser && !proc.cadastradoPor) {
        proc.cadastradoPor = window._currentUser.uid;
    }

    try {
        await fbSaveProc(proc);
        closeModal();
    } catch(err) {
        console.error('Erro ao salvar:', err);
        alert('❌ Erro ao salvar: ' + (err.message || err));
    }
}

// ─── CURVA ABC ───
function renderABC() {
    const list = getFiltered();
    const statusMap = { a_agendar:'Autorizado', andamento:'Em Procedimento', preparacao:'Em Separação', agendado:'Agendado', em_transito:'Em Trânsito', concluido:'Concluído', cancelado:'Cancelado', reagendado:'Reagendado', a_retirar:'Aguardando Retirada', urgencia:'🚨 URGÊNCIA', coleta_urgente:'✈️ Coleta Prioritária' };
    const statusColors = { a_agendar:'#06b6d4', andamento:'#ef4444', preparacao:'#f59e0b', agendado:'#10b981', em_transito:'#6366f1', concluido:'#6b7280', cancelado:'#f87171', reagendado:'#a78bfa', a_retirar:'#f97316', urgencia:'#ff0000' };

    // Build vendor stats
    const vendorMap = {};
    list.forEach(p => {
        if (!p.vendedor) return;
        if (!vendorMap[p.vendedor]) vendorMap[p.vendedor] = { total: 0, statuses: {} };
        vendorMap[p.vendedor].total++;
        vendorMap[p.vendedor].statuses[p.status] = (vendorMap[p.vendedor].statuses[p.status] || 0) + 1;
    });

    // Sort by total desc
    const vendors = Object.entries(vendorMap)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, data]) => ({ name, ...data }));

    const grandTotal = vendors.reduce((s, v) => s + v.total, 0);

    if (vendors.length === 0) {
        document.getElementById('abcContent').innerHTML = '<div class="empty-state">Nenhum procedimento no período selecionado</div>';
        return;
    }

    // Assign ABC zones: A = top 80%, B = next 15%, C = rest
    let cumulative = 0;
    vendors.forEach(v => {
        const pct = grandTotal > 0 ? v.total / grandTotal * 100 : 0;
        cumulative += pct;
        v.pct = pct;
        v.cumulative = cumulative;
        v.zone = cumulative <= 80 ? 'A' : cumulative <= 95 ? 'B' : 'C';
    });

    const zoneA = vendors.filter(v => v.zone === 'A');
    const zoneB = vendors.filter(v => v.zone === 'B');
    const zoneC = vendors.filter(v => v.zone === 'C');

    // Status distribution (all filtered)
    const statusTotals = {};
    list.forEach(p => { statusTotals[p.status] = (statusTotals[p.status] || 0) + 1; });
    const stackedBars = Object.entries(statusTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([s, n]) => {
            const w = grandTotal > 0 ? (n / grandTotal * 100).toFixed(1) : 0;
            return `<div class="abc-stacked-seg" style="width:${w}%;background:${statusColors[s] || '#6b7280'};color:#fff;" title="${statusMap[s]}: ${n}">
                ${w > 8 ? statusMap[s].split(' ')[0] : ''}
            </div>`;
        }).join('');

    // Render vendor rows
    function renderRows(vList) {
        return vList.map((v, i) => {
            const rank = vendors.indexOf(v) + 1;
            const barWidth = vendors[0].total > 0 ? (v.total / vendors[0].total * 100).toFixed(1) : 0;
            const statusPills = Object.entries(v.statuses)
                .sort((a,b) => b[1]-a[1])
                .map(([s, n]) => `<span class="abc-mini-pill" style="background:${statusColors[s]}22;color:${statusColors[s]};border:1px solid ${statusColors[s]}44;">${statusMap[s].replace('Em ','')} ×${n}</span>`).join('');
            return `
            <div class="abc-row">
                <span class="abc-rank" style="color:${v.zone==='A'?'#10b981':v.zone==='B'?'#f59e0b':'#9ca3af'}">#${rank}</span>
                <span class="abc-badge badge-${v.zone}">${v.zone}</span>
                <div style="flex:2;min-width:0;">
                    <div class="abc-name">${v.name}</div>
                    <div class="abc-status-pills">${statusPills}</div>
                </div>
                <div class="abc-bar-wrap">
                    <div class="abc-bar-track">
                        <div class="abc-bar-fill fill-${v.zone}" style="width:${barWidth}%"></div>
                    </div>
                    <span class="abc-count">${v.total}</span>
                    <span class="abc-pct">${v.pct.toFixed(1)}%</span>
                    <span class="abc-acum">∑${v.cumulative.toFixed(1)}%</span>
                </div>
            </div>`;
        }).join('');
    }

    // Detailed breakdown table
    const detailRows = vendors.map(v => {
        const byStatus = Object.entries(v.statuses).map(([s,n]) =>
            `<span class="abc-mini-pill" style="background:${statusColors[s]}22;color:${statusColors[s]};border:1px solid ${statusColors[s]}44;">${statusMap[s]} ×${n}</span>`
        ).join(' ');
        return `<tr>
            <td><span class="abc-badge badge-${v.zone}">${v.zone}</span></td>
            <td style="font-weight:600;">${v.name}</td>
            <td style="font-family:var(--mono);font-weight:700;">${v.total}</td>
            <td style="font-family:var(--mono);">${v.pct.toFixed(1)}%</td>
            <td style="font-family:var(--mono);">${v.cumulative.toFixed(1)}%</td>
            <td>${byStatus}</td>
        </tr>`;
    }).join('');

    const periodLabel = currentPreset === 'todos' ? 'Todos os registros' :
        currentPreset === 'hoje' ? 'Hoje' :
        currentPreset === 'semana' ? 'Esta semana' :
        currentPreset === 'mes' ? 'Este mês' :
        `${periodoDe} → ${periodoAte}`;

    document.getElementById('abcContent').innerHTML = `
    <div style="margin-bottom:20px;font-family:var(--mono);font-size:0.92rem;color:var(--text-dim);">
        Período: <span style="color:var(--accent)">${periodLabel}</span> &nbsp;·&nbsp; Total: <span style="color:var(--text);font-weight:700;">${grandTotal}</span> procedimentos
    </div>

    <div class="abc-summary">
        <div class="abc-sum-box zona-A">
            <div class="abc-sum-label">Zona A — Alta Performance</div>
            <div class="abc-sum-val">${zoneA.length}</div>
            <div class="abc-sum-sub">vendedor${zoneA.length !== 1 ? 'es' : ''} · ${zoneA.reduce((s,v)=>s+v.total,0)} cirurgias</div>
        </div>
        <div class="abc-sum-box zona-B">
            <div class="abc-sum-label">Zona B — Performance Média</div>
            <div class="abc-sum-val">${zoneB.length}</div>
            <div class="abc-sum-sub">vendedor${zoneB.length !== 1 ? 'es' : ''} · ${zoneB.reduce((s,v)=>s+v.total,0)} cirurgias</div>
        </div>
        <div class="abc-sum-box zona-C">
            <div class="abc-sum-label">Zona C — Baixa Performance</div>
            <div class="abc-sum-val">${zoneC.length}</div>
            <div class="abc-sum-sub">vendedor${zoneC.length !== 1 ? 'es' : ''} · ${zoneC.reduce((s,v)=>s+v.total,0)} cirurgias</div>
        </div>
    </div>

    <div class="abc-grid">
        <div class="abc-card full">
            <div class="abc-section-title"><span>◈</span> Distribuição por Status — Todos os Procedimentos</div>
            <div class="abc-stacked">${stackedBars}</div>
            <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;">
                ${Object.entries(statusTotals).sort((a,b)=>b[1]-a[1]).map(([s,n])=>`
                    <span style="font-family:var(--mono);font-size:0.82rem;color:${statusColors[s]};display:flex;align-items:center;gap:4px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:${statusColors[s]};display:inline-block;"></span>
                        ${statusMap[s]} (${n})
                    </span>`).join('')}
            </div>
        </div>

        <div class="abc-card full">
            <div class="abc-section-title"><span>▲</span> Ranking Completo de Vendedores</div>
            ${renderRows(vendors)}
        </div>
    </div>

    <div class="abc-card" style="margin-bottom:20px;">
        <div class="abc-section-title"><span>⊟</span> Detalhamento por Vendedor</div>
        <div style="overflow-x:auto;">
            <table class="abc-detail-table">
                <thead>
                    <tr>
                        <th>Zona</th>
                        <th>Vendedor</th>
                        <th>Qtd</th>
                        <th>% Individual</th>
                        <th>% Acumulado</th>
                        <th>Breakdown por Status</th>
                    </tr>
                </thead>
                <tbody>${detailRows}</tbody>
            </table>
        </div>
    </div>`;
}

// ─── PERIOD FILTER ───

// ─── TOGGLE PERÍODO ───
function togglePeriodo() {
    var p = document.getElementById('periodo-painel');
    var s = document.getElementById('periodo-seta');
    if (!p) return;
    var aberto = p.style.display === 'flex';
    p.style.display = aberto ? 'none' : 'flex';
    if (s) s.textContent = aberto ? '▼' : '▲';
}
function applyPreset(preset) {
    currentPreset = preset;
    const now = new Date();

    document.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === preset));
    document.getElementById('periodCustom').style.display = preset === 'custom' ? 'flex' : 'none';

    if (preset === 'hoje') {
        periodoDe = periodoAte = todayStr();
    } else if (preset === 'semana') {
        const day = now.getDay();
        const diffMon = (day === 0 ? -6 : 1 - day);
        const mon = new Date(now); mon.setDate(now.getDate() + diffMon);
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        periodoDe = mon.toISOString().split('T')[0];
        periodoAte = sun.toISOString().split('T')[0];
    } else if (preset === 'mes') {
        periodoDe = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        periodoAte = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    } else if (preset === 'todos') {
        periodoDe = '';
        periodoAte = '';
    } else if (preset === 'custom') {
        periodoDe = document.getElementById('filterDe').value || todayStr();
        periodoAte = document.getElementById('filterAte').value || todayStr();
        document.getElementById('filterDe').value = periodoDe;
        document.getElementById('filterAte').value = periodoAte;
    }

    updatePeriodResult();
    renderCards();
    if (currentView === 'timeline') renderTimeline();
}

function applyCustomPeriod() {
    periodoDe = document.getElementById('filterDe').value || '';
    periodoAte = document.getElementById('filterAte').value || '';
    updatePeriodResult();
    renderCards();
}

function updatePeriodResult() {
    const statusMap = {
        andamento: { label: 'Andamento', color: '#ef4444' },
        preparacao: { label: 'Preparação', color: '#f59e0b' },
        agendado:   { label: 'Agendado',  color: '#10b981' },
        concluido:  { label: 'Concluído', color: '#6b7280' },
        cancelado:  { label: 'Cancelado', color: '#f87171' },
        reagendado: { label: 'Reagendado',color: '#a78bfa' }
    };

    const inPeriod = currentPreset === 'todos'
        ? procedimentos
        : procedimentos.filter(p =>
            (!periodoDe || p.data >= periodoDe) &&
            (!periodoAte || p.data <= periodoAte)
        );

    const counts = {};
    inPeriod.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });

    const total = inPeriod.length;
    const html = `<span class="period-stat"><span class="period-stat-dot" style="background:var(--accent)"></span><span class="period-stat-num">${total}</span> total</span>` +
        Object.entries(statusMap)
            .filter(([k]) => counts[k])
            .map(([k, v]) => `<span class="period-stat">
                <span class="period-stat-dot" style="background:${v.color}"></span>
                <span class="period-stat-num">${counts[k]}</span> ${v.label}
            </span>`).join('');

    document.getElementById('periodResult').innerHTML = html;
}

// ─── FILTER / SEARCH ───
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderCards();
    });
});

document.getElementById('searchBox').addEventListener('input', e => {
    searchTerm = e.target.value;
    renderCards();
});

// ─── VIEW SWITCH ───
function switchView(v) {
    if (v === 'cards' || v === 'timeline' || v === 'abc') v = 'table';
    currentView = v;

    const show = function(id, visible) {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? '' : 'none';
    };
    const showEl = function(el, visible) {
        if (el) el.style.display = visible ? '' : 'none';
    };

    const isCentral   = v === 'table';
    const isDashboard = v === 'dashboard';
    const isColeta    = v === 'coleta';

    // ── Seções da Central Cirúrgica ───────────────────────────────
    show('stats-bar',     isCentral);
    show('periodBar',     isCentral);
    show('main-controls', isCentral);
    show('table-view',    isCentral);

    // ── Seções do Painel Executivo ────────────────────────────────
    show('dashboard-view', isDashboard);

    // ── Seções da Coleta Prioritária ──────────────────────────────
    show('coleta-view', isColeta);

    // ── Seções fora das views (ultraHero, ultra-strip, ultra-grid) ─
    // Essas ficam visíveis só no Painel Executivo
    show('ultraHero', isDashboard);
    show('ultra-strip', isDashboard);
    show('ultra-grid',  isDashboard);

    // premiumHero é inserido dinamicamente — controlar quando existir
    const premiumHero = document.getElementById('premiumHero');
    showEl(premiumHero, isDashboard);

    // ── Views secundárias desativadas ─────────────────────────────
    show('cards-view',    false);
    show('timeline-view', false);

    // ── Abas ativas ───────────────────────────────────────────────
    document.getElementById('tab-table').classList.toggle('active', isCentral);
    document.getElementById('tab-dashboard').classList.toggle('active', isDashboard);
    const tabColeta = document.getElementById('tab-coleta');
    if (tabColeta) tabColeta.classList.toggle('active', isColeta);

    // ── Renderizar ────────────────────────────────────────────────
    if (isCentral)   renderTable();
    if (isDashboard) renderDashboard();
    if (isColeta)    renderColetaView();
}


// ─── RENDER COLETA VIEW — VOLUMES URGENTES ───
// ─── ESTADO FILTROS COLETA ───
let _coletaFiltro = 'ativas'; // 'ativas' | 'vencidas' | 'hoje' | 'semdata' | 'concluidas'
let _coletaBusca  = '';
let _coletaDe = '', _coletaAte = '';

function renderColetaView() {
    const view = document.getElementById('coleta-view');
    if (!view) return;
    const hoje = todayStr();

    // Aplicar filtro
    let lista = procedimentos.filter(p => _ehColeta(p));
    if (_coletaFiltro === 'ativas')    lista = lista.filter(p => !['concluido','cancelado'].includes(p.status));
    if (_coletaFiltro === 'vencidas')  lista = lista.filter(p => { const r=p.dataRetirar||p.retirada||''; return r && r < hoje && !['concluido','cancelado'].includes(p.status); });
    if (_coletaFiltro === 'hoje')      lista = lista.filter(p => (p.dataRetirar||p.retirada) === hoje);
    if (_coletaFiltro === 'semdata')   lista = lista.filter(p => !p.dataRetirar && !p.retirada && !['concluido','cancelado'].includes(p.status));
    if (_coletaFiltro === 'concluidas') lista = lista.filter(p => p.status === 'concluido');

    // Aplicar filtro de período
    if (_coletaDe) lista = lista.filter(p => (p.dataRetirar||p.retirada||'') >= _coletaDe);
    if (_coletaAte) lista = lista.filter(p => (p.dataRetirar||p.retirada||'') <= _coletaAte);

    // Aplicar busca
    if (_coletaBusca.trim()) {
        const q = _coletaBusca.toLowerCase();
        lista = lista.filter(p => [p.coletaFornecedor,p.coletaTransportadora,p.nfCompra,p.cte,p.hospital].some(v => v && v.toLowerCase().includes(q)));
    }

    lista.sort((a, b) => {
        const ra = a.dataRetirar || a.retirada || '', rb = b.dataRetirar || b.retirada || '';
        if (ra && rb) return ra < rb ? -1 : ra > rb ? 1 : 0;
        if (ra) return -1; if (rb) return 1; return 0;
    });

    const total       = procedimentos.filter(p => _ehColeta(p) && !['concluido','cancelado'].includes(p.status)).length;
    const vencidas    = procedimentos.filter(p => _ehColeta(p) && !['concluido','cancelado'].includes(p.status) && (p.dataRetirar||p.retirada||'') && (p.dataRetirar||p.retirada) < hoje).length;
    const hojeCount   = procedimentos.filter(p => _ehColeta(p) && (p.dataRetirar||p.retirada) === hoje).length;
    const semData     = procedimentos.filter(p => _ehColeta(p) && !p.dataRetirar && !p.retirada && !['concluido','cancelado'].includes(p.status)).length;
    const concluidas  = procedimentos.filter(p => _ehColeta(p) && p.status === 'concluido').length;

    const btnFiltro = (id, label, count, cor) => {
        const ativo = _coletaFiltro === id;
        return `<button onclick="_coletaFiltro='${id}';renderColetaView()" style="flex-shrink:0;padding:6px 12px;border-radius:999px;border:1.5px solid ${ativo?cor:'rgba(150,150,150,0.25)'};background:${ativo?cor+'22':'transparent'};color:${ativo?cor:'#888'};font-family:var(--mono);font-size:0.68rem;font-weight:700;cursor:pointer;white-space:nowrap;">${label}${count?` <span style="background:${cor};color:#fff;border-radius:999px;padding:0 6px;font-size:0.6rem;margin-left:3px;">${count}</span>`:''}  </button>`;
    };

    // Botão WA em lote — pendentes/vencidas
    const pendentesLote = procedimentos.filter(p => _ehColeta(p) && !['concluido','cancelado'].includes(p.status));

    let html = `
    <div style="margin-bottom:14px;">
        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
            <div style="font-family:var(--mono);font-size:0.85rem;font-weight:700;letter-spacing:0.1em;color:#818cf8;text-transform:uppercase;">✈️ Coleta Prioritária</div>
            <div style="display:flex;gap:7px;flex-wrap:wrap;">
                <button onclick="exportarWhatsAppColeta()" style="padding:7px 12px;border-radius:10px;background:linear-gradient(135deg,#25d366,#128c7e);color:#fff;border:none;font-family:var(--mono);font-size:0.7rem;font-weight:700;cursor:pointer;">📲 Cobrar lote (${pendentesLote.length})</button>
                <button onclick="openModalVolumes()" style="padding:7px 14px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;border:none;font-family:var(--mono);font-size:0.72rem;font-weight:700;cursor:pointer;">+ Adicionar</button>
            </div>
        </div>
        <!-- Busca -->
        <input type="text" placeholder="🔍 Buscar fornecedor, transportadora, NF, CTE..." value="${_coletaBusca}"
            oninput="_coletaBusca=this.value;renderColetaView()"
            style="width:100%;box-sizing:border-box;padding:10px 14px;border-radius:12px;border:1.5px solid rgba(99,102,241,0.3);background:rgba(99,102,241,0.04);font-family:var(--mono);font-size:0.8rem;color:var(--text);outline:none;margin-bottom:10px;"
            onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='rgba(99,102,241,0.3)'">
        <!-- Filtros -->
        <div style="display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:4px;">
            ${btnFiltro('ativas',    '✈️ Ativas',     total,    '#6366f1')}
            ${btnFiltro('vencidas',  '❌ Vencidas',   vencidas,  '#ef4444')}
            ${btnFiltro('hoje',      '⏰ Hoje',        hojeCount, '#f97316')}
            ${btnFiltro('semdata',   '🕐 Sem data',   semData,   '#64748b')}
            ${btnFiltro('concluidas','✔️ Concluídas', concluidas,'#22c55e')}
        </div>
        <!-- Filtro por período -->
        <div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap;">
            <span style="font-family:var(--mono);font-size:0.62rem;letter-spacing:0.1em;color:#9ca3af;text-transform:uppercase;white-space:nowrap;">Período:</span>
            <input type="date" value="${_coletaDe}" onchange="_coletaDe=this.value;renderColetaView()"
                style="border:1px solid rgba(99,102,241,0.25);border-radius:8px;padding:4px 8px;font-family:var(--mono);font-size:0.72rem;background:transparent;color:var(--text);outline:none;">
            <span style="color:#9ca3af;font-size:0.7rem;">→</span>
            <input type="date" value="${_coletaAte}" onchange="_coletaAte=this.value;renderColetaView()"
                style="border:1px solid rgba(99,102,241,0.25);border-radius:8px;padding:4px 8px;font-family:var(--mono);font-size:0.72rem;background:transparent;color:var(--text);outline:none;">
            ${(_coletaDe||_coletaAte) ? `<button onclick="_coletaDe='';_coletaAte='';renderColetaView()" style="padding:4px 8px;border-radius:8px;border:1px solid rgba(150,150,150,0.25);background:transparent;color:#9ca3af;font-family:var(--mono);font-size:0.65rem;cursor:pointer;">✕ Limpar</button>` : ''}
        </div>
    </div>
    `;

    if (lista.length === 0) {
        html += `<div style="text-align:center;padding:60px 20px;color:var(--text-dim);font-family:var(--mono);font-size:0.9rem;">✈️ Nenhum volume urgente ativo</div>`;
    } else {
        html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">`;
        lista.forEach(proc => {
            const realIndex = proc._docId || proc.id;
            const dataRet = proc.dataRetirar || proc.retirada || '';
            const vencida = dataRet && dataRet < hoje;
            const ehHoje = dataRet === hoje;
            const corRet = vencida ? '#ff3333' : (ehHoje ? '#f97316' : '#818cf8');
            const labelRet = vencida ? '❌ VENCIDA' : (ehHoje ? '⏰ HOJE' : '📅');
            const retFmt = dataRet ? `${labelRet} ${new Date(dataRet+'T00:00:00').toLocaleDateString('pt-BR')}${proc.horaRetirar ? ' · '+proc.horaRetirar : ''}` : '—';
            const statusMap = {coleta_urgente:'✈️ Aguardando',concluido:'✔️ Concluído',cancelado:'❌ Cancelado',a_retirar:'📦 A Retirar'};
            const sLabel = statusMap[proc.status] || proc.status;
            const borderTop = vencida ? '#ff3333' : (ehHoje ? '#f97316' : '#6366f1');
            html += `<div style="background:var(--surface);border:1px solid var(--border);border-top:3px solid ${borderTop};border-radius:14px;padding:16px 18px;${vencida||ehHoje?'animation:cardPiscarColeta 0.8s ease-in-out infinite;':''}">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                    <span style="font-family:var(--mono);font-size:0.78rem;font-weight:700;color:#818cf8;text-transform:uppercase;">✈️ Coleta Prioritária</span>
                    <span style="font-family:var(--mono);font-size:0.72rem;font-weight:700;background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.4);border-radius:20px;padding:2px 10px;">${sLabel}</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:7px;font-size:0.83rem;">
                    ${proc.nfCompra ? `<div style="display:flex;justify-content:space-between;align-items:baseline;"><span style="color:var(--text-dim);font-family:var(--mono);font-size:0.7rem;white-space:nowrap;">🧾 NF COMPRA</span><span style="font-weight:700;color:var(--text);text-align:right;">${proc.nfCompra}</span></div>` : ''}
                    ${proc.cte ? `<div style="display:flex;justify-content:space-between;align-items:baseline;"><span style="color:var(--text-dim);font-family:var(--mono);font-size:0.7rem;white-space:nowrap;">📦 CTE</span><span style="font-weight:700;color:var(--text);text-align:right;">${proc.cte}</span></div>` : ''}
                    ${proc.coletaFornecedor ? `<div style="display:flex;justify-content:space-between;align-items:baseline;"><span style="color:var(--text-dim);font-family:var(--mono);font-size:0.7rem;white-space:nowrap;">🏭 FORNECEDOR</span><span style="font-weight:700;color:var(--text);text-align:right;margin-left:8px;">${proc.coletaFornecedor}</span></div>` : ''}
                    ${proc.coletaTransportadora ? `<div style="display:flex;justify-content:space-between;align-items:baseline;"><span style="color:var(--text-dim);font-family:var(--mono);font-size:0.7rem;white-space:nowrap;">🚚 TRANSPORTADORA</span><span style="font-weight:700;color:var(--text);text-align:right;margin-left:8px;">${proc.coletaTransportadora}</span></div>` : ''}
                    ${proc.coletaDataCirurgia ? `<div style="display:flex;justify-content:space-between;align-items:baseline;"><span style="color:var(--text-dim);font-family:var(--mono);font-size:0.7rem;white-space:nowrap;">🗓 CIRURGIA</span><span style="font-weight:700;color:#818cf8;text-align:right;">${new Date(proc.coletaDataCirurgia+'T00:00:00').toLocaleDateString('pt-BR')}${proc.coletaHoraCirurgia?' · ⏰ '+proc.coletaHoraCirurgia:''}</span></div>` : ''}
                    <div style="display:flex;justify-content:space-between;align-items:baseline;"><span style="color:var(--text-dim);font-family:var(--mono);font-size:0.7rem;white-space:nowrap;">📦 RETIRADA</span><span style="font-weight:700;color:${corRet};text-align:right;">${retFmt}${dataRet && window._diasParaRetirada ? ` <span style="font-size:0.65rem;background:${(window._diasParaRetirada(dataRet)||{}).cor||'#818cf8'}22;border:1px solid ${(window._diasParaRetirada(dataRet)||{}).cor||'#818cf8'}44;border-radius:6px;padding:1px 5px;margin-left:4px;">${(window._diasParaRetirada(dataRet)||{}).txt||''}</span>` : ''}</span></div>
                </div>
                ${proc.coletaObs ? `<div style="margin-top:8px;padding:7px 10px;background:rgba(99,102,241,0.05);border-radius:8px;border:1px solid rgba(99,102,241,0.15);font-size:0.75rem;color:var(--text-dim);">📝 ${proc.coletaObs}</div>` : ''}
                ${proc.coletaAnexo ? `<div style="margin-top:8px;">
                    ${/\.(jpg|jpeg|png|webp|gif)$/i.test(proc.coletaAnexo) || proc.coletaAnexo.startsWith('data:image') || (proc.coletaAnexo.includes('firebasestorage') && !proc.coletaAnexo.includes('.pdf'))
                        ? `<img src="${proc.coletaAnexo}" alt="Anexo" style="max-width:100%;max-height:160px;border-radius:8px;border:1px solid rgba(99,102,241,0.25);object-fit:cover;cursor:pointer;" onclick="window.abrirAnexoProc('${realIndex}','coletaAnexo')" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div style="display:none;align-items:center;gap:6px;padding:8px 10px;background:rgba(99,102,241,0.08);border-radius:8px;border:1px solid rgba(99,102,241,0.2);cursor:pointer;" onclick="window.abrirAnexoProc('${realIndex}','coletaAnexo')"><span>📎</span><span style="font-family:var(--mono);font-size:0.7rem;color:#818cf8;">Ver anexo →</span></div>`
                        : `<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:rgba(99,102,241,0.08);border-radius:8px;border:1px solid rgba(99,102,241,0.2);cursor:pointer;" onclick="window.abrirAnexoProc('${realIndex}','coletaAnexo')"><span>📄</span><span style="font-family:var(--mono);font-size:0.7rem;color:#818cf8;font-weight:700;">Ver anexo →</span></div>`
                    }
                </div>` : ''}
                ${proc._updatedAt ? `<div style="margin-top:6px;font-family:var(--mono);font-size:0.62rem;color:#9ca3af;letter-spacing:0.05em;">🕐 Atualizado: ${window._fmtUpdatedAt ? window._fmtUpdatedAt(proc._updatedAt) : ''}</div>` : ''}
                <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
                    <button onclick="editProc('${realIndex}')" style="flex:1;padding:7px;border-radius:8px;background:transparent;border:1px solid var(--border);color:var(--text-dim);font-family:var(--mono);font-size:0.72rem;font-weight:700;cursor:pointer;">✏ Editar</button>
                    <button onclick="duplicarColeta('${realIndex}')" style="padding:7px 10px;border-radius:8px;background:rgba(42,159,191,0.1);border:1px solid rgba(42,159,191,0.35);color:#2a9fbf;font-family:var(--mono);font-size:0.72rem;font-weight:700;cursor:pointer;" title="Duplicar coleta">⊕</button>
                    ${proc.status !== 'concluido' && proc.status !== 'cancelado' ? `<button onclick="abrirInfoVolumesUrgentes('${realIndex}')" style="flex:1;padding:7px;border-radius:8px;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.4);color:#818cf8;font-family:var(--mono);font-size:0.72rem;font-weight:700;cursor:pointer;">✈️ Infos</button>
                    <button onclick="confirmarRetiradaVolumes('${realIndex}')" style="flex:1;padding:7px;border-radius:8px;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.4);color:#22c55e;font-family:var(--mono);font-size:0.72rem;font-weight:700;cursor:pointer;">✅ Concluir</button>` : ''}
                    <button onclick="compartilharWhatsApp('${realIndex}')" style="padding:7px 10px;border-radius:8px;background:rgba(37,211,102,0.1);border:1px solid rgba(37,211,102,0.4);color:#25d366;font-family:var(--mono);font-size:0.72rem;font-weight:700;cursor:pointer;">📲</button>
                    <button onclick="deleteProc('${realIndex}')" style="padding:7px 10px;border-radius:8px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.35);color:#ef4444;font-family:var(--mono);font-size:0.72rem;font-weight:700;cursor:pointer;">✕</button>
                </div>
            </div>`;
        });
        html += `</div>`;
    }
    view.innerHTML = html;
}

// ─── TABLE SORT STATE ───
let tableSortCol = 'inicio';
let tableSortDir = 1;

const TABLE_COLS = [
    { key: 'inicio',        label: '🕐 Horário' },
    { key: 'status',        label: 'Status' },
    { key: 'paciente',      label: 'Paciente' },
    { key: 'nf',            label: 'Nº NF',      minWidth: '80px' },
    { key: 'nfData',        label: 'Emissão NF', minWidth: '90px' },
    { key: 'convenio',      label: 'Convênio' },
    { key: 'procedimento',  label: 'Procedimento' },
    { key: 'medico',        label: 'Cirurgião' },
    { key: 'hospital',      label: 'Hospital' },
    { key: 'vendedor',      label: 'Vendedor' },
    { key: 'linha',         label: 'Linha' },
    { key: 'obs',           label: 'Obs', nosort: true },
    { key: '_acoes',        label: 'Ações', nosort: true }
];

function sortTable(key) {
    if (tableSortCol === key) {
        tableSortDir *= -1;
    } else {
        tableSortCol = key;
        tableSortDir = 1;
    }
    renderTable();
}

function renderTable() {
    const table = document.getElementById('procTable');
    if (!table) return; // guard: DOM ainda não pronto

    const filtered = getFiltered();
    const list = mostrarOcultos
        ? filtered.filter(p => p.status === 'concluido' || p.status === 'cancelado')
        : searchTerm.trim()
            ? filtered
            : filtered.filter(p => p.status !== 'concluido' && p.status !== 'cancelado');
    const statusMap = { a_agendar:'Autorizado', andamento:'Em Procedimento', preparacao:'Em Separação', agendado:'Agendado', em_transito:'Em Trânsito', concluido:'Concluído', cancelado:'Cancelado', reagendado:'Reagendado', a_retirar:'Aguardando Retirada', urgencia:'🚨 URGÊNCIA', coleta_urgente:'✈️ Coleta Prioritária' };

    // Ordenar por horário (padrão) ou coluna selecionada
    const finalList = [...list].sort((a, b) => {
        let va = (a[tableSortCol] || '').toString().toLowerCase();
        let vb = (b[tableSortCol] || '').toString().toLowerCase();
        if (va < vb) return -1 * tableSortDir;
        if (va > vb) return 1 * tableSortDir;
        return 0;
    });

    // Header
    table.querySelector('thead').innerHTML = `<tr>${TABLE_COLS.map(c => `
        <th class="${tableSortCol === c.key ? 'sorted' : ''}" onclick="${c.nosort ? '' : `sortTable('${c.key}')`}" style="${c.nosort ? 'cursor:default;' : ''}${c.minWidth ? 'min-width:'+c.minWidth+';' : ''}">
            ${c.label}
            ${!c.nosort ? `<span class="sort-icon">${tableSortCol === c.key ? (tableSortDir === 1 ? '▲' : '▼') : '⇅'}</span>` : ''}
        </th>`).join('')}</tr>`;

    if (finalList.length === 0) {
        table.querySelector('tbody').innerHTML = `<tr><td colspan="${TABLE_COLS.length}" style="text-align:center;padding:40px;color:var(--text-dim);font-family:var(--mono);font-size:0.8rem;">Nenhum procedimento encontrado</td></tr>`;
        return;
    }

    const statusColors = {
        a_agendar:'#06b6d4', agendado:'#4db87a', em_transito:'#6366f1', preparacao:'#d4920a',
        andamento:'#d94f4f', concluido:'#64748b', cancelado:'#f87171',
        reagendado:'#a78bfa', a_retirar:'#f97316', urgencia:'#ff0000',
        coleta_urgente:'#6366f1'
    };

    const pillAnim = {
        andamento:   'animation:pillPulseAndamento 1s ease-in-out infinite;',
        preparacao:  'animation:pillPulsePreparacao 2.2s ease-in-out infinite;',
        a_retirar:   'animation:pillPulseRetirar 0.8s ease-in-out infinite;',
        urgencia:    'animation:pillPulseUrgencia 0.5s ease-in-out infinite;',
        coleta_urgente: 'animation:pillPulseColeta 0.6s ease-in-out infinite;',
    };

    table.querySelector('tbody').innerHTML = finalList.map((proc, idx) => {
        const realIndex = proc._docId || proc.id;
        const isRetirar = (proc.status === 'a_retirar');
        const dataFmt = proc.data ? new Date(proc.data + 'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : '—';
        const cor = statusColors[proc.status] || '#94a3b8';
        const anim = pillAnim[proc.status] || '';
        const isUrgente = proc.status === 'urgencia' || proc.status === 'coleta_urgente';
        const rowStyle = isUrgente ? 'animation:urgenciaRowBlink 0.8s ease-in-out infinite;' : (idx%2===0?'background:rgba(214,239,222,0.18);':'');

        const pillOnclick = isRetirar ? `onclick="confirmarRetiradaCirurgia('${realIndex}')" title="Confirmar retirada"` : '';
        const statusPill = `<span ${pillOnclick} style="
            display:inline-flex;align-items:center;gap:5px;
            font-family:var(--mono);font-size:0.62rem;font-weight:700;
            letter-spacing:0.07em;text-transform:uppercase;
            padding:4px 10px;border-radius:6px;white-space:nowrap;
            background:${cor}22;color:${cor};border:1px solid ${cor}55;
            ${anim}${isRetirar ? 'cursor:pointer;' : ''}
        "><span style="width:6px;height:6px;border-radius:50%;background:${cor};flex-shrink:0;display:inline-block;"></span>${statusMap[proc.status] || proc.status}${isRetirar ? ' 👆' : ''}</span>`;

        const retiradaFmt = proc.retirada ? new Date(proc.retirada + 'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : '\u2014';
        const tdCell = function(txt, extra, maxW) { extra=extra||''; maxW=maxW||''; return '<td style="font-family:var(--mono);font-size:0.78rem;color:#1a3a45;padding:9px 12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'+(maxW?'max-width:'+maxW+';':'')+extra+'">'+(txt||'\u2014')+'</td>'; };

        var trOnclick = isRetirar
            ? 'confirmarRetiradaCirurgia(\'' + realIndex + '\')'
            : 'editProc(\'' + realIndex + '\')';
        var trTitle = isRetirar ? 'Clique para confirmar retirada' : 'Clique para editar';
        const trReagVencido = proc.status === 'reagendado' && proc.data && proc.data < todayStr();
        var row = '<tr class="row-'+proc.status+(trReagVencido?' reagendado-vencido':'')+'" style="'+rowStyle+'cursor:pointer;" onclick="'+trOnclick+'" title="'+trTitle+'">';
        row += '<td style="font-family:var(--mono);font-weight:800;font-size:0.9rem;color:#2a9fbf;padding:9px 12px;line-height:1.5;">'
            +(proc.inicio||'\u2014')
            +(proc.data ? '<div style="font-size:0.65rem;font-weight:600;color:#2a7a4a;margin-top:2px;">📅 '+new Date(proc.data+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+'</div>' : '')
            +(proc.retirada ? '<div style="font-size:0.65rem;font-weight:700;color:#f97316;margin-top:1px;">📦 '+new Date(proc.retirada+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+'</div>' : '')
            +'</td>';
        row += '<td style="padding:9px 12px;">'+statusPill+'</td>';
        row += '<td style="font-family:\'Space Grotesk\',sans-serif;font-weight:600;font-size:0.83rem;padding:9px 12px;max-width:210px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;" title="'+(proc.paciente||'')+'">'+(proc.paciente||'—')+'</td>';
        var nfDataFmt = proc.nfData ? new Date(proc.nfData+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : '—';
        row += '<td style="font-family:var(--mono);font-size:0.77rem;font-weight:600;padding:9px 12px;min-width:80px;text-align:center;">'+(proc.nf||'—')+'</td>';
        row += '<td style="font-family:var(--mono);font-size:0.77rem;font-weight:600;padding:9px 12px;min-width:90px;text-align:center;'+(proc.nfData?'color:#2a7a6a;':'color:var(--text-dim);')+'">'+ nfDataFmt +'</td>';
        row += tdCell(proc.convenio);
        row += '<td style="font-family:var(--mono);font-size:0.77rem;font-weight:600;padding:9px 12px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+(proc.procedimento||'')+'">'+(proc.procedimento||'\u2014')+'</td>';
        row += '<td style="font-family:var(--mono);font-size:0.77rem;color:#2a5a6a;padding:9px 12px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+(proc.medico||'')+'">'+(proc.medico||'\u2014')+'</td>';
        row += '<td style="font-family:var(--mono);font-size:0.75rem;color:#2a5a6a;padding:9px 12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+(proc.hospital||'')+'">'+(proc.hospital||'\u2014').replace(/^Hospital /i,'')+'</td>';
        row += '<td style="font-family:var(--mono);font-size:0.75rem;color:#2a5a6a;padding:9px 12px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+(proc.vendedor||'')+'">'+(proc.vendedor||'\u2014')+'</td>';
        row += tdCell(proc.linha, 'color:#2a7a6a;');
        row += '<td style="font-family:var(--mono);font-size:0.72rem;color:#4a6a75;padding:9px 12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+(proc.obs||'')+'">'+(proc.obs||'\u2014')+'</td>';
        // Botões de módulo embutidos diretamente no HTML da tabela
        const _ckBtn = ['preparacao','agendado','reagendado','andamento'].includes(proc.status)
            ? '<button onclick="event.stopPropagation();window.abrirChecklist&&window.abrirChecklist(\''+realIndex+'\')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(77,184,122,0.5);background:rgba(77,184,122,0.1);font-family:var(--mono);font-size:0.6rem;font-weight:700;cursor:pointer;color:#4db87a;white-space:nowrap;">☑ CK</button>' : '';
        const _lembBtn = '<button onclick="event.stopPropagation();window.abrirModalLembrete&&window.abrirModalLembrete(\''+realIndex+'\')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(99,102,241,0.5);background:rgba(99,102,241,0.1);font-family:var(--mono);font-size:0.6rem;font-weight:700;cursor:pointer;color:#6366f1;white-space:nowrap;">⏰</button>';
        const _comtBtn = '<button onclick="event.stopPropagation();window.abrirComentarios&&window.abrirComentarios(\''+realIndex+'\')" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(75,180,210,0.5);background:rgba(75,180,210,0.1);font-family:var(--mono);font-size:0.6rem;font-weight:700;cursor:pointer;color:#4bb4d2;white-space:nowrap;">💬</button>';
        // Célula de ações — diferente para a_retirar
        var tdAcoes = '<td onclick="event.stopPropagation()" style="padding:7px 8px;">';
        if (isRetirar) {
            tdAcoes += '<div style="display:flex;flex-direction:column;gap:4px;">';
            tdAcoes += '<button onclick="confirmarRetiradaCirurgia(\'' + realIndex + '\')" style="padding:5px 10px;border-radius:7px;border:1px solid rgba(249,115,22,0.5);background:rgba(249,115,22,0.1);font-family:var(--mono);font-size:0.6rem;font-weight:700;cursor:pointer;color:#f97316;white-space:nowrap;">📦 Retirou?</button>';
            tdAcoes += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
            tdAcoes += _lembBtn + _comtBtn;
            tdAcoes += '<button onclick="editProc(\'' + realIndex + '\')" style="flex:1;padding:4px 9px;border-radius:6px;border:1px solid rgba(135,195,150,0.4);background:rgba(255,255,255,0.75);font-family:var(--mono);font-size:0.6rem;font-weight:700;cursor:pointer;color:var(--text-dim);">✏ Editar</button>';
            tdAcoes += '<button onclick="deleteProc(\'' + realIndex + '\')" style="padding:4px 9px;border-radius:6px;border:1px solid rgba(239,68,68,0.3);background:rgba(255,255,255,0.75);font-family:var(--mono);font-size:0.6rem;font-weight:700;cursor:pointer;color:#d94f4f;">✕</button>';
            tdAcoes += '</div>';
            tdAcoes += '</div>';
        } else {
            tdAcoes += '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">';
            tdAcoes += _ckBtn + _lembBtn + _comtBtn;
            tdAcoes += '<button onclick="editProc(\'' + realIndex + '\')" style="padding:4px 9px;border-radius:6px;border:1px solid rgba(135,195,150,0.4);background:rgba(255,255,255,0.75);font-family:var(--mono);font-size:0.6rem;font-weight:700;cursor:pointer;color:var(--text-dim);">✏ Editar</button>';
            tdAcoes += '<button onclick="deleteProc(\'' + realIndex + '\')" style="padding:4px 9px;border-radius:6px;border:1px solid rgba(239,68,68,0.3);background:rgba(255,255,255,0.75);font-family:var(--mono);font-size:0.6rem;font-weight:700;cursor:pointer;color:#d94f4f;">✕</button>';
            tdAcoes += '</div>';
        }
        tdAcoes += '</td>';
        row += tdAcoes;
        row += '</tr>';
        return row;
    }).join('');
}

// ─── FORM: Hospital/Convenio outros ───
// hospital field is now a free-text input with datalist

document.getElementById('f-convenio').addEventListener('change', function() {
    document.getElementById('g-outro-conv').style.display = this.value === '__outro' ? 'block' : 'none';
});

// ─── STATUS → RETIRADA obrigatória + modo Retirar Volumes Urgentes ───
document.getElementById('f-status').addEventListener('change', function() {
    const val = this.value;
    const isRetirar = val === 'a_retirar';
    const isColeta  = val === 'coleta_urgente';
    const grp = document.getElementById('g-retirada');
    const inp = document.getElementById('f-retirada');
    const lbl = document.getElementById('label-retirada');
    const grpColeta = document.getElementById('g-coleta-urgente');

    // Campos required a desativar no modo coleta
    const reqIds = ['f-status','f-data','f-medico','f-vendedor','f-hospital','f-convenio','f-paciente','f-procedimento','f-linha','f-subgrupo'];

    // Ocultar/mostrar todos os form-group quando Retirar Volumes Urgentes
    const formGrid = document.getElementById('procForm')?.querySelector('.form-grid');
    if (formGrid) {
        Array.from(formGrid.children).forEach(el => {
            if (el.id === 'g-coleta-urgente') return;
            if (isColeta) {
                el.dataset.prevDisplay = el.style.display || '';
                el.style.display = 'none';
            } else {
                el.style.display = (el.dataset.prevDisplay !== undefined && el.dataset.prevDisplay !== null)
                    ? el.dataset.prevDisplay : '';
                delete el.dataset.prevDisplay;
            }
        });
    }

    // Remover/restaurar required nos campos obrigatórios
    reqIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (isColeta) {
            el.dataset.wasRequired = el.required ? '1' : '0';
            el.required = false;
        } else {
            if (el.dataset.wasRequired === '1') el.required = true;
            delete el.dataset.wasRequired;
        }
    });

    if (grpColeta) grpColeta.style.display = isColeta ? 'block' : 'none';

    // ─── Reagendado: destacar campo de data e auto-preencher retirada ───
    const fDataEl = document.getElementById('f-data');
    const reagHint = document.getElementById('reagendado-data-hint');
    if (val === 'reagendado') {
        if (reagHint) reagHint.style.display = '';
        if (fDataEl) {
            fDataEl.style.borderColor = '#a78bfa';
            fDataEl.style.boxShadow = '0 0 0 3px rgba(167,139,250,0.3)';
            autoRetirada(fDataEl.value);
            setTimeout(() => fDataEl.focus(), 100);
        }
    } else {
        if (reagHint) reagHint.style.display = 'none';
        if (fDataEl) { fDataEl.style.borderColor = ''; fDataEl.style.boxShadow = ''; }
    }

    if (!isColeta) {
        const isAndamento = val === 'andamento';
        const precisaRetirada = isRetirar || isAndamento;
        if (precisaRetirada) {
            grp.style.display = '';
            grp.style.animation = isAndamento ? 'retiradaObrig 1.2s ease-in-out infinite' : 'retiradaObrig 0.9s ease-in-out infinite';
            inp.style.borderColor = '#f97316';
            inp.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.25)';
            inp.required = true;
            lbl.innerHTML = '📦 Data de Retirada <span style="color:#f97316;font-weight:700;">* obrigatório</span>';
            if (!inp.value) inp.focus();
        } else {
            grp.style.animation = '';
            if (val !== 'reagendado') { inp.style.borderColor = ''; inp.style.boxShadow = ''; }
            inp.required = false;
            lbl.innerHTML = '📦 Data de Retirada';
        }
    } else {
        // Volumes urgentes — ocultar campo de retirada geral (usa o campo próprio do bloco coleta)
        grp.style.display = 'none';
        grp.style.animation = '';
        inp.style.borderColor = '';
        inp.style.boxShadow = '';
        inp.required = false;
        inp.value = '';
    }
});

// ─── AUTO PREENCHER RETIRADA NO MODAL RETIRAR VOLUMES URGENTES ───
function autoPreencherRetiradaColeta(val) {
    if (!val) return;
    var fRet = document.getElementById('f-data-retirar');
    if (!fRet) return;
    var d = new Date(val + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    var d1 = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    fRet.value = d1;
    // Também preenche o f-retirada principal (usado na promoção automática)
    var fRetMain = document.getElementById('f-retirada');
    if (fRetMain && !fRetMain.value) fRetMain.value = d1;
    // Feedback visual
    fRet.style.borderColor = '#4db87a';
    fRet.style.boxShadow = '0 0 0 3px rgba(77,184,122,0.3)';
    setTimeout(function() { fRet.style.borderColor = 'rgba(99,102,241,0.4)'; fRet.style.boxShadow = ''; }, 1500);
}

// ─── AUTO PREENCHER DATA DE RETIRADA = DATA CIRURGIA + 1 DIA ───
document.getElementById('f-data').addEventListener('change', function() {
    const fRetirada = document.getElementById('f-retirada');
    if (!this.value) return;
    // Sempre calcula D+1 ao mudar a data — novo ou edição
    const d = new Date(this.value + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    const d1 = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    fRetirada.value = d1;
    // Atualizar label e estilo do campo de retirada
    const lbl = document.getElementById('label-retirada');
    if (lbl) lbl.innerHTML = '📦 Data de Retirada <span style="color:#4db87a;font-size:0.7rem;">(preenchido automaticamente)</span>';
    fRetirada.style.borderColor = '#4db87a';
    fRetirada.style.boxShadow = '0 0 0 3px rgba(77,184,122,0.3)';
    setTimeout(function() {
        fRetirada.style.borderColor = '';
        fRetirada.style.boxShadow = '';
        if (lbl) lbl.innerHTML = '📦 Data de Retirada';
    }, 2000);
});

// Close modal clicking outside
document.getElementById('modalOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

// ─── DRAG TO SCROLL + BOTÕES — Central Cirúrgica ───
(function() {
    var wrap = document.getElementById('mainTableWrap');
    if (!wrap) return;

    // Botões de seta
    var btnL = document.getElementById('tblScrollLeft');
    var btnR = document.getElementById('tblScrollRight');
    var STEP = 280;

    function updateBtns() {
        if (!btnL || !btnR) return;
        var atLeft  = wrap.scrollLeft <= 2;
        var atRight = wrap.scrollLeft >= wrap.scrollWidth - wrap.clientWidth - 2;
        btnL.classList.toggle('visible', !atLeft);
        btnR.classList.toggle('visible', !atRight);
    }

    wrap.addEventListener('scroll', updateBtns, { passive: true });
    // Verifica após render das linhas
    setTimeout(updateBtns, 800);

    window.tblScroll = function(dir) {
        wrap.scrollBy({ left: dir * STEP, behavior: 'smooth' });
        setTimeout(updateBtns, 350);
    };

    // Drag to scroll
    var isDown = false, moved = false, startX = 0, startScrollLeft = 0;
    wrap.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        if (e.target.closest('button,a,input,select,.btn-act')) return;
        isDown = true;
        moved = false;
        startX = e.clientX;
        startScrollLeft = wrap.scrollLeft;
        e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
        if (!isDown) return;
        var dx = startX - e.clientX;
        if (Math.abs(dx) > 4) {
            moved = true;
            wrap.classList.add('is-dragging');
            wrap.scrollLeft = startScrollLeft + dx;
        }
    });
    document.addEventListener('mouseup', function() {
        if (!isDown) return;
        isDown = false;
        wrap.classList.remove('is-dragging');
        updateBtns();
    });
    wrap.addEventListener('click', function(e) {
        if (moved) { e.stopPropagation(); moved = false; }
    }, true);
})();

// ─── EXPORT ───
function openExportModal() {
    // Set default date range to current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    document.getElementById('exp-de').value = firstDay;
    document.getElementById('exp-ate').value = lastDay;
    document.getElementById('exportModal').classList.add('open');
}

function closeExportModal() {
    document.getElementById('exportModal').classList.remove('open');
}

function toggleTodosVendedores(el) {
    document.querySelectorAll('.exp-vendedor').forEach(v => v.checked = el.checked);
}

function doExport() {
    const de = document.getElementById('exp-de').value;
    const ate = document.getElementById('exp-ate').value;
    const vendedores = Array.from(document.querySelectorAll('.exp-vendedor:checked')).map(v => v.value);
    const statuses = Array.from(document.querySelectorAll('.exp-status:checked')).map(s => s.value);

    const filtered = procedimentos.filter(p => {
        if (de && p.data < de) return false;
        if (ate && p.data > ate) return false;
        if (vendedores.length && !vendedores.includes(p.vendedor)) return false;
        if (statuses.length && !statuses.includes(p.status)) return false;
        return true;
    });

    if (filtered.length === 0) {
        alert('Nenhum procedimento encontrado com os filtros selecionados.');
        return;
    }

    const statusMap = { a_agendar:'Autorizado', andamento:'Em Procedimento', preparacao:'Em Separação', agendado:'Agendado', em_transito:'Em Trânsito', concluido:'Concluído', cancelado:'Cancelado', reagendado:'Reagendado', a_retirar:'Aguardando Retirada', urgencia:'🚨 URGÊNCIA', coleta_urgente:'✈️ Coleta Prioritária' };

    // Sheet 1: Resumo completo
    const resumo = filtered.map(p => ({
        'Data de Cirurgia': p.data ? new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR') : '',
        'Hospital': p.hospital || '',
        'Cidade': p.cidade || '',
        'Status': statusMap[p.status] || p.status,
        'Médico': p.medico || '',
        'Paciente': p.paciente || '',
        'Procedimento': p.procedimento || '',
        'Convênio': p.convenio || '',
        'Vendedor': p.vendedor || '',
        'Linha de Produtos': p.linha || '',
        'Início': p.inicio || '',
        'Nº Nota Fiscal': p.nf || '',
        'Data Emissão NF': p.nfData ? new Date(p.nfData + 'T00:00:00').toLocaleDateString('pt-BR') : '',
        'Equipe': p.equipe || '',
        'Itens Autorização / Solicitação': p.itens ? p.itens.replace(/\n/g, ' | ') : '',
        'Observações': p.obs || ''
    }));

    // Sheet 2: Por vendedor (cobrança WhatsApp)
    const vendedorRows = [];
    const vendedoresUnicos = [...new Set(filtered.map(p => p.vendedor).filter(Boolean))];
    vendedoresUnicos.forEach(v => {
        const procs = filtered.filter(p => p.vendedor === v);
        vendedorRows.push({ 'VENDEDOR': v.toUpperCase(), 'Data de Cirurgia': '', 'Hospital': '', 'Procedimento': '', 'Convênio': '', 'Status': '', 'Itens': '' });
        procs.forEach(p => {
            vendedorRows.push({
                'VENDEDOR': '',
                'Data de Cirurgia': p.data ? new Date(p.data + 'T00:00:00').toLocaleDateString('pt-BR') : '',
                'Hospital': p.hospital || '',
                'Procedimento': p.procedimento || '',
                'Convênio': p.convenio || '',
                'Status': statusMap[p.status] || p.status,
                'Itens': p.itens ? p.itens.replace(/\n/g, ' | ') : ''
            });
        });
        vendedorRows.push({ 'VENDEDOR': `Subtotal: ${procs.length} procedimento(s)`, 'Data de Cirurgia':'','Hospital':'','Procedimento':'','Convênio':'','Status':'','Itens':'' });
        vendedorRows.push({ 'VENDEDOR': '', 'Data de Cirurgia':'','Hospital':'','Procedimento':'','Convênio':'','Status':'','Itens':'' });
    });

    const wb = XLSX.utils.book_new();

    // Sheet 1
    const ws1 = XLSX.utils.json_to_sheet(resumo);
    ws1['!cols'] = [
        {wch:12},{wch:35},{wch:16},{wch:30},{wch:35},{wch:18},{wch:28},{wch:20},{wch:8},{wch:20},{wch:50},{wch:40}
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'Todos os Procedimentos');

    // Sheet 2
    const ws2 = XLSX.utils.json_to_sheet(vendedorRows);
    ws2['!cols'] = [{wch:30},{wch:12},{wch:35},{wch:35},{wch:18},{wch:16},{wch:50}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Por Vendedor (Cobrança)');

    // Filename with date range
    const periodo = de && ate ? `_${de}_a_${ate}` : '';
    const filename = `mapa_cirurgico${periodo}.xlsx`;
    XLSX.writeFile(wb, filename);
    closeExportModal();
}

// Close export modal clicking outside
document.getElementById('exportModal').addEventListener('click', function(e) {
    if (e.target === this) closeExportModal();
});

// ─── BACKUP MANUAL ───
function exportBackupJSON() {
    const backup = {
        versao: '1.0',
        exportadoEm: new Date().toISOString(),
        totalRegistros: procedimentos.length,
        procedimentos: procedimentos
    };
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dataHoje = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `backup_campogrande_${dataHoje}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function importBackupJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const backup = JSON.parse(e.target.result);
            const dados = Array.isArray(backup) ? backup : (backup.procedimentos || null);
            if (!dados || !Array.isArray(dados)) {
                alert('❌ Arquivo inválido. O JSON não contém dados reconhecíveis.');
                return;
            }
            const total = dados.length;
            const exportadoEm = backup.exportadoEm
                ? new Date(backup.exportadoEm).toLocaleString('pt-BR')
                : 'data desconhecida';
            const confirmMsg = `📂 Backup de ${exportadoEm}\n📋 ${total} procedimento(s) encontrado(s)\n\nOK = Substituir tudo | Cancelar = Abortar`;
            if (!confirm(confirmMsg)) { event.target.value = ''; return; }

            showSyncToast('⏳ Importando para Firebase...');

            const { collection: col, getDocs, deleteDoc, doc, addDoc } = window._fbModules;
            const db = window._fbDb;
            const COLL = window._fbColl;
            const snap = await getDocs(col(db, COLL));
            for (const d of snap.docs) {
                await deleteDoc(doc(db, COLL, d.id));
            }
            for (const p of dados) {
                const { _docId, ...data } = p;
                await addDoc(col(db, COLL), data);
            }

            alert(`✅ Backup restaurado com sucesso no Firebase!\n${total} procedimento(s) importado(s).`);
        } catch(err) {
            alert('❌ Erro ao ler o arquivo. Certifique-se de que é um JSON válido.\n' + err.message);
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}



// ─── ITEMS BUILDER ───
function addItemRow(code = '', name = '', qty = 1, lote = '') {
    const container = document.getElementById('itens-list');
    const row = document.createElement('div');
    row.className = 'item-row';
    row.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;';
    row.innerHTML = `
        <input class="item-code" type="text" placeholder="Cód. Fábrica" value="${code}" list="produtos-codigos-datalist" autocomplete="off" style="width:130px;flex-shrink:0;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:9px 10px;color:var(--accent2);font-family:var(--mono);font-size:0.78rem;font-weight:700;outline:none;transition:border-color 0.2s;" onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'" oninput="autoFillName(this)">
        <input class="item-name" type="text" placeholder="Descrição do produto" value="${name}" list="produtos-datalist" autocomplete="off" style="flex:1;min-width:160px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:9px 12px;color:var(--text);font-family:var(--sans);font-size:0.82rem;outline:none;transition:border-color 0.2s;" onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
        <input class="item-lote" type="text" placeholder="Lote" value="${lote}" autocomplete="off" style="width:150px;flex-shrink:0;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:9px 10px;color:var(--green);font-family:var(--mono);font-size:0.78rem;font-weight:600;outline:none;transition:border-color 0.2s;" onfocus="this.style.borderColor='var(--green)'" onblur="this.style.borderColor='var(--border)'" title="Lote(s) do produto">
        <input class="item-qty" type="number" min="1" max="999" value="${qty}" title="Quantidade" style="width:70px;flex-shrink:0;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:9px 8px;color:var(--accent);font-family:var(--mono);font-size:0.85rem;font-weight:700;outline:none;text-align:center;transition:border-color 0.2s;" onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
        <button type="button" class="item-remove" onclick="this.parentElement.remove()" title="Remover" style="background:transparent;border:1px solid var(--border);color:var(--text-dim);border-radius:6px;width:32px;height:32px;cursor:pointer;font-size:0.9rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.15s;" onmouseover="this.style.color='var(--red)';this.style.borderColor='var(--red)'" onmouseout="this.style.color='var(--text-dim)';this.style.borderColor='var(--border)'">✕</button>
    `;
    container.appendChild(row);
    row.querySelector('.item-code').focus();
}

// Map code -> name for auto-fill
const _prodMap = {};
window._prodMap = _prodMap; // exposto para o módulo OPME
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#produtos-codigos-datalist option').forEach(opt => {
        const code = opt.value;
        const name = opt.getAttribute('data-name');
        if (code && name) {
            _prodMap[code.toUpperCase()] = name;
        }
    });
    window._prodMap = _prodMap; // garantia após carga
});


function autoRetirada(dataCirurgia) {
    if (!dataCirurgia) return;
    const d = new Date(dataCirurgia + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    const retirada = d.toISOString().slice(0, 10);
    const campo = document.getElementById('f-retirada');
    if (campo) campo.value = retirada;
}

function toggleOutroHospital(valor) {
    const grp = document.getElementById('g-outro-hospital');
    const inp = document.getElementById('f-outro-hospital');
    if (valor === 'Outro...') {
        grp.style.display = 'block';
        inp.focus();
    } else {
        grp.style.display = 'none';
        inp.value = '';
    }
}

function toggleOutroMedico(valor) {
    const grupo = document.getElementById('g-outro-medico');
    const input = document.getElementById('f-outro-medico');
    if (valor === '__outro') {
        grupo.style.display = 'block';
        input.focus();
    } else {
        grupo.style.display = 'none';
        input.value = '';
    }
}
function autoFillName(codeInput) {
    const code = codeInput.value.trim().toUpperCase();
    const row = codeInput.parentElement;
    const nameInput = row.querySelector('.item-name');
    if (_prodMap[code]) {
        nameInput.value = _prodMap[code];
    }
}

function serializeItens() {
    const rows = document.querySelectorAll('#itens-list .item-row');
    if (rows.length === 0) return '';
    return Array.from(rows)
        .map(r => {
            const codeEl = r.querySelector('.item-code');
            const code = codeEl ? codeEl.value.trim() : '';
            const name = r.querySelector('.item-name').value.trim();
            const loteEl = r.querySelector('.item-lote');
            const lote = loteEl ? loteEl.value.trim() : '';
            const qty = parseInt(r.querySelector('.item-qty').value) || 1;
            if (!name && !code) return null;
            const prefix = code ? `[COD:${code}] ` : '';
            const loteSuffix = lote ? ` [LOTE:${lote}]` : '';
            return `${prefix}${name}${loteSuffix} [QTY:${qty}]`;
        })
        .filter(Boolean)
        .join('\n');
}

function loadItensBuilder(itensStr) {
    const container = document.getElementById('itens-list');
    container.innerHTML = '';
    if (!itensStr || !itensStr.trim()) return;
    const linhas = itensStr.split('\n').map(l => l.trim()).filter(l => l);
    linhas.forEach(l => {
        const qtyMatch  = l.match(/\[QTY:(\d+)\]$/);
        const codeMatch = l.match(/^\[COD:([^\]]+)\]\s*/);
        const loteMatch = l.match(/\[LOTE:([^\]]+)\]/);
        const qty  = qtyMatch  ? parseInt(qtyMatch[1])  : 1;
        const code = codeMatch ? codeMatch[1].trim()    : '';
        const lote = loteMatch ? loteMatch[1].trim()    : '';
        let nameStr = l;
        if (codeMatch) nameStr = nameStr.replace(/^\[COD:[^\]]+\]\s*/, '');
        if (loteMatch) nameStr = nameStr.replace(/\[LOTE:[^\]]+\]/, '');
        if (qtyMatch)  nameStr = nameStr.replace(/\[QTY:\d+\]$/, '').trim();
        if (nameStr || code) {
            addItemRow(code, nameStr.trim(), qty, lote);
        } else {
            const legacyMatch = l.match(/^(.+?)\s*[×x]\s*(\d+)$/i);
            if (legacyMatch) {
                addItemRow('', legacyMatch[1].trim(), parseInt(legacyMatch[2]), '');
            } else {
                addItemRow('', l, 1, '');
            }
        }
    });
}

// ─── LOGIN ───
// ─── FIREBASE AUTH ───
// doLogin, doLogout e onAuthStateChanged estão no módulo ES para acesso direto às funções Firebase

// ─── ANEXO PREVIEW ───
document.addEventListener('change', function(e) {
    if (e.target.id === 'f-anexo') {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            document.getElementById('f-anexo-data').value = ev.target.result;
            const preview = document.getElementById('f-anexo-preview');
            if (file.type.startsWith('image/')) {
                preview.innerHTML = `<img src="${ev.target.result}" style="max-width:100%;max-height:140px;border-radius:8px;border:1px solid var(--border);margin-top:4px;cursor:pointer;" onclick="window.abrirAnexo(document.getElementById('f-anexo-data').value)" title="Clique para ver em tamanho cheio">`;
            } else {
                preview.innerHTML = `<span style="font-size:0.86rem;color:var(--green);font-family:var(--mono);">📎 ${file.name} &nbsp;<button type="button" onclick="window.abrirAnexo(document.getElementById('f-anexo-data').value)" style="background:none;border:1px solid var(--green);color:var(--green);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:0.78rem;font-family:var(--mono);">Ver →</button></span>`;
            }
            document.getElementById('btn-remover-anexo').style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
    }
});

function removerAnexo() {
    if (!confirm('Remover a imagem/arquivo anexado?')) return;
    document.getElementById('f-anexo-data').value = '';
    document.getElementById('f-anexo-preview').innerHTML = '';
    document.getElementById('f-anexo').value = '';
    document.getElementById('btn-remover-anexo').style.display = 'none';
}

// ─── PROMOÇÃO AUTOMÁTICA: Em Procedimento → Aguardando Retirada ───
async function verificarPromocaoRetirada() {
    const hoje = todayStr();
    const { setDoc, doc } = window._fbModules;
    const db = window._fbDb;
    const COLL = window._fbColl;
    if (!db || !COLL || !setDoc) return;

    const pendentes = procedimentos.filter(p => {
        if (p.status !== 'andamento' && p.status !== 'coleta_urgente') return false;
        // campo de retirada pode estar em p.retirada (cirurgia normal) ou p.dataRetirar (retirar volumes urgentes)
        const dataRet = p.retirada || p.dataRetirar || '';
        return dataRet && dataRet <= hoje;
    });

    for (const proc of pendentes) {
        if (!proc._docId) continue;
        try {
            proc.status = 'a_retirar';
            await setDoc(doc(db, COLL, proc._docId), proc);
            console.log('Auto-promovido para Aguardando Retirada:', proc.paciente, proc.retirada);
        } catch(e) {
            console.warn('Erro ao promover:', proc._docId, e);
        }
    }

    if (pendentes.length > 0) {
        renderCards();
        updateStats();
        if (window.currentView === 'table') renderTable();
        showSyncToast('📦 ' + pendentes.length + ' cirurgia(s) → Aguardando Retirada');
    }
}


// ─── CONFIRMAÇÃO: Em Separação → Em Procedimento ───
async function confirmarInicioCircurgia(lista, db, COLL) {
    const pendentes = lista.filter(p => (p.status === 'preparacao' || p.status === 'em_transito') && p._docId);
    if (pendentes.length === 0) return;

    // Mostra um modal para cada procedimento
    for (const proc of pendentes) {
        await new Promise(resolve => {
            const antigo = document.getElementById('modalConfInicioCircurgia');
            if (antigo) antigo.remove();

            const nomePac = proc.paciente || '—';
            const hospital = proc.hospital || '—';
            const medico = proc.medico || '—';
            const dataFmt = proc.data ? new Date(proc.data+'T00:00:00').toLocaleDateString('pt-BR') : '—';

            const overlay = document.createElement('div');
            overlay.id = 'modalConfInicioCircurgia';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:16px;';
            overlay.innerHTML =
                '<div style="background:var(--surface);border:1px solid var(--border);border-top:4px solid #ef4444;border-radius:16px;padding:28px 26px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,0.4);">' +
                    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">' +
                        '<span style="font-family:var(--mono);font-size:0.82rem;font-weight:700;letter-spacing:0.08em;color:#ef4444;text-transform:uppercase;">⚡ Iniciar Procedimento?</span>' +
                        '<button id="btnFecharConfInicio" style="background:none;border:1px solid var(--border);color:var(--text-dim);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:0.9rem;">✕</button>' +
                    '</div>' +
                    '<div style="margin-bottom:20px;padding:14px;background:rgba(239,68,68,0.06);border-radius:10px;border:1px solid rgba(239,68,68,0.2);">' +
                        '<div style="font-family:var(--sans);font-weight:700;font-size:1rem;color:var(--text);margin-bottom:6px;">🏥 ' + nomePac + '</div>' +
                        '<div style="font-family:var(--mono);font-size:0.73rem;color:var(--text-dim);margin-bottom:2px;">' + hospital + ' · ' + medico + '</div>' +
                        '<div style="font-family:var(--mono);font-size:0.73rem;color:#ef4444;font-weight:600;">📅 Cirurgia hoje · ' + dataFmt + '</div>' +
                    '</div>' +
                    '<div style="font-family:var(--mono);font-size:0.78rem;color:var(--text-dim);margin-bottom:16px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">O procedimento foi iniciado?</div>' +
                    '<div style="display:flex;gap:10px;margin-bottom:16px;">' +
                        '<button id="btnInicioSim" style="flex:1;padding:13px;border-radius:10px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.9rem;font-weight:700;cursor:pointer;transition:all 0.18s;">✅ SIM</button>' +
                        '<button id="btnInicioNao" style="flex:1;padding:13px;border-radius:10px;border:2px solid var(--border);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.9rem;font-weight:700;cursor:pointer;transition:all 0.18s;">⏳ AINDA NÃO</button>' +
                    '</div>' +
                    '<button id="btnInicioFinal" style="width:100%;padding:13px;border-radius:10px;background:#ef4444;border:none;color:#fff;font-family:var(--mono);font-size:0.85rem;font-weight:700;cursor:pointer;opacity:0.4;pointer-events:none;transition:opacity 0.2s;">Confirmar</button>' +
                '</div>';
            document.body.appendChild(overlay);

            let escolha = null;
            const btnSim  = overlay.querySelector('#btnInicioSim');
            const btnNao  = overlay.querySelector('#btnInicioNao');
            const btnFinal = overlay.querySelector('#btnInicioFinal');

            function selecionar(val) {
                escolha = val;
                [btnSim, btnNao].forEach(b => { b.style.background='transparent'; b.style.color='var(--text-dim)'; b.style.borderColor='var(--border)'; });
                const btn = val === 'sim' ? btnSim : btnNao;
                btn.style.background = val === 'sim' ? '#ef4444' : '#d4920a';
                btn.style.color = '#fff';
                btn.style.borderColor = val === 'sim' ? '#ef4444' : '#d4920a';
                btnFinal.style.opacity = '1';
                btnFinal.style.pointerEvents = 'auto';
                btnFinal.style.background = val === 'sim' ? '#ef4444' : '#d4920a';
                btnFinal.textContent = val === 'sim' ? '⚡ Iniciar Procedimento' : '⏳ Manter Em Separação';
            }

            btnSim.onclick  = () => selecionar('sim');
            btnNao.onclick  = () => selecionar('nao');
            overlay.querySelector('#btnFecharConfInicio').onclick = () => { window._confirmacaoInicioFeita.add(proc._docId); overlay.remove(); resolve(); };

            btnFinal.onclick = async () => {
                if (!escolha) return;
                overlay.remove();
                window._confirmacaoInicioFeita.add(proc._docId);
                if (escolha === 'sim') {
                    proc.status = 'andamento';
                    try {
                        const { setDoc: sd, doc: docFn } = window._fbModules;
                        await sd(docFn(db, COLL, proc._docId), { ...proc });
                        showSyncToast('⚡ ' + nomePac + ' → Em Procedimento');
                        renderCards(); updateStats();
                        if (window.currentView === 'table') renderTable();
                    } catch(e) { alert('Erro ao salvar: ' + e.message); }
                } else {
                    showSyncToast('⏳ ' + nomePac + ' mantido em Em Separação');
                }
                resolve();
            };
        });
    }
}

// ─── AUTO REFRESH A CADA MINUTO ───
setInterval(() => {
    verificarPromocaoRetirada();
    renderCards();
    updateStats();
    updatePeriodResult();
    updateAlerts();
    atualizarBannerPendencias();
    if (window.currentView === 'table') renderTable();
}, 60000);

// Rodar imediatamente no carregamento também
setTimeout(verificarPromocaoRetirada, 3000);

// ─── BANNER DE ALERTAS PENDENTES NO MONITOR ───
function atualizarBannerPendencias() {
    const hoje = todayStr();
    const amanhaD = new Date(); amanhaD.setDate(amanhaD.getDate() + 1);
    const amanha = amanhaD.getFullYear() + '-' + String(amanhaD.getMonth()+1).padStart(2,'0') + '-' + String(amanhaD.getDate()).padStart(2,'0');

    // 1. Cirurgias aguardando retirada vencida
    const retiradas = procedimentos.filter(p =>
        !_ehColeta(p) && p.status === 'a_retirar' && p.retirada && p.retirada <= hoje
    );

    // 2. Volumes urgentes com retirada hoje ou amanhã (1 dia antes)
    const coletasAtivas = procedimentos.filter(p => {
        if (p.status !== 'coleta_urgente') return false;
        if (p.status === 'concluido' || p.status === 'cancelado') return false;
        const ret = p.retirada || p.dataRetirar || '';
        return ret && ret <= amanha;
    });

    // 3. Agendados para hoje ou amanhã
    const agendadosHojeAmanha = procedimentos.filter(p =>
        (p.status === 'agendado' || p.status === 'preparacao') && (p.data === hoje || p.data === amanha)
    );

    const total = retiradas.length + coletasAtivas.length + agendadosHojeAmanha.length;

    let banner = document.getElementById('banner-pendencias');
    if (total === 0) {
        if (banner) banner.remove();
        return;
    }

    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'banner-pendencias';
        banner.style.cssText = 'position:sticky;top:0;z-index:500;margin-bottom:14px;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.18);';
        const container = document.querySelector('.container');
        if (container) container.insertBefore(banner, container.firstChild);
    }

    const fmt = d => d ? new Date(d+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : '—';

    let itens = '';

    // ── Bloco 1: Aguardando Retirada ──
    if (retiradas.length > 0) {
        itens += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.15);">
            <span style="font-size:1.3rem;">📦</span>
            <div style="flex:1;">
                <div style="font-size:0.8rem;font-weight:800;letter-spacing:0.06em;">AGUARDANDO RETIRADA</div>
                <div style="font-size:0.72rem;opacity:0.85;margin-top:1px;">${retiradas.length} material(is) com retirada vencida</div>
            </div>
            <button onclick="exportarWhatsApp()" style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:#fff;padding:6px 12px;border-radius:8px;font-family:var(--mono);font-size:0.68rem;font-weight:700;cursor:pointer;white-space:nowrap;letter-spacing:0.05em;">💬 Cobrar</button>
        </div>`;
    }

    // ── Bloco 2: Retirar Volumes Urgentes ativas ──
    if (coletasAtivas.length > 0) {
        const lista = coletasAtivas.map(p => {
            const retData = p.retirada || p.dataRetirar || '';
            const retLabel = retData ? ` · Ret: ${fmt(retData)}` : ' · sem data';
            return `${p.hospital || p.coletaFornecedor || '—'}${retLabel}`;
        }).join(' | ');
        itens += `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.15);">
            <span style="font-size:1.3rem;margin-top:2px;">✈️</span>
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.8rem;font-weight:800;letter-spacing:0.06em;">VOLUMES URGENTES PENDENTES (${coletasAtivas.length})</div>
                <div style="font-size:0.68rem;opacity:0.85;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${lista}</div>
            </div>
            <button onclick="cobrarVolumesWhatsApp()" style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:#fff;padding:6px 12px;border-radius:8px;font-family:var(--mono);font-size:0.68rem;font-weight:700;cursor:pointer;white-space:nowrap;letter-spacing:0.05em;flex-shrink:0;">💬 Cobrar</button>
        </div>`;
    }

    // ── Bloco 3: Agendados hoje/amanhã ──
    if (agendadosHojeAmanha.length > 0) {
        const hojeArr = agendadosHojeAmanha.filter(p => p.data === hoje);
        const amanhaArr = agendadosHojeAmanha.filter(p => p.data === amanha);
        const subLabel = [
            hojeArr.length ? `${hojeArr.length} HOJE` : '',
            amanhaArr.length ? `${amanhaArr.length} AMANHÃ` : ''
        ].filter(Boolean).join(' · ');
        const lista = agendadosHojeAmanha.slice(0,4).map(p =>
            `${(p.hospital||'—').replace(/^Hospital /i,'').substring(0,18)} ${p.data === hoje ? '(HOJE)' : '(AMANHÃ)'}`
        ).join(' | ') + (agendadosHojeAmanha.length > 4 ? ` +${agendadosHojeAmanha.length - 4}` : '');
        itens += `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;">
            <span style="font-size:1.3rem;margin-top:2px;">📅</span>
            <div style="flex:1;min-width:0;">
                <div style="font-size:0.8rem;font-weight:800;letter-spacing:0.06em;">CIRURGIAS AGENDADAS — ${subLabel}</div>
                <div style="font-size:0.68rem;opacity:0.85;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${lista}</div>
            </div>
            <button onclick="cobrarAgendadosWhatsApp()" style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:#fff;padding:6px 12px;border-radius:8px;font-family:var(--mono);font-size:0.68rem;font-weight:700;cursor:pointer;white-space:nowrap;letter-spacing:0.05em;flex-shrink:0;">💬 Avisar</button>
        </div>`;
    }

    const gradiente = agendadosHojeAmanha.length && !retiradas.length && !coletasAtivas.length
        ? 'linear-gradient(135deg,#0ea5e9,#4db87a)'
        : coletasAtivas.length && !retiradas.length
        ? 'linear-gradient(135deg,#6366f1,#818cf8)'
        : 'linear-gradient(135deg,#dc2626,#f97316)';

    banner.innerHTML = `
        <div style="background:${gradiente};color:#fff;padding:12px 16px;font-family:var(--mono);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <span style="font-size:0.78rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;">⚠️ ${total} alerta(s) ativos</span>
                <button onclick="document.getElementById('banner-pendencias').remove()" style="background:none;border:none;color:rgba(255,255,255,0.7);font-size:1rem;cursor:pointer;padding:0 4px;">✕</button>
            </div>
            ${itens}
        </div>`;
}

function cobrarVolumesWhatsApp() {
    const hoje = todayStr();
    const fmt = d => d ? new Date(d+'T00:00:00').toLocaleDateString('pt-BR') : '—';
    const coletas = procedimentos.filter(p => {
        if (!_ehColeta(p)) return false;
        if (p.status === 'concluido' || p.status === 'cancelado') return false;
        const ret = p.retirada || p.dataRetirar || '';
        return ret && ret <= hoje;
    });
    if (coletas.length === 0) { alert('✅ Sem retirar volumes urgentes pendentes hoje!'); return; }

    let linhas = [];
    linhas.push('✈️ *GF Medical — Retirar Volumes Urgentes Pendentes* 🔴');
    linhas.push('📅 Gerado em: ' + new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}));
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━');

    coletas.forEach((p, i) => {
        const retData = p.retirada || p.dataRetirar || '';
        linhas.push('');
        linhas.push(`*${i+1}. ✈️ RETIRAR VOLUMES URGENTES*`);
        if (retData) linhas.push(`📦 *Data de Retirada: ${fmt(retData)}${p.horaRetirar?' às '+p.horaRetirar:''}*`);
        if (p.nfCompra) linhas.push(`🧾 NF de Compra: ${p.nfCompra}`);
        if (p.cte) linhas.push(`📋 N° CTE: ${p.cte}`);
        if (p.coletaFornecedor) linhas.push(`🏭 Fornecedor: ${p.coletaFornecedor}`);
        if (p.coletaTransportadora) linhas.push(`🚚 Transportadora: ${p.coletaTransportadora}`);
        if (p.coletaDataCirurgia) linhas.push(`📅 Data Cirurgia: ${fmt(p.coletaDataCirurgia)}${p.coletaHoraCirurgia?' às '+p.coletaHoraCirurgia:''}`);
        if (p.vendedor) linhas.push(`👤 Vendedor: ${p.vendedor}`);
        if (p.obs) linhas.push(`📝 Obs: ${p.obs}`);
    });

    linhas.push('');
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━');
    linhas.push('Total: *' + coletas.length + ' volume(s) urgente(s)*');

    _abrirWhatsApp(linhas.join('\n'));
}
function cobrarAgendadosWhatsApp() {
    const hoje = todayStr();
    const amanhaD = new Date(); amanhaD.setDate(amanhaD.getDate() + 1);
    const amanha = amanhaD.getFullYear() + '-' + String(amanhaD.getMonth()+1).padStart(2,'0') + '-' + String(amanhaD.getDate()).padStart(2,'0');
    const fmt = d => d ? new Date(d+'T00:00:00').toLocaleDateString('pt-BR') : '—';

    const lista = procedimentos.filter(p =>
        (p.status === 'agendado' || p.status === 'preparacao') && (p.data === hoje || p.data === amanha)
    ).sort((a,b) => (a.data||'').localeCompare(b.data||'') || (a.inicio||'').localeCompare(b.inicio||''));

    if (lista.length === 0) { alert('✅ Nenhuma cirurgia agendada para hoje ou amanhã!'); return; }

    let linhas = [];
    linhas.push('📅 *GF Medical — Cirurgias Agendadas* 🟢');
    linhas.push('📅 Gerado em: ' + new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}));
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━');

    const hojeArr = lista.filter(p => p.data === hoje);
    const amanhaArr = lista.filter(p => p.data === amanha);

    if (hojeArr.length) {
        linhas.push('');
        linhas.push(`🏥 *HOJE — ${fmt(hoje)} (${hojeArr.length} cirurgia(s))*`);
        hojeArr.forEach((p, i) => {
            linhas.push('');
            const nomePac = (p.paciente && p.paciente.trim()) ? p.paciente.trim() : `${(p.hospital||'').replace(/^Hospital /i,'').substring(0,25)} — ${(p.medico||'').split(' ').slice(0,2).join(' ')}`;
            linhas.push(`*${i+1}. ${nomePac}*`);
            if (p.inicio) linhas.push(`⏰ Horário: ${p.inicio}`);
            linhas.push(`🏥 Hospital: ${p.hospital||'—'}`);
            linhas.push(`👨‍⚕️ Cirurgião: ${p.medico||'—'}`);
            if (p.procedimento) linhas.push(`🔬 Procedimento: ${p.procedimento}`);
            if (p.convenio && p.convenio !== '—') linhas.push(`🏦 Convênio: ${p.convenio}`);
            if (p.vendedor) linhas.push(`👤 Vendedor: ${p.vendedor}`);
        });
    }

    if (amanhaArr.length) {
        linhas.push('');
        linhas.push(`🏥 *AMANHÃ — ${fmt(amanha)} (${amanhaArr.length} cirurgia(s))*`);
        amanhaArr.forEach((p, i) => {
            linhas.push('');
            const nomePac = (p.paciente && p.paciente.trim()) ? p.paciente.trim() : `${(p.hospital||'').replace(/^Hospital /i,'').substring(0,25)} — ${(p.medico||'').split(' ').slice(0,2).join(' ')}`;
            linhas.push(`*${i+1}. ${nomePac}*`);
            if (p.inicio) linhas.push(`⏰ Horário: ${p.inicio}`);
            linhas.push(`🏥 Hospital: ${p.hospital||'—'}`);
            linhas.push(`👨‍⚕️ Cirurgião: ${p.medico||'—'}`);
            if (p.procedimento) linhas.push(`🔬 Procedimento: ${p.procedimento}`);
            if (p.convenio && p.convenio !== '—') linhas.push(`🏦 Convênio: ${p.convenio}`);
            if (p.vendedor) linhas.push(`👤 Vendedor: ${p.vendedor}`);
        });
    }

    linhas.push('');
    linhas.push('━━━━━━━━━━━━━━━━━━━━━━');
    linhas.push(`Total: *${lista.length} cirurgia(s) agendada(s)*`);

    _abrirWhatsApp(linhas.join('\n'));
}


// ─── LEMBRETE DIÁRIO ───
function verificarLembreteRetirada() {
    const hoje = todayStr();
    const chave = 'gf_lembrete_retirada_' + hoje;
    if (sessionStorage.getItem(chave)) return;

    const vencidas = procedimentos.filter(p =>
        p.status === 'a_retirar' && p.retirada && p.retirada <= hoje
    );
    if (vencidas.length === 0) return;

    sessionStorage.setItem(chave, '1');
    atualizarBannerPendencias();
}
setTimeout(verificarLembreteRetirada, 5000);
setTimeout(atualizarBannerPendencias, 5500);

// ─── INIT ───
// Dados carregados pelo onSnapshot do Firebase acima
// Expõe variáveis e funções ao escopo global (window) para o módulo Firebase acessar
window.procedimentos = procedimentos;
window.renderCards = renderCards;

// Atualizar rodapé da tabela (via MutationObserver — seguro)
document.addEventListener('DOMContentLoaded', function() {
    const tbody = document.querySelector('#procTable tbody');
    if (!tbody) return;
    const observer = new MutationObserver(() => {
        const footer = document.getElementById('tblFooterTotal');
        if (footer) footer.textContent = 'Total exibido: ' + tbody.querySelectorAll('tr').length;
    });
    observer.observe(tbody, { childList: true });
});
window.updateStats = updateStats;
window.updatePeriodResult = updatePeriodResult;
window.updateAlerts = updateAlerts;

window.showSyncToast = showSyncToast;


// ════════════════════════════════════════════
// ATALHO STATUS RÁPIDO
// ════════════════════════════════════════════
const STATUS_FLOW_QUICK = { a_agendar:'agendado', agendado:'preparacao', preparacao:'em_transito', em_transito:'andamento', andamento:'concluido' };
const STATUS_LABEL_QUICK = { a_agendar:'Autorizado', agendado:'Agendado', em_transito:'Em Trânsito', preparacao:'Em Separação', andamento:'Em Procedimento', concluido:'Concluído', cancelado:'Cancelado', reagendado:'Reagendado', a_retirar:'A Retirar', urgencia:'🚨 Urgência' };

function buildQuickStatusHTML(proc, realIndex) {
    const btns = [];
    const nextStatus = STATUS_FLOW_QUICK[proc.status];
    if (nextStatus) btns.push(`<button class="quick-status-btn qs-next" onclick="quickSetStatus('${realIndex}','${nextStatus}',event)" title="Avançar para próximo status">→ ${STATUS_LABEL_QUICK[nextStatus]}</button>`);
    btns.push(`<button class="quick-status-btn" onclick="quickSetStatus('${realIndex}','urgencia',event)">🚨 Urgência</button>`);
    btns.push(`<button class="quick-status-btn" onclick="quickSetStatus('${realIndex}','reagendado',event)">↺ Reagendar</button>`);
    btns.push(`<button class="quick-status-btn qs-cancel" onclick="quickSetStatus('${realIndex}','cancelado',event)">✕ Cancelar</button>`);
    return `<div class="quick-status-wrap">${btns.join('')}</div>`;
}

async function quickSetStatus(docId, novoStatus, e) {
    e.stopPropagation();
    if (_modalCooldown) return;
    const proc = procedimentos.find(p => (p._docId || String(p.id)) === String(docId));
    if (!proc) return;
    const statusAnterior = proc.status;
    if (statusAnterior === novoStatus) return;
    if (novoStatus === 'reagendado') {
        const dataAnterior = proc.data || '';
        mostrarAlertaReagendado(proc, async (novaData, motivo) => {
            const userEmail = (window._fbAuth && window._fbAuth.currentUser) ? window._fbAuth.currentUser.email : 'sistema';
            const hist = proc._statusHistory || [];
            hist.push({ de: statusAnterior, para: 'reagendado', em: new Date().toISOString(), por: userEmail, dataAnterior, dataNova: novaData, motivo: motivo || '' });
            proc._statusHistory = hist;
            proc.status = novoStatus;
            proc.data = novaData;
            if (motivo) proc.motivoReagendamento = motivo;
            try { await fbSaveProc(proc); }
            catch(err) { proc.status = statusAnterior; proc.data = dataAnterior; alert('Erro ao salvar: ' + err.message); }
        });
        return;
    }
    mostrarChecklist(proc, novoStatus, async () => {
        pedirObsStatus(statusAnterior, novoStatus, async (obs) => {
            const userEmail = (window._fbAuth && window._fbAuth.currentUser) ? window._fbAuth.currentUser.email : 'sistema';
            const hist = proc._statusHistory || [];
            hist.push({ de: statusAnterior, para: novoStatus, em: new Date().toISOString(), por: userEmail, obs: obs || '' });
            proc._statusHistory = hist;
            proc.status = novoStatus;
            try { await fbSaveProc(proc); }
            catch(err) { proc.status = statusAnterior; proc._statusHistory = hist.slice(0,-1); alert('Erro ao salvar: ' + err.message); }
        });
    });
}

function pedirObsStatus(de, para, callback) {
    const labels = { a_agendar:'Autorizado', agendado:'Agendado', preparacao:'Em Separação', em_transito:'Em Trânsito', andamento:'Em Procedimento', a_retirar:'Aguardando Retirada', concluido:'Concluído', cancelado:'Cancelado', reagendado:'Reagendado', urgencia:'Urgência' };
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);';
    ov.innerHTML = `<div style="background:var(--surface,#fff);border:1px solid var(--border,#e5e7eb);border-radius:16px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:'Inter',sans-serif;">
        <div style="font-family:var(--mono);font-size:0.75rem;font-weight:700;letter-spacing:0.08em;color:var(--text-dim);text-transform:uppercase;margin-bottom:12px;">📝 Observação (opcional)</div>
        <div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:14px;">${labels[de]||de} → <strong style="color:var(--text)">${labels[para]||para}</strong></div>
        <textarea id="obsStatusInput" placeholder="Adicione uma observação sobre esta mudança..." rows="3" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--border,#e5e7eb);background:var(--surface,#fff);color:var(--text);font-family:var(--mono);font-size:0.82rem;resize:vertical;outline:none;"></textarea>
        <div style="display:flex;gap:10px;margin-top:14px;">
            <button id="obsSkipBtn" style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--border,#e5e7eb);background:transparent;color:var(--text-dim);font-family:var(--mono);font-size:0.78rem;font-weight:700;cursor:pointer;">Pular</button>
            <button id="obsOkBtn" style="flex:1;padding:10px;border-radius:10px;border:none;background:var(--green,#059669);color:#fff;font-family:var(--mono);font-size:0.78rem;font-weight:700;cursor:pointer;">Confirmar</button>
        </div>
    </div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector('#obsStatusInput');
    setTimeout(() => inp && inp.focus(), 100);
    const finish = (obs) => { ov.remove(); callback(obs); };
    ov.querySelector('#obsOkBtn').onclick = () => finish(inp.value.trim());
    ov.querySelector('#obsSkipBtn').onclick = () => finish('');
    ov.onclick = e => { if (e.target === ov) finish(''); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) finish(inp.value.trim()); });
}

// ════════════════════════════════════════════
// DIAS BADGE
// ════════════════════════════════════════════
function diasBadge(dataStr) {
    if (!dataStr) return '';
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const d = new Date(dataStr + 'T00:00:00'); d.setHours(0,0,0,0);
    const diff = Math.round((d - hoje) / 86400000);
    if (diff === 0) return '<span class="dias-badge hoje">HOJE</span>';
    if (diff === 1) return '<span class="dias-badge amanha">AMANHÃ</span>';
    if (diff > 1)   return `<span class="dias-badge futuro">em ${diff}d</span>`;
    return `<span class="dias-badge passado">${Math.abs(diff)}d atrás</span>`;
}

// ════════════════════════════════════════════
// STALE BADGE
// ════════════════════════════════════════════
function staleBadge(proc) {
    if (proc.status === 'concluido' || proc.status === 'cancelado') return '';
    const ts = proc._updatedAt || proc._createdAt;
    if (!ts) return '';
    const dias = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
    if (dias < 3) return '';
    let cls = 'stale-badge';
    if (dias >= 7) cls += ' stale-crit';
    else if (dias >= 5) cls += ' stale-warn';
    return `<span class="${cls}" title="Sem atualização há ${dias} dias">⏳ ${dias}d</span>`;
}

// ════════════════════════════════════════════
// OBS INLINE
// ════════════════════════════════════════════
function buildObsInlineHTML(proc, realIndex) {
    const txt = proc.obs || '';
    return `<div class="obs-inline-wrap" id="obs-wrap-${realIndex}">
        <div class="obs-inline-display${txt ? '' : ' vazio'}" onclick="abrirObsInline('${realIndex}')" id="obs-display-${realIndex}" title="Clique para editar observação">
            ${txt ? txt.replace(/</g,'&lt;').replace(/>/g,'&gt;') : '📝 Adicionar observação...'}
        </div>
        <textarea class="obs-inline-textarea" id="obs-ta-${realIndex}" onkeydown="obsKeyDown(event,'${realIndex}')" placeholder="Escreva aqui...">${txt}</textarea>
        <div class="obs-inline-actions" id="obs-actions-${realIndex}" style="display:none;">
            <button class="obs-save" onclick="salvarObsInline('${realIndex}')">✓ Salvar</button>
            <button onclick="fecharObsInline('${realIndex}')">Cancelar</button>
        </div>
    </div>`;
}
function abrirObsInline(idx) {
    document.getElementById('obs-display-'+idx).style.display='none';
    const ta=document.getElementById('obs-ta-'+idx), ac=document.getElementById('obs-actions-'+idx);
    ta.style.display='block'; ac.style.display='flex'; ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length);
}
function fecharObsInline(idx) {
    const proc=procedimentos.find(p=>(p._docId||String(p.id))===String(idx));
    document.getElementById('obs-display-'+idx).style.display='block';
    document.getElementById('obs-ta-'+idx).style.display='none';
    document.getElementById('obs-actions-'+idx).style.display='none';
    if(proc) document.getElementById('obs-ta-'+idx).value=proc.obs||'';
}
function obsKeyDown(e,idx){ if(e.key==='Escape') fecharObsInline(idx); if(e.key==='Enter'&&e.ctrlKey) salvarObsInline(idx); }
async function salvarObsInline(idx) {
    const proc=procedimentos.find(p=>(p._docId||String(p.id))===String(idx));
    if(!proc) return;
    proc.obs=document.getElementById('obs-ta-'+idx).value;
    proc._updatedAt=new Date().toISOString();
    try {
        await fbSaveProc(proc);
        const disp=document.getElementById('obs-display-'+idx);
        if(disp){ disp.innerHTML=proc.obs?proc.obs.replace(/</g,'&lt;').replace(/>/g,'&gt;'):'📝 Adicionar observação...'; disp.classList.toggle('vazio',!proc.obs); }
        fecharObsInline(idx);
    } catch(err){ alert('Erro ao salvar: '+err.message); }
}

// ════════════════════════════════════════════
// AGRUPAMENTO
// ════════════════════════════════════════════
function setGroupBy(val) { currentGroup=val; renderCards(); }

// ════════════════════════════════════════════
// DETECÇÃO DE DUPLICATAS
// ════════════════════════════════════════════
function verificarDuplicatas(hospital, medico, data, excludeDocId) {
    if (!hospital || !data) return [];
    return procedimentos.filter(p => {
        if (p._docId===excludeDocId) return false;
        if (['concluido','cancelado'].includes(p.status)) return false;
        const mMatch=!medico||!p.medico||p.medico.toLowerCase()===medico.toLowerCase();
        return p.hospital&&p.hospital.toLowerCase()===hospital.toLowerCase()&&p.data===data&&mMatch;
    });
}
function mostrarAviso(dups) {
    const el=document.getElementById('dup-warning-box'); if(!el) return;
    if(dups.length===0){ el.style.display='none'; return; }
    const sMap={a_agendar:'Autorizado',agendado:'Agendado',em_transito:'Em Trânsito',preparacao:'Em Separação',andamento:'Em Procedimento',concluido:'Concluído',cancelado:'Cancelado',reagendado:'Reagendado',a_retirar:'A Retirar',urgencia:'Urgência',coleta_urgente:'Coleta Prioritária'};
    el.style.display='block';
    el.innerHTML=`<div class="dup-warning-title">⚠️ Possível duplicata (${dups.length})</div>`+dups.map(p=>`<div class="dup-warning-item">${p.hospital} · ${p.medico||'—'} · ${p.data?new Date(p.data+'T00:00:00').toLocaleDateString('pt-BR'):''} · ${sMap[p.status]||p.status}</div>`).join('');
}
function hookDupCheck() {
    ['f-hospital','f-data','f-medico'].forEach(id=>{
        const el=document.getElementById(id);
        if(el) el.addEventListener('change',()=>{
            mostrarAviso(verificarDuplicatas(document.getElementById('f-hospital')?.value, document.getElementById('f-medico')?.value, document.getElementById('f-data')?.value, editingDocId));
        });
    });
}

// ════════════════════════════════════════════
// CHECKLIST
// ════════════════════════════════════════════
const CHECKLIST_RULES = {
    concluido:  [{label:'NF de venda preenchida',check:p=>!!p.nf},{label:'Data da NF preenchida',check:p=>!!p.nfData},{label:'Vendedor definido',check:p=>!!p.vendedor}],
    andamento:  [{label:'Data de cirurgia definida',check:p=>!!p.data},{label:'Médico definido',check:p=>!!p.medico}],
    preparacao: [{label:'Vendedor definido',check:p=>!!p.vendedor},{label:'Linha preenchida',check:p=>!!p.linha}],
    em_transito:[{label:'Número da NF preenchido',check:p=>!!(p.nf&&p.nf.trim())}],
};
function mostrarChecklist(proc, novoStatus, onConfirm) {
    const regras=CHECKLIST_RULES[novoStatus];
    if(!regras||regras.length===0){ onConfirm(); return; }
    const itens=regras.map(r=>({...r,ok:r.check(proc)}));
    const todasOk=itens.every(i=>i.ok);
    const sNames={concluido:'Concluído',andamento:'Em Procedimento',preparacao:'Em Separação'};
    const overlay=document.createElement('div');
    overlay.className='checklist-modal-overlay'; overlay.id='checklistOverlay';
    overlay.innerHTML=`<div class="checklist-box">
        <h3>✅ Checklist — ${sNames[novoStatus]||novoStatus}</h3>
        <p>Verifique os requisitos antes de avançar.</p>
        ${itens.map(i=>`<div class="checklist-item ${i.ok?'ok':'fail'}"><span class="checklist-icon">${i.ok?'✅':'❌'}</span><span class="checklist-text">${i.label}</span></div>`).join('')}
        <div class="checklist-actions">
            <button class="checklist-btn-cancel" onclick="fecharChecklist()">Cancelar</button>
            <button class="checklist-btn-ok" id="checklistOkBtn" ${todasOk?'':'disabled'} onclick="fecharChecklist(true)">${todasOk?'→ Confirmar':'⚠ Pendências'}</button>
        </div>
    </div>`;
    overlay._onConfirm=onConfirm;
    document.body.appendChild(overlay);
}
function fecharChecklist(confirmar) {
    const el=document.getElementById('checklistOverlay'); if(!el) return;
    if(confirmar&&el._onConfirm) el._onConfirm();
    el.remove();
}

// ════════════════════════════════════════════
// ALERTA REAGENDADO — NOVA DATA DE CIRURGIA
// ════════════════════════════════════════════
function mostrarAlertaReagendado(proc, onConfirm) {
    const dataAtual = proc.data || '';
    const hoje = new Date().toISOString().split('T')[0];
    const overlay = document.createElement('div');
    overlay.className = 'reagendado-alert-overlay';
    overlay.id = 'reagendadoAlertOverlay';
    overlay.innerHTML = `
        <div class="reagendado-alert-box">
            <h3>📅 Reagendar Cirurgia</h3>
            <p>${proc.paciente ? `<strong>${proc.paciente}</strong> — ` : ''}Informe a nova data e o motivo do reagendamento.</p>
            <span class="alerta-data-label">Nova data de cirurgia</span>
            <input type="date" id="reagendadoNovaData" value="${dataAtual}" min="${hoje}">
            <span class="alerta-data-label">Motivo do reagendamento <span style="font-weight:400;opacity:0.6;">(opcional)</span></span>
            <textarea id="reagendadoMotivo" placeholder="Ex: Solicitação do médico, conflito de agenda, problema de material..."></textarea>
            <div class="reagendado-alert-actions">
                <button class="reagendado-btn-cancelar" onclick="fecharAlertaReagendado()">Cancelar</button>
                <button class="reagendado-btn-confirmar" onclick="confirmarAlertaReagendado()">↺ Confirmar Reagendamento</button>
            </div>
        </div>`;
    overlay._onConfirm = onConfirm;
    document.body.appendChild(overlay);
    setTimeout(() => { const inp = document.getElementById('reagendadoNovaData'); if (inp) inp.focus(); }, 50);
}
function fecharAlertaReagendado() {
    const el = document.getElementById('reagendadoAlertOverlay'); if (el) el.remove();
}
function confirmarAlertaReagendado() {
    const el = document.getElementById('reagendadoAlertOverlay'); if (!el) return;
    const inp = document.getElementById('reagendadoNovaData');
    const novaData = inp ? inp.value : '';
    if (!novaData) {
        inp.style.borderColor = '#ef4444';
        inp.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.25)';
        inp.focus(); return;
    }
    const motivo = (document.getElementById('reagendadoMotivo') || {}).value || '';
    const cb = el._onConfirm; el.remove();
    if (cb) cb(novaData, motivo);
}

// ════════════════════════════════════════════
// DUPLICAR PROCEDIMENTO
// ════════════════════════════════════════════
function duplicarProc(docId) {
    const proc=procedimentos.find(p=>(p._docId||String(p.id))===String(docId));
    if(!proc) return;
    const ehColeta=_ehColeta(proc);
    openModal();
    setTimeout(()=>{
        if(ehColeta){
            // ── RETIRAR VOLUMES URGENTES: preenche tudo ──
            const sel=document.getElementById('f-status');
            if(sel){ sel.value='coleta_urgente'; sel.dispatchEvent(new Event('change')); }
            setTimeout(()=>{
                const campos={
                    'f-coleta-fornecedor':      proc.coletaFornecedor||'',
                    'f-coleta-transportadora':  proc.coletaTransportadora||'',
                    'f-coleta-data-cirurgia':   proc.coletaDataCirurgia||'',
                    'f-coleta-hora-cirurgia':   proc.coletaHoraCirurgia||'',
                    'f-data-retirar':           proc.dataRetirar||'',
                    'f-hora-retirar':           proc.horaRetirar||'',
                    'f-nf-compra':              proc.nfCompra||'',
                    'f-cte':                    proc.cte||'',
                    'f-vendedor':               proc.vendedor||'',
                    'f-cidade':                 proc.cidade||'',
                    'f-obs':                    proc.obs||'',
                    'f-coleta-obs':             proc.coletaObs||'',
                    'f-coleta-anexo':           proc.coletaAnexo||'',
                };
                for(const [id,val] of Object.entries(campos)){
                    const el=document.getElementById(id); if(el) el.value=val;
                }
                // hospital
                const hInp=document.getElementById('f-hospital');
                if(hInp){
                    const opts=Array.from(document.querySelectorAll('#hospital-list option')).map(o=>o.value);
                    const hosp=proc.hospital||'';
                    if(opts.includes(hosp)){ hInp.value=hosp; }
                    else { hInp.value='Outro...'; const oh=document.getElementById('g-outro-hospital'); if(oh) oh.style.display='block'; const of2=document.getElementById('f-outro-hospital'); if(of2) of2.value=hosp; }
                }
                document.getElementById('modalTitle').textContent='📋 Duplicar Volumes Urgentes';
            },80);
        } else {
            // ── CIRURGIA: preenche tudo ──
            // hospital
            const hInp=document.getElementById('f-hospital');
            if(hInp){
                const opts=Array.from(document.querySelectorAll('#hospital-list option')).map(o=>o.value);
                const hosp=proc.hospital||'';
                if(opts.includes(hosp)){ hInp.value=hosp; document.getElementById('g-outro-hospital').style.display='none'; }
                else { hInp.value='Outro...'; const oh=document.getElementById('g-outro-hospital'); if(oh) oh.style.display='block'; const of2=document.getElementById('f-outro-hospital'); if(of2) of2.value=hosp; }
            }
            // medico
            const selMed=document.getElementById('f-medico');
            if(selMed){
                const naLista=Array.from(selMed.options).some(o=>o.value===proc.medico);
                if(naLista){ selMed.value=proc.medico||''; document.getElementById('g-outro-medico').style.display='none'; }
                else { selMed.value='__outro'; const gm=document.getElementById('g-outro-medico'); if(gm) gm.style.display='block'; const om=document.getElementById('f-outro-medico'); if(om) om.value=proc.medico||''; }
            }
            // convenio
            const selConv=document.getElementById('f-convenio');
            if(selConv){
                const convOpts=Array.from(selConv.options).map(o=>o.value);
                if(convOpts.includes(proc.convenio)){ selConv.value=proc.convenio||''; document.getElementById('g-outro-conv').style.display='none'; }
                else { selConv.value='__outro'; const gc=document.getElementById('g-outro-conv'); if(gc) gc.style.display='block'; const oc=document.getElementById('f-outro-convenio'); if(oc) oc.value=proc.convenio||''; }
            }
            // demais campos
            const campos={
                'f-paciente':    proc.paciente||'',
                'f-procedimento':proc.procedimento||'',
                'f-vendedor':    proc.vendedor||'',
                'f-linha':       proc.linha||'',
                'f-status':      proc.status||'a_agendar',
                'f-data':        proc.data||'',
                'f-inicio':      proc.inicio||'',
                'f-nf':          proc.nf||'',
                'f-nf-data':     proc.nfData||'',
                'f-retirada':    proc.retirada||'',
                'f-equipe':      proc.equipe||'',
                'f-cidade':      proc.cidade||'',
                'f-obs':         proc.obs||'',
            };
            for(const [id,val] of Object.entries(campos)){
                const el=document.getElementById(id); if(el) el.value=val;
            }
            // itens
            if(proc.itens) loadItensBuilder(proc.itens);
            document.getElementById('modalTitle').textContent='📋 Duplicar Procedimento';
        }
    },80);
}

// ════════════════════════════════════════════
// WHATSAPP
// ════════════════════════════════════════════
function compartilharWhatsApp(docId) {
    const proc=procedimentos.find(p=>(p._docId||String(p.id))===String(docId));
    if(!proc) return;
    const sMap={a_agendar:'✅ Autorizado',agendado:'📅 Agendado',em_transito:'🚚 Em Trânsito',preparacao:'🔧 Em Separação',andamento:'⚡ Em Procedimento',concluido:'✔️ Concluído',cancelado:'❌ Cancelado',reagendado:'🔄 Reagendado',a_retirar:'📦 Aguard. Retirada',urgencia:'🚨 URGÊNCIA',coleta_urgente:'✈️ Coleta Prioritária'};
    const fmt=d=>d?new Date(d+'T00:00:00').toLocaleDateString('pt-BR'):'—';
    let linhas=[];
    if(proc.status==='coleta_urgente'){
        const retFmtColeta = proc.retirada ? fmt(proc.retirada) : (proc.dataRetirar ? fmt(proc.dataRetirar) : '');
        const retHoraColeta = proc.horaRetirar || '';
        linhas=[
            `*✈️ COLETA PRIORITÁRIA — GF Medical*`,
            `━━━━━━━━━━━━━━━━━━━━━━`,
            proc.retirada||proc.dataRetirar ? `📦 *Data de Retirada: ${retFmtColeta}${retHoraColeta?' às '+retHoraColeta:''}*` : '',
            ``,
            proc.nfCompra?`🧾 *NF de Compra:* ${proc.nfCompra}`:'',
            proc.cte?`📋 *N° CTE:* ${proc.cte}`:'',
            proc.coletaFornecedor?`🏭 *Fornecedor:* ${proc.coletaFornecedor}`:'',
            proc.coletaTransportadora?`🚚 *Transportadora:* ${proc.coletaTransportadora}`:'',
            ``,
            proc.coletaDataCirurgia?`📅 *Data da Cirurgia:* ${fmt(proc.coletaDataCirurgia)}${proc.coletaHoraCirurgia?' às '+proc.coletaHoraCirurgia:''}`:'',
            proc.vendedor?`👤 *Vendedor:* ${proc.vendedor}`:'',
            proc.obs?`📝 Obs: ${proc.obs}`:'',
            `━━━━━━━━━━━━━━━━━━━━━━`,
        ];
    } else {
        linhas=[
            `*🏥 ${proc.hospital||'—'}*`,
            proc.paciente?`👤 Paciente: ${proc.paciente}`:'',
            proc.medico?`👨‍⚕️ Médico: ${proc.medico}`:'',
            proc.procedimento?`🔬 Procedimento: ${proc.procedimento}`:'',
            proc.convenio?`🏦 Convênio: ${proc.convenio}`:'',
            proc.data?`📅 Data: ${fmt(proc.data)}${proc.inicio?' às '+proc.inicio:''}`:'',
            `📌 Status: ${sMap[proc.status]||proc.status}`,
            proc.vendedor?`👤 Vendedor: ${proc.vendedor}`:'',
            proc.nf?`🧾 NF: ${proc.nf}${proc.nfData?' · '+fmt(proc.nfData):''}`:'',
            proc.retirada?`📦 Retirada: ${fmt(proc.retirada)}`:'',
            proc.obs?`📝 Obs: ${proc.obs}`:'',
        ];
    }
    _abrirWhatsApp(linhas.filter(Boolean).join('\n'));
}

// ════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════
function renderDashboard() {
    const container=document.getElementById('dashboardContent'); if(!container) return;
    const list=getFiltered();
    const total=list.length;
    const ativos=list.filter(p=>!['concluido','cancelado'].includes(p.status)).length;
    const hojeCirg=list.filter(p=>p.data===todayStr()).length;
    const urgentes=list.filter(p=>p.status==='urgencia').length;
    const taxa=total>0?Math.round(list.filter(p=>p.status==='concluido').length/total*100):0;
    const sColors={a_agendar:'#06b6d4',agendado:'#4db87a',em_transito:'#6366f1',preparacao:'#d4920a',andamento:'#d94f4f',concluido:'#64748b',cancelado:'#f87171',reagendado:'#a78bfa',a_retirar:'#f97316',urgencia:'#ff0000',coleta_urgente:'#818cf8'};
    const sNames={a_agendar:'Autorizado',agendado:'Agendado',em_transito:'Em Trânsito',preparacao:'Em Separação',andamento:'Em Procedimento',concluido:'Concluído',cancelado:'Cancelado',reagendado:'Reagendado',a_retirar:'A Retirar',urgencia:'Urgência',coleta_urgente:'Coleta Prioritária'};
    const sCount={};
    list.forEach(p=>{ sCount[p.status]=(sCount[p.status]||0)+1; });
    const sEntries=Object.entries(sCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const vendCount={};
    list.filter(p=>p.vendedor).forEach(p=>{ vendCount[p.vendedor]=(vendCount[p.vendedor]||0)+1; });
    const vendEntries=Object.entries(vendCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const maxVend=vendEntries.length>0?vendEntries[0][1]:1;
    const hospCount={};
    list.filter(p=>p.hospital).forEach(p=>{ const h=p.hospital.replace('Hospital ','').substring(0,20); hospCount[h]=(hospCount[h]||0)+1; });
    const hospEntries=Object.entries(hospCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const maxHosp=hospEntries.length>0?hospEntries[0][1]:1;

    function buildDonut(entries,total,size=120,stroke=22){
        const r=(size-stroke)/2,cx=size/2,cy=size/2,circ=2*Math.PI*r;
        let offset=0,slices='';
        entries.forEach(([key,val])=>{
            const pct=val/total,dash=pct*circ,color=sColors[key]||'#94a3b8';
            slices+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${dash} ${circ-dash}" stroke-dashoffset="${circ*0.25-offset*circ/total}"/>`;
            offset+=pct*total;
        });
        return `<svg width="${size}" height="${size}" class="donut-svg" style="transform:rotate(-90deg)"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="${stroke}"/>${slices}</svg>`;
    }

    // ── Curva ABC ──
    const vendorMap={};
    list.forEach(p=>{
        if(!p.vendedor) return;
        if(!vendorMap[p.vendedor]) vendorMap[p.vendedor]={total:0,statuses:{}};
        vendorMap[p.vendedor].total++;
        vendorMap[p.vendedor].statuses[p.status]=(vendorMap[p.vendedor].statuses[p.status]||0)+1;
    });
    const vendors=Object.entries(vendorMap).sort((a,b)=>b[1].total-a[1].total).map(([name,data])=>({name,...data}));
    const grandTotal=vendors.reduce((s,v)=>s+v.total,0);
    let cumulative=0;
    vendors.forEach(v=>{
        const pct=grandTotal>0?v.total/grandTotal*100:0;
        cumulative+=pct; v.pct=pct; v.cumulative=cumulative;
        v.zone=cumulative<=80?'A':cumulative<=95?'B':'C';
    });
    const abcRows=vendors.map((v,i)=>{
        const barWidth=vendors[0].total>0?(v.total/vendors[0].total*100).toFixed(1):0;
        const cor=v.zone==='A'?'#10b981':v.zone==='B'?'#f59e0b':'#9ca3af';
        const fillCls=v.zone==='A'?'fill-A':v.zone==='B'?'fill-B':'fill-C';
        const pills=Object.entries(v.statuses).sort((a,b)=>b[1]-a[1]).map(([s,n])=>
            `<span class="abc-mini-pill" style="background:${sColors[s]||'#94a3b8'}22;color:${sColors[s]||'#94a3b8'};border:1px solid ${sColors[s]||'#94a3b8'}44;">${(sNames[s]||s).replace('Em ','').replace(' Urgentes','').substring(0,8)} ×${n}</span>`
        ).join('');
        return `<div class="abc-row">
            <span class="abc-rank" style="color:${cor}">#${i+1}</span>
            <span class="abc-badge badge-${v.zone}">${v.zone}</span>
            <div style="flex:2;min-width:0;">
                <div class="abc-name">${v.name}</div>
                <div class="abc-status-pills">${pills}</div>
            </div>
            <div class="abc-bar-wrap">
                <div class="abc-bar-track"><div class="abc-bar-fill ${fillCls}" style="width:${barWidth}%"></div></div>
                <span class="abc-count">${v.total}</span>
                <span class="abc-pct">${v.pct.toFixed(1)}%</span>
                <span class="abc-acum">∑${v.cumulative.toFixed(1)}%</span>
            </div>
        </div>`;
    }).join('');

    const zoneA=vendors.filter(v=>v.zone==='A');
    const zoneB=vendors.filter(v=>v.zone==='B');
    const zoneC=vendors.filter(v=>v.zone==='C');

    container.innerHTML=`
        <div class="dash-kpi-row">
            <div class="dash-kpi"><div class="dash-kpi-val">${total}</div><div class="dash-kpi-label">Total</div></div>
            <div class="dash-kpi"><div class="dash-kpi-val" style="color:var(--accent)">${ativos}</div><div class="dash-kpi-label">Ativos</div></div>
            <div class="dash-kpi"><div class="dash-kpi-val" style="color:var(--green)">${hojeCirg}</div><div class="dash-kpi-label">Hoje</div></div>
            <div class="dash-kpi"><div class="dash-kpi-val" style="color:var(--red)">${urgentes}</div><div class="dash-kpi-label">Urgências</div></div>
            <div class="dash-kpi"><div class="dash-kpi-val" style="color:var(--yellow)">${taxa}%</div><div class="dash-kpi-label">Conclusão</div></div>
        </div>
        <div class="dash-grid">
            <div class="dash-card"><h3>📊 Por Status</h3>
                <div class="donut-wrap">${buildDonut(sEntries,total)}
                    <div class="donut-legend">${sEntries.map(([k,v])=>`<div class="donut-legend-item"><span class="donut-legend-dot" style="background:${sColors[k]||'#94a3b8'}"></span><span>${sNames[k]||k}</span><span class="donut-legend-count">${v}</span></div>`).join('')}</div>
                </div>
            </div>
            <div class="dash-card"><h3>👤 Por Vendedor</h3>
                <div class="bar-chart">${vendEntries.map(([n,v])=>`<div class="bar-row"><span class="bar-label" title="${n}">${n.split(' ')[0]}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/maxVend*100)}%"></div></div><span class="bar-val">${v}</span></div>`).join('')||'<div style="color:var(--text-dim);font-size:0.8rem">Sem dados</div>'}</div>
            </div>
            <div class="dash-card"><h3>🏥 Por Hospital</h3>
                <div class="bar-chart">${hospEntries.map(([n,v])=>`<div class="bar-row"><span class="bar-label" title="${n}">${n}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(v/maxHosp*100)}%;background:linear-gradient(90deg,var(--green),#6ee7b7)"></div></div><span class="bar-val">${v}</span></div>`).join('')||'<div style="color:var(--text-dim);font-size:0.8rem">Sem dados</div>'}</div>
            </div>
        </div>
        <div style="margin-top:8px;">
            <div class="abc-summary">
                <div class="abc-sum-box zona-A"><div class="abc-sum-label">Zona A — Alta Performance</div><div class="abc-sum-val">${zoneA.length}</div><div class="abc-sum-sub">${zoneA.reduce((s,v)=>s+v.total,0)} procedimentos</div></div>
                <div class="abc-sum-box zona-B"><div class="abc-sum-label">Zona B — Média</div><div class="abc-sum-val">${zoneB.length}</div><div class="abc-sum-sub">${zoneB.reduce((s,v)=>s+v.total,0)} procedimentos</div></div>
                <div class="abc-sum-box zona-C"><div class="abc-sum-label">Zona C — Baixa</div><div class="abc-sum-val">${zoneC.length}</div><div class="abc-sum-sub">${zoneC.reduce((s,v)=>s+v.total,0)} procedimentos</div></div>
            </div>
            <div class="abc-card" style="background:rgba(240,250,244,0.92);border:1px solid rgba(135,195,150,0.28);border-radius:18px;padding:20px 24px;">
                <div class="abc-section-title"><span>◈</span> Curva ABC — Ranking de Vendedores</div>
                ${vendors.length>0?abcRows:'<div style="color:var(--text-dim);font-size:0.82rem;padding:12px 0;">Sem dados de vendedor</div>'}
            </div>
        </div>`;
}

// ════════════════════════════════════════════
// CALENDÁRIO
// ════════════════════════════════════════════
let calYear=new Date().getFullYear(), calMonth=new Date().getMonth();
const MESES_PT=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_PT=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function renderCalendar() {
    const container=document.getElementById('calendarContent'); if(!container) return;
    const today=todayStr();
    const firstDay=new Date(calYear,calMonth,1), lastDay=new Date(calYear,calMonth+1,0);
    const startDow=firstDay.getDay();
    const list=getFiltered();
    const eventMap={};
    list.forEach(p=>{ if(!p.data) return; if(!eventMap[p.data]) eventMap[p.data]=[]; eventMap[p.data].push(p); });
    let html=`<div style="width:100%;box-sizing:border-box;overflow:hidden;">
    <div class="cal-header">
        <button class="cal-nav-btn" onclick="calNav(-1)">◀ ${MESES_PT[(calMonth+11)%12]}</button>
        <h2>${MESES_PT[calMonth]} ${calYear}</h2>
        <button class="cal-nav-btn" onclick="calNav(1)">${MESES_PT[(calMonth+1)%12]} ▶</button>
    </div>
    <div class="cal-grid">${DIAS_PT.map(d=>`<div class="cal-dow">${d}</div>`).join('')}`;
    for(let i=0;i<startDow;i++) html+=`<div class="cal-day other-month"></div>`;
    for(let d=1;d<=lastDay.getDate();d++){
        const ds=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const evts=eventMap[ds]||[], isToday=ds===today, shown=evts.slice(0,3), more=evts.length-shown.length;
        html+=`<div class="cal-day${isToday?' today':''}${evts.length?' has-events':''}" ${evts.length?`onclick="calDayClick('${ds}')" title="${evts.length} procedimento(s)"`:''}><div class="cal-day-num">${d}</div>${shown.map(p=>{const cls=p.status==='urgencia'?'urgencia':p.status==='concluido'?'concluido':'';return`<span class="cal-event-dot ${cls}" title="${p.hospital}">${p.hospital.replace(/Hospital /i,'').substring(0,10)}</span>`;}).join('')}${more>0?`<div class="cal-more">+${more}</div>`:''}</div>`;
    }
    const rem=(startDow+lastDay.getDate())%7; for(let i=0;i<(rem?7-rem:0);i++) html+=`<div class="cal-day other-month"></div>`;
    html+=`</div></div>`;
    container.innerHTML=html;
}
function calNav(dir){ calMonth+=dir; if(calMonth<0){calMonth=11;calYear--;} if(calMonth>11){calMonth=0;calYear++;} renderCalendar(); }
function calDayClick(ds){
    const evts=procedimentos.filter(p=>p.data===ds); if(!evts.length) return;
    const dateFmt=new Date(ds+'T00:00:00').toLocaleDateString('pt-BR');
    const sN={a_agendar:'Autorizado',agendado:'Agendado',em_transito:'Em Trânsito',preparacao:'Em Separação',andamento:'Em Procedimento',concluido:'Concluído',cancelado:'Cancelado',reagendado:'Reagendado',a_retirar:'A Retirar',urgencia:'🚨 Urgência',coleta_urgente:'✈️ Coleta Prioritária'};
    alert(`📅 ${dateFmt} — ${evts.length} procedimento(s)\n\n`+evts.map(p=>`• ${p.hospital} | ${p.medico||'—'} | ${sN[p.status]||p.status}`).join('\n'));
}

window.renderDashboard = renderDashboard;
window.renderCalendar  = renderCalendar;
window.calNav          = calNav;
window.calDayClick     = calDayClick;
window.setGroupBy      = setGroupBy;
window.quickSetStatus  = quickSetStatus;
window.buildQuickStatusHTML = buildQuickStatusHTML;
window.diasBadge       = diasBadge;
window.staleBadge      = staleBadge;
window.buildObsInlineHTML = buildObsInlineHTML;
window.abrirObsInline  = abrirObsInline;
window.fecharObsInline = fecharObsInline;
window.salvarObsInline = salvarObsInline;
window.obsKeyDown      = obsKeyDown;
window.duplicarProc    = duplicarProc;
window.compartilharWhatsApp = compartilharWhatsApp;
window.hookDupCheck    = hookDupCheck;
window.mostrarAviso    = mostrarAviso;
window.mostrarChecklist= mostrarChecklist;
window.fecharChecklist = fecharChecklist;
window.fbSaveProc      = fbSaveProc;
window.todayStr        = todayStr;
window.mostrarAlertaReagendado = mostrarAlertaReagendado;

