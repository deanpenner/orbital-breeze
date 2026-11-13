/* Famous flights, offered in Free flight as starting points to alter.
   Orbits, inclinations and published masses are real. Each burn is sized so the model reaches
   the published orbit after it, which is how the real burn times can then be checked against
   the model's (see test/physics.test.mjs). Where a figure is an estimate the note says so.
   Sources are listed in the README. */
(function (G) {
  'use strict';
  const X = G.Orbit.physics, J = G.Orbit.journey, V = J.VEHICLES, { RE, MU } = X, D = Math.PI / 180;
  const burn = (more) => Object.assign(J.newBurn(0), more);
  const one = (name, dry, propMax, thrust, isp, stage) => ({ name, cargo: '', payload: 0, stages: [{ name: stage || name, dry, propMax, isp, thrust }] });
  /* Speed at radius r on an orbit whose other end is at radius far. */
  const speedAt = (r, far) => Math.sqrt(MU * (2 / r - 2 / (r + far)));
  const fly = (f) => J.compute(J.newPlan(f), V[f.vehicle]);

  V.vostok = one('Vostok 3KA', 4475, 250, 15830, 266, 'Retro engine');
  V.sivb = Object.assign(one('Saturn V third stage (S-IVB)', 17000, 74000, 890000, 421, 'S-IVB'), { cargo: 'Apollo spacecraft', payload: 45700 });
  V.mom = one('Mars Orbiter Mission', 485, 852, 440, 301, '440 N engine');
  V.soyuz = one('Soyuz', 6100, 800, 2950, 302, 'Main engine');
  V.gsat29 = one('GSAT-29', 1523, 1900, 440, 315, '440 N engine');
  V.dragon = Object.assign(one('Crew Dragon', 7700, 2562, 1600, 300, 'Draco thrusters'), { cargo: 'of crew, cargo and trunk', payload: 2238 });
  V.gemini = one('Gemini', 3226, 320, 760, 270, 'Manoeuvring thrusters');
  V.glenn2 = Object.assign(one('New Glenn second stage (masses unpublished)', 25000, 175000, 1539000, 445, 'Two BE-3U engines'), { cargo: 'payload', payload: 3000 });

  /* A burn at apoapsis that lifts periapsis to `peri` km and brings the inclination to `inc` degrees. */
  function apogeeBurn(f, laps, peri, inc) {
    const o = fly(f).final, b = burn({ anchor: 'apo', revs: laps, pro: speedAt(o.ra, RE + peri) - speedAt(o.ra, o.rp), turn: o.inc / D - inc });
    f.burns.push(b);
    if (fly(f).final.inc > o.inc) b.turn = -b.turn;   // turn the plane the way that flattens it
  }

  // Mangalyaan raised its apoapsis in steps, always burning at the low point.
  const raise = (laps, from, to) => burn({ anchor: 'peri', revs: laps, pro: speedAt(RE + 264, RE + to) - speedAt(RE + 264, RE + from) });

  function gsat29() {
    const f = { vehicle: 'gsat29', start: { peri: 190, apo: 35975, inc: 21.5, argp: 180, raan: 0, nu: 0 }, burns: [] };
    apogeeBurn(f, 1, 7642, 8.9); apogeeBurn(f, 2, 32825, 0.31); apogeeBurn(f, 1, 35307, 0.05);
    return f.burns;
  }

  function proton() {
    const f = { vehicle: 'breezem', payload: 6070, fuel: [12961, 5200], start: { peri: 173, apo: 173, inc: 51.5, argp: 0, raan: 0, nu: -90 }, burns: [] };
    const r0 = RE + 173;
    f.burns.push(burn({ anchor: 'an', pro: speedAt(r0, RE + 6000) - Math.sqrt(MU / r0) }));
    // One lap later: burn the extra tank dry, drop it, and carry straight on with the core.
    f.burns.push(burn({ anchor: 'peri', revs: 1, mode: 'fuel', amount: fly(f).stages[0].left - 0.4, dir: [1, 0, 0] }));
    f.burns.push({ kind: 'drop' });
    const o = fly(f).final;
    f.burns.push(burn({ anchor: 'peri', pro: speedAt(o.rp, RE + 65044) - speedAt(o.rp, o.ra) }));
    apogeeBurn(f, 0, 4341, 26.75);
    return f;
  }

  function polaris() {
    const rp = RE + 190, at = (apo) => speedAt(rp, RE + apo);
    return [
      burn({ anchor: 'peri', revs: 8, pro: at(1408) - at(1200) }),
      burn({ anchor: 'peri', revs: 6, pro: at(700) - at(1408) }),
      burn({ anchor: 'apo', revs: 57, mode: 'time', amount: 420, dir: [-1, 0, 0] }),
    ];
  }

  /* Gemini 6A chasing Gemini 7. The first three burns are the published ones. The last two are
     worked out: a transfer that climbs to Gemini 7's height 130 degrees later, and a burn there
     that matches its speed. Where Gemini 7 must have started then falls out of the timing. */
  function gemini() {
    const f = { vehicle: 'gemini', start: { peri: 161, apo: 259, inc: 0, argp: 0, raan: 0, nu: 0 }, burns: [] }, target = RE + 298;
    f.burns.push(burn({ anchor: 'peri', revs: 1, pro: 0.0043 }), burn({ anchor: 'apo', pro: 0.0186 }), burn({ anchor: 'apo', revs: 1, pro: 0.0131 }));
    const place = fly(f).burns[2].theta;
    const tpi = burn({ theta: place, revs: 1, pro: 0.009, rad: 0.0012 }), brake = burn({ theta: place + 130 * D });
    f.burns.push(tpi, brake);
    let lo = 0, hi = 0.03;
    for (let i = 0; i < 40; i++) { tpi.pro = (lo + hi) / 2; if (X.len(fly(f).burns[4].r) < target) lo = tpi.pro; else hi = tpi.pro; }
    const at = fly(f).burns[4], up = X.unit(at.r), level = X.cross(at.before.W, up);
    const q = J.paramsFromDv(at, at.before, X.sub(X.scale(level, Math.sqrt(MU / X.len(at.r))), at.v));
    brake.pro = q.pro; brake.rad = q.rad;
    const end = fly(f), last = end.burns[4];
    f.companion = { alt: 298, ahead: X.wrapTau(last.theta - Math.sqrt(MU / target ** 3) * last.t - end.startTheta) / D };
    return f;
  }
  const gem = gemini(), pro = proton();

  J.FLIGHTS.push(
    {
      id: 'mom', name: 'Mangalyaan', when: 'November 2013',
      blurb: 'India’s Mars orbiter had a small engine, so it climbed in steps: seven burns, each at periapsis, raising the apoapsis every time until the last one took it past escape speed.',
      note: 'Each burn is sized to reach the published height, and orbit counts follow the published dates. The fourth burn fell short and was topped up an orbit later. Try doing it in one burn, or burning at apoapsis instead.',
      vehicle: 'mom', start: { peri: 264, apo: 23904, inc: 19.2, argp: 0, raan: 0, nu: 0 }, wide: 230000,
      burns: [raise(5, 23904, 28825), raise(3, 28825, 40186), raise(2, 40186, 71636), raise(2, 71636, 78276), raise(1, 78276, 118642), raise(2, 118642, 192874), burn({ anchor: 'peri', revs: 4, pro: 0.648 })],
      expect: (res, near) => { near('  Mangalyaan first burn time (s), published 416', res.burns[0].burnTime, 416, 80); near('  Mangalyaan days from first burn to the last, published 24.0', (res.burns[6].t - res.burns[0].t) / 86400, 24, 1); },
    },
    {
      id: 'gsat29', name: 'GSAT-29', when: 'November 2018',
      blurb: 'A communications satellite finishing its own trip to geostationary orbit. Its rocket left it on a long, inclined ellipse. Three burns at apoapsis, a day apart, raise the periapsis and take out the inclination.',
      note: 'The engine gives 440 N, so the first two burns each last over 80 minutes. Sized to the published orbits, the model’s burn times land within 5% of the real ones. Starting orbit and propellant load are typical figures for this rocket and satellite, not published for this flight. Try one big burn, or changing the plane at periapsis.',
      vehicle: 'gsat29', start: { peri: 190, apo: 35975, inc: 21.5, argp: 180, raan: 0, nu: 0 }, burns: gsat29(),
      expect: (res, near) => { near('  GSAT-29 first firing (s), published 4,875', res.burns[0].burnTime, 4875, 150); near('  GSAT-29 second firing (s), published 4,988', res.burns[1].burnTime, 4988, 150); near('  GSAT-29 third firing (s), published 207', res.burns[2].burnTime, 207, 20); near('  GSAT-29 final inclination (deg)', res.final.inc / D, 0.05, 0.05); },
    },
    {
      id: 'proton', name: 'Proton and Breeze-M', when: 'February 2015',
      blurb: 'Delivering Inmarsat-5 F2 from a launch site far from the equator. The upper stage climbs in two steps, drops its empty extra tank mid-burn, and goes far above geostationary height before changing its plane.',
      note: 'Orbits, inclination and satellite mass are published; the tank’s share of the stage’s structure is an estimate, and the model’s burn times run up to a quarter over the flight’s. Why go to 65,000 km? Try changing the plane lower down and watch the propellant.',
      vehicle: 'breezem', payload: 6070, fuel: pro.fuel, start: pro.start, burns: pro.burns, wide: 120000,
      expect: (res, near) => { near('  Proton final periapsis (km)', res.final.rp - RE, 4341, 5); near('  Proton final inclination (deg)', res.final.inc / D, 26.75, 0.01); near('  Proton last burn (s), published 209', res.burns[4].burnTime, 209, 60); },
    },
    {
      id: 'gemini6', name: 'Gemini 6A', when: '15 December 1965',
      blurb: 'The first rendezvous. Gemini 6A starts about 2,000 km behind Gemini 7 and lower, so its period is shorter and it closes in. Three burns raise it, in steps, to just below its target; the last two climb the final 28 km and match speed.',
      note: 'The first three burns are the published ones. The last two are worked out to meet at 298 km. Shown in one plane; the real orbits were inclined 28.9°, and a small out-of-plane correction is left out. Try skipping a step, or going straight up to Gemini 7’s height.',
      vehicle: 'gemini', start: gem.start, burns: gem.burns, companion: gem.companion,
      expect: (res, near) => { near('  Gemini 7 lead at the start that makes the meeting work (km), published about 1,992', gem.companion.ahead * D * (RE + 298), 1992, 400); near('  Gemini 6A hours to rendezvous, published about 5.8', res.burns[4].t / 3600 + 0.1, 5.8, 0.4); near('  Gemini orbit after the third burn: periapsis (km), published 270', res.burns[2].after.rp - RE, 270, 6); },
    },
    {
      id: 'polaris', name: 'Polaris Dawn', when: 'September 2024',
      blurb: 'A crew Dragon flown higher than anyone since Apollo. A burn at periapsis raises the apoapsis to 1,408 km. Six orbits later another brings it down to 700 km for the first private spacewalk, and days later a seven-minute burn ends the flight.',
      note: 'Orbit heights, the six orbits and the seven-minute final burn are published. When the first burn came, and how many of Dragon’s 400 N thrusters fire together (four here), are estimates. Why raise the apoapsis from periapsis?',
      vehicle: 'dragon', start: { peri: 190, apo: 1200, inc: 51.7, argp: 0, raan: 0, nu: 0 }, burns: polaris(),
      expect: (res, near) => { near('  Polaris Dawn days aloft, published 4.9', res.duration / 86400, 4.9, 0.4); near('  Polaris Dawn ends in reentry (1 = yes)', +(res.status === 'reentry'), 1, 0); },
    },
    {
      id: 'glenn', name: 'New Glenn', when: '16 January 2025',
      blurb: 'The first New Glenn. Its upper stage made two burns: one to reach orbit, and a second, half an orbit later, that carried its test payload to 2,400 by 19,300 km.',
      note: 'The final orbit, its 30° inclination and the engines are published. Blue Origin has not given the stage’s masses, its burn times, or the orbit between the burns, so those are placeholders: the first burn is taken to end at about 200 by 2,400 km, which fits the 80 minutes the flight took.',
      vehicle: 'glenn2', fuel: 32000, start: { peri: 200, apo: 2400, inc: 30, argp: 0, raan: 0, nu: 0 },
      burns: [burn({ anchor: 'apo', pro: speedAt(RE + 2400, RE + 19300) - speedAt(RE + 2400, RE + 200) })],
      expect: (res, near) => { near('  New Glenn final apoapsis (km)', res.final.ra - RE, 19300, 5); near('  New Glenn minutes from orbit to the final burn', res.burns[0].t / 60, 56, 3); },
    },
    {
      id: 'vostok1', name: 'Vostok 1', when: '12 April 1961',
      blurb: 'Yuri Gagarin’s single orbit. About three quarters of the way round, the retro engine fires for some 42 seconds and the capsule falls back into the atmosphere.',
      note: 'Orbit, engine and burn time are published figures. Where on the orbit the burn fell is approximate.',
      vehicle: 'vostok', start: { peri: 181, apo: 327, inc: 64.95, argp: 0, raan: 0, nu: 0 },
      burns: [burn({ after: 270, mode: 'time', amount: 41, dir: [-1, 0, 0] })],
      expect: (res, near) => near('  Vostok 1 retro burn (m/s)', res.burns[0].cmd * 1000, 142, 6),
    },
    {
      id: 'soyuz', name: 'Soyuz landing', when: '18 June 2016',
      blurb: 'Soyuz TMA-20M leaving the space station. One deorbit burn of 128 m/s, under five minutes long, and half an hour later it meets the atmosphere.',
      note: 'Burn size, burn time and the half-hour fall are published. Station height and capsule mass are estimates.',
      vehicle: 'soyuz', fuel: 500, start: { peri: 400, apo: 400, inc: 51.6, argp: 0, raan: 0, nu: 0 },
      burns: [burn({ after: 150, pro: -0.128 })],
      expect: (res, near) => { near('  Soyuz burn time (s), published 281', res.burns[0].burnTime, 281, 12); near('  Soyuz burn to atmosphere (min), published 30', (res.entry.t - res.burns[0].t) / 60, 30, 3); },
    },
  );
})(globalThis);
