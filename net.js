'use strict';
// Phone link: the main unit hosts a room; players scan a QR code and join from their own phones.
// Uses PeerJS (WebRTC data channels) with the free public PeerJS signalling server.
(() => {
  const C = window.CTU;
  if (!C) return;
  const { $ } = C;
  const PREFIX = 'ctu-room-';
  const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const makeCode = () => Array.from({ length: 5 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('');
  const params = new URLSearchParams(location.search);
  const joinCode = params.get('join');

  if (!window.Peer) {
    if (joinCode) {
      document.body.classList.add('player-mode');
      $('#player-app').hidden = false;
      $('#p-conn-text').textContent = "This browser can't join";
    }
    return;
  }
  if (joinCode) playerApp(joinCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
  else hostApp();

  // =====================================================================
  // HOST: the main trading unit (announces everything)
  // =====================================================================
  function hostApp() {
    let peer = null, ready = false, retryT = 0, tries = 0, emitT = 0;
    const conns = new Map(); // peer id -> { conn, device, index }
    const S = () => C.S;

    function joinUrl() {
      const path = location.pathname.replace(/index\.html$/, '');
      return `${location.origin}${path}?join=${S().roomCode}`;
    }
    function status(msg, bad) {
      const el = $('#join-status');
      if (!el) return;
      const n = conns.size;
      el.textContent = msg || (ready ? (n ? `${n} phone${n > 1 ? 's' : ''} connected` : 'Ready. Waiting for phones…') : 'Connecting…');
      el.classList.toggle('bad', !!bad);
    }
    function drawQR() {
      if (!S().roomCode) { S().roomCode = makeCode(); C.save(); }
      $('#join-code').textContent = S().roomCode;
      if (!window.qrcode) return;
      try {
        const qr = window.qrcode(0, 'M');
        qr.addData(joinUrl());
        qr.make();
        $('#join-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      } catch (e) { /* ignore */ }
    }
    function start() {
      if (peer) return;
      if (!S().roomCode) S().roomCode = makeCode();
      S().hosting = true;
      C.save();
      status('Connecting…');
      try { peer = new window.Peer(PREFIX + S().roomCode.toLowerCase()); } catch (e) { status("Phones can't connect from this browser", true); return; }
      peer.on('open', () => { ready = true; tries = 0; status(); });
      peer.on('connection', setup);
      peer.on('disconnected', () => {
        ready = false;
        status('Reconnecting…');
        setTimeout(() => { if (peer && !peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch (e) { /* ignore */ } } }, 1500);
      });
      peer.on('error', (err) => {
        const type = err && err.type;
        if (type === 'peer-unavailable') return;
        ready = false;
        status(type === 'unavailable-id' ? 'Room still closing, retrying…' : 'Connection problem, retrying…', true);
        try { peer.destroy(); } catch (e) { /* ignore */ }
        peer = null;
        clearTimeout(retryT);
        retryT = setTimeout(start, Math.min(15000, 2500 * ++tries));
      });
    }
    function setup(conn) {
      conn.on('data', (d) => onData(conn, d));
      conn.on('close', () => drop(conn));
      conn.on('error', () => drop(conn));
    }
    function drop(conn) {
      if (conns.delete(conn.peer)) refresh();
    }
    function refresh() {
      C.renderAllPlayers();
      status();
      broadcast();
    }
    const send = (conn, msg) => { try { if (conn && conn.open) conn.send(msg); } catch (e) { /* ignore */ } };

    function hello(conn, d) {
      const st = S();
      const device = String(d.device || '').slice(0, 48);
      const name = String(d.name || '').trim().slice(0, 14) || 'Player';
      if (!device) return;
      st.devices = st.devices || {};
      let i = st.devices[device];
      let isNew = false;
      if (!(i >= 0 && i < st.players.length)) {
        const owned = new Set(Object.values(st.devices));
        i = st.players.findIndex((p, k) => !owned.has(k) && p.trim().toLowerCase() === name.toLowerCase());
        if (i < 0) i = st.players.findIndex((p, k) => !owned.has(k) && /^player \d$/i.test(p.trim()));
        if (i < 0) {
          if (st.players.length >= 6) { send(conn, { t: 'full' }); setTimeout(() => conn.close(), 600); return; }
          st.players.push(name);
          i = st.players.length - 1;
        }
        st.devices[device] = i;
        isNew = true;
      }
      st.players[i] = name;
      for (const [pid, c] of conns) {
        if (c.index === i && pid !== conn.peer) { try { c.conn.close(); } catch (e) { /* ignore */ } conns.delete(pid); }
      }
      conns.set(conn.peer, { conn, device, index: i });
      C.save();
      send(conn, { t: 'welcome', index: i, hasAudio: !!C.NameRec.get(i) });
      refresh();
      if (isNew) C.Sound.coin();
    }

    function onData(conn, d) {
      if (!d || typeof d !== 'object') return;
      if (d.t === 'hello') { hello(conn, d); return; }
      const c = conns.get(conn.peer);
      if (!c) return;
      const i = c.index;
      switch (d.t) {
        case 'audio':
          if (d.data && d.data.byteLength < 2_000_000) {
            C.NameRec.setBlob(i, new Blob([d.data], { type: d.mime || 'audio/mp4' })).then((ok) => {
              if (!ok) return;
              C.renderAllPlayers();
              if (d.greet) C.Narr.say([{ player: i }, { pause: 0.2 }, '@reg_ok']);
            });
          }
          break;
        case 'bid': {
          const ok = C.sealedBid(i, d.amount);
          send(conn, { t: 'ack', kind: 'bid', ok, amount: d.amount });
          break;
        }
        case 'pass':
          C.sealedPass(i);
          send(conn, { t: 'ack', kind: 'pass', ok: true });
          break;
        case 'build': {
          const st = C.publicState();
          if (st.started && st.turn === i && !st.built && !st.timer && !st.spinning) C.doBuild();
          break;
        }
        case 'endturn': {
          const st = C.publicState();
          if (st.started && st.turn === i && !st.timer && !st.spinning) C.nextTurn();
          break;
        }
        default:
      }
    }

    function broadcast() {
      if (!conns.size) return;
      const st = C.publicState();
      for (const c of conns.values()) send(c.conn, { t: 'state', st, me: c.index });
    }
    function playerRemoved(i) {
      const dev = S().devices || {};
      for (const k of Object.keys(dev)) {
        if (dev[k] === i) delete dev[k];
        else if (dev[k] > i) dev[k]--;
      }
      for (const [pid, c] of conns) {
        if (c.index === i) { send(c.conn, { t: 'removed' }); try { c.conn.close(); } catch (e) { /* ignore */ } conns.delete(pid); }
        else if (c.index > i) c.index--;
      }
      C.save();
      status();
    }

    C.hooks.emit = () => { clearTimeout(emitT); emitT = setTimeout(broadcast, 40); };
    C.hooks.event = (e) => { for (const c of conns.values()) send(c.conn, { t: 'event', e, me: c.index }); };
    C.hooks.connectedCount = () => conns.size;
    C.hooks.isOnline = (i) => { for (const c of conns.values()) if (c.index === i) return true; return false; };
    C.hooks.playerRemoved = playerRemoved;
    C.hooks.joinOpened = () => { start(); drawQR(); status(); };
    setInterval(() => { if (C.timer.running) broadcast(); }, 1000);
    if (S().hosting) { start(); drawQR(); }
    window.__ctuNet = { conns, joinUrl, start };
  }

  // =====================================================================
  // PLAYER PHONE: join, secret bids, your turn, build
  // =====================================================================
  function playerApp(code) {
    document.body.classList.add('player-mode');
    $('#player-app').hidden = false;
    $('#p-room').textContent = code;
    const KEY = 'ctu-player';
    let me = {};
    try { me = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { me = {}; }
    if (!me.device) me.device = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const saveMe = () => { try { localStorage.setItem(KEY, JSON.stringify(me)); } catch (e) { /* ignore */ } };
    saveMe();

    let peer = null, conn = null, connected = false, retryT = 0, retries = 0;
    let st = null, myIndex = null, joined = !!(me.name && me.room === code);
    let recBlob = null, audioSentOnce = false;
    let myBid = '', submitted = null, passed = false, timerOn = false, tBase = 0, tRemain = 0, raf = 0;

    const nameEl = $('#p-name');
    nameEl.value = me.name || '';
    showJoin(!joined);

    function showJoin(on) {
      $('#p-join').hidden = !on;
      $('#p-main').hidden = on;
    }
    function setConn(state, text) {
      $('#p-conn').dataset.s = state;
      $('#p-conn-text').textContent = text || (state === 'on' ? 'Connected' : state === 'off' ? 'Offline' : 'Connecting…');
    }
    const send = (msg) => { try { if (conn && conn.open) { conn.send(msg); return true; } } catch (e) { /* ignore */ } return false; };

    function connect() {
      if (peer && !peer.destroyed) { openConn(); return; }
      setConn('connecting');
      peer = new window.Peer();
      peer.on('open', openConn);
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
      peer.on('error', (err) => {
        connected = false;
        setConn('off', err && err.type === 'peer-unavailable' ? 'Main phone not found. Is it open?' : 'Connection problem');
        if (err && err.type !== 'peer-unavailable') { try { peer.destroy(); } catch (e) { /* ignore */ } peer = null; }
        retry();
      });
    }
    function openConn() {
      if (conn && conn.open) return;
      try { if (conn) conn.close(); } catch (e) { /* ignore */ }
      conn = peer.connect(PREFIX + code.toLowerCase(), { reliable: true });
      conn.on('open', () => { connected = true; retries = 0; setConn('on'); if (joined) sendHello(); });
      conn.on('data', onData);
      conn.on('close', () => { connected = false; setConn('off', 'Reconnecting…'); retry(); });
      conn.on('error', () => { connected = false; retry(); });
    }
    function retry() {
      clearTimeout(retryT);
      retryT = setTimeout(() => {
        if (connected) return;
        if (!peer || peer.destroyed) { peer = null; connect(); } else if (peer.disconnected) { try { peer.reconnect(); } catch (e) { /* ignore */ } setTimeout(openConn, 800); } else openConn();
      }, Math.min(10000, 1500 * ++retries));
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !connected) { retries = 0; retry(); }
    });

    function sendHello() { send({ t: 'hello', device: me.device, name: me.name }); }
    async function sendAudio() {
      if (!recBlob || !connected) return;
      const data = await recBlob.arrayBuffer();
      if (send({ t: 'audio', data, mime: recBlob.type, greet: true })) audioSentOnce = true;
    }

    // ---- join card ----
    $('#p-rec').addEventListener('click', async () => {
      const btn = $('#p-rec');
      if (btn.classList.contains('live')) return;
      C.Sound.unlock();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { C.toast("This browser can't record"); return; }
      btn.classList.remove('has');
      btn.classList.add('live');
      $('#p-rec-text').textContent = 'Say your name now…';
      let got = null;
      try { got = await C.NameRec.capture(2400); } catch (e) { C.toast('Microphone blocked. Allow it and try again.'); }
      btn.classList.remove('live');
      if (!got) { $('#p-rec-text').textContent = "Didn't catch that. Tap to try again"; return; }
      recBlob = got.blob;
      btn.classList.add('has');
      $('#p-rec-text').textContent = '✓ Recorded · tap to redo';
      try {
        const ctx = C.Sound.ctx();
        const src = ctx.createBufferSource();
        src.buffer = got.buf; src.connect(ctx.destination); src.start();
      } catch (e) { /* ignore */ }
      if (joined && connected) sendAudio();
    });
    $('#p-join-btn').addEventListener('click', () => {
      const name = nameEl.value.trim().slice(0, 14);
      if (!name) { nameEl.focus(); C.toast('Type your name first'); return; }
      C.Sound.click();
      me.name = name; me.room = code; saveMe();
      joined = true;
      nameEl.blur();
      showJoin(false);
      $('#p-me-name').textContent = name;
      if (connected) { sendHello(); } else connect();
    });
    $('#p-edit').addEventListener('click', () => { C.Sound.click(); showJoin(true); });

    // ---- main card ----
    $('#p-build').addEventListener('click', () => {
      if (!send({ t: 'build' })) { C.toast('Not connected'); return; }
      C.Sound.press(); C.haptic();
      $('#p-build').disabled = true;
    });
    $('#p-end').addEventListener('click', () => {
      if (!send({ t: 'endturn' })) { C.toast('Not connected'); return; }
      C.Sound.click();
      $('#p-end').disabled = true;
    });

    // ---- secret bid keypad ----
    function bidUI(msg) {
      $('#p-bid-val').textContent = myBid || '0';
      const s = $('#p-bid-status');
      s.classList.toggle('ok', !!submitted || passed);
      s.textContent = msg || (passed ? 'You passed. Type an amount to bid after all.' : submitted ? `✓ Secret bid in: M${submitted}k. You can change it until the buzzer.` : 'Type your secret bid (in k)');
      $('#p-submit').textContent = submitted ? 'Update bid' : 'Submit secret bid';
    }
    $('#p-kp').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const k = b.dataset.k;
      if (k === 'back') myBid = myBid.slice(0, -1);
      else myBid = (myBid + k).replace(/^0+/, '').slice(0, 5);
      C.Sound.click();
      bidUI();
    });
    $('#p-submit').addEventListener('click', () => {
      const v = parseInt(myBid, 10) || 0;
      if (v < 10) { C.Sound.undo(); bidUI('Minimum bid is M10k'); return; }
      if (!send({ t: 'bid', amount: v })) { bidUI('Not connected. Try again.'); return; }
      C.Sound.coin(); C.haptic();
      bidUI('Sending…');
    });
    $('#p-pass').addEventListener('click', () => {
      if (!send({ t: 'pass' })) { bidUI('Not connected. Try again.'); return; }
      passed = true; submitted = null; myBid = '';
      C.Sound.click();
      bidUI();
    });

    // ---- messages from the main unit ----
    function onData(d) {
      if (!d || typeof d !== 'object') return;
      switch (d.t) {
        case 'welcome':
          myIndex = d.index;
          if (recBlob && !audioSentOnce) sendAudio();
          else if (!d.hasAudio && !recBlob) C.toast('Tip: tap Edit to record your name');
          break;
        case 'full':
          setConn('off', 'Game is full (6 players)');
          showJoin(true);
          joined = false;
          break;
        case 'removed':
          joined = false; me.room = null; saveMe();
          showJoin(true);
          C.toast('You were removed from the game');
          break;
        case 'state':
          st = d.st;
          myIndex = d.me;
          render();
          break;
        case 'ack':
          if (d.kind === 'bid') {
            if (d.ok) { submitted = d.amount; passed = false; bidUI(); }
            else bidUI('Bid not accepted. Bidding may have closed.');
          }
          break;
        case 'event':
          onEvent(d.e || {});
          break;
        default:
      }
    }

    function render() {
      if (!st) return;
      const p = st.players[myIndex];
      if (p) {
        $('#p-dot').style.background = p.color;
        $('#p-me-name').textContent = p.name;
      }
      const mine = st.started && st.turn === myIndex;
      const tp = st.players[st.turn];
      const t = $('#p-turn');
      t.classList.toggle('mine', !!mine);
      if (p) t.style.setProperty('--c', p.color);
      if (!st.started) t.textContent = 'Waiting for the game to start…';
      else if (mine) t.textContent = 'YOUR TURN';
      else t.textContent = `${tp ? tp.name : '—'}'s turn`;
      $('#p-build').disabled = !(mine && !st.built && !st.timer && !st.spinning);
      $('#p-build-caption').textContent = st.spinning ? 'SPINNING…' : mine && st.built ? 'BUILT THIS TURN' : 'BUILD';
      $('#p-end').disabled = !(mine && !st.timer && !st.spinning);
      $('#p-players').innerHTML = st.players.map((q, k) =>
        `<span class="${st.started && k === st.turn ? 'turn' : ''}" style="--c:${q.color}">${q.online ? '📱 ' : ''}${C.esc(q.name)}</span>`).join('');
      renderTimer();
    }

    function renderTimer() {
      const T = st.timer;
      const panel = $('#p-timer');
      if (!T) {
        panel.hidden = true;
        timerOn = false;
        cancelAnimationFrame(raf);
        return;
      }
      if (!timerOn) {
        timerOn = true;
        myBid = ''; submitted = null; passed = false;
        bidUI();
        C.Sound.auctionStart();
        C.haptic();
      }
      panel.hidden = false;
      tBase = performance.now();
      tRemain = T.remaining;
      const sealed = T.mode === 'auction' && T.sealed;
      $('#p-t-label').textContent = T.mode === 'deal' ? 'DEAL TIMER' : sealed ? 'SECRET AUCTION' : 'AUCTION';
      $('#p-bid').hidden = !sealed;
      $('#p-open').hidden = sealed;
      $('#p-open').textContent = T.mode === 'deal' ? 'Make your deal!' : 'Shout your bids!';
      panel.classList.toggle('warn', !!T.warn);
      cancelAnimationFrame(raf);
      tick();
    }
    function tick() {
      const T = st && st.timer;
      if (!T) return;
      const rem = Math.max(0, tRemain - (performance.now() - tBase) / 1000);
      $('#p-t-num').textContent = T.surprise && !T.warn ? '?' : String(Math.ceil(rem));
      $('#p-ring').style.strokeDashoffset = String(339.3 * (1 - (T.surprise ? 1 : rem / T.total)));
      raf = requestAnimationFrame(tick);
    }

    function onEvent(e) {
      const name = (i) => (st && st.players[i] ? st.players[i].name : '');
      const color = (i) => (st && st.players[i] ? st.players[i].color : '#fff');
      if (e.t === 'turn') {
        if (e.index === myIndex) {
          C.Sound.land('2'); C.haptic();
          if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
          C.toast("It's your turn!");
        }
      } else if (e.t === 'build') {
        const v = e.value;
        const who = name(e.by);
        const head = `<div class="rc-kicker">${C.esc(who ? who.toUpperCase() + "'S " : '')}BUILD PERMIT</div>`;
        const html = v === 'S'
          ? `${head}<div class="rc-train">${C.TRAIN_SVG}</div><div class="rc-text">Build a <b>STATION</b><br>No blocks this turn</div>`
          : `${head}<div class="rc-big">${v}</div><div class="rc-text">Build <b>up to ${v} block${v === '1' ? '' : 's'}</b> this turn</div>`;
        C.showOverlay(html + '<div class="rc-hint">TAP TO CLOSE</div>', v === 'S' ? 'cS' : 'c' + v, 6000);
        if (e.by === myIndex) C.Sound.land(v === 'S' ? '1' : v);
      } else if (e.t === 'reveal') {
        C.showOverlay('<div class="rc-kicker">SECRET AUCTION</div><div class="stamp">• • •</div><div class="rc-text">The envelope, please…</div>', 'sold', 0);
      } else if (e.t === 'sold') {
        if (e.winner == null) {
          C.showOverlay('<div class="rc-kicker">AUCTION</div><div class="stamp">NO BIDS</div><div class="rc-text">The district stays with the bank</div><div class="rc-hint">TAP TO CLOSE</div>', 'nobid', 6000);
          return;
        }
        const mine = e.winner === myIndex;
        let list = '';
        if (Array.isArray(e.bids)) {
          const rows = e.bids.slice().sort((a, b) => (b.amount || -1) - (a.amount || -1));
          list = '<ul class="bid-list">' + rows.map((r, k) =>
            `<li style="--c:${color(r.i)};animation-delay:${0.3 + k * 0.15}s"><span class="dot"></span><span class="nm">${C.esc(name(r.i))}${r.i === myIndex ? ' (you)' : ''}</span><b>${r.amount ? C.fmt(r.amount) : r.pass ? 'pass' : '—'}</b></li>`).join('') + '</ul>';
        }
        C.showOverlay(`<div class="rc-kicker">${mine ? 'YOU WON!' : 'SOLD'}</div><div class="stamp">SOLD!</div><div class="rc-who" style="--who:${color(e.winner)}">${C.esc(name(e.winner))}</div><div class="rc-amt">${C.fmt(e.amount)}</div>${list}<div class="rc-hint">TAP TO CLOSE</div>`, 'sold', 0);
        if (mine) { C.Sound.dealDone(); C.FX.confetti(['#4ade80', '#fbbf24', '#ffffff', color(e.winner)]); }
      } else if (e.t === 'deal') {
        C.toast(e.ok ? 'Deal done!' : "Time's up. No deal.");
      } else if (e.t === 'cancel') {
        C.toast(e.mode === 'deal' ? 'Deal cancelled' : 'Auction cancelled');
      }
    }

    if (joined) $('#p-me-name').textContent = me.name;
    connect();
    window.__ctuPlayer = { get st() { return st; }, get me() { return myIndex; }, send };
  }
})();
