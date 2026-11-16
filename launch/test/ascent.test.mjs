// Run with: node launch/test/ascent.test.mjs
// Checks the climb model against textbook relations, against the published payload of the
// rocket it is built on, and checks that every mission can be solved.
import '../js/ascent.js';
import '../js/sites.js';
import '../js/missions.js';

const A = globalThis.Orbit.ascent, SITES = globalThis.Orbit.sites, { MISSIONS, KICK } = globalThis.Orbit.launchMissions;
let failed = 0;
const ok = (name, cond, detail) => { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); if (!cond) failed++; };
const near = (name, got, want, tol) => ok(name, Math.abs(got - want) <= tol, `got ${+got.toFixed(4)}, want ${want} ± ${tol}`);
const site = (id) => SITES.find((s) => s.id === id);
const go = (id, az, kick, alt) => A.best({ lat: site(id).lat, az, kick: kick ?? KICK, alt: alt ?? 200 });

/* ---------- the ground and the plane ---------- */
near('the equator moves east at 465 m/s', A.groundSpeed(0) * 1000, 465.1, 0.2);
near('at 60° the ground moves half as fast', A.groundSpeed(60) * 1000, 232.6, 0.2);
near('due east from 28.6° gives an orbit inclined 28.6°', A.inclination(28.6, 90), 28.6, 1e-9);
near('due north gives a polar orbit', A.inclination(28.6, 0), 90, 1e-9);
near('due west from 31.9° gives 148.1°, retrograde', A.inclination(31.9, 270), 148.1, 1e-9);
near('the station\'s 51.6° from Cape Canaveral needs a heading of 45°', A.headingsFor(28.6, 51.6)[0], 45.03, 0.01);
ok('no heading from Baikonur reaches 28.5°', A.headingsFor(46, 28.5) === null);
near('Baikonur\'s 51.5° corridor heads 63.5°', A.headingsFor(46, 51.5)[0], 63.6, 0.2);

/* ---------- the reference flight: due east from Cape Canaveral to 200 km ---------- */
let best = null;
for (let k = 1.5; k <= 4; k += 0.125) { const f = go('cape', 90, k); if (f.ok && (!best || f.payload > best.payload)) { best = f; best.kick = k; } }
near('payload, against the published 22,800 kg (kg)', best.payload, A.ROCKET.published, 0.05 * A.ROCKET.published);
ok('the best climb tips over by 2° to 3°', best.kick >= 2 && best.kick <= 3, `${best.kick}°`);
ok('the rocket supplies about 9 km/s', best.spent > 8.8 && best.spent < 9.3, best.spent.toFixed(3));
ok('gravity takes 1.3 to 1.8 km/s of it', best.gravity > 1.3 && best.gravity < 1.8, best.gravity.toFixed(3));
ok('air drag takes well under 0.15 km/s', best.drag > 0.01 && best.drag < 0.15, best.drag.toFixed(3));
near('the four parts add up to what was spent', best.speed - best.spin + best.gravity + best.drag, best.spent, 1e-9);
near('orbital speed at 200 km (km/s)', best.speed, Math.sqrt(A.MU / (A.RE + 200)), 0.01);
ok('the orbit is within 10 km of 200 km all the way round', Math.abs(best.insertion.peri - 200) < 10 && Math.abs(best.insertion.apo - 200) < 10, `${best.insertion.peri.toFixed(0)} x ${best.insertion.apo.toFixed(0)} km`);
ok('max Q is 20 to 40 kPa, some 10 km up', best.maxQ > 20 && best.maxQ < 40 && best.qAt > 7 && best.qAt < 16, `${best.maxQ.toFixed(1)} kPa at ${best.qAt.toFixed(1)} km`);
ok('staging comes about two and a half minutes in', best.staging.t > 140 && best.staging.t < 165, `${best.staging.t.toFixed(0)} s`);
ok('orbit is reached in 8 to 10 minutes', best.time > 480 && best.time < 600, `${(best.time / 60).toFixed(1)} min`);

/* ---------- with and against the spin ---------- */
const e = go('cape', 90), n = go('cape', 0), w = go('cape', 270);
ok('east carries more than north, and north more than west', e.payload > n.payload && n.payload > w.payload, [e, n, w].map((f) => Math.round(f.payload)).join(' > '));
near('west costs about twice the ground speed more than east (km/s)', w.spent - e.spent, 2 * A.groundSpeed(28.6), 0.06);
ok('heading north, the spin costs a little instead of helping', n.spin < 0 && n.spin > -0.03, n.spin.toFixed(4));
ok('launching west from Palmachim costs about three tenths of the payload', (() => { const r = go('palmachim', 270).payload / go('palmachim', 90).payload; return r > 0.65 && r < 0.76; })());
ok('due east: Kourou beats Cape Canaveral beats Plesetsk', go('kourou', 90).payload > e.payload && e.payload > go('plesetsk', 90).payload);

/* ---------- how steep ---------- */
ok('a near-vertical climb carries less than half the best', go('cape', 90, 0.6).payload < 0.5 * best.payload);
ok('a climb that is too shallow breaks up', (() => { const f = go('cape', 90, 6); return !f.ok && f.why === 'maxq'; })());
ok('a higher orbit carries less', go('cape', 90, KICK, 700).payload < e.payload && go('cape', 90, KICK, 1500).payload < go('cape', 90, KICK, 700).payload);
ok('a 700 km orbit is reached by an ellipse and a second burn', (() => { const f = go('cape', 90, KICK, 700); return f.circ > 0.1 && f.circ < 0.2 && Math.abs(f.insertion.apo - 700) < 15; })());

/* ---------- the path over the ground ---------- */
{
  const s = site('cape'), o = { lat: s.lat, lon: s.lon, az: 45, kick: KICK, alt: 200 }, tr = A.track(o, A.best(o), 1);
  near('it starts at the pad (latitude)', tr[0].lat, s.lat, 1e-6); near('  (longitude)', tr[0].lon, s.lon, 1e-6);
  near('the furthest north it goes is its inclination', Math.max(...tr.map((p) => p.lat)), A.inclination(s.lat, 45), 0.1);
  const lap = tr.filter((p) => p.part === 'orbit'), T = (lap[lap.length - 1].t - lap[0].t) * lap.length / (lap.length - 1);
  near('one orbit takes about 88 minutes', T / 60, 88.5, 0.5);
  const back = A.track({ ...o, az: 270 }, A.best({ ...o, az: 270 }), 1);
  near('a westward launch never goes north of the pad', Math.max(...back.map((p) => p.lat)), s.lat, 0.05);
}

/* ---------- every mission can be solved, and is not solved to begin with ---------- */
const ctx = (p) => {
  const s = site(p.site), c = { site: s, inc: A.inclination(s.lat, p.az), east: A.best({ lat: s.lat, az: 90, kick: p.kick, alt: p.alt }) };
  let b = null; for (let k = 1.5; k <= 4.001; k += 0.125) { const f = A.best({ lat: s.lat, az: p.az, kick: k, alt: p.alt }); if (f.ok && (!b || f.payload > b.payload)) b = f; }
  c.bestKick = b; return c;
};
const solved = (m, p) => m.check(p, A.best({ lat: site(p.site).lat, az: p.az, kick: p.kick, alt: p.alt }), ctx(p)).ok;
const ANSWERS = { east: { az: 90 }, equator: { site: 'kourou' }, station: { az: 45 }, north: { az: 90 }, polar: { az: 180 }, west: { az: 285 }, climb: { kick: 2.4 } };
for (const m of MISSIONS) {
  if (!m.check) continue;
  ok(`"${m.title}" does not start solved`, !solved(m, m.start));
  ok(`"${m.title}" can be solved`, solved(m, { ...m.start, ...ANSWERS[m.id] }));
}
ok('"Over the poles" does not accept the heading over land', !solved(MISSIONS.find((m) => m.id === 'polar'), { ...MISSIONS.find((m) => m.id === 'polar').start, az: 0 }));

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
