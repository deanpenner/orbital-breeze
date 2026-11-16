/* Orbital Breeze, Launch page: state, input and the panels. The physics is in ascent.js and the
   drawing in view.js. A launch is four choices: the site, the heading, how steeply to climb and
   how high to go. Everything else on the page follows from them. */
(function () {
  'use strict';
  const A = Orbit.ascent, SITES = Orbit.sites, LAND = Orbit.land;
  const { MISSIONS, KICK } = Orbit.launchMissions;
  const $ = (id) => document.getElementById(id);
  const D = Math.PI / 180;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const STORE = 'orbital-breeze-launch-v1';

  const S = { mi: 0, done: {}, plans: {}, units: 'metric', playing: true, simT: 0, hover: null };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved) { S.mi = clamp(saved.mi | 0, 0, MISSIONS.length - 1); S.done = saved.done || {}; S.plans = saved.plans || {}; S.units = saved.units === 'imperial' ? 'imperial' : 'metric'; }
  } catch (e) { /* no saved progress, or storage is off: start fresh */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ mi: S.mi, done: S.done, plans: S.plans, units: S.units })); } catch (e) { /* carry on unsaved */ } };

  const mission = () => MISSIONS[S.mi];
  const plan = () => S.plans[mission().id] || (S.plans[mission().id] = Object.assign({}, mission().start));
  const siteOf = (p) => SITES.find((s) => s.id === p.site) || SITES[0];
  const locked = (what) => (mission().lock || []).includes(what);

  /* ---------- words and numbers ---------- */
  const metric = () => S.units === 'metric';
  const num = (x, d) => (Math.round(x * 10 ** (d || 0)) / 10 ** (d || 0) || 0).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const fmt = {
    dist: (km) => (metric() ? `${num(km)} km` : `${num(km * 0.621371)} mi`),
    speed: (kms) => (metric() ? `${num(kms, 2)} km/s` : `${num(kms * 2236.94)} mph`),
    slow: (kms) => (metric() ? `${num(kms * 1000)} m/s` : `${num(kms * 2236.94)} mph`),
    mass: (kg) => (metric() ? `${num(kg / 1000, 1)} t` : `${num(Math.round(kg * 2.20462 / 100) * 100)} lb`),
  };
  const COMPASS = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east', 'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'];
  const compass = (az) => COMPASS[Math.round(az / 22.5) % 16];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- land or sea under a point ---------- */
  const BOXES = LAND.map((poly) => { let a = 180, b = -180, c = 90, d = -90; for (let i = 0; i < poly.length; i += 2) { a = Math.min(a, poly[i]); b = Math.max(b, poly[i]); c = Math.min(c, poly[i + 1]); d = Math.max(d, poly[i + 1]); } return [a, b, c, d]; });
  function onLand(lon, lat) {
    for (let n = 0; n < LAND.length; n++) {
      const bx = BOXES[n]; if (lon < bx[0] || lon > bx[1] || lat < bx[2] || lat > bx[3]) continue;
      const p = LAND[n]; let inside = false;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        if ((p[i + 1] > lat) !== (p[j + 1] > lat) && lon < (p[j] - p[i]) * (lat - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }

  /* ---------- the launch ---------- */
  const view = Orbit.launchView.create($('sky'), $('dial'), $('profile'));
  let now = null;             // { site, flight, inc, track, land, east, rose, bestKick }
  const memo = new Map();     // flights already flown, by their four numbers
  function flown(lat, az, kick, alt) {
    const key = `${lat}|${az.toFixed(2)}|${kick.toFixed(3)}|${alt}`;
    if (!memo.has(key)) { if (memo.size > 400) memo.clear(); memo.set(key, A.best({ lat, az, kick, alt })); }
    return memo.get(key);
  }
  const REF = flown(0, 90, KICK, 200).payload;   // the most this rocket lifts: due east from the equator

  /* Everything that follows from the four choices. `quick` skips the comparisons, which are
     filled in a moment later so that dragging stays smooth. */
  function compute(quick) {
    const p = plan(), s = siteOf(p), o = { lat: s.lat, lon: s.lon, az: p.az, kick: p.kick, alt: p.alt };
    const flight = flown(s.lat, p.az, p.kick, p.alt), track = A.track(o, flight, 1.5);
    // where the climb first passes over land
    let land = null;
    const stop = flight.cutoff ? flight.cutoff.x : flight.end.x;
    for (let i = 0; i < flight.path.length; i++) {
      const q = flight.path[i]; if (q.x < 90) continue; if (q.x > stop) break;   // the map's coasts are only good to some tens of km
      if (onLand(track[i].lon, track[i].lat)) { land = q.x; break; }
    }
    const keep = now && now.key === `${s.id}|${p.kick}|${p.alt}` ? now : null;
    now = { key: `${s.id}|${p.kick}|${p.alt}`, site: s, flight, inc: A.inclination(s.lat, p.az), track, land,
      east: keep ? keep.east : null, rose: keep ? keep.rose : null, span: keep ? keep.span : null, bestKick: now && now.kickKey === `${s.id}|${p.az}|${p.alt}` ? now.bestKick : null, kickKey: `${s.id}|${p.az}|${p.alt}` };
    if (!quick) compare(); else { clearTimeout(compute.later); compute.later = setTimeout(() => { compare(); render(); }, 90); }
  }
  function compare() {
    const p = plan(), s = now.site;
    if (!now.east) {
      const e = flown(s.lat, 90, p.kick, p.alt), n = flown(s.lat, 0, p.kick, p.alt), w = flown(s.lat, 270, p.kick, p.alt);
      const pe = e.ok ? e.payload : 0, pn = n.ok ? n.payload : 0, pw = w.ok ? w.payload : 0;
      // What a heading can carry depends on how much of the ground's speed lies along it: a smooth curve through three flights.
      now.east = e; now.span = [pw / REF, pe / REF];
      now.rose = (az) => { const h = Math.sin(az * D); return Math.max(0, pn + (pe - pw) / 2 * h + (pe + pw - 2 * pn) / 2 * h * h) / REF; };
    }
    if (mission().needs === 'bestKick' && !now.bestKick) {
      let best = null;
      for (let k = 1.5; k <= 4.001; k += 0.125) { const f = flown(s.lat, p.az, k, p.alt); if (f.ok && (!best || f.payload > best.payload)) best = f; }
      now.bestKick = best;
    }
  }

  /* ---------- panels ---------- */
  function check() {
    const m = mission();
    return m.check ? m.check(plan(), now.flight, { site: now.site, inc: now.inc, east: now.east, bestKick: now.bestKick }) : { ok: false, text: null };
  }
  function renderBrief() {
    const m = mission(), c = check();
    $('count').textContent = `${S.mi + 1} of ${MISSIONS.length}`;
    $('title').textContent = m.title; $('goal').textContent = m.goal;
    if (c.ok && !S.done[m.id]) { S.done[m.id] = true; save(); }
    const note = $('note');
    note.className = 'note' + (c.ok ? ' good' : '');
    note.innerHTML = c.ok ? `<strong>Done.</strong> ${m.insight}` : `${m.hint}${c.text ? `<span>${c.text}</span>` : ''}`;
    $('onward').hidden = !(c.ok && S.mi < MISSIONS.length - 1);
    $('prev').disabled = S.mi === 0; $('next').disabled = S.mi === MISSIONS.length - 1;
  }
  const failWords = (f) => ({
    maxq: ['Breaks up', `Too shallow: it is going too fast while the air is still thick. At ${fmt.dist(f.qAt)} up the pressure on it passes ${A.MAXQ} kPa, the most this rocket can take. Climb more steeply.`],
    falls: ['Falls back', 'Too shallow: it never climbs out of the atmosphere.'],
    short: ['No orbit', 'The propellant runs out before orbital speed, even with nothing on board.'],
  }[f.why] || ['No orbit', '']);
  function realWords(s) {
    if (s.sectors) return `flown here: ${s.sectors.map(([a, b]) => `${num((a + 360) % 360, a % 1 ? 1 : 0)}° to ${num(b, b % 1 ? 1 : 0)}°`).join(', ')}`;
    if (s.incs) return `flown here: orbits inclined ${s.incs.map((i) => i + '°').join(', ')}`;
    if (s.reach) return `flown here: orbits inclined ${num(s.reach[0])}° to ${num(s.reach[1])}°`;
    if (s.west) return 'flown here: westward only';
    return 'no published range';
  }
  /* A site's real headings as arcs and marks for the compass. */
  function realArcs(s) {
    const marks = [];
    let sectors = s.sectors || [];
    if (s.incs) for (const i of s.incs) { const h = A.headingsFor(s.lat, i); if (h) marks.push(h[0]); }
    if (s.reach) {
      const a = A.headingsFor(s.lat, Math.max(s.reach[0], Math.abs(s.lat) + 0.01)), b = A.headingsFor(s.lat, s.reach[1]);
      if (a && b) sectors = [s.reach[2] === 'south' ? [a[1], b[1]] : [b[0] > 180 ? b[0] - 360 : b[0], a[0]]];
    }
    return { sectors, marks };
  }
  function renderPanes() {
    const p = plan(), s = now.site, f = now.flight;
    // site
    const sel = $('site');
    if (!sel.firstChild) sel.innerHTML = SITES.map((x) => `<option value="${x.id}">${x.name}</option>`).join('');
    sel.value = s.id; sel.disabled = locked('site');
    $('site-facts').textContent = `${s.place}. ${Math.abs(s.lat).toFixed(1)}° ${s.lat >= 0 ? 'north' : 'south'}; the ground moves east at ${fmt.slow(A.groundSpeed(s.lat))}.`;
    $('site-why').textContent = s.why;
    // heading
    if (document.activeElement !== $('n-az')) $('n-az').value = `${num(p.az, 1)}°`;
    const along = Math.sin(p.az * D);
    $('az-words').textContent = `${cap(compass(p.az))}: ${along > 0.3 ? 'with the Earth’s spin' : along < -0.3 ? 'against the Earth’s spin' : 'across the Earth’s spin'}`;
    $('real-words').textContent = realWords(s);
    $('rose-words').textContent = now.span && now.span[1] > 0 ? `payload by heading: ${Math.round(now.span[0] * 100)}% west, ${Math.round(now.span[1] * 100)}% east` : 'payload by heading';
    $('dial').setAttribute('aria-valuenow', Math.round(p.az)); $('dial').setAttribute('aria-valuetext', `${num(p.az, 1)} degrees, ${compass(p.az)}`);
    // climb
    $('kick').value = p.kick;
    $('kick-words').textContent = `pitch-over ${num(p.kick, 1)}°${f.maxQ > 1 && f.why !== 'maxq' ? ` · max Q ${num(f.maxQ)} kPa` : ''}`;
    if (document.activeElement !== $('n-alt')) $('n-alt').value = fmt.dist(p.alt);
    // result
    const retro = now.inc > 90.05;
    $('inc').textContent = `${num(now.inc, 1)}°${retro ? ' retrograde' : ''}`;
    const pay = $('payload'), verdict = $('verdict');
    if (f.ok) {
      pay.textContent = fmt.mass(f.payload); pay.className = '';
      const where = now.land == null ? 'Climbs out over open water.' : now.land < 160 ? 'Climbs out over land.' : `Crosses land ${fmt.dist(Math.round(now.land / 10) * 10)} downrange.`;
      verdict.className = 'small';
      verdict.textContent = `${Math.round(100 * f.payload / REF)}% of the most this rocket can lift. ${where}`;
    } else {
      const [head, why] = failWords(f); pay.textContent = head; pay.className = 'bad'; verdict.className = 'small bad'; verdict.textContent = why;
    }
    // inclination scale
    const lat = Math.abs(s.lat), at = (deg) => `${(deg / 180 * 100).toFixed(2)}%`;
    $('incbar').innerHTML = `<div class="rail"><i class="no" style="left:0;width:${at(lat)}"></i><i class="no" style="right:0;width:${at(lat)}"></i></div>`
      + [[0, '0°', 'edge-l'], [51.6, 'station 51.6°', ''], [90, 'polar 90°', ''], [180, '180°', 'edge-r']].map(([d, l, c]) => `<i class="mark ${c}" style="left:${at(d)}"><span>${l}</span></i>`).join('')
      + `<i class="mark" style="left:${at(138)};background:none"><span>retrograde</span></i><i class="you" style="left:${at(now.inc)}"></i>`;
    // where the delta-v goes
    const row = (name, value, cls, sign) => `<tr><td>${name}</td><td>${sign || ''}${num(Math.abs(value), 2)}</td><td><i class="bar ${cls}" style="width:${clamp(Math.abs(value) / 8 * 100, 0, 100).toFixed(1)}%"></i></td></tr>`;
    $('budget').innerHTML = f.ok
      ? row('Orbital speed', f.speed, 'speed') + row('Earth’s spin', f.spin, f.spin >= 0 ? 'help' : 'hurt', f.spin >= 0 ? '−' : '+')
        + row('Lost to gravity', f.gravity, 'cost', '+') + row('Lost to air drag', f.drag, 'cost', '+')
        + `<tr class="sum"><td>Rocket supplies</td><td>${num(f.spent, 2)}</td><td>km/s of delta-v</td></tr>`
      : '';
  }
  function drawStatic() {
    const p = plan(), arcs = realArcs(now.site);
    view.drawDial({ az: p.az, sectors: arcs.sectors, marks: arcs.marks, rose: now.rose || (() => 0) });
  }
  function render() { renderBrief(); renderPanes(); drawStatic(); }
  function update(quick) { compute(quick); render(); save(); }

  /* ---------- playback: the craft runs up the climb, then round its first orbit ---------- */
  const LOOP = 15;   // seconds for the whole loop; the climb gets the first two fifths
  function craftNow() {
    const f = now.flight, tr = now.track; if (!tr.length) return null;
    const tEnd = tr[tr.length - 1].t, tClimb = Math.min(f.cutoff ? f.cutoff.t : f.end.t, tEnd), u = (S.simT % LOOP) / LOOP;
    const t = !f.ok ? u * tClimb : u < 0.4 ? u / 0.4 * tClimb : tClimb + (u - 0.4) / 0.6 * (tEnd - tClimb);
    let i = 0, lo = 0, hi = tr.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tr[mid].t <= t) lo = mid; else hi = mid; } i = lo;
    const a = tr[i], b = tr[Math.min(i + 1, tr.length - 1)], k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
    const wrap = Math.abs(b.lon - a.lon) > 180;
    return { t, lat: a.lat + (b.lat - a.lat) * k, lon: wrap ? a.lon : a.lon + (b.lon - a.lon) * k };
  }
  let last = 0;
  function frame(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
    if (S.playing && !frame.drag) S.simT += dt;
    const craft = frame.drag ? null : craftNow();
    view.drawMap({ sites: SITES, site: now.site, hover: S.hover, track: now.track, flight: now.flight, inc: now.inc, craft, locked: locked('site'), fmt });
    view.drawProfile({ flight: now.flight, alt: plan().alt, t: craft ? craft.t : null, fmt });
    requestAnimationFrame(frame);
  }

  /* ---------- input ---------- */
  function setAz(az, quick) {
    az = ((az % 360) + 360) % 360;
    for (const c of [0, 90, 180, 270, 360]) if (Math.abs(az - c) < 1.6) az = c % 360;   // the four winds catch
    plan().az = Math.round(az * 2) / 2; S.simT = 0; update(quick);
  }
  const dial = $('dial');
  dial.addEventListener('pointerdown', (e) => { dial.setPointerCapture(e.pointerId); frame.drag = true; setAz(view.dialHeading(e.clientX, e.clientY), true); });
  dial.addEventListener('pointermove', (e) => { if (frame.drag) setAz(view.dialHeading(e.clientX, e.clientY), true); });
  const drop = () => { if (frame.drag) { frame.drag = false; update(); } };
  dial.addEventListener('pointerup', drop); dial.addEventListener('pointercancel', drop);
  dial.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!step) return;
    e.preventDefault(); plan().az = (((plan().az + step * (e.shiftKey ? 10 : 1)) % 360) + 360) % 360; S.simT = 0; update();
  });
  const typed = (id, apply) => {
    const el = $(id);
    el.addEventListener('focus', () => el.select());
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); if (e.key === 'Escape') { el.value = ''; el.blur(); } });
    el.addEventListener('blur', () => { const v = parseFloat(el.value.replace(/,/g, '')); if (isFinite(v)) apply(v, el.value); S.simT = 0; update(); });
  };
  typed('n-az', (v) => { plan().az = Math.round((((v % 360) + 360) % 360) * 10) / 10; });
  typed('n-alt', (v, raw) => { const km = /mi/i.test(raw) || (!metric() && !/km/i.test(raw)) ? v / 0.621371 : v; plan().alt = Math.round(clamp(km, 160, 2000)); });
  $('kick').addEventListener('input', () => { plan().kick = +$('kick').value; update(true); });
  $('kick').addEventListener('change', () => { S.simT = 0; update(); });
  $('site').addEventListener('change', () => { plan().site = $('site').value; S.simT = 0; update(); });

  const sky = $('sky');
  sky.addEventListener('pointermove', (e) => { const s = view.siteAt(SITES, e.clientX, e.clientY); S.hover = s; sky.style.cursor = s && !locked('site') && s !== now.site ? 'pointer' : 'default'; });
  sky.addEventListener('pointerleave', () => { S.hover = null; });
  sky.addEventListener('click', (e) => { const s = view.siteAt(SITES, e.clientX, e.clientY); if (s && !locked('site')) { plan().site = s.id; S.simT = 0; update(); } });

  function goTo(i) { S.mi = clamp(i, 0, MISSIONS.length - 1); S.simT = 0; layout(); update(); }
  $('prev').addEventListener('click', () => goTo(S.mi - 1));
  $('next').addEventListener('click', () => goTo(S.mi + 1));
  $('onward').addEventListener('click', () => goTo(S.mi + 1));
  $('reset').addEventListener('click', () => { S.plans[mission().id] = Object.assign({}, mission().start); S.simT = 0; update(); });
  $('play').addEventListener('click', () => { S.playing = !S.playing; $('play').textContent = S.playing ? 'Pause' : 'Play'; });
  const setUnits = (u) => { S.units = u; $('unit-metric').setAttribute('aria-pressed', u === 'metric'); $('unit-imperial').setAttribute('aria-pressed', u === 'imperial'); update(); };
  $('unit-metric').addEventListener('click', () => setUnits('metric'));
  $('unit-imperial').addEventListener('click', () => setUnits('imperial'));
  document.addEventListener('click', (e) => { const m = $('menu'); if (m.open && !m.contains(e.target)) m.open = false; });

  function layout() {
    const dockH = $('dock').offsetHeight, brief = $('brief').getBoundingClientRect();
    document.documentElement.style.setProperty('--dock', `${dockH}px`);
    view.resize(brief.right + 18, 66, dockH);
  }
  window.addEventListener('resize', () => { layout(); drawStatic(); });

  compute(); render(); layout(); drawStatic(); setUnits(S.units);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layout(); drawStatic(); });
  requestAnimationFrame(frame);

  Orbit.app = { S, get now() { return now; }, plan, goTo, update, view, MISSIONS, check };
})();
