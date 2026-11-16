/* Orbital Breeze, Launch page: the missions. Each sets up a launch and says when it is done.
   check(s, f, ctx): s is the launch { site, az, kick, alt }, f the flight carrying the most it can,
   ctx has { site, inc, east (the same launch flown due east), bestKick (payload at the best climb) }. */
(function (G) {
  'use strict';
  const A = G.Orbit.ascent;
  const off = (a, b) => Math.abs(((a - b + 540) % 360) - 180);       // degrees between two headings
  const share = (f, ref) => (f.ok && ref && ref.ok ? Math.round(100 * f.payload / ref.payload) : 0);
  const KICK = 2.4;   // close to the best climb for the reference rocket

  const MISSIONS = [
    { id: 'east', title: 'A free push',
      goal: 'Find the heading that puts the most payload in orbit from Cape Canaveral.',
      hint: 'Drag the arrow round the compass. The ring around it shows what each heading can carry.',
      insight: 'Due east, the ground’s own speed is yours before the engines light: 408 m/s here. Launch any other way and you leave some of it behind. The orbit you get is inclined 28.6°, the latitude of the pad.',
      start: { site: 'cape', az: 0, kick: KICK, alt: 200 }, lock: ['site'],
      check: (s, f, c) => ({ ok: f.ok && off(s.az, 90) <= 3, text: f.ok ? `This heading carries ${share(f, c.east)}% of the best one.` : null }) },
    { id: 'equator', title: 'Nearer the equator',
      goal: 'Pick the site where the Earth’s spin helps most, and launch due east from it.',
      hint: 'Click a site on the map. The ground moves fastest where the Earth is widest.',
      insight: 'The equator moves east at 465 m/s. Plesetsk, at 63° north, moves at 212 m/s. That is why Europe ships its rockets to South America.',
      start: { site: 'plesetsk', az: 90, kick: KICK, alt: 200 },
      check: (s, f, c) => ({ ok: f.ok && off(s.az, 90) <= 3 && Math.abs(c.site.lat) < 8, text: `The ground at ${c.site.name} moves east at ${Math.round(A.groundSpeed(c.site.lat) * 1000)} m/s.` }) },
    { id: 'station', title: 'Up to the station',
      goal: 'The space station’s orbit is inclined 51.6°. Reach that inclination from Cape Canaveral.',
      hint: 'Turn away from east. The shaded arc on the compass is the range of headings this site really flies.',
      insight: 'Two headings reach 51.6°: north-east and south-east. Real launches take the north-east one, which stays over water. Either way some of the spin is left behind, and the payload is a little smaller.',
      start: { site: 'cape', az: 90, kick: KICK, alt: 200 }, lock: ['site'],
      check: (s, f, c) => ({ ok: f.ok && Math.abs(c.inc - 51.6) <= 0.25, text: `Inclination ${c.inc.toFixed(1)}°.` }) },
    { id: 'north', title: 'Too far north',
      goal: 'From Baikonur, get the inclination as low as you can.',
      hint: 'Try every heading. Watch the hatched part of the inclination scale.',
      insight: 'No heading gets below the latitude of the pad. An orbit’s plane passes through the centre of the Earth, so it must reach at least as far north as where it started. Going lower means a plane change in orbit, which is expensive (Earth page: Tilt the orbit).',
      start: { site: 'baikonur', az: 25.4, kick: KICK, alt: 200 }, lock: ['site'],
      check: (s, f, c) => ({ ok: f.ok && c.inc <= Math.abs(c.site.lat) + 0.2, text: `Inclination ${c.inc.toFixed(1)}°. The pad is at ${Math.abs(c.site.lat).toFixed(1)}° north.` }) },
    { id: 'polar', title: 'Over the poles',
      goal: 'Reach a polar orbit, inclined 90°, from Vandenberg, heading out over the ocean.',
      hint: 'A polar orbit passes over every part of the Earth as it turns underneath. Which way is open water?',
      insight: 'Heading south, the Earth’s spin gives nothing, and a little must be spent cancelling it. Vandenberg is used for polar orbits because south is open ocean; from Cape Canaveral the same heading crosses Cuba.',
      start: { site: 'vandenberg', az: 240, kick: KICK, alt: 200 }, lock: ['site'],
      check: (s, f, c) => ({ ok: f.ok && Math.abs(c.inc - 90) <= 0.4 && off(s.az, 180) < 90, text: `Inclination ${c.inc.toFixed(1)}°.${f.ok && Math.abs(c.inc - 90) <= 0.4 ? ' That heading is over land.' : ''}` }) },
    { id: 'west', title: 'Against the spin',
      goal: 'Israel launches over the sea so that nothing flies over its neighbours. Launch westward from Palmachim.',
      hint: 'An orbit that goes round against the Earth’s turning is called retrograde. A little north of west keeps the climb over the Mediterranean.',
      insight: 'Westward, the rocket must first cancel the ground’s speed and then build orbital speed the other way. Compared with east, that is twice the ground speed thrown away: nearly a third of the payload here.',
      start: { site: 'palmachim', az: 90, kick: KICK, alt: 200 }, lock: ['site'],
      check: (s, f, c) => ({ ok: f.ok && off(s.az, 280) <= 13, text: f.ok ? `This heading carries ${share(f, c.east)}% of what due east would.` : null }) },
    { id: 'climb', title: 'How steep?',
      goal: 'This rocket climbs almost straight up. Find the climb that carries the most payload.',
      hint: 'Move the Climb slider and watch the side view, and the gravity and drag lines.',
      insight: 'Too steep, and the engines spend minutes just holding the rocket up: gravity loss. Too shallow, and it goes fast while the air is still thick; past its limit the pressure breaks it. The best path tips over early and gently, then lets gravity bend it: a gravity turn.',
      start: { site: 'cape', az: 90, kick: 0.6, alt: 200 }, lock: ['site'],
      check: (s, f, c) => ({ ok: f.ok && c.bestKick && f.payload >= 0.985 * c.bestKick.payload, text: f.ok && c.bestKick ? `This climb carries ${share(f, c.bestKick)}% of the best one.` : null }), needs: 'bestKick' },
    { id: 'free', title: 'Free launch',
      goal: 'No target. Any site, any heading, any orbit up to 2,000 km.',
      hint: 'Click a site on the map, then turn the compass.',
      start: { site: 'cape', az: 90, kick: KICK, alt: 200 } },
  ];
  G.Orbit.launchMissions = { MISSIONS, KICK, off };
})(typeof window !== 'undefined' ? window : globalThis);
