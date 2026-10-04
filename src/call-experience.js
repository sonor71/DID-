const AUDIO_CTX = window.AudioContext || window.webkitAudioContext;

let audioCtx = null;
let soundTimer = null;
let soundMode = null;
let currentIncomingId = null;
let outgoingPending = false;
let outgoingActive = false;
let outgoingPendingTimer = null;
let notificationPromptShown = false;

function ensureAudioContext() {
  if (!AUDIO_CTX) return null;
  if (!audioCtx) audioCtx = new AUDIO_CTX();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function primeAudio() {
  const ctx = ensureAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0.00001;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.02);
}

document.addEventListener('pointerdown', primeAudio, { capture: true });
document.addEventListener('keydown', primeAudio, { capture: true });

function playTone(freq, durationMs, volume = 0.055, type = 'sine', delayMs = 0) {
  const ctx = ensureAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const start = ctx.currentTime + delayMs / 1000;
  const end = start + durationMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.025);
  gain.gain.setValueAtTime(Math.max(0.0002, volume), Math.max(start + 0.03, end - 0.06));
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(end + 0.02);
}

function playIncomingPhrase() {
  // Short FRAKTUM-style chime: melodic enough to feel like a ringtone,
  // but generated locally so it has no external audio dependency.
  [
    [659.25, 0],
    [783.99, 210],
    [987.77, 420],
    [783.99, 650],
    [659.25, 880]
  ].forEach(([freq, delay]) => playTone(freq, 170, 0.05, 'triangle', delay));
}

function playOutgoingPhrase() {
  // Familiar ringback pulse for the caller.
  playTone(440, 1200, 0.035, 'sine', 0);
  playTone(480, 1200, 0.025, 'sine', 0);
}

function stopCallSound() {
  if (soundTimer) clearInterval(soundTimer);
  soundTimer = null;
  soundMode = null;
}

function startCallSound(mode) {
  if (soundMode === mode) return;
  stopCallSound();
  soundMode = mode;
  if (mode === 'incoming') {
    playIncomingPhrase();
    soundTimer = setInterval(playIncomingPhrase, 3300);
  } else if (mode === 'outgoing') {
    playOutgoingPhrase();
    soundTimer = setInterval(playOutgoingPhrase, 3900);
  }
}

function showNotificationOptIn() {
  if (notificationPromptShown || !('Notification' in window) || Notification.permission !== 'default') return;
  if (document.querySelector('#fraktumCallNotificationOptIn')) return;
  notificationPromptShown = true;

  const box = document.createElement('div');
  box.id = 'fraktumCallNotificationOptIn';
  Object.assign(box.style, {
    position: 'fixed',
    right: '18px',
    bottom: '18px',
    zIndex: '100000',
    width: 'min(360px, calc(100vw - 36px))',
    padding: '14px',
    borderRadius: '16px',
    background: 'rgba(9, 18, 34, .97)',
    border: '1px solid rgba(125, 112, 255, .42)',
    boxShadow: '0 18px 50px rgba(0,0,0,.35)',
    color: '#eef3ff',
    fontFamily: 'inherit'
  });
  box.innerHTML = `
    <div style="font-weight:700;margin-bottom:5px">Уведомления о звонках</div>
    <div style="font-size:13px;line-height:1.4;opacity:.78;margin-bottom:11px">Разрешите браузеру показывать входящий звонок, когда вкладка FRAKTUM не на переднем плане.</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="fraktumCallNotifyLater" style="border:0;border-radius:10px;padding:8px 11px;background:#17233a;color:#dbe7ff;cursor:pointer">Позже</button>
      <button id="fraktumCallNotifyEnable" style="border:0;border-radius:10px;padding:8px 11px;background:#7667ff;color:white;font-weight:700;cursor:pointer">Включить</button>
    </div>`;
  document.body.appendChild(box);
  box.querySelector('#fraktumCallNotifyLater')?.addEventListener('click', () => box.remove());
  box.querySelector('#fraktumCallNotifyEnable')?.addEventListener('click', async () => {
    try { await Notification.requestPermission(); } catch {}
    box.remove();
  });
}

function notifyIncomingCall({ id, caller, mode }) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(mode === 'video' ? 'Входящий видеозвонок · FRAKTUM' : 'Входящий звонок · FRAKTUM', {
      body: `${caller} звонит вам`,
      icon: '/assets/home/brand.png',
      badge: '/assets/home/brand.png',
      tag: `fraktum-call-${id || 'incoming'}`,
      renotify: true,
      requireInteraction: true,
      silent: true
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {}
}

function detectIncomingCall() {
  const modal = document.querySelector('.incoming-call');
  if (!modal) {
    if (currentIncomingId && soundMode === 'incoming') stopCallSound();
    currentIncomingId = null;
    return;
  }

  const actionButton = modal.querySelector('[data-action="accept-cloud-call"], [data-action="decline-cloud-call"]');
  const id = actionButton?.dataset.id || 'incoming';
  if (currentIncomingId === id) return;

  currentIncomingId = id;
  const caller = modal.querySelector('h2')?.textContent?.trim() || 'Пользователь';
  const eyebrow = modal.querySelector('.eyebrow')?.textContent || '';
  const mode = /видео/i.test(eyebrow) ? 'video' : 'audio';
  startCallSound('incoming');
  notifyIncomingCall({ id, caller, mode });
}

function detectOutgoingCall() {
  const overlay = document.querySelector('#realCallOverlay');
  const status = document.querySelector('#realCallStatus')?.textContent?.trim() || '';

  if (outgoingPending && overlay && !outgoingActive) {
    outgoingPending = false;
    outgoingActive = true;
    if (outgoingPendingTimer) clearTimeout(outgoingPendingTimer);
    outgoingPendingTimer = null;
    startCallSound('outgoing');
  }

  if (outgoingActive) {
    if (!overlay || ['Соединено', 'Звонок отклонён', 'Звонок завершён', 'Связь прервана'].includes(status)) {
      outgoingActive = false;
      if (soundMode === 'outgoing') stopCallSound();
    }
  }
}

function scanCallUi() {
  detectIncomingCall();
  detectOutgoingCall();
}

document.addEventListener('click', (event) => {
  const target = event.target.closest?.('[data-action], #realCallHangup');
  if (!target) return;

  const action = target.dataset?.action;

  if (action === 'start-call') {
    ensureAudioContext();
    outgoingPending = true;
    outgoingActive = false;
    if (outgoingPendingTimer) clearTimeout(outgoingPendingTimer);
    outgoingPendingTimer = setTimeout(() => {
      if (outgoingPending && !document.querySelector('#realCallOverlay')) outgoingPending = false;
    }, 12000);
    showNotificationOptIn();
  }

  if (action === 'accept-cloud-call' || action === 'decline-cloud-call') {
    currentIncomingId = null;
    if (soundMode === 'incoming') stopCallSound();
  }

  if (action === 'toggle-chat-panel' || (action === 'navigate' && target.dataset?.page === 'messages')) {
    showNotificationOptIn();
  }

  if (action === 'end-call' || target.id === 'realCallHangup') {
    outgoingPending = false;
    outgoingActive = false;
    currentIncomingId = null;
    stopCallSound();
  }
}, true);

const observer = new MutationObserver(scanCallUi);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
setInterval(scanCallUi, 500);

window.addEventListener('pagehide', stopCallSound);
window.addEventListener('beforeunload', stopCallSound);

scanCallUi();
