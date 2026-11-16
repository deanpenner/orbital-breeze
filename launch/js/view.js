/* Orbital Breeze, Launch page: drawing. Three pictures: the world map with the path over the
   ground, the compass dial, and the side view of the climb. No physics and no page state here;
   app.js hands over what to draw. */
(function (G) {
  'use strict';
  const A = G.Orbit.ascent, LAND = G.Orbit.land;
  const D = Math.PI / 180, TAU = Math.PI * 2;
  const LAT = 84;                                   // the map runs from 84° south to 84° north
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function create(sky, dial, profile) {
    const ctx = sky.getContext('2d'), dc = dial.getContext('2d'), pc = profile.getContext('2d');
    const css = getComputedStyle(document.documentElement), C = {};
    for (const k of ['paper', 'panel', 'ink', 'ink2', 'ink3', 'line', 'burn', 'burn-ink', 'target', 'target-ink', 'alert', 'earth', 'ground', 'coast'])
      C[k] = css.getPropertyValue('--' + k).trim();
    const FONT = css.getPropertyValue('--font').trim();
    let dpr = 1, W = 0, H = 0;
    const map = { x: 0, y: 0, w: 10, h: 10 };
    let landLayer = null;

    const font = (c, size, weight) => { c.font = `${weight || 500} ${size}px ${FONT}`; };
    function text(c, str, x, y, o) {
      o = o || {};
      font(c, o.size || 12, o.weight);
      c.textAlign = o.align || 'left'; c.textBaseline = o.base || 'middle';
      if (o.halo) { c.lineWidth = 4; c.lineJoin = 'round'; c.strokeStyle = o.halo; c.strokeText(str, x, y); }
      c.fillStyle = o.color || C.ink; c.fillText(str, x, y);
    }

    /* ---------- the map ---------- */
    const px = (lon, lat) => [map.x + (lon + 180) / 360 * map.w, map.y + (LAT - lat) / (2 * LAT) * map.h];

    /* Fit the map into the space right of the mission text, above the dock. */
    function resize(left, top, bottom) {
      dpr = Math.min(2, G.devicePixelRatio || 1); W = G.innerWidth; H = G.innerHeight;
      sky.width = Math.round(W * dpr); sky.height = Math.round(H * dpr);
      const x0 = Math.min(left, W * 0.34), availW = W - x0 - 22, availH = H - top - bottom - 14, aspect = 360 / (2 * LAT);
      map.w = Math.max(200, Math.min(availW, availH * aspect)); map.h = map.w / aspect;
      map.x = x0 + (availW - map.w) / 2; map.y = top + Math.max(0, (availH - map.h) / 2);
      // The land never changes, so it is drawn once and kept.
      landLayer = document.createElement('canvas');
      landLayer.width = Math.round(map.w * dpr); landLayer.height = Math.round(map.h * dpr);
      const c = landLayer.getContext('2d');
      c.scale(dpr, dpr); c.translate(-map.x, -map.y);
      c.fillStyle = C.ground; c.strokeStyle = C.coast; c.lineWidth = 1; c.lineJoin = 'round';
      for (const poly of LAND) {
        c.beginPath();
        for (let i = 0; i < poly.length; i += 2) { const p = px(poly[i], clamp(poly[i + 1], -LAT, LAT)); if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }
        c.closePath(); c.fill(); c.stroke();
      }
      for (const [c2, size] of [[dial, 180], [profile, null]]) {
        const w = size || c2.clientWidth || 300, h = size || c2.clientHeight || 118;
        c2.width = Math.round(w * dpr); c2.height = Math.round(h * dpr);
      }
    }

    function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

    /* A path over the ground, broken where it runs off one side of the map and back on the other. */
    function trackPath(pts) {
      ctx.beginPath(); let prev = null;
      for (const p of pts) {
        const s = px(p.lon, p.lat);
        if (!prev || Math.abs(p.lon - prev.lon) > 180) {
          if (prev) {   // carry the line to the edge on both sides
            const dir = p.lon < prev.lon ? 1 : -1, span = (p.lon + 360 * dir) - prev.lon, k = span ? ((dir > 0 ? 180 : -180) - prev.lon) / span : 0, lat = prev.lat + (p.lat - prev.lat) * k;
            const e1 = px(dir > 0 ? 180 : -180, lat), e2 = px(dir > 0 ? -180 : 180, lat);
            ctx.lineTo(e1[0], e1[1]); ctx.moveTo(e2[0], e2[1]); ctx.lineTo(s[0], s[1]);
          } else ctx.moveTo(s[0], s[1]);
        } else ctx.lineTo(s[0], s[1]);
        prev = p;
      }
    }
    function chevron(c, at, dir, k, color) {
      const n = [-dir[1], dir[0]];
      c.beginPath(); c.moveTo(at[0] - dir[0] * k + n[0] * k * 0.8, at[1] - dir[1] * k + n[1] * k * 0.8); c.lineTo(at[0] + dir[0] * k * 0.5, at[1] + dir[1] * k * 0.5); c.lineTo(at[0] - dir[0] * k - n[0] * k * 0.8, at[1] - dir[1] * k - n[1] * k * 0.8);
      c.lineWidth = 2.2; c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = color; c.stroke(); c.lineCap = 'butt';
    }

    /* st: { sites, site, hover, track, flight, inc, craft:{lat,lon}|null, locked, fmt } */
    function drawMap(st) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // the sheet
      roundRect(ctx, map.x, map.y, map.w, map.h, 14); ctx.fillStyle = C.panel; ctx.fill();
      ctx.save(); roundRect(ctx, map.x, map.y, map.w, map.h, 14); ctx.clip();
      ctx.drawImage(landLayer, map.x, map.y, map.w, map.h);
      // lines of latitude and longitude, very faint
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
      for (let lon = -150; lon <= 150; lon += 30) { const a = px(lon, LAT), b = px(lon, -LAT); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      for (let lat = -60; lat <= 60; lat += 30) { if (!lat) continue; const a = px(-180, lat), b = px(180, lat); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      ctx.globalAlpha = 1;
      const eq = px(-180, 0); ctx.strokeStyle = C.ink3; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(map.x, eq[1]); ctx.lineTo(map.x + map.w, eq[1]); ctx.stroke();
      text(ctx, 'Equator', map.x + 10, eq[1] - 9, { size: 11.5, color: C.ink2, halo: C.panel });
      text(ctx, 'The Earth turns this way', map.x + map.w - 34, eq[1] - 9, { size: 11.5, color: C.ink2, align: 'right', halo: C.panel });
      ctx.strokeStyle = C.ink2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(map.x + map.w - 28, eq[1] - 9); ctx.lineTo(map.x + map.w - 12, eq[1] - 9); ctx.stroke();
      chevron(ctx, [map.x + map.w - 11, eq[1] - 9], [1, 0], 4, C.ink2);

      // how far north and south the orbit reaches: its inclination, seen on the map
      if (st.flight.ok) {
        const top = st.inc <= 90 ? st.inc : 180 - st.inc;
        ctx.setLineDash([5, 5]); ctx.strokeStyle = C['target']; ctx.lineWidth = 1.3;
        for (const lat of [top, -top]) {
          if (Math.abs(lat) > LAT - 1 || Math.abs(lat) < 1) continue;
          const y = px(0, lat)[1]; ctx.beginPath(); ctx.moveTo(map.x, y); ctx.lineTo(map.x + map.w, y); ctx.stroke();
        }
        ctx.setLineDash([]);
        // a tag on each line, at the top and bottom of the path, kept off the chosen site's name
        const tag = (lat, word) => {
          if (Math.abs(lat) > LAT - 1 || Math.abs(lat) < 1) return;
          const peak = st.track.reduce((a, b) => (b.part === 'orbit' && (lat > 0 ? b.lat > a.lat : b.lat < a.lat) ? b : a), { lat: lat > 0 ? -99 : 99, lon: 0 });
          const here = px(st.site.lon, st.site.lat); let x = px(peak.lon, 0)[0]; const y = px(0, lat)[1];
          if (Math.abs(y - here[1]) < 16 && Math.abs(x - here[0]) < 150) x = here[0] + (st.site.side === 'right' ? -110 : 110);
          x = clamp(x, map.x + 48, map.x + map.w - 48);
          font(ctx, 11.5, 650); const w = ctx.measureText(word).width + 14;
          roundRect(ctx, x - w / 2, y - 9, w, 18, 9); ctx.fillStyle = C.panel; ctx.fill(); ctx.strokeStyle = C.target; ctx.lineWidth = 1.2; ctx.stroke();
          text(ctx, word, x, y + 0.5, { size: 11.5, weight: 650, align: 'center', color: C['target-ink'] });
        };
        tag(top, `${top.toFixed(1)}° N`); tag(-top, `${top.toFixed(1)}° S`);
        text(ctx, 'Dashed lines: as far north and south as this orbit reaches', map.x + 12, map.y + map.h - 12, { size: 11.5, color: C['target-ink'], halo: C.panel });
      }

      // the path over the ground: the first orbit thin, the climb thick
      const climb = st.track.filter((p) => p.part === 'climb'), orbit = st.track.filter((p) => p.part === 'orbit');
      if (orbit.length) {
        trackPath([climb[climb.length - 1]].concat(orbit)); ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.45; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke(); ctx.globalAlpha = 1;
        for (const k of [0.3, 0.62]) {   // which way it goes
          const i = Math.floor(orbit.length * k), a = orbit[i], b = orbit[i + 1];
          if (!b || Math.abs(b.lon - a.lon) > 180) continue;
          const pa = px(a.lon, a.lat), pb = px(b.lon, b.lat), len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1;
          ctx.globalAlpha = 0.6; chevron(ctx, pa, [(pb[0] - pa[0]) / len, (pb[1] - pa[1]) / len], 5, C.ink); ctx.globalAlpha = 1;
        }
      }
      trackPath(climb); ctx.strokeStyle = st.flight.ok ? C.ink : C.alert; ctx.lineWidth = 3.4; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
      ctx.restore();
      roundRect(ctx, map.x, map.y, map.w, map.h, 14); ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.stroke();

      // launch sites
      for (const s of st.sites) {
        const p = px(s.lon, s.lat), on = s === st.site, hot = s === st.hover && !st.locked;
        if (on) continue;
        ctx.beginPath(); ctx.arc(p[0], p[1], hot ? 5.5 : 4, 0, TAU); ctx.fillStyle = C.panel; ctx.fill();
        ctx.lineWidth = hot ? 2.4 : 1.8; ctx.strokeStyle = st.locked ? C.ink3 : hot ? C.ink : C.ink2; ctx.stroke();
        const right = s.side === 'right';
        text(ctx, s.name, p[0] + (right ? 8 : -8), p[1] + 1, { size: 11.5, align: right ? 'left' : 'right', color: st.locked ? C.ink3 : hot ? C.ink : C.ink2, weight: hot ? 650 : 500, halo: C.panel });
      }
      const s = st.site, p = px(s.lon, s.lat);
      ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, TAU); ctx.fillStyle = C.burn; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = C.panel; ctx.stroke();
      ctx.beginPath(); ctx.arc(p[0], p[1], 8.4, 0, TAU); ctx.lineWidth = 1.4; ctx.strokeStyle = C['burn-ink']; ctx.stroke();
      text(ctx, s.name, p[0] + (s.side === 'right' ? 13 : -13), p[1] + 1, { size: 13, weight: 700, align: s.side === 'right' ? 'left' : 'right', halo: C.panel });

      // the craft
      if (st.craft) {
        const q = px(st.craft.lon, st.craft.lat);
        if (q[1] > map.y + 3 && q[1] < map.y + map.h - 3) {
          ctx.beginPath(); ctx.arc(q[0], q[1], 5.5, 0, TAU); ctx.fillStyle = C.ink; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = C.panel; ctx.stroke();
        }
      }
    }
    /* The site under a point on the page, if any. */
    function siteAt(sites, x, y) {
      let best = null, bd = 16;
      for (const s of sites) { const p = px(s.lon, s.lat), d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = s; } }
      return best;
    }

    /* ---------- the compass ---------- */
    const DIAL = { c: 90, r: 44 };
    /* st: { az, sectors:[[a,b]], marks:[az], rose:(az) => share of the rocket's best payload }
       The ring's width runs from half the best payload at its inner edge to all of it at the outer:
       drawn from zero the difference between east and west would be hard to see. The true
       figures are written beside the dial. */
    function drawDial(st) {
      const c = dc, { c: o, r } = DIAL;
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, 180, 180);
      const at = (az, rad) => [o + rad * Math.sin(az * D), o - rad * Math.cos(az * D)];
      // what each heading can carry: thick toward the east, thin toward the west
      c.beginPath();
      for (let az = 0; az <= 360; az += 4) { const p = at(az, r + 5 + 38 * clamp((st.rose(az) - 0.5) / 0.5, 0.04, 1.03)); if (az) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }
      c.closePath(); c.moveTo(o + r + 5, o); c.arc(o, o, r + 5, 0, TAU, true);
      c.fillStyle = C.burn; c.globalAlpha = 0.36; c.fill('evenodd'); c.globalAlpha = 1;
      // the face
      c.beginPath(); c.arc(o, o, r, 0, TAU); c.fillStyle = C.paper; c.fill(); c.lineWidth = 1.5; c.strokeStyle = C.line; c.stroke();
      for (let az = 0; az < 360; az += 30) { const a = at(az, r - (az % 90 ? 5 : 0)), b = at(az, r); if (az % 90) { c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.strokeStyle = C.ink3; c.lineWidth = 1.2; c.stroke(); } }
      for (const [az, l] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) { const p = at(az, r - 11); text(c, l, p[0], p[1] + 0.5, { size: 12, weight: 700, align: 'center', color: C.ink2 }); }
      // the headings this site really flies
      c.lineCap = 'round'; c.strokeStyle = C.target; c.lineWidth = 5;
      for (const [a, b] of st.sectors) { c.beginPath(); c.arc(o, o, r, (a - 90) * D, (b - 90) * D); c.stroke(); }
      for (const az of st.marks) { const a = at(az, r - 4), b = at(az, r + 4); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
      c.lineCap = 'butt';
      // the arrow
      const tip = at(st.az, r), neck = at(st.az, r - 9);
      c.beginPath(); c.moveTo(o, o); c.lineTo(neck[0], neck[1]); c.strokeStyle = C.ink; c.lineWidth = 3; c.lineCap = 'round'; c.stroke(); c.lineCap = 'butt';
      c.beginPath(); c.arc(o, o, 3.5, 0, TAU); c.fillStyle = C.ink; c.fill();
      c.beginPath(); c.arc(tip[0], tip[1], 8.5, 0, TAU); c.fillStyle = C.burn; c.fill(); c.lineWidth = 2.5; c.strokeStyle = C.panel; c.stroke();
      c.beginPath(); c.arc(tip[0], tip[1], 9.8, 0, TAU); c.lineWidth = 1.4; c.strokeStyle = C['burn-ink']; c.stroke();
    }
    /* The heading a point on the dial stands for (page coordinates). */
    function dialHeading(x, y) {
      const b = dial.getBoundingClientRect(), dx = x - (b.left + b.width / 2), dy = y - (b.top + b.height / 2);
      return (Math.atan2(dx, -dy) / D + 360) % 360;
    }

    /* ---------- the climb, from the side, drawn to true scale ---------- */
    /* st: { flight, alt, t (seconds into the flight, or null), fmt } */
    function drawProfile(st) {
      const c = pc, w = profile.width / dpr, h = profile.height / dpr, f = st.flight;
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      const L = 6, R = 6, T = 8, B = 15, pw = w - L - R, ph = h - T - B;
      const until = f.cutoff ? f.cutoff.t : f.end.t, pts = f.path.filter((p) => p.t <= until + 1);
      const top = Math.max(120, Math.min(st.alt, A.PARK) * 1.15, ...pts.filter((p) => p.x < 900).map((p) => p.h * 1.08));
      const yMax = Math.min(top, 420), xMax = yMax * pw / ph;          // the same scale both ways
      const X = (x) => L + x / xMax * pw, Y = (y) => T + ph - y / yMax * ph;
      // the air, thinning with height
      const g = c.createLinearGradient(0, Y(0), 0, Y(90));
      g.addColorStop(0, 'rgba(59,127,196,0.30)'); g.addColorStop(0.25, 'rgba(59,127,196,0.12)'); g.addColorStop(1, 'rgba(59,127,196,0)');
      c.fillStyle = g; c.fillRect(L, Y(90), pw, Y(0) - Y(90));
      c.strokeStyle = C.ink3; c.lineWidth = 1.5; c.beginPath(); c.moveTo(L, Y(0)); c.lineTo(L + pw, Y(0)); c.stroke();
      c.setLineDash([3, 4]); c.lineWidth = 1; c.beginPath(); c.moveTo(L, Y(100)); c.lineTo(L + pw, Y(100)); c.stroke(); c.setLineDash([]);
      text(c, `${st.fmt.dist(100)}: space begins`, L + pw, Y(100) - 7, { size: 10.5, color: C.ink2, align: 'right' });
      text(c, `${st.fmt.dist(Math.round(xMax / 10) * 10)} across, to scale`, L + pw, h - 6, { size: 10.5, color: C.ink2, align: 'right' });
      text(c, 'pad', L, h - 6, { size: 10.5, color: C.ink2 });
      c.save(); c.beginPath(); c.rect(L, 0, pw, T + ph + 1); c.clip();
      // the path, first stage thick
      for (const stage of [1, 0]) {
        c.beginPath(); let on = false;
        for (const p of pts) { if (p.stage < stage) continue; if (stage === 0 && p.stage !== 0 && on) { c.lineTo(X(p.x), Y(p.h)); break; } if (on) c.lineTo(X(p.x), Y(p.h)); else { c.moveTo(X(p.x), Y(p.h)); on = true; } }
        c.strokeStyle = f.ok ? C.ink : C.alert; c.lineWidth = stage ? 2 : 3.6; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); c.lineCap = 'butt';
      }
      const dot = (x, y, label, dx, dy) => {
        if (x > xMax) return;
        c.beginPath(); c.arc(X(x), Y(y), 3.6, 0, TAU); c.fillStyle = C.panel; c.fill(); c.lineWidth = 1.8; c.strokeStyle = C.ink; c.stroke();
        text(c, label, X(x) + dx, Y(y) + dy, { size: 10.5, color: C.ink, weight: 600, halo: C.panel });
      };
      if (f.maxQ > 1) dot(f.qX, f.qAt, 'max Q', 8, 1);
      if (f.staging) dot(f.staging.x, f.staging.h, 'staging', 7, 9);
      if (!f.ok && f.end.x < xMax) { const x = X(f.end.x), y = Y(Math.max(0, f.end.h)); c.strokeStyle = C.alert; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x - 5, y - 5); c.lineTo(x + 5, y + 5); c.moveTo(x + 5, y - 5); c.lineTo(x - 5, y + 5); c.stroke(); }
      if (st.t != null && st.t <= until) {
        let i = 0; while (i < pts.length - 2 && pts[i + 1].t < st.t) i++;
        const a = pts[i], b = pts[i + 1] || a, k = b.t > a.t ? clamp((st.t - a.t) / (b.t - a.t), 0, 1) : 0, x = a.x + (b.x - a.x) * k, y = a.h + (b.h - a.h) * k;
        if (x < xMax) { c.beginPath(); c.arc(X(x), Y(y), 4.5, 0, TAU); c.fillStyle = C.ink; c.fill(); c.lineWidth = 2; c.strokeStyle = C.panel; c.stroke(); }
      }
      c.restore();
    }

    return { resize, drawMap, drawDial, drawProfile, siteAt, dialHeading, map };
  }
  G.Orbit.launchView = { create };
})(window);
