/* Journeys that reach the Moon, by patched conics: the craft follows a Kepler orbit around
   Earth until it crosses into the Moon's sphere of influence, then a Kepler orbit around the
   Moon, and back again if it leaves. No step-by-step integration, so editing stays instant.
   Everything here lies in the plane of the Moon's orbit. */
(function (G) {
  'use strict';
  const X = G.Orbit.physics, J = G.Orbit.journey;
  const { MU, RE, G0, ATM, SOI, TAU } = X, D = Math.PI / 180;

  const MOON = { mu: 4902.8, R: 1737.4, a: 384400, soi: 66100, period: 27.321661 * 86400 };
  MOON.n = TAU / MOON.period; MOON.speed = MOON.a * MOON.n;
  const M_NEAR = MOON.a - 3 * MOON.soi;
  const ENTRY = 122;   // km: the height at which Apollo quoted its entry angle (400,000 ft)
  const BODY = {
    earth: { name: 'Earth', mu: MU, R: RE, floor: RE + ATM, edge: SOI },
    moon: { name: 'Moon', mu: MOON.mu, R: MOON.R, floor: MOON.R, edge: MOON.soi },
  };
  /* Where the Moon is at time t, given its angle at the start of the journey. */
  function moonAt(t, a0) {
    const a = a0 + MOON.n * t, c = Math.cos(a), s = Math.sin(a);
    return { r: [MOON.a * c, MOON.a * s, 0], v: [-MOON.speed * s, MOON.speed * c, 0], angle: a };
  }

  /* Angle swept from nu0 until the path first drops to radius rHit, or null. */
  function floorSweep(o, nu0, sweep, rHit) {
    if (o.rp >= rHit) return null;
    if (X.radiusAt(o, nu0) <= rHit) return 0;
    const out = X.nuAtRadius(o, rHit);
    if (out == null) return 0;
    const d = o.e < 1 ? X.wrapTau(-out - X.wrapPi(nu0)) : -out - nu0;
    return d >= 0 && d <= sweep + 1e-9 ? d : null;
  }

  /* A plan's start orbit, around Earth or (start.body = 'moon') around the Moon. */
  function startOrbit(plan) {
    const s = plan.start;
    return s.body === 'moon' ? X.fromElements(Object.assign(J.elementsOf(s, MOON.R), { mu: MOON.mu })) : X.fromElements(J.elementsOf(s));
  }

  function compute(plan, V) {
    const a0 = (plan.moon || 0) * D;
    const fuel = J.fullFuel(V, plan.fuel).map((f, k) => X.clamp(f, 0, V.stages[k].propMax)), loaded = fuel.slice();
    let si = 0, payload = V.payload, released = false;
    const massNow = () => payload + V.stages.slice(si).reduce((m, s, k) => m + s.dry + fuel[si + k], 0);
    const start = startOrbit(plan);
    let body = plan.start.body === 'moon' ? 'moon' : 'earth';
    let o = start, nu = o.nu, t = 0, mass = massNow(), ended = null, hops = 0, dvUsed = 0, count = 0;
    // The closest the craft comes to the Moon. A journey that starts there has no arrival to speak of.
    let approach = body === 'moon' ? { entered: true, start: true, dist: start.rp, t: 0, orbit: start } : null;
    const legs = [], burns = [];
    const closed = () => o.e < 1 && o.ra < BODY[body].edge;

    /* Scan an Earth-centred coast for the moment it crosses into the Moon's sphere of influence. */
    function encounter(nu0, span, dt) {
      if (!(dt > 0) || (o.e < 1 && o.ra < MOON.a - 4 * MOON.soi)) return null;
      const steps = Math.min(4000, Math.max(240, Math.ceil(dt / 1800))), tp = X.timeAt(o, nu0);
      const pos = (tau) => X.stateAt(o, X.nuAtTime(o, tp + tau)).r;
      const gap = (tau) => X.len(X.sub(pos(tau), moonAt(t + tau, a0).r));
      const out = M_NEAR;   // a miss only counts while the craft is out near the Moon's orbit
      let prev = gap(0), armed = prev > MOON.soi * 1.0001, best = Infinity, bestI = -1;
      for (let i = 1; i <= steps; i++) {
        const tau = dt * i / steps, d = gap(tau);
        if (armed && d < best && X.len(pos(tau)) > out) { best = d; bestI = i; }
        if (armed && d <= MOON.soi) {
          let lo = dt * (i - 1) / steps, hi = tau;
          for (let k = 0; k < 44; k++) { const mid = (lo + hi) / 2; if (gap(mid) > MOON.soi) lo = mid; else hi = mid; }
          const nuT = X.nuAtTime(o, tp + hi);
          let sweep = o.e < 1 ? X.wrapTau(nuT - X.wrapPi(nu0)) : nuT - nu0;
          if (o.e < 1) sweep += TAU * Math.round((hi - X.coastTime(o, nu0, sweep)) / o.period);
          return { tau: hi, sweep };
        }
        if (d > MOON.soi * 1.0001) armed = true;
        prev = d;
      }
      // No meeting. Remember the nearest miss, pinned down more finely than the scan.
      if (!(approach && approach.entered) && bestI > 0 && (!approach || best < approach.dist + 1)) {
        let lo = dt * Math.max(0, bestI - 1) / steps, hi = dt * Math.min(steps, bestI + 1) / steps;
        for (let k = 0; k < 40; k++) { const m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618; if (gap(m1) < gap(m2)) hi = m2; else lo = m1; }
        const tau = (lo + hi) / 2, d = gap(tau);
        if (!approach || d < approach.dist) {
          const r = X.stateAt(o, X.nuAtTime(o, tp + tau)).r, m = moonAt(t + tau, a0);
          // Positive when the Moon is further round its orbit than the craft: it is ahead of you.
          approach = { entered: false, dist: d, t: t + tau, r, moon: m.r, lead: X.wrapPi(m.angle - Math.atan2(r[1], r[0])) };
        }
      }
      return null;
    }

    /* Follow the current orbit through an angle `want`, or (with null) until something happens.
       Returns how the leg ended. Crossing a sphere of influence switches which body we orbit. */
    function coast(want) {
      const isClosed = closed(), B = BODY[body];
      if (!isClosed) nu = X.wrapPi(nu);
      const room = isClosed ? Infinity : Math.max(0, X.nuAtRadius(o, B.edge) - nu);
      let span = want != null ? Math.min(want, room) : isClosed ? TAU : room;
      let end = want != null && want <= room ? 'arrived' : isClosed ? 'loop' : body === 'earth' ? 'escape' : 'soi-out';
      const hit = floorSweep(o, nu, span, B.floor);
      if (hit != null) { span = hit; end = body === 'earth' ? 'reentry' : 'impact'; }
      let dt = X.coastTime(o, nu, span);
      if (body === 'earth') {
        const enc = encounter(nu, span, dt);
        if (enc) { span = enc.sweep; dt = enc.tau; end = 'soi-in'; }
      }
      legs.push({ body, orbit: o, nu0: nu, sweep: span, t0: t, dt, end, hops });
      t += dt; nu += span;
      if (end === 'soi-in' || end === 'soi-out') {
        const st = X.stateAt(o, nu), m = moonAt(t, a0), into = end === 'soi-in';
        o = into ? X.fromState(X.sub(st.r, m.r), X.sub(st.v, m.v), MOON.mu) : X.fromState(X.add(st.r, m.r), X.add(st.v, m.v), MU);
        nu = o.nu; body = into ? 'moon' : 'earth'; hops++;
        if (into && !(approach && approach.entered)) {
          const tPeri = t + (o.nu < 0 ? X.coastTime(o, X.wrapPi(o.nu), -X.wrapPi(o.nu)) : 0);
          // `pass` is the closest distance to the Moon's centre, with a sign: positive when the craft
          // goes round against the Moon's own motion (in front of it, then behind, as Apollo did),
          // negative the other way. It runs smoothly through zero as the aim sweeps across the Moon.
          approach = { entered: true, dist: o.rp, pass: (o.W[2] < 0 ? 1 : -1) * o.rp, t: tPeri, tIn: t, orbit: o, moon: moonAt(tPeri, a0).r };
        }
      }
      return end;
    }
    const terminal = (end) => end !== 'arrived' && end !== 'soi-in' && end !== 'soi-out';

    for (const b of plan.burns) {
      if (b.kind === 'drop') {
        // Drop the spent stage; on the last stage, let go of what is being carried instead.
        const next = si < V.stages.length - 1, cargo = !next && payload > 0 && !released, done = !ended && (next || cargo);
        burns.push({ drop: true, unreachable: !!ended, done, cargo: done && cargo, stage: si, t, wasted: done && next ? fuel[si] : 0, let: done && cargo ? payload : 0 });
        if (done) { if (next) si++; else { payload = 0; released = true; } mass = massNow(); }
        continue;
      }
      count++;
      // Coast until we are orbiting the body this burn belongs to, and have reached its place.
      // `hops` on a burn is how many times the path must have changed hands first (2 for a burn
      // near Earth after rounding the Moon).
      const home = b.body || 'earth', need = b.hops || 0;
      for (let guard = 0; !ended; guard++) {
        let end;
        if (guard > 8 || hops > 6) { ended = 'lost'; break; }
        if (body !== home || hops < need) end = coast(null);
        else {
          const nuB = J.burnNu(o, b);
          let sweep;
          if (closed()) { sweep = X.wrapTau(nuB - nu); if (sweep > TAU - 1e-7) sweep = 0; sweep += TAU * (b.revs || 0); }
          else sweep = Math.max(0, X.wrapPi(nuB) - X.wrapPi(nu));
          end = coast(sweep);
          if (end === 'arrived') break;
        }
        if (terminal(end)) ended = end;
      }
      if (ended) { burns.push({ n: count, unreachable: true, body: home }); continue; }

      const S = V.stages[si], ve = X.exhaust(S.isp), mdot = S.thrust / (S.isp * G0), empty = mass - fuel[si], B = BODY[body];
      const st = X.stateAt(o, nu);
      const pro = X.unit(st.v), nrm = o.W, rad = X.cross(pro, nrm);
      let want, cmd, dir;
      if (b.mode === 'fuel' || b.mode === 'time') {
        const ask = Math.max(0, b.mode === 'fuel' ? b.amount : b.amount * mdot);
        cmd = ve * Math.log(mass / Math.max(mass - ask, empty * 0.5));
        dir = b.dir || [1, 0, 0];
        want = X.add(X.add(X.scale(pro, dir[0] * cmd), X.scale(rad, dir[1] * cmd)), X.scale(nrm, dir[2] * cmd));
      } else {
        want = J.dvFromParams(st, b.pro, b.rad || 0, 0);
        cmd = X.len(want);
        dir = cmd > 1e-9 ? [X.dot(want, pro) / cmd, X.dot(want, rad) / cmd, X.dot(want, nrm) / cmd] : b.dir || [1, 0, 0];
      }
      const got = Math.min(cmd, ve * Math.log(mass / empty));
      const dv = X.scale(want, cmd > 0 ? got / cmd : 0);
      let v2 = X.add(st.v, dv);
      if (X.len(X.cross(st.r, v2)) < 1e-3 * X.len(st.r)) v2 = X.add(v2, X.scale(pro, 0.002));
      const m2 = mass * Math.exp(-got / ve), rm = X.len(st.r), after = X.fromState(st.r, v2, B.mu);
      burns.push({
        n: count, body, hops, mu: B.mu, r: st.r, v: st.v, v2, pro, rad, nrm, want, cmd, got, dv, t, dir, stage: si, ve, mdot,
        at: body === 'moon' ? X.add(st.r, moonAt(t, a0).r) : st.r,
        params: J.paramsFromDv(st, o, want), mass0: mass, fuelCmd: mass * (1 - Math.exp(-cmd / ve)),
        short: cmd - got > 1e-6, spent: fuel[si] - (mass - m2) < 0.5,
        fuelUsed: mass - m2, burnTime: (mass - m2) / mdot,
        theta: X.argOf(o, st.r), alt: rm - B.R, speed0: X.len(st.v), speed1: X.len(v2),
        atApsis: Math.abs(X.dot(st.r, st.v)) / (rm * X.len(st.v)) < 0.01,
        dvCircular: Math.sqrt(B.mu / rm) - X.len(st.v),
        before: o, after, legIndex: legs.length - 1,
      });
      fuel[si] -= mass - m2; dvUsed += got; mass = m2;
      o = after; nu = o.nu;
    }

    // After the last step, follow the path to its natural end: a stable orbit, a surface, or open space.
    const tail = legs.length;
    for (let k = 0; !ended && k < 8; k++) { const end = coast(null); if (terminal(end)) ended = end; }
    const status = ended === 'loop' ? (body === 'earth' ? 'orbit' : 'lunar') : ended || 'lost';

    // Coming home: speed and angle below level where the path meets the top of the atmosphere.
    let entry = null;
    if (status === 'reentry') {
      const l = legs[legs.length - 1], rI = RE + ENTRY, out = o.rp < rI ? X.nuAtRadius(o, rI) : null;
      const nuI = out == null ? l.nu0 : Math.max(l.nu0, o.e < 1 ? l.nu0 + X.wrapTau(-out - X.wrapPi(l.nu0)) : -out);
      const at = Math.min(nuI, l.nu0 + l.sweep), st = X.stateAt(o, at), rm = X.len(st.r), vm = X.len(st.v);
      entry = { r: st.r, speed: vm, t: l.t0 + X.coastTime(o, l.nu0, at - l.nu0), angle: Math.asin(X.clamp(-X.dot(st.r, st.v) / (rm * vm), -1, 1)) / D };
    }

    // Delta-v in hand: what has been used, plus what the craft as it now is could still deliver if
    // every remaining stage were burned dry and dropped in turn.
    let stack = mass, dvBudget = dvUsed;
    for (let k = si; k < V.stages.length; k++) { dvBudget += X.exhaust(V.stages[k].isp) * Math.log(stack / (stack - fuel[k])); stack -= V.stages[k].dry + fuel[k]; }
    return {
      legs, burns, final: o, finalBody: body, status, duration: t, dvUsed, dvBudget, start, startBody: plan.start.body === 'moon' ? 'moon' : 'earth',
      approach, entry, moon0: a0, tail, rounded: legs.some((l) => l.end === 'soi-out'),
      startTheta: X.argOf(start, X.stateAt(start, start.nu).r),
      stage: si, fuelLeft: fuel[si], massEnd: mass, released,
      stages: V.stages.map((s, k) => ({ name: s.name, loaded: loaded[k], left: fuel[k], dropped: k < si })),
    };
  }

  /* Where the craft is t seconds into the journey: `r` relative to Earth, `local` relative to
     the body it is orbiting at that moment. */
  function stateAtTime(res, t) {
    let leg = res.legs[res.legs.length - 1];
    for (const l of res.legs) if (t < l.t0 + l.dt) { leg = l; break; }
    const tau = X.clamp(t - leg.t0, 0, leg.dt);
    const s = X.stateAt(leg.orbit, X.nuAtTime(leg.orbit, X.timeAt(leg.orbit, leg.nu0) + tau));
    const m = moonAt(leg.t0 + tau, res.moon0);
    const onMoon = leg.body === 'moon';
    return { leg, local: s.r, r: onMoon ? X.add(s.r, m.r) : s.r, v: onMoon ? X.add(s.v, m.v) : s.v, fromMoon: onMoon ? s.r : X.sub(s.r, m.r), moon: m.r };
  }

  /* Points along part of a leg (seconds tA to tB after it starts), seen from Earth or from the
     Moon. Used to draw a path in the frame it does not belong to. */
  function legPoints(res, leg, frame, tA, tB, count) {
    const pts = [], tp = X.timeAt(leg.orbit, leg.nu0);
    for (let i = 0; i <= count; i++) {
      const tau = tA + (tB - tA) * i / count, r = X.stateAt(leg.orbit, X.nuAtTime(leg.orbit, tp + tau)).r;
      if (leg.body === frame) pts.push(r);
      else { const m = moonAt(leg.t0 + tau, res.moon0).r; pts.push(frame === 'moon' ? X.sub(r, m) : X.add(r, m)); }
    }
    return pts;
  }

  G.Orbit.lunar = { MOON, BODY, ENTRY, moonAt, startOrbit, compute, stateAtTime, legPoints };
})(globalThis);
