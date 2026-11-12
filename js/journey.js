/* A journey is a start orbit plus a chain of steps: burns, and stage drops.
   compute() walks the chain and returns every coast leg and step, so editing
   any step updates everything after it. Angles in plans are in degrees. */
(function (G) {
  'use strict';
  const X = G.Orbit.physics;
  const { MU, RE, G0, ATM, SOI, TAU } = X;
  const D = Math.PI / 180;
  const ECC_APS = 0.002;   // below this an orbit has no useful apsides

  /* Real craft. Each stage: inert mass and full propellant in kg, vacuum Isp in s, thrust in N. */
  const VEHICLES = {
    centaur: {
      name: 'Centaur upper stage', cargo: 'satellite', payload: 4000,
      stages: [{ name: 'Centaur', dry: 2247, propMax: 20830, isp: 450.5, thrust: 99200 }],
    },
    ius: {
      name: 'Inertial Upper Stage', cargo: 'TDRS relay satellite', payload: 2225,
      stages: [
        { name: 'First stage', dry: 1100, propMax: 9700, isp: 295.5, thrust: 190000 },
        { name: 'Second stage', dry: 1200, propMax: 2700, isp: 289.1, thrust: 80000 },
      ],
    },
  };

  const circSpeed = (r) => Math.sqrt(MU / r);
  const orbit = (peri, apo, more) => Object.assign({ peri, apo, inc: 0, argp: 0, raan: 0, nu: -90 }, more);
  const GEO = [35286, 36286];

  /* `show` lists the extra controls a mission needs, so they appear without the player hunting for them. */
  const MISSIONS = [
    {
      id: 'stretch', title: 'Stretch the orbit',
      goal: 'Raise the far side of your orbit to GPS altitude.',
      hint: 'Pull the arrow forward. Speeding up here lifts the opposite side.',
      insight: 'A burn never moves the point where it happens. It moves the other side of the orbit.',
      start: orbit(300, 300), fuel: 5000,
      target: { apo: [19700, 20700] },
      ref: () => X.hohmann(RE + 300, RE + 20200).dv1,
    },
    {
      id: 'round', title: 'Round it out',
      goal: 'Reach a circular orbit at GPS altitude.',
      hint: 'Two burns: one to reach up, one at the top to stay there.',
      insight: 'This two-burn move is a Hohmann transfer, the usual cheapest way between two circular orbits.',
      start: orbit(300, 300), fuel: 8500,
      target: { apo: [19700, 20700], peri: [19700, 20700] },
      ref: () => X.hohmann(RE + 300, RE + 20200).total,
    },
    {
      id: 'geo', title: 'Geostationary',
      goal: 'Park in a circular orbit at 35,786 km, where one lap takes one day.',
      hint: 'Same move, bigger climb. Watch the fuel.',
      insight: 'Up here one orbit takes 23 h 56 min, one turn of the Earth, so the satellite hangs over one spot on the ground.',
      start: orbit(300, 300), fuel: 9600,
      target: { apo: GEO, peri: GEO },
      ref: () => X.hohmann(RE + 300, RE + 35786).total,
    },
    {
      id: 'stages', title: 'Two stages',
      goal: 'Take a relay satellite to geostationary orbit with a two-stage booster.',
      hint: 'The first burn nearly empties the first stage. Drop it, then make the second burn with the next one.',
      insight: 'An empty stage is dead weight. Once it is gone, the second burn only has to push the satellite and one small motor.',
      start: orbit(300, 300), vehicle: 'ius',
      target: { apo: GEO, peri: GEO },
      ref: () => X.hohmann(RE + 300, RE + 35786).total,
    },
    {
      id: 'home', title: 'Come home',
      goal: 'Drop the low point of your orbit into the atmosphere, below 80 km.',
      hint: 'Burn backwards. Slowing down here lowers the opposite side.',
      insight: 'Leaving the space station’s orbit takes only about 100 m/s. Getting up there is the expensive part.',
      start: orbit(420, 420), fuel: 300,
      target: { peri: [-RE, 80], reentry: true },
      ref: () => {
        const r1 = RE + 420, at = (r1 + RE + 80) / 2;
        return circSpeed(r1) - Math.sqrt(MU * (2 / r1 - 1 / at));
      },
    },
    {
      id: 'chase', title: 'Catch up',
      goal: 'Meet the other craft. It is 25° ahead of you in the same orbit.',
      hint: 'Slow down to catch up: a lower orbit is a quicker lap. Coast a lap or two, then burn again at the same spot to rejoin.',
      insight: 'Dropping lower shortens every lap, so you gain on the target without ever chasing it. More laps means a gentler dip.',
      start: orbit(500, 500), fuel: 500, show: ['where'],
      target: { apo: [485, 515], peri: [485, 515], hideBand: true, chase: { ahead: 25, tol: 50 } },
      ref: () => {
        const r = RE + 500, a = r * Math.pow(1 - 25 / 360 / 2, 2 / 3);
        return 2 * (circSpeed(r) - Math.sqrt(MU * (2 / r - 1 / a)));
      },
      refNote: 'A two-lap catch-up takes {ref}. Coasting more laps takes less.',
    },
    {
      id: 'splash', title: 'Splashdown',
      goal: 'Enter the atmosphere over the landing zone, at an angle between 1° and 2°.',
      hint: 'Drag the burn along the orbit to move where you come down. Burn harder to come in steeper.',
      insight: 'Too shallow and a capsule skips back out. Too steep and it overheats. From low orbit, crews come home at roughly 1° to 2°.',
      start: orbit(420, 420), fuel: 400,
      target: { reentry: true, site: { arg: 200, tol: 150 }, angle: [1, 2] },
    },
    {
      id: 'turn', title: 'Turn the ellipse',
      goal: 'Swing the orbit round by 30° to match the dashed one, without changing its size.',
      hint: 'Put the burn where the two orbits cross. Then thrust straight toward Earth or away from it: the Radial number.',
      insight: 'A radial burn pivots the whole ellipse. It changes where the high point is, not how high it is, and it is rarely cheap.',
      start: orbit(300, 20200), fuel: 4200, show: ['dirs'],
      target: { apo: [19800, 20600], peri: [200, 400], hideBand: true, aim: { arg: 210, tol: 3 } },
      guide: { peri: 300, apo: 20200, argp: 30 },
      ref: () => { const o = X.fromElements({ rp: RE + 300, ra: RE + 20200 }); return 2 * Math.sqrt(MU / o.p) * o.e * Math.sin(15 * D); },
    },
    {
      id: 'tilt', title: 'Tilt the orbit',
      goal: 'A launch from Florida reaches 28.5°. The space station flies at 51.6°. Turn your plane to match.',
      hint: 'Two planes hinge where they cross, so burn on the equator. Use Plane turn, and keep Speed at zero to stay circular.',
      insight: 'That cost about as much as climbing from here to geostationary orbit. Low orbits are fast, and turning a fast orbit is brutal.',
      start: orbit(400, 400, { inc: 28.5 }), fuel: 7500, show: ['where', 'dirs'], view: { tilt: 58, yaw: 22 },
      target: { apo: [370, 430], peri: [370, 430], inc: [51.1, 52.1], hideBand: true },
      guide: { peri: 400, apo: 400, inc: 51.6 },
      ref: () => 2 * circSpeed(RE + 400) * Math.sin(23.1 / 2 * D),
    },
    {
      id: 'birds', title: 'Two birds, one burn',
      goal: 'You are on a tilted transfer orbit. Finish in geostationary orbit over the equator.',
      hint: 'You must speed up at apoapsis anyway. Turn the plane in the same burn: set Speed and Plane turn together.',
      insight: 'Turning the plane is cheapest where you are slowest, and cheaper still folded into a burn you had to make anyway.',
      start: orbit(300, 35786, { inc: 28.5, argp: 180, nu: 0 }), fuel: 3500, show: ['where', 'dirs'], view: { tilt: 58, yaw: 22 },
      target: { apo: GEO, peri: GEO, inc: [0, 1] },
      ref: () => {
        const ra = RE + 35786, va = Math.sqrt(MU * (2 / ra - 2 / (ra + RE + 300))), vc = circSpeed(ra);
        return Math.sqrt(va * va + vc * vc - 2 * va * vc * Math.cos(28.5 * D));
      },
    },
    {
      id: 'sun', title: 'Follow the Sun',
      goal: 'Climb to a circular orbit at 705 km and make its plane turn 0.99° a day, keeping pace with the Sun.',
      hint: 'Climb first. Then, on the equator, nudge the tilt a fraction of a degree until the plane keeps pace.',
      insight: 'Earth’s bulge slowly twists an orbit’s plane. At the right tilt it turns once a year, so the satellite always passes overhead at the same local time.',
      start: orbit(500, 500, { inc: 97.4 }), fuel: 600, show: ['where', 'dirs'], view: { tilt: 58, yaw: 22 },
      target: { apo: [690, 720], peri: [690, 720], drift: [0.966, 1.006], hideBand: true },
      guide: { peri: 705, apo: 705, inc: 98.2 },
      status: (res) => `Your plane turns ${X.nodeRate(res.final).toFixed(2)}° a day. The Sun moves 0.99°.`,
    },
    {
      id: 'free', title: 'Free flight',
      goal: 'No target. Build any journey you like, or start from a famous flight.',
      hint: 'Click the orbit to add a burn. Drag a burn along the orbit to move it.',
      start: orbit(300, 300),
    },
  ];

  const FLIGHTS = [];   // filled in by flights.js

  const newBurn = (theta, anchor) => ({ theta, anchor: anchor || 'free', pro: 0, rad: 0, turn: 0, revs: 0 });
  const elementsOf = (s) => ({ rp: RE + s.peri, ra: RE + s.apo, inc: (s.inc || 0) * D, argp: (s.argp || 0) * D, raan: (s.raan || 0) * D, nu: (s.nu || 0) * D });
  const startOrbit = (plan) => X.fromElements(elementsOf(plan.start));
  const fullFuel = (vehicle, fuel) => vehicle.stages.map((s, k) => (Array.isArray(fuel) ? fuel[k] : k === 0 ? fuel : null) ?? s.propMax);

  /* A fresh plan for a mission or a famous flight. A burn written with `after` (degrees of
     coasting since the previous step) is turned into a place on the orbit. */
  function newPlan(src) {
    const vehicle = src.vehicle || 'centaur', start = Object.assign({}, src.start);
    const o = X.fromElements(elementsOf(start));
    let at = X.argOf(o, X.stateAt(o, o.nu).r);
    const burns = (src.burns ? JSON.parse(JSON.stringify(src.burns)) : [newBurn(at)]).map((b) => {
      if (b.after != null) { b.theta = at + b.after * D; b.revs = Math.floor(b.after / 360); b.anchor = 'free'; delete b.after; }
      if (b.kind !== 'drop' && b.anchor === 'free') at = b.theta;
      return b;
    });
    const plan = { vehicle, start, fuel: fullFuel(VEHICLES[vehicle], src.fuel), burns };
    if (src.payload != null) plan.payload = src.payload;
    if (src.companion) plan.companion = src.companion;
    if (src.blurb) { plan.flight = src.id; plan.wide = src.wide; }
    return plan;
  }

  function burnNu(o, b) {
    if (o.e > ECC_APS) {
      if (b.anchor === 'peri') return 0;
      if (b.anchor === 'apo' && o.e < 1) return Math.PI;
    }
    const nodes = X.nodeNus(o);
    if (nodes && (b.anchor === 'an' || b.anchor === 'dn')) return nodes[b.anchor];
    return X.nuOfArg(o, b.theta);
  }

  const turnAbout = (u, k, a) => X.add(X.add(X.scale(u, Math.cos(a)), X.scale(X.cross(k, u), Math.sin(a))), X.scale(k, X.dot(k, u) * (1 - Math.cos(a))));

  /* A burn as the player describes it: speed added along the path (prograde), speed added straight
     away from Earth (radial), then the whole velocity swung sideways about the line to Earth's centre
     (plane turn, degrees). Returns the delta-v vector. */
  function dvFromParams(st, pro, rad, turn) {
    const rh = X.unit(st.r);
    let u = X.add(st.v, X.add(X.scale(X.unit(st.v), pro), X.scale(rh, rad)));
    if (turn) u = turnAbout(u, rh, turn * D);
    return X.sub(u, st.v);
  }
  /* The reverse: describe any delta-v vector as prograde, radial and plane turn. */
  function paramsFromDv(st, o, dv) {
    const rh = X.unit(st.r), hh = X.cross(o.W, rh), v2 = X.add(st.v, dv);
    const along = X.dot(v2, hh), up = X.dot(v2, o.W);
    const u = X.add(X.scale(rh, X.dot(v2, rh)), X.scale(hh, Math.hypot(along, up)));   // the same velocity, swung back into the plane
    const d = X.sub(u, st.v), t = X.unit(st.v), n = X.cross(t, o.W);
    const rad = X.dot(d, n) / X.dot(rh, n);
    return { pro: X.dot(d, t) - rad * X.dot(rh, t), rad, turn: Math.atan2(up, along) / D };
  }

  /* Farthest true anomaly we follow an open or very long orbit to. */
  const outerNu = (o) => (o.ra > SOI ? X.nuAtRadius(o, SOI) : null);

  /* Angle swept from nu0 until the path first drops to the reentry altitude,
     or null if that does not happen within `sweep`. */
  function reentrySweep(o, nu0, sweep) {
    const rHit = RE + ATM;
    if (o.rp >= rHit) return null;
    if (X.radiusAt(o, nu0) <= rHit) return 0;
    const out = X.nuAtRadius(o, rHit);
    if (out == null) return 0;
    const d = o.e < 1 ? X.wrapTau(-out - X.wrapPi(nu0)) : -out - nu0;
    return d >= 0 && d <= sweep + 1e-9 ? d : null;
  }

  function compute(plan, V) {
    const fuel = fullFuel(V, plan.fuel).map((f, k) => X.clamp(f, 0, V.stages[k].propMax)), loaded = fuel.slice();
    let si = 0;   // the stage currently firing
    const payload = plan.payload != null ? plan.payload : V.payload;   // Free flight lets the player change it
    const massNow = () => payload + V.stages.slice(si).reduce((m, s, k) => m + s.dry + fuel[si + k], 0);
    const start = startOrbit(plan);
    let o = start, nu = o.nu, mass = massNow(), t = 0, ended = null, dvUsed = 0, count = 0;
    const legs = [], burns = [];

    for (const b of plan.burns) {
      if (b.kind === 'drop') {
        const done = !ended && si < V.stages.length - 1;
        burns.push({ drop: true, unreachable: !!ended, done, stage: si, t, wasted: done ? fuel[si] : 0 });
        if (done) { si++; mass = massNow(); }
        continue;
      }
      count++;
      if (ended) { burns.push({ n: count, unreachable: true }); continue; }
      const S = V.stages[si], ve = X.exhaust(S.isp), mdot = S.thrust / (S.isp * G0), empty = mass - fuel[si];
      let nuB = burnNu(o, b), sweep;
      const far = outerNu(o);
      if (o.e < 1 && far == null) {
        sweep = X.wrapTau(nuB - nu);
        if (sweep > TAU - 1e-7) sweep = 0;
        sweep += TAU * (b.revs || 0);
      } else {
        nuB = X.clamp(X.wrapPi(nuB), -far, far);
        sweep = Math.max(0, nuB - X.wrapPi(nu));
        nu = X.wrapPi(nu);
      }
      const hit = reentrySweep(o, nu, sweep);
      if (hit != null) {
        const dt = X.coastTime(o, nu, hit);
        legs.push({ orbit: o, nu0: nu, sweep: hit, t0: t, dt, end: 'reentry' });
        t += dt; ended = 'reentry';
        burns.push({ n: count, unreachable: true });
        continue;
      }
      const dt = X.coastTime(o, nu, sweep);
      legs.push({ orbit: o, nu0: nu, sweep, t0: t, dt, end: 'burn' });
      t += dt;

      // The local frame for thrust directions: along the velocity, across it in the orbit plane
      // (roughly away from Earth), and along the orbit's axis.
      const st = X.stateAt(o, nu + sweep);
      const pro = X.unit(st.v), nrm = o.W, rad = X.cross(pro, nrm);
      let want, cmd, dir;
      if (b.mode === 'fuel' || b.mode === 'time') {
        // Pinned to fuel or engine time: delta-v follows from the mass at this moment.
        const ask = Math.max(0, b.mode === 'fuel' ? b.amount : b.amount * mdot);
        cmd = ve * Math.log(mass / Math.max(mass - ask, empty * 0.5));
        dir = b.dir || [1, 0, 0];
        want = X.add(X.add(X.scale(pro, dir[0] * cmd), X.scale(rad, dir[1] * cmd)), X.scale(nrm, dir[2] * cmd));
      } else {
        want = dvFromParams(st, b.pro, b.rad || 0, b.turn || 0);
        cmd = X.len(want);
        dir = cmd > 1e-9 ? [X.dot(want, pro) / cmd, X.dot(want, rad) / cmd, X.dot(want, nrm) / cmd] : b.dir || [1, 0, 0];
      }
      const got = Math.min(cmd, ve * Math.log(mass / empty));
      const dv = X.scale(want, cmd > 0 ? got / cmd : 0);
      let v2 = X.add(st.v, dv);
      if (X.len(X.cross(st.r, v2)) < 1) v2 = X.add(v2, X.scale(pro, 0.002));   // avoid a dead-straight fall
      const m2 = mass * Math.exp(-got / ve), rm = X.len(st.r), after = X.fromState(st.r, v2);
      burns.push({
        n: count, r: st.r, v: st.v, v2, pro, rad, nrm, want, cmd, got, dv, t, dir, stage: si, ve, mdot,
        params: paramsFromDv(st, o, want), mass0: mass, fuelCmd: mass * (1 - Math.exp(-cmd / ve)),
        short: cmd - got > 1e-6, spent: fuel[si] - (mass - m2) < 0.5,
        fuelUsed: mass - m2, burnTime: (mass - m2) / mdot,
        theta: X.argOf(o, st.r), alt: rm - RE, speed0: X.len(st.v), speed1: X.len(v2),
        atApsis: Math.abs(X.dot(st.r, st.v)) / (rm * X.len(st.v)) < 0.01,
        dvCircular: circSpeed(rm) - X.len(st.v),
        before: o, after, legIndex: legs.length - 1,
      });
      fuel[si] -= mass - m2; dvUsed += got; mass = m2;
      o = after; nu = o.nu;
    }

    let status = ended;
    if (!ended) {
      const far = outerNu(o), open = far != null;
      if (open) nu = X.wrapPi(nu);
      const full = open ? Math.max(0, far - nu) : TAU;
      const hit = reentrySweep(o, nu, full);
      const sweep = hit != null ? hit : full;
      status = hit != null ? 'reentry' : open ? 'escape' : 'orbit';
      const dt = X.coastTime(o, nu, sweep);
      legs.push({ orbit: o, nu0: nu, sweep, t0: t, dt, end: status });
      t += dt;
    }
    let entry = null;
    if (status === 'reentry') {
      const l = legs[legs.length - 1], st = X.stateAt(l.orbit, l.nu0 + l.sweep), rm = X.len(st.r), vm = X.len(st.v);
      entry = { r: st.r, speed: vm, t, theta: Math.atan2(st.r[1], st.r[0]), angle: Math.asin(X.clamp(-X.dot(st.r, st.v) / (rm * vm), -1, 1)) / D };
    }
    // Delta-v the whole stack could deliver if every stage were burned dry and dropped in turn.
    let stack = payload + V.stages.reduce((m, s, k) => m + s.dry + loaded[k], 0), dvBudget = 0;
    V.stages.forEach((s, k) => { dvBudget += X.exhaust(s.isp) * Math.log(stack / (stack - loaded[k])); stack -= s.dry + loaded[k]; });
    return {
      legs, burns, final: o, status, duration: t, dvUsed, dvBudget, entry, start,
      startTheta: X.argOf(start, X.stateAt(start, start.nu).r),
      stage: si, fuelLeft: fuel[si], massEnd: mass,
      stages: V.stages.map((s, k) => ({ name: s.name, loaded: loaded[k], left: fuel[k], dropped: k < si })),
    };
  }

  /* Where the craft is t seconds into the journey. */
  function stateAtTime(res, t) {
    let leg = res.legs[res.legs.length - 1];
    for (const l of res.legs) if (t < l.t0 + l.dt) { leg = l; break; }
    const tau = X.clamp(t - leg.t0, 0, leg.dt);
    const nu = X.nuAtTime(leg.orbit, X.timeAt(leg.orbit, leg.nu0) + tau);
    return Object.assign(X.stateAt(leg.orbit, nu), { leg });
  }

  function check(mission, res) {
    const tg = mission.target;
    if (!tg) return null;
    const o = res.final, inside = (x, range) => !range || (x >= range[0] && x <= range[1]);
    const c = {
      apoOk: inside(o.ra - RE, tg.apo), periOk: inside(o.rp - RE, tg.peri),
      incOk: inside(o.inc / D, tg.inc), driftOk: inside(X.nodeRate(o), tg.drift),
      miss: null, missOk: true, angleOk: true, tol: 0,
    };
    const statusOk = tg.reentry ? res.status === 'reentry' : res.status === 'orbit';
    const lastBurn = res.burns.filter((b) => !b.drop && !b.unreachable).pop();
    if (tg.chase) {
      // Where is the other craft at the moment of your last burn?
      const r = res.start.a, n = res.start.n, a0 = res.startTheta + tg.chase.ahead * D, t = lastBurn ? lastBurn.t : 0;
      c.miss = X.wrapPi(a0 + n * t - (lastBurn ? lastBurn.theta : res.startTheta)) * r;
      c.tol = tg.chase.tol; c.missOk = !!lastBurn && Math.abs(c.miss) <= c.tol;
      c.chase = { r, n, a0, t, burn: lastBurn ? lastBurn.n : 0 };
    }
    if (tg.site) {
      c.site = { a0: tg.site.arg * D, t: res.entry ? res.entry.t : null };
      c.tol = tg.site.tol; c.missOk = c.angleOk = false;
      if (res.entry) {
        // Positive means you come down past the landing zone, negative means short of it.
        c.miss = X.wrapPi(res.entry.theta - tg.site.arg * D - X.SPIN * res.entry.t) * RE;
        c.missOk = Math.abs(c.miss) <= c.tol;
        c.angleOk = inside(res.entry.angle, tg.angle);
      }
    }
    if (tg.aim) {
      // How far, in degrees, the high point is from where it should point.
      c.miss = X.wrapPi(X.argOfNu(o, Math.PI) - tg.aim.arg * D) / D;
      c.tol = tg.aim.tol; c.missOk = o.e > ECC_APS && Math.abs(c.miss) <= c.tol;
    }
    c.ok = c.apoOk && c.periOk && c.incOk && c.driftOk && statusOk && c.missOk && c.angleOk;
    return c;
  }

  /* Another craft in a circular orbit, for flights that chase one: where it is when you make your last burn. */
  function companion(res, plan) {
    const r = RE + plan.companion.alt, n = Math.sqrt(MU / (r * r * r)), a0 = res.startTheta + plan.companion.ahead * D;
    const last = res.burns.filter((b) => !b.drop && !b.unreachable).pop(), t = last ? last.t : 0;
    const miss = X.wrapPi(a0 + n * t - (last ? last.theta : res.startTheta)) * r;
    return { ok: false, tol: 0, miss, missOk: !!last && Math.abs(miss) <= 30 && Math.abs(last.after.a - r) < 15 && last.after.e < 0.003, chase: { r, n, a0, t, burn: last ? last.n : 0 } };
  }

  G.Orbit.journey = { VEHICLES, MISSIONS, FLIGHTS, ECC_APS, D, newBurn, newPlan, startOrbit, elementsOf, fullFuel, burnNu, dvFromParams, paramsFromDv, compute, stateAtTime, check, companion, circSpeed };
})(globalThis);
