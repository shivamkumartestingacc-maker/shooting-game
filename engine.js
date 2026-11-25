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
const cam = { f: 1, hor: 0, cx: 0, camH: 1.6, zoom: 1, fx: 0, fy: 0 };
let view, vctx, scene, sctx, F, fctx, C, cctx, Rm, rmctx, Wp, wpctx, half, hctx, s1, s1ctx, s2, s2ctx, vignette;

// stage = unzoomed scene pixels; view = what is on screen after scope zoom
const stage = (x, y, z) => [cam.cx + x * cam.f / z, cam.hor + (cam.camH - y) * cam.f / z];
const toView = (sx, sy) => [(sx - cam.fx) * cam.zoom + E.W / 2, (sy - cam.fy) * cam.zoom + E.H / 2];
const toStage = (vx, vy) => [(vx - E.W / 2) / cam.zoom + cam.fx, (vy - E.H / 2) / cam.zoom + cam.fy];
function project(x, y, z) {
  const k = cam.f / Math.max(0.5, z), [vx, vy] = toView(cam.cx + x * k, cam.hor + (cam.camH - y) * k);
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
  for (const c of [hctx, s1ctx, s2ctx]) c.imageSmoothingQuality = "high";
  vignette = vctx.createRadialGradient(E.VW / 2, E.VH / 2, Math.min(E.VW, E.VH) * 0.25, E.VW / 2, E.VH / 2, Math.max(E.VW, E.VH) * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(1, "rgba(0,0,0,0.85)");
  cam.zoom = 1; cam.fx = W / 2; cam.fy = H / 2; cam.cx = W / 2;
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
};
const POSE_UP = { hang: 0, head: 1, cower: 1, reach: 1, rifle: 0.4, aim: 0.4, knife: 0.2, raise: 1 };
const POSE_CURL = { hang: 0.35, head: 0.45, cower: 0.6, reach: 0.1, rifle: 0.95, aim: 0.95, knife: 0.95, raise: 0.95 };

function makeFigure(o) {
  const r = mulberry((Math.random() * 1e9) | 0);
  const e = Object.assign({
    id: ++E.idSeq, kind: "orange", x: 0, z: 10, y0: 0, yaw: 0, phase: r() * 6, speed: 1.1, walkW: 0,
    pose: "hang", kneel: 0, cower: 0, alpha: 1, hitFlash: 0, stagger: 0, dying: 0, grab: 0, tremble: 0,
    weapon: null, curlOverride: null,
    style: { lean: 0.02 + r() * 0.05, tilt: (r() - 0.5) * 0.3, build: 0.9 + r() * 0.22, stride: 0.85 + r() * 0.3 },
  }, o);
  e.kneelCur = e.kneel; e.cowerCur = e.cower;
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
  e.kneelCur = ease(e.kneelCur, e.kneel, 4, dt); e.cowerCur = ease(e.cowerCur, e.cower, 4, dt);
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
  const py = lerp(0.92 + bob, 0.5 - cw * 0.06, kn);
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
    return { hip, knee, foot, toeD: lerp(-0.15, 0.13, kn) };
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
  if (e.weapon) buildWeapon(e, sk, hands, P, geom);
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
  } else if (e.weapon === "knife") {
    let dir = norm3([R.hand[0] - R.elbow[0], R.hand[1] - R.elbow[1], R.hand[2] - R.elbow[2]]);
    if (e.pose === "raise") dir = dir.map(v => -v);          // ice-pick grip for the overhead stab
    const at = s => add3(R.hand, [dir[0] * s, dir[1] * s, dir[2] * s]);
    const a = P(at(0.04), 0), b = P(at(0.27), 0);
    capsule(w, a, b, 0.014 * a[2], 0.003 * b[2]);
    geom.blade = [a, b];
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
  for (const e of [...list].sort((a, b) => b.z - a.z)) {
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
  for (const p of E.embers) {
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
  // body opaque first so it stays saturated, then additive halo / glow / rim / core
  sctx.globalAlpha = 0.88; sctx.drawImage(F, 0, 0);
  sctx.globalCompositeOperation = "lighter";
  for (const [src, a] of [[s2, 0.6], [s1, 0.28], [Rm, 1], [C, 0.25]]) { sctx.globalAlpha = a; sctx.drawImage(src, 0, 0, W, H); }
  sctx.globalCompositeOperation = "source-over"; sctx.globalAlpha = 1;
  sctx.drawImage(Wp, 0, 0);
}

function hitTest(list, vx, vy) {
  for (const e of list.filter(e => !e.dying && e.geom && e.alpha > 0.3).sort((a, b) => a.z - b.z)) {
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
  vctx.drawImage(scene, ox - s, oy - s, VW + 2 * s, VH + 2 * s);
  vctx.globalCompositeOperation = "overlay"; vctx.globalAlpha = 0.55;
  const tile = grain[(Math.random() * 4) | 0], gx = -Math.random() * 256, gy = -Math.random() * 256;
  for (let y = gy; y < VH; y += 256) for (let x = gx; x < VW; x += 256) vctx.drawImage(tile, x, y);
  vctx.globalCompositeOperation = "screen"; vctx.globalAlpha = 0.07;
  for (let y = gy; y < VH; y += 256) for (let x = gx; x < VW; x += 256) vctx.drawImage(tile, x, y);
  vctx.globalCompositeOperation = "source-over"; vctx.globalAlpha = 1;
  vctx.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.06})`; vctx.fillRect(0, 0, VW, VH);
  vctx.fillStyle = vignette; vctx.fillRect(0, 0, VW, VH);
  if (fx.dmg > 0) { vctx.fillStyle = `rgba(160,0,0,${fx.dmg * 0.6})`; vctx.fillRect(0, 0, VW, VH); }
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
  E.level.update(dt, t); E.level.render(t);
  requestAnimationFrame(frame);
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
