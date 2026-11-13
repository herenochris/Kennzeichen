(() => {
  'use strict';

  // ---------- Konstanten ----------
  const DAILY_ROUNDS = 5;
  const MAX_POINTS = 1000;
  const ENDLESS_FAIL_KM = 200;
  const EPOCH = '2026-11-13'; // Rätsel #1
  const DAILY_V2_FROM = '2026-11-14'; // ab hier steigt die Schwierigkeit pro Runde
  const LETTERS = 'ABCDEFGHIJKLMNOPRSTUVWXYZ';

  // Schwierigkeit = Rang nach geschätzter Fahrzeugzahl (1 = am häufigsten)
  const LEVELS = {
    leicht: { name: 'Leicht', from: 1, to: 100, desc: 'Die 100 häufigsten Kennzeichen – Großstädte und große Kreise wie B, M, HH, K.' },
    mittel: { name: 'Mittel', from: 101, to: 280, desc: 'Mittelgroße Kreise und Städte, z. B. GT, VS, BAD, OL.' },
    schwer: { name: 'Schwer', from: 281, to: 450, desc: 'Kleinere Kreise und bekanntere Alt-Kennzeichen, z. B. KU, NDH, WAN.' },
    profi:  { name: 'Profi',  from: 451, to: 9999, desc: 'Die seltensten Kennzeichen – fast nur Alt-Kennzeichen wie BÜD, HDL, WOS.' },
  };
  // Tagesrätsel: jede Runde etwas seltener
  const DAILY_BANDS = [[1, 80], [81, 180], [181, 300], [301, 450], [451, 9999]];

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
  function levelOf(p) {
    for (const [key, l] of Object.entries(LEVELS)) if (p.r >= l.from && p.r <= l.to) return key;
    return 'profi';
  }
  const byCode = Object.fromEntries(PLATES.map((p) => [p.c, p]));

  // Zufälliger Rest des Kennzeichens (max. 8 Zeichen insgesamt)
  function plateRest(code, rnd) {
    const nLetters = 1 + Math.floor(rnd() * 2);
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
  window.addEventListener('resize', fitPlate);
  new ResizeObserver(() => map.invalidateSize()).observe($('map'));

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
  // Kartenausschnitt so wählen, dass das Ergebnis-Popup nichts verdeckt
  function fitWithSheet(bounds, maxZoom) {
    const mapRect = $('map').getBoundingClientRect();
    const sheet = $('result');
    let bottom = 40;
    if (!sheet.hidden) {
      const r = sheet.getBoundingClientRect();
      bottom = Math.max(40, mapRect.bottom - r.top + 24);
    }
    if (bottom > mapRect.height - 80) bottom = Math.max(40, mapRect.height - 80);
    map.flyToBounds(bounds, { paddingTopLeft: [50, 50], paddingBottomRight: [50, bottom], maxZoom, duration: 0.6 });
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    statesLayer.setStyle(stateStyle());
    if (game.hintState) highlightState(game.hintState);
  });

  // ---------- Spielzustand ----------
  const game = {
    mode: 'daily',
    plate: null,
    rest: '',
    guess: null,
    answered: false,
    hintState: null,
    dailyDate: null,
    dailyList: [],
    dailyRests: [],
    daily: null,
    level: 'leicht',
    run: null,
  };

  // ---------- Tägliches Rätsel ----------
  function dailyPicksV1(dateStr) {
    const rnd = mulberry32(hashString('kz-' + dateStr));
    const pool = PLATES.map((_, i) => i);
    const picks = [];
    const usedStates = new Set();
    while (picks.length < DAILY_ROUNDS) {
      const idx = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const p = PLATES[idx];
      if (picks.length < 3 && !p.m) continue;
      if (usedStates.has(p.s) && pool.length > 50) continue;
      usedStates.add(p.s);
      picks.push(idx);
    }
    return { picks, rnd };
  }
  function dailyPicksV2(dateStr) {
    const rnd = mulberry32(hashString('kz2-' + dateStr));
    const picks = [];
    const usedStates = new Set();
    DAILY_BANDS.forEach(([from, to]) => {
      const band = PLATES.map((p, i) => i).filter((i) => PLATES[i].r >= from && PLATES[i].r <= to);
      let idx, tries = 0;
      do { idx = band[Math.floor(rnd() * band.length)]; tries++; }
      while ((usedStates.has(PLATES[idx].s) || picks.includes(idx)) && tries < 50);
      usedStates.add(PLATES[idx].s);
      picks.push(idx);
    });
    return { picks, rnd };
  }

  function loadDaily() {
    const date = berlinDate();
    const { picks, rnd } = date >= DAILY_V2_FROM ? dailyPicksV2(date) : dailyPicksV1(date);
    game.dailyDate = date;
    game.dailyList = picks;
    game.dailyRests = picks.map((i) => plateRest(PLATES[i].c, rnd));
    game.daily = store.get('kz-daily-' + date, { guesses: [] });
  }
  const dailyPlate = (i) => PLATES[game.dailyList[i]];
  function dailyTotal() { return game.daily.guesses.reduce((s, g) => s + g.pts, 0); }
  const dailyDone = () => game.daily.guesses.length >= DAILY_ROUNDS;

  function startDaily() {
    if (game.dailyDate !== berlinDate()) loadDaily();
    const n = game.daily.guesses.length;
    if (n >= DAILY_ROUNDS) {
      showDailyReview();
      showSummary();
      return;
    }
    setupRound(dailyPlate(n), game.dailyRests[n]);
  }

  function showDailyReview() {
    hideSheet();
    clearOverlay();
    const pts = [];
    game.daily.guesses.forEach((g, i) => {
      const p = dailyPlate(i);
      drawResult({ lat: g.lat, lon: g.lon }, p);
      pts.push([g.lat, g.lon], [p.lat, p.lon]);
    });
    if (pts.length) fitWithSheet(L.latLngBounds(pts), 7);
    renderPlate(dailyPlate(DAILY_ROUNDS - 1).c, game.dailyRests[DAILY_ROUNDS - 1], false);
    game.answered = true;
    $('round-label').textContent = 'Rätsel #' + (dayIndex(game.dailyDate) + 1) + ' – fertig';
    $('score-label').textContent = fmtNum(dailyTotal()) + ' Punkte';
    $('prompt').className = 'prompt';
    $('prompt').innerHTML = 'Du hast das heutige Rätsel gelöst (<b></b> Punkte). Morgen gibt es neue Kennzeichen – oder spiel weiter im <b>freien Modus</b>.';
    $('prompt').querySelector('b').textContent = fmtNum(dailyTotal());
    $('hint-btn').hidden = true;
    $('guess-btn').hidden = true;
    $('review-btn').hidden = false;
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
      const p = dailyPlate(i);
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
    document.querySelectorAll('.pick').forEach((b) => b.classList.toggle('current', b.dataset.level === game.level));
    tickCountdown();
    if (!$('summary').open) $('summary').showModal();
  }

  function shareText() {
    const num = dayIndex(game.dailyDate) + 1;
    const line = game.daily.guesses.map((g) => emoji(g.km)).join('');
    return 'Kennzeichen-Rätsel #' + num + ' 🇩🇪\n' + line + '  ' + fmtNum(dailyTotal()) + '/' + fmtNum(DAILY_ROUNDS * MAX_POINTS) + '\n' + location.href.split('#')[0];
  }

  function tickCountdown() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const get = (t) => Number(parts.find((x) => x.type === t).value);
    let left = 86400 - (get('hour') * 3600 + get('minute') * 60 + get('second'));
    const h = Math.floor(left / 3600); left %= 3600;
    const m = Math.floor(left / 60), s = left % 60;
    $('countdown').textContent = [h, m, s].map((x) => String(x).padStart(2, '0')).join(':');
  }
  setInterval(() => {
    if ($('summary').open) tickCountdown();
    if (game.dailyDate && game.dailyDate !== berlinDate() && !$('summary').open && game.answered && $('result').hidden) {
      loadDaily();
      setMode('daily');
    }
  }, 1000);

  // ---------- Endlos ----------
  function endlessPool() {
    const l = LEVELS[game.level];
    return PLATES.filter((p) => p.r >= l.from && p.r <= l.to);
  }
  const bestKey = () => 'kz-endless-best-' + game.level;
  function newRun() {
    // zuletzt gesehene Kennzeichen über Läufe hinweg merken, damit sich nichts sofort wiederholt
    const recent = game.run && game.runLevel === game.level ? game.run.recent : [];
    game.runLevel = game.level;
    game.run = { rounds: 0, points: 0, kmSum: 0, over: false, recent };
  }
  function nextEndless() {
    if (!game.run || game.run.over) newRun();
    const pool = endlessPool();
    const keep = Math.min(40, Math.floor(pool.length / 2));
    let p;
    do { p = pool[Math.floor(Math.random() * pool.length)]; } while (game.run.recent.includes(p.c));
    game.run.recent.push(p.c);
    while (game.run.recent.length > keep) game.run.recent.shift();
    setupRound(p, plateRest(p.c, Math.random));
  }
  function renderEndlessStats() {
    const r = game.run;
    $('es-rounds').textContent = r ? r.rounds : 0;
    $('es-avg').textContent = r && r.rounds ? fmtKm(r.kmSum / r.rounds) : '–';
    $('es-best').textContent = fmtNum(store.get(bestKey(), 0));
  }
  function renderLevels() {
    document.querySelectorAll('.level').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === game.level)));
    $('level-desc').textContent = LEVELS[game.level].desc;
  }
  function setLevel(level) {
    if (!LEVELS[level]) return;
    game.level = level;
    store.set('kz-level', level);
    renderLevels();
    if (game.mode === 'endless') { newRun(); nextEndless(); }
  }

  // ---------- Runde ----------
  function fitPlate() {
    const box = document.querySelector('.plate-text');
    box.style.fontSize = '';
    let size = parseFloat(getComputedStyle(box).fontSize);
    while (box.scrollWidth > box.clientWidth && size > 18) {
      size -= 2;
      box.style.fontSize = size + 'px';
    }
  }
  function renderPlate(code, rest, animate = true) {
    $('plate-code').textContent = code;
    $('plate-rest').textContent = rest;
    fitPlate();
    const el = $('plate');
    if (animate) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }

  function hideSheet() { $('result').hidden = true; document.body.classList.remove('answered'); map.invalidateSize(); }

  function setupRound(plate, rest) {
    game.plate = plate;
    game.rest = rest;
    game.guess = null;
    game.answered = false;
    game.hintState = null;
    hideSheet();
    clearOverlay();
    fitGermany();
    renderPlate(plate.c, rest);
    $('prompt').className = 'prompt';
    $('prompt').textContent = 'Woher kommt dieses Kennzeichen? Tippe auf die Karte.';
    $('hint-btn').hidden = false;
    $('guess-btn').hidden = false;
    $('review-btn').hidden = true;
    $('guess-btn').disabled = true;
    $('hint-btn').disabled = false;
    if (game.mode === 'daily') {
      const n = game.daily.guesses.length;
      $('round-label').textContent = 'Rätsel #' + (dayIndex(game.dailyDate) + 1) + ' · Runde ' + (n + 1) + ' / ' + DAILY_ROUNDS;
      $('score-label').textContent = fmtNum(dailyTotal()) + ' Punkte';
    } else {
      $('round-label').textContent = 'Frei · ' + LEVELS[game.level].name + ' · Runde ' + (game.run.rounds + 1);
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
    if (l) map.flyToBounds(l.getBounds(), { padding: [30, 30], maxZoom: 8, duration: 0.5 });
  }

  function drawResult(guess, plate) {
    const g = [guess.lat, guess.lon], t = [plate.lat, plate.lon];
    L.polyline([g, t], { color: css('--text'), weight: 2, dashArray: '6 6', opacity: 0.7 }).addTo(overlay);
    L.circleMarker(g, { radius: 7, color: '#fff', weight: 3, fillColor: css('--accent'), fillOpacity: 1 }).addTo(overlay);
    const tm = L.circleMarker(t, { radius: 9, color: '#fff', weight: 3, fillColor: '#d62828', fillOpacity: 1 }).addTo(overlay);
    tm.bindTooltip(plate.c + ' · ' + plate.o, { permanent: true, direction: 'top', offset: [0, -8], className: 'target-label' });
  }

  const LEVEL_TAG = { leicht: 'häufig', mittel: 'mittel', schwer: 'selten', profi: 'sehr selten' };

  function submitGuess() {
    if (!game.guess || game.answered) return;
    game.answered = true;
    const p = game.plate;
    const km = haversineKm(game.guess, p);
    const hinted = !!game.hintState;
    const pts = pointsFor(km, hinted);

    clearOverlay();
    if (hinted) highlightState(p.s);
    drawResult(game.guess, p);

    // Popup füllen
    $('result-points').innerHTML = '+' + fmtNum(pts) + ' <small>Punkte' + (hinted ? ' (Hinweis)' : '') + '</small>';
    const dist = $('result-dist');
    dist.className = 'result-dist c-' + quality(km);
    dist.textContent = emoji(km) + ' ' + fmtKm(km) + ' daneben';
    const origin = $('result-origin');
    origin.innerHTML = '<b></b> – <span class="o"></span><br><span class="k"></span>';
    origin.querySelector('b').textContent = p.c;
    origin.querySelector('.o').textContent = p.o;
    origin.querySelector('.k').textContent = (p.k && p.k !== p.o ? p.k + ', ' : '') + p.s;
    const tags = $('result-tags');
    tags.innerHTML = '';
    const addTag = (text, cls) => { const s = document.createElement('span'); s.className = 'tag ' + (cls || ''); s.textContent = text; tags.appendChild(s); };
    addTag(LEVEL_TAG[levelOf(p)], 'tag-' + levelOf(p));
    if (!p.m) addTag('Alt-Kennzeichen');
    const note = $('result-note');
    note.hidden = true;
    $('prompt').className = 'prompt';
    $('prompt').textContent = 'Auflösung siehe unten.';

    if (game.mode === 'daily') {
      game.daily.guesses.push({ c: p.c, lat: +game.guess.lat.toFixed(4), lon: +game.guess.lon.toFixed(4), km: +km.toFixed(1), pts, hint: hinted });
      store.set('kz-daily-' + game.dailyDate, game.daily);
      $('score-label').textContent = fmtNum(dailyTotal()) + ' Punkte';
      $('result-title').textContent = 'Runde ' + game.daily.guesses.length + ' / ' + DAILY_ROUNDS;
      $('next-btn').textContent = dailyDone() ? 'Ergebnis anzeigen' : 'Nächstes Kennzeichen';
    } else {
      const r = game.run;
      r.rounds += 1; r.points += pts; r.kmSum += km;
      const best = store.get(bestKey(), 0);
      const newBest = r.points > best;
      if (newBest) store.set(bestKey(), r.points);
      $('score-label').textContent = fmtNum(r.points) + ' Punkte';
      $('result-title').textContent = 'Frei · ' + LEVELS[game.level].name + ' · Runde ' + r.rounds;
      if (km > ENDLESS_FAIL_KM) {
        r.over = true;
        note.hidden = false;
        note.textContent = 'Mehr als ' + ENDLESS_FAIL_KM + ' km daneben – Lauf beendet nach ' + r.rounds + ' Runde' + (r.rounds === 1 ? '' : 'n') + ' mit ' + fmtNum(r.points) + ' Punkten.' + (newBest ? ' Neuer Rekord! 🏆' : '');
        $('next-btn').textContent = 'Neuer Lauf';
      } else {
        $('next-btn').textContent = 'Nächstes Kennzeichen';
      }
      renderEndlessStats();
    }

    const sheet = $('result');
    document.body.classList.add('answered');
    map.invalidateSize();
    sheet.hidden = false;
    sheet.classList.remove('show'); void sheet.offsetWidth; sheet.classList.add('show');
    fitWithSheet(L.latLngBounds([[game.guess.lat, game.guess.lon], [p.lat, p.lon]]), 8);
    $('next-btn').focus({ preventScroll: true });
  }

  function next() {
    if (game.mode === 'daily') {
      if (dailyDone()) { showDailyReview(); showSummary(); }
      else startDaily();
    } else {
      nextEndless();
    }
  }

  // ---------- Moduswechsel ----------
  function renderLock() {
    const locked = !dailyDone();
    $('tab-endless').classList.toggle('locked', locked);
    $('tab-endless').title = locked ? 'Erst das Tagesrätsel lösen' : '';
  }
  function setMode(mode) {
    if (mode === 'endless' && !dailyDone()) {
      toast('Löse zuerst das heutige Rätsel 🔒');
      return;
    }
    game.mode = mode;
    renderLock();
    $('tab-daily').setAttribute('aria-selected', String(mode === 'daily'));
    $('tab-endless').setAttribute('aria-selected', String(mode === 'endless'));
    $('endless-box').hidden = mode !== 'endless';
    if (mode === 'daily') startDaily();
    else { if (!game.run || game.run.over) newRun(); nextEndless(); }
  }

  // ---------- Events ----------
  map.on('click', (e) => {
    if (game.answered) return;
    game.guess = { lat: e.latlng.lat, lon: e.latlng.lng };
    placeGuess(e.latlng);
    $('guess-btn').disabled = false;
  });
  $('guess-btn').addEventListener('click', submitGuess);
  $('hint-btn').addEventListener('click', useHint);
  $('next-btn').addEventListener('click', next);
  $('review-btn').addEventListener('click', showSummary);
  $('restart-btn').addEventListener('click', () => { newRun(); nextEndless(); });
  document.querySelectorAll('.level').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.level !== game.level || (game.run && game.run.rounds > 0)) setLevel(b.dataset.level);
  }));
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
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      toast('Kopieren nicht möglich');
    }
  });
  document.querySelectorAll('.pick').forEach((b) => b.addEventListener('click', () => {
    $('summary').close();
    game.level = b.dataset.level;
    store.set('kz-level', game.level);
    renderLevels();
    newRun();
    setMode('endless');
  }));
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Enter') {
      if (!game.answered && game.guess) { e.preventDefault(); submitGuess(); }
      else if (!$('result').hidden) { e.preventDefault(); next(); }
    }
  });

  // ---------- Start ----------
  game.level = LEVELS[store.get('kz-level', 'leicht')] ? store.get('kz-level', 'leicht') : 'leicht';
  renderLevels();
  loadDaily();
  if (!store.get('kz-seen-help', false)) { store.set('kz-seen-help', true); $('help').showModal(); }
  // Beim Öffnen der Seite immer zuerst das Tagesrätsel
  if (location.hash) { try { history.replaceState(null, '', location.pathname + location.search); } catch { /* egal */ } }
  setMode('daily');
})();
