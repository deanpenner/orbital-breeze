// Run with: node test/physics.test.mjs
import '../js/physics.js';
import '../js/journey.js';
import '../js/vehicles.js';
import '../js/flights.js';

const X = globalThis.Orbit.physics, J = globalThis.Orbit.journey;
const { RE, MU } = X, D = Math.PI / 180;
let failed = 0;
function near(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${got.toFixed(4)} (expected ${want} within ${tol})`);
}
function truthy(name, v) { if (!v) failed++; console.log(`${v ? 'ok  ' : 'FAIL'} ${name}`); }
const mission = (id) => J.MISSIONS.find((m) => m.id === id);
const burn = (more) => Object.assign(J.newBurn(-Math.PI / 2), more);
function fly(id, burns, fuel) {
  const m = mission(id), plan = J.newPlan(m);
  plan.burns = burns;
  if (fuel != null) plan.fuel = [fuel];
  const res = J.compute(plan, J.VEHICLES[plan.vehicle]);
  return { m, plan, res, chk: J.check(m, res) };
}

// ---- textbook values ----
const h = X.hohmann(RE + 300, RE + 35786);
near('LEO to GEO Hohmann burn 1 (km/s)', h.dv1, 2.426, 0.005);
near('LEO to GEO Hohmann burn 2 (km/s)', h.dv2, 1.467, 0.005);
near('LEO to GEO transfer time (h)', h.time / 3600, 5.27, 0.03);
near('Circular speed at 300 km (km/s)', J.circSpeed(RE + 300), 7.726, 0.002);
near('GEO period (h)', X.fromElements({ rp: RE + 35786, ra: RE + 35786 }).period / 3600, 23.934, 0.005);
near('ISS period (min)', X.fromElements({ rp: RE + 420, ra: RE + 420 }).period / 60, 92.8, 0.2);
near('Centaur exhaust velocity (km/s)', X.exhaust(450.5), 4.418, 0.001);
near('Sun-synchronous drift at 705 km, 98.2 deg (deg/day)', X.nodeRate(X.fromElements({ rp: RE + 705, ra: RE + 705, inc: 98.2 * D })), 0.9856, 0.003);
near('ISS plane drift (deg/day)', X.nodeRate(X.fromElements({ rp: RE + 420, ra: RE + 420, inc: 51.6 * D })), -5.0, 0.1);

// ---- Kepler round trips ----
for (const [label, v] of [['ellipse', 9.5], ['hyperbola', 11.5]]) {
  const o = X.fromState([RE + 400, 0, 0], [0.4, v, 0.3]);
  for (const nu of [-2.0, -0.3, 0.7, 1.9]) {
    if (o.e > 1 && Math.abs(nu) > Math.acos(-1 / o.e) - 0.1) continue;
    near(`${label} nu -> time -> nu at ${nu}`, X.nuAtTime(o, X.timeAt(o, nu)), nu, 1e-8);
  }
  const s = X.stateAt(o, 0.9);
  near(`${label} energy conserved`, X.dot(s.v, s.v) / 2 - MU / X.len(s.r), o.energy, 1e-9);
}
const el = X.fromElements({ rp: RE + 300, ra: RE + 35786, inc: 28.5 * D, argp: 180 * D, nu: 0 });
near('elements: inclination (deg)', el.inc / D, 28.5, 1e-9);
near('elements: apoapsis sits on the equator (km)', X.stateAt(el, Math.PI).r[2], 0, 1e-6);
near('elements: place angle round trip', X.nuOfArg(el, X.argOfNu(el, 1.1)), 1.1, 1e-9);

// ---- every mission has a solution that passes its own check ----
let f = fly('geo', [burn({ pro: h.dv1 }), burn({ anchor: 'apo', pro: h.dv2 })]);
near('geo: final periapsis altitude (km)', f.res.final.rp - RE, 35786, 1);
near('geo: coast to apoapsis (h)', f.res.legs[1].dt / 3600, h.time / 3600, 1e-6);
truthy('geo: passes', f.chk.ok);
f = fly('geo', [burn({ pro: h.dv1 }), burn({ anchor: 'apo', pro: h.dv2 })], 7000);
truthy('geo, short of fuel: second burn cut short and fails', f.res.burns[1].short && !f.chk.ok && Math.abs(f.res.fuelLeft) < 1e-6);

const hs = X.hohmann(RE + 300, RE + 35786);
f = fly('stages', [burn({ pro: hs.dv1 }), { kind: 'drop' }, burn({ anchor: 'apo', pro: hs.dv2 })]);
truthy('two stages: passes with a drop', f.chk.ok && f.res.stage === 1);
near('two stages: mass after the drop (kg)', f.res.burns[2].mass0, 2225 + 1200 + 2700, 1e-6);
f = fly('stages', [burn({ pro: hs.dv1 }), burn({ anchor: 'apo', pro: hs.dv2 })]);
truthy('two stages: fails without the drop', !f.chk.ok && f.res.burns[1].short);
const ius = J.VEHICLES.ius.stages;
near('IUS first stage delta-v with a TDRS (km/s)', X.exhaust(ius[0].isp) * Math.log(16925 / (16925 - ius[0].propMax)), 2.467, 0.005);

f = fly('home', [burn({ pro: -mission('home').ref() })]);
near('deorbit: periapsis altitude (km)', f.res.final.rp - RE, 80, 0.01);
truthy('deorbit: passes', f.chk.ok && f.res.status === 'reentry');

const cr = mission('chase').ref() / 2;
f = fly('chase', [burn({ pro: -cr }), burn({ anchor: 'apo', revs: 2, pro: cr })]);
near('catch-up: miss after two laps (km)', f.chk.miss, 0, 1);
truthy('catch-up: passes', f.chk.ok);

f = fly('splash', [burn({ pro: -0.125 })]);
near('entry: angle below horizontal (deg)', f.res.entry.angle, 1.6, 0.1);
near('entry: speed at 100 km (km/s)', f.res.entry.speed, 7.9, 0.05);

f = fly('turn', [burn({ theta: 15 * D, rad: -mission('turn').ref() })]);
near('turn the ellipse: high point error (deg)', f.chk.miss, 0, 0.01);
truthy('turn the ellipse: passes', f.chk.ok);

const tilts = [1, -1].map((s) => fly('tilt', [burn({ anchor: 'an', turn: s * 23.1 })]));
truthy('tilt: a pure plane turn at the node passes', tilts.some((x) => x.chk.ok));
near('tilt: delta-v equals 2 v sin(half angle) (km/s)', tilts[0].res.dvUsed, mission('tilt').ref(), 1e-6);

const ra = RE + 35786, va = Math.sqrt(MU * (2 / ra - 2 / (ra + RE + 300))), vc = J.circSpeed(ra), tb = 28.5 * D;
const birds = [1, -1].map((s) => fly('birds', [burn({ anchor: 'apo', pro: vc - va, turn: s * 28.5 })]));
truthy('two birds: the combined burn passes', birds.some((x) => x.chk.ok));
near('two birds: combined burn (km/s)', birds[0].res.dvUsed, 1.831, 0.005);
truthy('two birds: doing the two jobs separately does not fit the tank', (vc - va) + 2 * va * Math.sin(tb / 2) > birds[0].res.dvBudget);

const h2 = X.hohmann(RE + 500, RE + 705);
const suns = [1, -1].map((s) => fly('sun', [burn({ anchor: 'an', pro: h2.dv1 }), burn({ anchor: 'apo', pro: h2.dv2, turn: s * 0.8 })]));
truthy('follow the Sun: climb plus a 0.8 degree turn passes', suns.some((x) => x.chk.ok));

// ---- burns held as fuel or engine time ----
const V = J.VEHICLES.centaur, empty = V.payload + V.stages[0].dry;
f = fly('free', [burn({ mode: 'fuel', amount: 3000, dir: [1, 0, 0] })], 9600);
near('fuel-held burn: fuel used (kg)', f.res.burns[0].fuelUsed, 3000, 1e-6);
near('fuel-held burn: delta-v (km/s)', f.res.burns[0].cmd, X.exhaust(450.5) * Math.log((empty + 9600) / (empty + 6600)), 1e-9);
truthy('fuel-held burn: heavier craft gets less delta-v', fly('free', [burn({ mode: 'fuel', amount: 3000, dir: [1, 0, 0] })], 15000).res.burns[0].cmd < f.res.burns[0].cmd);
const some = { r: [7000, 0, 300], v: [0.6, 7.2, 1.1] }, so = X.fromState(some.r, some.v);
const back = J.paramsFromDv(some, so, J.dvFromParams(some, 0.42, -0.17, 12));
near('burn description round trip: prograde', back.pro, 0.42, 1e-9);
near('burn description round trip: radial', back.rad, -0.17, 1e-9);
near('burn description round trip: plane turn', back.turn, 12, 1e-9);
near('time-held burn: fuel used (kg)', fly('free', [burn({ mode: 'time', amount: 100, dir: [1, 0, 0] })]).res.burns[0].fuelUsed, 100 * 99200 / (450.5 * X.G0), 1e-6);

// ---- escape ----
f = fly('free', [burn({ pro: 3.4 })]);
truthy('escape: status is escape', f.res.status === 'escape' && f.res.final.e > 1);
f = fly('free', [burn({ pro: 3.4 }), burn({ theta: 1.0, pro: -0.5 })]);
truthy('escape: a later burn on the way out is reachable', !f.res.burns[1].unreachable && isFinite(f.res.duration));

// ---- famous flights load and fly ----
for (const fl of J.FLIGHTS) {
  const plan = J.newPlan(fl), res = J.compute(plan, J.VEHICLES[plan.vehicle]);
  const bad = res.burns.filter((b) => b.unreachable || b.short).length;
  truthy(`flight "${fl.name}": every step is reached with fuel to spare (${res.status})`, bad === 0);
  if (fl.expect) fl.expect(res, near);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
