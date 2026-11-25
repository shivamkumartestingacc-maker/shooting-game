"use strict";
// =====================================================================
// WildKit: scenery for The Archer. A fixed path along +z through night
// woods, a meadow, the fort wall, the town, the palace court and halls,
// and back out. Scenery is coloured (dusk, then moonlight and torches)
// but never glows; only living things do. Everything is projected with
// the engine camera. Items carry 3D occluder primitives (cylinders,
// spheres, boxes) that arrows stick in and that hide you.
// World z is absolute metres along the path; view z = wz - S.D.
// =====================================================================
const WildKit = (() => {
  const NEAR = 0.5;
  const S = { D: 0, items: [], occ: [], pal: null, zones: [], sky: {} };
  let W, H, g;

  // ------------------------------------------------------------------ palettes
  const PAL = {
    dusk:  { top: [22, 28, 62], mid: [92, 58, 98], hor: [226, 122, 78], fog: [86, 70, 92], sun: 1, moon: 0, stars: 0.15, cloud: 0, light: [255, 170, 110] },
    twi:   { top: [14, 20, 48], mid: [52, 44, 84], hor: [150, 86, 84], fog: [52, 50, 74], sun: 0.4, moon: 0.5, stars: 0.5, cloud: 0.5, light: [200, 150, 140] },
    night: { top: [6, 9, 22], mid: [16, 24, 48], hor: [40, 52, 82], fog: [24, 30, 48], sun: 0, moon: 1, stars: 1, cloud: 1, light: [150, 170, 220] },
  };
  const mixPal = (a, b, k) => { const o = {}; for (const key in a) o[key] = Array.isArray(a[key]) ? lerp3(a[key], b[key], k) : lerp(a[key], b[key], k); return o; };
  function palAt(D) {
    if (D < 140) return PAL.dusk;
    if (D < 215) return mixPal(PAL.dusk, PAL.twi, smooth((D - 140) / 75));
    if (D < 260) return mixPal(PAL.twi, PAL.night, smooth((D - 215) / 45));
    return PAL.night;
  }
  // ground / walls tone per zone: [near colour, fog strength]
  const ZONE_GROUND = { forest: [22, 34, 22], meadow: [36, 50, 30], town: [40, 42, 48], court: [50, 50, 56], hall: [42, 32, 26] };
  const zoneAt = wz => { for (const z of S.zones) if (wz >= z[0] && wz < z[1]) return z[2]; return "forest"; };
  const indoor = wz => zoneAt(wz) === "hall";

  // fog: far things sink into the zone fog colour; indoors the fog is warm darkness
  function fogK(z) { return 1 - Math.exp(-Math.max(0, z) / (indoor(S.D + 1) ? 34 : 80)); }
  function tone(rgb, z, add = 0) {
    const f = fogK(z), fc = indoor(S.D + 1) ? [14, 10, 8] : S.pal.fog;
    return `rgb(${Math.round(lerp(rgb[0] + add, fc[0], f))},${Math.round(lerp(rgb[1] + add, fc[1], f))},${Math.round(lerp(rgb[2] + add, fc[2], f))})`;
  }
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // ------------------------------------------------------------------ 3D helpers
  const V = p => [p[0], p[1], p[2] - S.D];
  function clipZ(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ai = a[2] >= NEAR, bi = b[2] >= NEAR;
      if (ai) out.push(a);
      if (ai !== bi) { const k = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, NEAR]); }
    }
    return out;
  }
  // filled polygon from world points; returns the screen points (or null when behind us)
  function face(pts, fill, stroke, lw = 0.8) {
    const v = clipZ(pts.map(V)); if (v.length < 3) return null;
    const s = v.map(p => project(p[0], p[1], p[2]));
    g.beginPath(); g.moveTo(s[0][0], s[0][1]); for (let i = 1; i < s.length; i++) g.lineTo(s[i][0], s[i][1]); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
    return s;
  }
  function seg(a, b, col, lw = 0.8) {
    let p = V(a), q = V(b);
    if (p[2] < NEAR && q[2] < NEAR) return;
    if (p[2] < NEAR) { const k = (NEAR - p[2]) / (q[2] - p[2]); p = lerp3(p, q, k); p[2] = NEAR; }
    if (q[2] < NEAR) { const k = (NEAR - q[2]) / (p[2] - q[2]); q = lerp3(q, p, k); q[2] = NEAR; }
    const s = project(...p), e = project(...q);
    g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(e[0], e[1]); g.stroke();
  }
  // axis box; faces we can see, shaded: front, the side toward us, top if below the eye
  function box(x0, x1, y0, y1, z0, z1, rgb, o = {}) {
    const cx = cam.offX, cy = cam.camH, z = z0 - S.D;
    if (z1 - S.D < NEAR) return;
    if (cy > y1 && !o.noTop) face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], tone(rgb, z, 14));
    if (cx < x0) face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], tone(rgb, z, -10));
    if (cx > x1) face([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], tone(rgb, z, -10));
    if (cy < y0) face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], tone(rgb, z, -18));
    if (S.D < z0) face([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], tone(rgb, z), o.edge ? rgba([150, 160, 180], 0.12 * (1 - fogK(z))) : null);
  }
  const pk = (x, y, wz) => project(x, y, wz - S.D);

  // ------------------------------------------------------------------ world build
  // layout: { zones: [[from,to,type]], specials: [item...], end }
  function build(layout, seed = 7) {
    const r = mulberry(seed);
    S.zones = layout.zones; S.items = []; S.occ = [];
    const add = it => { S.items.push(it); if (it.occ) for (const o of it.occ) { o.item = it; S.occ.push(o); } return it; };
    S.add = add;
    const free = (x, wz, m) => !layout.specials.some(s => s.clear && wz > s.wz - s.clear[0] && wz < s.wz + s.clear[1] && Math.abs(x - (s.x || 0)) < (s.clear[2] || 3) + m);
    for (const [a, b, type] of layout.zones) {
      if (type === "forest" || type === "meadow") {
        const dense = type === "forest" ? 1 : 0.18;
        for (const side of [-1, 1]) for (let wz = a; wz < b; wz += (1.3 + r() * 1.6) / dense) {
          const x = side * (2.3 + Math.pow(r(), 1.4) * 30) + pathX(wz);
          if (!free(x, wz, 2)) continue;
          if (r() < 0.78) tree(add, x, wz, r); else pine(add, x, wz, r);
        }
        for (const side of [-1, 1]) for (let wz = a; wz < b; wz += 1.6 + r() * 2.8) {
          const x = side * (1.5 + Math.pow(r(), 1.6) * 16) + pathX(wz);
          if (free(x, wz, 1)) bush(add, x, wz, 0.5 + r() * 0.7, r);
        }
        for (let wz = a; wz < b; wz += 0.45 + r() * 0.5) {
          const x = (r() < 0.5 ? -1 : 1) * (0.9 + r() * 7) + pathX(wz);
          add({ type: "grass", ext: 0, x, wz, h: 0.25 + r() * 0.45 * (type === "meadow" ? 1.4 : 1), seed: (r() * 1e9) | 0 });
        }
        for (let wz = a + 4; wz < b; wz += 9 + r() * 14) {
          const x = (r() < 0.5 ? -1 : 1) * (3 + r() * 8) + pathX(wz);
          if (free(x, wz, 1)) r() < 0.5 ? add({ type: "rock", ext: 0.8, x, wz, rad: 0.3 + r() * 0.5, occ: [] }) : add({ type: "log", ext: 2.5, x, wz, len: 2 + r() * 2.5, yaw: (r() - 0.5) * 1.2, occ: [] });
        }
      }
      if (type === "meadow") for (const side of [-1, 1]) for (let wz = a + 6; wz < b - 8; wz += 2.6) add({ type: "post", ext: 0.2, x: side * 2.6, wz, occ: [{ k: "box", x0: side * 2.6 - 0.08, x1: side * 2.6 + 0.08, y0: 0, y1: 1.15, z0: wz - 0.08, z1: wz + 0.08 }] });
      if (type === "town") for (const side of [-1, 1]) {
        let wz = a;
        while (wz < b) {
          let len = 4.5 + r() * 5;
          const sp = layout.specials.find(s => s.type === "walkway" && s.side === side && s.wz + s.len > wz && s.wz < wz + len + 2);
          if (sp) { wz = sp.wz + sp.len; continue; }
          len = Math.min(len, b - wz); if (len < 2) break;
          house(add, side, wz, len, r);
          wz += len + (r() < 0.15 ? 2 + r() * 2 : 0);
        }
        for (let wz = a + 3; wz < b; wz += 6 + r() * 9) {
          const x = side * (3.7 + r() * 0.6);
          if (free(x, wz, 0.5)) r() < 0.5 ? barrel(add, x, wz) : crate(add, x, wz, r);
        }
        for (let wz = a + 5; wz < b; wz += 14) add({ type: "torch", ext: 0.3, x: side * 4.9, y: 2.6, wz, seed: (r() * 1e9) | 0 });
      }
      if (type === "court") {
        for (const side of [-1, 1]) {
          add({ type: "box", back: true, wz: a, x0: side > 0 ? 9 : -10, x1: side > 0 ? 10 : -9, y0: 0, y1: 7, z0: a, z1: b, rgb: [58, 58, 66], occ: [] });
          for (let wz = a + 2; wz < b - 1; wz += 4.5) pillar(add, side * 7, wz, 6.5, 0.38);
          add({ type: "roofline", back: true, side, x: side * 7, y: 6.5, wz: a, wz0: a, wz1: b });
        }
        for (let wz = a + 3; wz < b; wz += 14) add({ type: "torch", x: -6.6, y: 2.8, wz, seed: wz | 0 }), add({ type: "torch", x: 6.6, y: 2.8, wz: wz + 7, seed: wz | 1 });
      }
      if (type === "hall") {
        const wide = wz => wz < 424 ? 6 : 3;
        for (let wz = a; wz < b; wz += 1) {
          const w = wide(wz), h = w > 4 ? 9 : 4.6;
          for (const side of [-1, 1]) add({ type: "hallwall", back: true, side, x: side * w, h, wz, len: 1, occ: [{ k: "box", x0: side > 0 ? w : -w - 1, x1: side > 0 ? w + 1 : -w, y0: 0, y1: h, z0: wz, z1: wz + 1 }] });
          add({ type: "ceiling", back: true, w, h, wz, len: 1 });
        }
        for (let wz = a + 3; wz < 422; wz += 5) { pillar(add, -4, wz, 9, 0.42, [70, 56, 46]); pillar(add, 4, wz, 9, 0.42, [70, 56, 46]); }
        for (let wz = a + 5.5; wz < 422; wz += 10) for (const side of [-1, 1]) add({ type: "banner", x: side * 5.95, wz, side });
        for (let wz = a + 3; wz < 422; wz += 10) add({ type: "torch", x: -3.5, y: 2.9, wz, seed: wz | 0 }), add({ type: "torch", x: 3.5, y: 2.9, wz: wz + 5, seed: wz | 1 });
        for (let wz = 426; wz < b; wz += 7) add({ type: "torch", x: (wz % 2 ? 1 : -1) * 2.7, y: 2.4, wz, seed: wz | 0 });
      }
    }
    for (const s of layout.specials) special(add, s, r);
    S.items.sort((p, q) => q.wz - p.wz);
  }
  const pathX = wz => wz < 165 ? 0.6 * Math.sin(wz / 165 * Math.PI * 2) : 0;

  // ------------------------------------------------------------------ item makers
  function tree(add, x, wz, r) {
    const h = 6 + r() * 7, rad = 0.16 + r() * 0.2, blobs = [];
    const n = 5 + (r() * 5 | 0), cy = h * 0.72, spread = h * 0.24;
    for (let i = 0; i < n; i++) blobs.push({ dx: (r() - 0.5) * spread * 1.7, dy: cy + (r() - 0.3) * spread, dz: (r() - 0.5) * spread * 1.4, r: spread * (0.45 + r() * 0.45) });
    blobs.sort((a, b) => b.dz - a.dz);
    const lean = (r() - 0.5) * 0.4, br = [];
    for (let i = 0; i < 4; i++) br.push({ y: h * (0.35 + r() * 0.3), dx: (r() - 0.5) * spread * 2, dy: h * (0.12 + r() * 0.2) });
    add({ type: "tree", x, wz, h, rad, blobs, lean, br, hue: r(), ext: h * 0.32,
      occ: [{ k: "cyl", x, z: wz, r: rad, y0: 0, y1: h * 0.7 }, ...blobs.map(b => ({ k: "sph", x: x + b.dx, y: b.dy, z: wz + b.dz, r: b.r * 0.8 }))] });
  }
  function pine(add, x, wz, r) {
    const h = 8 + r() * 8, rad = 0.14 + r() * 0.12;
    add({ type: "pine", x, wz, h, rad, ext: h * 0.24, tiers: 4 + (r() * 3 | 0), w: h * (0.17 + r() * 0.06), occ: [{ k: "cyl", x, z: wz, r: rad, y0: 0, y1: h }, { k: "cyl", x, z: wz, r: h * 0.12, y0: h * 0.25, y1: h * 0.85 }] });
  }
  function bush(add, x, wz, s, r, o = {}) {
    const blobs = [];
    for (let i = 0; i < 5; i++) blobs.push({ dx: (r() - 0.5) * s * 1.8, dy: s * (0.45 + r() * 0.35), dz: (r() - 0.5) * s * 0.9, r: s * (0.45 + r() * 0.3) });
    blobs.sort((a, b) => b.dz - a.dz);
    return add(Object.assign({ type: "bush", x, wz, s, ext: s * 1.4, blobs, hue: r(), occ: blobs.map(b => ({ k: "sph", x: x + b.dx, y: b.dy, z: wz + b.dz, r: b.r })) }, o));
  }
  function house(add, side, wz, len, r) {
    const X = side * 5, h = 4.5 + r() * 4.5, deep = 7, timber = r() < 0.6;
    const wins = [];
    for (let fy = 1.4; fy < h - 0.8; fy += 2.2) for (let fz = 0.9; fz < len - 0.8; fz += 1.8 + r() * 0.6) if (r() < 0.55) wins.push({ y: fy, z: fz, lit: r() < 0.32, w: 0.6 + r() * 0.3 });
    add({ type: "house", back: true, side, X, wz, len, h, deep, timber, roof: 1.6 + r() * 1.8, rgb: timber ? [70, 62, 54] : [62, 64, 72], wins, door: r() < 0.6 ? 0.6 + r() * (len - 2) : -1,
      occ: [{ k: "box", x0: side > 0 ? X : X - deep, x1: side > 0 ? X + deep : X, y0: 0, y1: h, z0: wz, z1: wz + len }] });
  }
  function barrel(add, x, wz) { add({ type: "barrel", ext: 0.4, x, wz, occ: [{ k: "cyl", x, z: wz, r: 0.36, y0: 0, y1: 0.95 }] }); }
  function crate(add, x, wz, r) { const s = 0.5 + r() * 0.3; add({ type: "box", wz: wz - s, x0: x - s, x1: x + s, y0: 0, y1: s * 1.6, z0: wz - s, z1: wz + s, rgb: [64, 50, 36], plank: true, occ: [{ k: "box", x0: x - s, x1: x + s, y0: 0, y1: s * 1.6, z0: wz - s, z1: wz + s }] }); }
  function pillar(add, x, wz, h, rad, rgb = [74, 74, 82]) { add({ type: "pillar", ext: rad * 1.4, x, wz, h, rad, rgb, occ: [{ k: "cyl", x, z: wz, r: rad, y0: 0, y1: h }] }); }

  function special(add, s, r) {
    if (s.type === "wall") return add(wallItem(s));
    if (s.type === "bush") return bush(add, s.x, s.wz, s.s || 0.9, r, { hide: s.hide });
    if (s.type === "tree") return tree(add, s.x, s.wz, r);
    if (s.type === "cart") return add({ type: "cart", ext: 1.4, x: s.x, wz: s.wz, hide: s.hide, occ: [{ k: "box", x0: s.x - 1.1, x1: s.x + 1.1, y0: 0.45, y1: 1.05, z0: s.wz - 0.7, z1: s.wz + 0.7 }] });
    if (s.type === "pillar") return pillar(add, s.x, s.wz, s.h || 9, s.rad || 0.55, s.rgb || [70, 56, 46]), Object.assign(S.items[S.items.length - 1], { hide: s.hide });
    if (s.type === "barrel") return barrel(add, s.x, s.wz);
    if (s.type === "box") return add({ type: "box", wz: s.z0, x0: s.x0, x1: s.x1, y0: 0, y1: s.y1, z0: s.z0, z1: s.z1, rgb: s.rgb || [66, 62, 60], occ: [{ k: "box", x0: s.x0, x1: s.x1, y0: 0, y1: s.y1, z0: s.z0, z1: s.z1 }] });
    if (s.type === "torch") return add({ type: "torch", ext: 0.3, x: s.x, y: s.y || 2.6, wz: s.wz, seed: (r() * 1e9) | 0 });
    if (s.type === "stall") return add({ type: "stall", ext: 1.3, x: s.x, wz: s.wz, side: Math.sign(s.x), occ: [{ k: "box", x0: s.x - 1, x1: s.x + 1, y0: 0, y1: 1, z0: s.wz - 0.8, z1: s.wz + 0.8 }] });
    if (s.type === "pedestal") return add({ type: "pedestal", ext: 0.5, x: s.x, wz: s.wz, scroll: s.scroll, occ: [{ k: "box", x0: s.x - 0.35, x1: s.x + 0.35, y0: 0, y1: 1.05, z0: s.wz - 0.35, z1: s.wz + 0.35 }] });
    if (s.type === "throne") return add({ type: "throne", ext: 1, x: s.x, wz: s.wz, occ: [{ k: "box", x0: s.x - 0.8, x1: s.x + 0.8, y0: 0, y1: 2.6, z0: s.wz - 0.4, z1: s.wz + 0.6 }] });
    if (s.type === "walkway") return add({ type: "walkway", back: true, side: s.side, wz: s.wz, wz0: s.wz, wz1: s.wz + s.len, h: s.h, occ: [{ k: "box", x0: s.side > 0 ? 4.6 : -6.6, x1: s.side > 0 ? 6.6 : -4.6, y0: 0, y1: s.h, z0: s.wz, z1: s.wz + s.len }] });
  }
  // a wall across the path: thick, crenellated, a gate opening, towers
  function wallItem(s) {
    const o = Object.assign({ h: 9, thick: 2.5, gate: [4.4, 5.5], towers: [], span: 70, rgb: [70, 68, 74] }, s);
    const [gw, gh] = o.gate, z0 = o.wz, z1 = o.wz + o.thick;
    o.occ = [{ k: "box", x0: -o.span, x1: -gw / 2, y0: 0, y1: o.h, z0, z1 }, { k: "box", x0: gw / 2, x1: o.span, y0: 0, y1: o.h, z0, z1 }, { k: "box", x0: -gw / 2, x1: gw / 2, y0: gh, y1: o.h, z0, z1 }];
    for (const tx of o.towers) o.occ.push({ k: "box", x0: tx - 2, x1: tx + 2, y0: 0, y1: o.h + 4, z0: z0 - 1.5, z1: z1 + 1 });
    return o;
  }

  // ------------------------------------------------------------------ resize: sky layers
  function resize() {
    W = E.W; H = E.H; g = sctx;
    const hor = cam.hor;
    S.sky.clouds = {};
    for (const [name, lit, body, shade] of [["dusk", [246, 172, 122], [150, 92, 118], [70, 52, 88]], ["night", [150, 166, 200], [70, 84, 116], [34, 42, 66]]]) {
      const c = mk(W * 1.6, hor), x = c.getContext("2d"), r = mulberry(31);
      for (let k = 0; k < 9; k++) {
        const cx = r() * c.width, cy = hor * (0.15 + r() * 0.55), sz = H * (0.04 + r() * 0.07), puffs = [];
        for (let i = 0; i < 26; i++) { const a = r() * Math.PI, d = r(); puffs.push([cx + Math.cos(a) * sz * 2.6 * d * (r() < 0.5 ? -1 : 1), cy - Math.sin(a) * sz * 1.1 * d, sz * (0.35 + r() * 0.55)]); }
        x.fillStyle = rgba(shade, 0.9); for (const [px, py, pr] of puffs) { x.beginPath(); x.arc(px, py + pr * 0.35, pr, 0, 7); x.fill(); }
        x.fillStyle = rgba(body, 0.95); for (const [px, py, pr] of puffs) { x.beginPath(); x.arc(px, py, pr * 0.9, 0, 7); x.fill(); }
        x.fillStyle = rgba(lit, 0.85); for (const [px, py, pr] of puffs) { x.beginPath(); x.arc(px - pr * 0.25, py - pr * 0.35, pr * 0.55, 0, 7); x.fill(); }
      }
      S.sky.clouds[name] = c;
    }
    // far treeline and the town skyline (towers, spires, the palace keep)
    const tl = mk(W * 1.6, H * 0.3), tx = tl.getContext("2d"), r = mulberry(5);
    tx.fillStyle = "#fff";
    for (let x = 0; x < tl.width; x += 3) { const h = tl.height * (0.25 + 0.35 * r() + 0.2 * Math.sin(x * 0.02)); tx.beginPath(); tx.arc(x, tl.height - h + 6, 6 + r() * 8, 0, 7); tx.fill(); tx.fillRect(x - 3, tl.height - h + 6, 7, h); }
    S.sky.treeline = tl;
    const sk = mk(W * 1.6, H * 0.45), sx = sk.getContext("2d"), r2 = mulberry(11), B = sk.height;
    sx.fillStyle = "#fff";
    for (let x = 0; x < sk.width; x += 10 + r2() * 30) { const w = 14 + r2() * 30, h = B * (0.12 + r2() * 0.18); sx.fillRect(x, B - h, w, h); sx.beginPath(); sx.moveTo(x - 3, B - h); sx.lineTo(x + w / 2, B - h - w * 0.6); sx.lineTo(x + w + 3, B - h); sx.fill(); }
    const kx = sk.width * 0.5;                    // the palace keep, dead ahead
    sx.fillRect(kx - 70, B * 0.35, 140, B); sx.fillRect(kx - 22, B * 0.12, 44, B);
    for (const dx of [-95, 95]) { sx.fillRect(kx + dx - 14, B * 0.25, 28, B); sx.beginPath(); sx.moveTo(kx + dx - 18, B * 0.25); sx.lineTo(kx + dx, B * 0.06); sx.lineTo(kx + dx + 18, B * 0.25); sx.fill(); }
    sx.beginPath(); sx.moveTo(kx - 26, B * 0.12); sx.lineTo(kx, -2); sx.lineTo(kx + 26, B * 0.12); sx.fill();
    S.sky.skyline = sk;
    const r3 = mulberry(3); S.sky.stars = Array.from({ length: 140 }, () => [r3(), r3() * 0.9, 0.5 + r3() * 1.2, r3() * 6]);
  }

  // ------------------------------------------------------------------ draw
  function tint(cv, rgb, a, x, y, w, h) {            // draw a white mask canvas in one colour
    const c = S.sky.tmp || (S.sky.tmp = mk(1, 1));
    if (c.width !== cv.width || c.height !== cv.height) { c.width = cv.width; c.height = cv.height; }
    const cx = c.getContext("2d"); cx.globalCompositeOperation = "copy"; cx.drawImage(cv, 0, 0);
    cx.globalCompositeOperation = "source-in"; cx.fillStyle = rgba(rgb, 1); cx.fillRect(0, 0, c.width, c.height);
    g.globalAlpha = a; g.drawImage(c, x, y, w, h); g.globalAlpha = 1;
  }
  function sky(t) {
    const p = S.pal, hor = cam.hor, gr = g.createLinearGradient(0, 0, 0, hor + 2);
    gr.addColorStop(0, rgba(p.top, 1)); gr.addColorStop(0.55, rgba(p.mid, 1)); gr.addColorStop(1, rgba(p.hor, 1));
    g.fillStyle = gr; g.fillRect(0, 0, W, hor + 2);
    for (const [u, v, s, ph] of S.sky.stars) { const a = p.stars * (0.4 + 0.6 * Math.sin(t * 1.3 + ph * 9)) * (1 - v); if (a > 0.05) { g.fillStyle = `rgba(230,235,255,${a})`; g.fillRect(u * W, v * hor, s, s); } }
    if (p.sun > 0.02) {                                // low sun behind the woods
      const sx = W * 0.3, sy = hor * 0.92, sg = g.createRadialGradient(sx, sy, 0, sx, sy, H * 0.5);
      sg.addColorStop(0, `rgba(255,214,140,${0.75 * p.sun})`); sg.addColorStop(0.12, `rgba(255,150,80,${0.45 * p.sun})`); sg.addColorStop(1, "rgba(255,120,60,0)");
      g.fillStyle = sg; g.fillRect(0, 0, W, hor + 2);
      g.fillStyle = `rgba(255,226,170,${p.sun})`; g.beginPath(); g.arc(sx, sy, H * 0.045, 0, 7); g.fill();
    }
    if (p.moon > 0.02) {
      const mx = W * 0.72, my = hor * 0.28, mg = g.createRadialGradient(mx, my, 0, mx, my, H * 0.25);
      mg.addColorStop(0, `rgba(200,215,255,${0.35 * p.moon})`); mg.addColorStop(1, "rgba(200,215,255,0)");
      g.fillStyle = mg; g.fillRect(mx - H * 0.25, my - H * 0.25, H * 0.5, H * 0.5);
      g.fillStyle = `rgba(232,236,248,${p.moon})`; g.beginPath(); g.arc(mx, my, H * 0.035, 0, 7); g.fill();
      g.fillStyle = `rgba(170,180,205,${0.5 * p.moon})`; g.beginPath(); g.arc(mx + H * 0.01, my - H * 0.006, H * 0.009, 0, 7); g.arc(mx - H * 0.012, my + H * 0.01, H * 0.006, 0, 7); g.fill();
    }
    const drift = (t * 3 + S.D * 0.4) % (W * 1.6), cw = W * 1.6, cl = S.sky.clouds;
    for (const [c, a] of [[cl.dusk, 1 - p.cloud], [cl.night, p.cloud]]) if (a > 0.02) {
      g.globalAlpha = a * 0.9; g.drawImage(c, -drift, 0); g.drawImage(c, cw - drift, 0); g.globalAlpha = 1;
    }
    const D = S.D, skyline = clamp((D - 120) / 60, 0, 1) * (zoneAt(D + 2) === "forest" ? 0.3 : 1);
    if (skyline > 0.02) tint(S.sky.skyline, lerp3(p.fog, [8, 10, 18], 0.55), skyline, -W * 0.3 - cam.offX * 4, hor - S.sky.skyline.height + 2, S.sky.skyline.width, S.sky.skyline.height);
    const trees = zoneAt(D + 40) === "forest" || zoneAt(D + 80) === "forest" || zoneAt(D + 2) === "forest" ? 1 : 0.5;
    tint(S.sky.treeline, lerp3(p.fog, [10, 14, 14], 0.5), trees, -W * 0.3 - cam.offX * 6, hor - S.sky.treeline.height + 3, S.sky.treeline.width, S.sky.treeline.height);
  }
  // ground per zone, far to near, as strips with a fog gradient
  function ground() {
    const D = S.D, hor = cam.hor;
    g.fillStyle = rgba(S.pal.fog, 1); g.fillRect(0, hor, W, H - hor);
    const marks = [];
    for (const [a, b, type] of S.zones) { const z0 = Math.max(a, D + NEAR), z1 = Math.min(b, D + 160); if (z1 > z0) marks.push([z0, z1, type]); }
    for (const [z0, z1, type] of marks.reverse()) {
      const col = ZONE_GROUND[type], f = face([[-90, 0, z0], [90, 0, z0], [90, 0, z1], [-90, 0, z1]], "#000");
      if (!f) continue;
      const yN = pk(0, 0, z0)[1], yF = pk(0, 0, z1)[1], gr = g.createLinearGradient(0, yF, 0, yN);
      // fog follows depth, screen y follows 1/depth: place stops at real depths
      for (const zz of [z1 - D, 96, 64, 40, 24, 14, 8, 4, 2, z0 - D]) if (zz <= z1 - D && zz >= z0 - D) gr.addColorStop(clamp((pk(0, 0, zz + D)[1] - yF) / ((yN - yF) || 1), 0, 1), tone(col, zz, zz < 3 ? -6 : 0));
      g.fillStyle = gr; g.fill();
      if (type === "forest" || type === "meadow") {     // the trail
        const pts = []; for (let wz = z0; wz <= z1 + 0.01; wz += Math.max(0.5, (wz - D) * 0.2)) pts.push(wz);
        g.beginPath();
        const L = pts.map(wz => pk(pathX(wz) - 0.75 - (wz - D) * 0.004, 0.003, wz)), R = pts.map(wz => pk(pathX(wz) + 0.75 + (wz - D) * 0.004, 0.003, wz));
        g.moveTo(L[0][0], L[0][1]); for (const p of L) g.lineTo(p[0], p[1]); for (const p of R.reverse()) g.lineTo(p[0], p[1]); g.closePath();
        const tg = g.createLinearGradient(0, yF, 0, yN); for (const zz of [z1 - D, 64, 32, 16, 8, 4, z0 - D]) if (zz <= z1 - D && zz >= z0 - D) tg.addColorStop(clamp((pk(0, 0, zz + D)[1] - yF) / ((yN - yF) || 1), 0, 1), tone([66, 52, 40], zz));
        g.fillStyle = tg; g.fill();
      } else {                                           // cobbles / flags: joint lines near us
        const step = type === "hall" ? 1.2 : type === "court" ? 1.5 : 0.6, lim = Math.min(z1, D + 30);
        for (let wz = Math.ceil(z0 / step) * step; wz < lim; wz += step) seg([-12, 0, wz], [12, 0, wz], `rgba(10,10,14,${0.35 * (1 - fogK(wz - D))})`, 0.7);
        if (type !== "town") for (let x = -9; x <= 9; x += step * 1.5) seg([x, 0, z0], [x, 0, lim], `rgba(10,10,14,${0.25})`, 0.6);
        if (type === "hall") face([[-1.1, 0.004, z0], [1.1, 0.004, z0], [1.1, 0.004, Math.min(z1, 423)], [-1.1, 0.004, Math.min(z1, 423)]], tone([92, 22, 26], 6));
      }
    }
  }

  // world items far to near. flush(z) is called before drawing anything at view z so
  // the level can draw the living things that stand behind it (they then get covered).
  function draw(t, flush, extra = []) {
    S.pal = palAt(S.D);
    sky(t); ground();
    const lo = S.D + 0.3, hi = S.D + 150;
    const vis = S.items.filter(it => (it.wz1 ?? it.wz + (it.len || it.thick || 0)) > lo && it.wz < hi);
    // painter's order. Long side planes (house fronts, hall walls, ceilings) sort by their far end and
    // never cover the living (they stand on the inner side); walls across the path sort by their back face.
    const key = it => it.back ? (it.wz1 ?? it.z1 ?? it.wz + (it.len || 0)) : it.type === "wall" ? it.wz + it.thick : it.wz;
    for (const it of vis.concat(extra).map(it => [key(it), it]).sort((a, b) => b[0] - a[0])) {
      if (!it[1].back) flush(Math.max(0.001, it[0] - S.D), it[1]);
      it[1].fn ? it[1].fn() : drawItem(it[1], t);
    }
    flush(-1);
  }

  function drawItem(it, t) {
    const z = it.wz - S.D, k = 1 - fogK(z);
    switch (it.type) {
      case "tree": {
        if (z < 0.3) return;
        const [bx, by, kk] = pk(it.x, 0, it.wz), [tx, ty] = pk(it.x + it.lean, it.h * 0.72, it.wz), r = it.rad * kk;
        const bark = tone([38, 34, 30], z);
        g.fillStyle = bark; g.beginPath(); g.moveTo(bx - r, by); g.lineTo(tx - r * 0.5, ty); g.lineTo(tx + r * 0.5, ty); g.lineTo(bx + r, by); g.closePath(); g.fill();
        g.fillStyle = tone([96, 72, 50], z); g.fillRect(bx - r, ty, Math.max(1, r * 0.35), by - ty);     // sunlit edge of the bark
        g.strokeStyle = bark; g.lineCap = "round";
        for (const b of it.br) { const [ax, ay] = pk(it.x + it.lean * b.y / it.h, b.y, it.wz), [cx, cy] = pk(it.x + b.dx, b.y + b.dy, it.wz); g.lineWidth = Math.max(0.8, r * 0.5); g.beginPath(); g.moveTo(ax, ay); g.lineTo(cx, cy); g.stroke(); }
        const night = S.pal.cloud, base = lerp3([30, 52, 30], [20, 34, 40], night), lit = lerp3([150, 132, 60], [70, 100, 120], night);
        for (const b of it.blobs) {
          const [cx, cy, kb] = pk(it.x + b.dx, b.dy, it.wz + b.dz), rr = b.r * kb;
          if (rr < 0.6) continue;
          g.fillStyle = tone(lerp3(base, [12, 20, 16], 0.5), z); g.beginPath(); g.arc(cx + rr * 0.12, cy + rr * 0.18, rr, 0, 7); g.fill();
          g.fillStyle = tone(lerp3(base, [40, 64, 26], it.hue * 0.6), z); g.beginPath(); g.arc(cx, cy, rr * 0.88, 0, 7); g.fill();
          g.fillStyle = tone(lit, z); g.globalAlpha = 0.55 * k; g.beginPath(); g.arc(cx - rr * 0.35, cy - rr * 0.38, rr * 0.45, 0, 7); g.fill(); g.globalAlpha = 1;
        }
        return;
      }
      case "pine": {
        if (z < 0.3) return;
        const [bx, by, kk] = pk(it.x, 0, it.wz), [, ty] = pk(it.x, it.h, it.wz), r = it.rad * kk, w = it.w * kk;
        g.fillStyle = tone([34, 30, 28], z); g.fillRect(bx - r, ty + (by - ty) * 0.3, r * 2, (by - ty) * 0.7);
        const night = S.pal.cloud;
        for (let i = 0; i < it.tiers; i++) {
          const u = i / it.tiers, y0 = ty + (by - ty) * (0.12 + u * 0.68), y1 = y0 + (by - ty) * 0.3, ww = w * (0.35 + u * 0.75);
          g.fillStyle = tone(lerp3([24, 44, 34], [18, 30, 38], night), z); g.beginPath(); g.moveTo(bx, y0 - (by - ty) * 0.06); g.lineTo(bx + ww, y1); g.lineTo(bx - ww, y1); g.closePath(); g.fill();
          g.fillStyle = tone(lerp3([110, 110, 60], [60, 90, 110], night), z); g.globalAlpha = 0.4 * k;
          g.beginPath(); g.moveTo(bx, y0 - (by - ty) * 0.06); g.lineTo(bx - ww * 0.15, y1 - (y1 - y0) * 0.3); g.lineTo(bx - ww, y1); g.closePath(); g.fill(); g.globalAlpha = 1;
        }
        return;
      }
      case "bush": {
        if (z < 0.2) return;
        const night = S.pal.cloud, base = lerp3([28, 46, 26], [18, 30, 34], night);
        for (const b of it.blobs) {
          const p = V([it.x + b.dx, b.dy, it.wz + b.dz]); if (p[2] < NEAR) continue;
          const [cx, cy, kb] = project(...p), rr = b.r * kb;
          g.fillStyle = tone([12, 18, 14], z); g.beginPath(); g.arc(cx, cy + rr * 0.15, rr, 0, 7); g.fill();
          g.fillStyle = tone(lerp3(base, [44, 62, 24], it.hue * 0.5), z); g.beginPath(); g.arc(cx, cy, rr * 0.86, 0, 7); g.fill();
          g.globalAlpha = 0.45 * k; g.fillStyle = tone(lerp3([120, 120, 56], [60, 90, 110], night), z); g.beginPath(); g.arc(cx - rr * 0.3, cy - rr * 0.35, rr * 0.4, 0, 7); g.fill(); g.globalAlpha = 1;
          if (it.hide && z < 4) {                          // leaves at the edge of your hide
            const rs = mulberry(it.wz * 100 | 0); g.fillStyle = tone([16, 26, 18], z);
            for (let i = 0; i < 26; i++) { const a = rs() * 6.283, d = rr * (0.7 + rs() * 0.35); g.beginPath(); g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr * 0.14, rr * 0.06, a, 0, 7); g.fill(); }
          }
        }
        return;
      }
      case "grass": {
        if (z < 0.6 || z > 45) return;
        const [x, y, kk] = pk(it.x, 0, it.wz), h = it.h * kk, rs = mulberry(it.seed);
        g.strokeStyle = tone(lerp3([46, 64, 32], [30, 44, 46], S.pal.cloud), z); g.lineWidth = Math.max(0.6, kk * 0.02);
        g.beginPath(); for (let i = 0; i < 5; i++) { const dx = (rs() - 0.5) * h * 0.6; g.moveTo(x + dx, y); g.quadraticCurveTo(x + dx, y - h * 0.6, x + dx + (rs() - 0.5) * h * 0.8, y - h * (0.6 + rs() * 0.4)); } g.stroke();
        return;
      }
      case "rock": { if (z < 0.6) return; const [x, y, kk] = pk(it.x, 0, it.wz), r = it.rad * kk; g.fillStyle = tone([52, 52, 56], z); g.beginPath(); g.ellipse(x, y - r * 0.4, r, r * 0.6, 0, Math.PI, 0); g.fill(); g.fillStyle = tone([90, 86, 80], z); g.fillRect(x - r * 0.6, y - r * 0.9, r * 0.6, Math.max(1, r * 0.12)); return; }
      case "log": {
        const c = Math.cos(it.yaw) * it.len / 2, s = Math.sin(it.yaw) * it.len / 2;
        face([[it.x - c, 0, it.wz - s], [it.x + c, 0, it.wz + s], [it.x + c, 0.35, it.wz + s], [it.x - c, 0.35, it.wz - s]], tone([46, 38, 30], z), tone([90, 74, 54], z));
        return;
      }
      case "post": box(it.x - 0.08, it.x + 0.08, 0, 1.15, it.wz - 0.08, it.wz + 0.08, [70, 58, 44]); seg([it.x, 0.55, it.wz], [it.x, 0.55, it.wz + 2.6], tone([84, 70, 52], z), Math.max(0.8, project(0, 0, Math.max(z, NEAR))[2] * 0.05)); seg([it.x, 0.95, it.wz], [it.x, 0.95, it.wz + 2.6], tone([84, 70, 52], z), Math.max(0.8, project(0, 0, Math.max(z, NEAR))[2] * 0.05)); return;
      case "house": return drawHouse(it, z);
      case "barrel": {
        if (z < 0.4) return;
        const [x, y, kk] = pk(it.x, 0, it.wz), r = 0.36 * kk, h = 0.95 * kk;
        g.fillStyle = tone([62, 46, 32], z); g.beginPath(); g.roundRect(x - r, y - h, r * 2, h, r * 0.3); g.fill();
        g.fillStyle = tone([30, 26, 24], z); g.fillRect(x - r, y - h * 0.8, r * 2, Math.max(1, h * 0.06)); g.fillRect(x - r, y - h * 0.25, r * 2, Math.max(1, h * 0.06));
        g.fillStyle = tone([110, 84, 56], z); g.fillRect(x - r * 0.75, y - h, r * 0.25, h);
        return;
      }
      case "box": box(it.x0, it.x1, it.y0, it.y1, it.z0 ?? it.wz, it.z1 ?? it.wz, it.rgb, { edge: true }); if (it.plank && z > NEAR) { seg([it.x0, (it.y0 + it.y1) / 2, it.z0], [it.x1, (it.y0 + it.y1) / 2, it.z0], tone([30, 24, 18], z)); } return;
      case "pillar": {
        if (z < 0.4) return;
        const [x, y, kk] = pk(it.x, 0, it.wz), [, ty] = pk(it.x, it.h, it.wz), r = it.rad * kk;
        g.fillStyle = tone(it.rgb, z); g.fillRect(x - r, ty, r * 2, y - ty);
        g.fillStyle = tone(it.rgb, z, 30); g.fillRect(x - r * (it.x > cam.offX ? 1 : -0.55), ty, r * 0.45, y - ty);
        g.fillStyle = tone(it.rgb, z, -14); g.fillRect(x - r * 1.35, ty, r * 2.7, r * 0.7); g.fillRect(x - r * 1.35, y - r * 0.7, r * 2.7, r * 0.7);
        return;
      }
      case "roofline": { const X = it.x; face([[X, it.y, it.wz0], [X, it.y, it.wz1], [X + it.side * 3, it.y + 1.4, it.wz1], [X + it.side * 3, it.y + 1.4, it.wz0]], tone([40, 34, 36], 10)); face([[X, it.y - 0.6, it.wz0], [X, it.y - 0.6, it.wz1], [X, it.y, it.wz1], [X, it.y, it.wz0]], tone([66, 66, 74], 10)); return; }
      case "hallwall": {
        const X = it.x, gx = it.side > 0 ? X : X;
        face([[gx, 0, it.wz], [gx, 0, it.wz + it.len + 0.02], [gx, it.h, it.wz + it.len + 0.02], [gx, it.h, it.wz]], tone([66, 50, 40], z, it.wz % 2 ? 0 : -4));
        if (z > NEAR && z < 30) for (let y = 0.6; y < it.h; y += 0.6) seg([gx, y, it.wz], [gx, y, it.wz + it.len], `rgba(20,14,10,${0.35 * k})`, 0.6);
        return;
      }
      case "ceiling": face([[-it.w, it.h, it.wz], [it.w, it.h, it.wz], [it.w, it.h, it.wz + it.len + 0.02], [-it.w, it.h, it.wz + it.len + 0.02]], tone([26, 18, 14], z, (it.wz | 0) % 5 === 0 ? 10 : 0)); return;
      case "banner": {
        const X = it.x, d = -it.side * 0.02;
        face([[X + d, 7.6, it.wz - 0.6], [X + d, 7.6, it.wz + 0.6], [X + d, 3.6, it.wz + 0.6], [X + d, 3.1, it.wz], [X + d, 3.6, it.wz - 0.6]], tone([110, 22, 28], z), tone([190, 150, 70], z), 1);
        face([[X + d * 2, 6.4, it.wz - 0.22], [X + d * 2, 6.4, it.wz + 0.22], [X + d * 2, 5.6, it.wz + 0.22], [X + d * 2, 5.6, it.wz - 0.22]], tone([190, 150, 70], z));
        return;
      }
      case "torch": return drawTorch(it, z, t);
      case "wall": return drawWall(it, z);
      case "walkway": {
        const X0 = it.side > 0 ? 4.6 : -4.6;
        const XB = X0 + it.side * 2;                       // the town wall behind the walk, rising above it
        face([[XB, it.h, it.wz0], [XB, it.h, it.wz1], [XB, it.h + 3.2, it.wz1], [XB, it.h + 3.2, it.wz0]], tone([58, 56, 64], it.wz0 - S.D + 4));
        if (S.D < it.wz0) face([[X0, 0, it.wz0], [XB, 0, it.wz0], [XB, it.h + 3.2, it.wz0], [X0, it.h, it.wz0]], tone([60, 58, 66], it.wz0 - S.D, -10));
        face([[X0, 0, it.wz0], [X0, 0, it.wz1], [X0, it.h, it.wz1], [X0, it.h, it.wz0]], tone([70, 68, 76], it.wz0 - S.D + 4));
        for (let wz = it.wz0; wz < it.wz1; wz += 1.2) box(X0 - it.side * 0.0 - 0.25, X0 + 0.25, it.h, it.h + 0.9, wz, wz + 0.6, [78, 76, 84]);
        if (it.wz0 - S.D < 40) for (let y = 0.6; y < it.h; y += 0.6) seg([X0, y, Math.max(it.wz0, S.D + NEAR)], [X0, y, it.wz1], "rgba(12,12,16,0.3)", 0.6);
        return;
      }
      case "cart": {
        box(it.x - 1.1, it.x + 1.1, 0.45, 1.05, it.wz - 0.7, it.wz + 0.7, [76, 58, 40], { edge: true });
        if (z > NEAR) for (const s of [-1, 1]) { const [x, y, kk] = pk(it.x + s * 1.15, 0.45, it.wz - 0.3); g.strokeStyle = tone([40, 30, 22], z); g.lineWidth = Math.max(1, 0.07 * kk); g.beginPath(); g.arc(x, y, 0.45 * kk, 0, 7); g.stroke(); g.beginPath(); g.moveTo(x - 0.45 * kk, y); g.lineTo(x + 0.45 * kk, y); g.moveTo(x, y - 0.45 * kk); g.lineTo(x, y + 0.45 * kk); g.stroke(); }
        if (z > NEAR) for (let i = 0; i < 4; i++) seg([it.x - 1.1, 0.6 + i * 0.15, it.wz - 0.7], [it.x + 1.1, 0.6 + i * 0.15, it.wz - 0.7], tone([40, 30, 22], z), Math.max(0.8, 2 / Math.max(z, 0.5)));
        return;
      }
      case "stall": {
        box(it.x - 1, it.x + 1, 0, 1, it.wz - 0.8, it.wz + 0.8, [70, 52, 36]);
        face([[it.x - 1.2, 2.3, it.wz - 1], [it.x + 1.2, 2.3, it.wz - 1], [it.x + 1.2, 2.0, it.wz + 1], [it.x - 1.2, 2.0, it.wz + 1]], tone([120, 40, 36], z));
        for (let i = 0; i < 5; i++) { const [x, y, kk] = pk(it.x - 0.7 + i * 0.35, 1.08, it.wz - 0.5); g.fillStyle = tone(i % 2 ? [170, 120, 60] : [150, 70, 40], z); g.beginPath(); g.arc(x, y, 0.13 * kk, 0, 7); g.fill(); }
        return;
      }
      case "pedestal": {
        box(it.x - 0.35, it.x + 0.35, 0, 1.05, it.wz - 0.35, it.wz + 0.35, [96, 84, 70], { edge: true });
        box(it.x - 0.45, it.x + 0.45, 1.0, 1.12, it.wz - 0.45, it.wz + 0.45, [120, 100, 70]);
        if (it.scroll && it.scroll.here && z > NEAR) {
          const [x, y, kk] = pk(it.x, 1.2, it.wz - 0.1), w = 0.32 * kk, h = 0.07 * kk;
          g.fillStyle = "rgb(222,206,160)"; g.fillRect(x - w, y - h, w * 2, h * 2);
          g.fillStyle = "rgb(120,40,30)"; g.fillRect(x - w * 0.1, y - h * 1.1, w * 0.2, h * 2.2);
          g.fillStyle = "rgb(150,120,80)"; g.beginPath(); g.arc(x - w, y, h * 1.3, 0, 7); g.arc(x + w, y, h * 1.3, 0, 7); g.fill();
          it.scroll.screen = [x, y, w * 1.6];
        }
        return;
      }
      case "throne": {
        box(it.x - 0.8, it.x + 0.8, 0, 0.6, it.wz - 0.4, it.wz + 0.6, [70, 30, 30]);
        box(it.x - 0.8, it.x + 0.8, 0.6, 2.6, it.wz + 0.3, it.wz + 0.6, [86, 34, 34], { edge: true });
        for (const s of [-1, 1]) box(it.x + s * 0.8 - 0.1, it.x + s * 0.8 + 0.1, 0, 1.1, it.wz - 0.4, it.wz + 0.6, [150, 120, 60]);
        const [x, y, kk] = pk(it.x, 2.75, it.wz + 0.3); g.fillStyle = tone([170, 140, 70], z); g.beginPath(); g.moveTo(x - 0.5 * kk, y + 0.1 * kk); g.lineTo(x, y - 0.35 * kk); g.lineTo(x + 0.5 * kk, y + 0.1 * kk); g.fill();
        return;
      }
    }
  }

  function drawHouse(it, z) {
    const { side, X, wz, len, h, deep, rgb } = it, z1 = wz + len, k = 1 - fogK(Math.max(z, 0));
    const front = face([[X, 0, wz], [X, 0, z1], [X, h, z1], [X, h, wz]], tone(rgb, Math.max(z, 1)));
    if (S.D < wz) face([[X, 0, wz], [X + side * deep, 0, wz], [X + side * deep, h, wz], [X, h, wz]], tone(rgb, z, -12));
    face([[X, h, wz], [X, h, z1], [X + side * deep * 0.5, h + it.roof, z1], [X + side * deep * 0.5, h + it.roof, wz]], tone([44, 34, 34], Math.max(z, 1)));
    if (S.D < wz) face([[X, h, wz], [X + side * deep * 0.5, h + it.roof, wz], [X + side * deep, h, wz]], tone(rgb, z, -16));
    if (!front || z > 70) return;
    const line = `rgba(16,12,10,${0.55 * k})`;
    if (it.timber) {
      for (const y of [0.15, h * 0.48, h - 0.1]) seg([X, y, Math.max(wz, S.D + NEAR)], [X, y, z1], line, 1.2);
      for (let fz = 0; fz <= len; fz += 1.8) seg([X, 0, wz + fz], [X, h, wz + fz], line, 1.1);
      for (let fz = 0; fz < len - 1; fz += 3.6) seg([X, h * 0.48, wz + fz], [X, h - 0.1, wz + fz + 1.8], line, 0.9);
    } else if (z < 30) for (let y = 0.5; y < h; y += 0.5) seg([X, y, Math.max(wz, S.D + NEAR)], [X, y, z1], `rgba(14,14,18,${0.3 * k})`, 0.6);
    for (const w of it.wins) {
      const a = wz + w.z, b = a + w.w, d = -side * 0.01;
      face([[X + d, w.y, a], [X + d, w.y, b], [X + d, w.y + 1.0, b], [X + d, w.y + 1.0, a]], w.lit ? `rgb(${Math.round(lerp(255, S.pal.fog[0], 1 - k * 0.9))},${Math.round(lerp(178, S.pal.fog[1], 1 - k * 0.9))},${Math.round(lerp(92, S.pal.fog[2], 1 - k * 0.9))})` : tone([18, 18, 24], z), line, 1);
    }
    if (it.door >= 0) face([[X - side * 0.01, 0, wz + it.door], [X - side * 0.01, 0, wz + it.door + 1.1], [X - side * 0.01, 2.1, wz + it.door + 1.1], [X - side * 0.01, 2.1, wz + it.door]], tone([36, 26, 20], z), line, 1);
  }

  function drawTorch(it, z, t) {
    if (z < 0.6) return;
    const [x, y, kk] = pk(it.x, it.y, it.wz), fl = 0.8 + 0.2 * Math.sin(t * 17 + it.seed) * Math.sin(t * 7.3 + it.seed * 0.3);
    g.fillStyle = tone([30, 24, 20], z); g.fillRect(x - 0.03 * kk, y, 0.06 * kk, 0.45 * kk);
    g.globalCompositeOperation = "lighter";
    const R = 2.4 * kk * fl, gl = g.createRadialGradient(x, y, 0, x, y, R);
    gl.addColorStop(0, `rgba(255,170,80,${0.32 * (1 - fogK(z) * 0.6)})`); gl.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = gl; g.fillRect(x - R, y - R, R * 2, R * 2);
    g.globalCompositeOperation = "source-over";
    g.fillStyle = `rgba(255,${200 + 40 * fl | 0},120,0.95)`; g.beginPath(); g.ellipse(x, y - 0.1 * kk, 0.07 * kk * fl, 0.16 * kk * fl, 0, 0, 7); g.fill();
    g.fillStyle = "rgba(255,250,220,0.9)"; g.beginPath(); g.ellipse(x, y - 0.06 * kk, 0.03 * kk, 0.07 * kk, 0, 0, 7); g.fill();
  }

  function drawWall(it, z) {
    const { h, thick, gate: [gw, gh], span, rgb } = it, z0 = it.wz, z1 = z0 + thick, k = 1 - fogK(Math.max(z, 0));
    const pastFront = S.D >= z0;
    if (!pastFront) {
      // gate tunnel seen through the opening: dark sides and the far light
      face([[-gw / 2, 0, z0], [gw / 2, 0, z0], [gw / 2, gh, z0], [-gw / 2, gh, z0]], tone([10, 10, 14], z));
      face([[-gw / 2, 0, z1], [gw / 2, 0, z1], [gw / 2, gh, z1], [-gw / 2, gh, z1]], tone(lerp3(S.pal.fog, [120, 90, 60], 0.35), z + 8));
    }
    for (const s of [-1, 1]) face([[s * gw / 2, 0, Math.max(z0, S.D + NEAR)], [s * gw / 2, 0, z1], [s * gw / 2, gh, z1], [s * gw / 2, gh, Math.max(z0, S.D + NEAR)]], tone(rgb, Math.max(z, 1), -26));
    face([[-gw / 2, gh, Math.max(z0, S.D + NEAR)], [gw / 2, gh, Math.max(z0, S.D + NEAR)], [gw / 2, gh, z1], [-gw / 2, gh, z1]], tone(rgb, Math.max(z, 1), -34));
    if (pastFront) return;
    const col = tone(rgb, z), F = [[-span, 0, z0], [-gw / 2, 0, z0], [-gw / 2, gh, z0], [gw / 2, gh, z0], [gw / 2, 0, z0], [span, 0, z0], [span, h, z0], [-span, h, z0]];
    face(F, col);
    // arch over the gate
    const [ax, ay, ak] = pk(0, gh, z0); g.fillStyle = tone(rgb, z, 16); g.beginPath(); g.arc(ax, ay, gw / 2 * ak + 0.35 * ak, Math.PI, 0); g.arc(ax, ay, gw / 2 * ak, 0, Math.PI, true); g.fill();
    g.fillStyle = tone([10, 10, 14], z); g.beginPath(); g.arc(ax, ay, gw / 2 * ak, Math.PI, 0); g.fill();
    if (it.portcullis) { g.strokeStyle = tone([24, 22, 22], z); g.lineWidth = Math.max(1, 0.06 * ak); for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(ax + i * gw / 7 * ak, ay - gw / 2 * ak * Math.sqrt(1 - (i / 3.5) ** 2)); g.lineTo(ax + i * gw / 7 * ak, ay + 0.6 * ak); g.stroke(); } }
    // stone courses and joints where they read
    const kk = project(0, 0, Math.max(z, NEAR))[2], line = `rgba(12,12,16,${0.4 * k})`;
    if (kk * 0.6 > 3) {
      const xr = W / 2 / kk + 4;
      for (let y = 0.6, row = 0; y < h; y += 0.6, row++) {
        seg([-Math.min(span, xr), y, z0], [Math.min(span, xr), y, z0], line, 0.7);
        if (kk * 1.2 > 5) for (let x = -Math.min(span, xr) + (row % 2) * 0.6; x < Math.min(span, xr); x += 1.2) if (Math.abs(x) > gw / 2 || y > gh) seg([x, y - 0.6, z0], [x, y, z0], line, 0.6);
      }
    }
    for (let x = -span; x < span; x += 1.4) box(x, x + 0.8, h, h + 0.6, z0 - 0.01, z0 + 0.5, rgb, { noTop: true });   // merlons, low so the men on the wall read
    for (const tx of it.towers) {
      box(tx - 2, tx + 2, 0, h + 4, z0 - 1.5, z1 + 1, lerp3(rgb, [0, 0, 0], 0.08), { edge: true });
      for (let x = tx - 2; x < tx + 2; x += 1.0) box(x, x + 0.6, h + 4, h + 4.9, z0 - 1.5, z0 - 1.1, rgb, { noTop: true });
      const [wx, wy, wk] = pk(tx, h + 1.6, z0 - 1.5); g.fillStyle = tone([10, 10, 14], z); g.fillRect(wx - 0.12 * wk, wy - 0.5 * wk, 0.24 * wk, 1 * wk);
    }
    if (it.banners) for (const bx of it.banners) face([[bx - 0.7, h - 0.4, z0 - 0.03], [bx + 0.7, h - 0.4, z0 - 0.03], [bx + 0.7, h - 4.4, z0 - 0.03], [bx, h - 5, z0 - 0.03], [bx - 0.7, h - 4.4, z0 - 0.03]], tone([110, 22, 28], z), tone([190, 150, 70], z), 1);
  }

  // ------------------------------------------------------------------ physics queries
  // first occluder a world-space segment a->b passes into; returns {o, p} or null
  function hitScene(a, b) {
    for (const o of S.occ) {
      const zo = o.k === "box" ? (o.z0 + o.z1) / 2 : o.z, rz = o.k === "box" ? (o.z1 - o.z0) / 2 + 1 : (o.r || 1) + 1;
      if (Math.min(a[2], b[2]) > zo + rz || Math.max(a[2], b[2]) < zo - rz) continue;
      if (inside(o, b)) return { o, p: b };
    }
    return null;
  }
  function inside(o, p) {
    if (o.k === "cyl") return p[1] >= o.y0 && p[1] <= o.y1 && Math.hypot(p[0] - o.x, p[2] - o.z) < o.r;
    if (o.k === "sph") return Math.hypot(p[0] - o.x, p[1] - o.y, p[2] - o.z) < o.r;
    return p[0] > o.x0 && p[0] < o.x1 && p[1] > o.y0 && p[1] < o.y1 && p[2] > o.z0 && p[2] < o.z1;
  }
  // is a hide item (bush, cart, pillar marked hide) right in front of the camera?
  const hidden = () => S.items.some(it => it.hide && it.wz - S.D > 0.4 && it.wz - S.D < 3.2);
  // line of sight from a to b blocked by scenery? (sampled)
  function blocked(a, b) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.6), z0 = Math.min(a[2], b[2]) - 8, z1 = Math.max(a[2], b[2]) + 8;
    const near = S.occ.filter(o => { const z = o.k === "box" ? o.z0 : o.z; return (o.k === "box" ? o.z1 : z) > z0 && z < z1; });
    for (let i = 1; i < n; i++) { const p = lerp3(a, b, i / n); for (const o of near) if (inside(o, p)) return true; }
    return false;
  }

  return { S, build, resize, draw, pk, face, seg, box, tone, rgba, hitScene, inside, hidden, blocked, pathX, zoneAt, fogK };
})();
