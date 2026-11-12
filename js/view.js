/* Canvas drawing. Everything is true to scale. The camera looks straight down on the
   equator by default and can tilt for orbits that leave the equatorial plane. */
(function (G) {
  'use strict';
  const X = G.Orbit.physics, J = G.Orbit.journey;
  const { RE, ATM, SOI, TAU } = X;

  /* Burn arrows. Length is not plain delta-v: the arrow stretches wherever a small
     change in speed makes a big change in the orbit, so one pixel of pull always
     moves the far side of the orbit by about the same small amount. */
  const D0 = 26, ARROW = 40, DV_KNEE = 0.15;
  const FINE = 0.009;       // far side moves at most ~0.9% of the orbit's width per pixel
  const G_FLOOR = 0.004;    // km/s per pixel, finest the pull ever gets
  const FAR = 110000;       // km; past this the far side is off the page, so stay coarse
  const STEP = 0.005, STEPS = 1400;
  function arrowMap(rb, u) {
    const key = u.map((x) => x.toFixed(4)).join();
    rb.maps = rb.maps || {};
    if (rb.maps[key]) return rb.maps[key];
    const r = X.len(rb.r), px = new Float64Array(STEPS + 1);
    for (let i = 0; i < STEPS; i++) {
      const dv = (i + 0.5) * STEP, v2 = X.add(rb.v, X.scale(u, dv));
      let g = Math.sqrt(dv * dv + DV_KNEE * DV_KNEE) / ARROW;
      const inv = 2 / r - X.dot(v2, v2) / X.MU, along = Math.abs(X.dot(v2, u));
      if (inv > 0 && 2 / inv - r < RE + FAR && along > 1e-6) g = Math.min(g, FINE * X.MU * inv / (2 * along));
      px[i + 1] = px[i] + STEP / Math.max(g, G_FLOOR);
    }
    const toPx = (dv) => {
      const x = Math.min(Math.abs(dv) / STEP, STEPS - 1e-9), i = Math.floor(x);
      return px[i] + (px[i + 1] - px[i]) * (x - i);
    };
    const toDv = (len) => {
      if (len <= 0) return 0;
      if (len >= px[STEPS]) return STEPS * STEP;
      let lo = 0, hi = STEPS;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (px[mid] <= len) lo = mid; else hi = mid; }
      return (lo + (len - px[lo]) / (px[hi] - px[lo])) * STEP;
    };
    return (rb.maps[key] = { toPx, toDv });
  }

  const LANDMARKS = [
    { alt: 420, name: 'Space station' },
    { alt: 2000, name: 'Top of low Earth orbit' },
    { alt: 20200, name: 'GPS' },
    { alt: 35786, name: 'Geostationary' },
    { alt: 384400 - RE, name: 'Moon' },
  ];
  // Abstract continents: latitude, longitude, angular size (degrees) and stretch.
  const LAND = [[38, 15, 17, 1.5], [52, 115, 15, 1.9], [22, 230, 16, 1.2], [58, 300, 11, 1.6], [-18, 60, 15, 1.3], [-32, 280, 13, 1.1], [-70, 170, 16, 2.2]];
  const MAX_VIEW = 100000;   // km, widest the automatic fit will go unless a flight asks for more
  const D = Math.PI / 180;

  function create(canvas, fmt) {
    const ctx = canvas.getContext('2d');
    const css = getComputedStyle(document.documentElement), C = {};
    for (const k of ['paper', 'ink', 'ink2', 'ink3', 'line', 'burn', 'burn-ink', 'target', 'target-ink', 'alert', 'earth', 'earth-lit', 'land', 'halo', 'on-burn'])
      C[k] = css.getPropertyValue('--' + k).trim();
    const FONT = css.getPropertyValue('--font').trim();

    // `base` is the automatic fit. The player's own zoom, pan and tilt sit on top of it.
    const cam = { cx: 0, cy: 0, scale: 0, base: 0, goal: 0, zoom: 1, panX: 0, panY: 0, hx: 0, hy: 0, w: 0, h: 0, top: 0, bottom: 0, tilt: 0, yaw: 0, tiltGoal: 0, yawGoal: 0 };
    let ct = 1, stl = 0, cy = 1, sy = 0;
    function place() {
      cam.scale = cam.base * cam.zoom; cam.cx = cam.hx + cam.panX; cam.cy = cam.hy + cam.panY;
      ct = Math.cos(cam.tilt); stl = Math.sin(cam.tilt); cy = Math.cos(cam.yaw); sy = Math.sin(cam.yaw);
    }
    function zoomAt(m, factor) {
      const z = Math.min(60, Math.max(0.35, cam.zoom * factor)), k = z / cam.zoom;
      cam.panX = m[0] - cam.hx - (m[0] - cam.cx) * k; cam.panY = m[1] - cam.hy - (m[1] - cam.cy) * k;
      cam.zoom = z; place();
    }
    function panBy(dx, dy) { cam.panX += dx; cam.panY += dy; place(); }
    function resetZoom() { cam.zoom = 1; cam.panX = cam.panY = 0; place(); }
    const isHome = () => Math.abs(cam.zoom - 1) < 1e-3 && Math.abs(cam.panX) + Math.abs(cam.panY) < 1;
    const middle = () => [cam.hx, cam.hy];
    function setView(v, instant) {
      cam.tiltGoal = (v && v.tilt || 0) * D; cam.yawGoal = (v && v.yaw || 0) * D;
      if (instant) { cam.tilt = cam.tiltGoal; cam.yaw = cam.yawGoal; place(); }
    }
    /* Turning the view: the side of the scene nearest you follows the pointer, like turning a globe. */
    function rotateBy(dx, dy) {
      cam.yawGoal = cam.yaw = X.wrapPi(cam.yaw + dx * 0.006);
      cam.tiltGoal = cam.tilt = X.clamp(cam.tilt - dy * 0.006, 0, 88 * D);
      place();
    }
    const is3D = () => cam.tiltGoal > 0.02;

    function resize(top, bottom) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cam.w = canvas.clientWidth; cam.h = canvas.clientHeight; cam.top = top; cam.bottom = bottom;
      canvas.width = Math.round(cam.w * dpr); canvas.height = Math.round(cam.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cam.hx = cam.w / 2; cam.hy = top + (cam.h - top - bottom) / 2; place();
    }

    /* World to screen. `flat` is the direction-only version (no origin, no scale);
       `depth` is positive toward the viewer. */
    const flat = (p) => { const y1 = p[0] * sy + p[1] * cy; return [p[0] * cy - p[1] * sy, -(y1 * ct + p[2] * stl)]; };
    const depth = (p) => p[2] * ct - (p[0] * sy + p[1] * cy) * stl;
    const toScreen = (p) => { const f = flat(p); return [cam.cx + f[0] * cam.scale, cam.cy + f[1] * cam.scale]; };
    const hidden = (p) => { if (depth(p) >= 0) return false; const f = flat(p); return f[0] * f[0] + f[1] * f[1] < RE * RE; };
    const dirScreen = (d) => { const f = flat(d), l = Math.hypot(f[0], f[1]) || 1; return [f[0] / l, f[1] / l]; };
    const viewRadius = () => Math.min(cam.w, cam.h - cam.top - cam.bottom) / 2 / cam.scale;

    /* Screen offset (pixels) to the vector a*e1 + b*e2 that projects onto it, or null if the
       plane of e1 and e2 is seen edge-on. */
    function planeVector(off, e1, e2) {
      const s1 = flat(e1), s2 = flat(e2), det = s1[0] * s2[1] - s1[1] * s2[0];
      if (Math.abs(det) < 0.06) return null;
      const x = off[0] / cam.scale, y = off[1] / cam.scale;
      return X.add(X.scale(e1, (x * s2[1] - y * s2[0]) / det), X.scale(e2, (y * s1[0] - x * s1[1]) / det));
    }
    /* The point in an orbit's plane that sits under a screen position. */
    const planePoint = (m, o) => planeVector([m[0] - cam.cx, m[1] - cam.cy], o.R, o.S);

    /* Choose a zoom that shows the whole journey and the target. */
    function fit(res, mission, instant, cap) {
      cap = cap || MAX_VIEW;
      let need = (RE + 300) * 1.9;
      const reach = (o) => (o.e < 1 && o.ra < SOI ? o.ra : 48000);   // open paths simply run off the page
      need = Math.max(need, res.start.ra);
      for (const l of res.legs) need = Math.max(need, Math.min(reach(l.orbit), cap));
      const tg = mission.target;
      if (tg) need = Math.max(need, RE + Math.max(tg.apo ? tg.apo[1] : 0, tg.peri ? tg.peri[1] : 0));
      const half = Math.min(cam.w, cam.h - cam.top - cam.bottom) / 2;
      cam.goal = half / (Math.min(need, cap) * 1.16);
      if (instant || !cam.base) cam.base = cam.goal;
      place();
    }

    function ease(frozen) {
      cam.tilt += (cam.tiltGoal - cam.tilt) * 0.14; cam.yaw += X.wrapPi(cam.yawGoal - cam.yaw) * 0.14;   // always turn home the short way
      if (!frozen) {
        cam.base += (cam.goal - cam.base) * 0.12;
        if (Math.abs(cam.goal - cam.base) < cam.goal * 1e-4) cam.base = cam.goal;
      }
      place();
    }

    /* Path through 3D points, lifting the pen wherever Earth is in the way. */
    function trace(pts) {
      ctx.beginPath();
      let pen = false;
      for (const p of pts) {
        if (hidden(p)) { pen = false; continue; }
        const s = toScreen(p);
        if (pen) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]);
        pen = true;
      }
    }
    const arc = (o, nu0, sweep) => trace(X.arcPoints(o, nu0, sweep, Math.max(12, Math.ceil(sweep / TAU * 240))));

    /* Circles in the equatorial plane are drawn in two halves, so the far half can go behind Earth. */
    const halfSpan = (far) => (cam.tilt < 1e-3 ? (far ? null : [0, TAU]) : far ? [-cam.yaw, Math.PI - cam.yaw] : [Math.PI - cam.yaw, TAU - cam.yaw]);
    const eq = (r, a) => [r * Math.cos(a), r * Math.sin(a), 0];
    function ringHalf(r, far) {
      const span = halfSpan(far);
      ctx.beginPath();
      if (!span) return;
      for (let i = 0; i <= 90; i++) { const s = toScreen(eq(r, span[0] + (span[1] - span[0]) * i / 90)); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }
    }
    function bandHalf(r0, r1, far) {
      const span = halfSpan(far);
      ctx.beginPath();
      if (!span) return;
      for (let i = 0; i <= 90; i++) { const s = toScreen(eq(r1, span[0] + (span[1] - span[0]) * i / 90)); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }
      for (let i = 90; i >= 0; i--) { const s = toScreen(eq(r0, span[0] + (span[1] - span[0]) * i / 90)); ctx.lineTo(s[0], s[1]); }
      ctx.closePath();
    }

    function text(str, x, y, o) {
      o = o || {};
      ctx.font = `${o.weight || 500} ${o.size || 13}px ${FONT}`;
      ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = C.paper;
      ctx.strokeText(str, x, y);
      ctx.fillStyle = o.color || C.ink; ctx.fillText(str, x, y);
    }

    /* Two-line label pushed outward from a point on an orbit. */
    function apsisLabel(p, title, sub, color) {
      if (hidden(p)) return;
      const s = toScreen(p), a = Math.atan2(cam.cy - s[1], s[0] - cam.cx);
      const c = Math.cos(a), sn = Math.sin(a);
      const align = c > 0.35 ? 'left' : c < -0.35 ? 'right' : 'center';
      const x = s[0] + c * 14, y = s[1] - sn * 14 - (Math.abs(c) <= 0.35 ? sn * 14 : 0);
      ctx.beginPath(); ctx.arc(s[0], s[1], 4, 0, TAU);
      ctx.fillStyle = C.paper; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = color || C.ink; ctx.stroke();
      text(title, x, y - 8, { align, weight: 650, color: color || C.ink });
      text(sub, x, y + 8, { align, size: 12, color: C.ink2 });
    }

    function drawLandmarks(tg, far) {
      const inBand = (alt, r) => r && alt >= r[0] && alt <= r[1];
      const earthPx = RE * cam.scale, edge = Math.min(cam.w, cam.h - cam.top - cam.bottom) / 2 * 1.02;
      let last = earthPx + 12;
      ctx.lineCap = 'round';
      for (const m of LANDMARKS) {
        const px = (RE + m.alt) * cam.scale;
        // Show the rings that belong to the fitted view; zooming out brings in the ones beyond.
        if (px < last + 26 || (RE + m.alt) * Math.min(cam.base, cam.scale) > edge || (tg && !tg.hideBand && (inBand(m.alt, tg.apo) || inBand(m.alt, tg.peri)))) continue;
        last = px;
        ctx.setLineDash([1.5, 5]);
        ringHalf(RE + m.alt, far); ctx.strokeStyle = C.ink3; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.setLineDash([]);
        if (!far) {
          const s = toScreen(eq(RE + m.alt, (cam.tilt > 1e-3 ? 3.75 : 2.72) - cam.yaw));
          text(`${m.name}  ${fmt.dist(m.alt)}`, s[0], s[1], { align: 'center', size: 12, color: C.ink3 });
        }
      }
      ctx.setLineDash([]); ctx.lineCap = 'butt';
    }

    function band(range, hit, label, far) {
      const r0 = RE + Math.max(0, range[0]), r1 = RE + range[1];
      bandHalf(r0, r1, far);
      ctx.globalAlpha = hit ? 0.34 : 0.15; ctx.fillStyle = C.target; ctx.fill();
      ctx.globalAlpha = hit ? 0.9 : 0.45; ctx.lineWidth = 1; ctx.strokeStyle = C.target;
      ringHalf(r1, far); ctx.stroke();
      if (range[0] > 0) { ringHalf(r0, far); ctx.stroke(); }
      ctx.globalAlpha = 1;
      if (far) return;
      const a = (cam.tilt > 1e-3 ? -0.62 : 0.62) - cam.yaw, s = toScreen(eq(r1, a)), out = dirScreen(eq(1, a));
      text(label, s[0] + out[0] * 12, s[1] + out[1] * 12, { size: 12.5, weight: 600, color: C['target-ink'], align: out[0] < -0.3 ? 'right' : 'left' });
    }

    function drawTarget(mission, chk, far) {
      const tg = mission.target;
      if (!tg || tg.hideBand) return;
      const same = tg.apo && tg.peri && tg.apo[0] === tg.peri[0] && tg.apo[1] === tg.peri[1];
      if (same) band(tg.apo, chk.ok, 'Target', far);
      else {
        if (tg.apo) band(tg.apo, chk.apoOk, 'Apoapsis here', far);
        if (tg.peri) band(tg.peri, chk.periOk && (!tg.reentry || chk.ok), tg.reentry ? `Below ${fmt.dist(tg.peri[1])}` : 'Periapsis here', far);
      }
    }

    function drawEarth(simT) {
      const R = RE * cam.scale, x = cam.cx, y = cam.cy;
      ctx.beginPath(); ctx.arc(x, y, (RE + ATM) * cam.scale, 0, TAU);
      ctx.globalAlpha = 0.2; ctx.fillStyle = C.earth; ctx.fill(); ctx.globalAlpha = 1;
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fillStyle = C.earth; ctx.fill(); ctx.clip();
      ctx.beginPath(); ctx.arc(x - R * 0.16, y - R * 0.16, R * 0.94, 0, TAU); ctx.fillStyle = C['earth-lit']; ctx.fill();
      // A few abstract continents that turn with the planet, so you can see a day pass.
      const spin = X.SPIN * simT;
      ctx.fillStyle = C.land;
      for (const [lat, lon, size, stretch] of LAND) {
        const la = lat * D, lo = lon * D + spin, c = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
        if (depth(c) < -0.25) continue;
        const east = [-Math.sin(lo), Math.cos(lo), 0], north = X.cross(c, east), rho = size * D;
        ctx.beginPath();
        for (let i = 0; i < 28; i++) {
          const a = i / 28 * TAU;
          const p = X.unit(X.add(X.scale(c, Math.cos(rho)), X.add(X.scale(east, Math.sin(rho) * Math.cos(a) * stretch), X.scale(north, Math.sin(rho) * Math.sin(a)))));
          const s = toScreen(X.scale(p, RE));
          if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]);
        }
        ctx.fill();
      }
      if (cam.tilt > 0.03) {   // the equator, once the view is tilted enough to need it
        ringHalf(RE, false); ctx.globalAlpha = Math.min(0.5, cam.tilt * 2); ctx.lineWidth = 1.2; ctx.strokeStyle = C.halo; ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    function burnGeometry(rb) {
      const p = toScreen(rb.r), u = X.unit(rb.cmd > 1e-9 ? rb.want : rb.pro), f = flat(u), fl = Math.hypot(f[0], f[1]);
      // An arrow pointing toward or away from the viewer is drawn short rather than vanishing.
      const k = Math.max(fl, 0.35), d = fl > 1e-6 ? [f[0] / fl, f[1] / fl] : [0, -1], map = arrowMap(rb, u);
      const full = (D0 + map.toPx(rb.cmd)) * k, done = (D0 + map.toPx(rb.got)) * k;
      return { p, d, k, u, full, done, tip: [p[0] + d[0] * full, p[1] + d[1] * full] };
    }

    function drawBurn(rb, i, st, bare) {
      const g = burnGeometry(rb), sel = st.sel === i, hot = st.hover && st.hover.i === i;
      const o = rb.before, dim = hidden(rb.r) ? 0.4 : 1;
      ctx.globalAlpha = dim;
      if (bare) {   // one of a pile of burns at the same spot: just mark the place
        ctx.beginPath(); ctx.arc(g.p[0], g.p[1], 10, 0, TAU);
        ctx.fillStyle = C.burn; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.halo; ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }

      // How much of the orbit the engine is actually firing over.
      const nu = Math.atan2(X.dot(rb.r, o.Q), X.dot(rb.r, o.P));
      const rm = X.len(rb.r), span = Math.min(TAU, Math.sqrt(X.MU * o.p) / (rm * rm) * rb.burnTime);
      if (span * rm * cam.scale > 3) {
        arc(o, nu - span / 2, span);
        ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.globalAlpha = 0.3; ctx.strokeStyle = C.burn; ctx.stroke();
        ctx.globalAlpha = dim; ctx.lineCap = 'butt';
      }

      // Arrow shaft
      const from = [g.p[0] + g.d[0] * 10, g.p[1] + g.d[1] * 10];
      const mid = [g.p[0] + g.d[0] * g.done, g.p[1] + g.d[1] * g.done];
      ctx.lineCap = 'round'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(mid[0], mid[1]); ctx.strokeStyle = C.burn; ctx.stroke();
      if (rb.short) {
        ctx.setLineDash([2, 7]);
        ctx.beginPath(); ctx.moveTo(mid[0], mid[1]); ctx.lineTo(g.tip[0], g.tip[1]); ctx.strokeStyle = C.alert; ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.lineCap = 'butt';

      // The bead you pull
      const br = sel || hot ? 10 : 8;
      if (sel && rb.cmd < 1e-9 && !st.dragging) { const k = 0.5 + 0.5 * Math.sin((st.now || 0) / 520); ctx.beginPath(); ctx.arc(g.tip[0], g.tip[1], 13 + 7 * k, 0, TAU); ctx.globalAlpha = 0.28 * (1 - k * 0.6); ctx.fillStyle = C.burn; ctx.fill(); ctx.globalAlpha = dim; }
      if (hot && st.hover.type === 'dv') { ctx.beginPath(); ctx.arc(g.tip[0], g.tip[1], 17, 0, TAU); ctx.globalAlpha = 0.18; ctx.fillStyle = C.burn; ctx.fill(); ctx.globalAlpha = dim; }
      ctx.beginPath(); ctx.arc(g.tip[0], g.tip[1], br, 0, TAU);
      ctx.fillStyle = rb.short ? C.paper : C.burn; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = rb.short ? C.alert : C.halo; ctx.stroke();
      ctx.beginPath();
      const n = [-g.d[1], g.d[0]], c = g.tip, k = br * 0.38;
      ctx.moveTo(c[0] - g.d[0] * k + n[0] * k, c[1] - g.d[1] * k + n[1] * k);
      ctx.lineTo(c[0] + g.d[0] * k, c[1] + g.d[1] * k);
      ctx.lineTo(c[0] - g.d[0] * k - n[0] * k, c[1] - g.d[1] * k - n[1] * k);
      ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = rb.short ? C.alert : C.halo; ctx.stroke();
      ctx.lineCap = 'butt';

      // Node on the orbit
      if (sel) { ctx.beginPath(); ctx.arc(g.p[0], g.p[1], 16, 0, TAU); ctx.globalAlpha = 0.22; ctx.fillStyle = C.burn; ctx.fill(); ctx.globalAlpha = dim; }
      ctx.beginPath(); ctx.arc(g.p[0], g.p[1], 10, 0, TAU);
      ctx.fillStyle = C.burn; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.halo; ctx.stroke();
      ctx.font = `700 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C['on-burn'];
      ctx.fillText(String(rb.n), g.p[0], g.p[1] + 0.5);
      ctx.globalAlpha = 1;

      // Value just past the bead, in line with the arrow
      if (rb.cmd > 1e-9 || sel) {
        const plain = Math.abs(rb.params.rad) < 5e-4 && Math.abs(rb.params.turn) < 5e-3;
        let label = plain ? fmt.dvSigned(rb.params.pro) : fmt.dv(rb.cmd);
        if (!rb.short && rb.cmd > 1e-9 && rb.after.e < 0.001) label += '  circular';
        if (rb.short) label += '  out of fuel';
        const side = Math.abs(g.d[0]) > 0.4;
        text(label, g.tip[0] + g.d[0] * (side ? 18 : 22), g.tip[1] + g.d[1] * 22, { align: !side ? 'center' : g.d[0] > 0 ? 'left' : 'right', size: 12.5, weight: 650, color: rb.short ? C.alert : C['burn-ink'] });
      }

      // A soft ring as the craft passes through the burn
      if (st.pulse && st.pulse.i === i) {
        ctx.beginPath(); ctx.arc(g.p[0], g.p[1], 10 + 26 * st.pulse.f, 0, TAU);
        ctx.globalAlpha = 0.7 * (1 - st.pulse.f); ctx.lineWidth = 2; ctx.strokeStyle = C.burn; ctx.stroke(); ctx.globalAlpha = 1;
      }
    }

    function marker(p, solid) {
      if (hidden(p)) return null;
      const s = toScreen(p);
      ctx.beginPath(); ctx.arc(s[0], s[1], solid ? 5.5 : 7, 0, TAU);
      ctx.fillStyle = solid ? C.target : C.paper; ctx.fill();
      ctx.lineWidth = solid ? 2 : 2.5; ctx.strokeStyle = solid ? C.halo : C.target; ctx.stroke();
      return s;
    }
    const awayText = (km, ahead, behind) => (Math.abs(km) < 1 ? '' : `${fmt.dist(Math.abs(km))} ${km > 0 ? ahead : behind}`);

    /* The other craft (catch-up missions) or the landing zone (reentry missions):
       a solid dot for where it is now, a hollow ring for where it will be when you arrive. */
    function drawRendezvous(st) {
      const chk = st.chk, t = st.simT || 0;
      if (!chk) return;
      if (chk.chase) {
        const k = chk.chase;
        if (k.burn > 0) {
          const g = marker(eq(k.r, k.a0 + k.n * k.t), false);
          if (g) {
            const out = [g[0] - cam.cx, g[1] - cam.cy], ol = Math.hypot(out[0], out[1]) || 1;
            const side = out[0] / ol > 0.35 ? 'left' : out[0] / ol < -0.35 ? 'right' : 'center';
            const far = chk.missOk ? 36 : 0;   // step clear of the apsis label when the two meet
            const x = g[0] + out[0] / ol * (16 + far), y = g[1] + out[1] / ol * ((side === 'center' ? 30 : 16) + far);
            text(chk.missOk ? 'Together' : `Other craft at burn ${k.burn}`, x, y - 8, { align: side, weight: 650, size: 12.5, color: C['target-ink'] });
            text(chk.missOk ? 'close enough to dock' : awayText(chk.miss, 'ahead of you', 'behind you'), x, y + 8, { align: side, size: 12, color: C.ink2 });
          }
        }
        if (st.craft) marker(eq(k.r, k.a0 + k.n * t), true);
      }
      if (chk.site) {
        const k = chk.site;
        if (k.t != null) marker(eq(RE, k.a0 + X.SPIN * k.t), false);
        const a = k.a0 + X.SPIN * t, l = marker(eq(RE, a), true), e = st.res.entry;
        if (e) {
          const steep = e.angle > st.mission.target.angle[1], shallow = e.angle < st.mission.target.angle[0];
          const where = chk.missOk ? 'over the landing zone' : awayText(chk.miss, 'past the landing zone', 'short of the landing zone');
          apsisLabel(e.r, `Entry  ${fmt.speed(e.speed)}, ${e.angle.toFixed(1)}° down`, `${steep ? 'too steep, ' : shallow ? 'too shallow, ' : ''}${where}`, chk.ok ? C['target-ink'] : chk.angleOk ? C.ink : C.alert);
        } else if (l) {
          const out = dirScreen(eq(1, a));
          text('Landing zone', l[0] + out[0] * 14, l[1] + out[1] * 14, { align: out[0] > 0.3 ? 'left' : out[0] < -0.3 ? 'right' : 'center', size: 12.5, weight: 650, color: C['target-ink'] });
        }
      }
    }

    function draw(st) {
      const { res, mission } = st, chk = st.chk || {};
      ctx.clearRect(0, 0, cam.w, cam.h);
      ctx.fillStyle = C.paper; ctx.fillRect(0, 0, cam.w, cam.h);

      // Far halves first, then Earth, then everything in front of it.
      drawLandmarks(mission.target, true); drawTarget(mission, chk, true);
      drawEarth(st.simT || 0);
      drawLandmarks(mission.target, false); drawTarget(mission, chk, false);

      // The orbit a mission asks you to match
      if (st.guide) {
        ctx.setLineDash([7, 6]); arc(st.guide, 0, TAU);
        ctx.lineWidth = 2; ctx.strokeStyle = C.target; ctx.globalAlpha = chk.ok ? 1 : 0.75; ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }

      // Earlier orbits: the full shape faintly, the part actually flown more firmly
      const last = res.legs.length - 1;
      ctx.lineJoin = 'round';
      res.legs.forEach((l, i) => {
        if (i === last && l.end !== 'burn') return;
        if (l.orbit.e < 1 && l.orbit.ra < SOI) {
          ctx.setLineDash([3, 6]); arc(l.orbit, 0, TAU);
          ctx.lineWidth = 1.3; ctx.strokeStyle = C.ink3; ctx.stroke(); ctx.setLineDash([]);
        }
      });
      res.legs.forEach((l, i) => {
        if (i === last && l.end !== 'burn') return;
        if (l.sweep < 1e-6) return;
        arc(l.orbit, l.nu0, Math.min(l.sweep, TAU)); ctx.lineWidth = 2.2; ctx.strokeStyle = C.ink2; ctx.stroke();
      });

      // Where you end up
      const fl = res.legs[last], fo = res.final;
      if (fl.end !== 'burn') {
        arc(fo, fl.nu0, fl.sweep);
        ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
        if (fl.end === 'reentry') {
          const hit = X.stateAt(fo, fl.nu0 + fl.sweep).r;
          if (!hidden(hit)) {
            const s = toScreen(hit);
            ctx.beginPath(); ctx.arc(s[0], s[1], 6, 0, TAU); ctx.fillStyle = C.paper; ctx.fill();
            ctx.lineWidth = 2.5; ctx.strokeStyle = chk.ok ? C.target : C.alert; ctx.stroke();
          }
        }
        const speed = (r) => fmt.speed(Math.sqrt(X.MU * (2 / r - 1 / fo.a)));
        const tilt = fo.inc > 0.5 * D ? `, ${fmt.deg(fo.inc / D)}` : '';
        if (res.status === 'orbit' && fo.e < J.ECC_APS) {
          // Put the label at the top of the picture, wherever that is on the orbit.
          let top = fo.R, best = -Infinity;
          for (let i = 0; i < 72; i++) { const p = X.stateAt(fo, i / 72 * TAU).r, y = -flat(p)[1]; if (y > best && !hidden(p)) { best = y; top = p; } }
          apsisLabel(top, `Circular  ${fmt.dist(fo.a - RE)}${tilt}`, `${speed(fo.a)}   one lap ${fmt.time(fo.period)}`);
        } else {
          if (fo.e < 1 && fo.ra < SOI && (res.status === 'orbit' || X.wrapTau(Math.PI - fl.nu0) <= fl.sweep))
            apsisLabel(X.stateAt(fo, Math.PI).r, `Apoapsis  ${fmt.dist(fo.ra - RE)}${tilt}`, speed(fo.ra));
          if (res.status === 'orbit') apsisLabel(X.stateAt(fo, 0).r, `Periapsis  ${fmt.dist(fo.rp - RE)}`, speed(fo.rp));
          else if (res.status === 'reentry' && fo.rp > RE && !(mission.target && mission.target.site)) apsisLabel(X.stateAt(fo, 0).r, `Periapsis  ${fmt.dist(fo.rp - RE)}`, 'inside the atmosphere', chk.ok ? C['target-ink'] : C.alert);
        }
      }

      drawRendezvous(st);

      // Somewhere to add the next burn
      if (st.hover && st.hover.type === 'add') {
        const s = toScreen(st.hover.r);
        ctx.beginPath(); ctx.arc(s[0], s[1], 10, 0, TAU); ctx.fillStyle = C.paper; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = C.burn; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s[0] - 4.5, s[1]); ctx.lineTo(s[0] + 4.5, s[1]); ctx.moveTo(s[0], s[1] - 4.5); ctx.lineTo(s[0], s[1] + 4.5); ctx.stroke();
      }

      // Where three or more burns share a spot, only the selected one shows its arrow.
      const live = res.burns.filter((rb) => !rb.drop && !rb.unreachable).map((rb) => toScreen(rb.r));
      const crowded = (rb) => { const p = toScreen(rb.r); return live.filter((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 16).length >= 3; };
      res.burns.forEach((rb, i) => { if (!rb.drop && !rb.unreachable && i !== st.sel) drawBurn(rb, i, st, crowded(rb)); });
      const chosen = res.burns[st.sel];
      if (chosen && !chosen.drop && !chosen.unreachable) drawBurn(chosen, st.sel, st);

      // The craft, with a short tail
      if (st.craft) {
        const tr = st.craft.trail;
        for (let i = 1; i < tr.length; i++) {
          if (hidden(tr[i - 1]) || hidden(tr[i])) continue;
          const a = toScreen(tr[i - 1]), b = toScreen(tr[i]);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
          ctx.globalAlpha = 0.5 * (1 - i / tr.length); ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.strokeStyle = C.earth; ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.lineCap = 'butt';
        if (!hidden(st.craft.r)) {
          const s = toScreen(st.craft.r);
          ctx.beginPath(); ctx.arc(s[0], s[1], 5.5, 0, TAU); ctx.fillStyle = C.ink; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = C.halo; ctx.stroke();
        }
      }
    }

    return { resize, fit, ease, draw, zoomAt, panBy, resetZoom, isHome, middle, setView, rotateBy, is3D, toScreen, flat, dirScreen, planeVector, planePoint, burnGeometry, arrowMap, viewRadius, cam, D0 };
  }

  G.Orbit.view = { create };
})(globalThis);
