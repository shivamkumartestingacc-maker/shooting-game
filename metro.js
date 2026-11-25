"use strict";
// =====================================================================
// Level 3: Metro Siege. Line 4, between stations. You stand at the back
// of the last carriage looking down the aisle. Red gunmen hide behind
// hostages and only peek out to fire; orange knife men rush down the
// aisle; blue passengers panic, run and duck. The train sways, tunnel
// lights strobe past the windows, and the carriage lights fail: in the
// dark only the living glow.
// =====================================================================
const MetroLevel = (() => {
  const HW = 1.45, CH = 2.25, Z0 = 0.4, ZF = 16, DOORS = [4.6, 10.4], DH = 0.65;
  const MAG = 12, RATE = 0.14, DMG = 12, STAB = 15, TELE = 0.9, TRAIN = 14;
  let W, H, G, figs, pairs, chargers, pax, poles, tunnel;

  // ------------------------------------------------------------------ setup
  function init() {
    G = { phase: "brief", hp: 100, ammo: MAG, cool: 0, shake: 0, dmg: 0, muzzle: 0, msg: "", msgT: 0, time: 0, shots: 0,
      endT: 0, reason: "", wave: 0, waveT: 0, light: 1, lightSt: "on", lightT: 7, flick: 1, door: 0, runT: 3, sparks: [], helpT: 8, ambient: 0 };
    figs = []; pairs = []; chargers = []; pax = [];
    tunnel = Array.from({ length: 8 }, (_, i) => ({ z: 4 + i * 11, side: i % 2 ? 1 : -1 }));
    // seated passengers face the aisle
    for (const [x, z] of [[-1.13, 2.4], [1.13, 3.2], [-1.13, 7.0], [1.13, 7.8], [-1.13, 12.4], [1.13, 13.3]]) {
      pax.push(add(makeFigure({ kind: "blue", x, z, yaw: x < 0 ? Math.PI / 2 : -Math.PI / 2, sit: 1, role: "seated" })));
    }
    for (const [x, z] of [[0.42, 5.8], [-0.4, 9.6]]) pax.push(add(makeFigure({ kind: "blue", x, z, yaw: x < 0 ? 0.6 : -0.6, pose: "strap", role: "standing" })));
    // the opening line-up: two gunmen with hostages, one knife man
    addPair(-0.3, 12.6, -1); addPair(0.5, 9.2, 1);
    addCharger(0.1, 11.2, 2.2);
    showBrief();
  }
  const add = e => { figs.push(e); return e; };
  function addPair(x, z, side, o = {}) {
    const hostage = add(makeFigure({ kind: "blue", x, z, yaw: 0, pose: "head", role: "shield", tremble: 0.8 }));
    const thug = add(makeFigure(Object.assign({ kind: "red", weapon: "pistol", x: x + side * 0.12, z: z + 0.45, yaw: 0, pose: "aim", role: "gunman" }, o)));
    pairs.push({ thug, hostage, side, peek: 0, st: "hide", tm: 1.5 + Math.random() * 2, x, z, fast: !!o.leader });
  }
  function addCharger(x, z, delay) {
    const e = add(makeFigure({ kind: "orange", weapon: "knife", x, z, yaw: 0, pose: "knife", speed: 3.1, role: "charger" }));
    chargers.push({ e, delay, st: "wait", tm: 0, tx: x }); return e;
  }

  function resize() {
    W = E.W; H = E.H;
    cam.f = H * 0.95; cam.hor = H * 0.44; cam.cx = W / 2; cam.camH = 1.62;
  }

  // ------------------------------------------------------------------ carriage
  const P = (x, y, z) => stage(x, y, Math.max(Z0, z));
  function shade(rgb, extra = 0) {
    const l = clamp(0.12 + 0.88 * G.light + G.ambient + extra, 0, 1.3), d = [4, 5, 7];
    return `rgb(${rgb.map((v, i) => Math.round(lerp(d[i], v, l))).join(",")})`;
  }
  function quad(pts, fill) { const g = sctx; g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.closePath(); g.fillStyle = fill; g.fill(); }
  const line = (a, b, style, w) => { const g = sctx; g.strokeStyle = style; g.lineWidth = w; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); };
  const wallSpans = () => { const s = []; let z = Z0; for (const d of DOORS) { s.push([z, d - DH]); z = d + DH; } s.push([z, ZF]); return s; };

  function drawCarriage(t) {
    const g = sctx, L = G.light;
    g.fillStyle = "#050608"; g.fillRect(0, 0, W, H);
    // far end wall with the connecting door
    quad([P(-HW, 0, ZF), P(HW, 0, ZF), P(HW, CH, ZF), P(-HW, CH, ZF)], shade([34, 39, 47]));
    const dOff = G.door * 0.85;
    quad([P(-0.46, 0, ZF), P(0.46, 0, ZF), P(0.46, 2.0, ZF), P(-0.46, 2.0, ZF)], "#020203");
    quad([P(-0.44 + dOff, 0, ZF - 0.01), P(0.44 + dOff, 0, ZF - 0.01), P(0.44 + dOff, 2.0, ZF - 0.01), P(-0.44 + dOff, 2.0, ZF - 0.01)], shade([28, 32, 39]));
    quad([P(-0.28 + dOff, 1.1, ZF - 0.02), P(0.28 + dOff, 1.1, ZF - 0.02), P(0.28 + dOff, 1.8, ZF - 0.02), P(-0.28 + dOff, 1.8, ZF - 0.02)], "#030405");
    // ceiling, floor, walls
    const cg = g.createLinearGradient(0, P(0, CH, Z0 + 1)[1], 0, cam.hor);
    cg.addColorStop(0, shade([40, 46, 54])); cg.addColorStop(1, shade([26, 30, 36]));
    quad([P(-HW, CH, Z0), P(HW, CH, Z0), P(HW, CH, ZF), P(-HW, CH, ZF)], cg);
    const fg = g.createLinearGradient(0, H, 0, cam.hor);
    fg.addColorStop(0, shade([30, 34, 40])); fg.addColorStop(1, shade([22, 25, 30]));
    quad([P(-HW, 0, Z0), P(HW, 0, Z0), P(HW, 0, ZF), P(-HW, 0, ZF)], fg);
    for (let z = 1; z < ZF; z += 1.2) line(P(-HW, 0, z), P(HW, 0, z), `rgba(0,0,0,0.25)`, 0.6);
    quad([P(-0.35, 0.001, Z0), P(0.35, 0.001, Z0), P(0.35, 0.001, ZF), P(-0.35, 0.001, ZF)], `rgba(150,160,175,${0.03 + 0.04 * L})`);
    for (const s of [-1, 1]) {
      const X = s * HW;
      quad([P(X, 0, Z0), P(X, CH, Z0), P(X, CH, ZF), P(X, 0, ZF)], shade([30, 35, 42]));
      // windows onto the tunnel
      for (const [a, b] of wallSpans()) {
        const za = a + 0.25, zb = b - 0.25; if (zb <= za) continue;
        const win = [P(X, 0.98, za), P(X, 1.82, za), P(X, 1.82, zb), P(X, 0.98, zb)];
        quad(win, "#020304");
        g.save(); g.beginPath(); g.moveTo(...win[0]); for (const p of win.slice(1)) g.lineTo(...p); g.closePath(); g.clip();
        for (const l of tunnel) if (l.side === s) {               // lamps streaking past outside
          const z0 = l.z - 1.6, z1 = l.z + 1.6, Xo = s * 2.4;
          const st = g.createLinearGradient(P(Xo, 1.4, z0)[0], 0, P(Xo, 1.4, z1)[0], 0);
          st.addColorStop(0, "rgba(220,226,236,0)"); st.addColorStop(0.5, "rgba(220,226,236,0.55)"); st.addColorStop(1, "rgba(220,226,236,0)");
          quad([P(Xo, 1.2, z0), P(Xo, 1.6, z0), P(Xo, 1.6, z1), P(Xo, 1.2, z1)], st);
        }
        for (const cy of [1.15, 1.25, 1.6]) line(P(s * 2.4, cy, za), P(s * 2.4, cy, zb), "rgba(60,66,75,0.25)", 0.6);   // tunnel cables
        g.restore();
        for (const w of [win[0], win[1]]) line(w, w === win[0] ? win[3] : win[2], "rgba(150,160,175,0.12)", 0.8);
        // benches under the windows
        const Xi = s * (HW - 0.48);
        quad([P(X, 0.45, a + 0.05), P(Xi, 0.45, a + 0.05), P(Xi, 0.45, b - 0.05), P(X, 0.45, b - 0.05)], shade([44, 50, 58]));
        quad([P(Xi, 0, a + 0.05), P(Xi, 0.45, a + 0.05), P(Xi, 0.45, b - 0.05), P(Xi, 0, b - 0.05)], shade([22, 25, 30]));
        line(P(Xi, 0.45, a + 0.05), P(Xi, 0.45, b - 0.05), `rgba(170,180,195,${0.08 + 0.12 * L})`, 0.8);
        quad([P(X, 0.45, a + 0.05), P(X, 0.95, a + 0.05), P(X, 0.95, b - 0.05), P(X, 0.45, b - 0.05)], shade([36, 41, 49]));
      }
      for (const d of DOORS) {                                     // sliding doors
        quad([P(X, 0, d - DH), P(X, 2.0, d - DH), P(X, 2.0, d + DH), P(X, 0, d + DH)], shade([38, 44, 52]));
        line(P(X, 0, d), P(X, 2.0, d), "rgba(0,0,0,0.6)", 1);
        for (const [a, b] of [[d - DH + 0.12, d - 0.12], [d + 0.12, d + DH - 0.12]])
          quad([P(X, 1.0, a), P(X, 1.75, a), P(X, 1.75, b), P(X, 1.0, b)], "#020304");
        const em = P(X * 0.98, 0.05, d);                           // emergency floor light
        g.fillStyle = "rgba(170,180,195,0.18)"; g.beginPath(); g.arc(em[0], em[1], Math.max(1, 0.03 * cam.f / d), 0, 7); g.fill();
      }
    }
    // ceiling light strips
    for (let z = 1; z < ZF - 0.6; z += 2) for (const x of [-0.42, 0.42]) {
      const on = L * G.flick;
      quad([P(x - 0.09, CH - 0.01, z), P(x + 0.09, CH - 0.01, z), P(x + 0.09, CH - 0.01, z + 1.6), P(x - 0.09, CH - 0.01, z + 1.6)],
        on > 0.05 ? `rgba(215,222,232,${0.2 + 0.4 * on})` : "rgba(40,45,52,0.8)");
    }
    // overhead handrails and swinging straps
    const sway = Math.sin(t * 1.3) * 0.18 + Math.sin(t * 3.1) * 0.05;
    for (const x of [-0.62, 0.62]) {
      line(P(x, 1.97, Z0), P(x, 1.97, ZF), `rgba(150,160,175,${0.15 + 0.25 * L})`, 1.2);
      for (let z = 1.2; z < ZF - 0.5; z += 0.75) {
        const top = P(x, 1.97, z), bot = P(x + Math.sin(sway + z) * 0.08, 1.72, z + Math.sin(sway) * 0.04), k = cam.f / z;
        line(top, bot, `rgba(120,130,145,${0.2 + 0.3 * L})`, Math.max(0.6, 0.015 * k));
        g.strokeStyle = `rgba(150,160,175,${0.2 + 0.3 * L})`; g.beginPath(); g.ellipse(bot[0], bot[1] + 0.04 * k, 0.04 * k, 0.05 * k, 0, 0, 7); g.stroke();
      }
    }
  }
  // vertical grab poles; returned so shots can clang off them
  function drawPoles(maxZ, minZ = 0) {
    const out = [];
    for (const d of DOORS) for (const x of [-0.5, 0.5]) for (const z of [d - 0.8, d + 0.8]) out.push([x, z]);
    for (const z of [7.4, 13.2]) out.push([0, z]);
    const g = sctx;
    for (const [x, z] of out) {
      if (z >= maxZ || z < minZ) continue;
      const a = P(x, 0, z), b = P(x, CH, z), w = Math.max(1, 0.035 * cam.f / z);
      g.strokeStyle = shade([60, 66, 76]); g.lineWidth = w; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
      g.strokeStyle = `rgba(200,210,225,${0.12 + 0.3 * G.light})`; g.lineWidth = Math.max(0.5, w * 0.25);
      g.beginPath(); g.moveTo(a[0] + w * 0.2, a[1]); g.lineTo(b[0] + w * 0.2, b[1]); g.stroke();
      poles.push({ x, z, a: toView(...a), b: toView(...b), w });
    }
  }

  // ------------------------------------------------------------------ update
  function update(dt, t) {
    if (G.phase === "play") G.time += dt;
    if (G.phase === "win" || G.phase === "fail") G.endT += dt;
    G.shake = Math.max(0, G.shake - dt * 30); G.dmg = Math.max(0, G.dmg - dt); G.muzzle = Math.max(0, G.muzzle - dt);
    G.cool = Math.max(0, G.cool - dt); G.msgT -= dt; if (G.phase === "play") G.helpT -= dt;
    updateEmbers(dt);
    for (const p of G.sparks) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; }
    G.sparks = G.sparks.filter(p => p.age < p.life);

    // train motion: sway, bob, the odd jolt
    cam.offX = 0.06 * Math.sin(t * 1.3) + 0.02 * Math.sin(t * 3.7);
    cam.hor = H * 0.44 + H * 0.006 * Math.sin(t * 2.1) + H * 0.003 * Math.sin(t * 5.3);
    if (Math.random() < dt * 0.15) G.shake = Math.max(G.shake, 5);
    for (const l of tunnel) { l.z -= TRAIN * dt; if (l.z < -2) l.z += 88; }
    G.ambient = tunnel.reduce((s, l) => s + Math.exp(-((l.z - 5) ** 2) / 10), 0) * (G.light < 0.3 ? 0.22 : 0.05);
    lights(dt);

    for (const f of figs) { animate(f, dt); if (updateDeath(f, dt)) f.gone = true; }
    figs = figs.filter(f => !f.gone);
    if (G.phase === "play") {
      director(dt);
      for (const p of pairs) updatePair(p, dt, t);
      for (const c of chargers) updateCharger(c, dt);
      updatePax(dt);
      G.door = ease(G.door, G.doorOpen ? 1 : 0, 3, dt);
      if (G.wave >= 3 && enemiesLeft() === 0) { G.phase = "clearing"; G.endT = 0; }
    } else if (G.phase === "brief") for (const p of pairs) { idle(p.thug, dt); p.thug.pose = "aim"; }
    if (G.phase === "clearing" && (G.endT += dt) > 2.6) { G.phase = "win"; G.endT = 0; showEnd(); }
  }
  const enemiesLeft = () => figs.filter(f => (f.role === "gunman" || f.role === "charger") && !f.dying).length;

  // lights: on, flicker, dark, flicker back. Scripted long blackout for the leader.
  function lights(dt) {
    G.lightT -= dt;
    if (G.lightSt === "on" && G.lightT <= 0) { G.lightSt = "flick"; G.lightT = 1.2; }
    else if (G.lightSt === "flick" && G.lightT <= 0) { G.lightSt = G.lightNext || "dark"; G.lightNext = null; G.lightT = G.lightSt === "dark" ? 2.6 + Math.random() * 1.2 : 7 + Math.random() * 3; }
    else if (G.lightSt === "dark" && G.lightT <= 0) { G.lightSt = "flick"; G.lightNext = "on"; G.lightT = 0.6; if (G.onLightsBack) { G.onLightsBack(); G.onLightsBack = null; } }
    G.flick = G.lightSt === "flick" ? (Math.random() < 0.5 ? 1 : 0.1) : 1;
    const target = G.lightSt === "dark" ? 0 : G.lightSt === "flick" ? G.flick : 1;
    G.light = G.lightSt === "flick" ? target : ease(G.light, target, 12, dt);
  }

  // waves: opening line-up -> door bursts open -> blackout, the leader is right there when the lights return
  function director(dt) {
    G.waveT += dt;
    if (G.wave === 0 && (enemiesLeft() <= 1 || G.waveT > 26)) {
      G.wave = 1; G.waveT = 0; G.doorOpen = true; sfx.thud(); say("THE DOOR — MORE OF THEM", 2);
      addCharger(-0.2, ZF + 0.6, 0.4); addCharger(0.25, ZF + 1.4, 1.4);
      addPair(0.2, ZF - 3.2, 1); const p = pairs[pairs.length - 1]; p.enter = 1; p.hostage.z = ZF + 0.2; p.thug.z = ZF + 0.65;
    } else if (G.wave === 1 && enemiesLeft() === 0) {
      G.wave = 2; G.waveT = 0; G.doorOpen = false;
      G.lightSt = "flick"; G.lightNext = "dark"; G.lightT = 0.8;
      G.onLightsBack = () => { addPair(-0.25, 5.2, -1, { leader: true, style: { lean: 0.02, tilt: 0, build: 1.2, stride: 1 } }); say("THE LEADER", 2); G.wave = 3; };
    }
    // panicked passengers keep spilling out of the far end
    if ((G.runT -= dt) <= 0 && pax.filter(p => p.role === "runner" && p.st === "run").length < 2 && G.wave < 3) {
      G.runT = 5 + Math.random() * 4;
      const e = add(makeFigure({ kind: "blue", x: (Math.random() - 0.5) * 0.6, z: ZF - 1.2, yaw: 0, speed: 3.2, role: "runner" }));
      e.st = "run"; e.tx = (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.25); e.tz = 2.5 + Math.random() * 6; pax.push(e);
    }
  }

  function updatePair(p, dt, t) {
    const th = p.thug, hs = p.hostage;
    if (p.enter) {                                            // walking a hostage in through the far door
      const done = walkTo(hs, p.x, p.z, dt) & walkTo(th, p.x + p.side * 0.12, p.z + 0.45, dt);
      th.pose = "aim"; hs.pose = "head";
      if (done) { p.enter = 0; turnTo(hs, 0, 1); }
      return;
    }
    idle(hs, dt); turnTo(hs, 0, dt, 3);
    if (th.dying) {                                           // freed: hostage bolts for cover
      if (hs.dying) return;
      if (!hs.freed) { hs.freed = true; hs.speed = 3; hs.role = "runner"; hs.st = "run"; hs.tx = (p.side > 0 ? -1 : 1) * 0.85; hs.tz = Math.max(2.5, hs.z - 3); hs.tremble = 0.5; pax.push(hs); }
      return;
    }
    idle(th, dt); turnTo(th, 0, dt, 4); th.pose = "aim";
    const k = { hide: 0, out: 1, tele: 1, back: 0 }[p.st];
    p.peek = ease(p.peek, k, 7, dt);
    th.x = p.x + p.side * (0.12 + 0.32 * p.peek); th.z = p.z + 0.45;
    hs.tremble = 0.8 + 0.6 * p.peek;
    p.tm -= dt;
    if (p.tm > 0) return;
    if (p.st === "hide") { p.st = "out"; p.tm = 0.4; }
    else if (p.st === "out") { p.st = "tele"; p.tm = TELE; }
    else if (p.st === "tele") { fire(th); p.st = "back"; p.tm = 0.35; }
    else { p.st = "hide"; p.tm = p.fast ? 1 + Math.random() * 0.8 : 1.8 + Math.random() * 2; }
  }
  function fire(e) {
    sfx.enemy(); e.flash = 0.09;
    G.hp -= DMG; G.shake = 12; G.dmg = 0.55;
    if (G.hp <= 0) { G.hp = 0; end("fail", "shot"); }
  }

  function updateCharger(c, dt) {
    const e = c.e;
    if (e.dying) return;
    if (c.st === "wait") { idle(e, dt); if ((c.delay -= dt) <= 0) { c.st = "run"; say("KNIFE!", 1); } return; }
    if (c.st === "run") {
      e.pose = e.z < 4.5 ? "raise" : "knife";
      c.tx = ease(c.tx, Math.sin(G.time * 1.7 + e.id) * 0.25, 2, dt);   // weaving down the aisle
      if (walkTo(e, c.tx, 1.25, dt)) { c.st = "stab"; c.tm = 0.35; }
      return;
    }
    idle(e, dt); turnTo(e, 0, dt, 6);                                    // in your face
    c.tm -= dt; e.pose = c.tm > 0.5 ? "raise" : "knife";
    if (c.tm <= 0) {
      G.hp -= STAB; G.shake = 16; G.dmg = 0.6; sfx.thud(); c.tm = 1.1;
      if (G.hp <= 0) { G.hp = 0; end("fail", "stabbed"); }
    }
  }

  function updatePax(dt) {
    const panic = G.phase === "play";
    for (const p of pax) {
      if (p.dying) continue;
      if (p.role === "seated") { p.cower = panic ? 1 : 0; p.pose = panic ? "cower" : "hang"; p.tremble = panic ? 0.6 : 0; continue; }
      if (p.role === "standing") {                       // first shot of panic: they run for a seat gap
        p.role = "runner"; p.st = "run"; p.speed = 2.6; p.tx = (p.x < 0 ? -1 : 1) * 0.85; p.tz = Math.max(2.5, p.z - 2.5);
      }
      if (p.role === "runner") {
        if (p.st === "run") { p.pose = "hang"; if (walkTo(p, p.tx, p.tz, dt)) { p.st = "hide"; } }
        else { idle(p, dt); p.kneel = 1; p.cower = 1; p.pose = "cower"; p.tremble = 0.7; turnTo(p, p.tx < 0 ? Math.PI / 2 : -Math.PI / 2, dt, 3); }
      }
    }
  }

  // ------------------------------------------------------------------ shooting
  function shoot() {
    if (G.cool > 0 || G.phase !== "play") return;
    if (G.ammo === 0) { sfx.empty(); say("SPACE TO RELOAD", 1.4); return; }
    G.ammo--; G.shots++; G.cool = RATE; G.muzzle = 0.06; G.shake = Math.max(G.shake, 3); sfx.shot();
    const vx = E.mouse.x * SCALE, vy = E.mouse.y * SCALE;
    const hit = hitTest(figs, vx, vy);
    // a pole between you and the target takes the round
    const pole = poles.filter(p => !hit || p.z < hit.e.z).find(p => segDist(vx, vy, p.a, p.b) < p.w * 0.7);
    if (pole) return spark(vx, vy);
    if (!hit) return;
    const e = hit.e; e.dying = true; e.hitFlash = 0.1;
    if (e.kind === "blue") return end("fail", "civilian");
    say(hit.head ? "HEADSHOT" : "DOWN", 1);
  }
  function segDist(x, y, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1, u = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / l, 0, 1); return Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy); }
  function spark(x, y) { sfx.ping(); for (let i = 0; i < 8; i++) G.sparks.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 120, age: 0, life: 0.15 + Math.random() * 0.2 }); }
  function say(m, d = 2) { G.msg = m; G.msgT = d; }
  function end(phase, reason) { if (G.phase !== "play") return; G.phase = phase; G.reason = reason; G.endT = 0; setTimeout(showEnd, 1300); }
  function reload() { if (G.ammo < MAG) { G.ammo = MAG; sfx.reload(); } }
  function onDown(b) { if (b === 0) shoot(); if (b === 2) reload(); }
  function onKey(code) { if (code === "Space" || code === "KeyR") reload(); }

  // ------------------------------------------------------------------ render
  function render(t) {
    sctx.globalAlpha = 1; sctx.globalCompositeOperation = "source-over";
    poles = [];
    drawCarriage(t);
    const nearest = Math.min(...figs.map(f => f.z), 99);
    drawPoles(99, nearest);                                   // poles behind everyone
    drawFigures(figs, t);
    drawPoles(nearest);                                       // poles in front of the nearest person
    // glints and muzzle flashes
    sctx.globalCompositeOperation = "lighter";
    for (const p of pairs) {
      const e = p.thug; if (e.dying || !e.geom || !e.geom.muzzle) continue;
      const [mx, my, k] = e.geom.muzzle, glint = p.st === "tele" ? (0.55 + 0.45 * Math.sin(t * 30)) * smooth((TELE - p.tm) / 0.25) : 0, fl = (e.flash || 0) > 0 ? 1 : 0;
      e.flash = Math.max(0, (e.flash || 0) - 1 / 60);
      if (!glint && !fl) continue;
      const r = Math.max(4, k * 0.09) * (fl ? 3 : 1), a = fl || glint, gg = sctx.createRadialGradient(mx, my, 0, mx, my, r);
      gg.addColorStop(0, `rgba(255,240,230,${a})`); gg.addColorStop(0.3, `rgba(255,60,40,${0.7 * a})`); gg.addColorStop(1, "rgba(255,30,20,0)");
      sctx.fillStyle = gg; sctx.fillRect(mx - r, my - r, r * 2, r * 2);
      if (fl) { const room = sctx.createRadialGradient(mx, my, 0, mx, my, W * 0.4); room.addColorStop(0, "rgba(255,200,170,0.12)"); room.addColorStop(1, "rgba(0,0,0,0)"); sctx.fillStyle = room; sctx.fillRect(0, 0, W, H); }
    }
    for (const p of G.sparks) { sctx.fillStyle = `rgba(255,235,210,${1 - p.age / p.life})`; sctx.fillRect(p.x, p.y, 1.6, 1.6); }
    if (G.muzzle > 0) {
      const m = sctx.createRadialGradient(W * 0.62, H, 0, W * 0.62, H, H * 0.8);
      m.addColorStop(0, "rgba(255,225,180,0.35)"); m.addColorStop(1, "rgba(255,225,180,0)");
      sctx.fillStyle = m; sctx.fillRect(0, 0, W, H);
    }
    sctx.globalCompositeOperation = "source-over";
    post(t, { shake: G.shake + 0.5, dmg: G.dmg });
    hud(t);
  }

  // ------------------------------------------------------------------ HUD + panels
  function hud(t) {
    const k = hudK(), pad = 28 * k, VW = E.VW, VH = E.VH, ink = "200,215,235";
    if (G.phase === "play") crosshair(E.mouse.x * k, E.mouse.y * k, k);
    glowText("LEVEL 3   METRO SIEGE", pad, pad, 13 * k, ink, 0.6, "left");
    const foes = figs.filter(f => f.role === "gunman" || f.role === "charger");
    glowText(`ARMED ${foes.filter(f => !f.dying).length}`, pad, pad + 24 * k, 11 * k, "255,140,110", 0.6, "left");
    glowText(`PASSENGERS ${figs.filter(f => f.kind === "blue" && !f.dying).length}`, pad, pad + 44 * k, 11 * k, "120,180,255", 0.6, "left");
    recDot(t);
    if (G.lightSt === "dark" && G.phase === "play") glowText("LIGHTS OUT", VW / 2, VH * 0.12, 14 * k, ink, 0.4 + 0.3 * Math.sin(t * 6));
    for (let i = 0; i < MAG; i++) {
      vctx.fillStyle = i < G.ammo ? "rgba(220,235,255,0.8)" : "rgba(220,235,255,0.12)";
      vctx.fillRect(VW - pad - (i + 1) * 8 * k, VH - pad - 20 * k, 4 * k, 20 * k);
    }
    if (G.ammo === 0 && G.phase === "play") glowText("SPACE", VW - pad, VH - pad - 36 * k, 12 * k, "255,200,150", 0.5 + 0.5 * Math.sin(t * 8), "right");
    vctx.fillStyle = "rgba(200,210,225,0.12)"; vctx.fillRect(pad, VH - pad - 6 * k, 180 * k, 6 * k);
    vctx.fillStyle = G.hp > 30 ? "rgba(190,215,240,0.75)" : "rgba(255,60,50,0.9)";
    vctx.fillRect(pad, VH - pad - 6 * k, 180 * k * G.hp / 100, 6 * k);
    if (G.msgT > 0) glowText(G.msg, VW / 2, VH * 0.2, 22 * k, ink, Math.min(1, G.msgT) * 0.9);
    if (G.phase === "play" && G.helpT > 0) glowText("CLICK FIRE  ·  SPACE RELOAD  ·  ESC MENU", VW / 2, VH - pad - 3 * k, 13 * k, ink, Math.min(1, G.helpT) * 0.7);
  }

  const KEYS = [["Left click", "Fire"], ["Space", "Reload"], ["Esc", "Menu"]];
  function showBrief() {
    showPanel(`
      <p class="eyebrow">Level 3 · Close quarters</p>
      <h2>Metro Siege</h2>
      <p class="lede">Line 4, deep in the tunnel. The rest of the crew has taken the last carriage. You're at the back door with a pistol, looking down the aisle.</p>
      <ul class="legend">
        <li><i class="dot red"></i><span><b>Gunmen</b> hold passengers in front of them and only lean out to fire. A red glint flashes first. Take the head, not the hostage.</span></li>
        <li><i class="dot orange"></i><span><b>Knife men</b> rush straight down the aisle. Drop them before they reach you.</span></li>
        <li><i class="dot blue"></i><span><b>Passengers</b> panic, run past and hide between the seats. Hitting one ends the mission.</span></li>
      </ul>
      <p class="note">The lights fail in the tunnel. In the dark, only people glow. Grab poles stop bullets.</p>
      <dl class="keys">${KEYS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      <div class="actions"><button id="p-go" class="primary">Go in</button></div>`,
      { "p-go": () => { hidePanel(); G.phase = "play"; } });
  }
  function showEnd() {
    const safe = figs.filter(f => f.kind === "blue" && !f.dying).length;
    if (G.phase === "win") showPanel(`
      <p class="eyebrow">Level 3 · Complete</p>
      <h2 class="ok">Line 4 is clear</h2>
      <p class="lede">The train rolls into the station. ${safe} passengers step off shaking, but alive.</p>
      <dl class="stats"><dt>Time</dt><dd>${G.time.toFixed(1)} s</dd><dt>Shots</dt><dd>${G.shots}</dd><dt>Health</dt><dd>${G.hp}</dd></dl>
      <div class="actions"><button id="p-again" class="primary">Play again</button><button id="p-menu">Menu</button></div>`, endActions());
    else showPanel(`
      <p class="eyebrow">Level 3 · Failed</p>
      <h2 class="bad">Mission failed</h2>
      <p class="lede">${{ civilian: "You hit a passenger.", stabbed: "A knife man reached you.", shot: "You were shot." }[G.reason]}</p>
      <div class="actions"><button id="p-again" class="primary">Try again</button><button id="p-menu">Menu</button></div>`, endActions());
  }
  const endActions = () => ({
    "p-again": () => { hidePanel(); init(); hidePanel(); G.phase = "play"; },
    "p-menu": () => { hidePanel(); const m = document.getElementById("menu"); if (m) m.hidden = false; init(); },
  });

  return { name: "metro", init, resize, update, render, onDown, onKey, debug: () => ({ G, figs, pairs, chargers }) };
})();
