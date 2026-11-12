/* Famous flights to the Moon, offered in Free flight as starting points to alter.
   Orbits and published masses are real. Each burn is sized so the model reaches the published
   orbit (or the published timing) after it, which is how the real burns can then be checked
   against the model's (see moon/test/lunar.test.mjs). The Moon's orbit is a circle here, so its
   starting angle is found so that the model's flight actually meets it. Where a figure is an
   estimate the note says so. Sources are listed in moon/README.md. */
(function (G) {
  'use strict';
  const X = G.Orbit.physics, J = G.Orbit.journey, L = G.Orbit.lunar, { RE } = X, M = L.MOON, D = Math.PI / 180;
  const burn = (more) => Object.assign(J.newBurn(0), more);
  const moonBurn = (more) => Object.assign(J.newBurn(0, 'peri', 'moon'), more);
  const fly = (f) => J.fly(J.newPlan(f));
  const lastBurn = (res) => res.burns.filter((b) => !b.drop && !b.unreachable).pop();
  function secant(f, x0, x1) {
    let f0 = f(x0), f1 = f(x1);
    for (let i = 0; i < 8 && Math.abs(f1) > 1e-6 && f1 !== f0; i++) { const x2 = x1 - f1 * (x1 - x0) / (f1 - f0); x0 = x1; f0 = f1; x1 = x2; f1 = f(x1); }
    return x1;
  }
  /* A burn at periapsis sized to put the far side of the orbit at `apo` km above the surface. */
  const toApo = (rb, R, apo) => J.speedAt(X.len(rb.r), R + apo, rb.mu) - rb.speed0;

  /* Apollo 11. Published: parking orbit, the time from departure to the Moon, the height of the
     pass, the orbits after each burn at the Moon, the timing of the burn home, and the entry angle. */
  function apollo11() {
    const f = { vehicle: 'apollo', fuel: [74000, 16800], start: { peri: 183, apo: 186, nu: 0 }, moon: 0, burns: [] };
    const tli = burn({ after: 622.5, pro: 3.155 });
    f.burns.push(tli);
    // Departure: big enough to reach the Moon in the published 73.1 h, timed to pass 111 km above it.
    let rough = true;
    const transit = (dv) => { tli.pro = dv; const p = J.newPlan(f); f.moon = J.aimMoon(p, (r) => J.passMiss(r, 111), rough ? 35 : f.moon, rough ? 25 : 1, rough ? 100 : 8); rough = false; const r = J.fly(p); return (r.approach.t - r.burns[0].t) / 3600 - 73.1; };
    tli.pro = secant(transit, 3.155, 3.158); transit(tli.pro);
    f.burns.push({ kind: 'drop' });
    // First burn at the Moon: into 314 by 111 km.
    const loi1 = moonBurn({ anchor: 'peri' });
    f.burns.push(loi1);
    loi1.pro = toApo(lastBurn(fly(f)), M.R, 314);
    // Second, two laps later: into 122 by 101 km. Not at an apsis, so it needs a radial part too.
    const before = lastBurn(fly(f)), loi2 = moonBurn({ anchor: 'free', theta: before.theta + 4 * D, revs: 2 });
    f.burns.push(loi2);
    const at = lastBurn(fly(f)), r = X.len(at.r), rp = M.R + 101, ra = M.R + 122;
    const level = Math.sqrt(M.mu * 2 * rp * ra / (rp + ra)) / r, speed = Math.sqrt(M.mu * (2 / r - 2 / (rp + ra)));
    const up = X.unit(at.r), across = X.cross(at.before.W, up);
    const want = X.add(X.scale(across, level), X.scale(up, Math.sqrt(Math.max(0, speed * speed - level * level))));
    const q = J.paramsFromDv(at, at.before, X.sub(want, at.v));
    loi2.pro = q.pro; loi2.rad = q.rad;
    // The lander goes down and comes back; its remains are left in lunar orbit.
    f.burns.push({ kind: 'drop' });
    // The burn home, 55 h after the second burn: placed and sized to meet the atmosphere at the
    // published 6.5 degrees, 59.6 h later.
    const tei = moonBurn({ anchor: 'free', theta: 0, revs: 27, pro: 1 });
    f.burns.push(tei);
    const moonThen = f.moon + (at.t + 27.5 * at.after.period) * M.n / D;   // roughly where the Moon is by then
    let last = null;
    const place = (dv) => {
      tei.pro = dv;
      const miss = (th) => { tei.theta = th * D; return J.entryMiss(fly(f), 6.48); };
      // Several places lead home. The quickest way back is the one furthest round the orbit.
      const from = last == null ? -moonThen + 40 : last + 2, n = last == null ? 50 : 8, step = last == null ? 1 : 0.5;
      for (let i = 0, prev = miss(from); i < n; i++) {
        const next = miss(from - (i + 1) * step);
        if ((prev > 0) !== (next > 0)) { const th = J.bisect(miss, from - i * step, from - (i + 1) * step, 36); if (Math.abs(miss(th)) < 0.01) return (last = th); }
        prev = next;
      }
      return null;
    };
    const fall = (dv) => { place(dv); const res = fly(f); return res.entry ? (res.entry.t - lastBurn(res).t) / 3600 - 59.63 : 99; };
    tei.pro = secant(fall, 1.0, 1.01); place(tei.pro);
    return f;
  }

  /* Chandrayaan-3. Published: every orbit along the way, and the dates, which give the laps. */
  function chandrayaan3() {
    const f = { vehicle: 'chandrayaan3', start: { peri: 170, apo: 36500, nu: 0 }, moon: 0, burns: [] };
    const add = (b) => { f.burns.push(b); return b; };
    const raise = (laps, apo) => { const b = add(burn({ anchor: 'peri', revs: laps })); b.pro = toApo(lastBurn(fly(f)), RE, apo); };
    raise(2, 41762);
    // The second firing was at the high point, lifting the low point clear of the air.
    const lift = add(burn({ anchor: 'apo', revs: 3 }));
    lift.pro = toApo(lastBurn(fly(f)), RE, 226);
    raise(2, 51400); raise(3, 71351); raise(5, 127603);
    // The published orbit after the sixth burn reached 369,328 km, about where the Moon was that
    // week. Here the Moon is always 384,400 km away, so the burn is sized to reach that far instead,
    // and the Moon is placed so the craft meets it on the way up and passes 164 km above it.
    raise(3, M.a - RE);
    f.moon = J.aimMoon(J.newPlan(f), (r) => (r.approach && r.approach.entered ? r.approach.pass + M.R + 164 : null), 255, 8, 64);
    const lower = (laps, apo) => { const b = add(moonBurn({ anchor: 'peri', revs: laps })); b.pro = toApo(lastBurn(fly(f)), M.R, apo); };
    lower(0, 18074); lower(1, 4313); lower(10, 1437); lower(37, 177); lower(21, 153);
    return f;
  }

  J.FLIGHTS.push(
    {
      id: 'apollo11', name: 'Apollo 11', when: 'July 1969',
      blurb: 'The first landing. One burn sends the stack toward where the Moon will be three days later. Two burns behind the Moon brake it into a low orbit, the lander is left behind, and one more burn sends the crew home.',
      note: 'Orbits, timings and the 43,570 kg arriving at the Moon are published; the S-IVB’s masses are estimates. The Moon’s orbit is a circle here, and its start is set so this flight meets it. The model’s burns are 3,156, 838, 42 and 1,009 m/s; the real ones were 3,182, 889, 48 and 999. Try skipping the second burn.',
      vehicle: 'apollo', build: apollo11,
      expect: (res, near) => {
        const b = res.burns.filter((x) => !x.drop);
        near('  Apollo 11 departure burn (m/s), published 3,182', b[0].cmd * 1000, 3182, 40);
        near('  Apollo 11 hours from departure to the Moon, published 73.1', (b[1].t - b[0].t) / 3600, 73.1, 0.1);
        near('  Apollo 11 first lunar burn (m/s), published 889', b[1].cmd * 1000, 889, 55);
        near('  Apollo 11 first lunar burn time (s), published 357.5', b[1].burnTime, 357.5, 20);
        near('  Apollo 11 mass after it (kg), published 32,675', b[1].mass0 - b[1].fuelUsed, 32675, 600);
        near('  Apollo 11 orbit after it: high point (km), published 314', b[1].after.ra - M.R, 314, 1);
        near('  Apollo 11 second lunar burn (m/s), published 48.4', b[2].cmd * 1000, 48.4, 9);
        near('  Apollo 11 orbit after it: low point (km), published 101', b[2].after.rp - M.R, 101, 1);
        near('  Apollo 11 orbit after it: high point (km), published 122', b[2].after.ra - M.R, 122, 1);
        near('  Apollo 11 hours from second burn to the burn home, published 55.2', (b[3].t - b[2].t) / 3600, 55.2, 1.1);
        near('  Apollo 11 burn home (m/s), published 999', b[3].cmd * 1000, 999, 30);
        near('  Apollo 11 burn home time (s), published 151.4', b[3].burnTime, 151.4, 18);
        near('  Apollo 11 hours from that burn to the atmosphere, published 59.6', (res.entry.t - b[3].t) / 3600, 59.63, 0.1);
        near('  Apollo 11 entry speed (km/s), published 11.03', res.entry.speed, 11.032, 0.05);
        near('  Apollo 11 entry angle (deg), published 6.48', res.entry.angle, 6.48, 0.02);
      },
    },
    {
      id: 'chandrayaan3', name: 'Chandrayaan-3', when: 'July and August 2023',
      blurb: 'India’s lander went the patient way. A small engine fires at the low point of the orbit five times over two weeks, stretching it further each lap. A sixth burn reaches the Moon, and five more there bring a long capture orbit down to a low circle.',
      note: 'Orbits and laps are the published ones. The Moon’s orbit is a circle here, so the sixth burn reaches 378,000 km, not the real 369,328, and the Moon’s start is set to meet it. The real Moon was near its closest and fastest that week, so the capture burn here is a sixth shorter than the real 1,835 s. Shown flat. The engine’s efficiency is an estimate.',
      vehicle: 'chandrayaan3', build: chandrayaan3,
      expect: (res, near) => {
        const b = res.burns.filter((x) => !x.drop);
        near('  Chandrayaan-3 days from launch orbit to the burn for the Moon, published 17.4', b[5].t / 86400, 17.4, 0.4);
        near('  Chandrayaan-3 orbit after that burn: high point (km), published 369,328', b[5].after.ra - RE, 369328, 9000);
        near('  Chandrayaan-3 days from that burn to the Moon, published 4.8', (b[6].t - b[5].t) / 86400, 4.8, 0.8);
        near('  Chandrayaan-3 capture burn time (s), published 1,835', b[6].burnTime, 1835, 330);
        near('  Chandrayaan-3 capture orbit: high point (km), published 18,074', b[6].after.ra - M.R, 18074, 5);
        near('  Chandrayaan-3 days from capture to the last burn, published 10.6', (b[10].t - b[6].t) / 86400, 10.6, 0.3);
        near('  Chandrayaan-3 final orbit: low point (km), published 153', res.final.rp - M.R, 153, 1);
        near('  Chandrayaan-3 final orbit: high point (km), published 163', res.final.ra - M.R, 163, 2);
      },
    },
  );
})(globalThis);
