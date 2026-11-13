/* State, input and the panels around the canvases, for the Moon page. Adapted from ../../js/app.js:
   the bottom bar, typed numbers, undo and saving behave the same. What is new is that one journey
   is shown in three pictures, and the picture belonging to the selected step is the large one. */
(function (G) {
  'use strict';
  const X = G.Orbit.physics, J = G.Orbit.journey, L = G.Orbit.lunar, VW = G.Orbit.view;
  const { RE, TAU } = X, D = J.D, M = L.MOON;
  const $ = (id) => document.getElementById(id);
  const STORE = 'orbital-breeze-moon-v1';
  const SCENES = ['earth', 'journey', 'moon'];
  const reducedMotion = G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = { mi: 0, plans: {}, sel: 0, scene: 'earth', units: 'metric', speed: 1, more: false, tank: 0, playing: !reducedMotion, simT: 0, hold: 0, drag: null, hover: null, history: [] };
  let warmed = false;
  let view, res, chk, inGesture = false, lastNow = 0, moving = null, dockH = 0, selScene = null, pace = null;
  const insets = {};   // the small pictures, one per scene; the current scene's is hidden

  /* ---------- numbers ---------- */
  const num = (x, d) => (Math.round(x * 10 ** (d || 0)) / 10 ** (d || 0) || 0).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const metric = () => S.units === 'metric';
  const U = () => (metric() ? { dv: 1000, mass: 1, dist: 1 } : { dv: 3280.84, mass: 2.20462, dist: 0.621371 });
  const fmt = {
    dist: (km) => (metric() ? `${num(km)} km` : `${num(km * 0.621371)} mi`),
    speed: (v) => (metric() ? `${num(v, 2)} km/s` : `${num(v * 0.621371, 2)} mi/s`),
    dv: (v) => (metric() ? `${num(v * 1000)} m/s` : `${num(v * 3280.84)} ft/s`),
    dvSigned: (v) => (v > 0.0004 ? '+' : v < -0.0004 ? '−' : '') + fmt.dv(Math.abs(v)),
    mass: (kg) => (metric() ? `${num(kg)} kg` : `${num(kg * 2.20462)} lb`),
    deg: (d) => `${num(d, Math.abs(d - Math.round(d)) < 0.05 ? 0 : 1)}°`,
    time: (s) => {
      if (s < 1) return 'no wait';
      if (s < 90) return `${Math.round(s)} s`;
      if (s < 600) return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
      if (s < 3600) return `${Math.round(s / 60)} min`;
      if (s < 172800) { const m = Math.round(s / 60); return `${Math.floor(m / 60)} h ${m % 60} min`; }
      const h = Math.round(s / 3600);
      return `${Math.floor(h / 24)} d ${h % 24} h`;
    },
  };

  const mission = () => J.MISSIONS[S.mi];
  const plan = () => S.plans[mission().id] || (S.plans[mission().id] = J.newPlan(mission()));
  const V = () => J.vehicleOf(plan());
  const round3 = (x) => Math.round(x * 1000) / 1000;
  const cur = () => ({ b: plan().burns[S.sel], rb: res.burns[S.sel] });
  const isBurn = (b) => b && b.kind !== 'drop';
  const flightOf = (p) => J.FLIGHTS.find((f) => f.id === p.flight);
  const radiusOf = (body) => L.BODY[body].R;
  const orbitText = (o, R) => (o.e < J.ECC_APS ? `${fmt.dist(o.a - R)} circular` : `${num((o.rp - R) * U().dist)} × ${fmt.dist(o.ra - R)}`);
  // Stage names in the middle of a sentence: lower case, unless the name is a designation.
  const low = (s) => (/^[A-Z0-9][A-Z0-9-]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
  const engineText = (s) => `${metric() ? `${num(s.thrust / 1000, s.thrust < 10000 ? 2 : s.thrust < 100000 ? 1 : 0)} kN` : `${num(s.thrust * 0.224809)} lbf`}, Isp ${num(s.isp, Number.isInteger(s.isp) ? 0 : 1)} s`;

  /* ---------- history and storage ---------- */
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ mi: S.mi, plans: S.plans, units: S.units, speed: S.speed, more: S.more })); } catch (e) { /* storage is a convenience */ }
  }
  function begin() {
    if (inGesture) return;
    inGesture = true;
    S.history.push({ mi: S.mi, sel: S.sel, plan: JSON.stringify(plan()) });
    if (S.history.length > 200) S.history.shift();
  }
  function commit() {
    inGesture = false;
    S.simT = 0; S.hold = 0;
    save();
    $('undo').disabled = !S.history.length;
  }
  function undo() {
    const h = S.history.pop();
    if (!h) return;
    S.mi = h.mi; S.plans[mission().id] = JSON.parse(h.plan); S.sel = Math.min(h.sel, plan().burns.length - 1);
    selScene = null; update(true); commit();
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!d) return;
      if (J.MISSIONS[d.mi]) S.mi = d.mi;
      if (d.units === 'imperial') S.units = 'imperial';
      if (d.speed > 0.1 && d.speed < 10) S.speed = d.speed;
      S.more = !!d.more;
      for (const m of J.MISSIONS) {
        const p = d.plans && d.plans[m.id];
        if (p && Array.isArray(p.burns) && Array.isArray(p.fuel) && p.start && J.VEHICLES[p.vehicle]) S.plans[m.id] = p;
      }
    } catch (e) { /* start fresh */ }
  }

  /* ---------- which controls are on show ---------- */
  const isFree = (b) => !!b.free || Math.abs(b.rad || 0) > 5e-4;
  const modeOf = (b) => b.mode || 'dv';
  /* A group of extra controls appears when the player asks for everything, when the mission
     needs it, or when this step already uses it. */
  function shown(group, b) {
    if (S.more || (mission().show || []).includes(group)) return true;
    if (!isBurn(b)) return false;
    if (group === 'where') return (b.revs || 0) > 0;
    if (group === 'hold') return modeOf(b) !== 'dv';
    return group === 'dirs' && isFree(b);
  }

  /* ---------- the three pictures ---------- */
  /* The picture a step is worked in. Stage drops have no place of their own. */
  function sceneOfStep(i) {
    if (i < 0) return res.startBody === 'moon' ? 'moon' : 'earth';
    const rb = res.burns[i], b = plan().burns[i];
    if (!rb || rb.drop) return null;
    if (rb.unreachable) return b.body === 'moon' ? 'moon' : null;
    return VW.sceneOfBurn(rb);
  }
  function setScene(scene, quiet) {
    if (!SCENES.includes(scene) || scene === S.scene) return;
    S.scene = scene; S.hover = null;
    view.resetZoom();
    for (const k of SCENES) insets[k].el.hidden = k === scene;
    sizeInsets();
    if (res) { fitAll(true); if (!quiet) syncZoom(); }
  }
  /* Choose a step, and bring its picture forward. */
  function select(i) {
    S.sel = i;
    const sc = sceneOfStep(i);
    selScene = sc;
    if (sc) setScene(sc, true);
  }
  const frameState = () => ({ res, sel: S.sel, avoid: busy() });
  function fitAll(instant) {
    view.fit(frameState(), S.scene, instant);
    for (const k of SCENES) if (k !== S.scene) insets[k].view.fit(frameState(), k, instant);
  }

  /* ---------- burn size and direction ---------- */
  const localVec = (rb, d, mag) => X.add(X.add(X.scale(rb.pro, d[0] * mag), X.scale(rb.rad, d[1] * mag)), X.scale(rb.nrm, d[2] * mag));
  /* Store a burn given as a delta-v vector, in whichever form this burn is held. */
  function applyVec(b, rb, vec, exact) {
    const mag = X.len(vec);
    if (mag > 1e-9) b.dir = [X.dot(vec, rb.pro) / mag, X.dot(vec, rb.rad) / mag, 0];
    const q = J.paramsFromDv(rb, rb.before, vec);
    b.pro = exact ? q.pro : round3(q.pro);
    b.rad = Math.abs(q.rad) < 5e-4 ? 0 : exact ? q.rad : round3(q.rad);
    b.turn = 0;
    if (modeOf(b) !== 'dv') { const fuel = rb.mass0 * (1 - Math.exp(-mag / rb.ve)); b.amount = b.mode === 'fuel' ? fuel : fuel / rb.mdot; }
    if (b.rad) b.free = true;
  }
  /* One of the three sizes as a single number. On a straight burn, negative means retrograde. */
  function sizeOf(b, rb, mode) {
    const mag = mode === 'dv' ? rb.cmd : mode === 'fuel' ? rb.fuelCmd : rb.fuelCmd / rb.mdot;
    return (!isFree(b) && rb.dir[0] < 0 ? -1 : 1) * mag;
  }
  /* Set one size and hold it from now on. */
  function setSize(b, rb, mode, val) {
    b.mode = mode;
    if (!isFree(b)) {
      const sgn = val < 0 ? -1 : val > 0 ? 1 : rb.dir[0] < 0 ? -1 : 1;
      b.dir = [sgn, 0, 0]; b.rad = b.turn = 0;
      if (mode === 'dv') b.pro = sgn * Math.abs(val); else b.amount = Math.abs(val);
    } else if (mode === 'dv') applyVec(b, rb, localVec(rb, rb.dir, Math.max(0, val)), true);
    else { b.dir = rb.dir; b.amount = Math.max(0, val); }
  }
  /* Change prograde or radial, leaving the other alone. */
  function setParam(b, rb, key, value) {
    const q = Object.assign({}, rb.params, { [key]: value });
    b.free = true;
    applyVec(b, rb, J.dvFromParams(rb, q.pro, q.rad, 0), true);
    if (modeOf(b) === 'dv') { b.pro = q.pro; b.rad = q.rad; }
  }
  const STEPS = { dv: [0.01, 0.1, 0.001], fuel: [10, 100, 1], time: [1, 10, 0.1] };
  function nudge(by, e, fine) {
    const { b, rb } = cur();
    if (!isBurn(b) || rb.unreachable) return;
    const m = modeOf(b), st = STEPS[m], step = fine ? st[2] * (e.shiftKey ? 10 : 1) : e.shiftKey ? st[1] : e.altKey ? st[2] : st[0];
    begin(); setSize(b, rb, m, (m === 'dv' ? round3 : (x) => x)(sizeOf(b, rb, m) + by * step)); update(); commit();
  }
  // Slider position <-> size. Fine near zero, coarse far out.
  const DV_MAX = 5, KNEE = 0.15, SPAN = Math.asinh(DV_MAX / KNEE);
  function slide(rb, mode) {
    if (mode === 'dv') return { to: (x) => Math.sign(x) * KNEE * Math.sinh(Math.abs(x) / 1000 * SPAN), from: (v) => Math.sign(v) * Math.asinh(Math.abs(v) / KNEE) / SPAN * 1000 };
    const top = V().stages[rb.stage].propMax / (mode === 'fuel' ? 1 : rb.mdot);
    return { to: (x) => Math.sign(x) * top * (x / 1000) ** 2, from: (v) => Math.sign(v) * 1000 * Math.sqrt(Math.min(1, Math.abs(v) / top)) };
  }

  /* ---------- coasting: how far round the orbit before a burn ---------- */
  const closedOrbit = (o, body) => o.e < 1 && o.ra < L.BODY[body].edge;
  const closedBefore = (rb) => !rb.unreachable && closedOrbit(rb.before, rb.body);
  const coastOf = (i) => { const rb = res.burns[i]; return rb && !rb.unreachable && !rb.drop ? res.legs[rb.legIndex].sweep : 0; };
  const coastUnit = () => { const { b, rb } = cur(); return b && rb && closedBefore(rb) && b.coastUnit !== 'deg' ? 'laps' : 'deg'; };
  function setCoast(i, sweep) {
    const b = plan().burns[i], rb = res.burns[i], leg = res.legs[rb.legIndex], closed = closedBefore(rb), laps = (sweep - coastOf(i)) / TAU;
    // A whole number of laps more or less keeps the burn where it is (still at apoapsis, say).
    if (closed && Math.abs(laps - Math.round(laps)) < 1e-6) { b.revs = Math.max(0, (b.revs || 0) + Math.round(laps)); return; }
    b.anchor = 'free'; b.theta = X.argOfNu(rb.before, leg.nu0) + sweep; b.revs = closed ? Math.floor(sweep / TAU + 1e-9) : 0;
  }

  /* ---------- every number you can type into ---------- */
  // Delta-v carries a sign on a straight burn (negative is retrograde). Fuel and engine time are
  // plain amounts, and typing one keeps the burn pointing the way it already does.
  const sizeField = (mode, unit, text, step) => ({
    step, text,
    get: () => { const v = sizeOf(cur().b, cur().rb, mode) * unit(); return mode === 'dv' ? v : Math.abs(v); },
    set: (x) => { const { b, rb } = cur(), way = mode === 'dv' ? Math.sign(x) || 1 : Math.sign(sizeOf(b, rb, mode)) || 1; setSize(b, rb, mode, way * Math.abs(x) / unit()); },
  });
  const paramField = (key, unit, text, step) => ({ step, get: () => cur().rb.params[key] * unit(), text, set: (x) => setParam(cur().b, cur().rb, key, x / unit()) });
  const startField = (key, step) => ({
    step, get: () => plan().start[key] * U().dist, text: () => fmt.dist(plan().start[key]),
    set: (x) => {
      const s = plan().start, moon = s.body === 'moon';
      s[key] = X.clamp(x / U().dist, moon ? 15 : 150, moon ? 60000 : 400000);
      if (s.apo < s.peri) { if (key === 'apo') s.peri = s.apo; else s.apo = s.peri; }
    },
  });
  const timeText = () => { const t = cur().rb.fuelCmd / cur().rb.mdot; return t < 90 ? `${num(t, t < 10 ? 1 : 0)} s` : fmt.time(t); };
  const FIELDS = {
    'n-payload': { step: 100, get: () => V().payload * U().mass, text: () => fmt.mass(V().payload), set: (x) => { plan().payload = X.clamp(x / U().mass, 0, 200000); } },
    'n-load': { step: 100, get: () => plan().fuel[S.tank] * U().mass, text: () => fmt.mass(plan().fuel[S.tank]), set: (x) => { plan().fuel[S.tank] = X.clamp(x / U().mass, 0, V().stages[S.tank].propMax); } },
    'n-dv': sizeField('dv', () => U().dv, () => (isFree(cur().b) ? fmt.dv(cur().rb.cmd) : fmt.dvSigned(sizeOf(cur().b, cur().rb, 'dv'))), 10),
    'n-fuel': sizeField('fuel', () => U().mass, () => fmt.mass(cur().rb.fuelCmd), 10),
    'n-time': sizeField('time', () => 1, timeText, 1),
    'n-pro': paramField('pro', () => U().dv, () => fmt.dvSigned(cur().rb.params.pro), 10),
    'n-rad': paramField('rad', () => U().dv, () => fmt.dvSigned(cur().rb.params.rad), 10),
    'n-coast': {
      dp: () => (coastUnit() === 'deg' ? 1 : 3), step: 1,
      get: () => (coastUnit() === 'deg' ? coastOf(S.sel) / D : coastOf(S.sel) / TAU),
      text: () => { const v = shownValue(FIELDS['n-coast']); return coastUnit() === 'deg' ? fmt.deg(v) : String(Math.round(v * 100) / 100); },
      set: (x, typed) => {   // "45 deg" or "2 orbits" switches the unit as well
        if (/deg|°/i.test(typed || '')) cur().b.coastUnit = 'deg'; else if (/lap|orbit|rev/i.test(typed || '')) cur().b.coastUnit = 'laps';
        setCoast(S.sel, Math.max(0, x) * (coastUnit() === 'deg' ? D : TAU));
      },
    },
    'n-peri': startField('peri', 10),
    'n-apo': startField('apo', 10),
    'n-moon': { step: 1, get: () => X.wrapTau(plan().moon * D) / D, text: () => fmt.deg(X.wrapTau(plan().moon * D) / D), set: (x) => { plan().moon = ((x % 360) + 360) % 360; } },
  };
  // The main number beside the slider is whichever size this burn holds.
  Object.defineProperty(FIELDS, 'n-main', { get: () => FIELDS[`n-${modeOf(cur().b)}`] });
  const startFieldIds = ['n-load', 'n-payload', 'n-peri', 'n-apo', 'n-moon'];
  const shownValue = (f) => { const k = 10 ** (f.dp ? f.dp() : 1); return Math.round(f.get() * k) / k || 0; };
  function syncFields() {
    for (const el of document.querySelectorAll('input.num')) {
      const off = !startFieldIds.includes(el.id) && (!isBurn(cur().b) || cur().rb.unreachable);
      el.disabled = off;
      if (el !== document.activeElement) el.value = off ? '–' : FIELDS[el.id].text();
    }
  }
  const isNum = (el) => el && el.matches && el.matches('input.num');
  function applyField(el, x, typed) {
    begin(); FIELDS[el.id].set(x, typed); update(); commit();
  }
  document.addEventListener('focusin', (e) => {
    if (!isNum(e.target)) return;
    e.target.value = String(shownValue(FIELDS[e.target.id]));
    e.target.select();
  });
  // Clicking a number selects all of it, so typing replaces the old value.
  document.addEventListener('mousedown', (e) => {
    const el = e.target;
    if (isNum(el) && document.activeElement !== el && !el.disabled) { e.preventDefault(); el.focus(); }
  });
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (!isNum(el)) return;
    if (e.key === 'Enter') el.blur();
    else if (e.key === 'Escape') { el.dataset.cancel = '1'; el.blur(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {   // step the value without retyping it
      e.preventDefault();
      const f = FIELDS[el.id];
      applyField(el, shownValue(f) + (e.key === 'ArrowUp' ? 1 : -1) * (f.step || 1) * (e.shiftKey ? 10 : 1));
      el.value = String(shownValue(FIELDS[el.id])); el.select();
    }
  });
  document.addEventListener('focusout', (e) => {
    const el = e.target;
    if (!isNum(el) || el.disabled) return;
    const f = FIELDS[el.id], typed = el.value, x = parseFloat(typed.replace(/[,\s]/g, '').replace('−', '-'));
    const changed = !el.dataset.cancel && isFinite(x) && (Math.abs(x - shownValue(f)) > 1e-9 || /[a-z°]/i.test(typed));
    delete el.dataset.cancel;
    if (changed) applyField(el, x, typed);
    if (document.body.contains(el) && FIELDS[el.id]) el.value = el.disabled ? '–' : FIELDS[el.id].text();
  });

  /* ---------- recompute and redraw panels ---------- */
  function update(structural) {
    const p = plan(), m = mission();
    S.tank = Math.min(S.tank, V().stages.length - 1);
    res = J.compute(p, V());
    chk = J.check(m, res);
    p.burns.forEach((b, i) => {
      const rb = res.burns[i];
      if (rb.drop || rb.unreachable) return;
      if (b.anchor !== 'free') b.theta = rb.theta;
      if (modeOf(b) !== 'dv') { b.pro = rb.params.pro; b.rad = Math.abs(rb.params.rad) < 5e-4 ? 0 : rb.params.rad; }
    });
    setPace();
    if (!S.drag) {
      // If the selected step now belongs to a different picture (a burn moved far from Earth, say), follow it.
      const sc = sceneOfStep(S.sel);
      if (sc && sc !== selScene) { selScene = sc; setScene(sc, true); }
      fitAll(false);
    }
    renderStrip();
    showEnd();
    if (structural) renderEditor();
    syncEditor(); syncFields(); renderBrief(); renderBudget();
    if ($('dock').offsetHeight !== dockH) layout();
    placeCaret(); syncZoom();
  }

  const anchorWords = { apo: 'apoapsis', peri: 'periapsis' };
  const anchorOf = (b, rb) => ((b.anchor === 'apo' || b.anchor === 'peri') && rb.before.e > J.ECC_APS ? b.anchor : null);
  function outcome() {
    const o = res.final, e = res.entry;
    if (res.status === 'reentry') return ['Reentry', e && e.speed > 9 ? `${fmt.speed(e.speed)}, ${num(e.angle, 1)}° down` : 'falls into the atmosphere'];
    if (res.status === 'impact') return ['Lunar impact', 'hits the Moon'];
    if (res.status === 'escape') return ['Earth escape', res.rounded ? 'by lunar gravity assist' : res.vinf ? `v∞ ${fmt.speed(res.vinf)}` : 'does not come back', 'bad'];
    if (res.status === 'unsettled') return ['Unstable path', 'meets the Moon again', 'bad'];
    if (res.status === 'lost') return ['Unstable path', 'between Earth and the Moon', 'bad'];
    // An orbit the other body would soon undo is called what it is.
    const frail = !mission().target && (res.caution === 'crossing' || res.caution === 'barely'), tone = frail ? 'bad' : '';
    if (res.status === 'lunar') return [frail ? 'Unstable lunar orbit' : o.e < J.ECC_APS ? 'Circular lunar orbit' : 'Lunar orbit', orbitText(o, M.R).replace(' circular', ''), tone];
    return [frail ? 'Unstable orbit' : o.e < J.ECC_APS ? 'Circular orbit' : 'Elliptical orbit', orbitText(o, RE).replace(' circular', ''), tone];
  }
  /* A sentence on why a journey's ending cannot be relied on, or null. */
  function fateNote() {
    const last = res.legs[res.legs.length - 1];
    if (res.status === 'unsettled') return `After ${fmt.time(last.dt)} this path meets the Moon a second time. What happens then turns on a few metres per second, so the track is not followed further. Add a burn before then to settle it.`;
    if (res.status === 'lost') return 'This path keeps passing between Earth and the Moon without settling. It is too sensitive to follow further.';
    if (res.status === 'escape') {
      const before = res.legs.filter((l) => l.end === 'soi-in').pop(), assist = res.rounded && before && before.orbit.e < 1;
      if (res.vinf) return assist ? 'The pass by the Moon left this path faster than Earth’s escape speed: a gravity assist. It leaves the Earth and Moon for good.' : 'This path is faster than Earth’s escape speed. It leaves for good.';
      return `${assist ? 'The pass by the Moon lifted' : 'This burn lifts'} the far point of this path beyond Earth’s sphere of influence, some ${fmt.dist(X.SOI)} out, where the Sun’s pull takes over. It is not followed further.`;
    }
    if (mission().target) return null;   // missions keep to their own hints; the picture still marks the orbit
    if (res.caution === 'crossing') return 'This orbit crosses the Moon’s path. On some later orbit the Moon will be there, and will change it.';
    if (res.caution === 'tugged') return 'An orbit this high does not keep its shape: the Moon’s pull shifts the low point by hundreds of kilometres within a few orbits (a third-body perturbation, which this model leaves out).';
    if (res.caution === 'loose') return 'This far from the Moon, Earth’s pull distorts the orbit from one orbit to the next (a third-body perturbation, which this model leaves out).';
    if (res.caution === 'barely') return 'This orbit reaches most of the way to the edge of the Moon’s sphere of influence. In reality Earth would pull the craft away within a few orbits.';
    return null;
  }
  /* What may still be let go of: a spent stage, then (when the mission or the player allows it) the cargo. */
  function nextDrop() {
    const p = plan(), v = V(), drops = p.burns.filter((b) => b.kind === 'drop').length;
    if (drops < v.stages.length - 1) return 'Stage separation';
    const allowed = !mission().target || S.more || (mission().show || []).includes('leave');
    return drops === v.stages.length - 1 && v.payload > 0 && allowed ? v.release || 'Deploy payload' : null;
  }

  function renderStrip() {
    const p = plan(), v = V(), stages = v.stages;
    let h = `<li><button class="step" data-sel="-1" aria-pressed="${S.sel === -1}"><span class="dot start"></span><span><b>Start</b><small>${orbitText(res.start, radiusOf(res.startBody))}${res.startBody === 'moon' ? ', Moon' : ''}</small></span></button></li>`;
    p.burns.forEach((b, i) => {
      const rb = res.burns[i], on = `data-sel="${i}" aria-pressed="${S.sel === i}"`;
      if (rb.drop) {
        const what = rb.cargo ? v.release || 'Deploy payload' : 'Stage separation';
        const sub = rb.unreachable ? 'never reached' : rb.cargo ? `${fmt.mass(rb.let)} ${v.cargo}`.trim() : rb.done ? low(stages[rb.stage].name) : 'nothing left to separate';
        h += `<li><span class="coast short"></span><button class="step drop${rb.done ? '' : ' lost'}" ${on}><span><b>${what}</b><small>${sub}</small></span></button></li>`;
        return;
      }
      const free = !rb.unreachable && isFree(b), at = rb.unreachable ? null : anchorOf(b, rb), moon = (rb.body || b.body) === 'moon';
      const kind = rb.unreachable || free ? 'Burn' : rb.params.pro > 4e-4 ? 'Prograde burn' : rb.params.pro < -4e-4 ? 'Retrograde burn' : 'Burn';
      const size = rb.unreachable ? '' : modeOf(b) === 'fuel' ? `${fmt.mass(rb.fuelCmd)} of propellant` : modeOf(b) === 'time' ? `${fmt.time(Math.max(1, rb.fuelCmd / rb.mdot))} burn` : free ? fmt.dv(rb.cmd) : fmt.dvSigned(rb.params.pro);
      const where = at ? ` at ${anchorWords[at]}` : moon ? ' at the Moon' : '';
      const sub = rb.unreachable ? 'never reached' : rb.short ? `${fmt.dv(rb.got)}, out of propellant` : size + where;
      const wait = rb.unreachable ? '' : rb.t - prevTime(i) < 1 ? 'no wait' : `coast ${fmt.time(rb.t - prevTime(i))}`;
      h += `<li><span class="coast"><span>${wait}</span></span>`;
      h += `<button class="step${rb.unreachable ? ' lost' : ''}${rb.short ? ' short' : ''}" ${on}><span class="dot">${rb.n}</span><span><b>${kind}</b><small>${sub}</small></span></button></li>`;
    });
    const [what, detail, tone] = outcome(), drop = nextDrop();
    h += `<li><span class="coast short"></span><button class="step add" id="add"><span class="plus">+</span>Add burn</button>`;
    if (drop) h += `<button class="step add" id="add-drop" style="margin-left:8px"><span class="plus">+</span>${drop}</button>`;
    h += `</li><li><span class="coast"></span><span class="step result${tone ? ' ' + tone : ''}"><span><b>${what}</b><small>${detail}</small></span></span></li>`;
    $('strip').innerHTML = h;
  }
  /* A long chain scrolls. Keep its end, the outcome, in sight whenever the selected step can stay in sight too. */
  function showEnd() {
    const strip = $('strip'), chip = strip.querySelector('[aria-pressed="true"]'), over = strip.scrollWidth - strip.clientWidth;
    if (over <= 0) return;
    strip.scrollLeft = chip ? Math.min(over, Math.max(0, chip.offsetLeft - strip.offsetLeft - 6)) : over;
  }
  /* When the burn before this one happened (the coast between them can cross from Earth to the Moon). */
  function prevTime(i) {
    for (let k = i - 1; k >= 0; k--) if (!res.burns[k].drop && !res.burns[k].unreachable) return res.burns[k].t;
    return 0;
  }

  const stat = (id, label) => `<div id="${id}-box"><span>${label}</span><b id="${id}"></b></div>`;
  const numField = (id, label, why) => `<div class="hold plain"${why ? ` title="${why}"` : ''}><span>${label}</span><input class="num" id="${id}" aria-label="${label}"></div>`;
  const holdField = (mode, label, why) => `<div class="hold" data-mode="${mode}"><button data-hold="${mode}" title="${why}">${label}</button><input class="num" id="n-${mode}" aria-label="${label}"></div>`;
  const TRASH = `<button class="icon" id="remove" aria-label="Remove this step" title="Remove this step"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  const moreButton = () => `<button class="quiet" id="more" aria-expanded="${S.more}" title="${S.more ? 'Hide the extra controls' : 'Show every control'}">${S.more ? 'Less' : 'More'}</button>`;

  function renderEditor() {
    const p = plan(), ed = $('editor'), b = p.burns[S.sel];
    if (S.sel < 0 || !b) {
      S.sel = -1;
      const free = !mission().target, groups = [];
      if (free) {
        groups.push(`<div class="group"><span class="group-name">Starting orbit</span><div class="holds">${numField('n-peri', 'Periapsis')}${numField('n-apo', 'Apoapsis')}${numField('n-moon', 'Moon’s position', 'Where the Moon is on its orbit when the journey starts, in degrees round from the right')}</div></div>`);
      }
      if (S.more) groups.push(`<div class="group"><span class="group-name">Engines</span><div class="stats" id="engines"></div></div>`);
      ed.innerHTML = `<div class="rowA"><div class="lead-box"><b class="lead" id="craft"></b><span class="group-foot" id="payload"></span></div>
        <div class="stats">${stat('s-orbit', 'Orbit')}${stat('s-speed', 'Speed')}${stat('s-lap', 'Period')}${stat('s-mass', 'Mass')}</div><span class="spacer"></span>${moreButton()}</div>
        ${groups.length ? `<div class="rowB">${groups.join('')}</div>` : ''}`;
      return;
    }
    if (b.kind === 'drop') {
      ed.innerHTML = `<div class="rowA"><p class="lead-text" id="drop-text"></p><span class="spacer"></span>${TRASH}</div>`;
      return;
    }
    const groups = [];
    if (shown('where', b)) groups.push(`<div class="group"><span class="group-name">Where</span>
      <div class="seg" role="group" aria-label="Where the burn happens"><button data-anchor="peri">Periapsis</button><button data-anchor="apo">Apoapsis</button><button data-anchor="free">Elsewhere</button></div>
      <div class="laps">Coast <button class="nudge sm" data-coast="-1" aria-label="Coast less first">−</button><input class="num tiny" id="n-coast" aria-label="How far to coast before this burn"><button class="nudge sm" data-coast="1" aria-label="Coast more first">+</button><span class="seg mini" role="group" aria-label="Coast unit"><button data-coast-unit="laps">orbits</button><button data-coast-unit="deg">deg</button></span></div></div>`);
    if (shown('hold', b)) groups.push(`<div class="group"><div class="holds">
      ${holdField('dv', 'Delta-v', 'Hold delta-v fixed when earlier steps change')}${holdField('fuel', 'Propellant', 'Hold the propellant burned fixed when earlier steps change')}${holdField('time', 'Burn time', 'Hold the burn time fixed when earlier steps change')}</div>
      <span class="group-foot" id="hold-note"></span></div>`);
    if (shown('dirs', b)) groups.push(`<div class="group"><div class="holds">${numField('n-pro', 'Prograde')}${numField('n-rad', 'Radial')}</div>
      <span class="group-foot"><span id="dir-note"></span> <button class="link" id="straight">Back to straight ahead</button></span></div>`);
    ed.innerHTML = `<div class="rowA">
        <div class="thrust"><button class="nudge" data-nudge="-1" aria-label="A little less">−</button><input type="range" class="warm" id="amt" min="-1000" max="1000" step="1" aria-label="Burn size"><button class="nudge" data-nudge="1" aria-label="A little more">+</button>
          <span class="ends" id="ends"><span>retrograde</span><span>prograde</span></span></div>
        <input class="num main" id="n-main" aria-label="Burn size">
        <div class="stats">${stat('s-where', 'Where')}${stat('s-speed', 'Speed')}</div>
        <span class="group-foot" id="burn-note"></span><span class="spacer"></span>${moreButton()}${TRASH}</div>
      ${groups.length ? `<div class="rowB">${groups.join('')}</div>` : ''}`;
  }

  const HOLD_NOTE = { dv: 'Held: delta-v. Propellant and burn time follow.', fuel: 'Held: propellant. Delta-v follows the craft’s mass.', time: 'Held: burn time. Delta-v follows mass.' };
  const NEVER = 'The craft never gets here. An earlier step sends it somewhere else.';
  function syncEditor() {
    const p = plan(), v = V(), set = (id, t) => { if ($(id)) $(id).textContent = t; }, active = document.activeElement;
    const b = p.burns[S.sel], rb = res.burns[S.sel];
    if (S.sel < 0) {
      const o = res.start, mass = v.payload + v.stages.reduce((m, s, k) => m + s.dry + res.stages[k].loaded, 0);
      set('craft', v.name); set('payload', v.payload ? `carrying a ${fmt.mass(v.payload)} ${v.cargo}` : '');
      set('s-orbit', orbitText(o, radiusOf(res.startBody)) + (res.startBody === 'moon' ? ', Moon' : '')); set('s-speed', fmt.speed(X.len(X.stateAt(o, o.nu).v))); set('s-lap', fmt.time(o.period)); set('s-mass', fmt.mass(mass));
      if ($('engines')) $('engines').innerHTML = v.stages.map((s) => `<div><span>${s.name}</span><b>${engineText(s)}, ${fmt.mass(s.dry)} dry</b></div>`).join('');
      return;
    }
    if (rb.drop) {
      const s = v.stages[rb.stage];
      set('drop-text', rb.unreachable ? NEVER : !rb.done ? 'There is nothing further to separate, so this step does nothing.'
        : rb.cargo ? `Separates the ${fmt.mass(rb.let)} ${v.cargo}. Every burn after this pushes a lighter craft, so the same propellant gives more delta-v.`
          : `Separates the ${low(s.name)}: ${fmt.mass(s.dry)} of dry mass${rb.wasted > 1 ? ` and ${fmt.mass(rb.wasted)} of unburned propellant` : ''}. The ${low(v.stages[rb.stage + 1].name)} takes over.`);
      return;
    }
    const mode = modeOf(b), dead = rb.unreachable, closed = closedBefore(rb), at = dead ? null : anchorOf(b, rb);
    for (const btn of $('editor').querySelectorAll('[data-anchor]')) {
      const which = btn.dataset.anchor;
      btn.disabled = dead || ((which === 'peri' || which === 'apo') && (rb.before.e <= J.ECC_APS || (which === 'apo' && !closed)));
      btn.setAttribute('aria-pressed', !dead && (at || 'free') === which);
    }
    for (const el of $('editor').querySelectorAll('[data-coast], [data-nudge], #amt')) el.disabled = dead;
    for (const el of $('editor').querySelectorAll('[data-coast-unit]')) { el.disabled = dead || (el.dataset.coastUnit === 'laps' && !closed); el.setAttribute('aria-pressed', !dead && coastUnit() === el.dataset.coastUnit); }
    for (const el of $('editor').querySelectorAll('.hold[data-mode]')) el.toggleAttribute('data-on', el.dataset.mode === mode);
    if (dead) { set('s-where', '–'); set('s-speed', '–'); set('burn-note', NEVER); return; }
    const moon = rb.body === 'moon';
    $('amt').min = isFree(b) ? 0 : -1000; $('ends').style.visibility = isFree(b) ? 'hidden' : '';
    if (active !== $('amt') || !inGesture) $('amt').value = slide(rb, mode).from(sizeOf(b, rb, mode));
    set('s-where', `${at ? anchorWords[at].replace(/^./, (c) => c.toUpperCase()) + ', ' : ''}${fmt.dist(rb.alt)} ${moon ? 'above the Moon' : 'altitude'}`);
    set('s-speed', `${num(U().dist * rb.speed0, 2)} → ${fmt.speed(rb.speed1)}`);
    const circular = rb.cmd > 1e-9 && rb.after.e < 0.001 && !rb.short;
    $('burn-note').className = 'group-foot' + (rb.short ? ' bad' : '');
    set('burn-note', rb.short ? `Asked for ${fmt.dv(rb.cmd)}, got ${fmt.dv(rb.got)}.` : circular ? 'Makes the orbit circular.' : '');
    set('hold-note', HOLD_NOTE[mode]);
    set('dir-note', `Radial points away from ${moon ? 'the Moon' : 'Earth'}.`);
    if ($('straight')) $('straight').hidden = !isFree(b);
  }

  /* Point the detail panel at the step it belongs to. */
  function placeCaret() {
    const chip = $('strip').querySelector('[aria-pressed="true"]'), ed = $('editor');
    if (!chip) return;
    const c = chip.getBoundingClientRect(), e = ed.getBoundingClientRect();
    ed.style.setProperty('--caret', `${X.clamp(c.left + Math.min(c.width / 2, 40) - e.left, 18, e.width - 18)}px`);
  }

  function renderBrief() {
    const m = mission(), p = plan(), note = $('note'), flight = flightOf(p), v = V(), stages = v.stages;
    $('count').textContent = `${S.mi + 1} of ${J.MISSIONS.length}`;
    $('title').textContent = flight ? flight.name : m.title;
    $('goal').textContent = flight ? flight.when : m.goal;
    const short = res.burns.find((b) => b.short);
    const st = m.status && m.status(res), fate = fateNote();
    let cls = '', html = !m.target && fate ? fate : m.hint;
    if (flight) html = `${flight.blurb}<span>${flight.note}</span>`;
    else if (chk && chk.ok) {
      cls = 'good';
      const versus = m.ref ? ` The textbook figure is ${fmt.dv(m.ref())}.` : '';
      html = `<strong>${m.done || 'In the target.'}</strong> You used ${fmt.dv(res.dvUsed)}.${versus}<span>${m.insight}</span>`;
    } else if (short) {
      cls = 'bad';
      html = short.spent && short.stage < stages.length - 1
        ? `Burn ${short.n} runs dry: the ${low(stages[short.stage].name)} is empty. Add a Stage separation step before it to light the next stage.`
        : `Burn ${short.n} runs out of propellant partway. ${m.target ? 'Ask for less, or spend less earlier.' : 'Load more, or ask for less.'}`;
    } else if (chk && chk.slow) {
      html = `${m.hint}<span>That reaches the entry corridor, but the long way round: ${fmt.time(res.duration)}. Leave on the other side of the Moon to fall straight home.</span>`;
    } else if (st) { html = `${m.hint}<span${st.bad ? ' class="bad"' : ''}>${st.text.replace('{d}', fmt.dist(st.d || 0))}</span>`; }
    else if (res.status === 'impact') { cls = 'bad'; html = 'This path hits the Moon.'; }
    else if (res.status === 'reentry' && m.target) { cls = 'bad'; html = 'This path falls back into Earth’s atmosphere.'; }
    else if (fate && m.target) html = `${m.hint}<span>${fate}</span>`;
    note.className = 'note ' + cls; note.innerHTML = html;
    $('onward').hidden = !(chk && chk.ok && S.mi < J.MISSIONS.length - 1);
    $('prev').disabled = S.mi === 0; $('next').disabled = S.mi === J.MISSIONS.length - 1;
    const fl = $('flights');
    fl.hidden = !!m.target;
    if (!m.target) {
      if (!fl.firstChild) fl.innerHTML = `<label for="flight">Start from</label><select id="flight">${J.STARTS.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}${J.FLIGHTS.map((f) => `<option value="${f.id}">${f.name}, ${f.when}</option>`).join('')}</select>`;
      $('flight').value = p.flight || p.from || '';
      // Work the famous flights out ahead of time, so choosing one is instant.
      if (!warmed) { warmed = true; setTimeout(() => { for (const f of J.FLIGHTS) if (f.build && !f.made) f.made = f.build(); }, 400); }
    }
  }

  function renderBudget() {
    const p = plan(), f = $('fuel'), stages = V().stages, many = stages.length > 1, pick = $('vehicle');
    // In Free flight, choose among real craft with their published masses.
    $('craft-box').hidden = !!mission().target;
    if (!mission().target) {
      if (pick.options.length !== Object.keys(J.VEHICLES).length) pick.innerHTML = Object.keys(J.VEHICLES).map((k) => `<option value="${k}">${J.VEHICLES[k].name}</option>`).join('');
      pick.value = p.vehicle;
      $('craft-facts').textContent = stages.map((s) => `${many ? s.name + ': ' : ''}${fmt.mass(s.dry)} dry, ${fmt.mass(s.propMax)} propellant, ${engineText(s)}`).join('. ') + '.';
    }
    f.max = stages[S.tank].propMax;
    if (document.activeElement !== f || !inGesture) f.value = p.fuel[S.tank];
    $('tank-name').textContent = 'Propellant';
    $('tanks').hidden = !many;
    if (many) $('tanks').innerHTML = stages.map((s, k) => `<button data-tank="${k}" aria-pressed="${k === S.tank}" title="${s.name}">${k + 1}</button>`).join('');
    const live = res.burns.filter((b) => !b.drop && !b.unreachable);
    const asked = live.reduce((s, b) => s + b.cmd, 0), full = Math.max(res.dvBudget, asked, 1e-6);
    $('meter').innerHTML = live.map((b) => `<i style="width:${b.got / full * 100}%"></i>` + (b.short ? `<i class="over" style="width:${(b.cmd - b.got) / full * 100}%"></i>` : '')).join('');
    $('dv-out').textContent = `${num(res.dvUsed * U().dv)} of ${fmt.dv(res.dvBudget)}`;
    const dry = live.some((b) => b.short);
    $('tank-note').className = 'small' + (dry ? ' bad' : '');
    $('tank-note').hidden = !dry && !S.more;
    $('tank-note').textContent = dry ? 'The tank runs dry.' : `${fmt.mass(res.fuelLeft)} left${many ? ` in the ${low(stages[res.stage].name)}` : ' in the tank'}`;
  }

  /* ---------- pointer on the large picture ---------- */
  const canvas = $('sky');
  const pointer = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const mine = (rb) => !rb.drop && !rb.unreachable && VW.sceneOfBurn(rb) === S.scene;

  /* Let a place on the orbit click onto the nearest point of interest. */
  function snapArg(o, arg, body) {
    const spots = [];
    if (o.e > J.ECC_APS) {
      spots.push({ theta: X.argOfNu(o, 0), anchor: 'peri' });
      if (closedOrbit(o, body)) spots.push({ theta: X.argOfNu(o, Math.PI), anchor: 'apo' });
    }
    let best = { theta: arg, anchor: 'free' }, least = 0.11;
    for (const s of spots) { const d = Math.abs(X.wrapPi(arg - s.theta)); if (d < least) { least = d; best = s; } }
    return best;
  }

  /* Let a drag settle onto an exact value worth having, if one lies within a few pixels: the pass
     110 km above the Moon, or the path that comes home at 6.5 degrees. Both are found by trying
     values either side of the pointer and closing in where the miss changes sign. */
  function settle(apply, x, reach) {
    if (!(reach > 0)) return x;
    const m = mission(), keys = Object.keys(J.aims(m, res));
    if (!keys.length) return x;
    const f = (xi) => { apply(xi); return J.aims(m, J.compute(plan(), V())); };
    const N = 10, xs = [], fs = [];
    for (let i = -N; i <= N; i++) { xs.push(x + reach * i / N); fs.push(f(xs[xs.length - 1])); }
    let best = null;
    for (const k of keys) {
      for (let i = 0; i < 2 * N; i++) {
        const a = fs[i][k], b = fs[i + 1][k];
        if (a == null || b == null || (a > 0) === (b > 0)) continue;
        let lo = xs[i], hi = xs[i + 1], flo = a, ok = true;
        for (let n = 0; n < 36 && ok; n++) {
          const mid = (lo + hi) / 2, fm = f(mid)[k];
          if (fm == null) ok = false; else if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
        }
        const root = (lo + hi) / 2, v = ok ? f(root)[k] : null;
        // A jump (the path hitting the Moon, say) also changes the sign; only a true zero counts.
        if (v != null && Math.abs(v) < (k === 'pass' ? 3 : 0.05) && (best == null || Math.abs(root - x) < Math.abs(best - x))) best = root;
      }
    }
    return best == null ? x : best;
  }

  function pick(m) {
    const ids = res.burns.map((_, i) => i).filter((i) => mine(res.burns[i])).sort((a, b) => (b === S.sel) - (a === S.sel));
    // A burn crowding the selected one is drawn without its arrow, so its bead cannot be grabbed.
    const chosen = res.burns[S.sel], cp = chosen && mine(chosen) ? view.burnGeometry(chosen).p : null;
    for (const i of ids) {
      const g = view.burnGeometry(res.burns[i]);
      if (i !== S.sel && cp && gap(g.p, cp) < 40) continue;
      if (gap(m, g.tip) < 17) return { type: 'dv', i };
    }
    for (const i of ids) if (gap(m, view.burnGeometry(res.burns[i]).p) < 14) return { type: 'node', i };
    // Anywhere on the path after the last step, a click adds the next burn.
    const frame = VW.frameOf(S.scene), w = view.planePoint(m);
    let best = null;
    for (let i = res.tail; i < res.legs.length; i++) {
      const l = res.legs[i], o = l.orbit;
      if (l.body !== frame) continue;
      const s = snapArg(o, X.argOf(o, w), l.body), nu = X.nuOfArg(o, s.theta), r = X.radiusAt(o, nu);
      if (!(r > 0)) continue;
      const at = X.stateAt(o, nu).r, d = gap(m, view.toScreen(at));
      if (d > 12) continue;
      if (l.end !== 'loop') {
        const dn = closedOrbit(o, l.body) ? X.wrapTau(nu - l.nu0) : X.wrapPi(nu) - l.nu0;
        if (dn < -1e-9 || dn > l.sweep) continue;
      }
      if (!best || d < best.d) best = { type: 'add', theta: s.theta, anchor: s.anchor, r: at, body: l.body, hops: l.hops, d };
    }
    return best;
  }

  function addStep(step) {
    const p = plan();
    begin();
    p.burns.push(step);
    if (isBurn(step) && p.burns.filter(isBurn).length > 1) {
      // A burn placed exactly where the craft already is would happen at once; coast one lap instead.
      const r = J.compute(p, V()), rb = r.burns[p.burns.length - 1];
      if (!rb.unreachable && r.legs[rb.legIndex].dt < 1 && closedBefore(rb)) step.revs = 1;
    }
    S.sel = p.burns.length - 1; S.hover = null; selScene = null;
    update(true); commit();
  }
  /* A new burn on one of the legs after the last step. Burns on a leg that comes after a handover
     between Earth and the Moon remember how many handovers come first. */
  function burnOn(leg, theta, anchor) {
    const b = J.newBurn(theta, anchor, leg.body);
    if (leg.hops > (leg.body === 'moon' ? 1 : 0)) b.hops = leg.hops;
    return b;
  }
  /* The Add burn button: put the burn at the most likely place. */
  function addBurnButton() {
    const tailLegs = res.legs.slice(res.tail), final = tailLegs[tailLegs.length - 1], o = res.final;
    const last = plan().burns.filter(isBurn).pop(), lastRb = res.burns.filter((b) => !b.drop && !b.unreachable).pop();
    const pass = tailLegs.find((l) => l.body === 'moon' && l.end !== 'loop');
    if (pass) return addStep(burnOn(pass, X.argOfNu(pass.orbit, 0), 'peri'));   // brake, or boost, at the closest point
    if (res.status === 'lunar' || res.status === 'orbit') {
      if (o.e > J.ECC_APS) return addStep(burnOn(final, X.argOfNu(o, Math.PI), 'apo'));
      return addStep(burnOn(final, lastRb && lastRb.body === final.body ? last.theta + Math.PI : X.argOfNu(o, final.nu0) + Math.PI, 'free'));
    }
    const first = tailLegs[0];
    addStep(burnOn(first, X.argOfNu(first.orbit, first.nu0 + first.sweep / 2), 'free'));
  }

  /* Pulling a burn's bead. Straight burns move along the path; with the direction controls on show
     the pull is free within the orbit plane, clicking onto the prograde and radial lines. */
  function dragBead(b, rb, m) {
    const p0 = view.toScreen(rb.r), off = [m[0] - p0[0], m[1] - p0[1]];
    const along = (u) => { const f = view.flat(u), fl = Math.hypot(f[0], f[1]) || 1; return (off[0] * f[0] + off[1] * f[1]) / fl; };
    let u, reach, onAxis = true;
    if (isFree(b) || shown('dirs', b)) {
      u = X.unit(view.planeVector(off)); onAxis = false;
      const up = X.unit(rb.r);
      for (const a of [rb.pro, X.scale(rb.pro, -1), up, X.scale(up, -1)]) if (X.dot(u, a) > 0.985) { u = a; onAxis = true; break; }
      reach = along(u) - view.D0;
    } else { const s = along(rb.pro); u = X.scale(rb.pro, s < 0 ? -1 : 1); reach = Math.abs(s) - view.D0; }
    const map = view.arrowMap(rb, u);
    let mag = map.toDv(reach), exact = false;
    const forward = X.dot(u, rb.pro);
    if (Math.abs(forward) > 0.999 && rb.atApsis && Math.sign(rb.dvCircular) === Math.sign(forward) && Math.abs(map.toPx(rb.dvCircular) - reach) < 7) {
      mag = Math.abs(rb.dvCircular); exact = true;   // settle onto the burn that makes the orbit circular
    } else if (onAxis) {
      const found = settle((x) => applyVec(b, rb, X.scale(u, x), true), mag, (map.toDv(reach + 6) - map.toDv(reach - 6)) / 2);
      exact = found !== mag; mag = found;
    }
    applyVec(b, rb, X.scale(u, exact ? mag : round3(mag)), exact);
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const m = pointer(e), hit = e.button === 2 ? null : pick(m);
    if (!hit) {   // drag empty space to pan
      moving = { at: m };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (hit.type === 'add') return addStep(burnOn(hit, hit.theta, hit.anchor));
    begin();
    S.sel = hit.i; S.drag = hit; selScene = S.scene;
    if (hit.type === 'dv' && e.shiftKey) plan().burns[hit.i].free = true;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    update(true);
  });

  canvas.addEventListener('pointermove', (e) => {
    const m = pointer(e);
    if (moving) {
      view.panBy(m[0] - moving.at[0], m[1] - moving.at[1]);
      moving.at = m; canvas.style.cursor = 'grabbing'; syncZoom();
      return;
    }
    if (!S.drag) {
      S.hover = pick(m);
      canvas.style.cursor = !S.hover ? 'default' : S.hover.type === 'add' ? 'copy' : 'grab';
      return;
    }
    const b = plan().burns[S.drag.i], rb = res.burns[S.drag.i];
    if (!rb || rb.unreachable) return;
    if (S.drag.type === 'node') {
      const o = rb.before, s = snapArg(o, X.argOf(o, view.planePoint(m)), rb.body);
      if (s.anchor === 'free') s.theta = settle((x) => { b.theta = x; b.anchor = 'free'; }, s.theta, 7 / (X.len(rb.r) * view.cam.scale));
      b.theta = s.theta; b.anchor = s.anchor;
    } else dragBead(b, rb, m);
    update();
  });

  function endDrag() {
    if (moving) { moving = null; canvas.style.cursor = 'default'; }
    if (!S.drag) return;
    S.drag = null; canvas.style.cursor = 'default';
    update(true); commit();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { if (!S.drag) S.hover = null; });

  /* ---------- zoom ---------- */
  function syncZoom() { $('zoom-fit').disabled = view.isHome(); }
  function zoomBy(factor, at) { view.zoomAt(at || view.middle(), factor); syncZoom(); }
  function zoomHome() { view.resetZoom(); syncZoom(); }
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomBy(Math.exp(-(e.deltaY || e.deltaX) * (e.ctrlKey ? 0.012 : 0.0016)), pointer(e));   // Shift turns the wheel sideways
  }, { passive: false });
  canvas.addEventListener('dblclick', (e) => { if (!pick(pointer(e))) zoomHome(); });
  $('zoom-in').addEventListener('click', () => zoomBy(1.4));
  $('zoom-out').addEventListener('click', () => zoomBy(1 / 1.4));
  $('zoom-fit').addEventListener('click', zoomHome);

  /* ---------- panels ---------- */
  $('insets').addEventListener('click', (e) => { const btn = e.target.closest('button'); if (btn) setScene(btn.dataset.scene); });
  $('strip').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'add-drop') return addStep({ kind: 'drop' });
    if (btn.id === 'add') return addBurnButton();
    select(+btn.dataset.sel); update(true);
    const chip = $('strip').querySelector('[aria-pressed="true"]');
    if (chip) chip.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    placeCaret();
  });
  // A long journey scrolls sideways under the wheel.
  $('strip').addEventListener('wheel', (e) => { if ($('strip').scrollWidth > $('strip').clientWidth) { $('strip').scrollLeft += e.deltaY + e.deltaX; e.preventDefault(); } }, { passive: false });

  $('editor').addEventListener('input', (e) => {
    const { b, rb } = cur(), el = e.target;
    if (el.id === 'amt') { begin(); setSize(b, rb, modeOf(b), (modeOf(b) === 'dv' ? round3 : Math.round)(slide(rb, modeOf(b)).to(+el.value))); update(); }
  });
  $('editor').addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'amt') commit();
  });
  $('editor').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const p = plan(), { b, rb } = cur();
    if (btn.id === 'more') { S.more = !S.more; update(true); save(); return; }
    if (btn.dataset.nudge) return nudge(+btn.dataset.nudge, e, true);
    begin();
    if (btn.id === 'remove') { p.burns.splice(S.sel, 1); S.sel = Math.min(S.sel, p.burns.length - 1); selScene = null; }
    else if (btn.id === 'straight') { applyVec(b, rb, X.scale(rb.pro, rb.params.pro), true); b.rad = 0; b.free = false; }
    else if (btn.dataset.coast) setCoast(S.sel, Math.max(0, coastOf(S.sel) + btn.dataset.coast * (coastUnit() === 'deg' ? 5 * D : TAU)));
    else if (btn.dataset.coastUnit) b.coastUnit = btn.dataset.coastUnit;
    else if (btn.dataset.anchor) b.anchor = btn.dataset.anchor;
    else if (btn.dataset.hold && !rb.unreachable) setSize(b, rb, btn.dataset.hold, sizeOf(b, rb, btn.dataset.hold));
    update(true); commit();
  });

  $('fuel').addEventListener('input', (e) => { begin(); plan().fuel[S.tank] = +e.target.value; update(); });
  $('fuel').addEventListener('change', commit);
  $('vehicle').addEventListener('change', (e) => {
    begin();
    const p = plan();
    p.vehicle = e.target.value; delete p.payload; delete p.flight;
    p.fuel = J.fullFuel(V()); p.burns = p.burns.filter(isBurn); S.tank = 0;
    update(true); commit();
  });
  $('tanks').addEventListener('click', (e) => { const btn = e.target.closest('button'); if (btn) { S.tank = +btn.dataset.tank; update(); } });
  $('flights').addEventListener('change', (e) => {
    begin();
    const id = e.target.value, start = J.STARTS.find((s) => s.id === id);
    S.plans.free = J.newPlan(J.FLIGHTS.find((f) => f.id === id) || start || mission());
    if (start && start.id) S.plans.free.from = start.id;
    S.tank = 0; fresh(); commit();
  });

  /* Show a plan from its beginning: first step selected, its picture forward, zoom reset. */
  function fresh() {
    S.hover = null; selScene = null;
    res = J.compute(plan(), V());
    S.sel = plan().burns.length ? 0 : -1;
    const open = mission().scene && !flightOf(plan()) && plan().burns.length === (mission().burns || [0]).length ? mission().scene : sceneOfStep(S.sel) || 'earth';
    selScene = sceneOfStep(S.sel);
    setScene(open, true); view.resetZoom();
    update(true); fitAll(true);
  }
  function goTo(i) {
    S.mi = X.clamp(i, 0, J.MISSIONS.length - 1);
    S.tank = 0;
    fresh(); commit();
  }
  $('prev').addEventListener('click', () => goTo(S.mi - 1));
  $('next').addEventListener('click', () => goTo(S.mi + 1));
  $('onward').addEventListener('click', () => goTo(S.mi + 1));
  $('undo').addEventListener('click', undo);
  $('reset').addEventListener('click', () => { begin(); S.plans[mission().id] = J.newPlan(mission()); fresh(); commit(); });
  function setPlaying(on) { S.playing = on; $('play').textContent = on ? 'Pause' : 'Play'; }
  $('play').addEventListener('click', () => setPlaying(!S.playing));
  function setUnits(u) {
    S.units = u;
    $('unit-metric').setAttribute('aria-pressed', u === 'metric'); $('unit-imperial').setAttribute('aria-pressed', u === 'imperial');
    update(true); save();
  }
  $('unit-metric').addEventListener('click', () => setUnits('metric'));
  $('unit-imperial').addEventListener('click', () => setUnits('imperial'));
  // Playback speed multiplies the automatic pace, which already fits each journey into a comfortable loop.
  $('speed').addEventListener('input', (e) => { S.speed = Math.abs(+e.target.value) < 6 ? 1 : 2 ** (+e.target.value / 50); setPace(); save(); });
  $('speed').addEventListener('dblclick', () => { S.speed = 1; $('speed').value = 0; setPace(); save(); });
  document.addEventListener('pointerdown', (e) => { if (!$('menu').contains(e.target)) $('menu').open = false; });

  G.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isNum(e.target)) { e.preventDefault(); return undo(); }
    if (e.target.matches('input, select') || (e.target.matches('button, summary') && (e.key === ' ' || e.key === 'Enter'))) return;
    const b = plan().burns[S.sel];
    if (e.key === ' ') { e.preventDefault(); setPlaying(!S.playing); }
    else if (e.key === '+' || e.key === '=') zoomBy(1.4);
    else if (e.key === '-') zoomBy(1 / 1.4);
    else if (e.key === '0') zoomHome();
    else if (e.key >= '1' && e.key <= '3') setScene(SCENES[+e.key - 1]);
    else if (isBurn(b) && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) nudge(e.key === 'ArrowRight' ? 1 : -1, e, false);
    else if (b && (e.key === 'Delete' || e.key === 'Backspace')) {
      begin(); plan().burns.splice(S.sel, 1); S.sel = Math.min(S.sel, plan().burns.length - 1); selScene = null; update(true); commit();
    }
  });

  /* ---------- animation ---------- */
  /* A journey here has minutes near Earth and days in between. Played at one steady rate the
     short parts would flash past, so each leg gets a share of the loop that grows more slowly
     than its length. Within a leg time runs evenly, and the Moon always keeps step with the craft. */
  function setPace() {
    let total = res.duration;
    const last = res.legs[res.legs.length - 1];
    if (last.end === 'again') total = last.t0 + X.coastTime(last.orbit, last.nu0, Math.min(last.sweep, TAU) * 0.7);
    if (last.end === 'escape') {   // a path leaving for good is followed only a little past the Moon's orbit
      const nuEdge = X.nuAtRadius(last.orbit, M.a * 1.5);
      if (nuEdge != null && nuEdge > last.nu0) total = last.t0 + X.coastTime(last.orbit, last.nu0, nuEdge - last.nu0);
    }
    const spans = res.legs.map((l) => ({ t0: l.t0, dt: Math.max(0, Math.min(l.t0 + l.dt, total) - l.t0) })).filter((s) => s.dt > 0);
    const weight = spans.reduce((w, s) => w + s.dt ** 0.6, 0), loop = (16 + 3 * plan().burns.length) / S.speed;
    for (const s of spans) s.rate = s.dt / (s.dt ** 0.6 / weight * loop);
    pace = { total, spans };
  }
  const rateAt = (t) => { let r = pace.spans.length ? pace.spans[pace.spans.length - 1].rate : 1; for (const s of pace.spans) if (t < s.t0 + s.dt) { r = s.rate; break; } return r; };

  /* Parts of the screen that labels on the large picture should keep clear of. */
  function busy() {
    const out = [];
    for (const el of [$('title'), $('goal'), $('note'), $('flights'), $('onward'), $('insets')]) {
      if (el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.width) out.push([r.left, r.top, r.right, r.bottom]);
    }
    return out;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000 || 0); lastNow = now;
    const total = pace.total, rate = rateAt(S.simT);
    if (S.playing && !S.drag) {
      if (S.simT >= total) { S.hold += dt; if (S.hold > 0.9) { S.simT = 0; S.hold = 0; } }
      else S.simT = Math.min(total, S.simT + dt * rate);
    }
    let craft = null, pulse = null;
    const t = Math.min(S.simT, total);
    if (!S.drag && S.hold === 0) {
      const step = rate * 0.03, trail = [];
      for (let i = 0; i <= 24; i++) trail.push(J.stateAtTime(res, Math.max(0, t - i * step)));
      craft = { trail };
      res.burns.forEach((rb, i) => {
        if (rb.drop || rb.unreachable) return;
        const f = (t - rb.t) / (rate * 0.8);
        if (f > 0 && f < 1 && S.playing) pulse = { i, f };
      });
    }
    $('pace').textContent = `1 s = ${fmt.time(Math.max(1, rate))}`;
    const st = { res, mission: mission(), chk, sel: S.sel, hover: S.hover, simT: t, craft, pulse, now: reducedMotion ? 0 : now, dragging: !!S.drag, avoid: busy() };
    view.ease(!!S.drag);
    view.draw(st, S.scene);
    for (const k of SCENES) if (k !== S.scene) { insets[k].view.ease(false); insets[k].view.draw(st, k); }
    requestAnimationFrame(frame);
  }

  /* ---------- start ---------- */
  /* The small pictures shrink when the bottom bar grows, so they never reach the toolbar. */
  function sizeInsets() {
    const room = G.innerHeight - dockH - 16 - 66, h = Math.round(X.clamp((room - 10) / 2, 64, 150));
    $('insets').style.setProperty('--inset-h', `${h}px`);
    $('insets').style.setProperty('--inset-w', `${Math.round(h * 4 / 3)}px`);
    for (const k of SCENES) if (k !== S.scene) insets[k].view.resize(0, 0, 0);
  }
  function layout() {
    dockH = $('dock').offsetHeight;
    document.documentElement.style.setProperty('--dock', `${dockH}px`);
    sizeInsets();
    view.resize(44, dockH + 14, 0);
    if (res) fitAll(true);
  }
  load();
  view = VW.create(canvas, fmt);
  for (const k of SCENES) {
    const el = $('insets').querySelector(`[data-scene="${k}"]`);
    insets[k] = { el, view: VW.create(el.querySelector('canvas'), fmt, { small: true }) };
    el.hidden = k === S.scene;
  }
  res = J.compute(plan(), V()); setPace();
  layout();
  setPlaying(S.playing);
  $('speed').value = Math.log2(S.speed) * 50;
  $('unit-metric').setAttribute('aria-pressed', metric()); $('unit-imperial').setAttribute('aria-pressed', !metric());
  fresh();
  $('undo').disabled = true;
  G.addEventListener('resize', () => { layout(); placeCaret(); });
  $('strip').addEventListener('scroll', placeCaret);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => update(true));
  requestAnimationFrame(frame);
  G.Orbit.app = { S, get res() { return res; }, get chk() { return chk; }, get view() { return view; }, insets, update, goTo, setScene, select };
})(globalThis);
