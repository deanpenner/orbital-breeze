/* Canvas drawing for the Moon page. One journey, three true-scale pictures of it:
   'earth' (close to Earth), 'journey' (Earth out to the Moon's orbit) and 'moon' (centred on the
   Moon and moving with it). Each canvas has its own camera and can show any of the three. */
(function (G) {
  'use strict';
  const X = G.Orbit.physics, J = G.Orbit.journey, L = G.Orbit.lunar;
  const { RE, ATM, TAU } = X, M = L.MOON;

  /* Burn arrows. Length is not plain delta-v: the arrow stretches wherever a small change in
     speed makes a big change in the orbit, so one pixel of pull always moves the far side of
     the orbit by about the same small share of its width. */
  const D0 = 26, ARROW = 40, DV_KNEE = 0.15;
  const FINE = 0.009;       // far side moves ~0.9% of the orbit's width per pixel, more for very long orbits
  const STEP = 0.004, STEPS = 1500;
  function arrowMap(rb, u) {
    const key = u.map((x) => x.toFixed(4)).join();
    rb.maps = rb.maps || {};
    if (rb.maps[key]) return rb.maps[key];
    const moon = rb.body === 'moon', mu = rb.mu, R0 = moon ? M.R : RE;
    const floor = moon ? 0.003 : 0.001;         // km/s per pixel, finest the pull ever gets
    const r = X.len(rb.r), px = new Float64Array(STEPS + 1);
    for (let i = 0; i < STEPS; i++) {
      const dv = (i + 0.5) * STEP, v2 = X.add(rb.v, X.scale(u, dv));
      let g = Math.sqrt(dv * dv + DV_KNEE * DV_KNEE) / ARROW;
      const inv = 2 / r - X.dot(v2, v2) / mu, along = Math.abs(X.dot(v2, u));
      if (inv > 0 && along > 1e-6) {
        // How far out the far side is, in radii of the body. The pull is fine for low orbits, coarser
        // across the wide gap in between, and fine again where the far side nears the Moon's distance,
        // because there a metre per second moves it thousands of kilometres.
        const reach = (2 / inv - r) / R0;
        if (!moon && reach > 47 && reach < 75) g = Math.min(g, 0.0012);
        else if (reach < (moon ? 37 : 47)) g = Math.min(g, FINE * (1 + 4.5 * X.clamp((reach - (moon ? 3 : 2)) / (moon ? 7 : 6), 0, 1)) * mu * inv / (2 * along));
      }
      px[i + 1] = px[i] + STEP / Math.max(g, floor);
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

  const NEAR = 80000;        // km from Earth: burns further out than this are handled in the Journey picture
  const EARTH_CAP = 16000;   // km: the Earth picture stays close; longer paths run off its edge
  /* Which picture a step is worked in. */
  const sceneOfBurn = (rb) => (rb.body === 'moon' ? 'moon' : X.len(rb.r) > NEAR ? 'journey' : 'earth');
  const frameOf = (scene) => (scene === 'moon' ? 'moon' : 'earth');

  // Abstract continents: latitude, longitude, angular size (degrees) and stretch.
  const LAND = [[38, 15, 17, 1.5], [52, 115, 15, 1.9], [22, 230, 16, 1.2], [58, 300, 11, 1.6], [-18, 60, 15, 1.3], [-32, 280, 13, 1.1], [-70, 170, 16, 2.2]];
  // A few craters: position as a share of the radius, and size.
  const CRATERS = [[-0.34, 0.3, 0.2], [0.26, 0.42, 0.13], [0.4, -0.18, 0.24], [-0.12, -0.44, 0.15], [-0.52, -0.2, 0.1], [0.02, 0.06, 0.09]];
  const D = Math.PI / 180;

  function create(canvas, fmt, opts) {
    const small = !!(opts && opts.small);
    const ctx = canvas.getContext('2d');
    const css = getComputedStyle(document.documentElement), C = {};
    for (const k of ['paper', 'panel', 'ink', 'ink2', 'ink3', 'line', 'burn', 'burn-ink', 'target', 'target-ink', 'alert', 'earth', 'earth-lit', 'land', 'halo', 'on-burn', 'moon', 'moon-lit', 'crater'])
      C[k] = css.getPropertyValue('--' + k).trim();
    const FONT = css.getPropertyValue('--font').trim();
    const BG = small ? C.panel : C.paper;

    // `base` is the automatic fit. The player's own zoom and pan sit on top of it.
    const cam = { cx: 0, cy: 0, scale: 0, base: 0, goal: 0, zoom: 1, panX: 0, panY: 0, hx: 0, hy: 0, w: 0, h: 0, top: 0, bottom: 0, right: 0, sx: 0, sy: 0, sxGoal: 0, syGoal: 0 };
    let avoid = [];   // screen rectangles that labels keep out of: the brief, the small pictures
    function place() { cam.scale = cam.base * cam.zoom; cam.cx = cam.hx + cam.sx + cam.panX; cam.cy = cam.hy + cam.sy + cam.panY; }
    function zoomAt(m, factor) {
      const z = Math.min(400, Math.max(0.3, cam.zoom * factor)), k = z / cam.zoom;
      cam.panX = m[0] - cam.hx - cam.sx - (m[0] - cam.cx) * k; cam.panY = m[1] - cam.hy - cam.sy - (m[1] - cam.cy) * k;
      cam.zoom = z; place();
    }
    function panBy(dx, dy) { cam.panX += dx; cam.panY += dy; place(); }
    function resetZoom() { cam.zoom = 1; cam.panX = cam.panY = 0; place(); }
    const isHome = () => Math.abs(cam.zoom - 1) < 1e-3 && Math.abs(cam.panX) + Math.abs(cam.panY) < 1;
    const middle = () => [cam.hx, cam.hy];

    /* `right` is room kept clear for the small pictures, so the large one sits a little left of centre. */
    function resize(top, bottom, right) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cam.w = canvas.clientWidth; cam.h = canvas.clientHeight; cam.top = top || 0; cam.bottom = bottom || 0; cam.right = right || 0;
      canvas.width = Math.round(cam.w * dpr); canvas.height = Math.round(cam.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cam.hx = (cam.w - cam.right) / 2; cam.hy = cam.top + (cam.h - cam.top - cam.bottom) / 2; place();
    }
    const half = () => Math.max(20, Math.min(cam.w - cam.right, cam.h - cam.top - cam.bottom) / 2);

    const toScreen = (p) => [cam.cx + p[0] * cam.scale, cam.cy - p[1] * cam.scale];
    const flat = (p) => [p[0], -p[1]];
    const viewRadius = () => half() / cam.scale;
    /* The point in the plane that sits under a screen position, and the vector under a screen offset. */
    const planePoint = (m) => [(m[0] - cam.cx) / cam.scale, -(m[1] - cam.cy) / cam.scale, 0];
    const planeVector = (off) => [off[0] / cam.scale, -off[1] / cam.scale, 0];
    const onScreen = (s, pad) => s[0] > -(pad || 0) && s[0] < cam.w + (pad || 0) && s[1] > -(pad || 0) && s[1] < cam.h + (pad || 0);

    /* Choose a zoom for one of the three pictures. */
    function fit(st, scene, instant) {
      const res = st.res, sel = res.burns[st.sel], picked = sel && !sel.drop && !sel.unreachable && sceneOfBurn(sel) === scene ? sel : null;
      let need;
      if (scene === 'earth') {
        need = (RE + 300) * 1.9;
        if (res.startBody === 'earth') need = Math.max(need, Math.min(res.start.ra, NEAR));
        for (const l of res.legs) if (l.body === 'earth') need = Math.max(need, Math.min(l.orbit.e < 1 ? l.orbit.ra : Infinity, EARTH_CAP));
        for (const rb of res.burns) if (!rb.drop && !rb.unreachable && sceneOfBurn(rb) === 'earth') need = Math.max(need, X.len(rb.r) * 1.05);
      } else if (scene === 'journey') {
        // A few settings only, so the picture stays put while a path is being adjusted. It steps back
        // for a path that climbs past the Moon's orbit, and again for one that leaves or is let go.
        const end = res.legs[res.legs.length - 1], past = (lo, hi) => res.legs.some((l) => l.body === 'earth' && l.orbit.e < 1 && l.orbit.ra > M.a * lo && l.orbit.ra < M.a * hi && (l.hops === 0 || l === end));
        need = end.end === 'escape' || end.end === 'again' || past(1.24, 9) ? M.a * 1.5 : past(1.05, 1.24) ? M.a * 1.24 : M.a * 1.04;
      } else {
        const tailMoon = res.legs.filter((l, i) => l.body === 'moon' && i >= res.tail), lastMoon = tailMoon[tailMoon.length - 1];
        if (picked) {
          const r = X.len(picked.r), shut = (o) => (o.e < 1 && o.ra < M.soi ? o.ra : 0);
          need = X.clamp(Math.max(shut(picked.before), shut(picked.after)), r * 2.1, Math.max(r * 2.1, Math.min(r * 7, 20000)));
        } else if (lastMoon && lastMoon.end === 'loop') need = Math.max(M.R * 2.1, lastMoon.orbit.ra * 1.12);
        else if (tailMoon.length || !res.approach || res.approach.entered) need = M.soi * 0.93;
        else need = X.clamp(res.approach.dist * 1.05, M.soi * 0.93, M.soi * 2.6);
      }
      cam.goal = half() / (need * 1.16);
      // Slide the picture so the selected burn's arrow and bead stay in sight.
      cam.sxGoal = cam.syGoal = 0;
      if (picked && !small) {
        const was = [cam.base, cam.zoom, cam.sx, cam.sy, cam.panX, cam.panY];
        cam.base = cam.goal; cam.zoom = 1; cam.sx = cam.sy = cam.panX = cam.panY = 0; place();
        const g = burnGeometry(picked), pad = 40;
        for (const q of [g.p, g.tip]) {
          cam.sxGoal += Math.max(0, pad - (q[0] + cam.sxGoal)) - Math.max(0, q[0] + cam.sxGoal - (cam.w - pad));
          cam.syGoal += Math.max(0, cam.top - 20 + pad - (q[1] + cam.syGoal)) - Math.max(0, q[1] + cam.syGoal - (cam.h - cam.bottom - pad + 14));
        }
        // And keep the bead's value from landing on the mission brief: step right or down, whichever is less.
        const tip = [g.tip[0] + cam.sxGoal, g.tip[1] + cam.syGoal], box = g.d[0] < -0.4 ? [tip[0] - 150, tip[1] - 16, tip[0] + 14, tip[1] + 16] : [tip[0] - 60, tip[1] - 30, tip[0] + 60, tip[1] + 16];
        const left = (st.avoid || []).filter((r) => r[0] < cam.w / 3);
        if (left.length) {
          const r = [0, 0, Math.max(...left.map((q) => q[2])), Math.max(...left.map((q) => q[3]))];
          if (box[0] < r[2] && box[1] < r[3]) {
            const right = r[2] - box[0] + 10, down = r[3] - box[1] + 10;
            if (right <= down) cam.sxGoal += right; else cam.syGoal += down;
          }
        }
        [cam.base, cam.zoom, cam.sx, cam.sy, cam.panX, cam.panY] = was;
      }
      if (instant || !cam.base) { cam.base = cam.goal; cam.sx = cam.sxGoal; cam.sy = cam.syGoal; }
      place();
    }
    function ease(frozen) {
      if (!frozen) {
        cam.base += (cam.goal - cam.base) * 0.12;
        if (Math.abs(cam.goal - cam.base) < cam.goal * 1e-4) cam.base = cam.goal;
        cam.sx += (cam.sxGoal - cam.sx) * 0.12; cam.sy += (cam.syGoal - cam.sy) * 0.12;
        if (Math.abs(cam.sxGoal - cam.sx) + Math.abs(cam.syGoal - cam.sy) < 0.3) { cam.sx = cam.sxGoal; cam.sy = cam.syGoal; }
      }
      place();
    }

    /* ---------- small drawing tools ---------- */
    const W = (x) => (small ? x * 0.62 : x);   // line widths in the small pictures
    function trace(pts) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) { const s = toScreen(pts[i]); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }
    }
    const arc = (o, nu0, sweep) => trace(X.arcPoints(o, nu0, sweep, Math.max(12, Math.ceil(sweep / TAU * 240))));
    function circle(c, r) { ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, TAU); }
    /* A path that fades away. `solid(f, s, p)` says how solid it is, 1 to 0, at share f of its length,
       screen point s and place p; the fading part is dashed. Returns where it is half gone, with the
       direction of travel there, to hang an arrowhead or a label on. */
    function fading(pts, solid, width, color) {
      let tip = null, run = 0, s0 = toScreen(pts[0]), a0 = solid(0, s0, pts[0]);
      ctx.lineWidth = width; ctx.strokeStyle = color; ctx.lineCap = 'butt';
      for (let i = 1; i < pts.length; i++) {
        const s1 = toScreen(pts[i]), gap = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]), n = Math.max(1, Math.min(60, Math.ceil(gap / 5)));
        let q0 = s0;
        for (let k = 1; k <= n; k++) {
          const u = k / n, f = (i - 1 + u) / (pts.length - 1), q = [s0[0] + (s1[0] - s0[0]) * u, s0[1] + (s1[1] - s0[1]) * u];
          const a = solid(f, q, X.add(pts[i - 1], X.scale(X.sub(pts[i], pts[i - 1]), u))), len = gap / n, mid = (a + a0) / 2;
          if (mid > 0.02 && len > 0) {
            ctx.setLineDash(mid < 0.995 ? [W(7), W(5)] : []); ctx.lineDashOffset = -run;
            ctx.globalAlpha = mid; ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
          }
          if (!tip && a0 >= 0.5 && a < 0.5 && gap > 0) tip = { at: q, dir: [(s1[0] - s0[0]) / gap, (s1[1] - s0[1]) / gap], f };
          run += len; q0 = q; a0 = a;
        }
        s0 = s1;
      }
      ctx.globalAlpha = 1; ctx.setLineDash([]); ctx.lineDashOffset = 0;
      return tip;
    }
    function arrowhead(tip, color) {
      const d = tip.dir, n = [-d[1], d[0]], c = tip.at, k = small ? 4 : 7;
      ctx.beginPath(); ctx.moveTo(c[0] - d[0] * k + n[0] * k * 0.8, c[1] - d[1] * k + n[1] * k * 0.8); ctx.lineTo(c[0] + d[0] * k * 0.5, c[1] + d[1] * k * 0.5); ctx.lineTo(c[0] - d[0] * k - n[0] * k * 0.8, c[1] - d[1] * k - n[1] * k * 0.8);
      ctx.lineWidth = W(2.6); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.globalAlpha = 0.8; ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    }
    /* How solid a line stays as it nears the edge of the picture: paths that leave for good fade out there. */
    const nearEdge = (s) => X.clamp((Math.min(s[0], cam.w - s[0], s[1], cam.h - cam.bottom - s[1]) - (small ? 5 : 12)) / (small ? 30 : 110), 0, 1);
    function ring(centre, radius) { const s = toScreen(centre); circle(s, radius * cam.scale); }

    function text(str, x, y, o) {
      if (small) return;
      o = o || {};
      ctx.font = `${o.weight || 500} ${o.size || 13}px ${FONT}`;
      ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = BG;
      ctx.strokeText(str, x, y);
      ctx.fillStyle = o.color || C.ink; ctx.fillText(str, x, y);
    }
    /* Two lines of text beside a screen point `s`, pushed away from `from`. If that would land on
       the mission brief or a small picture, or off the page, the other sides are tried. */
    function label(s, from, title, sub, color, gap, strict) {
      if (small) return false;
      const a0 = Math.atan2(from[1] - s[1], s[0] - from[0]), g = gap || 14;
      ctx.font = `650 13px ${FONT}`;
      const wide = Math.max(ctx.measureText(title).width, sub ? ctx.measureText(sub).width * 0.95 : 0);
      let best = null;
      for (const turn of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {   // outward first, inward (over the paths) last
        const c = Math.cos(a0 + turn), sn = Math.sin(a0 + turn);
        const align = c > 0.35 ? 'left' : c < -0.35 ? 'right' : 'center';
        const x = s[0] + c * g, y = s[1] - sn * g - (Math.abs(c) <= 0.35 ? sn * 14 : 0);
        const left = align === 'left' ? x : align === 'right' ? x - wide : x - wide / 2, box = [left - 4, y - 18, left + wide + 4, y + 18];
        const clash = box[0] < 4 || box[2] > cam.w - 4 || box[1] < 4 || box[3] > cam.h - cam.bottom + 10 || avoid.some((r) => box[0] < r[2] && box[2] > r[0] && box[1] < r[3] && box[3] > r[1]);
        if (!best || !clash) best = { x, y, align, clash, box };
        if (!clash) break;
      }
      if (strict && best.clash) return false;   // nowhere clear: the caller will try another spot
      avoid = avoid.concat([best.box]);          // later labels keep clear of this one
      text(title, best.x, best.y - (sub ? 8 : 0), { align: best.align, weight: 650, color: color || C.ink });
      if (sub) text(sub, best.x, best.y + 8, { align: best.align, size: 12, color: C.ink2 });
      return true;
    }
    /* A small open dot on a path with a two-line label. */
    function apsisLabel(p, title, sub, color) {
      const s = toScreen(p);
      if (!onScreen(s, 10)) return;
      circle(s, W(4)); ctx.fillStyle = BG; ctx.fill(); ctx.lineWidth = W(2); ctx.strokeStyle = color || C.ink; ctx.stroke();
      label(s, [cam.cx, cam.cy], title, sub, color);
    }
    function band(centre, r0, r1, hit, title, angle) {
      const s = toScreen(centre);
      ctx.beginPath(); ctx.arc(s[0], s[1], r1 * cam.scale, 0, TAU);
      if (r0 > 0) ctx.arc(s[0], s[1], r0 * cam.scale, 0, TAU, true);
      ctx.globalAlpha = hit ? 0.34 : 0.15; ctx.fillStyle = C.target; ctx.fill('evenodd');
      ctx.globalAlpha = hit ? 0.9 : 0.45; ctx.lineWidth = 1; ctx.strokeStyle = C.target;
      circle(s, r1 * cam.scale); ctx.stroke();
      if (r0 > 0) { circle(s, r0 * cam.scale); ctx.stroke(); }
      ctx.globalAlpha = 1;
      if (title) { const a = angle == null ? 0.62 : angle; text(title, s[0] + Math.cos(a) * (r1 * cam.scale + 12), s[1] - Math.sin(a) * (r1 * cam.scale + 12), { size: 12.5, weight: 600, color: C['target-ink'], align: Math.cos(a) < -0.3 ? 'right' : 'left' }); }
    }

    function drawEarth(simT) {
      const R = RE * cam.scale, s = toScreen([0, 0, 0]), x = s[0], y = s[1];
      if (R < 7) {   // far away, Earth is a dot (never drawn smaller than it can be seen)
        circle(s, Math.max(R, small ? 2 : 3)); ctx.fillStyle = C.earth; ctx.fill();
        return;
      }
      circle(s, (RE + ATM) * cam.scale); ctx.globalAlpha = 0.2; ctx.fillStyle = C.earth; ctx.fill(); ctx.globalAlpha = 1;
      ctx.save();
      circle(s, R); ctx.fillStyle = C.earth; ctx.fill(); ctx.clip();
      circle([x - R * 0.16, y - R * 0.16], R * 0.94); ctx.fillStyle = C['earth-lit']; ctx.fill();
      // A few abstract continents that turn with the planet, so you can see a day pass.
      const spin = X.SPIN * simT;
      ctx.fillStyle = C.land;
      for (const [lat, lon, size, stretch] of LAND) {
        const la = lat * D, lo = lon * D + spin, c = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
        if (c[2] < -0.25) continue;
        const east = [-Math.sin(lo), Math.cos(lo), 0], north = X.cross(c, east), rho = size * D;
        ctx.beginPath();
        for (let i = 0; i < 28; i++) {
          const a = i / 28 * TAU;
          const p = X.unit(X.add(X.scale(c, Math.cos(rho)), X.add(X.scale(east, Math.sin(rho) * Math.cos(a) * stretch), X.scale(north, Math.sin(rho) * Math.sin(a)))));
          const q = toScreen(X.scale(p, RE));
          if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
        }
        ctx.fill();
      }
      ctx.restore();
    }

    /* The Moon as a disc with a few craters, or as a dot when far away. `hollow` is the ring that
       stands for where it will be. */
    function drawMoon(centre, hollow, good) {
      const s = toScreen(centre), R = M.R * cam.scale, least = small ? 2.6 : 4.5;
      if (hollow) {
        circle(s, Math.max(R, least + 1.5)); ctx.fillStyle = BG; ctx.fill();
        ctx.lineWidth = W(2.2); ctx.strokeStyle = good ? C.target : C.ink2; ctx.stroke();
        return s;
      }
      if (R < 9) {
        circle(s, Math.max(R, least)); ctx.fillStyle = C.moon; ctx.fill(); ctx.lineWidth = W(1.5); ctx.strokeStyle = C.halo; ctx.stroke();
        return s;
      }
      ctx.save();
      circle(s, R); ctx.fillStyle = C.moon; ctx.fill(); ctx.clip();
      circle([s[0] - R * 0.16, s[1] - R * 0.16], R * 0.94); ctx.fillStyle = C['moon-lit']; ctx.fill();
      ctx.fillStyle = C.crater;
      for (const [cx, cy, cr] of CRATERS) { circle([s[0] + cx * R, s[1] + cy * R], cr * R); ctx.fill(); }
      ctx.restore();
      return s;
    }

    function burnGeometry(rb) {
      const p = toScreen(rb.r), u = X.unit(rb.cmd > 1e-9 ? rb.want : rb.pro), f = flat(u), fl = Math.hypot(f[0], f[1]) || 1;
      const d = [f[0] / fl, f[1] / fl], map = arrowMap(rb, u);
      const full = D0 + map.toPx(rb.cmd), done = D0 + map.toPx(rb.got);
      return { p, d, k: 1, u, full, done, tip: [p[0] + d[0] * full, p[1] + d[1] * full] };
    }

    function dot(p, r, fill, stroke, w) { circle(p, r); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.lineWidth = w || 2; ctx.strokeStyle = stroke; ctx.stroke(); } }

    function drawBurn(rb, i, st, bare) {
      if (small || bare === 'far' || bare === true) {   // just mark the place
        const p = toScreen(bare === 'far' ? rb.at : rb.r);
        dot(p, small ? 3.2 : bare === 'far' ? 4.5 : 6, C.burn, C.halo, small ? 1.2 : 1.6);
        return;
      }
      if (bare === 'node') {   // a neighbour of the selected burn: its number, without the arrow
        const p = toScreen(rb.r);
        dot(p, 10, C.burn, C.halo, 2);
        ctx.font = `700 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C['on-burn'];
        ctx.fillText(String(rb.n), p[0], p[1] + 0.5);
        return;
      }
      const g = burnGeometry(rb), sel = st.sel === i, hot = st.hover && st.hover.i === i, o = rb.before;

      // How much of the orbit the engine is actually firing over.
      const nu = Math.atan2(X.dot(rb.r, o.Q), X.dot(rb.r, o.P));
      const rm = X.len(rb.r), span = Math.min(TAU, Math.sqrt(o.mu * o.p) / (rm * rm) * rb.burnTime);
      if (span * rm * cam.scale > 3) {
        arc(o, nu - span / 2, span);
        ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.globalAlpha = 0.3; ctx.strokeStyle = C.burn; ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineCap = 'butt';
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
      if (sel && rb.cmd < 1e-9 && !st.dragging) { const k = 0.5 + 0.5 * Math.sin((st.now || 0) / 520); circle(g.tip, 13 + 7 * k); ctx.globalAlpha = 0.28 * (1 - k * 0.6); ctx.fillStyle = C.burn; ctx.fill(); ctx.globalAlpha = 1; }
      if (hot && st.hover.type === 'dv') { circle(g.tip, 17); ctx.globalAlpha = 0.18; ctx.fillStyle = C.burn; ctx.fill(); ctx.globalAlpha = 1; }
      dot(g.tip, br, rb.short ? BG : C.burn, rb.short ? C.alert : C.halo, 2.5);
      ctx.beginPath();
      const n = [-g.d[1], g.d[0]], c = g.tip, k = br * 0.38;
      ctx.moveTo(c[0] - g.d[0] * k + n[0] * k, c[1] - g.d[1] * k + n[1] * k);
      ctx.lineTo(c[0] + g.d[0] * k, c[1] + g.d[1] * k);
      ctx.lineTo(c[0] - g.d[0] * k - n[0] * k, c[1] - g.d[1] * k - n[1] * k);
      ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = rb.short ? C.alert : C.halo; ctx.stroke();
      ctx.lineCap = 'butt';

      // Node on the orbit
      if (sel) { circle(g.p, 16); ctx.globalAlpha = 0.22; ctx.fillStyle = C.burn; ctx.fill(); ctx.globalAlpha = 1; }
      dot(g.p, 10, C.burn, C.halo, 2);
      ctx.font = `700 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C['on-burn'];
      ctx.fillText(String(rb.n), g.p[0], g.p[1] + 0.5);

      // Value just past the bead, in line with the arrow
      if (rb.cmd > 1e-9 || sel) {
        const plain = Math.abs(rb.params.rad) < 5e-4;
        let str = plain ? fmt.dvSigned(rb.params.pro) : fmt.dv(rb.cmd);
        if (!rb.short && rb.cmd > 1e-9 && rb.after.e < 0.001) str += '  circular';
        if (rb.short) str += '  out of propellant';
        const side = Math.abs(g.d[0]) > 0.4;
        text(str, g.tip[0] + g.d[0] * (side ? 18 : 22), g.tip[1] + g.d[1] * 22, { align: !side ? 'center' : g.d[0] > 0 ? 'left' : 'right', size: 12.5, weight: 650, color: rb.short ? C.alert : C['burn-ink'] });
      }

      // A soft ring as the craft passes through the burn
      if (st.pulse && st.pulse.i === i) {
        circle(g.p, 10 + 26 * st.pulse.f);
        ctx.globalAlpha = 0.7 * (1 - st.pulse.f); ctx.lineWidth = 2; ctx.strokeStyle = C.burn; ctx.stroke(); ctx.globalAlpha = 1;
      }
    }

    /* ---------- the journey's paths, in either frame ---------- */
    /* Points of a leg in this picture's frame. A leg that belongs to the other body is sampled
       through time; from the Moon's side only the stretch near the Moon is worth drawing. */
    function legPath(st, l, frame) {
      const res = st.res;
      if (l.body === frame) return X.arcPoints(l.orbit, l.nu0, l.orbit.e < 1 ? Math.min(l.sweep, TAU) : l.sweep, Math.max(12, Math.ceil(Math.min(l.sweep, TAU) / TAU * 240)));
      if (frame === 'earth') {
        const laps = l.orbit.e < 1 ? l.dt / l.orbit.period : 0.5;
        return L.legPoints(res, l, 'earth', 0, l.dt, Math.round(X.clamp(laps * 40, 30, 1400)));
      }
      // An Earth leg seen from the Moon: the hours either side of the handover or of the closest pass.
      const reach = Math.max(viewRadius() * 2.4, M.soi * 1.5) / 0.7, a = res.approach;
      let tA, tB;
      if (l.end === 'soi-in') { tA = Math.max(0, l.dt - reach); tB = l.dt; }
      else if (l.hops > 0 && l.t0 > 0) { tA = 0; tB = Math.min(l.dt, reach); }
      else if (a && !a.entered && a.t >= l.t0 && a.t <= l.t0 + l.dt) { tA = Math.max(0, a.t - l.t0 - reach); tB = Math.min(l.dt, a.t - l.t0 + reach); }
      else return null;
      return L.legPoints(res, l, 'moon', tA, tB, 48);
    }

    let gone = null;   // where the last leg fades out, if it does: { kind, at, dir }
    function drawLegs(st, frame) {
      const res = st.res, final = res.legs.length - 1;
      gone = null;
      ctx.lineJoin = 'round';
      // The stretch flown in the Moon's sphere of influence glows in the Earth pictures: it is the
      // part the Moon picture shows, and it begins and ends exactly where gravity hands over.
      if (frame === 'earth') res.legs.forEach((l) => {
        if (l.body !== 'moon' || (l.sweep < 1e-6 && l.dt < 1)) return;
        const pts = legPath(st, l, frame);
        trace(pts); ctx.lineWidth = W(11); ctx.lineCap = 'round'; ctx.globalAlpha = 0.6; ctx.strokeStyle = C.moon; ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      });
      // Earlier closed orbits: the full shape faintly
      res.legs.forEach((l, i) => {
        if (i >= res.tail || l.body !== frame || !(l.orbit.e < 1 && l.orbit.ra < L.BODY[l.body].edge)) return;
        ctx.setLineDash([3, 6]); arc(l.orbit, 0, TAU);
        ctx.lineWidth = W(1.3); ctx.strokeStyle = C.ink3; ctx.stroke(); ctx.setLineDash([]);
      });
      // The part actually flown more firmly, and where you end up most firmly of all
      res.legs.forEach((l, i) => {
        if (l.sweep < 1e-6 && l.dt < 1) return;
        const pts = legPath(st, l, frame);
        if (!pts) return;
        const tail = i >= res.tail, wide = W(tail ? 3 : 2.2), color = tail ? C.ink : C.ink2;
        if (i === final && l.end === 'escape') {
          // Leaving for good: the line thins out toward the edge of the picture and ends in an arrowhead.
          const far = (p, f) => (frame === 'earth' ? X.clamp((2.6 * M.a - X.len(p)) / (0.8 * M.a), 0, 1) : X.clamp((1 - f) / 0.3, 0, 1));
          const tip = fading(pts, (f, s, p) => Math.min(nearEdge(s), far(p, f)), wide, color);
          if (tip) { arrowhead(tip, color); gone = Object.assign({ kind: 'escape' }, tip); }
        } else if (i === final && l.end === 'again') {
          // Heading for a second, unplanned meeting with the Moon: followed part of the way, then let go.
          const tip = fading(pts, (f) => X.clamp((0.92 - f) / 0.5, 0, 1), wide, color);
          if (tip) gone = Object.assign({ kind: 'again' }, tip);
        } else {
          // In Free flight, an orbit that would not last is dashed.
          const frail = i === final && l.end === 'loop' && (res.caution === 'crossing' || res.caution === 'barely') && !st.mission.target;
          if (frail) ctx.setLineDash([W(10), W(6)]);
          trace(pts); ctx.lineWidth = wide; ctx.strokeStyle = color; ctx.stroke(); ctx.setLineDash([]);
        }
      });
    }

    function drawCraft(st, frame) {
      if (!st.craft) return;
      const tr = st.craft.trail, at = (c) => toScreen(frame === 'moon' ? c.fromMoon : c.r);
      ctx.lineCap = 'round';
      for (let i = 1; i < tr.length; i++) {
        const a = at(tr[i - 1]), b = at(tr[i]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        ctx.globalAlpha = 0.5 * (1 - i / tr.length); ctx.lineWidth = W(3.5); ctx.strokeStyle = C.earth; ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      dot(at(tr[0]), small ? 3.4 : 5.5, C.ink, C.halo, small ? 1.3 : 2);
    }

    function drawAdd(st) {
      if (!st.hover || st.hover.type !== 'add' || small) return;
      const s = toScreen(st.hover.r);
      dot(s, 10, BG, C.burn, 2);
      ctx.beginPath(); ctx.moveTo(s[0] - 4.5, s[1]); ctx.lineTo(s[0] + 4.5, s[1]); ctx.moveTo(s[0], s[1] - 4.5); ctx.lineTo(s[0], s[1] + 4.5); ctx.stroke();
    }

    function drawBurns(st, scene) {
      const res = st.res, mine = (rb) => !rb.drop && !rb.unreachable && sceneOfBurn(rb) === scene;
      // Burns made at the Moon show as plain marks in the Journey picture, where they really happen.
      if (scene === 'journey') res.burns.forEach((rb, i) => { if (!rb.drop && !rb.unreachable && rb.body === 'moon') drawBurn(rb, i, st, 'far'); });
      const live = res.burns.filter(mine).map((rb) => toScreen(rb.r));
      // Where three or more burns share a spot, only the selected one shows its arrow.
      const crowded = (rb) => { const p = toScreen(rb.r); return live.filter((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 16).length >= 3; };
      // And burns crowding the selected one step back to plain numbers, so its arrow reads clearly.
      const chosen = res.burns[st.sel], cp = chosen && mine(chosen) ? toScreen(chosen.r) : null;
      const beside = (rb) => { if (!cp) return false; const p = toScreen(rb.r); return Math.hypot(p[0] - cp[0], p[1] - cp[1]) < 40; };
      res.burns.forEach((rb, i) => { if (mine(rb) && i !== st.sel) drawBurn(rb, i, st, crowded(rb) ? true : beside(rb) ? 'node' : false); });
      if (chosen && mine(chosen)) drawBurn(chosen, st.sel, st);
    }

    /* Is this place on the page already taken by one of this picture's burns? */
    function nearBurn(st, scene, p, reach) {
      const s = toScreen(p);
      return st.res.burns.some((rb) => {
        if (rb.drop || rb.unreachable || sceneOfBurn(rb) !== scene) return false;
        const g = burnGeometry(rb);
        return Math.hypot(g.p[0] - s[0], g.p[1] - s[1]) < reach || Math.hypot(g.tip[0] - s[0], g.tip[1] - s[1]) < reach;
      });
    }
    /* Labels for a closed orbit that the journey ends in. */
    const CAUTION = { crossing: 'crosses the Moon’s path', tugged: 'the Moon will reshape it', loose: 'Earth will distort it', barely: 'Earth will pull it away' };
    function orbitLabels(st, o, R, skipPeri, scene) {
      const speed = (r) => fmt.speed(Math.sqrt(o.mu * (2 / r - 1 / o.a)));
      const warn = st.res.caution && !st.mission.calm ? `  ·  ${CAUTION[st.res.caution]}` : '';
      if (o.e < J.ECC_APS) {
        // At the top of the picture, unless a burn is in the way there.
        let at = null;
        for (const d of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]]) { const p = X.stateAt(o, X.nuOfArg(o, X.argOf(o, d))).r; if (!at || !nearBurn(st, scene, p, 80)) at = p; if (!nearBurn(st, scene, p, 80)) break; }
        apsisLabel(at, `Circular  ${fmt.dist(o.a - R)}`, `${speed(o.a)}   period ${fmt.time(o.period)}${warn}`);
      } else {
        apsisLabel(X.stateAt(o, Math.PI).r, `Apoapsis  ${fmt.dist(o.ra - R)}`, speed(o.ra) + warn);
        if (!skipPeri) apsisLabel(X.stateAt(o, 0).r, `Periapsis  ${fmt.dist(o.rp - R)}`, speed(o.rp));
      }
    }

    /* What becomes of a path that runs off the edge of the Earth picture, in a line or two. */
    function fate(res) {
      const a = res.approach, first = res.legs[res.tail];
      if (!first || first.body !== 'earth') return null;
      if (first.end === 'soi-in' && a && a.entered) return [`Meets the Moon in ${fmt.time(a.t - first.t0)}`, a.dist < M.R ? 'and hits it' : `passing ${fmt.dist(a.dist - M.R)} above it`];
      if (first.end === 'escape') return ['Escapes Earth', res.vinf ? `v∞ ${fmt.speed(res.vinf)}` : ''];
      if (first.orbit.e < 1) return [`Apoapsis  ${fmt.dist(first.orbit.ra - RE)}`, a && !a.entered && a.dist < M.soi * 4 ? `the Moon passes ${fmt.dist(a.dist - M.R)} away` : `reached in ${fmt.time(first.orbit.period / 2)}`];
      return null;
    }

    /* ---------- Earth and Journey pictures: the same sky at two scales ---------- */
    function drawEarthFrame(st, scene) {
      const res = st.res, tg = st.mission.target, chk = st.chk || {}, journey = scene === 'journey', simT = st.simT || 0;
      const moonNow = L.moonAt(simT, res.moon0).r, a = res.approach;

      // The Moon's orbit, and the band a mission asks the path to reach
      if (journey || small) {
        ctx.setLineDash([1.5, 5]); ctx.lineCap = 'round';
        ring([0, 0, 0], M.a); ctx.strokeStyle = C.ink3; ctx.lineWidth = W(1.2); ctx.stroke();
        ctx.setLineDash([]); ctx.lineCap = 'butt';
      }
      if (tg && tg.apo && !tg.lunar) band([0, 0, 0], RE + tg.apo[0], RE + tg.apo[1], chk.ok, journey ? 'Apoapsis here' : '');
      if (journey && !small) {   // named wherever the ring is emptiest
        const busy = [moonNow].concat(a && !a.start ? [a.moon] : []).map((p) => Math.atan2(p[1], p[0]));
        if (res.status === 'orbit') { const p = X.stateAt(res.final, Math.PI).r; busy.push(Math.atan2(p[1], p[0])); }
        let at = 3.95, room = -1;
        for (const c of [3.95, 5.5, 0.75, 4.7, 0.1, 3.3]) { const d = Math.min(...busy.map((b) => Math.abs(X.wrapPi(b - c)))); if (d > room + 0.25) { room = d; at = c; } }
        const s = toScreen([M.a * Math.cos(at), M.a * Math.sin(at), 0]); text(`Moon’s orbit  ${fmt.dist(M.a)}`, s[0], s[1], { align: 'center', size: 12, color: C.ink3 });
      }

      // The Moon's sphere of influence travels with the Moon, so the craft crosses into it in step
      // with the Moon picture. The ring further on marks where the Moon will be at the closest point.
      const there = a && !a.start ? a.moon : null;
      if (M.soi * cam.scale > 7) {
        ctx.setLineDash([1.5, 4]); ctx.lineCap = 'round';
        ring(moonNow, M.soi); ctx.strokeStyle = C.ink3; ctx.lineWidth = W(1.1); ctx.stroke();
        ctx.setLineDash([]); ctx.lineCap = 'butt';
      }
      drawEarth(simT);
      if (journey && RE * cam.scale < 7) { const s = toScreen([0, 0, 0]); text('Earth', s[0], s[1] + 15, { align: 'center', size: 12, color: C.ink2 }); }

      drawLegs(st, 'earth');

      // The line between you and the Moon at your closest, when you miss
      if (there && !a.entered && (journey || small)) {
        const p = toScreen(a.r), q = toScreen(a.moon);
        ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.lineWidth = W(1.2); ctx.strokeStyle = C.ink2; ctx.stroke(); ctx.setLineDash([]);
        dot(p, W(3.5), BG, C.ink, W(2));
      }

      // The Moon: a ring for where it will be when you get there, a disc for where it is now
      const good = !!(tg && tg.pass && chk.passOk);
      if (there) {
        const s = drawMoon(there, true, good);
        if (journey && onScreen(s)) {
          const hit = a.entered && a.dist < M.R;
          const sub = !a.entered ? `${fmt.dist(a.dist - M.R)} ${Math.abs(a.lead) > 1 ? 'away' : a.lead > 0 ? 'ahead of you' : 'behind you'}` : hit ? 'your path hits it' : `you pass ${fmt.dist(a.dist - M.R)} above it`;
          label(s, [cam.cx, cam.cy], a.entered ? 'Moon when you arrive' : 'Moon when you get there', sub, good ? C['target-ink'] : hit ? C.alert : C.ink, 16);
        }
      }
      const now = drawMoon(moonNow, false);
      if (journey && onScreen(now) && (!there || Math.hypot(now[0] - toScreen(there)[0], now[1] - toScreen(there)[1]) > 46)) label(now, [cam.cx, cam.cy], 'Moon', '', C.ink2, 13);

      // Where the journey ends
      const last = res.legs[res.legs.length - 1], fo = res.final;
      if (res.status === 'orbit') orbitLabels(st, fo, RE, journey && fo.rp * cam.scale < 40, scene);
      else if (res.status === 'reentry') {
        const e = res.entry, hit = X.stateAt(fo, last.nu0 + last.sweep).r, s = toScreen(hit), wants = tg && tg.home;
        if (RE * cam.scale > 7) {
          dot(s, W(6), BG, chk.ok ? C.target : wants || !e ? C.alert : C.ink, W(2.5));
          if (e && e.speed > 9) {
            const steep = e.angle > J.CORRIDOR[1], shallow = e.angle < J.CORRIDOR[0];
            label(s, [cam.cx, cam.cy], `Entry interface  ${fmt.speed(e.speed)}`, `flight-path angle ${e.angle.toFixed(1)}° down: ${steep ? 'too steep' : shallow ? 'too shallow' : 'inside the corridor'}`, steep || shallow ? (wants ? C.alert : C.ink) : C['target-ink']);
          } else label(s, [cam.cx, cam.cy], 'Reentry', e ? `${fmt.speed(e.speed)}, flight-path angle ${e.angle.toFixed(1)}° down` : '', C.ink);
        }
      }
      if (journey && !small && gone) {
        if (gone.kind === 'escape') label(gone.at, [gone.at[0] - gone.dir[0] * 40, gone.at[1] - gone.dir[1] * 40], 'Escapes Earth', (res.rounded ? 'lunar gravity assist' : 'beyond its sphere of influence') + (res.vinf ? `, v∞ ${fmt.speed(res.vinf)}` : ''), C.ink, 16);
        else label(gone.at, [cam.cx, cam.cy], 'Meets the Moon again', `after ${fmt.time(last.dt)}: not predicted further`, C.ink, 14);
      }
      // Where a path that runs off the Earth picture is going
      if (!journey && !small) {
        const first = res.legs[res.tail], f = fate(res), edge = viewRadius() * 0.8;
        if (f && first.orbit.e > 0.05 && (first.orbit.e >= 1 || first.orbit.ra > edge * 1.2)) {
          // Keep it clear of the selected burn's arrow and its value.
          const chosen = res.burns[st.sel], keep = avoid;
          if (chosen && !chosen.drop && !chosen.unreachable && sceneOfBurn(chosen) === scene) {
            const g = burnGeometry(chosen);
            avoid = avoid.concat([[g.tip[0] - 95, g.tip[1] - 22, g.tip[0] + 95, g.tip[1] + 22]]);
            for (let k = 0; k <= 6; k++) { const q = [g.p[0] + (g.tip[0] - g.p[0]) * k / 6, g.p[1] + (g.tip[1] - g.p[1]) * k / 6]; avoid.push([q[0] - 14, q[1] - 14, q[0] + 14, q[1] + 14]); }
          }
          for (const share of [1, 0.8, 0.62, 0.48, 0.36]) {
            const nu = X.nuAtRadius(first.orbit, Math.max(edge * share, first.orbit.rp * 1.02));
            if (nu == null || nu <= X.wrapPi(first.nu0)) break;
            const s = toScreen(X.stateAt(first.orbit, nu).r);
            if (onScreen(s, -30) && label(s, [cam.cx, cam.cy], f[0], f[1], C.ink, 12, true)) break;
          }
          avoid = keep;
        }
      }

      drawAdd(st);
      drawBurns(st, scene);
      drawCraft(st, 'earth');
    }

    /* ---------- Moon picture: centred on the Moon and moving with it ---------- */
    function drawMoonFrame(st) {
      const res = st.res, tg = st.mission.target, chk = st.chk || {}, a = res.approach, simT = st.simT || 0, centre = [0, 0, 0];

      // Where the Moon's pull takes over
      ctx.setLineDash([1.5, 5]); ctx.lineCap = 'round';
      ring(centre, M.soi); ctx.strokeStyle = C.ink3; ctx.lineWidth = W(1.2); ctx.stroke();
      ctx.setLineDash([]); ctx.lineCap = 'butt';
      { const s = toScreen([M.soi * Math.cos(0.95), M.soi * Math.sin(0.95), 0]); if (onScreen(s)) text('Moon’s sphere of influence', s[0], s[1], { align: 'center', size: 12, color: C.ink3 }); }

      // Which way Earth is: at arrival, and turning slowly as days pass
      const tRef = a && !a.start ? (a.entered ? a.tIn : a.t) : 0, toEarth = X.unit(X.scale(L.moonAt(Math.max(simT, tRef), res.moon0).r, -1));
      {
        const rim = half() - (small ? 9 : 30), c = [cam.hx + toEarth[0] * rim, cam.hy - toEarth[1] * rim], d = [toEarth[0], -toEarth[1]], n = [-d[1], d[0]], k = small ? 4 : 6;
        ctx.beginPath(); ctx.moveTo(c[0] + d[0] * k, c[1] + d[1] * k); ctx.lineTo(c[0] - d[0] * k + n[0] * k * 0.8, c[1] - d[1] * k + n[1] * k * 0.8); ctx.lineTo(c[0] - d[0] * k - n[0] * k * 0.8, c[1] - d[1] * k - n[1] * k * 0.8); ctx.closePath();
        ctx.fillStyle = C.earth; ctx.fill();
        text('to Earth', c[0] - d[0] * 14 - (d[0] > 0.3 ? 0 : 0), c[1] - d[1] * 16, { align: d[0] > 0.4 ? 'right' : d[0] < -0.4 ? 'left' : 'center', size: 12, color: C.ink2 });
      }

      // What the mission asks for
      if (tg && tg.pass) {   // named on the side away from where the path comes closest
        const p = a && a.entered && a.orbit ? a.orbit.P : null;
        band(centre, M.R + tg.pass[0], M.R + tg.pass[1], chk.passOk, 'Pass through here', p ? Math.atan2(-p[1], -p[0]) : 0.62);
      }
      if (tg && tg.lunar && tg.apo) band(centre, M.R + tg.peri[0], M.R + tg.apo[1], chk.ok, 'Target');

      drawMoon(centre, false);
      drawLegs(st, 'moon');

      // The journey's end, if it is here
      const last = res.legs[res.legs.length - 1], fo = res.final;
      if (res.status === 'lunar') orbitLabels(st, fo, M.R, false, 'moon');
      else if (res.status === 'impact') {
        const s = toScreen(X.stateAt(fo, last.nu0 + last.sweep).r);
        dot(s, W(6), BG, C.alert, W(2.5));
        label(s, [cam.cx, cam.cy], 'Hits the Moon', fmt.speed(Math.sqrt(fo.mu * (2 / M.R - 1 / fo.a))), C.alert);
      }
      // A pass that is not the end: mark its closest point
      res.legs.forEach((l, i) => {
        if (i < res.tail || l.body !== 'moon' || l.end !== 'soi-out') return;
        const o = l.orbit, good = tg && tg.pass && chk.passOk;
        if (!nearBurn(st, 'moon', X.stateAt(o, 0).r, 24)) apsisLabel(X.stateAt(o, 0).r, `Closest approach  ${fmt.dist(o.rp - M.R)}`, fmt.speed(Math.sqrt(o.mu * (2 / o.rp - 1 / o.a))), good ? C['target-ink'] : C.ink);
      });
      if (a && !a.entered) {
        const p = X.sub(a.r, a.moon);
        apsisLabel(p, `Closest approach  ${fmt.dist(a.dist - M.R)}`, Math.abs(a.lead) > 1 ? '' : a.lead > 0 ? 'the Moon is ahead of you' : 'the Moon is behind you');
      }

      drawAdd(st);
      drawBurns(st, 'moon');
      drawCraft(st, 'moon');
    }

    function draw(st, scene) {
      avoid = st.avoid || [];
      ctx.clearRect(0, 0, cam.w, cam.h);
      ctx.fillStyle = BG; ctx.fillRect(0, 0, cam.w, cam.h);
      if (scene === 'moon') drawMoonFrame(st); else drawEarthFrame(st, scene);
    }

    return { resize, fit, ease, draw, zoomAt, panBy, resetZoom, isHome, middle, toScreen, flat, planeVector, planePoint, burnGeometry, arrowMap, viewRadius, cam, D0 };
  }

  G.Orbit.view = { create, sceneOfBurn, frameOf, NEAR };
})(globalThis);
