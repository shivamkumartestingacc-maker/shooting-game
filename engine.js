"use strict";
// =====================================================================
// Night-camera engine shared by every level:
// canvases, camera, glowing skeleton bodies, weapons, embers, grain,
// audio, input and the main loop. A level is an object with
// init / resize / update(dt,t) / render(t) and optional input hooks.
// =====================================================================

const COL = {
  orange: { core: "255,214,160", aura: "255,96,16",  ember: "190,40,6" },   // armed with knives, stones
  red:    { core: "255,180,165", aura: "255,30,22",  ember: "150,10,5" },   // armed with guns
  blue:   { core: "210,238,255", aura: "50,140,255", ember: "20,60,160" },  // civilians, never shoot
  green:  { core: "248,244,190", aura: "176,206,58", ember: "96,112,18" },  // prey animals: food, not enemies
};
const SCALE = 0.7;   // scene renders below screen res, upscaled soft

// ---------- utils ----------
const mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; };
function mulberry(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = (a, b, c) => { let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2246822519); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = k => (k = clamp(k, 0, 1), k * k * (3 - 2 * k));
const easeOut = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const ease = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// ---------- state, canvases, camera ----------
const E = { W: 0, H: 0, VW: 0, VH: 0, mouse: { x: 0, y: 0 }, level: null, keys: {}, idSeq: 0, embers: [] };
// camera: pinhole at height camH looking down +z. zoom/fx/fy crop the view around a stage point (scope).
const cam = { f: 1, hor: 0, cx: 0, camH: 1.6, zoom: 1, fx: 0, fy: 0, offX: 0, bend: 0 };   // offX: camera's lateral position, bend: road curvature
let view, vctx, scene, sctx, F, fctx, C, cctx, Rm, rmctx, Wp, wpctx, half, hctx, s1, s1ctx, s2, s2ctx, vignette, OL, olctx;

// stage = unzoomed scene pixels; view = what is on screen after scope zoom
const stage = (x, y, z) => [cam.cx + (x - cam.offX + cam.bend * z * z) * cam.f / z, cam.hor + (cam.camH - y) * cam.f / z];
const toView = (sx, sy) => [(sx - cam.fx) * cam.zoom + E.W / 2, (sy - cam.fy) * cam.zoom + E.H / 2];
const toStage = (vx, vy) => [(vx - E.W / 2) / cam.zoom + cam.fx, (vy - E.H / 2) / cam.zoom + cam.fy];
function project(x, y, z) {
  z = Math.max(0.5, z);
  const k = cam.f / z, [vx, vy] = toView(cam.cx + (x - cam.offX + cam.bend * z * z) * k, cam.hor + (cam.camH - y) * k);
  return [vx, vy, k * cam.zoom];
}

function engineResize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  E.VW = view.width = innerWidth * dpr; E.VH = view.height = innerHeight * dpr;
  const W = E.W = Math.round(innerWidth * SCALE), H = E.H = Math.round(innerHeight * SCALE);
  scene = mk(W, H); sctx = scene.getContext("2d");
  F = mk(W, H); fctx = F.getContext("2d");               // living silhouettes, flat colour
  C = mk(W, H); cctx = C.getContext("2d");               // inner hot light, masked to F
  Rm = mk(W, H); rmctx = Rm.getContext("2d");            // bright inner rim
  Wp = mk(W, H); wpctx = Wp.getContext("2d");            // dark weapons drawn over the glow
  half = mk(W >> 1, H >> 1); hctx = half.getContext("2d");
  s1 = mk(W >> 2, H >> 2); s1ctx = s1.getContext("2d");
  s2 = mk(Math.ceil(W / 12), Math.ceil(H / 12)); s2ctx = s2.getContext("2d");
  OL = mk(W >> 2, H >> 2); olctx = OL.getContext("2d");               // dark halo for opts.outline
  for (const c of [hctx, s1ctx, s2ctx]) c.imageSmoothingQuality = "high";
  vignette = vctx.createRadialGradient(E.VW / 2, E.VH / 2, Math.min(E.VW, E.VH) * 0.25, E.VW / 2, E.VH / 2, Math.max(E.VW, E.VH) * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(1, "rgba(0,0,0,0.85)");
  cam.zoom = 1; cam.fx = W / 2; cam.fy = H / 2; cam.cx = W / 2; cam.offX = 0; cam.bend = 0;
  E.level && E.level.resize();
}

// ---------- grain ----------
const grain = Array.from({ length: 4 }, () => {
  const t = mk(256, 256), c = t.getContext("2d"), img = c.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0); return t;
});

// =====================================================================
// Bodies. Local skeleton coords in metres: x right, y up, d forward is
// negative (yaw 0 = facing the camera). Joints are rotated by yaw and
// projected one by one, so near hands grow and profiles turn correctly.
// =====================================================================
const STRIDE = 0.34;   // half step length per leg (m)
const STANCE = 0.6;    // share of the gait cycle a foot stays planted

// arm poses: [elbow, hand] offsets from the shoulder, per side (-1 left, +1 right)
const ARM = {
  hang:  s => [[s * 0.035, -0.29, 0.02], [s * 0.045, -0.56, -0.06]],
  head:  s => [[s * 0.21, 0.1, -0.02], [s * 0.07, 0.29, 0.04]],          // hands on head (hostage)
  cower: s => [[s * 0.15, -0.02, -0.14], [s * 0.05, 0.17, -0.12]],
  reach: s => [[s * 0.01, -0.06, -0.3], [-s * 0.03, 0.02, -0.6]],
  rifle: s => s > 0 ? [[0.07, -0.22, -0.04], [-0.03, -0.3, -0.2]] : [[-0.02, -0.2, -0.22], [0.14, -0.24, -0.46]],
  aim:   s => s > 0 ? [[0.13, -0.13, -0.05], [-0.08, -0.03, -0.2]] : [[0.12, -0.15, -0.32], [0.3, -0.05, -0.56]],
  knife: s => s > 0 ? [[0.06, -0.22, -0.1], [0.0, -0.34, -0.34]] : [[-0.035, -0.29, 0.02], [-0.045, -0.56, -0.06]],
  raise: s => s > 0 ? [[0.12, 0.16, -0.06], [0.03, 0.43, -0.12]] : [[-0.02, -0.18, -0.24], [0.08, -0.26, -0.48]],
  strap: s => s > 0 ? [[0.08, 0.25, -0.02], [0.03, 0.56, -0.03]] : [[-0.035, -0.29, 0.02], [-0.045, -0.56, -0.06]],   // right hand up on a strap
  bow:   s => s > 0 ? [[0.16, 0.02, 0.14], [-0.06, 0.1, -0.1]] : [[-0.06, -0.02, -0.3], [-0.02, 0.0, -0.6]],     // left arm out with the bow, right hand drawn to the chin
  bowdn: s => s > 0 ? [[0.035, -0.29, 0.02], [0.045, -0.56, -0.06]] : [[-0.05, -0.26, -0.08], [-0.04, -0.48, -0.22]],  // bow held low
  shield: s => s > 0 ? [[0.06, -0.22, -0.1], [0.0, -0.34, -0.34]] : [[-0.06, -0.2, -0.22], [0.12, -0.12, -0.36]], // sword low, shield across the chest
};
const POSE_UP = { hang: 0, head: 1, cower: 1, reach: 1, rifle: 0.4, aim: 0.4, knife: 0.2, raise: 1, strap: 0.6, bow: 0.4, bowdn: 0.2, shield: 0.3 };
const POSE_CURL = { hang: 0.35, head: 0.45, cower: 0.6, reach: 0.1, rifle: 0.95, aim: 0.95, knife: 0.95, raise: 0.95, strap: 0.85, bow: 0.95, bowdn: 0.95, shield: 0.95 };

function makeFigure(o) {
  const r = mulberry((Math.random() * 1e9) | 0);
  const e = Object.assign({
    id: ++E.idSeq, kind: "orange", x: 0, z: 10, y0: 0, yaw: 0, phase: r() * 6, speed: 1.1, walkW: 0,
    pose: "hang", kneel: 0, sit: 0, cower: 0, alpha: 1, hitFlash: 0, stagger: 0, dying: 0, grab: 0, tremble: 0,
    weapon: null, curlOverride: null,
    style: { lean: 0.02 + r() * 0.05, tilt: (r() - 0.5) * 0.3, build: 0.9 + r() * 0.22, stride: 0.85 + r() * 0.3 },
  }, o);
  e.kneelCur = e.kneel; e.cowerCur = e.cower; e.sitCur = e.sit;
  const p = ARM[e.pose];
  e.armCur = { [-1]: p(-1).map(v => v.slice()), [1]: p(1).map(v => v.slice()) };
  e.upCur = POSE_UP[e.pose]; e.curlCur = POSE_CURL[e.pose];
  return e;
}

// blend limbs toward the current pose; call once per frame per figure
function animate(e, dt) {
  const p = ARM[e.pose], k = 1 - Math.exp(-dt * 7);
  for (const side of [-1, 1]) {
    const tg = p(side), cur = e.armCur[side];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) cur[i][j] += (tg[i][j] - cur[i][j]) * k;
  }
  e.upCur += (POSE_UP[e.pose] - e.upCur) * k; e.curlCur += (POSE_CURL[e.pose] - e.curlCur) * k;
  e.kneelCur = ease(e.kneelCur, e.kneel, 4, dt); e.cowerCur = ease(e.cowerCur, e.cower, 4, dt); e.sitCur = ease(e.sitCur, e.sit, 4, dt);
  e.hitFlash = Math.max(0, e.hitFlash - dt); e.stagger = Math.max(0, e.stagger - dt * 2.5);
}
function turnTo(e, yaw, dt, rate = 5) { let d = yaw - e.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); e.yaw += d * (1 - Math.exp(-dt * rate)); }
const yawToward = (e, x, z) => Math.atan2(x - e.x, -(z - e.z));
function idle(e, dt) { e.walkW = ease(e.walkW, 0, 6, dt); }
// walk toward a floor point; cadence is locked to ground speed so planted feet never slide
function walkTo(e, tx, tz, dt) {
  const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
  if (d < 0.06) { idle(e, dt); return true; }
  turnTo(e, Math.atan2(dx, -dz), dt);
  e.walkW = ease(e.walkW, 1, 4, dt);
  const v = e.speed * e.walkW * (1 - e.stagger), step = Math.min(d, v * dt);
  e.x += dx / d * step; e.z += dz / d * step;
  e.phase += dt * 2 * Math.PI * STANCE * v / (2 * STRIDE * e.style.stride);
  return false;
}

function footGait(u, S, w) {
  if (u < STANCE) return [lerp(-S, S, u / STANCE), 0];   // planted: slides back under the hips at ground speed
  const k = (u - STANCE) / (1 - STANCE);
  return [lerp(S, -S, smooth(k)), Math.sin(Math.PI * k) * (0.1 + S * 0.25) * w];
}
function ik(a, b, l1, l2) {           // two-bone IK in the y/d plane, knee bends forward
  const dy = b[1] - a[1], dd = b[2] - a[2], L = Math.hypot(dy, dd) || 1e-4, Lc = Math.min(L, l1 + l2 - 1e-4);
  const ca = (l1 * l1 + Lc * Lc - l2 * l2) / (2 * l1 * Lc), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  const vy = dy / L, vd = dd / L; let py = -vd, pd = vy; if (pd > 0) { py = -py; pd = -pd; }
  return [(a[0] + b[0]) / 2, a[1] + (vy * ca + py * sa) * l1, a[2] + (vd * ca + pd * sa) * l1];
}

function skeleton(e, t) {
  const s = e.style, w = clamp(e.walkW, 0, 1), S = STRIDE * s.stride * w, kn = e.kneelCur, cw = e.cowerCur;
  const u = ((e.phase / (Math.PI * 2)) % 1 + 1) % 1;
  const bob = 0.028 * w * Math.cos(2 * Math.PI * (2 * u - 0.6));
  const sway = -0.03 * w * Math.cos(2 * Math.PI * (u - 0.3));
  const lean = s.lean + Math.max(0, e.grab) * 0.18 - e.stagger * 0.35 + cw * 0.14;
  const st = e.sitCur;
  const py = lerp(lerp(0.92 + bob, 0.5 - cw * 0.06, kn), 0.47, st);
  const pelvis = [sway, py, 0];
  const shC = [sway * 0.4, py + 0.5 + bob * 0.8 - cw * 0.08, -lean];
  const head = [shC[0] + s.tilt * 0.03, shC[1] + 0.2 - cw * 0.05, shC[2] - 0.02 - lean * 0.35 - cw * 0.06 + e.stagger * 0.1];
  const feet = [footGait(u, S, w), footGait((u + 0.5) % 1, S, w)];
  const legs = [-1, 1].map((side, i) => {
    const [fd, lift] = feet[i];
    const hip = [pelvis[0] + side * 0.09 * s.build, py, fd * 0.12];
    let foot = [hip[0] + side * 0.015, 0.07 + lift, fd], knee = ik(hip, foot, 0.44, 0.44);
    if (kn > 0) {                                    // kneeling: knees on the floor, shins trailing back
      knee = lerp3(knee, [side * 0.11, 0.07, -0.06], kn);
      foot = lerp3(foot, [side * 0.1, 0.06, 0.4], kn);
    }
    if (st > 0) {                                    // sitting: thighs forward, shins down
      knee = lerp3(knee, [side * 0.11, 0.5, -0.42], st);
      foot = lerp3(foot, [side * 0.12, 0.07, -0.5], st);
    }
    return { hip, knee, foot, toeD: lerp(lerp(-0.15, 0.13, kn), -0.15, st) };
  });
  const swingK = e.pose === "hang" ? 1 : 0.2;
  const arms = [-1, 1].map((side, i) => {
    const fd = feet[i][0];
    const sh = [shC[0] + side * 0.19 * s.build, shC[1] - 0.03, shC[2] - fd * 0.08];
    const [eo, ho] = e.armCur[side], swing = -fd * 0.5 * swingK;
    const elbow = [sh[0] + eo[0], sh[1] + eo[1], sh[2] + eo[2] + swing * 0.45];
    const hand = [sh[0] + ho[0], sh[1] + ho[1], sh[2] + ho[2] + swing];
    if (e.tremble) { const q = Math.sin(t * 31 + side * 2) * 0.008 * e.tremble; hand[0] += q; hand[1] += q * 0.7; }
    const g = e.grab, gp = Math.max(0, g);
    if (g) {                                         // lunge-grab: hands converge on the camera
      const faceX = -e.x + side * 0.16;
      elbow[2] -= g * 0.4; elbow[0] = lerp(elbow[0], (faceX + sh[0]) / 2, gp * 0.7);
      hand[2] -= g * 0.3; hand[1] = lerp(hand[1], CAM_FACE_Y, gp * 0.8); hand[0] = lerp(hand[0], faceX, gp * 0.55);
    }
    return { side, sh, elbow, hand, up: Math.min(1, e.upCur + gp) };
  });
  const sk = { pelvis, shC, head, legs, arms };
  if (e.fall) {                                      // topple sideways around the knees
    const a = e.fall * e.fallSide, c = Math.cos(a), sn = Math.sin(a), py0 = 0.12;
    const R = j => { const x = j[0], y = j[1] - py0; j[0] = x * c + y * sn; j[1] = py0 - x * sn + y * c; };
    [pelvis, shC, head].forEach(R);
    for (const L of legs) [L.hip, L.knee, L.foot].forEach(R);
    for (const A of arms) [A.sh, A.elbow, A.hand].forEach(R);
  }
  return sk;
}
const CAM_FACE_Y = 1.5;

// death: legs give way, body topples to the floor, lies still, then burns away into embers.
// Levels set e.dying = true on the kill and drop the figure once updateDeath returns true.
const FALL_T = 0.75, LIE_T = 0.5, BURN_T = 1.7;
function updateDeath(e, dt) {
  if (!e.dying) return false;
  if (!e.deathT) { e.deathT = 0; e.fallSide = e.fallSide || (Math.random() < 0.5 ? -1 : 1); e.pose = "hang"; e.kneel = 1; e.walkW = 0; e.grab = 0; e.tremble = 0; }
  e.deathT += dt;
  e.kneelCur = ease(e.kneelCur, 1, 9, dt);
  const k = clamp((e.deathT - 0.18) / (FALL_T - 0.18), 0, 1);
  e.fall = k * k * 1.42 + (k >= 1 ? Math.sin((e.deathT - FALL_T) * 18) * 0.04 * Math.max(0, 1 - (e.deathT - FALL_T) * 4) : 0);  // gravity, small bounce
  e.dissolve = clamp((e.deathT - FALL_T - LIE_T) / BURN_T, 0, 1);
  return e.dissolve >= 1;
}

// path helpers: every sub-shape wound the same way so one nonzero fill unions them
function poly(path, pts) {
  let a = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; }
  if (a < 0) pts = pts.slice().reverse();
  path.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]); path.closePath();
}
function smoothPoly(path, pts) {
  let a = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; }
  if (a < 0) pts = pts.slice().reverse();
  const n = pts.length, m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], st = m(pts[n - 1], pts[0]);
  path.moveTo(st[0], st[1]);
  for (let i = 0; i < n; i++) { const p = pts[i], mm = m(p, pts[(i + 1) % n]); path.quadraticCurveTo(p[0], p[1], mm[0], mm[1]); }
  path.closePath();
}
function circle(path, x, y, r) { path.moveTo(x + r, y); path.arc(x, y, r, 0, Math.PI * 2); }
function capsule(path, a, b, ra, rb) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-3, nx = -dy / L, ny = dx / L;
  poly(path, [[a[0] + nx * ra, a[1] + ny * ra], [b[0] + nx * rb, b[1] + ny * rb], [b[0] - nx * rb, b[1] - ny * rb], [a[0] - nx * ra, a[1] - ny * ra]]);
  circle(path, a[0], a[1], ra); circle(path, b[0], b[1], rb);
}

// torso half-widths (m) from crotch (u<0) to neck (u>1)
const TORSO = [[1.06, 0.055], [1.02, 0.11], [0.96, 0.165], [0.84, 0.172], [0.64, 0.15], [0.44, 0.125], [0.2, 0.14], [0.02, 0.15], [-0.08, 0.075]];

function buildBody(e, t) {
  if (e.body === "quad") return buildQuad(e, t);
  const sk = skeleton(e, t), tick = Math.floor(t * 14), cy = Math.cos(e.yaw), sy = Math.sin(e.yaw);
  let n = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  const P = (j, jit = 1) => {
    const [vx, vy, k] = project(e.x + j[0] * cy - j[2] * sy, e.y0 + j[1], e.z + j[0] * sy + j[2] * cy);
    const x = vx + (hash(e.id, n, tick) - 0.5) * 0.014 * k * jit, y = vy + (hash(e.id, n + 400, tick) - 0.5) * 0.014 * k * jit;
    n++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    return [x, y, k];
  };
  const path = new Path2D(), bw = e.style.build, wf = Math.abs(cy) + 0.65 * Math.abs(sy);  // torso reads narrower in profile
  // torso widths are laid perpendicular to the spine on screen, so a fallen body keeps its shape
  const sp0 = P(sk.pelvis, 0), sp1 = P(sk.shC, 0), sl = Math.hypot(sp1[0] - sp0[0], sp1[1] - sp0[1]) || 1;
  const nx = -(sp1[1] - sp0[1]) / sl, ny = (sp1[0] - sp0[0]) / sl, spine = Math.atan2(nx, -ny) - Math.PI / 2;
  const T = (u, wd, side) => { const c = P(lerp3(sk.pelvis, sk.shC, u)), o = side * wd * bw * wf * c[2]; return [c[0] - nx * o, c[1] - ny * o, c[2]]; };
  smoothPoly(path, [...TORSO.map(([u, wd]) => T(u, wd, 1)), T(-0.12, 0, 1), ...TORSO.slice().reverse().map(([u, wd]) => T(u, wd, -1))]);
  const neckBase = P([sk.shC[0], sk.shC[1] + 0.04, sk.shC[2]]), hd = P(sk.head);
  const chin = P([sk.head[0], sk.head[1] - 0.08, sk.head[2]]);
  capsule(path, neckBase, chin, 0.05 * neckBase[2], 0.045 * chin[2]);
  path.moveTo(hd[0] + 0.082 * hd[2], hd[1]);
  path.ellipse(hd[0], hd[1], 0.082 * hd[2], 0.105 * hd[2], e.style.tilt * 0.3 + spine, 0, Math.PI * 2);
  const hair = P([sk.head[0], sk.head[1] + 0.045, sk.head[2] + 0.015]);
  path.moveTo(hair[0] + 0.088 * hair[2], hair[1]);
  path.ellipse(hair[0], hair[1], 0.088 * hair[2], 0.07 * hair[2], e.style.tilt * 0.3 + spine, 0, Math.PI * 2);
  for (const L of sk.legs) {
    const h = P(L.hip), k = P(L.knee), calf = P(lerp3(L.knee, L.foot, 0.3)), a = P(L.foot);
    const toe = P([L.foot[0], L.foot[1] - 0.03, L.foot[2] + L.toeD]);
    capsule(path, h, k, 0.088 * h[2], 0.052 * k[2]);
    capsule(path, k, calf, 0.052 * k[2], 0.058 * calf[2]);
    capsule(path, calf, a, 0.058 * calf[2], 0.031 * a[2]);
    capsule(path, a, toe, 0.036 * a[2], 0.027 * toe[2]);
  }
  const hands = {};
  for (const A of sk.arms) {
    const s = P(A.sh), el = P(A.elbow), fore = P(lerp3(A.elbow, A.hand, 0.35)), hn = P(A.hand);
    circle(path, s[0], s[1], 0.062 * s[2]);
    capsule(path, s, el, 0.055 * s[2], 0.038 * el[2]);
    capsule(path, el, fore, 0.04 * el[2], 0.043 * fore[2]);
    capsule(path, fore, hn, 0.043 * fore[2], 0.028 * hn[2]);
    hand(path, e, A, hn, t);
    hands[A.side] = A;
  }
  const geom = { path, head: [hd[0], hd[1], 0.11 * hd[2]], feetY: maxY, kb: cam.f / e.z * cam.zoom,
                 chest: T(0.75, 0, 1), box: [minX, minY, maxX, maxY] };
  if (e.weapon || e.shield) buildWeapon(e, sk, hands, P, geom);
  return geom;
}

// =====================================================================
// Quadrupeds: same local frame and glow pipeline as people (yaw 0 faces
// the camera, forward is -d). Four two-bone legs on a walk / trot /
// gallop cycle, neck + head that drop to graze, tail, and antlers or
// tusks as dark solids. Set e.body = "quad", e.species = wolf|deer|boar.
// Death reuses updateDeath: the body rolls onto its side, then burns.
// =====================================================================
const QUAD = {
  wolf: { len: 0.95, hgt: 0.7, body: 0.16, haunch: 0.13, neck: 0.3, neckA: 0.45, headD: 0.65, headL: 0.3, head: 0.085, leg: 0.05, tail: 0.42, tailA: -0.5, ears: 0.11, w: 0.1 },
  deer: { len: 1.05, hgt: 0.98, body: 0.19, haunch: 0.17, neck: 0.52, neckA: 1.05, headD: 1.35, headL: 0.3, head: 0.075, leg: 0.036, tail: 0.13, tailA: 0.5, ears: 0.13, w: 0.1, antlers: true },
  boar: { len: 1.0, hgt: 0.62, body: 0.26, haunch: 0.22, neck: 0.16, neckA: 0.15, headD: 0.35, headL: 0.42, head: 0.13, leg: 0.055, tail: 0.16, tailA: -1.1, ears: 0.08, w: 0.13, tusks: true },
};
const GAITS = {             // phase offsets per leg [FL, FR, HL, HR] and the share of the cycle a hoof is planted
  walk:   { off: [0.25, 0.75, 0, 0.5], stance: 0.65 },
  trot:   { off: [0, 0.5, 0.5, 0], stance: 0.5 },
  gallop: { off: [0.1, 0.0, 0.6, 0.5], stance: 0.35 },
};
function quadSkeleton(e, t) {
  const Q = QUAD[e.species], w = clamp(e.walkW, 0, 1), v = e.speed * w;
  const gait = GAITS[v > 4 ? "gallop" : v > 1.9 ? "trot" : "walk"];
  // planted hooves move at ground speed: walkTo advances the phase assuming STANCE, so scale the stride
  const S = STRIDE * e.style.stride * w * gait.stance / STANCE;
  const u0 = ((e.phase / (Math.PI * 2)) % 1 + 1) % 1, gal = gait === GAITS.gallop ? 1 : 0;
  const bob = (0.025 + gal * 0.05) * w * Math.cos(Math.PI * 4 * u0), flex = gal * w * Math.sin(Math.PI * 2 * u0) * 0.07;
  const graze = e.grazeCur || 0, alertUp = e.alertCur || 0;
  const wi = [0, Q.hgt + bob, -Q.len / 2 + flex], hip = [0, Q.hgt * 0.97 + bob * 0.6, Q.len / 2 - flex];
  const na = lerp(Q.neckA + alertUp * 0.35, -1.0, graze) - gal * w * 0.25;
  const nb = [0, wi[1] + 0.02, wi[2] - 0.02];
  const hb = [0, nb[1] + Math.sin(na) * Q.neck, nb[2] - Math.cos(na) * Q.neck];
  const ha = na - lerp(Q.headD, 0.4, graze);
  const snout = [0, hb[1] + Math.sin(ha) * Q.headL, hb[2] - Math.cos(ha) * Q.headL];
  const ta = Q.tailA + Math.sin(t * 3 + e.id) * 0.15 * (1 - w) + w * 0.3;
  const tail = [0, hip[1] + Math.sin(ta) * Q.tail, hip[2] + Math.cos(ta) * Q.tail * 0.9 + 0.04];
  const legs = [[-1, 0], [1, 0], [-1, 1], [1, 1]].map(([side, rear], i) => {
    const [fd, lift] = footGait(((u0 + gait.off[i]) % 1 + 1) % 1, S, w), base = rear ? hip : wi;
    const top = [side * Q.w, base[1] - Q.body * 0.4, base[2] + (rear ? -0.05 : 0.06)];
    const foot = [side * Q.w * 0.9, 0.04 + lift * 1.2, base[2] + fd];
    return { side, rear, top, foot, knee: bend(top, foot, (top[1] - 0.04) * 0.56, rear ? 1 : -1) };
  });
  const sk = { Q, wi, hip, nb, hb, snout, tail, legs };
  if (e.fall) {                                     // roll onto the side around the spine
    const a = e.fall * e.fallSide, c = Math.cos(a), sn = Math.sin(a), py0 = Q.body * 0.9;
    const R = j => { const x = j[0], y = j[1] - py0; j[0] = x * c - y * sn; j[1] = py0 + x * sn + y * c; };
    [wi, hip, nb, hb, snout, tail].forEach(R);
    for (const L of legs) [L.top, L.knee, L.foot].forEach(R);
  }
  return sk;
}
// two equal bones from a to b; the joint pushes toward +d (dir 1, hocks) or -d (dir -1, knees)
function bend(a, b, L, dir) {
  const m = lerp3(a, b, 0.5), dy = b[1] - a[1], dd = b[2] - a[2], D = Math.hypot(dy, dd) || 1e-4, h = Math.sqrt(Math.max(0, L * L - D * D / 4));
  let py = -dd / D, pd = dy / D; if (Math.sign(pd) !== dir) { py = -py; pd = -pd; }
  return [m[0], m[1] + py * h, m[2] + pd * h];
}
function buildQuad(e, t) {
  const sk = quadSkeleton(e, t), Q = sk.Q, tick = Math.floor(t * 14), cy = Math.cos(e.yaw), sy = Math.sin(e.yaw);
  let n = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  const P = (j, jit = 1) => {
    const [vx, vy, k] = project(e.x + j[0] * cy - j[2] * sy, e.y0 + j[1], e.z + j[0] * sy + j[2] * cy);
    const x = vx + (hash(e.id, n, tick) - 0.5) * 0.012 * k * jit, y = vy + (hash(e.id, n + 400, tick) - 0.5) * 0.012 * k * jit;
    n++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    return [x, y, k];
  };
  const path = new Path2D(), dark = new Path2D(), bw = e.style.build;
  const mid = lerp3(sk.wi, sk.hip, 0.5), chestLow = [0, sk.wi[1] - Q.body * 0.35, sk.wi[2] + 0.06];
  const W0 = P(sk.wi), M = P(mid), H0 = P(sk.hip), CL = P(chestLow);
  capsule(path, W0, M, Q.body * bw * W0[2], Q.body * 0.92 * bw * M[2]);
  capsule(path, M, H0, Q.body * 0.92 * bw * M[2], Q.haunch * bw * H0[2]);
  circle(path, CL[0], CL[1], Q.body * 0.85 * bw * CL[2]);
  const NB = P(sk.nb), HB = P(sk.hb), SN = P(sk.snout), TL = P(sk.tail);
  capsule(path, NB, HB, Q.body * 0.62 * NB[2], Q.head * 1.05 * HB[2]);
  capsule(path, HB, SN, Q.head * HB[2], Q.head * 0.5 * SN[2]);
  capsule(path, H0, TL, Q.haunch * 0.28 * H0[2], 0.022 * TL[2]);
  for (const s of [-1, 1]) {                         // ears
    const ea = P([s * 0.05, sk.hb[1] + 0.02, sk.hb[2] + 0.03]), eb = P([s * 0.08, sk.hb[1] + Q.ears, sk.hb[2] + 0.06]);
    capsule(path, ea, eb, 0.03 * ea[2], 0.008 * eb[2]);
  }
  for (const L of sk.legs) {
    const a = P(L.top), k = P(L.knee), f = P(L.foot);
    capsule(path, a, k, Q.leg * 1.7 * a[2], Q.leg * k[2]);
    capsule(path, k, f, Q.leg * k[2], Q.leg * 0.7 * f[2]);
  }
  if (Q.antlers && e.antlers !== false) {           // antlers: dark solid branches off the skull
    for (const s of [-1, 1]) {
      const b = [s * 0.05, sk.hb[1] + 0.05, sk.hb[2] + 0.02], m1 = [s * 0.2, b[1] + 0.26, b[2] + 0.12], tip = [s * 0.26, b[1] + 0.52, b[2] + 0.02];
      const t1 = [s * 0.13, b[1] + 0.34, b[2] - 0.08], t2 = [s * 0.32, b[1] + 0.4, b[2] + 0.2];
      const pb = P(b, 0), p1 = P(m1, 0);
      capsule(dark, pb, p1, 0.016 * pb[2], 0.012 * p1[2]); capsule(dark, p1, P(tip, 0), 0.012 * p1[2], 0.004 * p1[2]);
      capsule(dark, p1, P(t1, 0), 0.009 * p1[2], 0.003 * p1[2]); capsule(dark, p1, P(t2, 0), 0.009 * p1[2], 0.003 * p1[2]);
    }
  }
  if (Q.tusks) for (const s of [-1, 1]) {
    const a = P([s * 0.05, sk.snout[1] - 0.02, sk.snout[2] + 0.06], 0), b = P([s * 0.09, sk.snout[1] + 0.07, sk.snout[2] - 0.01], 0);
    capsule(dark, a, b, 0.016 * a[2], 0.004 * b[2]);
  }
  const hr = Q.head * 1.35 * lerp(HB[2], SN[2], 0.5);
  const geom = { path, head: [lerp(HB[0], SN[0], 0.4), lerp(HB[1], SN[1], 0.4), hr], feetY: maxY, kb: cam.f / e.z * cam.zoom * 0.7,
                 chest: lerp3(W0, M, 0.4), box: [minX, minY, maxX, maxY], weapon: Q.antlers || Q.tusks ? dark : null };
  return geom;
}

// palm + four two-jointed fingers + thumb
function hand(path, e, A, hp, t) {
  const k = hp[2], side = A.side, palm = 0.042 * k;
  circle(path, hp[0], hp[1], palm);
  if (0.1 * k < 1.5) return;                                // too small to see fingers
  const base = lerp(Math.PI / 2 - side * 0.12, -Math.PI / 2 + side * 0.5, A.up);
  const curl = e.curlOverride ?? e.curlCur, spread = lerp(0.1, 0.34, A.up) - curl * 0.2, len = 0.09 * k * (1 - curl * 0.55);
  const tk = Math.floor(t * 9), dir = a => [Math.cos(a), Math.sin(a)];
  [0.82, 1, 0.94, 0.74].forEach((m, i) => {
    const a = base + (i - 1.5) * spread + (hash(e.id, 900 + i + side * 7, tk) - 0.5) * 0.18;
    const [ux, uy] = dir(a), kn = [hp[0] + ux * palm * 0.85, hp[1] + uy * palm * 0.85];
    const mid = [kn[0] + ux * len * m * 0.55, kn[1] + uy * len * m * 0.55];
    const [vx, vy] = dir(a - side * curl * 0.9);
    capsule(path, kn, mid, 0.015 * k, 0.012 * k);
    capsule(path, mid, [mid[0] + vx * len * m * 0.5, mid[1] + vy * len * m * 0.5], 0.012 * k, 0.008 * k);
  });
  const ta = base + side * 1.15 * (1 - 2 * A.up), [ux, uy] = dir(ta);
  const tb = [hp[0] + ux * palm * 0.7, hp[1] + uy * palm * 0.7];
  capsule(path, tb, [tb[0] + ux * 0.06 * k * (1 - curl * 0.4), tb[1] + uy * 0.06 * k * (1 - curl * 0.4)], 0.018 * k, 0.012 * k);
}

// weapons are dark solids (not alive), built in the same local space so they turn with the body
function buildWeapon(e, sk, hands, P, geom) {
  const w = new Path2D(), R = hands[1], Lh = hands[-1];
  if (e.weapon === "rifle") {
    const dir = norm3([Lh.hand[0] - R.hand[0], Lh.hand[1] - R.hand[1], Lh.hand[2] - R.hand[2]]);
    const at = (p, s) => add3(p, [dir[0] * s, dir[1] * s, dir[2] * s]);
    const stock = P(add3(at(R.hand, -0.3), [0, 0.03, 0]), 0), grip = P(R.hand, 0), fore = P(Lh.hand, 0);
    const muz = P(at(Lh.hand, 0.42), 0), mag = P(add3(lerp3(R.hand, Lh.hand, 0.3), [0, -0.15, 0]), 0);
    const magTop = P(lerp3(R.hand, Lh.hand, 0.3), 0), sight = P(add3(lerp3(R.hand, Lh.hand, 0.35), [0, 0.06, 0]), 0);
    capsule(w, stock, grip, 0.04 * stock[2], 0.032 * grip[2]);
    capsule(w, grip, fore, 0.034 * grip[2], 0.028 * fore[2]);
    capsule(w, fore, muz, 0.014 * fore[2], 0.011 * muz[2]);
    capsule(w, magTop, mag, 0.024 * magTop[2], 0.02 * mag[2]);
    capsule(w, magTop, sight, 0.014 * magTop[2], 0.016 * sight[2]);
    geom.muzzle = muz;
  } else if (e.weapon === "pistol") {
    const dir = norm3([R.hand[0] - R.elbow[0], R.hand[1] - R.elbow[1], R.hand[2] - R.elbow[2]]);
    const at = s => add3(R.hand, [dir[0] * s, dir[1] * s, dir[2] * s]);
    const a = P(at(0.0), 0), b = P(at(0.19), 0), grip = P(add3(R.hand, [0, -0.09, 0]), 0);
    capsule(w, a, b, 0.026 * a[2], 0.02 * b[2]);
    capsule(w, P(R.hand, 0), grip, 0.02 * grip[2], 0.018 * grip[2]);
    geom.muzzle = b;
  } else if (e.weapon === "knife") {
    let dir = norm3([R.hand[0] - R.elbow[0], R.hand[1] - R.elbow[1], R.hand[2] - R.elbow[2]]);
    if (e.pose === "raise") dir = dir.map(v => -v);          // ice-pick grip for the overhead stab
    const at = s => add3(R.hand, [dir[0] * s, dir[1] * s, dir[2] * s]);
    const a = P(at(0.04), 0), b = P(at(0.27), 0);
    capsule(w, a, b, 0.014 * a[2], 0.003 * b[2]);
    geom.blade = [a, b];
  } else if (e.weapon === "sword") {
    let dir = norm3([R.hand[0] - R.elbow[0], R.hand[1] - R.elbow[1], R.hand[2] - R.elbow[2]]);
    if (e.pose === "raise") dir = norm3([dir[0], Math.abs(dir[1]) + 0.6, dir[2]]);   // blade up for the overhead cut
    const at = s => add3(R.hand, [dir[0] * s, dir[1] * s, dir[2] * s]);
    const h0 = P(at(-0.08), 0), a = P(at(0.06), 0), b = P(at(0.88), 0), gl = P(add3(at(0.05), [0.09, 0, 0]), 0), gr = P(add3(at(0.05), [-0.09, 0, 0]), 0);
    capsule(w, h0, a, 0.016 * h0[2], 0.016 * a[2]);
    capsule(w, gl, gr, 0.012 * gl[2], 0.012 * gr[2]);             // cross-guard
    capsule(w, a, b, 0.02 * a[2], 0.004 * b[2]);
    geom.blade = [a, b];
  } else if (e.weapon === "spear") {
    const dir = norm3([Lh.hand[0] - R.hand[0], Lh.hand[1] - R.hand[1], Lh.hand[2] - R.hand[2]]);
    const at = (p, s) => add3(p, [dir[0] * s, dir[1] * s, dir[2] * s]);
    const butt = P(at(R.hand, -0.7), 0), tip0 = P(at(Lh.hand, 1.0), 0), tip = P(at(Lh.hand, 1.32), 0);
    capsule(w, butt, tip0, 0.017 * butt[2], 0.014 * tip0[2]);
    capsule(w, tip0, tip, 0.035 * tip0[2], 0.002 * tip[2]);
    geom.muzzle = tip;
  } else if (e.weapon === "bow") {                            // bow in the left hand, arrow nocked to the right
    const g = Lh.hand, drawn = e.pose === "bow";
    const pt = (dy, dd) => P([g[0], g[1] + dy, g[2] + dd], 0);
    const lim = [[0.72, 0.16], [0.45, 0.02], [0.18, -0.05], [0, -0.06], [-0.18, -0.05], [-0.45, 0.02], [-0.72, 0.16]].map(([y, d]) => pt(y, d));
    for (let i = 0; i < lim.length - 1; i++) { const r0 = i === 2 || i === 3 ? 0.026 : 0.017; capsule(w, lim[i], lim[i + 1], r0 * lim[i][2], r0 * lim[i + 1][2]); }
    const nock = drawn ? P(R.hand, 0) : pt(0, 0.16), sw = 0.004;
    capsule(w, lim[0], nock, sw * lim[0][2], sw * nock[2]); capsule(w, nock, lim[6], sw * nock[2], sw * lim[6][2]);
    if (drawn) { const tipA = P(add3(g, [0, 0.01, -0.1]), 0); capsule(w, nock, tipA, 0.008 * nock[2], 0.008 * tipA[2]); geom.muzzle = tipA; }
    else geom.muzzle = pt(0, -0.06);
  }
  if (e.shield) {                                             // round shield on the left forearm, faces where he faces
    const c = add3(Lh.hand, [0, 0.04, -0.06]), r = 0.34, s = new Path2D(), pts = [];
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; pts.push(P([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * 1.1, c[2]], 0)); }
    poly(s, pts); poly(w, pts);
    geom.shield = s; geom.shieldC = P(c, 0);
  }
  geom.weapon = w;
}

// ---------- embers: fire-like particles off dissolving bodies ----------
function emitEmbers(e) {
  const g = e.geom, [x0, y0, x1, y1] = g.box, line = dyingLine(e, g);
  const sc = clamp(g.kb / 140, 0.7, 2.6);
  for (let tries = 0, made = 0; tries < 90 && made < 22; tries++) {
    const x = lerp(x0, x1, Math.random()), y = line + Math.random() * g.kb * 0.06;
    if (!sctx.isPointInPath(g.path, x, y)) continue;
    made++;
    const [sx, sy] = toStage(x, y), z = cam.zoom;     // stored in stage px so they stay put when the scope pans
    E.embers.push({
      x0: sx, x: sx, y: sy, age: 0, life: 1.4 + Math.random() * 1.8, kind: e.kind,
      vy: -(0.8 + Math.random() * 1.0) * g.kb / z, ay: -(0.4 + Math.random() * 0.9) * g.kb / z,
      amp: (0.03 + Math.random() * 0.09) * g.kb / z, freq: 3 + Math.random() * 4, ph: Math.random() * 6,
      drift: (Math.random() - 0.5) * 0.25 * g.kb / z, size: (1 + Math.random() * 1.8) * sc / z,
    });
  }
}
function updateEmbers(dt) {
  for (const p of E.embers) {
    p.age += dt; p.vy += p.ay * dt; p.y += p.vy * dt;
    p.x = p.x0 + p.drift * p.age + Math.sin(p.age * p.freq + p.ph) * p.amp * Math.min(3, 0.3 + p.age * 1.6);
  }
  E.embers = E.embers.filter(p => p.age < p.life);
}
const dyingLine = (e, g) => lerp(g.box[3] + 2, g.box[1] - g.kb * 0.1, e.dissolve);

// ---------- figure renderer: silhouettes -> blur chain -> additive glow ----------
// opts.mask: canvas (view size) of where figures may show (window openings). opts.reflect: wet-floor mirror.
function drawFigures(list, t, opts = {}) {
  const W = E.W, H = E.H;
  fctx.clearRect(0, 0, W, H); cctx.clearRect(0, 0, W, H); wpctx.clearRect(0, 0, W, H);
  hctx.clearRect(0, 0, half.width, half.height);
  for (const e of [...list].filter(e => e.z > 0.8).sort((a, b) => b.z - a.z)) {   // nothing behind the lens
    const g = e.geom = buildBody(e, t), c = COL[e.kind];
    const burning = e.dissolve > 0;
    const a = Math.min(1, e.alpha) * (0.82 + 0.18 * hash(e.id, 999, Math.floor(t * 20))) * (burning ? 1 - e.dissolve * 0.3 : 1);
    fctx.save();
    if (burning) { fctx.beginPath(); fctx.rect(0, 0, W, dyingLine(e, g)); fctx.clip(); emitEmbers(e); }
    fctx.fillStyle = e.hitFlash > 0 ? `rgba(255,255,255,${a})` : `rgba(${c.aura},${a})`;
    fctx.fill(g.path);
    fctx.restore();
    if (burning) {                                        // white-hot burning edge
      const line = dyingLine(e, g);
      fctx.save(); fctx.clip(g.path);
      fctx.fillStyle = `rgba(${c.core},0.95)`; fctx.fillRect(0, line - g.kb * 0.025, W, g.kb * 0.04);
      fctx.restore();
    }
    const [chx, chy] = g.chest, cg = cctx.createRadialGradient(chx, chy, 0, chx, chy, g.kb * 0.6);
    cg.addColorStop(0, `rgba(${c.core},${0.55 * a})`); cg.addColorStop(1, `rgba(${c.core},0)`);
    cctx.fillStyle = cg; cctx.fillRect(chx - g.kb, chy - g.kb, g.kb * 2, g.kb * 2);
    const [hx, hy, hr] = g.head, hg = cctx.createRadialGradient(hx, hy, 0, hx, hy, hr * 1.6);
    hg.addColorStop(0, `rgba(${c.core},${0.45 * a})`); hg.addColorStop(1, `rgba(${c.core},0)`);
    cctx.fillStyle = hg; cctx.fillRect(hx - hr * 2, hy - hr * 2, hr * 4, hr * 4);
    if (opts.reflect) {
      hctx.save(); hctx.scale(half.width / W, half.height / H);
      hctx.translate(0, g.feetY); hctx.scale(1, -0.6); hctx.translate(0, -g.feetY);
      hctx.globalAlpha = 0.28 * a * (burning ? 1 - e.dissolve : 1); hctx.fillStyle = `rgba(${c.aura},1)`; hctx.fill(g.path);
      hctx.restore();
    }
    if (g.weapon) {
      wpctx.globalAlpha = e.dying ? Math.max(0, 1 - (e.deathT || 0) * 2.5) : 1;   // weapon drops away as he falls
      wpctx.fillStyle = "rgba(6,7,9,0.97)"; wpctx.fill(g.weapon);
      wpctx.strokeStyle = `rgba(${c.aura},0.3)`; wpctx.lineWidth = 0.8; wpctx.stroke(g.weapon);
      wpctx.globalAlpha = 1;
    }
  }
  if (opts.embers !== false) for (const p of E.embers) {
    const u = p.age / p.life, c = COL[p.kind], rgb = u < 0.15 ? c.core : u < 0.55 ? c.aura : c.ember;
    const [x, y] = toView(p.x, p.y), s = p.size * cam.zoom * (1 - u * 0.5);
    fctx.fillStyle = `rgba(${rgb},${Math.pow(1 - u, 1.2)})`; fctx.fillRect(x - s / 2, y - s / 2, s, s);
  }
  if (opts.mask) for (const c of [fctx, wpctx]) {
    c.globalCompositeOperation = "destination-in"; c.drawImage(opts.mask, 0, 0); c.globalCompositeOperation = "source-over";
  }
  cctx.globalCompositeOperation = "destination-in"; cctx.drawImage(F, 0, 0); cctx.globalCompositeOperation = "source-over";
  // blur chain by downsampling
  hctx.drawImage(F, 0, 0, half.width, half.height);
  s1ctx.clearRect(0, 0, s1.width, s1.height); s1ctx.drawImage(half, 0, 0, s1.width, s1.height);
  s2ctx.clearRect(0, 0, s2.width, s2.height); s2ctx.drawImage(s1, 0, 0, s2.width, s2.height);
  // rim = body minus its own blur: only the edge band survives
  rmctx.globalCompositeOperation = "source-over"; rmctx.clearRect(0, 0, W, H); rmctx.drawImage(F, 0, 0);
  rmctx.globalCompositeOperation = "destination-out"; rmctx.drawImage(s1, 0, 0, W, H);
  if (opts.outline) {                                      // dark halo behind the bodies so they read on bright scenery
    olctx.globalCompositeOperation = "copy"; olctx.drawImage(s1, 0, 0);
    olctx.globalCompositeOperation = "source-in"; olctx.fillStyle = "#05060a"; olctx.fillRect(0, 0, OL.width, OL.height);
    sctx.globalAlpha = opts.outline; sctx.drawImage(OL, 0, 0, W, H); sctx.drawImage(OL, 0, 0, W, H); sctx.globalAlpha = 1;
  }
  // body opaque first so it stays saturated, then additive halo / glow / rim / core
  sctx.globalAlpha = 0.88; sctx.drawImage(F, 0, 0);
  sctx.globalCompositeOperation = "lighter";
  for (const [src, a] of [[s2, 0.6], [s1, 0.28], [Rm, 1], [C, 0.25]]) { sctx.globalAlpha = a; sctx.drawImage(src, 0, 0, W, H); }
  sctx.globalCompositeOperation = "source-over"; sctx.globalAlpha = 1;
  sctx.drawImage(Wp, 0, 0);
}

function hitTest(list, vx, vy) {
  for (const e of list.filter(e => !e.dying && e.geom && e.alpha > 0.3 && e.z > 0.8).sort((a, b) => a.z - b.z)) {
    const [hx, hy, hr] = e.geom.head, head = Math.hypot(vx - hx, vy - hy) < hr;
    if (head || sctx.isPointInPath(e.geom.path, vx, vy)) return { e, head };
  }
  return null;
}

// ---------- post: shake, grain, sensor flicker, vignette ----------
function post(t, fx) {
  const { VW, VH } = E, s = (fx.shake || 0) + 0.8;
  const ox = (Math.sin(t * 13.1) + Math.sin(t * 7.3)) * s * 0.5, oy = (Math.cos(t * 11.7) + Math.sin(t * 5.1)) * s * 0.5;
  vctx.fillStyle = "#0b0d10"; vctx.fillRect(0, 0, VW, VH);
  if (fx.pixel) pixelate(fx.pixel, ox, oy, s);
  else vctx.drawImage(scene, ox - s, oy - s, VW + 2 * s, VH + 2 * s);
  vctx.globalCompositeOperation = "overlay"; vctx.globalAlpha = fx.pixel ? 0.12 : 0.55;
  const tile = grain[(Math.random() * 4) | 0], gx = -Math.random() * 256, gy = -Math.random() * 256;
  for (let y = gy; y < VH; y += 256) for (let x = gx; x < VW; x += 256) vctx.drawImage(tile, x, y);
  vctx.globalCompositeOperation = "screen"; vctx.globalAlpha = 0.07;
  for (let y = gy; y < VH; y += 256) for (let x = gx; x < VW; x += 256) vctx.drawImage(tile, x, y);
  vctx.globalCompositeOperation = "source-over"; vctx.globalAlpha = 1;
  vctx.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.06})`; vctx.fillRect(0, 0, VW, VH);
  vctx.fillStyle = vignette; vctx.fillRect(0, 0, VW, VH);
  if (fx.dmg > 0) { vctx.fillStyle = `rgba(160,0,0,${fx.dmg * 0.6})`; vctx.fillRect(0, 0, VW, VH); }
}

// ---------- optional pixel-art pass (post fx.pixel = {cell, levels, dots, grain, sat, contrast, lift}) ----------
// The scene is shrunk to a coarse grid, stepped to a few levels per channel
// through a 4x4 ordered (Bayer) dither in a gamma-ish space so the darks keep
// detail, sensor grain is added per cell, and an optional dark mesh turns each
// cell into a round dot, like a cross-stitch.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
let pix = null, pixctx = null, pixLut = null, pixLutL = 0, dotPat = null, dotKey = "";
function pixelate(o, ox, oy, s) {
  const k = E.VW / innerWidth, cell = Math.max(2, Math.round((o.cell || 4) * k)), pw = Math.ceil(E.VW / cell) + 1, ph = Math.ceil(E.VH / cell) + 1;
  if (!pix || pix.width !== pw || pix.height !== ph) { pix = mk(pw, ph); pixctx = pix.getContext("2d", { willReadFrequently: true }); pixctx.imageSmoothingQuality = "high"; }
  const L = o.levels || 7;
  if (pixLutL !== L) {                         // [value][bayer cell] -> stepped value
    pixLut = new Uint8Array(256 * 16); pixLutL = L;
    for (let v = 0; v < 256; v++) for (let b = 0; b < 16; b++) {
      const q = clamp(Math.floor(Math.sqrt(v / 255) * (L - 1) + (b + 0.5) / 16), 0, L - 1) / (L - 1);
      pixLut[v * 16 + b] = Math.round(q * q * 255);
    }
  }
  pixctx.drawImage(scene, 0, 0, E.W, E.H, 0, 0, E.VW / cell, E.VH / cell);
  const img = pixctx.getImageData(0, 0, pw, ph), d = img.data, gr = o.grain ?? 14, sat = o.sat ?? 1.12, con = o.contrast ?? 1, lift = o.lift ?? 0;
  for (let y = 0, i = 0; y < ph; y++) for (let x = 0; x < pw; x++, i += 4) {
    const b = BAYER4[(y & 3) * 4 + (x & 3)], n = (Math.random() - 0.5) * gr;
    const r = d[i], g = d[i + 1], bl = d[i + 2], m = (r + g + bl) / 3, c = v => (v - 96) * con + 96 + lift + n;   // contrast pivots low: night scenes stay dark, lit parts punch
    d[i] = pixLut[clamp(c(m + (r - m) * sat), 0, 255) << 4 | b];
    d[i + 1] = pixLut[clamp(c(m + (g - m) * sat), 0, 255) << 4 | b];
    d[i + 2] = pixLut[clamp(c(m + (bl - m) * sat), 0, 255) << 4 | b];
  }
  pixctx.putImageData(img, 0, 0);
  vctx.imageSmoothingEnabled = false;
  vctx.drawImage(pix, Math.round(ox - s), Math.round(oy - s), pw * cell, ph * cell);
  vctx.imageSmoothingEnabled = true;
  if (o.dots) {                                // dark mesh between round dots
    const key = cell + ":" + o.dots;
    if (dotKey !== key) {
      const tl = mk(cell, cell), c = tl.getContext("2d");
      c.fillStyle = `rgba(0,0,0,${o.dots})`; c.fillRect(0, 0, cell, cell);
      c.globalCompositeOperation = "destination-out"; c.beginPath(); c.arc(cell / 2, cell / 2, cell * 0.46, 0, 7); c.fill();
      dotPat = vctx.createPattern(tl, "repeat"); dotKey = key;
    }
    vctx.save(); vctx.translate(Math.round(ox - s), Math.round(oy - s)); vctx.fillStyle = dotPat; vctx.fillRect(-cell, -cell, E.VW + 2 * cell, E.VH + 2 * cell); vctx.restore();
  }
}

// ---------- HUD helpers ----------
const hudK = () => E.VW / innerWidth;
function glowText(txt, x, y, size, rgb, a, align) {
  vctx.font = `${size}px ui-monospace, Menlo, Consolas, monospace`;
  vctx.textAlign = align || "center"; vctx.textBaseline = "middle";
  vctx.shadowColor = `rgba(${rgb},${a * 0.8})`; vctx.shadowBlur = size * 0.6;
  vctx.fillStyle = `rgba(${rgb},${a * 0.5})`; vctx.fillText(txt, x, y);
  vctx.shadowBlur = 0; vctx.fillStyle = `rgba(${rgb},${a})`; vctx.fillText(txt, x, y);
}
function pinDot(mx, my, k) {
  vctx.fillStyle = "rgba(0,0,0,0.85)"; vctx.beginPath(); vctx.arc(mx, my, 2.6 * k, 0, 7); vctx.fill();
  vctx.fillStyle = "#fff"; vctx.beginPath(); vctx.arc(mx, my, 1.4 * k, 0, 7); vctx.fill();
}
function crosshair(mx, my, k, r = 14) {
  vctx.strokeStyle = "rgba(220,235,255,0.85)"; vctx.lineWidth = 1.5 * k;
  vctx.shadowColor = "rgba(150,200,255,0.9)"; vctx.shadowBlur = 8 * k;
  vctx.beginPath(); vctx.arc(mx, my, r * k, 0, 7); vctx.stroke();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    vctx.beginPath(); vctx.moveTo(mx + dx * (r - 6) * k, my + dy * (r - 6) * k); vctx.lineTo(mx + dx * (r + 6) * k, my + dy * (r + 6) * k); vctx.stroke();
  }
  vctx.shadowBlur = 0; pinDot(mx, my, k);
}
function recDot(t) {
  const k = hudK(), pad = 28 * k;
  glowText(`${Math.floor(t * 2) % 2 ? "●" : " "} REC  NIGHT`, E.VW - pad, pad, 14 * k, "255,90,80", 0.7, "right");
}

// ---------- audio: shaped noise bursts ----------
let actx;
function noise(len, type, freq, gain, decay) {
  try {
    actx = actx || new AudioContext();
    const b = actx.createBuffer(1, Math.max(1, actx.sampleRate * len), actx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, decay);
    const src = actx.createBufferSource(), fl = actx.createBiquadFilter(), gn = actx.createGain();
    fl.type = type; fl.frequency.value = freq; gn.gain.value = gain;
    src.buffer = b; src.connect(fl).connect(gn).connect(actx.destination); src.start();
  } catch (_) { /* audio unavailable */ }
}
const sfx = {
  shot:    () => noise(0.25, "lowpass", 1400, 0.6, 3),
  sniper:  () => { noise(0.6, "lowpass", 800, 0.9, 2.2); noise(0.08, "highpass", 3000, 0.25, 2); },
  bolt:    () => { noise(0.04, "bandpass", 2500, 0.25, 1); setTimeout(() => noise(0.05, "bandpass", 1700, 0.25, 1), 160); },
  empty:   () => noise(0.03, "lowpass", 3000, 0.2, 1),
  reload:  () => noise(0.06, "bandpass", 2200, 0.25, 1),
  distant: () => noise(0.4, "lowpass", 500, 0.45, 2.5),
  glass:   () => noise(0.2, "highpass", 4500, 0.18, 2),
  thud:    () => noise(0.12, "lowpass", 300, 0.4, 2),
  ping:    () => noise(0.07, "bandpass", 3600, 0.3, 3),
  enemy:   () => noise(0.3, "lowpass", 900, 0.5, 3),
  twang:   k => { noise(0.18, "bandpass", 180 + 160 * (k ?? 1), 0.5, 2.5); noise(0.05, "highpass", 2400, 0.15, 2); },   // bow string, pitch with draw
  creak:   () => noise(0.15, "bandpass", 420, 0.06, 1),
  thunk:   () => noise(0.09, "lowpass", 520, 0.45, 3),                                     // arrow into wood / earth
  flesh:   () => noise(0.1, "lowpass", 260, 0.5, 2.5),
  howl:    () => { try { actx = actx || new AudioContext(); const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
             o.type = "sawtooth"; o.frequency.setValueAtTime(260, t); o.frequency.linearRampToValueAtTime(520, t + 0.5); o.frequency.linearRampToValueAtTime(380, t + 1.4);
             g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + 1.5);
             const f = actx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900; o.connect(f).connect(g).connect(actx.destination); o.start(t); o.stop(t + 1.6); } catch (_) {} },
  shout:   () => noise(0.35, "bandpass", 700, 0.35, 1.5),
};

// ---------- input + loop ----------
function bindInput() {
  view.addEventListener("pointermove", ev => { E.mouse.x = ev.clientX; E.mouse.y = ev.clientY; });
  // mouse buttons via mouse events: a second button pressed while one is held (scope + fire)
  // fires no new pointerdown, but always fires mousedown
  view.addEventListener("mousedown", ev => {
    E.mouse.x = ev.clientX; E.mouse.y = ev.clientY;
    E.level.onDown && E.level.onDown(ev.button);
  });
  addEventListener("mouseup", ev => E.level.onUp && E.level.onUp(ev.button));
  view.addEventListener("pointerdown", ev => {
    if (ev.pointerType === "mouse") return;
    E.mouse.x = ev.clientX; E.mouse.y = ev.clientY;
    E.level.onDown && E.level.onDown(0);
  });
  view.addEventListener("contextmenu", ev => ev.preventDefault());
  view.addEventListener("wheel", ev => { ev.preventDefault(); E.level.onWheel && E.level.onWheel(ev.deltaY); }, { passive: false });
  addEventListener("keydown", ev => {
    if (["Space", "ShiftLeft", "ShiftRight"].includes(ev.code)) ev.preventDefault();
    if (E.keys[ev.code]) return;
    E.keys[ev.code] = true; E.level.onKey && E.level.onKey(ev.code);
  });
  addEventListener("keyup", ev => { E.keys[ev.code] = false; });
  addEventListener("blur", () => { E.keys = {}; E.level.onUp && E.level.onUp(2); });
}
let lastTs = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0); lastTs = ts;
  const t = ts / 1000;
  requestAnimationFrame(frame);                  // schedule first: one bad frame must not freeze the game
  E.level.update(dt, t); E.level.render(t);
}
function startEngine(canvas, level) {
  view = canvas; vctx = view.getContext("2d");
  bindInput(); addEventListener("resize", engineResize);
  E.mouse.x = innerWidth / 2; E.mouse.y = innerHeight / 2;
  setLevel(level);
  requestAnimationFrame(ts => { lastTs = ts; frame(ts); });
}
function setLevel(level) { hidePanel(); E.level = level; E.embers.length = 0; level.init(); engineResize(); }

// HTML panel for briefings and end screens: crisp text, real buttons
function showPanel(html, actions = {}) {
  const p = document.getElementById("panel"); if (!p) return;
  p.innerHTML = html; p.hidden = false;
  for (const [id, fn] of Object.entries(actions)) { const b = p.querySelector("#" + id); if (b) b.onclick = fn; }
  const first = p.querySelector("button"); if (first) first.focus({ preventScroll: true });
}
function hidePanel() { const p = document.getElementById("panel"); if (p) { p.hidden = true; p.innerHTML = ""; } }
