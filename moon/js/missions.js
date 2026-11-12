/* The Moon missions, and how each one is judged. Preset burns are worked out when the page
   loads (by bisection on the engine itself) so they always agree with the physics. */
(function (G) {
  'use strict';
  const X = G.Orbit.physics, J = G.Orbit.journey, L = G.Orbit.lunar;
  const { MU, RE } = X, M = L.MOON, D = Math.PI / 180;

  const PARK = 185;                      // km, Apollo's parking orbit
  const CORRIDOR = [5.5, 7.5];           // degrees below level at 122 km: Apollo aimed for 6.5
  const AIM_ANGLE = 6.5, AIM_PASS = 110; // what a drag settles onto: entry angle, height of closest pass
  const earthOrbit = (peri, apo, more) => Object.assign({ peri, apo, nu: -90 }, more);
  // Lunar orbits here run clockwise, the way a craft arriving ahead of the Moon ends up.
  const moonOrbit = (peri, apo, more) => Object.assign({ body: 'moon', peri, apo, inc: 180, nu: 0 }, more);
  const burn = (more) => Object.assign(J.newBurn(-Math.PI / 2), more);

  /* A fresh plan for a mission or a famous flight. A burn written with `after` (degrees of
     coasting since the previous step) is turned into a place on the orbit. */
  function newPlan(src) {
    if (src.build) src = Object.assign({}, src, src.made || (src.made = src.build()));   // famous flights are worked out on first use
    const vehicle = src.vehicle || 'apollo', start = Object.assign({}, src.start);
    const o = L.startOrbit({ start });
    let at = X.argOf(o, X.stateAt(o, o.nu).r);
    const first = J.newBurn(at, 'free', start.body);
    const burns = (src.burns ? JSON.parse(JSON.stringify(src.burns)) : [first]).map((b) => {
      if (b.after != null) { b.theta = at + b.after * D; b.revs = Math.floor(b.after / 360); b.anchor = 'free'; delete b.after; }
      if (b.kind !== 'drop' && b.anchor === 'free') at = b.theta;
      return b;
    });
    const plan = { vehicle, start, moon: src.moon || 0, fuel: J.fullFuel(J.VEHICLES[vehicle], src.fuel), burns };
    if (src.payload != null) plan.payload = src.payload;
    if (src.blurb) plan.flight = src.id;
    return plan;
  }
  const vehicleOf = (p) => { const v = J.VEHICLES[p.vehicle]; return p.payload != null ? Object.assign({}, v, { payload: p.payload }) : v; };
  const fly = (p) => L.compute(p, vehicleOf(p));

  /* Bisection on a function that changes sign between lo and hi. */
  function bisect(f, lo, hi, n) {
    let flo = f(lo);
    for (let i = 0; i < (n || 48); i++) { const mid = (lo + hi) / 2, fm = f(mid); if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid; }
    return (lo + hi) / 2;
  }
  /* The two things a path can be aimed at. Both are numbers that pass smoothly through zero at the
     aim, so a search can close in on it. */
  const passMiss = (res, alt) => (res.approach && res.approach.entered && !res.approach.start ? res.approach.pass - (M.R + alt) : null);
  const entryMiss = (res, angle) => (res.status === 'reentry' && res.entry && res.entry.speed > 9 ? res.entry.angle - angle : res.status === 'lost' ? null : -angle);
  /* Turn the Moon's starting angle, near `guess`, until the plan satisfies miss() = 0. */
  function aimMoon(plan, miss, guess, half, n) {
    const f = (a) => { plan.moon = a; return miss(fly(plan)); };
    n = n || 64;
    const lo = guess - (half || 3), step = 2 * (half || 3) / n;
    for (let i = 0, prev = f(lo); i < n; i++) {
      const next = f(lo + step * (i + 1));
      if (prev != null && next != null && (prev > 0) !== (next > 0)) {
        const a = bisect(f, lo + step * i, lo + step * (i + 1));
        if (Math.abs(f(a)) < 0.5) return (plan.moon = a);
      }
      prev = next;
    }
    return (plan.moon = guess);
  }

  // Departures used as starting points. The Moon's angle is found so that each does what it says.
  const TO_MOON = 3.155, AROUND = 3.16;
  const arrive = { start: earthOrbit(PARK, PARK), burns: [burn({ pro: TO_MOON })] };
  arrive.moon = aimMoon(newPlan(arrive), (r) => passMiss(r, AIM_PASS), 41.4);
  const swing = { start: earthOrbit(PARK, PARK), burns: [burn({ pro: AROUND })] };
  const swingAt = aimMoon(newPlan(swing), (r) => entryMiss(r, AIM_ANGLE), 42.4, 0.4);

  const circ = (r, mu) => Math.sqrt((mu || MU) / r);
  const speedAt = (r, far, mu) => Math.sqrt((mu || MU) * (2 / r - 2 / (r + far)));

  /* `show` lists the extra controls a mission needs. `scene` is the view it opens on. */
  const MISSIONS = [
    {
      id: 'reach', title: 'As far as the Moon',
      goal: 'Raise the far side of your orbit to the Moon’s distance, 384,400 km.',
      hint: 'Pull the arrow forward, a long way. The small Journey picture shows how far out you reach.',
      insight: 'The Moon is ten times as high as geostationary orbit, yet the burn is only a quarter bigger. Nearly all the cost of going anywhere is in leaving low orbit.',
      start: earthOrbit(PARK, PARK), moon: 205,
      target: { apo: [M.a - RE - 15000, M.a - RE + 15000] },
      ref: () => speedAt(RE + PARK, M.a) - circ(RE + PARK),
    },
    {
      id: 'meet', title: 'Meet the Moon',
      goal: 'The burn is big enough, but the Moon will not be there. Pass within 10,000 km of it.',
      hint: 'Drag the burn round the orbit to swing the whole path. The ring shows where the Moon will be when you get there.',
      insight: 'The Moon moves 13° a day, so during a three-day trip it travels a tenth of the way round its orbit. You aim at where it will be, not at where it is.',
      start: earthOrbit(PARK, PARK), moon: 95, burns: [burn({ pro: 3.15 })], done: 'A close pass.',
      target: { pass: [0, 10000] }, aims: ['pass'],
      status: (res) => meeting(res),
    },
    {
      id: 'return', title: 'Round the Moon and back',
      goal: 'Pass close behind the Moon, within 10,000 km, so that it bends your path home into Earth’s atmosphere with no second burn.',
      hint: 'Drag the burn a little at a time and watch where the path goes after the Moon. Close in on the pass that comes straight back.',
      insight: 'This is a free return. Apollo 8, 10 and 11 left Earth on one, so that a crew whose engine failed would still fall home.',
      start: earthOrbit(PARK, PARK), moon: swingAt - 22, burns: [burn({ pro: AROUND })], done: 'Home again.',
      target: { home: CORRIDOR, pass: [0, 10000] }, aims: ['entry'],
      status: (res) => (res.approach && res.approach.entered ? homing(res) : meeting(res)),
    },
    {
      id: 'stay', title: 'Stay',
      goal: 'You arrive 110 km above the far side, going too fast to be held. Brake into orbit around the Moon.',
      hint: 'The S-IVB is spent, so drop it. Then add a burn where the path comes closest, and pull it backward.',
      insight: 'Without the burn the Moon swings you round and lets you go. Braking at the closest point, where you are fastest, takes the least fuel to be caught.',
      start: earthOrbit(PARK, PARK), moon: arrive.moon, burns: [burn({ pro: TO_MOON })], scene: 'moon', done: 'In orbit around the Moon.',
      target: { lunar: true }, aims: ['pass'],
    },
    {
      id: 'low', title: 'Low and round',
      goal: 'Bring this long orbit down to a circle about 110 km above the Moon.',
      hint: 'A burn moves the far side of the orbit. Drag the burn to the low point, then pull backward until the orbit is round.',
      insight: 'The Moon has no air, so an orbit this low lasts. And its pull is gentle: a lap here runs at 1.6 km/s, a fifth of the speed around Earth, so reshaping an orbit is cheap.',
      start: moonOrbit(110, 3000, { nu: 115 }), vehicle: 'csm', fuel: 7000, moon: 60,
      target: { lunar: true, apo: [90, 130], peri: [90, 130] },
      ref: () => speedAt(M.R + 110, M.R + 3000, M.mu) - circ(M.R + 110, M.mu),
    },
    {
      id: 'home', title: 'Come home',
      goal: 'Leave lunar orbit and meet Earth’s atmosphere at an angle between 5.5° and 7.5°.',
      hint: 'Speed up by about 900 m/s to break free. Then drag the burn round the orbit to steer where the path goes.',
      insight: 'From here the safe way in is a slot some 50 km deep at the end of a 380,000 km fall. Too shallow and the capsule skips off; too steep and it burns. Apollo 11’s burn for home was 999 m/s.',
      start: moonOrbit(110, 110, { nu: 200 }), vehicle: 'csm', payload: 0, fuel: 5200, moon: 60, done: 'On target.',
      target: { home: CORRIDOR, days: 5 }, aims: ['entry'],
      status: (res) => homing(res),
    },
    {
      id: 'free', title: 'Free flight',
      goal: 'No target. Build any journey you like, or start from a famous flight.',
      hint: 'Click a path to add a burn. Burns near the Moon are added in the Moon view.',
      start: earthOrbit(PARK, PARK), moon: 0,
    },
  ];
  /* Other places to begin a Free flight from. */
  const STARTS = [
    { id: '', name: 'low Earth orbit', start: earthOrbit(PARK, PARK), moon: 0 },
    { id: 'lunar', name: 'low lunar orbit', start: moonOrbit(110, 110, { nu: 200 }), vehicle: 'csm', moon: 60 },
  ];
  const FLIGHTS = [];   // filled in by flights.js

  const km = (x) => Math.round(x).toLocaleString('en-US');
  /* One line on how the meeting with the Moon is going. Distances are in km; the app converts. */
  function meeting(res) {
    const a = res.approach;
    if (!a || a.start) return { text: 'This path does not reach the Moon’s distance.' };
    if (!a.entered) return { text: 'When you get there, the Moon is {d} ' + (Math.abs(a.lead) > 1 ? 'away.' : a.lead > 0 ? 'ahead of you.' : 'behind you.'), d: a.dist - M.R };
    if (a.dist < M.R) return { text: 'This path hits the Moon.', bad: true };
    return { text: 'You pass {d} above the Moon.', d: a.dist - M.R };
  }
  /* One line on how the return to Earth is going. */
  function homing(res) {
    if (res.status === 'impact') return { text: 'This path hits the Moon.', bad: true };
    if (res.status === 'lunar') return { text: 'Still in orbit around the Moon. Speed up more to break free.' };
    if (res.status === 'reentry' && res.entry) {
      const g = res.entry.angle, a = res.approach;
      if (a && !a.start && a.dist > M.R + 10000 && g <= CORRIDOR[1]) return { text: 'Comes back, but only brushes past the Moon, {d} away. Pass closer.', d: a.dist - M.R };
      return g > CORRIDOR[1] ? { text: `Comes back too steep: ${g.toFixed(1)}° down.`, bad: g > 12 } : g < CORRIDOR[0] ? { text: `Comes back too shallow: ${g.toFixed(1)}° down.` } : { text: `Comes back at ${g.toFixed(1)}° down.` };
    }
    if (res.status === 'escape') return { text: 'Flung away from Earth altogether.' };
    if (res.status === 'orbit') return { text: 'Comes back, but misses Earth by {d}.', d: res.final.rp - RE };
    return { text: 'The path wanders between Earth and the Moon.' };
  }

  function check(mission, res) {
    const tg = mission.target;
    if (!tg) return null;
    const o = res.final, inside = (x, range) => !range || (x >= range[0] && x <= range[1]);
    const R = tg.lunar ? M.R : RE;
    const c = { apoOk: inside(o.ra - R, tg.apo), periOk: inside(o.rp - R, tg.peri), miss: null, tol: 0 };
    let ok = c.apoOk && c.periOk;
    if (tg.lunar) ok = ok && res.status === 'lunar';
    else if (tg.apo || tg.peri) ok = ok && res.status === 'orbit';
    if (tg.pass) {
      const a = res.approach;
      c.passOk = !!a && a.entered && !a.start && a.dist >= M.R + tg.pass[0] && a.dist <= M.R + tg.pass[1];
      ok = ok && c.passOk;
    }
    if (tg.home) {
      c.angleOk = res.status === 'reentry' && !!res.entry && inside(res.entry.angle, tg.home);
      ok = ok && c.angleOk;
    }
    if (tg.days) {   // a path that loops far out before falling back does not count as coming home
      c.slow = !!c.angleOk && res.duration > tg.days * 86400;
      ok = ok && !c.slow;
    }
    c.ok = ok;
    return c;
  }

  /* The exact values a drag may settle onto: each is a signed miss that is zero at the aim. In
     Free flight both are on offer. */
  function aims(mission, res) {
    const which = mission.target ? mission.aims || [] : ['pass', 'entry'], out = {};
    if (which.includes('pass')) out.pass = passMiss(res, AIM_PASS);
    // A mission that wants a close pass does not settle onto a path home that only brushes the Moon's reach.
    const wide = mission.target && mission.target.pass && res.approach && !(res.approach.entered && res.approach.dist <= M.R + mission.target.pass[1]);
    if (which.includes('entry')) out.entry = wide ? null : entryMiss(res, AIM_ANGLE);
    return out;
  }

  Object.assign(J, {
    MISSIONS, STARTS, FLIGHTS, CORRIDOR, AIM_ANGLE, AIM_PASS, PARK,
    newPlan, vehicleOf, fly, bisect, aimMoon, passMiss, entryMiss, check, aims, meeting, homing, circ, speedAt, km,
    compute: L.compute, stateAtTime: L.stateAtTime,
  });
})(globalThis);
