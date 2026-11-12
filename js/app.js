/* State, input and the panels around the canvas. */
(function (G) {
  'use strict';
  const X = G.Orbit.physics, J = G.Orbit.journey;
  const { RE, SOI, TAU } = X, D = J.D;
  const $ = (id) => document.getElementById(id);
  const STORE = 'orbit-garden-v2';
  const TILTED = { tilt: 58, yaw: 22 };
  const reducedMotion = G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = { mi: 0, plans: {}, sel: 0, units: 'metric', speed: 1, more: false, tank: 0, playing: !reducedMotion, simT: 0, hold: 0, drag: null, hover: null, history: [] };
  let view, res, chk, guide = null, inGesture = false, lastNow = 0, moving = null, dockH = 0;

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
  // The craft for this plan. In Free flight the payload can be changed.
  const V = () => { const p = plan(), v = J.VEHICLES[p.vehicle]; return p.payload != null ? Object.assign({}, v, { payload: p.payload }) : v; };
  const round3 = (x) => Math.round(x * 1000) / 1000;
  const cur = () => ({ b: plan().burns[S.sel], rb: res.burns[S.sel] });
  const isBurn = (b) => b && b.kind !== 'drop';
  const flightOf = (p) => J.FLIGHTS.find((f) => f.id === p.flight);
  const orbitText = (o) => (o.e < J.ECC_APS ? `${fmt.dist(o.a - RE)} circular` : `${num((o.rp - RE) * U().dist)} × ${fmt.dist(o.ra - RE)}`) + (o.inc > 0.5 * D ? `, ${fmt.deg(o.inc / D)}` : '');

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
    update(true); commit();
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
  const isFree = (b) => !!b.free || Math.abs(b.rad || 0) > 5e-4 || Math.abs(b.turn || 0) > 5e-3;
  const modeOf = (b) => b.mode || 'dv';
  /* A group of extra controls appears when the player asks for everything, when the mission
     needs it, or when this step already uses it. */
  function shown(group, b) {
    if (S.more || (mission().show || []).includes(group)) return true;
    if (!isBurn(b)) return false;
    if (group === 'where') return (b.revs || 0) > 0 || b.anchor === 'an' || b.anchor === 'dn';
    if (group === 'hold') return modeOf(b) !== 'dv';
    return group === 'dirs' && isFree(b);
  }

  /* ---------- burn size and direction ---------- */
  const localVec = (rb, d, mag) => X.add(X.add(X.scale(rb.pro, d[0] * mag), X.scale(rb.rad, d[1] * mag)), X.scale(rb.nrm, d[2] * mag));
  /* Store a burn given as a delta-v vector, in whichever form this burn is held. */
  function applyVec(b, rb, vec, exact) {
    const mag = X.len(vec);
    if (mag > 1e-9) b.dir = [X.dot(vec, rb.pro) / mag, X.dot(vec, rb.rad) / mag, X.dot(vec, rb.nrm) / mag];
    const q = J.paramsFromDv(rb, rb.before, vec);
    b.pro = exact ? q.pro : round3(q.pro);
    b.rad = Math.abs(q.rad) < 5e-4 ? 0 : exact ? q.rad : round3(q.rad);
    b.turn = Math.abs(q.turn) < 5e-3 ? 0 : exact ? q.turn : Math.round(q.turn * 100) / 100;
    if (modeOf(b) !== 'dv') { const fuel = rb.mass0 * (1 - Math.exp(-mag / rb.ve)); b.amount = b.mode === 'fuel' ? fuel : fuel / rb.mdot; }
    if (b.rad || b.turn) b.free = true;
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
  /* Change one of prograde, radial or plane turn, leaving the other two alone. */
  function setParam(b, rb, key, value) {
    const q = Object.assign({}, rb.params, { [key]: value });
    b.free = true;
    applyVec(b, rb, J.dvFromParams(rb, q.pro, q.rad, q.turn), true);
    if (modeOf(b) === 'dv') { b.pro = q.pro; b.rad = q.rad; b.turn = q.turn; }
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
  const closedBefore = (rb) => !rb.unreachable && rb.before.e < 1 && rb.before.ra < SOI;
  const coastOf = (i) => { const rb = res.burns[i]; return rb && !rb.unreachable && !rb.drop ? res.legs[rb.legIndex].sweep : 0; };
  const coastUnit = () => { const { b, rb } = cur(); return b && rb && closedBefore(rb) && b.coastUnit !== 'deg' ? 'laps' : 'deg'; };
  function placeBefore(i) {   // where the craft is when this step's coast begins
    for (let k = i - 1; k >= 0; k--) if (!res.burns[k].drop) return X.argOf(res.burns[i].before, res.burns[k].r);
    return X.argOf(res.burns[i].before, X.stateAt(res.start, res.start.nu).r);
  }
  function setCoast(i, sweep) {
    const b = plan().burns[i], rb = res.burns[i], closed = closedBefore(rb), laps = (sweep - coastOf(i)) / TAU;
    // A whole number of laps more or less keeps the burn where it is (still at apoapsis, say).
    if (closed && Math.abs(laps - Math.round(laps)) < 1e-6) { b.revs = Math.max(0, (b.revs || 0) + Math.round(laps)); return; }
    b.anchor = 'free'; b.theta = placeBefore(i) + sweep; b.revs = closed ? Math.floor(sweep / TAU + 1e-9) : 0;
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
  const startField = (key, unit, text, lo, hi, step) => ({
    step, get: () => plan().start[key] * unit(), text: () => text(plan().start[key]),
    set: (x) => { const s = plan().start; s[key] = X.clamp(x / unit(), lo, hi); if (s.apo < s.peri) { if (key === 'apo') s.peri = s.apo; else s.apo = s.peri; } },
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
    'n-turn': paramField('turn', () => 1, () => `${num(cur().rb.params.turn, 1)}°`, 0.1),
    'n-coast': {
      dp: () => (coastUnit() === 'deg' ? 1 : 3), step: 1,
      get: () => (coastUnit() === 'deg' ? coastOf(S.sel) / D : coastOf(S.sel) / TAU),
      text: () => { const v = shownValue(FIELDS['n-coast']); return coastUnit() === 'deg' ? fmt.deg(v) : String(Math.round(v * 100) / 100); },
      set: (x, typed) => {   // "45 deg" or "2 laps" switches the unit as well
        if (/deg|°/i.test(typed || '')) cur().b.coastUnit = 'deg'; else if (/lap/i.test(typed || '')) cur().b.coastUnit = 'laps';
        setCoast(S.sel, Math.max(0, x) * (coastUnit() === 'deg' ? D : TAU));
      },
    },
    'n-peri': startField('peri', () => U().dist, fmt.dist, 150, 400000, 10),
    'n-apo': startField('apo', () => U().dist, fmt.dist, 150, 400000, 10),
    'n-inc': startField('inc', () => 1, fmt.deg, 0, 180, 0.5),
  };
  // The main number beside the slider is whichever size this burn holds.
  Object.defineProperty(FIELDS, 'n-main', { get: () => FIELDS[`n-${modeOf(cur().b)}`] });
  const startFieldIds = ['n-load', 'n-payload', 'n-peri', 'n-apo', 'n-inc'];
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
    chk = J.check(m, res) || (p.companion ? J.companion(res, p) : null);
    guide = m.guide ? X.fromElements(J.elementsOf(Object.assign({ inc: 0, argp: 0, raan: p.start.raan, nu: 0 }, m.guide))) : null;
    p.burns.forEach((b, i) => {
      const rb = res.burns[i];
      if (rb.drop || rb.unreachable) return;
      if (b.anchor !== 'free') b.theta = rb.theta;
      if (modeOf(b) !== 'dv') { b.pro = rb.params.pro; b.rad = Math.abs(rb.params.rad) < 5e-4 ? 0 : rb.params.rad; b.turn = Math.abs(rb.params.turn) < 5e-3 ? 0 : rb.params.turn; }
    });
    if (!S.drag) view.fit(res, m, false, p.wide);
    renderStrip();
    if (structural) renderEditor();
    syncEditor(); syncFields(); renderBrief(); renderBudget();
    if ($('dock').offsetHeight !== dockH) layout();
    placeCaret(); syncZoom();
  }

  const anchorWords = { apo: 'apoapsis', peri: 'periapsis', an: 'the equator, northbound', dn: 'the equator, southbound' };
  function anchorOf(b, rb) {
    if ((b.anchor === 'apo' || b.anchor === 'peri') && rb.before.e > J.ECC_APS) return b.anchor;
    if ((b.anchor === 'an' || b.anchor === 'dn') && X.nodeNus(rb.before)) return b.anchor;
    return null;
  }
  function outcome() {
    const o = res.final;
    if (res.status === 'reentry') return ['Reentry', 'falls into the atmosphere'];
    if (res.status === 'escape') return ['Escape', 'leaves Earth'];
    return [o.e < J.ECC_APS ? 'Circular orbit' : 'Elliptical orbit', orbitText(o).replace(' circular', '')];
  }

  function renderStrip() {
    const p = plan(), stages = V().stages;
    let h = `<li><button class="step" data-sel="-1" aria-pressed="${S.sel === -1}"><span class="dot start"></span><span><b>Start</b><small>${orbitText(res.start)}</small></span></button></li>`;
    p.burns.forEach((b, i) => {
      const rb = res.burns[i], on = `data-sel="${i}" aria-pressed="${S.sel === i}"`;
      if (rb.drop) {
        h += `<li><span class="coast short"></span><button class="step drop${rb.done ? '' : ' lost'}" ${on}><span><b>Drop stage</b><small>${rb.unreachable ? 'never reached' : rb.done ? stages[rb.stage].name.toLowerCase() : 'nothing left to drop'}</small></span></button></li>`;
        return;
      }
      const free = !rb.unreachable && isFree(b), at = rb.unreachable ? null : anchorOf(b, rb);
      const kind = rb.unreachable || free ? 'Burn' : rb.params.pro > 4e-4 ? 'Prograde burn' : rb.params.pro < -4e-4 ? 'Retrograde burn' : 'Burn';
      const size = rb.unreachable ? '' : modeOf(b) === 'fuel' ? `${fmt.mass(rb.fuelCmd)} of fuel` : modeOf(b) === 'time' ? `engine on ${fmt.time(Math.max(1, rb.fuelCmd / rb.mdot))}` : free ? fmt.dv(rb.cmd) : fmt.dvSigned(rb.params.pro);
      const sub = rb.unreachable ? 'never reached' : rb.short ? `${fmt.dv(rb.got)}, out of fuel` : size + (at === 'apo' || at === 'peri' ? ` at ${anchorWords[at]}` : '');
      const wait = rb.unreachable ? '' : res.legs[rb.legIndex].dt < 1 ? 'no wait' : `coast ${fmt.time(res.legs[rb.legIndex].dt)}`;
      h += `<li><span class="coast"><span>${wait}</span></span>`;
      h += `<button class="step${rb.unreachable ? ' lost' : ''}${rb.short ? ' short' : ''}" ${on}><span class="dot">${rb.n}</span><span><b>${kind}</b><small>${sub}</small></span></button></li>`;
    });
    const [what, detail] = outcome(), canDrop = p.burns.filter((b) => b.kind === 'drop').length < stages.length - 1;
    h += `<li><span class="coast short"></span><button class="step add" id="add"><span class="plus">+</span>Add burn</button>`;
    if (canDrop) h += `<button class="step add" id="add-drop" style="margin-left:8px"><span class="plus">+</span>Drop stage</button>`;
    h += `</li><li><span class="coast"></span><span class="step result"><span><b>${what}</b><small>${detail}</small></span></span></li>`;
    $('strip').innerHTML = h;
  }

  const stat = (id, label) => `<div id="${id}-box"><span>${label}</span><b id="${id}"></b></div>`;
  const numField = (id, label) => `<div class="hold plain"><span>${label}</span><input class="num" id="${id}" aria-label="${label}"></div>`;
  const holdField = (mode, label, why) => `<div class="hold" data-mode="${mode}"><button data-hold="${mode}" title="${why}">${label}</button><input class="num" id="n-${mode}" aria-label="${label}"></div>`;
  const TRASH = `<button class="icon" id="remove" aria-label="Remove this step" title="Remove this step"><svg viewBox="0 0 16 16" width="16" height="16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  const moreButton = () => `<button class="quiet" id="more" aria-expanded="${S.more}" title="${S.more ? 'Hide the extra controls' : 'Show every control'}">${S.more ? 'Less' : 'More'}</button>`;

  function renderEditor() {
    const p = plan(), ed = $('editor'), b = p.burns[S.sel];
    if (S.sel < 0 || !b) {
      S.sel = -1;
      const free = !mission().target, groups = [];
      if (free) {
        groups.push(`<div class="group"><span class="group-name">Starting orbit</span><div class="holds">${numField('n-peri', 'Periapsis')}${numField('n-apo', 'Apoapsis')}${numField('n-inc', 'Inclination')}</div></div>`);
      }
      if (S.more) groups.push(`<div class="group"><span class="group-name">Engines</span><div class="stats" id="engines"></div></div>`);
      ed.innerHTML = `<div class="rowA"><div class="lead-box"><b class="lead" id="craft"></b><span class="group-foot" id="payload"></span></div>
        <div class="stats">${stat('s-orbit', 'Orbit')}${stat('s-speed', 'Speed')}${stat('s-lap', 'One lap')}${stat('s-mass', 'Mass')}</div><span class="spacer"></span>${moreButton()}</div>
        ${groups.length ? `<div class="rowB">${groups.join('')}</div>` : ''}`;
      return;
    }
    if (b.kind === 'drop') {
      ed.innerHTML = `<div class="rowA"><p class="lead-text" id="drop-text"></p><span class="spacer"></span>${TRASH}</div>`;
      return;
    }
    const groups = [];
    if (shown('where', b)) groups.push(`<div class="group"><span class="group-name">Where</span>
      <div class="seg" role="group" aria-label="Where the burn happens"><button data-anchor="peri">Periapsis</button><button data-anchor="apo">Apoapsis</button><button data-anchor="an" title="Where the orbit crosses the equator heading north">Equator ↑</button><button data-anchor="dn" title="Where the orbit crosses the equator heading south">Equator ↓</button><button data-anchor="free">Elsewhere</button></div>
      <div class="laps">Coast <button class="nudge sm" data-coast="-1" aria-label="Coast less first">−</button><input class="num tiny" id="n-coast" aria-label="How far to coast before this burn"><button class="nudge sm" data-coast="1" aria-label="Coast more first">+</button><span class="seg mini" role="group" aria-label="Coast unit"><button data-coast-unit="laps">laps</button><button data-coast-unit="deg">deg</button></span></div></div>`);
    if (shown('hold', b)) groups.push(`<div class="group"><div class="holds">
      ${holdField('dv', 'Delta-v', 'Hold delta-v fixed when earlier steps change')}${holdField('fuel', 'Fuel', 'Hold the fuel burned fixed when earlier steps change')}${holdField('time', 'Engine on', 'Hold the engine time fixed when earlier steps change')}</div>
      <span class="group-foot" id="hold-note"></span></div>`);
    if (shown('dirs', b)) groups.push(`<div class="group"><div class="holds">${numField('n-pro', 'Prograde')}${numField('n-rad', 'Radial')}${numField('n-turn', 'Plane turn')}</div>
      <span class="group-foot"><span id="dir-note"></span> <button class="link" id="straight">Back to straight ahead</button></span></div>`);
    ed.innerHTML = `<div class="rowA">
        <div class="thrust"><button class="nudge" data-nudge="-1" aria-label="A little less">−</button><input type="range" class="warm" id="amt" min="-1000" max="1000" step="1" aria-label="Burn size"><button class="nudge" data-nudge="1" aria-label="A little more">+</button>
          <span class="ends" id="ends"><span>slow down</span><span>speed up</span></span></div>
        <input class="num main" id="n-main" aria-label="Burn size">
        <div class="stats">${stat('s-where', 'Where')}${stat('s-speed', 'Speed')}${stat('s-tilt', 'Inclination')}</div>
        <span class="group-foot" id="burn-note"></span><span class="spacer"></span>${moreButton()}${TRASH}</div>
      ${groups.length ? `<div class="rowB">${groups.join('')}</div>` : ''}`;
  }

  const HOLD_NOTE = { dv: 'Held: delta-v. Fuel and engine time follow.', fuel: 'Held: fuel. Delta-v follows the craft’s mass.', time: 'Held: engine time. Delta-v follows mass.' };
  function syncEditor() {
    const p = plan(), v = V(), set = (id, t) => { if ($(id)) $(id).textContent = t; }, active = document.activeElement;
    const b = p.burns[S.sel], rb = res.burns[S.sel];
    if (S.sel < 0) {
      const o = res.start, mass = v.payload + v.stages.reduce((m, s, k) => m + s.dry + res.stages[k].loaded, 0);
      set('craft', v.name); set('payload', v.payload ? `carrying a ${fmt.mass(v.payload)} ${v.cargo}` : '');
      set('s-orbit', orbitText(o)); set('s-speed', fmt.speed(X.len(X.stateAt(o, o.nu).v))); set('s-lap', fmt.time(o.period)); set('s-mass', fmt.mass(mass));
      if ($('engines')) $('engines').innerHTML = v.stages.map((s) => `<div><span>${s.name}</span><b>${metric() ? `${num(s.thrust / 1000, s.thrust < 10000 ? 2 : 1)} kN` : `${num(s.thrust * 0.224809)} lbf`}, ${num(s.isp, 1)} s, ${fmt.mass(s.dry)} empty</b></div>`).join('');
      return;
    }
    if (rb.drop) {
      const s = v.stages[rb.stage];
      set('drop-text', rb.unreachable ? 'The craft never gets here. An earlier step ends the journey.' : !rb.done ? 'There is no further stage to switch to, so this step does nothing.'
        : `Lets go of the ${s.name.toLowerCase()}: ${fmt.mass(s.dry)} of structure${rb.wasted > 1 ? ` and ${fmt.mass(rb.wasted)} of unburned fuel` : ''}. The ${v.stages[rb.stage + 1].name.toLowerCase()} takes over.`);
      return;
    }
    const mode = modeOf(b), dead = rb.unreachable, closed = closedBefore(rb), at = dead ? null : anchorOf(b, rb), nodes = !dead && X.nodeNus(rb.before);
    for (const btn of $('editor').querySelectorAll('[data-anchor]')) {
      const which = btn.dataset.anchor;
      btn.hidden = (which === 'an' || which === 'dn') && !nodes;
      btn.disabled = dead || ((which === 'peri' || which === 'apo') && (rb.before.e <= J.ECC_APS || (which === 'apo' && !closed)));
      btn.setAttribute('aria-pressed', !dead && (at || 'free') === which);
    }
    for (const el of $('editor').querySelectorAll('[data-coast], [data-nudge], #amt')) el.disabled = dead;
    for (const el of $('editor').querySelectorAll('[data-coast-unit]')) { el.disabled = dead || (el.dataset.coastUnit === 'laps' && !closed); el.setAttribute('aria-pressed', !dead && coastUnit() === el.dataset.coastUnit); }
    for (const el of $('editor').querySelectorAll('.hold[data-mode]')) el.toggleAttribute('data-on', el.dataset.mode === mode);
    $('s-tilt-box').hidden = true;
    if (dead) { set('s-where', '–'); set('s-speed', '–'); set('burn-note', 'The craft never gets here. An earlier step ends the journey.'); return; }
    $('amt').min = isFree(b) ? 0 : -1000; $('ends').style.visibility = isFree(b) ? 'hidden' : '';
    if (active !== $('amt') || !inGesture) $('amt').value = slide(rb, mode).from(sizeOf(b, rb, mode));
    set('s-where', `${at ? anchorWords[at].replace(/^./, (c) => c.toUpperCase()) + ', ' : ''}${fmt.dist(rb.alt)} up`);
    set('s-speed', `${num(U().dist * rb.speed0, 2)} → ${fmt.speed(rb.speed1)}`);
    const turned = Math.abs(rb.after.inc - rb.before.inc) > 0.02 * D;
    $('s-tilt-box').hidden = !turned;
    if (turned) set('s-tilt', `${num(rb.before.inc / D, 1)} → ${num(rb.after.inc / D, 1)}°`);
    const circular = rb.cmd > 1e-9 && rb.after.e < 0.001 && !rb.short;
    $('burn-note').className = 'group-foot' + (rb.short ? ' bad' : '');
    set('burn-note', rb.short ? `Asked for ${fmt.dv(rb.cmd)}, got ${fmt.dv(rb.got)}.` : circular ? 'Makes the orbit circular.' : '');
    set('hold-note', HOLD_NOTE[mode]);
    set('dir-note', 'Radial points away from Earth. Plane turn swings the path sideways.');
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
    const m = mission(), p = plan(), note = $('note'), flight = flightOf(p), stages = V().stages;
    $('count').textContent = `${S.mi + 1} of ${J.MISSIONS.length}`;
    $('title').textContent = flight ? flight.name : m.title;
    $('goal').textContent = flight ? flight.when : m.goal;
    const short = res.burns.find((b) => b.short);
    let cls = '', html = m.hint;
    if (flight) html = `${flight.blurb}<span>${flight.note}</span>`;
    else if (chk && chk.ok) {
      cls = 'good';
      const versus = !m.ref ? '' : m.refNote ? ' ' + m.refNote.replace('{ref}', fmt.dv(m.ref())) : ` The textbook figure is ${fmt.dv(m.ref())}.`;
      html = `<strong>${m.target.chase ? 'You caught it.' : m.target.site ? 'On target.' : 'In the target.'}</strong> You used ${fmt.dv(res.dvUsed)}.${versus}<span>${m.insight}</span>`;
    } else if (short) {
      cls = 'bad';
      html = short.spent && short.stage < stages.length - 1
        ? `Burn ${short.n} runs dry: the ${stages[short.stage].name.toLowerCase()} is empty. Add a Drop stage step before it to light the next one.`
        : `Burn ${short.n} runs out of fuel partway. Load more fuel, or ask for less.`;
    } else if (res.status === 'reentry' && !(m.target && m.target.reentry)) { cls = 'bad'; html = 'This path dips into the atmosphere and does not come back out.'; }
    else if (res.status === 'escape') html = 'This path leaves Earth and does not come back.';
    else if (m.status) html = `${m.hint}<span>${m.status(res)}</span>`;
    note.className = 'note ' + cls; note.innerHTML = html;
    $('onward').hidden = !(chk && chk.ok && S.mi < J.MISSIONS.length - 1);
    $('prev').disabled = S.mi === 0; $('next').disabled = S.mi === J.MISSIONS.length - 1;
    const fl = $('flights');
    fl.hidden = !!m.target;
    if (!m.target) {
      if (!fl.firstChild) fl.innerHTML = `<label for="flight">Start from</label><select id="flight"><option value="">an empty orbit</option>${J.FLIGHTS.map((f) => `<option value="${f.id}">${f.name}, ${f.when.replace(/^\d+ /, '')}</option>`).join('')}</select>`;
      $('flight').value = p.flight || '';
    }
  }

  function renderBudget() {
    const p = plan(), f = $('fuel'), stages = V().stages, many = stages.length > 1, pick = $('vehicle');
    // In Free flight, choose among real craft with their published masses.
    $('craft-box').hidden = !!mission().target;
    if (!mission().target) {
      if (pick.options.length !== Object.keys(J.VEHICLES).length) pick.innerHTML = Object.keys(J.VEHICLES).map((k) => `<option value="${k}">${J.VEHICLES[k].name}</option>`).join('');
      pick.value = p.vehicle;
      $('craft-facts').textContent = stages.map((s) => `${many ? s.name + ': ' : ''}${fmt.mass(s.dry)} empty, ${fmt.mass(s.propMax)} of fuel, ${metric() ? `${num(s.thrust / 1000, s.thrust < 10000 ? 2 : 1)} kN` : `${num(s.thrust * 0.224809)} lbf`}, ${num(s.isp, 1)} s`).join('. ') + '.';
    }
    f.max = stages[S.tank].propMax;
    if (document.activeElement !== f || !inGesture) f.value = p.fuel[S.tank];
    $('tank-name').textContent = many ? 'Fuel' : 'Fuel loaded';
    $('tanks').hidden = !many;
    if (many) $('tanks').innerHTML = stages.map((s, k) => `<button data-tank="${k}" aria-pressed="${k === S.tank}" title="${s.name}">${k + 1}</button>`).join('');
    const live = res.burns.filter((b) => !b.drop && !b.unreachable);
    const asked = live.reduce((s, b) => s + b.cmd, 0), full = Math.max(res.dvBudget, asked, 1e-6);
    $('meter').innerHTML = live.map((b) => `<i style="width:${b.got / full * 100}%"></i>` + (b.short ? `<i class="over" style="width:${(b.cmd - b.got) / full * 100}%"></i>` : '')).join('');
    $('dv-out').textContent = `${num(res.dvUsed * U().dv)} of ${fmt.dv(res.dvBudget)}`;
    const dry = live.some((b) => b.short);
    $('tank-note').className = 'small' + (dry ? ' bad' : '');
    $('tank-note').hidden = !dry && !S.more;
    $('tank-note').textContent = dry ? 'The tank runs dry.' : `${fmt.mass(res.fuelLeft)} left${many ? ` in the ${stages[res.stage].name.toLowerCase()}` : ' in the tank'}`;
  }

  /* ---------- pointer on the canvas ---------- */
  const canvas = $('sky');
  const pointer = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  /* Places where an orbit meets the mission's dashed guide orbit, as angles round the orbit. */
  function crossings(o) {
    if (!guide || o.e >= 1 || Math.abs(X.dot(o.W, guide.W)) < 0.9999) return [];
    const diff = (a) => {
      const d = X.add(X.scale(o.R, Math.cos(a)), X.scale(o.S, Math.sin(a)));
      return X.radiusAt(o, X.nuOfArg(o, a)) - X.radiusAt(guide, Math.atan2(X.dot(d, guide.Q), X.dot(d, guide.P)));
    };
    const out = [];
    for (let i = 0, prev = diff(0); i < 720; i++) {
      const a1 = (i + 1) / 720 * TAU, next = diff(a1);
      if (prev * next < 0) out.push(a1 - TAU / 720 * next / (next - prev));
      prev = next;
    }
    return out;
  }
  /* Let a place on the orbit click onto the nearest point of interest. */
  function snapArg(o, arg) {
    const spots = [];
    if (o.e > J.ECC_APS) {
      spots.push({ theta: X.argOfNu(o, 0), anchor: 'peri' });
      if (o.e < 1 && o.ra < SOI) spots.push({ theta: X.argOfNu(o, Math.PI), anchor: 'apo' });
    }
    const nodes = X.nodeNus(o);
    if (nodes) spots.push({ theta: X.argOfNu(o, nodes.an), anchor: 'an' }, { theta: X.argOfNu(o, nodes.dn), anchor: 'dn' });
    for (const a of crossings(o)) spots.push({ theta: a, anchor: 'free', exact: true });
    let best = { theta: arg, anchor: 'free' }, least = 0.11;
    for (const s of spots) { const d = Math.abs(X.wrapPi(arg - s.theta)); if (d < least) { least = d; best = s; } }
    return best;
  }

  /* On missions with something to meet (another craft, a landing zone, a direction), let a drag
     settle onto the exact value that closes the gap, if one lies within a few pixels. */
  function settle(apply, x, reach) {
    const tol = chk ? chk.tol : 0;
    if (!tol || !(reach > 0)) return x;
    let best = x, least = Infinity, centre = x;
    for (let pass = 0, half = reach; pass < 3; pass++, half /= 8) {
      for (let i = -8; i <= 8; i++) {
        const xi = centre + half * i / 8;
        apply(xi);
        const m = J.check(mission(), J.compute(plan(), V())).miss;
        if (m != null && Math.abs(m) < least) { least = Math.abs(m); best = xi; }
      }
      centre = best;
    }
    return least < tol * 0.2 ? best : x;
  }

  function pick(m) {
    const ids = res.burns.map((_, i) => i).filter((i) => !res.burns[i].drop && !res.burns[i].unreachable).sort((a, b) => (b === S.sel) - (a === S.sel));
    for (const i of ids) if (gap(m, view.burnGeometry(res.burns[i]).tip) < 17) return { type: 'dv', i };
    for (const i of ids) if (gap(m, view.burnGeometry(res.burns[i]).p) < 14) return { type: 'node', i };
    const o = res.final, fl = res.legs[res.legs.length - 1], w = view.planePoint(m, o);
    if (!w) return null;
    const s = snapArg(o, X.argOf(o, w)), nu = X.nuOfArg(o, s.theta), r = X.radiusAt(o, nu);
    if (!(r > 0)) return null;
    const at = X.stateAt(o, nu).r;
    if (gap(m, view.toScreen(at)) > 12) return null;
    if (res.status !== 'orbit') {
      const d = o.e < 1 && o.ra < SOI ? X.wrapTau(nu - fl.nu0) : X.wrapPi(nu) - fl.nu0;
      if (d < 0 || d > fl.sweep) return null;
    }
    return { type: 'add', theta: s.theta, anchor: s.anchor, r: at };
  }

  function addStep(step) {
    const p = plan();
    begin();
    p.burns.push(step);
    if (isBurn(step) && p.burns.filter(isBurn).length > 1) {
      // A burn placed exactly where the craft already is would happen at once; coast one lap instead.
      const r = J.compute(p, V()), rb = r.burns[p.burns.length - 1];
      if (!rb.unreachable && r.legs[rb.legIndex].dt < 1 && rb.before.e < 1) step.revs = 1;
    }
    S.sel = p.burns.length - 1; S.hover = null;
    update(true); commit();
  }

  /* Pulling a burn's bead. Straight burns move along the path; with the direction controls on show
     the pull is free within the orbit plane, clicking onto the prograde and radial lines. */
  function dragBead(b, rb, m) {
    const p0 = view.toScreen(rb.r), off = [m[0] - p0[0], m[1] - p0[1]];
    const along = (u) => { const f = view.flat(u), fl = Math.hypot(f[0], f[1]), k = Math.max(fl, 0.35); return fl > 1e-6 ? (off[0] * f[0] + off[1] * f[1]) / fl / k : -off[1] / k; };
    const planar = Math.abs(rb.params.turn) < 5e-3;
    let u, reach, onAxis = true;
    if (planar && (isFree(b) || shown('dirs', b))) {
      const w = view.planeVector(off, rb.pro, rb.rad);
      if (!w) return;
      u = X.unit(w); onAxis = false;
      const up = X.unit(rb.r);
      for (const a of [rb.pro, X.scale(rb.pro, -1), up, X.scale(up, -1)]) if (X.dot(u, a) > 0.985) { u = a; onAxis = true; break; }
      reach = along(u) - view.D0;
    } else if (!planar) { u = X.unit(rb.cmd > 1e-9 ? rb.want : rb.pro); reach = along(u) - view.D0; }
    else { const s = along(rb.pro); u = X.scale(rb.pro, s < 0 ? -1 : 1); reach = Math.abs(s) - view.D0; }
    const map = view.arrowMap(rb, u);
    let mag = map.toDv(reach), exact = false;
    const forward = X.dot(u, rb.pro);
    if (planar && Math.abs(forward) > 0.999 && rb.atApsis && Math.sign(rb.dvCircular) === Math.sign(forward) && Math.abs(map.toPx(rb.dvCircular) - reach) < 7) {
      mag = Math.abs(rb.dvCircular); exact = true;   // settle onto the burn that makes the orbit circular
    } else if (onAxis) {
      const found = settle((x) => applyVec(b, rb, X.scale(u, x), true), mag, (map.toDv(reach + 8) - map.toDv(reach - 8)) / 2);
      exact = found !== mag; mag = found;
    }
    applyVec(b, rb, X.scale(u, exact ? mag : round3(mag)), exact);
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const m = pointer(e), hit = e.button === 2 ? null : pick(m);
    // Drag empty space to pan; with Shift or the right button, to turn the view. A Shift-drag that
    // happens to start on the orbit line turns the view too, and does not add a burn.
    if (!hit || (hit.type === 'add' && e.shiftKey)) {
      moving = { at: m, turn: e.shiftKey || e.button === 2 };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (hit.type === 'add') return addStep(J.newBurn(hit.theta, hit.anchor));
    begin();
    S.sel = hit.i; S.drag = hit;
    if (hit.type === 'dv' && e.shiftKey) plan().burns[hit.i].free = true;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    update(true);
  });

  canvas.addEventListener('pointermove', (e) => {
    const m = pointer(e);
    if (moving) {
      const dx = m[0] - moving.at[0], dy = m[1] - moving.at[1];
      if (moving.turn) view.rotateBy(dx, dy); else view.panBy(dx, dy);
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
      const w = view.planePoint(m, rb.before);
      if (!w) return;
      const s = snapArg(rb.before, X.argOf(rb.before, w));
      if (s.anchor === 'free' && !s.exact) s.theta = settle((x) => { b.theta = x; b.anchor = 'free'; }, s.theta, 8 / (X.len(rb.r) * view.cam.scale));
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

  /* ---------- zoom and tilt ---------- */
  const wantsTilt = () => !!mission().view || plan().start.inc > 1;
  function syncZoom() {
    $('zoom-fit').disabled = view.isHome();
    $('tilt').hidden = !(wantsTilt() || S.more || view.is3D());
    $('tilt').setAttribute('aria-pressed', view.is3D());
  }
  function zoomBy(factor, at) { view.zoomAt(at || view.middle(), factor); syncZoom(); }
  function zoomHome() { view.resetZoom(); syncZoom(); }
  function homeView(instant) { view.setView(wantsTilt() ? mission().view || TILTED : null, instant); zoomHome(); }
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomBy(Math.exp(-(e.deltaY || e.deltaX) * (e.ctrlKey ? 0.012 : 0.0016)), pointer(e));   // Shift turns the wheel sideways
  }, { passive: false });
  canvas.addEventListener('dblclick', (e) => { if (!pick(pointer(e))) zoomHome(); });
  $('zoom-in').addEventListener('click', () => zoomBy(1.4));
  $('zoom-out').addEventListener('click', () => zoomBy(1 / 1.4));
  $('zoom-fit').addEventListener('click', zoomHome);
  $('tilt').addEventListener('click', () => { view.setView(view.is3D() ? null : TILTED); syncZoom(); });

  /* ---------- panels ---------- */
  $('strip').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'add-drop') return addStep({ kind: 'drop' });
    if (btn.id === 'add') {
      const o = res.final, last = plan().burns.filter(isBurn).pop();
      if (res.status === 'orbit' && o.e > J.ECC_APS) addStep(J.newBurn(X.argOfNu(o, Math.PI), 'apo'));
      else addStep(J.newBurn(last ? last.theta + Math.PI : res.startTheta, 'free'));
      return;
    }
    S.sel = +btn.dataset.sel; update(true);
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
    if (btn.id === 'remove') { p.burns.splice(S.sel, 1); S.sel = Math.min(S.sel, p.burns.length - 1); }
    else if (btn.id === 'straight') { applyVec(b, rb, X.scale(rb.pro, rb.params.pro), true); b.rad = b.turn = 0; b.free = false; }
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
    S.plans.free = J.newPlan(J.FLIGHTS.find((f) => f.id === e.target.value) || mission());
    S.sel = 0; S.tank = 0;
    homeView(); update(true); view.fit(res, mission(), false, plan().wide); commit();
  });

  function goTo(i) {
    S.mi = X.clamp(i, 0, J.MISSIONS.length - 1);
    S.sel = plan().burns.length ? 0 : -1; S.hover = null; S.tank = 0;
    homeView(); update(true); commit();
  }
  $('prev').addEventListener('click', () => goTo(S.mi - 1));
  $('next').addEventListener('click', () => goTo(S.mi + 1));
  $('onward').addEventListener('click', () => goTo(S.mi + 1));
  $('undo').addEventListener('click', undo);
  $('reset').addEventListener('click', () => { begin(); S.plans[mission().id] = J.newPlan(mission()); S.sel = 0; homeView(); update(true); commit(); });
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
  $('speed').addEventListener('input', (e) => { S.speed = Math.abs(+e.target.value) < 6 ? 1 : 2 ** (+e.target.value / 50); save(); });
  $('speed').addEventListener('dblclick', () => { S.speed = 1; $('speed').value = 0; save(); });
  document.addEventListener('pointerdown', (e) => { if (!$('menu').contains(e.target)) $('menu').open = false; });

  G.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isNum(e.target)) { e.preventDefault(); return undo(); }
    if (e.target.matches('input, select') || (e.target.matches('button, summary') && (e.key === ' ' || e.key === 'Enter'))) return;
    const b = plan().burns[S.sel];
    if (e.key === ' ') { e.preventDefault(); setPlaying(!S.playing); }
    else if (e.key === '+' || e.key === '=') zoomBy(1.4);
    else if (e.key === '-') zoomBy(1 / 1.4);
    else if (e.key === '0') zoomHome();
    else if (isBurn(b) && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) nudge(e.key === 'ArrowRight' ? 1 : -1, e, false);
    else if (b && (e.key === 'Delete' || e.key === 'Backspace')) {
      begin(); plan().burns.splice(S.sel, 1); S.sel = Math.min(S.sel, plan().burns.length - 1); update(true); commit();
    }
  });

  /* ---------- animation ---------- */
  function shownDuration() {
    const fl = res.legs[res.legs.length - 1];
    if (fl.end !== 'escape') return res.duration;
    const nuEdge = X.nuAtRadius(fl.orbit, view.viewRadius() * 1.3);
    return nuEdge != null && nuEdge > fl.nu0 ? fl.t0 + X.coastTime(fl.orbit, fl.nu0, nuEdge - fl.nu0) : res.duration;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000 || 0); lastNow = now;
    const total = shownDuration(), rate = total / (16 + 3 * plan().burns.length) * S.speed;
    if (S.playing && !S.drag) {
      if (S.simT >= total) { S.hold += dt; if (S.hold > 0.9) { S.simT = 0; S.hold = 0; } }
      else S.simT = Math.min(total, S.simT + dt * rate);
    }
    let craft = null, pulse = null;
    if (!S.drag && S.hold === 0) {
      const t = Math.min(S.simT, total), step = rate * 0.03, trail = [];
      for (let i = 0; i <= 24; i++) trail.push(J.stateAtTime(res, Math.max(0, t - i * step)).r);
      craft = { r: trail[0], trail };
      res.burns.forEach((rb, i) => {
        if (rb.drop || rb.unreachable) return;
        const f = (t - rb.t) / (rate * 0.8);
        if (f > 0 && f < 1 && S.playing) pulse = { i, f };
      });
    }
    $('pace').textContent = `1 s = ${fmt.time(Math.max(1, rate))}`;
    view.ease(!!S.drag);
    view.draw({ res, mission: mission(), chk, guide, sel: S.sel, hover: S.hover, simT: Math.min(S.simT, total), craft, pulse, now: reducedMotion ? 0 : now, dragging: !!S.drag });
    requestAnimationFrame(frame);
  }

  /* ---------- start ---------- */
  function layout() {
    dockH = $('dock').offsetHeight;
    document.documentElement.style.setProperty('--dock', `${dockH}px`);
    view.resize(44, dockH + 14);
    if (res) view.fit(res, mission(), true, plan().wide);
  }
  load();
  view = G.Orbit.view.create(canvas, fmt);
  layout();
  setPlaying(S.playing);
  $('speed').value = Math.log2(S.speed) * 50;
  $('unit-metric').setAttribute('aria-pressed', metric()); $('unit-imperial').setAttribute('aria-pressed', !metric());
  S.sel = plan().burns.length ? 0 : -1;
  view.setView(wantsTilt() ? mission().view || TILTED : null, true);
  update(true);
  view.fit(res, mission(), true, plan().wide);
  $('undo').disabled = true;
  G.addEventListener('resize', () => { layout(); placeCaret(); });
  $('strip').addEventListener('scroll', placeCaret);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => update(true));
  requestAnimationFrame(frame);
  G.Orbit.app = { S, get res() { return res; }, get chk() { return chk; }, get view() { return view; }, update, goTo };
})(globalThis);
