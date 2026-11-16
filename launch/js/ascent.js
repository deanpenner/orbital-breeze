/* Orbital Breeze, Launch page: the climb from the pad to orbit.
   A rocket is flown step by step in the plane of its orbit: thrust, gravity, air drag and the
   curve of the Earth. It rises straight up, tips over by a small angle (the pitch-over), then
   keeps its thrust along its path and lets gravity bend that path toward the horizon: a gravity
   turn. The upper stage burns until the high point of its path reaches the target altitude,
   coasts up to it, and burns once more to make the orbit circular. No UI in this file. */
(function (G) {
  'use strict';
  const MU = 398600.4418, RE = 6378.137, G0 = 9.80665e-3;   // km, s, kg; G0 in km/s²
  const DAY = 86164.0905, SPIN = 2 * Math.PI / DAY;          // one turn of the Earth, rad/s
  const D = Math.PI / 180;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  /* Air: density falls by a factor e every 7.2 km. Good to a fifth or so up to 100 km. */
  const SCALE = 7.2, RHO0 = 1.225e9;                          // kg/km³ at sea level
  const air = (h) => (h > 150 ? 0 : RHO0 * Math.exp(-Math.max(h, 0) / SCALE));

  /* The reference rocket: a two-stage kerosene launcher with Falcon 9's published figures
     (sources in launch/README.md). Thrust in kN, masses in kg, specific impulse in seconds.
     `held` is the share of each stage's propellant kept back as reserve and unburnable residue:
     an assumption, set once so that the due-east payload from Cape Canaveral lands near the
     published 22,800 kg. Drag coefficient and fairing mass are estimates too. */
  const HELD = 0.015;
  const stage = (name, dry, gross, thrustVac, thrustSea, ispVac) => {
    const load = gross - dry;
    return { name, dry: dry + load * HELD, prop: load * (1 - HELD), load, thrustVac, thrustSea, ispVac };
  };
  const ROCKET = {
    name: 'Falcon 9, expendable',
    area: 10.52e-6, cd: 0.5,                                  // 3.66 m across, in km²
    fairing: 1900, fairingOff: 110,                           // let go once the air is thin (km)
    stages: [stage('First stage', 22200, 433100, 8227, 7607, 311), stage('Second stage', 4000, 111500, 934, 934, 348)],
    published: 22800,                                         // kg to low orbit at 28.5°, due east from Cape Canaveral
  };
  const MAXQ = 45;   // kPa: past this the air would break the rocket (Falcon 9 flies through about 30 to 35)

  /* How fast the ground moves east at a latitude, km/s. */
  const groundSpeed = (lat) => SPIN * RE * Math.cos(lat * D);
  /* Inclination of the orbit reached by flying a heading (degrees clockwise from north) from a latitude. */
  const inclination = (lat, az) => Math.acos(clamp(Math.cos(lat * D) * Math.sin(az * D), -1, 1)) / D;
  /* The headings that reach an inclination from a latitude: [north-going, south-going], or null. */
  function headingsFor(lat, inc) {
    const s = Math.cos(inc * D) / Math.cos(lat * D);
    if (Math.abs(s) > 1) return null;
    const a = Math.asin(s) / D;
    return [(a + 360) % 360, 180 - a];
  }

  const PARK = 200;   // km: orbits above this are reached by way of an ellipse from here

  /* Fly one climb.
     o: { lat, az (heading, degrees clockwise from north), kick (degrees tipped from vertical at
          pitch-over), alt (target altitude, km), payload (kg) }
     The first stage flies a gravity turn. The upper stage steers so that it levels off at the
     insertion altitude just as it reaches the speed it needs there: its upward push changes
     evenly with time (the "linear tangent" law real launchers approximate). Returns the flight. */
  function fly(o, rocket) {
    rocket = rocket || ROCKET;
    const [s1, s2] = rocket.stages;
    const rT = RE + o.alt, rI = RE + Math.min(o.alt, PARK);   // target, and where the engine first cuts off
    const vCut = Math.sqrt(MU * (2 / rI - 2 / (rI + rT)));    // speed at the low end of the ellipse up to the target
    const head = groundSpeed(o.lat) * Math.sin(o.az * D);     // the part of Earth's spin along the path
    const cross = groundSpeed(o.lat) * Math.cos(o.az * D);    // the part across it, which must be steered out
    let r = RE, th = 0, vr = 0, vt = head, t = 0;
    let stage = 0, prop = s1.prop, fairing = rocket.fairing;
    let m = s1.dry + s1.prop + s2.dry + s2.prop + fairing + o.payload;
    let spent = 0, drag = 0, maxQ = 0, qAt = 0, qX = 0, phase = 'rise', why = null, staging = null, kicked = 0;
    let pitch = 0, done = false;
    const path = [], dt = 0.5, kick = o.kick * D;

    const deriv = (y, mass) => {
      const [R, , VR, VT] = y, h = R - RE, st = rocket.stages[stage];
      const ar = VR, at = VT - head * (R / RE), va = Math.hypot(ar, at);   // velocity through the air, which turns with the ground
      const q = 0.5 * air(h) * va * va;                        // kg/(km s²), which is 1e-6 kPa
      const Dm = q * rocket.cd * rocket.area / mass;           // km/s²
      const T = (st.thrustVac - (st.thrustVac - st.thrustSea) * Math.exp(-Math.max(h, 0) / SCALE)) / mass;   // 1 kN = 1 kg km/s²
      let ur = 1, ut = 0;
      if (stage === 1) { ur = Math.sin(pitch); ut = Math.cos(pitch); }
      else if (phase === 'kick') { ur = Math.cos(kick); ut = Math.sin(kick); }
      else if (phase === 'turn' && va > 1e-6) { ur = ar / va; ut = at / va; }
      const g = MU / (R * R);
      return { d: [VR, VT / R, VT * VT / R - g + T * ur - (va > 0 ? Dm * ar / va : 0), -VR * VT / R + T * ut - (va > 0 ? Dm * at / va : 0)],
        T, Dm, q };
    };

    for (let n = 0; n < 4000 && !why && !done; n++) {
      const st = rocket.stages[stage], h = r - RE, v = Math.hypot(vr, vt);
      if (n % 4 === 0) path.push({ t, x: th * RE, h, v, stage });
      if (phase === 'rise' && h > 0.25) { phase = 'kick'; kicked = t; }
      else if (phase === 'kick') { const at = vt - head * (r / RE); if (Math.atan2(at, vr) >= kick || t - kicked > 25) phase = 'turn'; }
      if (fairing && h > rocket.fairingOff) { m -= fairing; fairing = 0; }
      const mdot = st.thrustVac / (st.ispVac * G0);            // kg/s
      let burn = Math.min(dt, prop / mdot);
      if (burn <= 1e-9) {
        if (stage === 0) { staging = { t, h, v, x: th * RE }; m -= s1.dry; stage = 1; prop = s2.prop; continue; }
        why = 'short'; break;
      }
      if (stage === 1) {
        // Upper-stage steering: how long is left, and the upward push that levels off at rI by then.
        const aT = st.thrustVac / m, go = vCut - vt;
        if (go <= 0) { done = true; break; }
        const tgo = Math.max(6, (m / mdot) * (1 - Math.exp(-go / (st.ispVac * G0))) / Math.max(0.5, Math.cos(pitch)));
        const up = (6 * (rI - r) - 4 * vr * tgo) / (tgo * tgo);
        pitch = Math.asin(clamp((up + MU / (r * r) - vt * vt / r) / aT, -0.7, 0.92));
        burn = Math.min(burn, go / (aT * Math.cos(pitch)) + 1e-6);
        if (h < 40 && vr < 0) { why = 'falls'; break; }
      }
      // RK4 over the burn, mass falling as it goes
      const y0 = [r, th, vr, vt], mm = m - mdot * burn / 2, me = m - mdot * burn;
      const k1 = deriv(y0, m), y1 = y0.map((x, i) => x + k1.d[i] * burn / 2);
      const k2 = deriv(y1, mm), y2 = y0.map((x, i) => x + k2.d[i] * burn / 2);
      const k3 = deriv(y2, mm), y3 = y0.map((x, i) => x + k3.d[i] * burn);
      const k4 = deriv(y3, me);
      [r, th, vr, vt] = y0.map((x, i) => x + burn / 6 * (k1.d[i] + 2 * k2.d[i] + 2 * k3.d[i] + k4.d[i]));
      spent += k2.T * burn; drag += k2.Dm * burn;
      if (k2.q * 1e-6 > maxQ) { maxQ = k2.q * 1e-6; qAt = y1[0] - RE; qX = y1[1] * RE; }
      if (maxQ > MAXQ) { why = 'maxq'; t += burn; break; }       // the air breaks it: nothing after this happens
      m = me; prop -= mdot * burn; t += burn;
      if (r < RE) { why = 'falls'; break; }
    }
    if (!why && !done) why = 'short';
    const out = { ok: false, why, payload: o.payload, path, staging, maxQ, qAt, qX, head, cross, burnTime: t, end: { t, x: th * RE, h: r - RE } };
    if (why) return out;

    // The orbit at engine cutoff, and the second burn if the target is higher up.
    const v = Math.hypot(vr, vt), en = v * v / 2 - MU / r, hm = r * vt, a = -MU / (2 * en), e = Math.sqrt(Math.max(0, 1 + 2 * en * hm * hm / (MU * MU)));
    const rp = a * (1 - e), ra = a * (1 + e);
    out.cutoff = { t, h: r - RE, v, x: th * RE }; out.insertion = { peri: rp - RE, apo: ra - RE };
    if (rp - RE < 120) { out.why = 'falls'; return out; }      // dips back into the air
    let circ = 0, coast = 0, speed = v;
    if (o.alt > PARK + 1) {
      const va = hm / ra, vc = Math.sqrt(MU / ra);
      circ = vc - va; speed = vc; coast = Math.PI * Math.sqrt(a * a * a / MU);
      const need = m * (1 - Math.exp(-circ / (s2.ispVac * G0)));
      if (need > prop) { out.why = 'short'; return out; }
      prop -= need; spent += circ;
      for (let k = 1; k <= 30; k++) {
        const f = Math.PI * k / 30, rr = a * (1 - e * e) / (1 + e * Math.cos(f));
        path.push({ t: t + coast * k / 30, x: (th + f) * RE, h: rr - RE, v: Math.sqrt(MU * (2 / rr - 1 / a)), stage: 2 });
      }
    }
    // What the rocket spent, sorted into four piles that add up exactly:
    //   spent = orbital speed - help from Earth's spin + lost to gravity + lost to air drag
    // Steering out the sideways part of the spin is charged against the spin's help. Everything
    // spent holding the rocket up while it climbs and turns is "gravity".
    const side = Math.hypot(speed - head, cross) - (speed - head);
    spent += side;
    const spin = head - side;
    Object.assign(out, { ok: true, speed, spent, spin, drag, gravity: spent - (speed - spin) - drag, circ, coast, time: t + coast, left: prop });
    return out;
  }

  /* The heaviest payload that reaches the orbit, by bisection. Returns the flight carrying it, or
     the failed flight if nothing works. A rocket that is too light can fail too: it gets fast
     while still low, and the air pressure breaks it. So 'maxq' sends the search heavier. */
  function best(o, rocket) {
    let lo = 0, hi = 60000, good = null, bad = null;
    const first = fly(Object.assign({}, o, { payload: 0 }), rocket);
    if (first.ok) good = first; else if (first.why !== 'maxq') return first; else bad = first;
    for (let k = 0; k < 16; k++) {
      const mid = (lo + hi) / 2, f = fly(Object.assign({}, o, { payload: mid }), rocket);
      if (f.ok) { lo = mid; good = f; } else if (f.why === 'maxq' && !good) { lo = mid; bad = f; } else { hi = mid; if (!good && f.why !== 'short') bad = f; }
    }
    return good || bad;
  }

  /* Where the flight passes over the ground: [{ t, lat, lon, part }] with part 'climb' or 'orbit'.
     The orbit's plane stays put while the Earth turns under it, so the track drifts west. */
  function track(o, flight, orbits) {
    const la = o.lat * D, lo = o.lon * D, az = o.az * D;
    const p0 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
    const east = [-Math.sin(lo), Math.cos(lo), 0], north = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
    const d0 = [0, 1, 2].map((i) => Math.sin(az) * east[i] + Math.cos(az) * north[i]);
    const at = (t, th, part) => {
      const p = [0, 1, 2].map((i) => Math.cos(th) * p0[i] + Math.sin(th) * d0[i]);
      let lon = (Math.atan2(p[1], p[0]) - SPIN * t) / D;
      lon = ((lon + 180) % 360 + 360) % 360 - 180;
      return { t, lat: Math.asin(clamp(p[2], -1, 1)) / D, lon, part };
    };
    const off = flight.cutoff ? flight.cutoff.t : Infinity;   // after engine cutoff it is in orbit, even while still coasting up
    const out = flight.path.map((q) => at(q.t, q.x / RE, q.t <= off + 1e-6 ? 'climb' : 'orbit'));
    if (!flight.ok) return out;
    const last = flight.path[flight.path.length - 1], r = RE + (o.alt > PARK + 1 ? o.alt : flight.cutoff.h), n = Math.sqrt(MU / (r * r * r));
    const T = 2 * Math.PI / n, steps = Math.ceil((orbits || 1) * 120);
    for (let k = 1; k <= steps; k++) { const dt = T * k / 120; out.push(at(last.t + dt, last.x / RE + n * dt, 'orbit')); }
    return out;
  }

  const api = { MU, RE, G0, SPIN, MAXQ, PARK, ROCKET, groundSpeed, inclination, headingsFor, fly, best, track, air };
  G.Orbit = G.Orbit || {}; G.Orbit.ascent = api;
})(typeof window !== 'undefined' ? window : globalThis);
