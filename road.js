"use strict";
// =====================================================================
// Prototype: the night road. Orange walkers come one at a time, then in
// waves, and lunge to grab you. Becomes the base of Level 5 (mansion).
// =====================================================================
const RoadLevel = (() => {
  const SOLO_KILLS = 6, WAVES = [3, 4, 6], ATTACK_Z = 2.3, MAG = 8;
  let W, H, f, hor, cx, bg, bctx, fogTex;
  const proj = (x, y, z) => stage(x, y, z);
  let enemies, hp, ammo, kills, phase, waveIdx, nextSpawn, msg, msgT, shake, dmgFlash, muzzle, over, helpT;

  function fogTexture(w, h, seed) {
    // tileable-in-x value noise, soft band; drifted across the horizon each frame
    const r = mulberry(seed), c = mk(w, h), x = c.getContext("2d"), img = x.createImageData(w, h);
    const oct = [[6, 0.5], [12, 0.27], [24, 0.15], [48, 0.08]].map(([n, amp]) => {
      const gh = Math.ceil(n * h / w) + 2; return { n, amp, gh, v: Array.from({ length: n * gh }, r) };
    });
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
      let v = 0;
      for (const o of oct) {
        const gx = i / w * o.n, gy = y / w * o.n, x0 = Math.floor(gx), y0 = Math.floor(gy);
        const fx = smooth(gx - x0), fy = smooth(gy - y0), x1 = (x0 + 1) % o.n;
        const g = (xx, yy) => o.v[Math.min(yy, o.gh - 1) * o.n + (xx % o.n)];
        v += lerp(lerp(g(x0, y0), g(x1, y0), fx), lerp(g(x0, y0 + 1), g(x1, y0 + 1), fx), fy) * o.amp;
      }
      const band = Math.pow(Math.sin(Math.PI * y / h), 1.6);
      const a = Math.max(0, Math.min(1, (v - 0.38) * 2.2)) * band;
      const p = (y * w + i) * 4;
      img.data[p] = 150; img.data[p + 1] = 163; img.data[p + 2] = 182; img.data[p + 3] = a * 255;
    }
    x.putImageData(img, 0, 0); return c;
  }
  
  function drawBackground() {
    const rnd = mulberry(11), b = bctx;
    // sky + ground
    const g = b.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0c1015"); g.addColorStop(0.3, "#161b22");
    g.addColorStop(0.42, "#2a313b"); g.addColorStop(0.5, "#1a1f26"); g.addColorStop(1, "#090b0e");
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    // distant lamp washing the fog at the end of the road
    const lg = b.createRadialGradient(cx + W * 0.03, hor - H * 0.02, 0, cx, hor, W * 0.45);
    lg.addColorStop(0, "rgba(185,198,215,0.16)"); lg.addColorStop(0.3, "rgba(150,165,185,0.06)"); lg.addColorStop(1, "rgba(0,0,0,0)");
    b.fillStyle = lg; b.fillRect(0, 0, W, H);
  
    // three tree lines, each further one swallowed more by fog
    for (const [z, col, base] of [[70, "rgba(28,34,42,0.55)", 7], [42, "rgba(18,22,28,0.7)", 8], [24, "rgba(10,13,17,0.85)", 9]]) {
      treeLine(z, col, base, rnd);
    }
  
    // road surface
    const [nlx, ny] = proj(-2.8, 0, 0.9), [nrx] = proj(2.8, 0, 0.9);
    const road = b.createLinearGradient(0, hor, 0, H);
    road.addColorStop(0, "rgba(60,70,82,0.6)"); road.addColorStop(0.25, "rgba(30,35,42,0.8)"); road.addColorStop(1, "rgba(14,16,20,1)");
    b.fillStyle = road;
    b.beginPath(); b.moveTo(cx - 1, hor); b.lineTo(cx + 1, hor); b.lineTo(nrx, ny); b.lineTo(nlx, ny); b.fill();
    // asphalt speckle
    for (let i = 0; i < 5000; i++) {
      const z = 1 + Math.pow(rnd(), 2.2) * 50, x = (rnd() - 0.5) * 5.4, [px, py] = proj(x, 0, z);
      b.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "120,135,150"},${0.12 * rnd()})`;
      const s = Math.max(0.6, 3 / z); b.fillRect(px, py, s, s);
    }
    // wet sheen: the lamp smeared down the road
    const sh = b.createLinearGradient(0, hor, 0, H);
    sh.addColorStop(0, "rgba(170,185,205,0.12)"); sh.addColorStop(0.4, "rgba(140,155,175,0.03)"); sh.addColorStop(1, "rgba(0,0,0,0)");
    b.save(); b.filter = "blur(6px)"; b.fillStyle = sh;
    b.beginPath(); b.moveTo(cx - 2, hor); b.lineTo(cx + 2, hor); b.lineTo(cx + W * 0.2, H); b.lineTo(cx - W * 0.14, H); b.fill(); b.restore();
    // puddles
    for (let i = 0; i < 9; i++) {
      const z = 3 + rnd() * 18, x = (rnd() - 0.5) * 4, [px, py] = proj(x, 0, z);
      const rx = (0.4 + rnd() * 0.9) * f / z, ry = rx * cam.camH / z * 0.9;
      const pg = b.createRadialGradient(px, py, 0, px, py, rx);
      pg.addColorStop(0, `rgba(150,165,185,${0.1 - z / 300})`); pg.addColorStop(0.8, "rgba(90,100,115,0.04)"); pg.addColorStop(1, "rgba(0,0,0,0)");
      b.fillStyle = pg; b.beginPath(); b.ellipse(px, py, rx, ry, 0, 0, 7); b.fill();
    }
    // edge lines (worn, broken) + centre dashes
    const fogA = z => Math.max(0, 0.6 - z / 60);
    b.lineCap = "round";
    for (let z = 1.1; z < 70; z *= 1.06) {
      if (rnd() < 0.25) continue;
      for (const x of [-2.5, 2.5]) {
        const [a1, b1] = proj(x, 0, z), [c1, d1] = proj(x, 0, z * 1.06);
        b.strokeStyle = `rgba(160,172,190,${fogA(z) * 0.22})`; b.lineWidth = Math.max(0.5, 5 / z);
        b.beginPath(); b.moveTo(a1, b1); b.lineTo(c1, d1); b.stroke();
      }
    }
    for (let z = 1.5; z < 60; z += 3) {
      const [a1, b1] = proj(0, 0, z), [c1, d1] = proj(0, 0, z + 1.3);
      b.strokeStyle = `rgba(160,172,190,${fogA(z) * 0.14})`; b.lineWidth = Math.max(0.5, 4 / z);
      b.beginPath(); b.moveTo(a1, b1); b.lineTo(c1, d1); b.stroke();
    }
    // verge grass at road edges
    for (let i = 0; i < 1400; i++) {
      const side = rnd() < 0.5 ? -1 : 1, z = 1.2 + Math.pow(rnd(), 1.8) * 40, x = side * (2.8 + rnd() * 3);
      const [px, py] = proj(x, 0, z), h = (0.15 + rnd() * 0.45) * f / z;
      b.strokeStyle = `rgba(6,8,11,${0.75 - z / 70})`; b.lineWidth = Math.max(0.5, 2.2 / z);
      b.beginPath(); b.moveTo(px, py); b.quadraticCurveTo(px + (rnd() - 0.5) * h * 0.3, py - h * 0.6, px + (rnd() - 0.5) * h * 0.7, py - h); b.stroke();
    }
  
    // fence posts on the right
    b.strokeStyle = "rgba(6,8,11,0.6)";
    for (let z = 2; z < 40; z += 2.5) {
      const [px, py] = proj(3.6, 0, z), [, ty] = proj(3.6, 1.1, z);
      b.lineWidth = Math.max(0.6, 6 / z); b.beginPath(); b.moveTo(px, py); b.lineTo(px + (rnd() - 0.5) * 3 / z * 8, ty); b.stroke();
    }
    for (const wy of [0.95, 0.6]) {
      b.lineWidth = 0.7; b.beginPath();
      for (let z = 2; z < 40; z += 2.5) {
        const [a1, b1] = proj(3.6, wy, z), [c1, d1] = proj(3.6, wy, z + 2.5), [, sg] = proj(3.6, wy - 0.12, z + 1.25);
        if (z === 2) b.moveTo(a1, b1); b.quadraticCurveTo((a1 + c1) / 2, sg, c1, d1);
      }
      b.stroke();
    }
  
    // telephone poles, crossarms, sagging wires running overhead past the camera
    const poleZ = []; for (let z = 4; z < 75; z += 10) poleZ.push(z);
    for (const x of [-4.2, 4.6]) for (const z of poleZ) {
      const [px, py] = proj(x, 0, z), [tx, ty] = proj(x, 8, z);
      b.strokeStyle = `rgba(5,7,10,${0.95 - z / 85})`;
      b.lineWidth = Math.max(1, 16 / z); b.beginPath(); b.moveTo(px, py); b.lineTo(tx, ty); b.stroke();
      for (const ay of [7.5, 6.8]) {
        const [ax, aY] = proj(x - 1, ay, z), [bx] = proj(x + 1, ay, z);
        b.lineWidth = Math.max(0.7, 7 / z); b.beginPath(); b.moveTo(ax, aY); b.lineTo(bx, aY); b.stroke();
      }
    }
    b.lineWidth = 0.9;
    for (const x of [-4.2, 4.6]) for (const [dx, wy] of [[-0.9, 7.5], [-0.3, 7.5], [0.4, 7.5], [0.9, 7.5], [-0.6, 6.8], [0.6, 6.8]]) {
      b.strokeStyle = "rgba(5,7,10,0.6)"; b.beginPath();
      const zs = [0.9, ...poleZ];
      for (let i = 0; i < zs.length - 1; i++) {
        const [a1, b1] = proj(x + dx, wy, zs[i]), [c1, d1] = proj(x + dx, wy, zs[i + 1]);
        const [, sg] = proj(x + dx, wy - 0.7, (zs[i] + zs[i + 1]) / 2);
        if (i === 0) b.moveTo(a1, b1); b.quadraticCurveTo((a1 + c1) / 2, sg, c1, d1);
      }
      b.stroke();
    }
  
    // bare trees: mid-distance ones, then two big ones crowding the frame edges
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1, z = 6 + rnd() * 30, x = side * (6.5 + rnd() * 6);
      const [bx, by] = proj(x, 0, z), h = (6 + rnd() * 5) * f / z;
      tree(bx, by, -Math.PI / 2 + (rnd() - 0.5) * 0.2, h * 0.38, Math.max(1, 22 / z), 6, rnd, `rgba(4,6,9,${0.85 - z / 55})`);
    }
    tree(W * 0.97, H * 1.05, -Math.PI / 2 - 0.25, H * 0.42, W * 0.018, 8, rnd, "rgba(3,4,6,0.92)");
    tree(W * 0.02, H * 1.05, -Math.PI / 2 + 0.2, H * 0.36, W * 0.014, 7, rnd, "rgba(3,4,6,0.9)");
  
    // foreground grass in the bottom corners
    for (let i = 0; i < 260; i++) {
      const left = rnd() < 0.5, x = left ? rnd() * W * 0.3 : W - rnd() * W * 0.3;
      const edge = left ? x / (W * 0.3) : (W - x) / (W * 0.3), h = H * (0.04 + rnd() * 0.16) * (1 - edge * 0.8);
      b.strokeStyle = `rgba(3,4,6,${0.95 - edge * 0.4})`; b.lineWidth = 0.8 + rnd() * 1.6;
      b.beginPath(); b.moveTo(x, H + 2);
      b.quadraticCurveTo(x + (rnd() - 0.5) * h * 0.4, H - h * 0.6, x + (rnd() - 0.5) * h * 0.8, H - h); b.stroke();
    }
    // final fog veil over the horizon band
    const veil = b.createLinearGradient(0, hor - H * 0.2, 0, hor + H * 0.12);
    veil.addColorStop(0, "rgba(40,47,57,0)"); veil.addColorStop(0.6, "rgba(40,47,57,0.35)"); veil.addColorStop(1, "rgba(40,47,57,0)");
    b.fillStyle = veil; b.fillRect(0, 0, W, H);
  
    fogTex = fogTexture(512, 96, 3);
  }
  
  function treeLine(z, col, base, rnd) {
    const b = bctx, [, gy] = proj(0, 0, z), p1 = rnd() * 9, p2 = rnd() * 9;
    b.fillStyle = col; b.beginPath(); b.moveTo(0, gy + 2);
    for (let sx = 0; sx <= W + 2; sx += 2) {
      const wx = (sx - cx) * z / f;
      let h = base + 2.2 * Math.sin(wx * 0.12 + p1) + 1.4 * Math.sin(wx * 0.37 + p2) + rnd() * 1.4;
      if (rnd() < 0.05) h += 2 + rnd() * 3;                     // a taller crown
      const clear = Math.max(0, 1 - Math.max(0, Math.abs(wx) - 2.6) / 2.5);
      h *= 1 - clear * 0.92;                                    // gap where the road runs through
      b.lineTo(sx, gy - h * f / z);
    }
    b.lineTo(W, gy + 2); b.fill();
    // spindly tops poking out of the canopy
    b.strokeStyle = col;
    for (let i = 0; i < 18; i++) {
      const sx = rnd() * W, wx = (sx - cx) * z / f;
      if (Math.abs(wx) < 6) continue;
      tree(sx, gy - base * 0.6 * f / z, -Math.PI / 2, (3 + rnd() * 3) * f / z, Math.max(0.6, 6 / z), 4, rnd, col);
    }
  }
  
  function tree(x, y, a, len, w, depth, rnd, col) {
    if (depth === 0 || len < 1.5 || w < 0.3) return;
    const b = bctx, bend = (rnd() - 0.5) * 0.6;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    const mx = (x + x2) / 2 + Math.cos(a + Math.PI / 2) * bend * len * 0.25, my = (y + y2) / 2 + Math.sin(a + Math.PI / 2) * bend * len * 0.25;
    b.strokeStyle = col; b.lineWidth = w; b.lineCap = "round";
    b.beginPath(); b.moveTo(x, y); b.quadraticCurveTo(mx, my, x2, y2); b.stroke();
    const n = depth > 5 ? 2 : 2 + (rnd() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const na = a + (i - (n - 1) / 2) * (0.35 + rnd() * 0.45) + (rnd() - 0.5) * 0.3;
      tree(x2, y2, na, len * (0.62 + rnd() * 0.18), w * 0.62, depth - 1, rnd, col);
    }
  }
  

  function say(m) { msg = m; msgT = 2.5; }
  function init() {
    enemies = []; hp = 100; ammo = MAG; kills = 0;
    phase = "solo"; waveIdx = 0; nextSpawn = 1.5; shake = 0; dmgFlash = 0; muzzle = 0; over = null; helpT = 6;
    say("HOLD THE ROAD");
  }
  function resize() {
    W = E.W; H = E.H; f = cam.f = H * 0.9; hor = cam.hor = H * 0.42; cx = cam.cx = W / 2; cam.camH = 1.6;
    bg = mk(W, H); bctx = bg.getContext("2d");
    drawBackground();
  }
  function spawn(fromSide) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const e = makeFigure({
      kind: "orange", alpha: 0, hp: 3, state: "walk", cyc: 0,
      x: fromSide ? side * (6 + Math.random() * 3) : (Math.random() - 0.5) * 4,
      z: fromSide ? 8 + Math.random() * 6 : 15 + Math.random() * 10,
      speed: fromSide ? 1.25 + Math.random() * 0.35 : 0.9 + Math.random() * 0.35,
    });
    e.tx = (Math.random() - 0.5) * 2.6;
    enemies.push(e);
  }

  function update(dt, t) {
    shake = Math.max(0, shake - dt * 40); dmgFlash = Math.max(0, dmgFlash - dt); muzzle = Math.max(0, muzzle - dt); helpT -= dt;
    msgT = over ? Math.max(1, msgT - dt) : msgT - dt;
    updateEmbers(dt);
    for (const e of enemies) if (e.dying) e.dying += dt / 1.4;
    enemies = enemies.filter(e => e.dying < 1);
    if (over) return;
    nextSpawn -= dt;
    const alive = enemies.filter(e => !e.dying).length;
    if (phase === "solo" && alive === 0 && nextSpawn <= 0) {
      if (kills >= SOLO_KILLS) { phase = "horde"; nextSpawn = 2.5; say("THEY'RE COMING"); }
      else { spawn(false); nextSpawn = 1.2; }
    } else if (phase === "horde" && alive === 0 && nextSpawn <= 0) {
      if (waveIdx >= WAVES.length) { over = "clear"; say("ROAD CLEAR"); return; }
      for (let i = 0; i < WAVES[waveIdx]; i++) spawn(i % 2 === 1);
      waveIdx++; nextSpawn = 2.5;
    }
    for (const e of enemies) {
      animate(e, dt);
      if (e.dying) continue;
      e.alpha = Math.min(1, e.alpha + dt * 1.2);
      if (e.state === "walk") {
        e.pose = e.z < 4.5 ? "reach" : "hang";        // arms come up only in the last couple of metres
        if (walkTo(e, e.tx, ATTACK_Z, dt) || e.z <= ATTACK_Z + 0.05) { e.state = "attack"; e.cyc = 0; }
      } else {
        // grab cycle: wind back, lunge at your face, clench, let go
        idle(e, dt); turnTo(e, 0, dt); e.pose = "reach";
        const prev = e.cyc; e.cyc = (e.cyc + dt) % 1.5;
        const c = e.cyc;
        e.grab = c < 0.55 ? -0.2 * smooth(c / 0.55)
               : c < 0.75 ? -0.2 + 1.2 * easeOut((c - 0.55) / 0.2)
               : c < 1.05 ? 1 : 1 - smooth((c - 1.05) / 0.45);
        e.curlOverride = c < 0.62 ? 0.05 : c < 0.8 ? 0.05 + 0.95 * smooth((c - 0.62) / 0.18) : c < 1.05 ? 1 : 1 - smooth((c - 1.05) / 0.4);
        e.z = ATTACK_Z - Math.max(0, e.grab) * 1.05 + e.stagger * 0.4;   // whole body lunges in
        if (prev < 0.74 && c >= 0.74) {
          hp -= 8; shake = 16; dmgFlash = 0.55;
          if (hp <= 0) { hp = 0; over = "dead"; say("YOU DIED"); }
        }
      }
    }
  }

  function render(t) {
    // background at partial alpha so glow leaves short ghost trails
    sctx.globalAlpha = 0.7; sctx.drawImage(bg, 0, 0); sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = "screen";
    for (const [speed, yOff, a, sc] of [[6, -0.08, 0.22, 1.6], [14, 0.0, 0.16, 2.2]]) {
      const w = W * sc, h = H * 0.3, x = -((t * speed) % w), y = hor - h / 2 + yOff * H;
      sctx.globalAlpha = a; sctx.drawImage(fogTex, x, y, w, h); sctx.drawImage(fogTex, x + w, y, w, h);
    }
    sctx.globalAlpha = 1; sctx.globalCompositeOperation = "source-over";
    drawFigures(enemies, t, { reflect: true });
    if (muzzle > 0) {
      const m = sctx.createRadialGradient(W * 0.55, H, 0, W * 0.55, H, H * 0.9);
      m.addColorStop(0, "rgba(255,220,170,0.35)"); m.addColorStop(1, "rgba(255,220,170,0)");
      sctx.globalCompositeOperation = "lighter"; sctx.fillStyle = m; sctx.fillRect(0, 0, W, H); sctx.globalCompositeOperation = "source-over";
    }
    post(t, { shake, dmg: dmgFlash });
    hud(t);
  }

  function hud(t) {
    const k = hudK(), pad = 28 * k, VW = E.VW, VH = E.VH;
    crosshair(E.mouse.x * k, E.mouse.y * k, k);
    for (let i = 0; i < MAG; i++) {
      vctx.fillStyle = i < ammo ? "rgba(220,235,255,0.8)" : "rgba(220,235,255,0.12)";
      vctx.fillRect(VW - pad - (i + 1) * 9 * k, VH - pad - 22 * k, 4 * k, 22 * k);
    }
    vctx.fillStyle = "rgba(200,210,225,0.12)"; vctx.fillRect(pad, VH - pad - 6 * k, 180 * k, 6 * k);
    vctx.fillStyle = hp > 30 ? "rgba(190,215,240,0.75)" : "rgba(255,60,50,0.9)";
    vctx.fillRect(pad, VH - pad - 6 * k, 180 * k * hp / 100, 6 * k);
    glowText(`KILLS ${kills}`, pad, pad, 14 * k, "200,215,235", 0.6, "left");
    recDot(t);
    if (msgT > 0) glowText(msg, VW / 2, VH * 0.2, 30 * k, over === "dead" ? "255,60,50" : "220,235,255", Math.min(1, msgT) * (0.7 + 0.3 * Math.random()));
    if (helpT > 0) glowText("CLICK  SHOOT     SPACE  RELOAD     ESC  MENU", VW / 2, VH - pad - 3 * k, 12 * k, "200,215,235", Math.min(1, helpT) * 0.5);
    if (ammo === 0 && !over) glowText("SPACE", VW - pad - 40 * k, VH - pad - 44 * k, 12 * k, "255,200,150", 0.5 + 0.5 * Math.sin(t * 8));
    if (over && msgT <= 1.5) glowText("CLICK TO RESTART", VW / 2, VH * 0.2 + 44 * k, 14 * k, "200,215,235", 0.6);
  }

  function reload() { if (ammo < MAG) { ammo = MAG; sfx.reload(); } }
  function onKey(code) { if (code === "Space" || code === "KeyR") reload(); }
  function onDown(button) {
    if (button === 2) return reload();
    if (button !== 0) return;
    if (over) { if (msgT <= 1.5) init(); return; }
    if (ammo === 0) { sfx.empty(); say("SPACE TO RELOAD"); return; }
    ammo--; sfx.shot(); muzzle = 0.08; shake = Math.max(shake, 3);
    const hit = hitTest(enemies, E.mouse.x * SCALE, E.mouse.y * SCALE);
    if (!hit) return;
    const e = hit.e;
    e.hp -= hit.head ? 3 : 1; e.hitFlash = 0.08; e.stagger = 1;
    if (e.state === "walk") e.z += 0.5;
    if (e.hp <= 0) { e.dying = 1e-4; kills++; if (phase === "solo") nextSpawn = 1.4; }
  }

  return { name: "road", init, resize, update, render, onKey, onDown };
})();
