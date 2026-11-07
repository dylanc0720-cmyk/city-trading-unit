'use strict';
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const body = document.body;

  // ================= Settings =================
  const PLAYER_COLORS = ['#ff4d4d', '#3b82f6', '#22c55e', '#facc15', '#c084fc', '#fb923c'];
  const OUTCOMES = ['1', '2', '3', 'S'];
  const ODDS_PRESETS = {
    equal: { 1: 25, 2: 25, 3: 25, S: 25 },
    rare: { 1: 30, 2: 30, 3: 25, S: 15 },
    small: { 1: 40, 2: 30, 3: 20, S: 10 },
  };
  const DEFAULTS = {
    players: ['Player 1', 'Player 2', 'Player 3', 'Player 4'],
    weights: { ...ODDS_PRESETS.equal },
    auctionSecs: 50,
    surprise: false,
    volume: 0.8,
    muted: false,
    musicVol: 0.45,
  };
  const KEY = 'ctu-settings-v1';
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function loadSettings() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        const out = { ...clone(DEFAULTS), ...s, weights: { ...DEFAULTS.weights, ...(s.weights || {}) } };
        if (!Array.isArray(out.players) || out.players.length < 2) out.players = clone(DEFAULTS.players);
        out.players = out.players.slice(0, 6);
        return out;
      }
    } catch (e) { /* storage unavailable */ }
    return clone(DEFAULTS);
  }
  let S = loadSettings();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  }
  const playerColor = (i) => PLAYER_COLORS[i % PLAYER_COLORS.length];
  const playerName = (i) => (S.players[i] || '').trim() || `Player ${i + 1}`;

  // ================= Random =================
  function rand() {
    if (window.crypto && crypto.getRandomValues) {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] / 4294967296;
    }
    return Math.random();
  }
  function pickOutcome(w = S.weights) {
    const ws = OUTCOMES.map((k) => Math.max(0, Number(w[k]) || 0));
    const total = ws.reduce((a, b) => a + b, 0);
    if (total <= 0) return OUTCOMES[Math.floor(rand() * 4)];
    let r = rand() * total;
    for (let i = 0; i < OUTCOMES.length; i++) {
      r -= ws[i];
      if (r < 0) return OUTCOMES[i];
    }
    return OUTCOMES[OUTCOMES.length - 1];
  }

  // ================= Money =================
  function fmt(k) {
    if (!k) return '—';
    if (k >= 1000) return 'M' + parseFloat((k / 1000).toFixed(2)) + 'm';
    return 'M' + k + 'k';
  }

  // ================= Sound (all synthesized) =================
  const Sound = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null, master = null, noiseBuf = null, primed = false;

    function init() {
      if (ctx || !AC) return;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older iOS */ }
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5;
      comp.attack.value = 0.003; comp.release.value = 0.2;
      master.connect(comp);
      comp.connect(ctx.destination);
      applyVolume();
      const len = Math.floor(ctx.sampleRate * 1.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    function unlock() {
      init();
      if (!ctx) return;
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      if (!primed) {
        const b = ctx.createBuffer(1, 1, 22050);
        const s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
        primed = true;
      }
    }
    function applyVolume() {
      if (master) master.gain.value = S.muted ? 0 : S.volume * 0.9;
    }
    const live = () => { if (!ctx) init(); return ctx && !S.muted && S.volume > 0; };
    const T = () => ctx.currentTime + 0.01;

    function tone(f, t, dur, o = {}) {
      const { type = 'sine', gain = 0.3, a = 0.005, to = null, dest = master, detune = 0 } = o;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t);
      if (detune) osc.detune.setValueAtTime(detune, t);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(dest);
      osc.start(t); osc.stop(t + dur + 0.05);
      return osc;
    }
    function noise(t, dur, o = {}) {
      const { gain = 0.3, type = 'bandpass', f = 1000, q = 1, a = 0.002, to = null } = o;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const fl = ctx.createBiquadFilter();
      fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
      if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(fl); fl.connect(g); g.connect(master);
      src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    }
    function bell(f, t, dur = 1.2, gain = 0.22) {
      tone(f, t, dur, { type: 'sine', gain });
      tone(f * 2.76, t, dur * 0.5, { type: 'sine', gain: gain * 0.3 });
      tone(f * 5.4, t, dur * 0.22, { type: 'sine', gain: gain * 0.12 });
    }
    function brass(f, t, dur, gain = 0.12) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = 'sawtooth'; o2.type = 'sawtooth';
      o1.frequency.value = f; o2.frequency.value = f; o2.detune.value = 9;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.exponentialRampToValueAtTime(3200, t + 0.06);
      lp.frequency.exponentialRampToValueAtTime(1400, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
      g.gain.setValueAtTime(gain, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master);
      o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    }
    function whistle(t, dur) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
      g.gain.setValueAtTime(0.5, t + dur * 0.75);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      bp.connect(g); g.connect(master);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 6.5;
      const lg = ctx.createGain(); lg.gain.value = 8; lfo.connect(lg);
      [587.33, 739.99, 880, 1174.66].forEach((f) => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        lg.connect(o.frequency); o.connect(bp); o.start(t); o.stop(t + dur + 0.05);
      });
      lfo.start(t); lfo.stop(t + dur + 0.05);
      noise(t, dur, { f: 2600, q: 0.8, gain: 0.07 });
    }
    const N = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.51, F6: 1396.91, G6: 1567.98 };

    return {
      unlock, applyVolume,
      ctx() { init(); return ctx; },
      press() {
        if (!live()) return; const t = T();
        tone(260, t, 0.09, { type: 'triangle', gain: 0.3, to: 120 });
        noise(t, 0.035, { f: 3000, q: 0.7, gain: 0.18 });
      },
      click() {
        if (!live()) return; const t = T();
        tone(1700, t, 0.025, { type: 'square', gain: 0.05 });
        noise(t, 0.025, { f: 5000, q: 0.8, gain: 0.1 });
      },
      tick(v) {
        if (!live()) return; const t = T();
        const f = { 1: 1180, 2: 1320, 3: 1480, S: 990 }[v] || 1200;
        tone(f, t, 0.045, { type: 'triangle', gain: 0.24 });
        noise(t, 0.018, { f: 6500, q: 1, gain: 0.09 });
      },
      land(v) {
        if (!live()) return; const t = T() + 0.02;
        const seq = v === '3' ? [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6] : v === '2' ? [N.C5, N.E5, N.G5, N.C6] : [N.C5, N.G5, N.C6];
        seq.forEach((f, i) => {
          tone(f, t + i * 0.085, 0.45, { type: 'triangle', gain: 0.2 });
          tone(f * 2, t + i * 0.085, 0.3, { type: 'sine', gain: 0.05 });
        });
        const end = t + seq.length * 0.085;
        [N.C6, N.E6, N.G6].forEach((f) => bell(f, end, 1.3, 0.07));
        if (v === '3') brass(N.C5, end, 0.9, 0.08);
      },
      thud(i) {
        if (!live()) return; const t = T();
        tone(190 - i * 18, t, 0.2, { type: 'sine', gain: 0.55, to: 70 });
        noise(t, 0.08, { type: 'lowpass', f: 1100, gain: 0.35 });
      },
      station() {
        if (!live()) return; const t = T() + 0.02;
        whistle(t, 0.32);
        whistle(t + 0.42, 0.7);
        for (let i = 0; i < 8; i++) {
          const ct = t + 1.15 + i * 0.15;
          noise(ct, 0.11, { type: 'lowpass', f: 650, gain: i % 2 ? 0.2 : 0.34 });
          noise(ct, 0.06, { f: 3000, q: 0.6, gain: 0.05 });
        }
        bell(N.G5, t + 2.4, 1.1, 0.16);
      },
      auctionStart() {
        if (!live()) return; const t = T() + 0.02;
        bell(N.G5, t, 1.0, 0.26);
        bell(N.G5, t + 0.2, 1.4, 0.26);
        tone(220, t, 0.45, { type: 'sawtooth', gain: 0.05, to: 1300 });
      },
      dealStart() {
        if (!live()) return; const t = T() + 0.02;
        bell(N.E6, t, 0.9, 0.2);
        bell(N.C6, t + 0.18, 1.2, 0.2);
      },
      sec() {
        if (!live()) return; const t = T();
        tone(1000, t, 0.07, { type: 'sine', gain: 0.17 });
      },
      warnStart() {
        if (!live()) return; const t = T();
        for (let i = 0; i < 3; i++) tone(1480, t + i * 0.12, 0.09, { type: 'square', gain: 0.12 });
      },
      warnBeep(hi) {
        if (!live()) return; const t = T();
        tone(hi ? 1760 : 1568, t, 0.07, { type: 'square', gain: 0.11 });
      },
      gavel() {
        if (!live()) return; const t = T() + 0.02;
        [0, 0.34, 0.72].forEach((d, i) => {
          const tt = t + d;
          tone(160, tt, 0.24, { type: 'sine', gain: 0.85, to: 55 });
          noise(tt, 0.1, { type: 'lowpass', f: 1800, gain: 0.55 });
          tone(820 + i * 40, tt, 0.05, { type: 'triangle', gain: 0.14 });
        });
        const ft = t + 1.05;
        brass(N.G5, ft, 0.14); brass(N.G5, ft + 0.15, 0.14);
        [N.C6, N.E6, N.G6].forEach((f) => brass(f, ft + 0.32, 0.9, 0.07));
        bell(N.C6, ft + 0.32, 1.4, 0.1);
      },
      noBids() {
        if (!live()) return; const t = T();
        tone(392, t, 0.35, { type: 'triangle', gain: 0.22, to: 330 });
        tone(330, t + 0.35, 0.6, { type: 'triangle', gain: 0.22, to: 247 });
      },
      buzzer() {
        if (!live()) return; const t = T();
        tone(110, t, 0.85, { type: 'sawtooth', gain: 0.28 });
        tone(117, t, 0.85, { type: 'square', gain: 0.12 });
      },
      dealDone() {
        if (!live()) return; const t = T();
        [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone(f, t + i * 0.07, 0.4, { type: 'triangle', gain: 0.2 }));
        bell(N.C6, t + 0.3, 1.2, 0.1);
      },
      coin() {
        if (!live()) return; const t = T();
        tone(N.B5, t, 0.08, { type: 'square', gain: 0.08 });
        tone(N.E6, t + 0.075, 0.32, { type: 'square', gain: 0.08 });
      },
      undo() {
        if (!live()) return; const t = T();
        tone(420, t, 0.13, { type: 'triangle', gain: 0.2, to: 240 });
      },
      cancel() {
        if (!live()) return; const t = T();
        tone(520, t, 0.28, { type: 'triangle', gain: 0.2, to: 170 });
      },
    };
  })();

  // ================= Haptics (iOS 18 switch trick / Android vibrate) =================
  const haptic = (() => {
    let label = null;
    try {
      label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      label.appendChild(input);
      label.style.cssText = 'position:fixed;left:-100px;top:0;opacity:0;pointer-events:none;';
      document.head.appendChild(label);
    } catch (e) { label = null; }
    return () => {
      try {
        if (navigator.vibrate) navigator.vibrate(12);
        else if (label) label.click();
      } catch (e) { /* ignore */ }
    };
  })();

  // ================= Background music (public-domain ragtime) =================
  const Music = (() => {
    let list = [], order = [], pos = -1, el = null, gain = null, on = false, mode = 'normal', duckUntil = 0, duckT = 0;
    const LEVEL = { normal: 1, auction: 0.5, warn: 0.28 };
    const loadList = () => fetch('music/playlist.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : [])).then((j) => { list = Array.isArray(j) ? j : []; return list; }).catch(() => []);
    let ready = loadList();
    function graph() {
      if (el) return true;
      const ctx = Sound.ctx();
      if (!ctx) return false;
      el = new Audio();
      el.preload = 'auto';
      try {
        const src = ctx.createMediaElementSource(el);
        gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain);
        gain.connect(ctx.destination);
      } catch (e) { gain = null; }
      el.addEventListener('ended', () => advance());
      el.addEventListener('error', () => { if (on) setTimeout(() => advance(), 800); });
      return true;
    }
    function level() {
      const ctx = Sound.ctx();
      const ducked = ctx && ctx.currentTime < duckUntil;
      return S.muted ? 0 : S.musicVol * LEVEL[mode] * (ducked ? 0.35 : 1);
    }
    function apply(fast) {
      if (!el) return;
      const v = level();
      if (gain) {
        const ctx = Sound.ctx();
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setTargetAtTime(v, ctx.currentTime, fast ? 0.02 : 0.18);
      } else {
        try { el.volume = Math.min(1, v); } catch (e) { /* iOS ignores */ }
      }
    }
    function shuffle() {
      const lastTrack = order.length ? order[order.length - 1] : -1;
      order = list.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      if (order.length > 1 && order[0] === lastTrack) [order[0], order[1]] = [order[1], order[0]];
    }
    function cue() {
      const t = list[order[pos]];
      el.src = 'music/' + t.file;
      return t;
    }
    function advance() {
      if (!list.length || !el) return;
      pos++;
      if (pos >= order.length) { shuffle(); pos = 0; }
      const t = cue();
      if (on) { el.play().catch(() => {}); toast('♪ ' + t.title + ' — ' + t.composer); }
      ui();
    }
    async function start() {
      Sound.unlock();
      if (!graph()) return;
      await ready;
      if (!list.length) { ready = loadList(); await ready; }
      if (!list.length) { toast('Music needs an internet connection'); return; }
      if (pos < 0) { shuffle(); pos = 0; cue(); }
      on = true;
      apply(true);
      try {
        await el.play();
        const t = list[order[pos]];
        toast('♪ ' + t.title + ' — ' + t.composer);
      } catch (e) { on = false; }
      ui();
    }
    function stop() { on = false; if (el) el.pause(); ui(); }
    function ui() {
      const b = $('#btn-music');
      if (b) b.classList.toggle('on', on);
      const n = $('#now-playing');
      if (n) {
        const t = pos >= 0 ? list[order[pos]] : null;
        n.textContent = t ? `${on ? 'Playing' : 'Paused'}: ${t.title} — ${t.composer}` : 'Not started';
      }
    }
    function duck(from, until) {
      duckUntil = Math.max(duckUntil, until);
      apply();
      clearTimeout(duckT);
      const ctx = Sound.ctx();
      duckT = setTimeout(() => apply(), Math.max(0, (until - ctx.currentTime) * 1000) + 60);
    }
    return {
      start, stop,
      toggle() { on ? stop() : start(); },
      next() { if (!el) { start(); return; } advance(); },
      setMode(m) { mode = m; apply(); },
      duck, apply, ui,
      get ready() { return ready; },
      get on() { return on; },
    };
  })();

  // ---- small toast ----
  let toastT = 0;
  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 3800);
  }

  // ================= Screen wake lock =================
  let wakeLock = null;
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { /* not allowed */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') keepAwake();
  });
  function firstGesture() { Sound.unlock(); keepAwake(); }
  window.addEventListener('touchend', firstGesture, { passive: true });
  window.addEventListener('click', firstGesture);

  // ================= Night-city skyline =================
  const Sky = (() => {
    const cv = $('#sky');
    const c = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1, base = null, windows = [], beacons = [], stars = [], boost = 0;
    const rnd = (a, b) => a + Math.random() * (b - a);

    function layer(b, o) {
      let x = -rnd(0, 30);
      while (x < W + 10) {
        const w = rnd(o.minW, o.maxW);
        const h = H * rnd(o.minH, o.maxH);
        const y = H - h;
        b.fillStyle = o.color;
        b.fillRect(x, y, w, h);
        const roll = Math.random();
        if (roll < 0.25) b.fillRect(x + w * 0.2, y - h * 0.07, w * 0.6, h * 0.07);
        else if (roll < 0.4) {
          b.beginPath(); b.moveTo(x, y); b.lineTo(x + w / 2, y - w * 0.35); b.lineTo(x + w, y); b.fill();
        }
        if (Math.random() < 0.3) {
          const ax = x + w * 0.5, ah = h * rnd(0.1, 0.22);
          b.fillRect(ax - 1, y - ah - (roll < 0.25 ? h * 0.07 : 0), 2, ah);
          beacons.push({ x: ax, y: y - ah - (roll < 0.25 ? h * 0.07 : 0), p: Math.random() * 2 });
        }
        if (o.win) {
          const cw = 8.5, ch = 11;
          const cols = Math.floor((w - 8) / cw), rows = Math.floor((h - 10) / ch);
          const offX = x + (w - cols * cw) / 2 + 1.5;
          for (let r = 0; r < rows; r++) {
            for (let k = 0; k < cols; k++) {
              if (Math.random() < 0.08) continue;
              windows.push({ x: offX + k * cw, y: y + 8 + r * ch, w: 4.5, h: 6.5, lit: Math.random() < o.lit, warm: Math.random() < 0.78, a: o.alpha });
            }
          }
        }
        x += w + rnd(o.gap[0], o.gap[1]);
      }
    }
    function build() {
      base = document.createElement('canvas');
      base.width = cv.width; base.height = cv.height;
      const b = base.getContext('2d');
      b.scale(dpr, dpr);
      const g = b.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#04061a'); g.addColorStop(0.45, '#0f0f33'); g.addColorStop(0.75, '#2a1650'); g.addColorStop(1, '#4b1f5c');
      b.fillStyle = g; b.fillRect(0, 0, W, H);
      // moon
      const mx = W * 0.82, my = H * 0.1, mr = Math.max(14, Math.min(W, H) * 0.045);
      const mg = b.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 5);
      mg.addColorStop(0, 'rgba(255,240,210,0.28)'); mg.addColorStop(1, 'rgba(255,240,210,0)');
      b.fillStyle = mg; b.fillRect(0, 0, W, H);
      b.fillStyle = '#fbf3dc'; b.beginPath(); b.arc(mx, my, mr, 0, Math.PI * 2); b.fill();
      b.fillStyle = 'rgba(200,190,170,0.35)';
      b.beginPath(); b.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.22, 0, 7); b.fill();
      b.beginPath(); b.arc(mx + mr * 0.35, my + mr * 0.3, mr * 0.15, 0, 7); b.fill();
      // horizon glow
      const hg = b.createLinearGradient(0, H * 0.55, 0, H);
      hg.addColorStop(0, 'rgba(255,120,180,0)'); hg.addColorStop(1, 'rgba(255,120,160,0.18)');
      b.fillStyle = hg; b.fillRect(0, H * 0.55, W, H * 0.45);
      stars = [];
      for (let i = 0; i < 110; i++) stars.push({ x: Math.random() * W, y: Math.random() * H * 0.6, r: Math.random() * 1.1 + 0.3, p: Math.random() * 6.28, s: rnd(0.6, 2) });
      windows = []; beacons = [];
      layer(b, { color: '#1c1a47', minH: 0.22, maxH: 0.5, minW: 26, maxW: 60, win: true, lit: 0.18, alpha: 0.35, gap: [-6, 6] });
      layer(b, { color: '#121033', minH: 0.14, maxH: 0.38, minW: 34, maxW: 76, win: true, lit: 0.3, alpha: 0.7, gap: [2, 10] });
      layer(b, { color: '#07071a', minH: 0.07, maxH: 0.2, minW: 44, maxW: 96, win: true, lit: 0.42, alpha: 1, gap: [4, 14] });
    }
    function draw(time = performance.now()) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.drawImage(base, 0, 0, W, H);
      const ts = time / 1000;
      for (const s of stars) {
        c.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(s.p + ts * s.s));
        c.fillStyle = '#fff';
        c.fillRect(s.x, s.y, s.r, s.r);
      }
      for (const w of windows) {
        const on = w.lit || (boost > 0 && ((w.x * 7 + w.y * 13) | 0) % 3 === 0);
        if (!on) continue;
        c.globalAlpha = w.a;
        c.fillStyle = w.warm ? '#ffd37a' : '#cfe6ff';
        c.fillRect(w.x, w.y, w.w, w.h);
      }
      for (const bc of beacons) {
        const on = ((ts + bc.p) % 1.6) < 0.5;
        if (!on) continue;
        c.globalAlpha = 1;
        c.fillStyle = '#ff3030';
        c.beginPath(); c.arc(bc.x, bc.y, 2.2, 0, 7); c.fill();
        c.globalAlpha = 0.25;
        c.beginPath(); c.arc(bc.x, bc.y, 7, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    }
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      build(); draw();
    }
    function twinkle() {
      if (document.hidden || !windows.length) return;
      for (let i = 0; i < 4; i++) {
        const w = windows[(Math.random() * windows.length) | 0];
        w.lit = !w.lit;
      }
      if (boost > 0) boost--;
      draw();
    }
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 120); });
    resize();
    setInterval(twinkle, 260);
    return { celebrate() { boost = 10; draw(); } };
  })();

  // ================= Particle FX =================
  const FX = (() => {
    const cv = $('#fx');
    const c = cv.getContext('2d');
    let parts = [], running = false, dpr = 1, W = 0, H = 0;
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }
    window.addEventListener('resize', resize);
    resize();
    function loop() {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      parts = parts.filter((p) => p.life > 0);
      for (const p of parts) {
        p.vx *= p.drag; p.vy = p.vy * p.drag + p.g;
        p.x += p.vx; p.y += p.vy; p.life--; p.rot += p.vr;
        const a = Math.min(1, p.life / 20);
        c.globalAlpha = a;
        c.fillStyle = p.color;
        if (p.kind === 'confetti') {
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
          c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          c.restore();
        } else {
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, 7); c.fill();
        }
      }
      c.globalAlpha = 1;
      if (parts.length) requestAnimationFrame(loop);
      else { running = false; c.clearRect(0, 0, W, H); }
    }
    function start() { if (!running) { running = true; requestAnimationFrame(loop); } }
    return {
      burst(x, y, colors, count = 46, speed = 7) {
        for (let i = 0; i < count; i++) {
          const ang = Math.random() * Math.PI * 2, sp = speed * (0.35 + Math.random());
          parts.push({ kind: 'spark', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1.5, g: 0.16, drag: 0.965, life: 40 + Math.random() * 30, size: 1.6 + Math.random() * 2.4, color: colors[i % colors.length], rot: 0, vr: 0 });
        }
        start();
      },
      confetti(colors) {
        for (let i = 0; i < 140; i++) {
          parts.push({ kind: 'confetti', x: Math.random() * W, y: -20 - Math.random() * H * 0.4, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, g: 0.05, drag: 0.99, life: 140 + Math.random() * 80, size: 7 + Math.random() * 6, color: colors[i % colors.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3 });
        }
        start();
      },
    };
  })();

  // ================= Icons =================
  const TRAIN_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="10" y="5" width="28" height="31" rx="8" fill="currentColor"/><rect x="14" y="10" width="20" height="11" rx="3" fill="#0b0c12" opacity=".85"/><circle cx="17.5" cy="28.5" r="2.8" fill="#0b0c12"/><circle cx="30.5" cy="28.5" r="2.8" fill="#0b0c12"/><path d="M16 36 L11 44 M32 36 L37 44 M13.5 41h21" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>';
  const CUBE_SVG = (top, left, right) => `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5 L41 14.5 L24 24 L7 14.5Z" fill="${top}"/><path d="M7 14.5 L24 24 L24 43 L7 33.5Z" fill="${left}"/><path d="M41 14.5 L24 24 L24 43 L41 33.5Z" fill="${right}"/></svg>`;
  const glyph = (v) => (v === 'S' ? TRAIN_SVG : v);
  const VALUE_COLOR = { 1: '#34d399', 2: '#38bdf8', 3: '#fbbf24', S: '#c084fc' };

  // ================= Display =================
  const D = { el: $('#display'), label: $('#display-label'), main: $('#display-main'), sub: $('#display-sub') };
  function setDisplay({ label, main, sub, tone = '' }) {
    if (label != null) D.label.textContent = label;
    if (main != null) D.main.innerHTML = main;
    if (sub != null) D.sub.textContent = sub;
    D.el.dataset.tone = tone;
  }
  function bumpMain() {
    if (D.main.animate) D.main.animate([{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 140, easing: 'ease-out' });
  }
  function idleDisplay() {
    setDisplay({ label: 'TRADING UNIT · ON', main: '<span class="word">READY</span>', sub: 'BUILD below · tap the handshake to auction', tone: '' });
  }

  // ================= Ring positions (like the real unit: 2 top, 3 right, station bottom, 1 left) =================
  const RING_ORDER = ['2', '3', 'S', '1']; // clockwise
  const ringLights = RING_ORDER.map((v) => $('#rl-' + v));
  const ringLabels = RING_ORDER.map((v) => $('#lbl-' + v));
  let spinPos = 0;
  function light(i) {
    RING_ORDER.forEach((_, k) => {
      const on = i >= 0 && k === i;
      const trail = i >= 0 && k === (i - 1 + 4) % 4;
      ringLights[k].classList.toggle('lit', on);
      ringLights[k].classList.toggle('trail', trail);
      ringLabels[k].classList.toggle('lit', on);
    });
  }
  function posCenter(i) {
    const r = ringLabels[i].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  // grip ridges on the rubber band
  (() => {
    const g = $('#grip-notches');
    let html = '';
    for (let a = 140; a <= 292; a += 15) {
      const rad = (a * Math.PI) / 180;
      const x1 = 200 + 154 * Math.cos(rad), y1 = 200 + 154 * Math.sin(rad);
      const x2 = 200 + 182 * Math.cos(rad), y2 = 200 + 182 * Math.sin(rad);
      html += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
    }
    g.innerHTML = html;
  })();

  // ================= Overlay =================
  const ov = $('#overlay'), rc = $('#rc');
  let ovTimer = 0;
  function showOverlay(html, cls, timeout = 0) {
    clearTimeout(ovTimer);
    rc.className = 'rc ' + (cls || '');
    rc.innerHTML = html;
    ov.hidden = false;
    void ov.offsetWidth;
    ov.classList.add('show');
    if (timeout) ovTimer = setTimeout(hideOverlay, timeout);
  }
  function hideOverlay() {
    clearTimeout(ovTimer);
    ov.classList.remove('show');
    setTimeout(() => { if (!ov.classList.contains('show')) ov.hidden = true; }, 230);
  }
  ov.addEventListener('click', () => { Sound.click(); hideOverlay(); });

  // ================= Buttons state =================
  const btnBuild = $('#btn-build'), btnDeal = $('#btn-deal'), core = $('#core');
  let spinning = false;
  function syncButtons() {
    const lock = spinning || timer.running;
    btnBuild.disabled = lock;
    btnDeal.disabled = lock;
    body.classList.toggle('busy', spinning);
    $('#build-caption').textContent = spinning ? 'SPINNING…' : 'BUILD';
  }

  // ================= BUILD =================
  async function doBuild() {
    if (spinning || timer.running) return;
    hideOverlay();
    spinning = true;
    syncButtons();
    Sound.press();
    haptic();
    const result = pickOutcome();
    const target = RING_ORDER.indexOf(result);
    const steps = 16 + ((target - spinPos + 4) % 4) + 4 * Math.floor(rand() * 2);
    setDisplay({ label: 'BUILD PERMIT', main: '', sub: 'Spinning…', tone: '' });
    for (let i = 1; i <= steps; i++) {
      spinPos = (spinPos + 1) % 4;
      const v = RING_ORDER[spinPos];
      light(spinPos);
      D.main.innerHTML = glyph(v);
      D.el.dataset.tone = 'b' + v;
      Sound.tick(v);
      const t = i / steps;
      await sleep(38 + 400 * Math.pow(t, 2.4));
    }
    // landed
    ringLights.forEach((r) => r.classList.remove('trail'));
    const lit = ringLights[spinPos];
    lit.classList.add('won');
    setTimeout(() => lit.classList.remove('won'), 1400);
    const col = VALUE_COLOR[result];
    const p = posCenter(spinPos);
    FX.burst(p.x, p.y, [col, '#ffffff', '#ffc65a']);
    Sky.celebrate();
    haptic();
    if (result === 'S') {
      Sound.station();
      setDisplay({ label: 'BUILD PERMIT', main: TRAIN_SVG + '<span class="word">STATION</span>', sub: 'Build a station — no blocks this turn', tone: 'bS' });
      showOverlay(
        `<div class="rc-kicker">BUILD PERMIT</div><div class="rc-train">${TRAIN_SVG}</div><div class="rc-text">Build a <b>STATION</b><br>No blocks this turn</div><div class="rc-hint">TAP TO CLOSE</div>`,
        'cS', 5200);
    } else {
      const n = Number(result);
      Sound.land(result);
      setDisplay({ label: 'BUILD PERMIT', main: `${n}<span class="unit-sfx">${n === 1 ? 'BLOCK' : 'BLOCKS'}</span>`, sub: `Build up to ${n} block${n > 1 ? 's' : ''} this turn`, tone: 'b' + n });
      const shades = { 1: ['#a7f3d0', '#34d399', '#059669'], 2: ['#bae6fd', '#38bdf8', '#0284c7'], 3: ['#fde68a', '#fbbf24', '#d97706'] }[n];
      const cubes = Array.from({ length: n }, (_, i) => CUBE_SVG(...shades).replace('<svg ', `<svg style="animation-delay:${0.25 + i * 0.18}s" `)).join('');
      showOverlay(
        `<div class="rc-kicker">BUILD PERMIT</div><div class="rc-big">${n}</div><div class="rc-blocks">${cubes}</div><div class="rc-text">Build <b>up to ${n} block${n > 1 ? 's' : ''}</b> this turn</div><div class="rc-hint">TAP TO CLOSE</div>`,
        'c' + n, 4600);
      for (let i = 0; i < n; i++) setTimeout(() => Sound.thud(i), 560 + i * 180);
    }
    bumpMain();
    spinning = false;
    syncButtons();
  }

  // ================= AUCTION / DEAL timer =================
  const timer = { running: false, mode: 'auction', start: 0, total: 50, warnAt: 5, phase: 'idle', lastSec: 0, lastHalf: 0, raf: 0 };
  const bid = { amount: 0, bidder: null, history: [] };
  const sheet = $('#sheet'), ringBar = $('#ring-bar');
  const RING_C = 2 * Math.PI * 114;

  function startTimer(mode) {
    if (timer.running || spinning) return;
    hideOverlay();
    timer.running = true;
    timer.mode = mode;
    const maxLen = S.auctionSecs;
    timer.surprise = !!S.surprise;
    timer.total = timer.surprise ? Math.round(20 + rand() * Math.max(0, maxLen - 20)) : maxLen;
    timer.start = performance.now();
    timer.phase = 'open';
    timer.lastSec = Math.ceil(timer.total);
    timer.lastHalf = Math.ceil(timer.total * 2);
    light(-1);
    body.classList.add('in-timer', 'led-pulse');
    body.classList.toggle('deal', mode === 'deal');
    body.classList.toggle('surprise', timer.surprise);
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    ringBar.classList.remove('mid', 'low');
    haptic();
    if (mode === 'deal') Sound.dealStart(); else Sound.auctionStart();
    Music.setMode('auction');
    syncButtons();
    cancelArmed = false; $('#act-cancel').classList.remove('confirm'); $('#act-cancel').textContent = 'Cancel';
    loop();
  }

  function loop() {
    if (!timer.running) return;
    const elapsed = (performance.now() - timer.start) / 1000;
    const remaining = Math.max(0, timer.total - elapsed);
    const frac = remaining / timer.total;
    ringBar.style.strokeDashoffset = String(RING_C * (1 - frac));
    if (!timer.surprise) {
      ringBar.classList.toggle('mid', remaining <= timer.total * 0.5 && remaining > timer.warnAt);
      ringBar.classList.toggle('low', remaining <= timer.warnAt);
    }
    if (timer.phase === 'open' && remaining <= timer.warnAt) {
      timer.phase = 'warn';
      body.classList.add('warn');
      Sound.warnStart();
      haptic();
      Music.setMode('warn');
    }
    const sec = Math.ceil(remaining);
    const half = Math.ceil(remaining * 2);
    if (timer.phase === 'open' && sec !== timer.lastSec) {
      timer.lastSec = sec;
      Sound.sec();
    } else if (timer.phase === 'warn' && half !== timer.lastHalf) {
      timer.lastHalf = half;
      if (remaining > 0.05) Sound.warnBeep(half % 2 === 0);
    }
    renderTimerDisplay(remaining);
    if (remaining <= 0) { finishTimer('time'); return; }
    timer.raf = requestAnimationFrame(loop);
  }

  function renderTimerDisplay(remaining) {
    const isDeal = timer.mode === 'deal';
    const warn = timer.phase === 'warn';
    const sec = Math.ceil(remaining);
    let main;
    if (timer.surprise && !warn) main = '<span class="word">OPEN</span>';
    else main = `${sec}<span class="unit-sfx">SEC</span>`;
    let sub;
    if (warn) sub = isDeal ? 'Last 5 seconds — agree now!' : 'Last 5 seconds — final bids!';
    else if (isDeal) sub = 'Make a deal before time runs out';
    else sub = 'Highest bid when the light goes out wins';
    const label = (isDeal ? 'DEAL TIMER' : 'AUCTION') + (warn ? ' · CLOSING' : timer.surprise ? ' · SURPRISE END' : isDeal ? ' · TALKS OPEN' : ' · BIDDING OPEN');
    if (D.main.innerHTML !== main) D.main.innerHTML = main;
    if (D.sub.textContent !== sub) D.sub.textContent = sub;
    if (D.label.textContent !== label) D.label.textContent = label;
    D.el.dataset.tone = warn ? 'warn' : isDeal ? 'deal' : 'auction';
  }

  function stopTimerUI() {
    timer.running = false;
    Music.setMode('normal');
    cancelAnimationFrame(timer.raf);
    body.classList.remove('in-timer', 'led-pulse', 'warn', 'surprise');
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    ringBar.style.strokeDashoffset = String(RING_C);
    syncButtons();
    // let the deal class linger until the sheet slides away
    setTimeout(() => { if (!timer.running) body.classList.remove('deal'); }, 400);
  }

  function finishTimer(reason) {
    if (!timer.running) return;
    const mode = timer.mode;
    stopTimerUI();
    haptic();
    if (reason === 'cancel') {
      Sound.cancel();
      setDisplay({ label: mode === 'deal' ? 'DEAL TIMER' : 'AUCTION', main: '<span class="word">CANCELLED</span>', sub: 'Nothing changed hands', tone: '' });
      return;
    }
    if (mode === 'deal') {
      if (reason === 'done') {
        Sound.dealDone();
        FX.confetti(['#38bdf8', '#7dd3fc', '#ffffff', '#fbbf24']);
        setDisplay({ label: 'DEAL TIMER', main: '<span class="word">DEAL!</span>', sub: 'Shake on it', tone: 'deal' });
        showOverlay(`<div class="rc-kicker">DEAL TIMER</div><div class="stamp">DEAL!</div><div class="rc-text">Agreed in time. Swap the goods.</div><div class="rc-hint">TAP TO CLOSE</div>`, 'deal', 5000);
      } else {
        Sound.buzzer();
        setDisplay({ label: 'DEAL TIMER', main: '<span class="word">TIME</span>', sub: 'No agreement, no deal', tone: 'warn' });
        showOverlay(`<div class="rc-kicker">DEAL TIMER</div><div class="stamp">TIME!</div><div class="rc-text">No agreement means <b>no deal</b></div><div class="rc-hint">TAP TO CLOSE</div>`, 'nobid', 6000);
      }
      return;
    }
    // auction: like the toy, whoever has the highest bid when the light goes out wins
    Sound.gavel();
    setTimeout(() => FX.confetti(['#4ade80', '#fbbf24', '#ffffff', '#ff6b6b']), 1000);
    setDisplay({ label: 'AUCTION', main: '<span class="word">SOLD!</span>', sub: 'Highest bid wins · pay the Banker', tone: 'sold' });
    showOverlay(`<div class="rc-kicker">AUCTION</div><div class="stamp">SOLD!</div><div class="rc-text">Highest bid wins.<br>Pay the Banker and take the District card.</div><div class="rc-hint">TAP TO CLOSE</div>`, 'sold', 0);
  }

  // ---- Sheet actions ----
  let cancelArmed = false, cancelTimer = 0;
  $('#act-cancel').addEventListener('click', (e) => {
    const b = e.currentTarget;
    if (!cancelArmed) {
      cancelArmed = true;
      b.classList.add('confirm');
      b.textContent = 'Sure?';
      Sound.click();
      clearTimeout(cancelTimer);
      cancelTimer = setTimeout(() => { cancelArmed = false; b.classList.remove('confirm'); b.textContent = 'Cancel'; }, 2200);
      return;
    }
    clearTimeout(cancelTimer);
    cancelArmed = false; b.classList.remove('confirm'); b.textContent = 'Cancel';
    finishTimer('cancel');
  });
  $('#act-end').addEventListener('click', () => finishTimer(timer.mode === 'deal' ? 'done' : 'gavel'));

  // ================= Music controls =================
  $('#btn-music').addEventListener('click', () => { Sound.click(); Music.toggle(); });
  $('#music-next').addEventListener('click', () => { Sound.click(); Music.next(); });
  const mvolEl = $('#mvol'), mvolVal = $('#mvol-val');
  mvolEl.addEventListener('input', () => { S.musicVol = Number(mvolEl.value); save(); mvolVal.textContent = Math.round(S.musicVol * 100) + '%'; Music.apply(true); });
  Music.ready.then((list) => {
    const c = $('#credits');
    c.innerHTML = list.length
      ? list.map((t) => `<li><b>${esc(t.title)}</b> — ${esc(t.composer)}${t.performer ? ', ' + esc(t.performer) : ''}${t.year ? ' (' + esc(t.year) + ')' : ''}. <a href="${esc(t.source)}" target="_blank" rel="noopener">${esc(t.license)}</a></li>`).join('')
      : '<li>No tracks found.</li>';
    $('#music-count').textContent = list.length ? `${list.length} tracks · ${Math.round(list.reduce((a, t) => a + (t.duration || 0), 0) / 60)} min, shuffled and looped` : '';
  });

  // ================= Main buttons =================
  btnBuild.addEventListener('click', doBuild);
  core.addEventListener('click', () => { if (!timer.running && !spinning) startTimer('auction'); });
  btnDeal.addEventListener('click', () => startTimer('deal'));

  // ================= Sound toggle =================
  function syncMute() { body.classList.toggle('muted', !!S.muted); Sound.applyVolume(); }
  $('#btn-sound').addEventListener('click', () => {
    S.muted = !S.muted; save(); syncMute(); Music.apply(true);
    if (!S.muted) Sound.click();
  });
  syncMute();

  // ================= Settings =================
  const settingsEl = $('#settings');
  const oddsList = $('#odds-list');
  function renderOdds() {
    const total = OUTCOMES.reduce((a, k) => a + Math.max(0, Number(S.weights[k]) || 0), 0) || 1;
    oddsList.innerHTML = OUTCOMES.map((k) => {
      const pct = Math.round((Math.max(0, Number(S.weights[k]) || 0) / total) * 100);
      const label = k === 'S' ? 'Station' : `${k} block${k === '1' ? '' : 's'}`;
      return `<div class="odds-row"><span class="odds-chip" style="background:${VALUE_COLOR[k]}" title="${label}">${k === 'S' ? TRAIN_SVG.replace('currentColor', '#0b0c12').replace(/currentColor/g, '#0b0c12') : k}</span><input type="range" min="0" max="60" step="1" value="${S.weights[k]}" data-k="${k}" aria-label="${label} weight"><span class="odds-pct">${pct}%</span></div>`;
    }).join('');
    $$('.presets button').forEach((b) => {
      const p = ODDS_PRESETS[b.dataset.preset];
      b.classList.toggle('active', OUTCOMES.every((k) => Number(S.weights[k]) === p[k]));
    });
  }
  oddsList.addEventListener('input', (e) => {
    const r = e.target.closest('input[type=range]');
    if (!r) return;
    S.weights[r.dataset.k] = Number(r.value);
    save();
    const total = OUTCOMES.reduce((a, k) => a + Math.max(0, Number(S.weights[k]) || 0), 0) || 1;
    $$('.odds-row', oddsList).forEach((row) => {
      const k = row.querySelector('input').dataset.k;
      row.querySelector('.odds-pct').textContent = Math.round((S.weights[k] / total) * 100) + '%';
    });
    $$('.presets button').forEach((b) => {
      const p = ODDS_PRESETS[b.dataset.preset];
      b.classList.toggle('active', OUTCOMES.every((k) => Number(S.weights[k]) === p[k]));
    });
  });
  $$('.presets button').forEach((b) => b.addEventListener('click', () => {
    S.weights = { ...ODDS_PRESETS[b.dataset.preset] };
    save(); renderOdds(); Sound.click();
  }));

  const lenEl = $('#len'), lenVal = $('#len-val'), surpriseEl = $('#surprise'), volEl = $('#vol'), volVal = $('#vol-val');
  function renderTimerSettings() {
    lenEl.value = S.auctionSecs;
    lenVal.textContent = S.auctionSecs + 's' + (S.auctionSecs === 50 ? ' (original)' : '');
    surpriseEl.checked = !!S.surprise;
    mvolEl.value = S.musicVol;
    mvolVal.textContent = Math.round(S.musicVol * 100) + '%';
    volEl.value = S.volume;
    volVal.textContent = Math.round(S.volume * 100) + '%';
  }
  lenEl.addEventListener('input', () => { S.auctionSecs = Number(lenEl.value); save(); renderTimerSettings(); });
  surpriseEl.addEventListener('change', () => { S.surprise = surpriseEl.checked; save(); });
  volEl.addEventListener('input', () => { S.volume = Number(volEl.value); save(); Sound.applyVolume(); renderTimerSettings(); });
  volEl.addEventListener('change', () => Sound.land('2'));
  $('#test-sound').addEventListener('click', () => { Sound.unlock(); if (S.muted) { S.muted = false; save(); syncMute(); } Sound.land('3'); });
  $('#reset').addEventListener('click', () => {
    if (!confirm('Reset odds, timer and sound to defaults?')) return;
    S = clone(DEFAULTS); save(); syncMute(); openSettings();
  });

  function openSettings() {
    if (timer.running || spinning) return;
    renderOdds(); renderTimerSettings();
    settingsEl.hidden = false;
  }
  function closeSettings() {
    settingsEl.hidden = true;
    if (document.activeElement) document.activeElement.blur();
  }
  $('#btn-settings').addEventListener('click', () => { Sound.click(); openSettings(); });
  $('#settings-done').addEventListener('click', () => { Sound.click(); closeSettings(); });
  settingsEl.addEventListener('click', (e) => { if (e.target === settingsEl) closeSettings(); });

  // ================= Install hint =================
  (() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    let dismissed = false;
    try { dismissed = localStorage.getItem('ctu-hint') === '1'; } catch (e) { /* ignore */ }
    if (isIOS && !standalone && !dismissed) $('#install-hint').hidden = false;
    $('#hint-close').addEventListener('click', () => {
      $('#install-hint').hidden = true;
      try { localStorage.setItem('ctu-hint', '1'); } catch (e) { /* ignore */ }
    });
  })();

  // ================= Boot =================
  light(-1);
  idleDisplay();
  syncButtons();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // Debug hook for testing the odds in a console
  window.__ctu = {
    sample(n = 100000) {
      const c = { 1: 0, 2: 0, 3: 0, S: 0 };
      for (let i = 0; i < n; i++) c[pickOutcome()]++;
      return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, (v / n * 100).toFixed(2) + '%']));
    },
    settings: () => S,
    sound: Sound,
    music: Music,
  };
})();
