/* Shared pieces of a journey on the Moon page: the craft, and how a burn is described.
   A journey is a start orbit plus a chain of steps (burns, and things let go of). The chain is
   walked by lunar.js. Angles in plans are in degrees. */
(function (G) {
  'use strict';
  const X = G.Orbit.physics;
  const { RE } = X;
  const D = Math.PI / 180;
  const ECC_APS = 0.002;   // below this an orbit has no useful apsides

  /* Real craft. Each stage: inert mass and full propellant in kg, vacuum Isp in s, thrust in N.
     `release` names the step that lets go of the payload once the last stage is firing. */
  const one = (name, cargo, payload, dry, propMax, thrust, isp, stage) => ({ name, cargo, payload, stages: [{ name: stage || name, dry, propMax, isp, thrust }] });
  const SM = { name: 'Service module', dry: 11670, propMax: 18410, isp: 314, thrust: 91000 };
  const VEHICLES = {
    // The S-IVB's empty mass and fuel left in orbit are estimates; the rest are published.
    apollo: {
      name: 'Apollo with S-IVB stage', cargo: 'lunar module', payload: 15100, release: 'Lander separation',
      stages: [{ name: 'S-IVB', dry: 17000, propMax: 74000, isp: 421, thrust: 890000 }, SM],
    },
    csm: { name: 'Apollo spacecraft', cargo: 'lunar module', payload: 15100, release: 'Lander separation', stages: [Object.assign({}, SM, { name: 'Service engine' })] },
    // The lander is published at 1,749.9 kg and the module at 448.6 kg empty with 1,696.4 kg of fuel.
    // ISRO has not published the engine's efficiency; 315 s is typical of its 440 N engine.
    chandrayaan3: Object.assign(one('Chandrayaan-3', 'lander', 1749.9, 448.6, 1696.4, 440, 315, '440 N engine'), { release: 'Lander separation' }),
    centaur: one('Centaur upper stage', 'probe', 4000, 2247, 20830, 99200, 450.5, 'Centaur'),
    orion: one('Orion with service module', '', 0, 16585, 8600, 26700, 315.1, 'Main engine'),
  };

  const newBurn = (theta, anchor, body) => Object.assign({ theta, anchor: anchor || 'free', pro: 0, rad: 0, turn: 0, revs: 0 }, body === 'moon' ? { body } : null);
  /* A start orbit as the plan stores it (heights above the surface, degrees) to elements. */
  const elementsOf = (s, R) => ({ rp: (R || RE) + s.peri, ra: (R || RE) + s.apo, inc: (s.inc || 0) * D, argp: (s.argp || 0) * D, raan: (s.raan || 0) * D, nu: (s.nu || 0) * D });
  const fullFuel = (vehicle, fuel) => vehicle.stages.map((s, k) => (Array.isArray(fuel) ? fuel[k] : k === 0 ? fuel : null) ?? s.propMax);

  function burnNu(o, b) {
    if (o.e > ECC_APS) {
      if (b.anchor === 'peri') return 0;
      if (b.anchor === 'apo' && o.e < 1) return Math.PI;
    }
    return X.nuOfArg(o, b.theta);
  }

  const turnAbout = (u, k, a) => X.add(X.add(X.scale(u, Math.cos(a)), X.scale(X.cross(k, u), Math.sin(a))), X.scale(k, X.dot(k, u) * (1 - Math.cos(a))));

  /* A burn as the player describes it: speed added along the path (prograde) and speed added
     straight away from the body being orbited (radial). `turn` swings the path out of its plane;
     the Moon page never uses it, but plans keep the field. Returns the delta-v vector. */
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
    const u = X.add(X.scale(rh, X.dot(v2, rh)), X.scale(hh, Math.hypot(along, up)));
    const d = X.sub(u, st.v), t = X.unit(st.v), n = X.cross(t, o.W);
    const rad = X.dot(d, n) / X.dot(rh, n);
    return { pro: X.dot(d, t) - rad * X.dot(rh, t), rad, turn: Math.atan2(up, along) / D };
  }

  G.Orbit.journey = { VEHICLES, ECC_APS, D, newBurn, elementsOf, fullFuel, burnNu, dvFromParams, paramsFromDv };
})(globalThis);
