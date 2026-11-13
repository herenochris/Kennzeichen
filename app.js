(() => {
  'use strict';

  // ---------- Konstanten ----------
  const DAILY_ROUNDS = 5;
  const MAX_POINTS = 1000;
  const ENDLESS_FAIL_KM = 200;
  const EPOCH = '2026-11-13'; // Rätsel #1
  const LETTERS = 'ABCDEFGHIJKLMNOPRSTUVWXYZ'; // ohne Q (wie üblich selten)

  // ---------- Hilfsfunktionen ----------
  const $ = (id) => document.getElementById(id);

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignorieren */ }
    },
  };

  function berlinDate(d = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
  function dayIndex(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [ey, em, ed] = EPOCH.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ey, em - 1, ed)) / 86400000);
  }
  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function haversineKm(a, b) {
    const R = 6371, toRad = (x) => x * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function pointsFor(km, hinted) {
    const p = km < 5 ? MAX_POINTS : Math.round(MAX_POINTS * Math.exp(-(km - 5) / 120));
    return hinted ? Math.round(p / 2) : p;
  }
  function fmtKm(km) { return km < 10 ? km.toFixed(1).replace('.', ',') + ' km' : Math.round(km).toLocaleString('de-DE') + ' km'; }
  function fmtNum(n) { return Math.round(n).toLocaleString('de-DE'); }
  function quality(km) { return km <= 40 ? 'good' : km <= 120 ? 'mid' : 'bad'; }
  function emoji(km) { return km <= 15 ? '🎯' : km <= 40 ? '🟩' : km <= 120 ? '🟨' : km <= 250 ? '🟧' : '🟥'; }

  // Zufälliger Rest des Kennzeichens (max. 8 Zeichen insgesamt)
  function plateRest(code, rnd) {
    const nLetters = code.length === 3 ? 1 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 2);
    let letters = '';
    for (let i = 0; i < nLetters; i++) letters += LETTERS[Math.floor(rnd() * LETTERS.length)];
    const maxDigits = Math.min(4, 8 - code.length - nLetters);
    const nDigits = 1 + Math.floor(rnd() * maxDigits);
    let digits = String(1 + Math.floor(rnd() * 9));
    for (let i = 1; i < nDigits; i++) digits += Math.floor(rnd() * 10);
    return letters + ' ' + digits;
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ---------- EU-Sterne ----------
  (() => {
    const g = $('stars');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', (10 + Math.sin(a) * 7).toFixed(2));
      c.setAttribute('cy', (10 - Math.cos(a) * 7).toFixed(2));
      c.setAttribute('r', '1.25');
      g.appendChild(c);
    }
  })();

  // ---------- Karte ----------
  const GERMANY_BOUNDS = L.latLngBounds([47.2, 5.8], [55.1, 15.1]);
  const map = L.map('map', {
    zoomSnap: 0.25,
    minZoom: 5,
    maxZoom: 11,
    maxBounds: GERMANY_BOUNDS.pad(0.35),
    maxBoundsViscosity: 0.8,
    attributionControl: true,
    zoomControl: true,
  });
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Umrisse: <a href="https://github.com/isellsoap/deutschlandGeoJSON" target="_blank" rel="noopener">deutschlandGeoJSON</a>, Orte: GeoNames');

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function stateStyle() {
    return { color: css('--land-line'), weight: 1.2, fillColor: css('--land'), fillOpacity: 1 };
  }
  const statesLayer = L.geoJSON(GERMANY, { style: stateStyle, interactive: false }).addTo(map);
  const stateLayers = {};
  statesLayer.eachLayer((l) => { stateLayers[l.feature.properties.name] = l; });

  function fitGermany() { map.fitBounds(GERMANY_BOUNDS, { padding: [10, 10] }); }
  fitGermany();
  window.addEventListener('resize', () => { map.invalidateSize(); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    statesLayer.setStyle(stateStyle());
    if (game.hintState) highlightState(game.hintState);
  });

  const overlay = L.layerGroup().addTo(map);
  let guessMarker = null;

  function clearOverlay() {
    overlay.clearLayers();
    guessMarker = null;
    statesLayer.setStyle(stateStyle());
  }
  function highlightState(name) {
    const l = stateLayers[name];
    if (l) l.setStyle({ fillColor: css('--land-hint'), color: css('--mid'), weight: 2 });
  }
  function placeGuess(latlng) {
    if (guessMarker) guessMarker.setLatLng(latlng);
    else {
      guessMarker = L.circleMarker(latlng, {
        radius: 8, color: '#fff', weight: 3, fillColor: css('--accent'), fillOpacity: 1,
      }).addTo(overlay);
    }
  }

  // ---------- Spielzustand ----------
  const game = {
    mode: 'daily',
    plate: null,      // aktuelles Datenobjekt
    rest: '',
    guess: null,      // {lat, lon}
    answered: false,
    hintState: null,
    // Tägliches
    dailyDate: null,
    dailyList: [],
    dailyRests: [],
    daily: null,      // gespeicherter Fortschritt
    // Endlos
    run: null,
  };

  // ---------- Tägliches Rätsel ----------
  function dailyPicks(dateStr) {
    const rnd = mulberry32(hashString('kz-' + dateStr));
    const pool = PLATES.map((_, i) => i);
    const picks = [];
    const usedStates = new Set();
    // 5 Kennzeichen, möglichst aus verschiedenen Bundesländern, überwiegend aktuelle Kürzel
    while (picks.length < DAILY_ROUNDS) {
      const idx = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const p = PLATES[idx];
      const wantMain = picks.length < 3;
      if (wantMain && !p.m) continue;
      if (usedStates.has(p.s) && pool.length > 50) continue;
      usedStates.add(p.s);
      picks.push(idx);
    }
    const rests = picks.map((i) => plateRest(PLATES[i].c, rnd));
    return { picks, rests };
  }

  function loadDaily() {
    const date = berlinDate();
    const { picks, rests } = dailyPicks(date);
    game.dailyDate = date;
    game.dailyList = picks;
    game.dailyRests = rests;
    game.daily = store.get('kz-daily-' + date, { guesses: [] });
  }

  function startDaily() {
    if (game.dailyDate !== berlinDate()) loadDaily();
    const n = game.daily.guesses.length;
    if (n >= DAILY_ROUNDS) {
      showDailyReview();
      showSummary();
      return;
    }
    setupRound(PLATES[game.dailyList[n]], game.dailyRests[n]);
  }

  function dailyTotal() { return game.daily.guesses.reduce((s, g) => s + g.pts, 0); }

  function showDailyReview() {
    // Alle Tipps des Tages auf der Karte zeigen
    clearOverlay();
    const bounds = [];
    game.daily.guesses.forEach((g, i) => {
      const p = PLATES[game.dailyList[i]];
      drawResult({ lat: g.lat, lon: g.lon }, p, false);
      bounds.push([g.lat, g.lon], [p.lat, p.lon]);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 7 });
    const last = PLATES[game.dailyList[DAILY_ROUNDS - 1]];
    renderPlate(last.c, game.dailyRests[DAILY_ROUNDS - 1], false);
    $('round-label').textContent = 'Rätsel #' + (dayIndex(game.dailyDate) + 1) + ' – fertig';
    $('score-label').textContent = fmtNum(dailyTotal()) + ' Punkte';
    $('prompt').className = 'prompt';
    $('prompt').innerHTML = 'Du hast das heutige Rätsel gelöst. Morgen gibt es neue Kennzeichen – oder spiel weiter im <b>Endlos-Modus</b>.';
    $('actions-guess').hidden = true;
    $('result').hidden = false;
    $('result-points').innerHTML = fmtNum(dailyTotal()) + ' <small>/ ' + fmtNum(DAILY_ROUNDS * MAX_POINTS) + '</small>';
    $('result-dist').textContent = '';
    $('result-origin').textContent = '';
    $('next-btn').textContent = 'Ergebnis anzeigen';
  }

  function updateStatsAfterDaily() {
    const st = store.get('kz-stats', { played: 0, streak: 0, maxStreak: 0, last: null, best: 0 });
    if (st.last === game.dailyDate) return st;
    const yesterday = dayIndex(game.dailyDate) - 1;
    st.streak = st.last && dayIndex(st.last) === yesterday ? st.streak + 1 : 1;
    st.maxStreak = Math.max(st.maxStreak, st.streak);
    st.played += 1;
    st.best = Math.max(st.best, dailyTotal());
    st.last = game.dailyDate;
    store.set('kz-stats', st);
    return st;
  }

  function showSummary() {
    const st = updateStatsAfterDaily();
    const num = dayIndex(game.dailyDate) + 1;
    $('sum-title').textContent = 'Kennzeichen-Rätsel #' + num;
    $('sum-total').textContent = fmtNum(dailyTotal());
    $('sum-max').textContent = fmtNum(DAILY_ROUNDS * MAX_POINTS);
    const list = $('sum-list');
    list.innerHTML = '';
    game.daily.guesses.forEach((g, i) => {
      const p = PLATES[game.dailyList[i]];
      const li = document.createElement('li');
      li.innerHTML =
        '<span class="mini-plate"></span>' +
        '<span><span class="o"></span><br><span class="sub"></span></span>' +
        '<span class="pts"></span>';
      li.querySelector('.mini-plate').textContent = p.c;
      li.querySelector('.o').textContent = p.o;
      li.querySelector('.sub').textContent = emoji(g.km) + ' ' + fmtKm(g.km) + (g.hint ? ' · mit Hinweis' : '');
      li.querySelector('.pts').textContent = fmtNum(g.pts);
      list.appendChild(li);
    });
    $('st-played').textContent = st.played;
    $('st-streak').textContent = st.streak;
    $('st-maxstreak').textContent = st.maxStreak;
    $('st-best').textContent = fmtNum(st.best);
    tickCountdown();
    if (!$('summary').open) $('summary').showModal();
  }

  function shareText() {
    const num = dayIndex(game.dailyDate) + 1;
    const line = game.daily.guesses.map((g) => emoji(g.km)).join('');
    return 'Kennzeichen-Rätsel #' + num + ' 🇩🇪\n' + line + '  ' + fmtNum(dailyTotal()) + '/' + fmtNum(DAILY_ROUNDS * MAX_POINTS) + '\n' + location.href.split('#')[0];
  }

  function tickCountdown() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const get = (t) => Number(parts.find((x) => x.type === t).value);
    let left = 86400 - (get('hour') * 3600 + get('minute') * 60 + get('second'));
    const h = Math.floor(left / 3600); left %= 3600;
    const m = Math.floor(left / 60), s = left % 60;
    $('countdown').textContent = [h, m, s].map((x) => String(x).padStart(2, '0')).join(':');
  }
  setInterval(() => {
    if ($('summary').open) tickCountdown();
    // Tageswechsel während das Spiel offen ist
    if (game.mode === 'daily' && game.dailyDate && game.dailyDate !== berlinDate() && !$('summary').open && game.answered) {
      loadDaily();
    }
  }, 1000);

  // ---------- Endlos ----------
  function endlessPool() {
    return $('hard-toggle').checked ? PLATES : PLATES.filter((p) => p.m);
  }
  function newRun() {
    game.run = { rounds: 0, points: 0, kmSum: 0, over: false, recent: [] };
  }
  function nextEndless() {
    if (!game.run || game.run.over) newRun();
    const pool = endlessPool();
    let p;
    do { p = pool[Math.floor(Math.random() * pool.length)]; } while (game.run.recent.includes(p.c) && pool.length > 30);
    game.run.recent.push(p.c);
    if (game.run.recent.length > 30) game.run.recent.shift();
    setupRound(p, plateRest(p.c, Math.random));
  }
  function renderEndlessStats() {
    const r = game.run;
    $('es-rounds').textContent = r ? r.rounds : 0;
    $('es-avg').textContent = r && r.rounds ? fmtKm(r.kmSum / r.rounds) : '–';
    $('es-best').textContent = fmtNum(store.get('kz-endless-best', 0));
  }

  // ---------- Runde ----------
  function renderPlate(code, rest, animate = true) {
    $('plate-code').textContent = code;
    $('plate-rest').textContent = rest;
    fitPlate();
    const el = $('plate');
    if (animate) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }

  function fitPlate() {
    const box = document.querySelector('.plate-text');
    box.style.fontSize = '';
    let size = parseFloat(getComputedStyle(box).fontSize);
    while (box.scrollWidth > box.clientWidth && size > 18) {
      size -= 2;
      box.style.fontSize = size + 'px';
    }
  }
  window.addEventListener('resize', fitPlate);

  function setupRound(plate, rest) {
    game.plate = plate;
    game.rest = rest;
    game.guess = null;
    game.answered = false;
    game.hintState = null;
    clearOverlay();
    fitGermany();
    renderPlate(plate.c, rest);
    $('prompt').className = 'prompt';
    $('prompt').textContent = 'Woher kommt dieses Kennzeichen? Tippe auf die Karte.';
    $('actions-guess').hidden = false;
    $('guess-btn').disabled = true;
    $('hint-btn').disabled = false;
    $('result').hidden = true;
    if (game.mode === 'daily') {
      const n = game.daily.guesses.length;
      $('round-label').textContent = 'Rätsel #' + (dayIndex(game.dailyDate) + 1) + ' · Runde ' + (n + 1) + ' / ' + DAILY_ROUNDS;
      $('score-label').textContent = fmtNum(dailyTotal()) + ' Punkte';
    } else {
      $('round-label').textContent = 'Endlos · Runde ' + (game.run.rounds + 1);
      $('score-label').textContent = fmtNum(game.run.points) + ' Punkte';
      renderEndlessStats();
    }
  }

  function useHint() {
    if (game.answered || game.hintState) return;
    game.hintState = game.plate.s;
    highlightState(game.plate.s);
    $('hint-btn').disabled = true;
    $('prompt').className = 'prompt hint';
    $('prompt').innerHTML = 'Hinweis: Das Kennzeichen kommt aus <b></b>.';
    $('prompt').querySelector('b').textContent = game.plate.s;
    const l = stateLayers[game.plate.s];
    if (l) map.fitBounds(l.getBounds(), { padding: [30, 30], maxZoom: 8 });
  }

  function drawResult(guess, plate, animate) {
    const g = [guess.lat, guess.lon], t = [plate.lat, plate.lon];
    L.polyline([g, t], { color: css('--text'), weight: 2, dashArray: '6 6', opacity: 0.7 }).addTo(overlay);
    L.circleMarker(g, { radius: 7, color: '#fff', weight: 3, fillColor: css('--accent'), fillOpacity: 1 }).addTo(overlay);
    const tm = L.circleMarker(t, { radius: 9, color: '#fff', weight: 3, fillColor: '#d62828', fillOpacity: 1 }).addTo(overlay);
    tm.bindTooltip(plate.c + ' · ' + plate.o, { permanent: true, direction: 'top', offset: [0, -8], className: 'target-label' });
    if (animate) map.flyToBounds(L.latLngBounds([g, t]), { padding: [60, 60], maxZoom: 8, duration: 0.6 });
  }

  function submitGuess() {
    if (!game.guess || game.answered) return;
    game.answered = true;
    const p = game.plate;
    const km = haversineKm(game.guess, p);
    const hinted = !!game.hintState;
    const pts = pointsFor(km, hinted);

    clearOverlay();
    if (hinted) highlightState(p.s);
    drawResult(game.guess, p, true);

    $('actions-guess').hidden = true;
    $('result').hidden = false;
    $('result-points').innerHTML = '+' + fmtNum(pts) + ' <small>Punkte' + (hinted ? ' (Hinweis)' : '') + '</small>';
    const dist = $('result-dist');
    dist.className = 'result-dist c-' + quality(km);
    dist.textContent = emoji(km) + ' ' + fmtKm(km) + ' daneben';
    const origin = $('result-origin');
    origin.innerHTML = '<b></b> – <span class="o"></span><br><span class="k"></span>';
    origin.querySelector('b').textContent = p.c;
    origin.querySelector('.o').textContent = p.o;
    origin.querySelector('.k').textContent = (p.k && p.k !== p.o ? p.k + ', ' : '') + p.s + (p.m ? '' : ' · Alt-Kennzeichen');
    $('prompt').className = 'prompt';
    $('prompt').textContent = '';

    if (game.mode === 'daily') {
      game.daily.guesses.push({ lat: +game.guess.lat.toFixed(4), lon: +game.guess.lon.toFixed(4), km: +km.toFixed(1), pts, hint: hinted });
      store.set('kz-daily-' + game.dailyDate, game.daily);
      $('score-label').textContent = fmtNum(dailyTotal()) + ' Punkte';
      const done = game.daily.guesses.length >= DAILY_ROUNDS;
      $('next-btn').textContent = done ? 'Ergebnis anzeigen' : 'Nächstes Kennzeichen';
    } else {
      const r = game.run;
      r.rounds += 1; r.points += pts; r.kmSum += km;
      if (r.points > store.get('kz-endless-best', 0)) store.set('kz-endless-best', r.points);
      $('score-label').textContent = fmtNum(r.points) + ' Punkte';
      if (km > ENDLESS_FAIL_KM) {
        r.over = true;
        $('prompt').className = 'prompt hint';
        $('prompt').innerHTML = 'Mehr als ' + ENDLESS_FAIL_KM + ' km daneben – <b>Lauf beendet</b> nach ' + r.rounds + ' Runde' + (r.rounds === 1 ? '' : 'n') + ' mit ' + fmtNum(r.points) + ' Punkten.';
        $('next-btn').textContent = 'Neuer Lauf';
      } else {
        $('next-btn').textContent = 'Nächstes Kennzeichen';
      }
      renderEndlessStats();
    }
    $('next-btn').focus({ preventScroll: true });
  }

  function next() {
    if (game.mode === 'daily') {
      if (game.daily.guesses.length >= DAILY_ROUNDS) { showDailyReview(); showSummary(); }
      else startDaily();
    } else {
      nextEndless();
    }
  }

  // ---------- Moduswechsel ----------
  function setMode(mode) {
    game.mode = mode;
    $('tab-daily').setAttribute('aria-selected', String(mode === 'daily'));
    $('tab-endless').setAttribute('aria-selected', String(mode === 'endless'));
    $('endless-stats').hidden = mode !== 'endless';
    $('hard-wrap').hidden = mode !== 'endless';
    try { history.replaceState(null, '', mode === 'endless' ? '#endlos' : '#'); } catch { /* egal */ }
    if (mode === 'daily') startDaily();
    else { if (!game.run || game.run.over) newRun(); nextEndless(); }
  }

  // ---------- Events ----------
  map.on('click', (e) => {
    if (game.answered) return;
    if (game.mode === 'daily' && game.daily.guesses.length >= DAILY_ROUNDS) return;
    game.guess = { lat: e.latlng.lat, lon: e.latlng.lng };
    placeGuess(e.latlng);
    $('guess-btn').disabled = false;
  });
  $('guess-btn').addEventListener('click', submitGuess);
  $('hint-btn').addEventListener('click', useHint);
  $('next-btn').addEventListener('click', next);
  $('restart-btn').addEventListener('click', () => { newRun(); nextEndless(); });
  $('hard-toggle').addEventListener('change', () => {
    store.set('kz-hard', $('hard-toggle').checked);
    if (game.mode === 'endless' && !game.answered && game.run && game.run.rounds === 0) nextEndless();
  });
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.mode !== game.mode) setMode(b.dataset.mode);
  }));
  $('help-btn').addEventListener('click', () => $('help').showModal());
  $('share-btn').addEventListener('click', async () => {
    const text = shareText();
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toast('Ergebnis kopiert!');
    } catch {
      toast('Kopieren nicht möglich');
    }
  });
  $('to-endless-btn').addEventListener('click', () => { $('summary').close(); setMode('endless'); });
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Enter') {
      if (!game.answered && game.guess) submitGuess();
      else if (game.answered) next();
    }
  });

  // ---------- Start ----------
  $('hard-toggle').checked = store.get('kz-hard', true);
  loadDaily();
  if (!store.get('kz-seen-help', false)) { store.set('kz-seen-help', true); $('help').showModal(); }
  setMode(location.hash === '#endlos' ? 'endless' : 'daily');
})();
