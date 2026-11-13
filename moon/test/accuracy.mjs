// How far can the Moon page be trusted? Run with: node moon/test/accuracy.mjs  (takes a few seconds)
//
// The game uses patched conics: one body pulls at a time. This script flies the same journeys in a
// "truth" model where Earth and the Moon both pull all the time (integrated step by step, Earth-centred,
// with the Moon on the same circle the game uses) and prints the two side by side. The figures quoted
// in moon/README.md, and the limits in lunar.js for orbits that would not last, come from here.
import '../js/physics.js';
import '../js/journey.js';
import '../js/lunar.js';
import '../js/missions.js';
import '../js/flights.js';

const X = globalThis.Orbit.physics, J = globalThis.Orbit.journey, L = globalThis.Orbit.lunar;
const { RE, MU } = X, M = L.MOON, D = Math.PI / 180, V = J.VEHICLES.apollo;
const km = (x) => Math.round(x).toLocaleString('en-US');

/* ---------- the truth model ---------- */
const acc = (r, t, a0) => {
  const m = L.moonAt(t, a0).r, d = X.sub(r, m), r3 = X.len(r) ** 3, d3 = X.len(d) ** 3, m3 = M.a ** 3;
  return [0, 1, 2].map((i) => -MU * r[i] / r3 - M.mu * (d[i] / d3 + m[i] / m3));   // the last term: Earth itself is pulled toward the Moon
};
const ax = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
function rk4(s, h, a0) {
  const k1v = acc(s.r, s.t, a0), k1r = s.v;
  const k2r = ax(s.v, k1v, h / 2), k2v = acc(ax(s.r, k1r, h / 2), s.t + h / 2, a0);
  const k3r = ax(s.v, k2v, h / 2), k3v = acc(ax(s.r, k2r, h / 2), s.t + h / 2, a0);
  const k4r = ax(s.v, k3v, h), k4v = acc(ax(s.r, k3r, h), s.t + h, a0);
  return { t: s.t + h, r: s.r.map((x, i) => x + h / 6 * (k1r[i] + 2 * k2r[i] + 2 * k3r[i] + k4r[i])), v: s.v.map((x, i) => x + h / 6 * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i])) };
}
const rel = (s, a0) => { const m = L.moonAt(s.t, a0); return { r: X.sub(s.r, m.r), v: X.sub(s.v, m.v) }; };
/* Fly from state s until stop(now, before) is true, something is hit, or tMax. */
function fly(s, a0, tMax, stop) {
  let minMoon = { d: Infinity }, minEarth = { d: Infinity }, prev = s, end = 'time';
  while (s.t < tMax) {
    const re = X.len(s.r), rm = X.len(rel(s, a0).r);
    if (rm < minMoon.d) minMoon = { d: rm, t: s.t, s };
    if (re < minEarth.d) minEarth = { d: re, t: s.t };
    if (re < RE + 100) { end = 'reentry'; break; }
    if (rm < M.R) { end = 'impact'; break; }
    if (re > X.SOI) { end = 'escape'; break; }
    if (stop && stop(s, prev)) { end = 'stop'; break; }
    const h = Math.min(0.025 * Math.min(Math.sqrt(re ** 3 / MU), Math.sqrt(rm ** 3 / M.mu)), 600);
    prev = s; s = rk4(s, Math.min(h, tMax - s.t + 1e-9), a0);
  }
  return { s, end, minMoon, minEarth };
}
const toClosest = (s, a0, tMax) => fly(s, a0, tMax, (c, p) => { const a = rel(p, a0), b = rel(c, a0); return X.len(b.r) < 2 * M.soi && X.dot(a.r, a.v) < 0 && X.dot(b.r, b.v) >= 0; });
const moonOrbit = (s, a0) => { const q = rel(s, a0); return X.fromState(q.r, q.v, M.mu); };
const afterBurn = (res, i) => ({ t: res.burns[i].t, r: res.burns[i].r, v: res.burns[i].v2 });
const bisect = (f, lo, hi, n = 40) => { let flo = f(lo); for (let k = 0; k < n; k++) { const m = (lo + hi) / 2, fm = f(m); if ((fm > 0) === (flo > 0)) { lo = m; flo = fm; } else hi = m; } return (lo + hi) / 2; };
const cross = (f, lo, hi, step, jump) => { for (let x = lo; x < hi; x += step) { const u = f(x), v = f(x + step); if (u != null && v != null && (u > 0) !== (v > 0) && Math.abs(u - v) < jump) return bisect(f, x, x + step); } return null; };
const base = () => ({ start: { peri: 185, apo: 185, inc: 0, argp: 0, raan: 0, nu: -90 }, moon: 0, fuel: [74000, 18400], vehicle: 'apollo', burns: [J.newBurn(-Math.PI / 2)] });
const mission = (id) => J.MISSIONS.find((m) => m.id === id);

console.log('1. Leaving for the Moon: the same departure burn, flown both ways');
for (const [dv, alt] of [[3.15, 110], [3.15, 5000], [3.2, 110], [3.2, 5000]]) {
  const p = base(); p.burns[0].pro = dv;
  const aim = cross((a) => { p.moon = a; const r = L.compute(p, V); return r.approach && r.approach.entered ? r.approach.pass - (M.R + alt) : null; }, 0, 360, 0.2, 30000);
  p.moon = aim; const g = L.compute(p, V), a0 = aim * D, s0 = afterBurn(g, 0), dir = X.unit(s0.v);
  const same = toClosest(s0, a0, g.approach.t * 2);
  const miss = (x) => { const t = toClosest({ t: s0.t, r: s0.r, v: X.add(s0.v, X.scale(dir, x)) }, a0, g.approach.t * 2.5); return t.end !== 'stop' ? null : (moonOrbit(t.s, a0).W[2] < 0 ? 1 : -1) * t.minMoon.d - (M.R + alt); };
  const fix = cross(miss, -0.006, 0.006, 0.0001, 30000), fixed = toClosest({ t: s0.t, r: s0.r, v: X.add(s0.v, X.scale(dir, fix)) }, a0, g.approach.t * 2.5);
  const vg = Math.sqrt(M.mu * (2 / g.approach.orbit.rp - 1 / g.approach.orbit.a));
  console.log(`   burn ${Math.round(dv * 1000)} m/s. Game: passes ${km(alt)} km above the Moon after ${(g.approach.t / 3600).toFixed(1)} h at ${vg.toFixed(2)} km/s.`);
  console.log(`     Truth, same burn: ${same.end === 'impact' ? 'hits the Moon' : 'passes ' + km(same.minMoon.d - M.R) + ' km above it'}. Truth with the burn changed by ${(fix * 1000).toFixed(1)} m/s: ${km(fixed.minMoon.d - M.R)} km after ${(fixed.minMoon.t / 3600).toFixed(1)} h at ${X.len(rel(fixed.s, a0).v).toFixed(2)} km/s.`);
}

console.log('\n2. Braking into lunar orbit with the game\'s burn');
{
  const p = J.newPlan(mission('stay')), brake = J.newBurn(0, 'peri', 'moon'); p.burns.push({ kind: 'drop' }, brake);
  brake.pro = J.fly(p).burns[2].dvCircular;
  const g = J.fly(p), a0 = g.moon0, s0 = afterBurn(g, 0), dir = X.unit(s0.v);
  const fix = cross((x) => { const t = toClosest({ t: s0.t, r: s0.r, v: X.add(s0.v, X.scale(dir, x)) }, a0, g.approach.t * 2); return t.end !== 'stop' ? null : t.minMoon.d - (M.R + 110); }, -0.004, 0.004, 0.0001, 5000);
  const t = toClosest({ t: s0.t, r: s0.r, v: X.add(s0.v, X.scale(dir, fix)) }, a0, g.approach.t * 2), q = rel(t.s, a0);
  const o = moonOrbit({ t: t.s.t, r: t.s.r, v: X.add(t.s.v, X.scale(X.unit(q.v), brake.pro)) }, a0);
  console.log(`   Game: ${Math.round(-brake.pro * 1000)} m/s gives ${km(g.final.rp - M.R)} x ${km(g.final.ra - M.R)} km. Truth: the same burn at the true closest point gives ${km(o.rp - M.R)} x ${km(o.ra - M.R)} km.`);
}

console.log('\n3. Orbits the game calls closed, flown in truth');
for (const apo of [100000, 200000, 300000]) {
  const o = X.fromElements({ rp: RE + 300, ra: apo, inc: 0, argp: 0, raan: 0, nu: 0 }); let worst = 0, lost = false;
  for (const moonDeg of [0, 60, 120, 180, 240, 300]) {
    let cur = { t: 0, r: X.stateAt(o, 0).r, v: X.stateAt(o, 0).v };
    for (let k = 0; k < 5 && !lost; k++) { const f = fly(cur, moonDeg * D, cur.t + o.period); cur = f.s; if (f.end !== 'time') lost = true; else worst = Math.max(worst, Math.abs(X.fromState(cur.r, cur.v, MU).rp - RE - 300)); }
  }
  console.log(`   Earth orbit, 300 km by ${km(apo)} km from Earth's centre: within 5 orbits the low point ${lost ? 'drops into the atmosphere for some Moon positions' : 'moves by up to ' + km(worst) + ' km'}.`);
}
for (const alt of [2000, 10000, 20000, 30000, 45000, 60000]) for (const sense of [1, -1]) {
  const r = M.R + alt, m = L.moonAt(0, 0), T = 2 * Math.PI * Math.sqrt(r ** 3 / M.mu);
  let c = { t: 0, r: X.add(m.r, [r, 0, 0]), v: X.add(m.v, [0, sense * Math.sqrt(M.mu / r), 0]) }, lo = r, hi = r, gone = null;
  const tEnd = Math.max(10 * T, 20 * 86400);
  while (c.t < tEnd && !gone) { const f = fly(c, 0, c.t + T / 40, (s) => X.len(rel(s, 0).r) > M.soi * 1.5); c = f.s; const d = X.len(rel(c, 0).r); lo = Math.min(lo, d); hi = Math.max(hi, d); if (f.end !== 'time') gone = f.end; }
  console.log(`   Lunar orbit, circular at ${km(alt)} km, ${sense > 0 ? 'with' : 'against'} the Moon's motion: ${gone === 'stop' ? 'pulled away from the Moon after ' + (c.t / 86400).toFixed(0) + ' days' : gone === 'impact' ? 'hits the Moon' : 'height ranges ' + km(lo - M.R) + ' to ' + km(hi - M.R) + ' km'}.`);
}

console.log('\n4. Does the game get the ending right? Departures of 3,140 and 3,200 m/s at every Moon position');
{
  const tally = { one: [0, 0], more: [0, 0] };
  for (const dv of [3.14, 3.2]) for (let a = 0; a < 360; a += 0.5) {
    const p = base(); p.burns[0].pro = dv; p.moon = a;
    const g = L.compute(p, V), passes = g.legs.filter((l) => l.body === 'moon').length;
    if (!passes) continue;
    const key = g.status === 'unsettled' ? 'more' : 'one';
    const t = fly(afterBurn(g, 0), a * D, g.duration + 5 * 86400), truth = t.end === 'time' ? 'flying' : t.end;
    const same = key === 'one' && (g.status === truth || ((g.status === 'orbit' || g.status === 'lunar') && truth === 'flying'));
    tally[key][0]++; if (same) tally[key][1]++;
  }
  console.log(`   One pass of the Moon: truth ends the same way in ${tally.one[1]} of ${tally.one[0]} journeys.`);
  console.log(`   A second, unplanned meeting: ${tally.more[0]} journeys. The game stops following these; before it did, about a third ended the way truth does.`);
}
