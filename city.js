"use strict";
// =====================================================================
// Shared night city: street blocks with windows, shopfronts, signs, a
// cinema marquee, street lamps, the road, and cars with breakable glass.
// One CityKit.S state is shared by whichever level is running.
// =====================================================================
const CityKit = (() => {
  const LANES = [-3.5, 0, 3.5], ROAD = 7.2, FACADE = 10.5, SIDEWALK = 8.7;
  // car body (m): origin at rear bumper centre on the ground, z forward (away from us)
  const C = { w: 0.95, wr: 0.82, len: 4.7, sill: 0.3, belt: 1.0, roof: 1.48, rw0: 0.95, rw1: 1.55, roof1: 3.2, ws1: 3.9 };
  const xAt = y => lerp(C.w, C.wr * 0.92, (y - C.belt) / (C.roof - C.belt));
  const PANE = {
    rear: () => [[-C.wr, C.belt + 0.02, C.rw0], [C.wr, C.belt + 0.02, C.rw0], [C.wr * 0.9, C.roof - 0.03, C.rw1], [-C.wr * 0.9, C.roof - 0.03, C.rw1]],
    1: s => [[1.75, 1.04], [2.5, 1.04], [2.5, 1.4], [1.85, 1.4]].map(([z, y]) => [s * xAt(y), y, z]),
    2: s => [[2.62, 1.04], [3.65, 1.04], [3.22, 1.4], [2.62, 1.4]].map(([z, y]) => [s * xAt(y), y, z]),
  };
  const SIGNS = ["HOTEL", "BAR", "24H", "PHARMACY", "PAWN", "DINER", "BOOKS", "LAUNDRY", "RECORDS", "NOODLES"];
  const S = { blocks: [], lamps: [], dist: 0, lampLight: 0, sky: null, specials: [] };
  let W, H;

  // fresh street: blocks both sides, lamps; specials = [{dist, side, spec}] scripted blocks at world distances
  function resetCity(specials = []) {
    S.blocks = []; S.lamps = []; S.dist = 0; S.lampLight = 0; S.specials = specials.map(o => ({ ...o, used: false }));
    for (const side of [-1, 1]) { let z = -5; while (z < 170) z = addBlock(side, z); }
    for (let z = 8; z < 160; z += 15) S.lamps.push({ z, side: (Math.round(z / 15) % 2) ? 1 : -1 });
  }
  function resizeCity() {
    W = E.W; H = E.H;
    // distant towers at the end of the street, drawn once
    S.sky = mk(W * 2, H * 0.6); const s = S.sky.getContext("2d"), r = mulberry(9);
    for (let i = 0; i < 60; i++) {
      const w = 10 + r() * 40, h = 40 + r() * 160, x = r() * W * 2;
      s.fillStyle = `rgb(${15 + r() * 6 | 0},${18 + r() * 6 | 0},${23 + r() * 7 | 0})`; s.fillRect(x, H * 0.6 - h, w, h);
      for (let wy = H * 0.6 - h + 4; wy < H * 0.6; wy += 6) for (let wx = x + 2; wx < x + w - 2; wx += 5) if (r() < 0.05) { s.fillStyle = "rgba(150,160,175,0.18)"; s.fillRect(wx, wy, 2, 2); }
    }
  }
  // move the world toward the camera by `step` metres
  function advance(step) {
    S.dist += step;
    for (const b of S.blocks) b.z0 -= step;
    S.blocks = S.blocks.filter(b => b.z0 + b.len > -2);
    for (const side of [-1, 1]) { const last = Math.max(...S.blocks.filter(b => b.side === side).map(b => b.z0 + b.len)); if (last < 170) addBlock(side, last); }
    for (const l of S.lamps) { l.z -= step; if (l.z < 0.6) l.z += 150; }
    S.lampLight = S.lamps.reduce((s, l) => s + Math.exp(-((l.z - 2) ** 2) / 6), 0);
  }

  const glassState = tint => ({ stage: 0, cracks: [], open: false, tint });
  function makeCar(o) {
    return Object.assign({ x: 0, z: 20, yaw: 0, vx: 0, lane: 0, occ: [], kind: "parked", tone: [13, 16, 20],
      glass: { rear: glassState(0.22), L1: glassState(0.8), L2: glassState(0.8), R1: glassState(0.8), R2: glassState(0.8) } }, o);
  }
  function addBlock(side, z) {
    const r = mulberry((Math.random() * 1e9) | 0);
    // a scripted block due within reach? place it at its world distance (an alley fills any gap)
    const sp = S.specials.find(o => !o.used && o.side === side && o.dist - S.dist < z + 28);
    if (sp) {
      sp.used = true; const z0 = Math.max(z, sp.dist - S.dist);
      const b = Object.assign({ side, z0, len: 16, h: 12, tone: 14, seed: (r() * 1e9) | 0, shop: true, sign: null, theater: false, setback: 0, doors: [] }, sp.spec);
      sp.block = b; S.blocks.push(b); return z0 + b.len;
    }
    let len = 10 + r() * 18;
    const b = { side, z0: z, len, h: 8 + r() * 24, tone: 11 + r() * 8, seed: (r() * 1e9) | 0, shop: r() < 0.6,
      sign: r() < 0.45 ? SIGNS[(r() * SIGNS.length) | 0] : null, theater: r() < 0.08, setback: r() < 0.2 ? 1.5 : 0 };
    const next = S.specials.find(o => !o.used && o.side === side);
    if (next && z + len > next.dist - S.dist) b.len = len = Math.max(3, next.dist - S.dist - z);   // stop short of it
    S.blocks.push(b);
    return z + len + (r() < 0.3 ? 3 + r() * 3 : 0);
  }
  // ------------------------------------------------------------------ car geometry
  function cw(car, lx, lz) { const c = Math.cos(car.yaw), s = Math.sin(car.yaw), dz = lz - C.len / 2; return [car.x + lx * c + dz * s, car.z + C.len / 2 - lx * s + dz * c]; }
  const cp = (car, l) => { const [x, z] = cw(car, l[0], l[2]); return project(x, l[1], z); };
  const shadeOf = (car, add = 0) => { const f = clamp(1 - car.z / 160, 0.3, 1), fog = [30, 36, 44]; return `rgb(${car.tone.map((v, i) => Math.round(lerp(fog[i], v + add, f))).join(",")})`; };

  function drawCar(car) {
    const g = sctx, P = l => cp(car, l), sil = new Path2D(), lower = new Path2D(), panes = [];
    const rel = car.x - cam.offX, side = rel > C.w * 0.5 ? -1 : rel < -C.w * 0.5 ? 1 : 0;
    const face = (pts, fill, ...paths) => {
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath();
      g.fillStyle = fill; g.fill(); for (const p of paths) poly(p, pts.map(q => [q[0], q[1]]));
    };
    const edge = (a, b, al = 0.16) => { g.strokeStyle = `rgba(150,165,185,${al * clamp(1 - car.z / 120, 0.2, 1)})`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); };
    if (side) {
      const X = side * C.w;
      face([[X, C.sill, 0], [X, C.sill, C.len], [X, C.belt - 0.05, C.len], [X, C.belt, 0.1]].map(P), shadeOf(car, -2), sil, lower);
      edge(P([X, C.belt, 0.1]), P([X, C.belt - 0.05, C.len]));
      for (const wz of [0.85, 3.85]) {
        const c = P([X, 0.34, wz]), k = c[2];
        g.fillStyle = "#030405"; g.beginPath(); g.ellipse(c[0], c[1], 0.34 * k * clamp(Math.abs(rel) / 4, 0.25, 0.8), 0.34 * k, 0, 0, 7); g.fill();
      }
      face([[X, C.belt, C.rw0 - 0.05], [side * C.wr * 0.92, C.roof, C.rw1], [side * C.wr * 0.92, C.roof, C.roof1], [X, C.belt, C.ws1]].map(P), shadeOf(car, -5), sil);
      for (const n of [1, 2]) {
        const key = (side < 0 ? "L" : "R") + n, pts = PANE[n](side).map(P), path = new Path2D(); poly(path, pts.map(q => [q[0], q[1]]));
        g.fillStyle = "#020304"; g.fill(path); panes.push({ key, pts, path });
      }
    }
    face([[-C.w, C.belt, 0.12], [C.w, C.belt, 0.12], [C.w, C.belt, C.rw0], [-C.w, C.belt, C.rw0]].map(P), shadeOf(car, 5), sil, lower);
    const lit = car.kind === "enemy" ? clamp(1 - car.z / 22, 0, 1) * 10 : 0;          // our headlights on their back
    face([[-C.w, C.sill, 0], [C.w, C.sill, 0], [C.w, C.belt, 0.12], [-C.w, C.belt, 0.12]].map(P), shadeOf(car, lit), sil, lower);
    edge(P([-C.w, C.belt, 0.12]), P([C.w, C.belt, 0.12]), 0.22);
    edge(P([-C.w, 0.5, 0]), P([C.w, 0.5, 0]), 0.1);
    for (const s of [-1, 1]) {                                                            // tail lights, dim
      const a = P([s * 0.78, 0.86, 0]), b = P([s * 0.5, 0.72, 0]);
      g.fillStyle = "rgba(120,45,35,0.55)"; g.fillRect(Math.min(a[0], b[0]), a[1], Math.abs(b[0] - a[0]), b[1] - a[1]);
    }
    const p0 = P([-0.26, 0.62, 0]), p1 = P([0.26, 0.48, 0]);
    g.fillStyle = "rgba(150,160,175,0.16)"; g.fillRect(p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1]);
    face([[-C.w * 0.97, C.belt, C.rw0 - 0.03], [C.w * 0.97, C.belt, C.rw0 - 0.03], [C.wr * 0.95, C.roof + 0.02, C.rw1], [-C.wr * 0.95, C.roof + 0.02, C.rw1]].map(P), shadeOf(car, -6), sil);
    edge(P([-C.wr * 0.95, C.roof + 0.02, C.rw1]), P([C.wr * 0.95, C.roof + 0.02, C.rw1]), 0.2);
    const rp = PANE.rear().map(P), rpath = new Path2D(); poly(rpath, rp.map(q => [q[0], q[1]]));
    g.fillStyle = "#020304"; g.fill(rpath); panes.push({ key: "rear", pts: rp, path: rpath });
    car.geo = { sil, lower, panes };
  }

  // glass over the people inside: tint, frost by damage stage, cracks, then jagged remains
  function drawPane(car, pane) {
    const st = car.glass[pane.key];
    if (st.open) return;
    const g = sctx, [p0, p1, p2, p3] = pane.pts;
    g.save(); g.clip(pane.path);
    if (st.stage >= 4) {                                     // shattered: a few teeth left round the frame
      const r = mulberry(st.cracks[0][2]);                  // stable per pane
      g.fillStyle = "rgba(190,200,215,0.22)";
      for (let i = 0; i < 14; i++) {
        const u = i / 14, a = uvTo(pane.pts, u, 0), b = uvTo(pane.pts, u + 0.07, 0), c = uvTo(pane.pts, u + 0.035, 0.08 + r() * 0.12);
        const d = uvTo(pane.pts, u, 1), e2 = uvTo(pane.pts, u + 0.07, 1), f2 = uvTo(pane.pts, u + 0.035, 0.92 - r() * 0.12);
        for (const tri of [[a, b, c], [d, e2, f2]]) { g.beginPath(); g.moveTo(...tri[0]); g.lineTo(...tri[1]); g.lineTo(...tri[2]); g.fill(); }
      }
      g.restore(); return;
    }
    const frost = [0, 0.2, 0.42, 0.8][st.stage];
    g.fillStyle = `rgba(8,10,14,${st.tint})`; g.fill(pane.path);
    if (frost) { g.fillStyle = `rgba(165,175,190,${frost})`; g.fill(pane.path); }
    // passing street S.lamps slide a reflection across the glass
    const u = (S.dist * 0.07) % 1.6 - 0.3, a = uvTo(pane.pts, u, 1), b = uvTo(pane.pts, u + 0.2, 1), c = uvTo(pane.pts, u + 0.1, 0), d = uvTo(pane.pts, u - 0.1, 0);
    g.fillStyle = `rgba(190,200,215,${0.06 + S.lampLight * 0.08})`; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.lineTo(...d); g.fill();
    const span = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    for (const [cu, cv, seed] of st.cracks) {
      const [x, y] = uvTo(pane.pts, cu, cv), r = mulberry(seed), R = span * (0.22 + st.stage * 0.05);
      g.strokeStyle = "rgba(215,225,238,0.55)"; g.lineWidth = Math.max(0.5, span / 160);
      for (let i = 0; i < 10; i++) {
        let ang = i / 10 * 6.283 + r() * 0.5, px = x, py = y; g.beginPath(); g.moveTo(px, py);
        for (let k = 0; k < 3; k++) { ang += (r() - 0.5) * 0.6; px += Math.cos(ang) * R * (0.15 + r() * 0.25); py += Math.sin(ang) * R * (0.15 + r() * 0.25); g.lineTo(px, py); }
        g.stroke();
      }
      g.beginPath(); g.arc(x, y, R * 0.3, 0, 7); g.stroke();
      g.fillStyle = "#050608"; g.beginPath(); g.arc(x, y, Math.max(1, R * 0.04), 0, 7); g.fill();
    }
    g.restore();
  }
  // bilinear point inside a projected quad [u0v0, u1v0, u1v1, u0v1]
  function uvTo(q, u, v) { const a = lerp(q[0][0], q[1][0], u), b = lerp(q[0][1], q[1][1], u), c = lerp(q[3][0], q[2][0], u), d = lerp(q[3][1], q[2][1], u); return [lerp(a, c, v), lerp(b, d, v)]; }
  function toUV(q, x, y) {                                   // affine inverse from three corners
    const ax = q[1][0] - q[0][0], ay = q[1][1] - q[0][1], bx = q[3][0] - q[0][0], by = q[3][1] - q[0][1], det = ax * by - ay * bx || 1;
    const dx = x - q[0][0], dy = y - q[0][1];
    return [clamp((dx * by - dy * bx) / det, 0.05, 0.95), clamp((ax * dy - ay * dx) / det, 0.05, 0.95)];
  }

  // ------------------------------------------------------------------ the city
  function drawCity(t, opts = {}) {
    const g = sctx, P = stage;
    const skyG = g.createLinearGradient(0, 0, 0, cam.hor + H * 0.05);
    skyG.addColorStop(0, "#07090c"); skyG.addColorStop(1, "#1e242c");
    g.fillStyle = skyG; g.fillRect(0, 0, W, H);
    const [vx] = P(0, 0, 400);
    g.globalAlpha = 0.9; g.drawImage(S.sky, vx - W, cam.hor - H * 0.6 + 4); g.globalAlpha = 1;
    // road and sidewalks along the curve
    const zs = []; for (let z = 0.9; z < 170; z *= 1.08) zs.push(z);
    const strip = (x0, x1, fill) => {
      g.beginPath(); zs.forEach((z, i) => { const [x, y] = P(x0, 0, z); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      for (const z of zs.slice().reverse()) { const [x, y] = P(x1, 0, z); g.lineTo(x, y); }
      g.closePath(); g.fillStyle = fill; g.fill();
    };
    const rg = g.createLinearGradient(0, cam.hor, 0, H); rg.addColorStop(0, "#20262e"); rg.addColorStop(0.2, "#14181d"); rg.addColorStop(1, "#0c0e12");
    strip(-ROAD, ROAD, rg);
    for (const s of [-1, 1]) strip(s * ROAD, s * FACADE, "#161a20");
    const line = (x, z0, z1, w, a) => {
      const A = P(x - w, 0, z0), B = P(x + w, 0, z0), Cc = P(x + w, 0, z1), D = P(x - w, 0, z1);
      g.fillStyle = `rgba(160,172,190,${a * clamp(1 - z0 / 130, 0, 1)})`; g.beginPath(); g.moveTo(...A); g.lineTo(...B); g.lineTo(...Cc); g.lineTo(...D); g.fill();
    };
    const off = S.dist % 9;
    for (let z = 9 - off; z < 130; z += 9) for (const x of [-1.75, 1.75]) line(x, Math.max(0.9, z), z + 3, 0.07, 0.32);
    for (const s of [-1, 1]) { line(s * 5.25, 0.9, 140, 0.06, 0.16); line(s * ROAD, 0.9, 150, 0.05, 0.25); }
    const offS = S.dist % 2.2;
    for (let z = 2.2 - offS; z < 60; z += 2.2) for (const s of [-1, 1]) {
      const a = P(s * ROAD, 0, Math.max(0.9, z)), b = P(s * FACADE, 0, Math.max(0.9, z));
      g.strokeStyle = `rgba(120,130,145,${0.05 * (1 - z / 60)})`; g.lineWidth = 0.6; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
    }
    // buildings, far first
    for (const b of S.blocks.slice().sort((a, c) => c.z0 - a.z0)) drawBlock(b, t);
    if (opts.headlights !== false) {
    // our headlights on the road ahead
      const hl = [P(cam.offX - 0.9, 0, 2.2), P(cam.offX + 0.9, 0, 2.2), P(cam.offX + 4, 0, 30), P(cam.offX - 4, 0, 30)];
      const hg = g.createLinearGradient(0, hl[0][1], 0, hl[2][1]); hg.addColorStop(0, "rgba(185,195,210,0.13)"); hg.addColorStop(1, "rgba(185,195,210,0)");
      g.globalCompositeOperation = "lighter"; g.fillStyle = hg; g.beginPath(); g.moveTo(...hl[0]); for (const p of hl.slice(1)) g.lineTo(...p); g.fill(); g.globalCompositeOperation = "source-over";
    }
  }

  function drawBlock(b, t) {
    const g = sctx, P = stage, X = b.side * (FACADE + b.setback), z0 = Math.max(0.9, b.z0), z1 = b.z0 + b.len;
    if (z1 < 1 || b.z0 > 175) return;
    const fog = clamp(b.z0 / 150, 0, 1), tone = v => Math.round(lerp(v, 30, fog));
    const quad = (pts, fill) => { g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.closePath(); g.fillStyle = fill; g.fill(); };
    quad([P(X, 0, z0), P(X, b.h, z0), P(X, b.h, z1), P(X, 0, z1)], `rgb(${tone(b.tone)},${tone(b.tone + 3)},${tone(b.tone + 7)})`);
    if (b.z0 > 0.9) quad([P(X, 0, b.z0), P(X, b.h, b.z0), P(X + b.side * 16, b.h, b.z0), P(X + b.side * 16, 0, b.z0)], `rgb(${tone(b.tone + 4)},${tone(b.tone + 7)},${tone(b.tone + 11)})`);
    const top = [P(X, b.h, z0), P(X, b.h, z1)];
    g.strokeStyle = `rgba(150,165,185,${0.12 * (1 - fog)})`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(...top[0]); g.lineTo(...top[1]); g.stroke();
    // window grid, batched
    const r = mulberry(b.seed), dark = new Path2D(), lit = new Path2D(), wa = 1 - fog;
    for (let y = 4.2; y < b.h - 1.2; y += 3.1) for (let z = b.z0 + 1; z < z1 - 1.4; z += 2.6) {
      const on = r() < 0.08; if (z < 1) continue;
      poly(on ? lit : dark, [P(X, y, z), P(X, y + 1.6, z), P(X, y + 1.6, z + 1.3), P(X, y, z + 1.3)].map(q => [q[0], q[1]]));
    }
    g.fillStyle = `rgba(4,5,7,${0.8 * wa})`; g.fill(dark);
    g.fillStyle = `rgba(150,160,175,${0.16 * wa})`; g.fill(lit);
    if (b.shop) {                                             // lit shopfront at street level
      const zA = Math.max(1, b.z0 + 0.6), zB = z1 - 0.6;
      if (zB > zA) {
        quad([P(X, 0.3, zA), P(X, 3.1, zA), P(X, 3.1, zB), P(X, 0.3, zB)], `rgba(150,160,175,${0.08 * wa})`);
        for (let z = zA; z < zB; z += 2.4) { const a = P(X, 0.3, z), c = P(X, 3.1, z); g.strokeStyle = `rgba(5,6,8,${0.8 * wa})`; g.lineWidth = Math.max(0.6, 0.08 * cam.f / z); g.beginPath(); g.moveTo(...a); g.lineTo(...c); g.stroke(); }
      }
    }
    if (b.mall) {                                             // tall lit glass front
      const zA = Math.max(1, b.z0 + 0.5), zB = z1 - 0.5;
      if (zB > zA) {
        quad([P(X, 0.2, zA), P(X, 4.2, zA), P(X, 4.2, zB), P(X, 0.2, zB)], `rgba(165,175,190,${0.16 * wa})`);
        for (let z = zA; z < zB; z += 1.6) { const a = P(X, 0.2, z), c = P(X, 4.2, z); g.strokeStyle = `rgba(6,8,10,${0.7 * wa})`; g.lineWidth = Math.max(0.5, 0.05 * cam.f / z); g.beginPath(); g.moveTo(...a); g.lineTo(...c); g.stroke(); }
      }
      if (b.z0 > 1) {                                         // name on the end wall facing us
        const a = P(X, b.h - 1, b.z0), c = P(X + b.side * 12, b.h - 3.2, b.z0), fs = Math.abs(c[1] - a[1]) * 0.7;
        g.font = `600 ${fs}px "Space Grotesk", Inter, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = `rgba(210,218,230,${0.45 * wa})`; g.shadowColor = "rgba(210,218,230,0.6)"; g.shadowBlur = fs * 0.4;
        g.fillText(b.mall, (a[0] + c[0]) / 2, (a[1] + c[1]) / 2); g.shadowBlur = 0;
      }
    }
    for (const d of b.doors || []) {                          // doorways people come out of
      const za = b.z0 + d; if (za < 1) continue;
      const door = [P(X, 0, za), P(X, 2.4, za), P(X, 2.4, za + 1.5), P(X, 0, za + 1.5)];
      quad(door, "#030405");
      const inner = g.createLinearGradient(0, door[1][1], 0, door[0][1]);
      inner.addColorStop(0, `rgba(150,160,175,${0.03 * wa})`); inner.addColorStop(1, `rgba(150,160,175,${0.12 * wa})`);
      quad(door, inner);
      g.strokeStyle = `rgba(150,165,185,${0.18 * wa})`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(...door[0]); g.lineTo(...door[1]); g.lineTo(...door[2]); g.lineTo(...door[3]); g.stroke();
    }
    if (b.theater && b.z0 + 2 > 1) drawMarquee(b, X, t);
    if (b.sign && b.z0 + 1.5 > 1.2) {                         // blade sign sticking out over the sidewalk
      const z = b.z0 + 1.5, a = P(X, 7.6, z), c = P(X - b.side * 1.3, 4.2, z), k = cam.f / z;
      const x0 = Math.min(a[0], c[0]), w = Math.abs(c[0] - a[0]);
      g.fillStyle = `rgba(8,10,13,${0.95})`; g.fillRect(x0, a[1], w, c[1] - a[1]);
      g.strokeStyle = `rgba(160,172,190,${0.25 * wa})`; g.lineWidth = 1; g.strokeRect(x0, a[1], w, c[1] - a[1]);
      const fs = Math.min(w * 0.55, (c[1] - a[1]) / (b.sign.length + 0.5));
      if (fs > 2.5) {
        g.font = `600 ${fs}px "Space Grotesk", Inter, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = `rgba(200,210,225,${0.45 * wa})`; g.shadowColor = "rgba(200,210,225,0.6)"; g.shadowBlur = fs * 0.6;
        [...b.sign].forEach((ch, i) => g.fillText(ch, x0 + w / 2, a[1] + fs * (i + 0.75)));
        g.shadowBlur = 0;
      }
    }
  }
  function drawMarquee(b, X, t) {
    const g = sctx, P = stage, zA = Math.max(1.1, b.z0 + 2), zB = b.z0 + b.len - 2, out = X - b.side * 2.4;
    const quad = (pts, fill) => { g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.closePath(); g.fillStyle = fill; g.fill(); };
    quad([P(out, 3.4, zA), P(out, 4.7, zA), P(out, 4.7, zB), P(out, 3.4, zB)], "#0c0f13");
    if (b.z0 + 2 > 1.1) {
      const a = P(X, 4.7, zA), c = P(out, 3.4, zA);
      g.fillStyle = "#0e1116"; g.fillRect(Math.min(a[0], c[0]), a[1], Math.abs(c[0] - a[0]), c[1] - a[1]);
      const fs = (c[1] - a[1]) * 0.42;
      g.font = `600 ${fs}px "Space Grotesk", Inter, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = "rgba(210,218,230,0.5)"; g.fillText("CINEMA", (a[0] + c[0]) / 2, (a[1] + c[1]) / 2);
    }
    for (let z = zA, i = 0; z < zB; z += 0.45, i++) {        // chasing bulbs along the underside
      const p = P(out, 3.4, z), on = (i + Math.floor(t * 8)) % 3 === 0, rr = Math.max(0.6, 0.06 * cam.f / z);
      g.fillStyle = on ? "rgba(225,230,240,0.75)" : "rgba(150,160,175,0.2)";
      g.beginPath(); g.arc(p[0], p[1], rr, 0, 7); g.fill();
    }
  }
  function drawLamp(l) {
    const g = sctx, P = stage, x = l.side * 7.5, arm = x - l.side * 1.8;
    if (l.z < 0.95) return;
    const base = P(x, 0, l.z), top = P(x, 6.6, l.z), head = P(arm, 6.5, l.z), k = cam.f / l.z;
    g.strokeStyle = "#06080a"; g.lineWidth = Math.max(1, 0.16 * k); g.beginPath(); g.moveTo(...base); g.lineTo(...top); g.lineTo(...head); g.stroke();
    const halo = g.createRadialGradient(head[0], head[1], 0, head[0], head[1], 1.3 * k);
    halo.addColorStop(0, "rgba(200,208,220,0.2)"); halo.addColorStop(0.25, "rgba(200,208,220,0.05)"); halo.addColorStop(1, "rgba(200,208,220,0)");
    g.globalCompositeOperation = "lighter"; g.fillStyle = halo; g.fillRect(head[0] - 1.3 * k, head[1] - 1.3 * k, 2.6 * k, 2.6 * k);
    const pool = P(arm, 0, l.z), pr = 3.5 * k;
    const pg = g.createRadialGradient(pool[0], pool[1], 0, pool[0], pool[1], pr);
    pg.addColorStop(0, "rgba(170,180,195,0.08)"); pg.addColorStop(1, "rgba(170,180,195,0)");
    g.fillStyle = pg; g.beginPath(); g.ellipse(pool[0], pool[1], pr, pr * cam.camH / l.z * 1.4, 0, 0, 7); g.fill();
    g.globalCompositeOperation = "source-over";
  }


  return { LANES, ROAD, FACADE, SIDEWALK, C, PANE, SIGNS, S, glassState, makeCar, cw, cp, drawCar, drawPane, uvTo, toUV, drawCity, drawLamp, resetCity, resizeCity, advance };
})();
