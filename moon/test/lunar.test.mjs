// Run with: node moon/test/lunar.test.mjs
import '../js/physics.js';
import '../js/journey.js';
import '../js/lunar.js';
import '../js/missions.js';
import '../js/flights.js';

const X = globalThis.Orbit.physics, J = globalThis.Orbit.journey, L = globalThis.Orbit.lunar;
const { RE, MU } = X, M = L.MOON;
let failed = 0;
function near(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got.toFixed(3)} (expected ${want} within ${tol})`);
}
function truthy(name, v) { if (!v) failed++; console.log(`${v ? 'ok  ' : 'FAIL'} ${name}`); }

// The Apollo stack: third stage for the departure, service module engine at the Moon.
const V = { name: 'Apollo', payload: 15100, stages: [{ name: 'S-IVB', dry: 17000, propMax: 74000, isp: 421, thrust: 890000 }, { name: 'Service module', dry: 11900, propMax: 18400, isp: 314, thrust: 91200 }] };
const burn = (more) => Object.assign(J.newBurn(-Math.PI / 2), more);
const plan = (moon, burns) => ({ start: { peri: 185, apo: 185, inc: 0, argp: 0, raan: 0, nu: -90 }, moon, fuel: [74000, 18400], burns });

// Lunar orbit basics
near('Moon orbital speed (km/s)', M.speed, 1.022, 0.005);
near('Low lunar orbit speed at 110 km (km/s)', Math.sqrt(M.mu / (M.R + 110)), 1.63, 0.01);
near('Low lunar orbit period at 110 km (h)', X.fromElements({ rp: M.R + 110, ra: M.R + 110, mu: M.mu }).period / 3600, 1.98, 0.03);

// A departure burn that just reaches the Moon's distance
const r0 = RE + 185, dvMin = Math.sqrt(MU * (2 / r0 - 2 / (r0 + M.a))) - Math.sqrt(MU / r0);
near('Minimum departure burn to lunar distance (km/s)', dvMin, 3.13, 0.01);
let res = L.compute(plan(200, [burn({ pro: dvMin })]), V);
truthy('with the Moon elsewhere, the craft stays in a long Earth orbit', res.status === 'orbit' && res.finalBody === 'earth' && !res.approach.entered);
near('  whose apoapsis is at the Moon\'s distance (km)', res.final.ra, M.a, 5);
near('  taking about five days to get there (d)', res.final.period / 2 / 86400, 4.97, 0.05);

// Sweep the Moon's starting angle to find the launch windows for a slightly faster departure
const dv = 3.15, hits = [];
for (let a = 0; a < 360; a += 0.5) {
  const r = L.compute(plan(a, [burn({ pro: dv })]), V);
  if (r.approach && r.approach.entered) hits.push({ a, alt: r.approach.dist - M.R, status: r.status, r });
}
truthy(`some Moon positions lead to an encounter (${hits.length} of 720 tried, Moon angle ${hits[0].a} to ${hits[hits.length - 1].a} deg)`, hits.length > 5 && hits.length < 200);
console.log('     periselene altitude by Moon angle:', hits.filter((_, i) => i % 6 === 0).map((h) => `${h.a}: ${Math.round(h.alt)} km (${h.status})`).join(', '));

// Pick a pass a few hundred km above the far side and check the handover between frames
const pass = hits.filter((h) => h.alt > 100 && h.alt < 3000).sort((p, q) => p.alt - q.alt)[0];
truthy('one of them passes within 3,000 km of the surface without hitting', !!pass);
const inLeg = pass.r.legs.findIndex((l) => l.end === 'soi-in'), tIn = pass.r.legs[inLeg].t0 + pass.r.legs[inLeg].dt;
const before = L.stateAtTime(pass.r, tIn - 1e-3), after = L.stateAtTime(pass.r, tIn + 1e-3);
near('position is continuous across the sphere of influence (km)', X.len(X.sub(before.r, after.r)), 0, 0.05);
near('velocity is continuous across the sphere of influence (km/s)', X.len(X.sub(before.v, after.v)), 0, 1e-4);
near('entry happens at the edge of the sphere (km from the Moon)', X.len(after.local), M.soi, 1);
near('time from departure to closest approach (d)', pass.r.approach.t / 86400, 3.1, 0.5);
truthy('the pass is a hyperbola around the Moon', pass.r.approach.orbit.e > 1);

// Lunar orbit insertion: brake at the closest point
const loi = burn({ body: 'moon', anchor: 'peri', pro: 0 });
let p2 = plan(pass.a, [burn({ pro: dv }), { kind: 'drop' }, loi]);
res = L.compute(p2, V);
loi.pro = res.burns[2].dvCircular;
res = L.compute(p2, V);
truthy('braking at closest approach leaves a circular lunar orbit', res.status === 'lunar' && res.finalBody === 'moon' && res.final.e < 1e-6);
near('  insertion burn (km/s)', -loi.pro, 0.83, 0.12);
truthy('  the service module has the fuel for it', !res.burns[2].short);
console.log(`     capture orbit ${Math.round(res.final.a - M.R)} km up, insertion ${Math.round(-loi.pro * 1000)} m/s, ${Math.round(res.fuelLeft)} kg of fuel left`);

// Without braking, the Moon bends the path and hands it back to Earth
res = L.compute(plan(pass.a, [burn({ pro: dv })]), V);
truthy(`an unbraked pass leaves the Moon again (ends: ${res.status} around ${res.finalBody})`, res.legs.some((l) => l.end === 'soi-out'));
const outLeg = res.legs.findIndex((l) => l.end === 'soi-out'), tOut = res.legs[outLeg].t0 + res.legs[outLeg].dt;
near('position is continuous on the way out too (km)', X.len(X.sub(L.stateAtTime(res, tOut - 1e-3).r, L.stateAtTime(res, tOut + 1e-3).r)), 0, 0.05);

// Aimed too low, it hits
const low = hits.find((h) => h.alt < 0);
truthy('a pass aimed below the surface is reported as an impact', !low || low.status === 'impact');

// A journey can begin in lunar orbit, and a craft can let go of what it carries
res = L.compute({ start: { body: 'moon', peri: 110, apo: 110, inc: 180, nu: 0 }, moon: 0, fuel: [0, 5000], burns: [{ kind: 'drop' }, { kind: 'drop' }, { kind: 'drop' }] }, V);
truthy('a start in lunar orbit stays in lunar orbit', res.status === 'lunar' && res.startBody === 'moon');
truthy('the first drop lets go of the stage, the second of the lander, the third of nothing', res.burns[0].done && !res.burns[0].cargo && res.burns[1].cargo && !res.burns[2].done);
near('  mass after both (kg)', res.massEnd, 11900 + 5000, 0.5);

// The entry angle is measured at 122 km, where Apollo quoted it
{
  const o = X.fromElements({ rp: RE + 38, ra: 384400 });
  const p = { start: { peri: 38, apo: 384400 - RE, nu: 180 }, moon: 200, fuel: [0, 0], burns: [] };
  res = L.compute(p, V);
  truthy('a path with its low point at 38 km ends in reentry', res.status === 'reentry' && !!res.entry);
  near('  entry angle (deg)', res.entry.angle, 6.5, 0.15);
  near('  entry speed (km/s)', res.entry.speed, 11.0, 0.05);
  near('  entry height (km)', X.len(res.entry.r) - RE, 122, 0.01);
}

/* ---------- a working solution for every mission ---------- */
const D = Math.PI / 180;
const mission = (id) => J.MISSIONS.find((m) => m.id === id);
/* Search a burn's place for the value a drag would settle onto, starting near `from` (radians). */
function settleTheta(plan, i, miss, from, span, accept) {
  const b = plan.burns[i], f = (x) => { b.theta = x; return miss(J.fly(plan)); };
  for (let k = 0; k < 4000; k++) {
    const x0 = from + span * k / 4000, x1 = from + span * (k + 1) / 4000, u = f(x0), v = f(x1);
    if (u == null || v == null || (u > 0) === (v > 0)) continue;
    const x = J.bisect(f, x0, x1);
    if (Math.abs(f(x)) < 0.05 && (!accept || accept(J.fly(plan)))) return x;
  }
  return null;
}
function solved(id, plan, note) {
  const m = mission(id), r = J.fly(plan), c = J.check(m, r);
  truthy(`mission "${m.title}" is solved by ${note}`, c && c.ok && !r.burns.some((b) => b.short || b.unreachable));
  return r;
}
{
  // 1. One burn to the Moon's distance
  let p = J.newPlan(mission('reach')); p.burns[0].pro = 3.135;
  res = solved('reach', p, 'a burn of 3,135 m/s');
  near('  which is the textbook figure (m/s)', mission('reach').ref() * 1000, 3135, 1);
  truthy('  and a start with no burn is not a solution', !J.check(mission('reach'), J.fly(J.newPlan(mission('reach')))).ok);

  // 2. Move the departure round the orbit until the path passes the Moon
  p = J.newPlan(mission('meet'));
  truthy('mission "Meet the Moon" starts with a clear miss', !J.fly(p).approach.entered);
  let th = settleTheta(p, 0, (r) => J.passMiss(r, J.AIM_PASS), p.burns[0].theta, Math.PI);
  truthy('  a place on the parking orbit sends the craft 110 km above the Moon', th != null);
  res = solved('meet', p, `moving the burn ${((th + Math.PI / 2) / D).toFixed(1)} degrees round the orbit`);
  near('  days to the Moon', res.approach.t / 86400, 3.3, 0.3);
  p.burns[0].theta = th + 1.5 * D;
  truthy('  a pass a degree and a half off still counts', J.check(mission('meet'), J.fly(p)).ok);

  // 3. Free return
  p = J.newPlan(mission('return'));
  truthy('mission "Round the Moon and back" starts unsolved', !J.check(mission('return'), J.fly(p)).ok);
  th = settleTheta(p, 0, (r) => J.aims(mission('return'), r).entry, p.burns[0].theta, -Math.PI / 2);
  res = solved('return', p, 'moving the burn until the pass bends the path home');
  near('  entry angle (deg)', res.entry.angle, 6.5, 0.01);
  near('  height of the pass (km)', res.approach.dist - M.R, 365, 60);
  near('  days out and back', res.duration / 86400, 5.9, 0.3);
  truthy('  with one burn only', res.burns.length === 1 && res.rounded);

  // 4. Drop the S-IVB, brake at the closest point
  p = J.newPlan(mission('stay'));
  near('mission "Stay" arrives 110 km above the Moon (km)', J.fly(p).approach.dist - M.R, 110, 0.5);
  const brake = J.newBurn(0, 'peri', 'moon');
  p.burns.push(brake);
  brake.pro = J.fly(p).burns[1].dvCircular;
  truthy('  without dropping the S-IVB the braking burn runs dry', J.fly(p).burns[1].short && !J.check(mission('stay'), J.fly(p)).ok);
  p.burns.splice(1, 0, { kind: 'drop' });
  brake.pro = J.fly(p).burns[2].dvCircular;
  res = solved('stay', p, 'dropping the stage and braking to a circle');
  near('  braking burn (m/s)', -brake.pro * 1000, 877, 5);
  brake.pro *= 0.75;
  truthy('  three quarters of that burn is also caught', J.check(mission('stay'), J.fly(p)).ok);
  brake.pro *= 0.25;
  truthy('  but a fifth of it is not', !J.check(mission('stay'), J.fly(p)).ok);

  // 5. Lower and round the lunar orbit
  p = J.newPlan(mission('low'));
  p.burns[0].anchor = 'peri'; p.burns[0].pro = J.fly(p).burns[0].dvCircular;
  res = solved('low', p, 'a burn at the low point');
  near('  which is the textbook figure (m/s)', -p.burns[0].pro * 1000, mission('low').ref() * 1000, 0.5);

  // 6. Home from lunar orbit
  p = J.newPlan(mission('home')); p.burns[0].pro = 0.9;
  truthy('mission "Come home": 900 m/s from the starting place breaks free but misses', J.fly(p).finalBody === 'earth' && !J.check(mission('home'), J.fly(p)).ok);
  th = settleTheta(p, 0, (r) => J.entryMiss(r, J.AIM_ANGLE), p.burns[0].theta, Math.PI, (r) => r.duration < 4e5);
  res = solved('home', p, 'moving that burn round the orbit');
  near('  days home', res.duration / 86400, 2.95, 0.25);
  near('  entry speed (km/s)', res.entry.speed, 11.0, 0.05);
  p.burns[0].pro = 1.2;
  truthy('  the tank cannot give much more than it needs', J.fly(p).burns[0].short);
}

/* ---------- endings that cannot be relied on ---------- */
{
  const one = (moon, pro) => L.compute(plan(moon, [burn({ pro })]), V);
  let r = one(50, 3.16);
  truthy('a path that comes back to the Moon a second time is not followed further', r.status === 'unsettled' && r.legs[r.legs.length - 1].end === 'again' && r.legs.filter((l) => l.body === 'moon').length === 1);
  near('  it stops at the edge of the Moon\'s sphere of influence (km)', X.len(X.sub(L.stateAtTime(r, r.duration).r, L.moonAt(r.duration, r.moon0).r)), M.soi, 5);
  r = one(34.75, 3.2);
  truthy('a pass that throws the path beyond Earth\'s reach is an escape that rounded the Moon', r.status === 'escape' && r.rounded);
  r = one(192, 3.25);
  truthy('a burn past escape speed is an escape with speed to spare', r.status === 'escape' && !r.rounded);
  near('  its excess speed (km/s)', r.vinf, Math.sqrt((Math.sqrt(MU / (RE + 185)) + r.burns[0].got) ** 2 - 2 * MU / (RE + 185)), 1e-6);   // the stage runs dry a little short of 3,250 m/s
  r = one(205, 3.135);
  truthy('an orbit reaching the Moon\'s distance is marked as crossing its path', r.status === 'orbit' && r.caution === 'crossing');
  truthy('a low Earth orbit carries no caution', one(205, 0.5).caution === null);
  const lunar = (apo, inc) => L.compute({ start: { body: 'moon', peri: 110, apo, inc, nu: 0 }, moon: 60, fuel: [74000, 18400], burns: [] }, V);
  truthy('a low lunar orbit carries no caution', lunar(110, 180).status === 'lunar' && lunar(110, 180).caution === null);
  truthy('a lunar orbit reaching 40,000 km is barely held when it runs with the Moon\'s motion', lunar(40000, 0).caution === 'barely');
  truthy('  and only loosely held when it runs against it', lunar(40000, 180).caution === 'loose');
}

/* ---------- famous flights against their published figures ---------- */
for (const f of J.FLIGHTS) {
  const plan = J.newPlan(f), r = J.fly(plan);
  truthy(`flight "${f.name}": every step is reached with fuel to spare (${r.status})`, !r.burns.some((b) => b.unreachable || b.short || (b.drop && !b.done)));
  f.expect(r, near);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
