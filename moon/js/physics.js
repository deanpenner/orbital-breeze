/* Copy of ../../js/physics.js with one change: an orbit carries its own gravitational
   parameter (o.mu), so the same math serves orbits around the Moon.
   Two-body orbit math around Earth. Units: km, s, kg. Vectors are [x, y, z].
   Everything is 3D so plane changes can be added without touching this file. */
(function (G) {
  'use strict';
  const MU = 398600.4418;      // km^3/s^2
  const RE = 6378.137;         // km, equatorial radius
  const G0 = 9.80665;          // m/s^2
  const ATM = 100;             // km, altitude treated as "reentry"
  const SOI = 924000;          // km, edge of Earth's sphere of influence
  const TAU = Math.PI * 2;
  const SPIN = 7.2921159e-5;   // rad/s, Earth's rotation

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const wrapTau = (x) => { x %= TAU; return x < 0 ? x + TAU : x; };
  const wrapPi = (x) => wrapTau(x + Math.PI) - Math.PI;

  /* Orbit from a position and velocity. P points at periapsis, Q is 90 degrees
     ahead in the direction of travel, W is the orbit normal. */
  function fromState(r, v, mu) {
    mu = mu || MU;
    const rm = len(r), vm = len(v);
    const h = cross(r, v), hm = len(h);
    const W = unit(h);
    const ev = sub(scale(cross(v, h), 1 / mu), scale(r, 1 / rm));
    const e = len(ev);
    const energy = vm * vm / 2 - mu / rm;
    const p = hm * hm / mu;
    // R is a fixed reference direction lying in the orbit plane (the x axis, flattened onto it);
    // S is 90 degrees ahead of it. Places on the orbit are measured as an angle from R.
    let R = sub([1, 0, 0], scale(W, W[0]));
    if (len(R) < 1e-6) R = sub([0, 1, 0], scale(W, W[1]));
    R = unit(R);
    const S = cross(W, R);
    const P = e < 1e-7 ? R : unit(ev);
    const Q = cross(W, P);
    const a = Math.abs(energy) < 1e-12 ? Infinity : -mu / (2 * energy);
    const n = isFinite(a) ? Math.sqrt(mu / Math.abs(a * a * a)) : 0;
    return {
      mu, e, a, p, W, P, Q, R, S, n, energy,
      rp: p / (1 + e),
      ra: e < 1 ? p / (1 - e) : Infinity,
      period: e < 1 ? TAU / n : Infinity,
      inc: Math.acos(clamp(W[2], -1, 1)),
      nu: Math.atan2(dot(r, Q), dot(r, P)),
    };
  }

  /* Orbit from classical elements. Radii in km, angles in radians; argp and nu are measured
     from the ascending node (or from the x axis for an equatorial orbit). */
  function fromElements(el) {
    const e = (el.ra - el.rp) / (el.ra + el.rp), p = (el.ra + el.rp) / 2 * (1 - e * e);
    const ci = Math.cos(el.inc || 0), si = Math.sin(el.inc || 0), cO = Math.cos(el.raan || 0), sO = Math.sin(el.raan || 0);
    const W = [si * sO, -si * cO, ci], N = [cO, sO, 0], M = cross(W, N);
    const w = el.argp || 0, P = add(scale(N, Math.cos(w)), scale(M, Math.sin(w))), Q = cross(W, P);
    const mu = el.mu || MU, c = Math.cos(el.nu || 0), s = Math.sin(el.nu || 0), rm = p / (1 + e * c), k = Math.sqrt(mu / p);
    return fromState(add(scale(P, rm * c), scale(Q, rm * s)), add(scale(P, -k * s), scale(Q, k * (e + c))), mu);
  }

  /* Angle of a position round the orbit, measured from the reference direction R. */
  const argOf = (o, r) => Math.atan2(dot(r, o.S), dot(r, o.R));
  const nuOfArg = (o, arg) => {
    const d = add(scale(o.R, Math.cos(arg)), scale(o.S, Math.sin(arg)));
    return Math.atan2(dot(d, o.Q), dot(d, o.P));
  };
  const argOfNu = (o, nu) => argOf(o, add(scale(o.P, Math.cos(nu)), scale(o.Q, Math.sin(nu))));

  /* True anomalies where the orbit crosses the equator going north and going south, or null if it never tilts. */
  function nodeNus(o) {
    if (Math.abs(o.W[2]) > 0.9999996) return null;
    let an = Math.atan2(-o.P[2], o.Q[2]);
    if (-Math.sin(an) * o.P[2] + (o.e + Math.cos(an)) * o.Q[2] < 0) an += Math.PI;
    return { an: wrapPi(an), dn: wrapPi(an + Math.PI) };
  }

  /* How fast Earth's bulge turns the orbit plane, degrees per day (positive is eastward). */
  const J2 = 1.08263e-3;
  const nodeRate = (o) => (o.e < 1 ? -1.5 * o.n * J2 * (RE / o.p) ** 2 * o.W[2] * 180 / Math.PI * 86400 : 0);

  const radiusAt = (o, nu) => o.p / (1 + o.e * Math.cos(nu));

  function stateAt(o, nu) {
    const c = Math.cos(nu), s = Math.sin(nu), rm = o.p / (1 + o.e * c), k = Math.sqrt(o.mu / o.p);
    return {
      r: add(scale(o.P, rm * c), scale(o.Q, rm * s)),
      v: add(scale(o.P, -k * s), scale(o.Q, k * (o.e + c))),
    };
  }

  /* Mean anomaly that keeps counting past each revolution (ellipses), so
     differences give coast times directly. */
  function meanAnomaly(o, nu) {
    const e = o.e;
    if (e < 1 - 1e-9) {
      const w = wrapPi(nu);
      const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(w / 2), Math.sqrt(1 + e) * Math.cos(w / 2));
      return E - e * Math.sin(E) + (nu - w);
    }
    if (e > 1 + 1e-9) {
      const x = clamp(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2), -0.999999999999, 0.999999999999);
      const F = 2 * Math.atanh(x);
      return e * Math.sinh(F) - F;
    }
    return NaN;
  }

  /* Seconds since periapsis passage. */
  function timeAt(o, nu) {
    if (Math.abs(o.e - 1) <= 1e-9) {
      const D = Math.tan(nu / 2);
      return 0.5 * Math.sqrt(o.p * o.p * o.p / o.mu) * (D + D * D * D / 3);
    }
    return meanAnomaly(o, nu) / o.n;
  }

  /* Seconds to coast from nu0 through an angle `sweep` (radians, >= 0). */
  const coastTime = (o, nu0, sweep) => timeAt(o, nu0 + sweep) - timeAt(o, nu0);

  /* True anomaly at t seconds after periapsis passage. */
  function nuAtTime(o, t) {
    const e = o.e;
    if (e < 1 - 1e-9) {
      const M = wrapPi(o.n * t);
      let E = e < 0.8 ? M + e * Math.sin(M) : Math.PI * Math.sign(M || 1);
      for (let i = 0; i < 20; i++) {
        const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        E -= d;
        if (Math.abs(d) < 1e-13) break;
      }
      return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    }
    if (e > 1 + 1e-9) {
      const M = o.n * t;
      let F = Math.asinh(M / e);
      for (let i = 0; i < 40; i++) {
        const d = (e * Math.sinh(F) - F - M) / (e * Math.cosh(F) - 1);
        F -= d;
        if (Math.abs(d) < 1e-13) break;
      }
      return 2 * Math.atan(Math.sqrt((e + 1) / (e - 1)) * Math.tanh(F / 2));
    }
    const Wb = t * Math.sqrt(o.mu / (o.p * o.p * o.p));
    const z = Math.cbrt(3 * Wb + Math.sqrt(9 * Wb * Wb + 1));
    return 2 * Math.atan(z - 1 / z);
  }

  /* Outbound true anomaly where the orbit reaches radius r, or null. */
  function nuAtRadius(o, r) {
    if (o.e < 1e-9) return null;
    const c = (o.p / r - 1) / o.e;
    return Math.abs(c) > 1 ? null : Math.acos(c);
  }

  /* Points along an arc, evenly spread for smooth drawing. */
  function arcPoints(o, nu0, sweep, count) {
    const pts = [];
    if (o.e < 1 - 1e-9) {
      const e = o.e, a = o.a, b = a * Math.sqrt(1 - e * e);
      const toE = (nu) => {
        const w = wrapPi(nu);
        return 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(w / 2), Math.sqrt(1 + e) * Math.cos(w / 2)) + (nu - w);
      };
      const E0 = toE(nu0), E1 = toE(nu0 + sweep);
      for (let i = 0; i <= count; i++) {
        const E = E0 + (E1 - E0) * i / count;
        pts.push(add(scale(o.P, a * (Math.cos(E) - e)), scale(o.Q, b * Math.sin(E))));
      }
    } else {
      for (let i = 0; i <= count; i++) pts.push(stateAt(o, nu0 + sweep * i / count).r);
    }
    return pts;
  }

  function hohmann(r1, r2) {
    const at = (r1 + r2) / 2;
    const dv1 = Math.abs(Math.sqrt(MU * (2 / r1 - 1 / at)) - Math.sqrt(MU / r1));
    const dv2 = Math.abs(Math.sqrt(MU / r2) - Math.sqrt(MU * (2 / r2 - 1 / at)));
    return { dv1, dv2, total: dv1 + dv2, time: Math.PI * Math.sqrt(at * at * at / MU) };
  }

  /* Rocket equation. isp in seconds, result in km/s. */
  const exhaust = (isp) => isp * G0 / 1000;
  const dvAvailable = (m0, mEmpty, isp) => exhaust(isp) * Math.log(m0 / mEmpty);
  const massAfter = (m0, dv, isp) => m0 * Math.exp(-dv / exhaust(isp));

  G.Orbit = G.Orbit || {};
  G.Orbit.physics = {
    MU, RE, G0, ATM, SOI, TAU, SPIN,
    add, sub, scale, dot, cross, len, unit, clamp, wrapTau, wrapPi,
    fromState, fromElements, argOf, nuOfArg, argOfNu, nodeNus, nodeRate, stateAt, radiusAt, meanAnomaly, timeAt, coastTime, nuAtTime, nuAtRadius,
    arcPoints, hohmann, exhaust, dvAvailable, massAfter,
  };
})(globalThis);
