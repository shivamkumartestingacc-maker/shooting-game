"use strict";
// =====================================================================
// Level 4: Street Run. On foot down the middle of a night street, House
// of the Dead style: you walk a fixed path and stop where trouble is.
// Pawn shop, a car used as cover, an alley ambush, the cinema, the mall.
// Orange men charge with knives or throw stones (shoot the stone out of
// the air); red men shoot from doorways, rooftops, the marquee and from
// behind cars. Blue people run for it: never hit them.
// =====================================================================
const StreetLevel = (() => {
  const { FACADE, SIDEWALK, S: CS, makeCar, drawCar, drawCity, drawLamp } = CityKit;
  const MAG = 15, RATE = 0.12, DMG = 12, STAB = 15, STONE = 10, TELE = 1.0, WALK = 3.2, GRAV = 9.8;
  const STOPS = [
    { at: 16, name: "THE PAWN SHOP" },
    { at: 46, name: "BEHIND THE CAR" },
    { at: 66, name: "AMBUSH" },
    { at: 88, name: "THE CINEMA" },
    { at: 128, name: "CITY MALL" },
  ];
  const SPECIALS = [
    { dist: 26, side: -1, spec: { len: 16, h: 11, sign: "PAWN", doors: [3, 10] } },
    { dist: 27, side: 1, spec: { len: 13, h: 8, shop: false } },
    { dist: 96, side: 1, spec: { len: 24, h: 16, theater: true, doors: [4.5, 9, 13.5], shop: false } },
    { dist: 134, side: -1, spec: { len: 30, h: 15, mall: "CITY MALL", doors: [7, 15], shop: false } },
    { dist: 136, side: 1, spec: { len: 14, h: 9, shop: false } },
  ];
  let W, H, G, figs, stones, parked, cover;

  // ------------------------------------------------------------------ setup
  function init() {
    G = { phase: "brief", hp: 100, ammo: MAG, cool: 0, shake: 0, dmg: 0, muzzle: 0, recoil: 0, msg: "", msgT: 0, time: 0, shots: 0, hits: 0,
      endT: 0, reason: "", stop: -1, speed: 0, clearT: 0, fighting: false, cracks: [], sparks: [], dust: [], bob: 0, helpT: 8 };
    figs = []; stones = []; parked = []; cover = [];
    CityKit.resetCity(SPECIALS);
    for (const side of [-1, 1]) for (let z = 8 + Math.random() * 10; z < 150; z += 16 + Math.random() * 26)
      parked.push(makeCar({ x: side * 6.25, z, tone: [9 + Math.random() * 8 | 0, 11 + Math.random() * 8 | 0, 14 + Math.random() * 8 | 0] }));
    for (let i = 0; i < 6; i++) ped(20 + Math.random() * 100);
    showBrief();
  }
  const add = o => { const e = makeFigure(o); figs.push(e); return e; };
  function ped(z) {
    const side = Math.random() < 0.5 ? -1 : 1;
    add({ kind: "blue", role: "ped", x: side * (SIDEWALK + (Math.random() - 0.5) * 1.6), z, yaw: Math.random() < 0.5 ? 0 : Math.PI, speed: 1.1 + Math.random() * 0.4, walkW: 1 });
  }
  const spec = i => CS.specials[i].block;
  const door = (i, k) => { const b = spec(i); return [b.side * (FACADE - 0.2), b.z0 + b.doors[k] + 0.75, b.side]; };
  function foe(kind, role, x, z, o = {}) {
    return add(Object.assign({ kind, role, x, z, yaw: 0, pose: role === "charger" ? "knife" : role === "gunman" ? "rifle" : "hang",
      weapon: role === "charger" ? "knife" : role === "gunman" ? "rifle" : null, speed: role === "charger" ? 3.3 : 1.8, st: "delay", delay: 0, foe: true }, o));
  }
  function fleer(x, z, toward = 40) {
    const e = add({ kind: "blue", role: "flee", x, z, speed: 3, yaw: Math.PI });
    e.tx = Math.sign(x || 1) * SIDEWALK; e.tz = z + toward; return e;
  }

  // what happens at each stop
  function encounter(i) {
    G.stop = i; G.fighting = true; say(STOPS[i].name, 2.2);
    for (const p of figs) if (p.role === "ped" && p.z < 45) { p.role = "flee"; p.speed = 3; p.tx = Math.sign(p.x) * SIDEWALK; p.tz = p.z + 50; }
    if (i === 0) {
      let [x, z, s] = door(0, 0); foe("orange", "charger", x, z, { delay: 0.6, out: s * 8.2 });
      [x, z, s] = door(0, 1); foe("orange", "thrower", x, z, { delay: 1.6, out: s * 7.6 });
      const b = spec(1); foe("red", "gunman", b.side * FACADE, b.z0 + 6, { y0: b.h, delay: 2.5, mode: "roof" });
      fleer(8.6, 6); fleer(8.2, 9);
    } else if (i === 1) {
      const car = makeCar({ x: 3.0, z: 9.5, yaw: 0.25, tone: [14, 16, 20] }); cover.push(car);
      foe("red", "gunman", 2.4, 12.1, { mode: "cover", kneel: 1, delay: 0.8 });
      foe("red", "gunman", 3.9, 12.3, { mode: "cover", kneel: 1, delay: 2.4 });
      foe("orange", "charger", -8.6, 19, { delay: 3.5 });
      add({ kind: "blue", role: "hide", x: -9.4, z: 8.5, yaw: 0.8, kneel: 1, cower: 1, pose: "cower", tremble: 0.7 });
    } else if (i === 2) {
      foe("orange", "charger", -9.2, 7.5, { delay: 0.2 });
      foe("orange", "thrower", 8.6, 15, { delay: 1.2, out: 7.8 });
      foe("orange", "charger", 9.0, 20, { delay: 3.2 });
    } else if (i === 3) {
      for (const k of [0, 2]) { const [x, z] = door(2, k); fleer(x, z, 30).delayRun = 0.2 * k; }
      let [x, z, s] = door(2, 0); foe("orange", "charger", x, z, { delay: 1.8, out: s * 8.2 });
      [x, z, s] = door(2, 2); foe("orange", "charger", x, z, { delay: 3.4, out: s * 8.2 });
      [x, z, s] = door(2, 1); foe("red", "gunman", x, z, { delay: 1.0, mode: "stand", out: s * 8.4 });
      const b = spec(2); foe("red", "gunman", b.side * (FACADE - 1.7), b.z0 + 11, { y0: 4.7, delay: 2.2, mode: "roof" });
    } else if (i === 4) {
      const car = makeCar({ x: -3.2, z: 11, yaw: -0.3, tone: [14, 16, 20] }); cover.push(car);
      foe("red", "gunman", -2.6, 13.6, { mode: "cover", kneel: 1, delay: 0.8 });
      foe("red", "gunman", -4.1, 13.2, { mode: "cover", kneel: 1, delay: 2.0 });
      let [x, z, s] = door(3, 0); foe("orange", "charger", x, z, { delay: 2.6, out: s * 8.2 });
      [x, z, s] = door(3, 1); foe("red", "gunman", x, z, { delay: 1.4, mode: "stand", out: s * 8.4 });
      foe("orange", "thrower", 8.4, 16, { delay: 3.5, out: 7.8 });
      const b = spec(4); foe("red", "gunman", b.side * FACADE, b.z0 + 5, { y0: b.h, delay: 4.5, mode: "roof" });
      foe("orange", "charger", -8.8, 24, { delay: 6 });
    }
  }
  const foesLeft = () => figs.filter(f => f.foe && !f.dying).length;

  function resize() {
    W = E.W; H = E.H;
    cam.f = H * 0.85; cam.hor = H * 0.45; cam.cx = W / 2; cam.camH = 1.65;
    CityKit.resizeCity();
  }

  // ------------------------------------------------------------------ update
  function update(dt, t) {
    if (G.phase === "play") G.time += dt;
    if (G.phase === "fail" || G.phase === "win") G.endT += dt;
    G.shake = Math.max(0, G.shake - dt * 30); G.dmg = Math.max(0, G.dmg - dt); G.muzzle = Math.max(0, G.muzzle - dt);
    G.cool = Math.max(0, G.cool - dt); G.recoil = ease(G.recoil, 0, 12, dt); G.msgT -= dt; if (G.phase === "play") G.helpT -= dt;
    updateEmbers(dt);
    for (const list of [G.sparks, G.dust]) for (const p of list) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; }
    G.sparks = G.sparks.filter(p => p.age < p.life); G.dust = G.dust.filter(p => p.age < p.life);

    // walking the path; stop at each encounter until it is clear
    if (G.phase === "play") {
      const next = STOPS[G.stop + 1];
      if (!G.fighting && next && CS.dist >= next.at) encounter(G.stop + 1);
      if (G.fighting && foesLeft() === 0 && stones.length === 0 && (G.clearT += dt) > 1.4) {
        G.fighting = false; G.clearT = 0;
        if (G.stop === STOPS.length - 1) { G.phase = "clearing"; G.endT = 0; say("STREET CLEAR", 2.5); }
        else say("MOVE", 1.2);
      }
    }
    if (G.phase === "clearing" && (G.endT += dt) > 2.5) { G.phase = "win"; G.endT = 0; showEnd(); }
    G.speed = ease(G.speed, G.phase === "play" && !G.fighting ? WALK : 0, 3, dt);
    const step = G.speed * dt;
    CityKit.advance(step);
    for (const o of [...figs, ...parked, ...cover, ...stones]) o.z -= step;
    for (const c of parked) if (c.z < -5) c.z += 150 + Math.random() * 20;
    cover = cover.filter(c => c.z > -6);
    // head bob while walking, steady when stopped
    G.bob += step * 1.9;
    cam.hor = H * 0.45 + Math.sin(G.bob * 2) * H * 0.006 * (G.speed / WALK);
    cam.offX = Math.sin(G.bob) * 0.05 * (G.speed / WALK);

    for (const e of figs) {
      animate(e, dt); if (updateDeath(e, dt)) e.gone = true;
      if (e.dying) continue;
      if (e.role === "ped") { e.phase += dt * 2 * Math.PI * STANCE * e.speed / (2 * STRIDE * e.style.stride); e.z += (e.yaw ? 1 : -1) * e.speed * dt; continue; }
      if (e.role === "flee") { if ((e.delayRun = (e.delayRun || 0) - dt) > 0) idle(e, dt); else if (walkTo(e, e.tx, e.tz, dt)) e.role = "ped"; e.pose = "hang"; continue; }
      if (e.role === "hide") { idle(e, dt); continue; }
      if (G.phase !== "play") { idle(e, dt); continue; }
      if (e.st === "delay") { idle(e, dt); if ((e.delay -= dt) <= 0) e.st = e.out != null ? "exit" : "go"; continue; }
      if (e.st === "exit") { if (walkTo(e, e.out, e.z - 0.6, dt)) e.st = "go"; continue; }
      if (e.role === "charger") charger(e, dt);
      else if (e.role === "thrower") thrower(e, dt);
      else gunman(e, dt);
    }
    figs = figs.filter(f => !f.gone && f.z > 0.5 && f.z < 200);
    while (figs.filter(f => f.role === "ped").length < 5) ped(60 + Math.random() * 60);

    for (const s of stones) {                                  // stones arc toward your face
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.vy -= GRAV * dt; s.spin += dt * 9;
      if (s.z < 0.6) { s.dead = true; hurt(STONE); sfx.thud(); G.cracks.push([0.3 + Math.random() * 0.4, 0.25 + Math.random() * 0.4, (Math.random() * 1e9) | 0]); }
      if (s.y < 0) s.dead = true;
    }
    stones = stones.filter(s => !s.dead);
  }

  const face = (e, dt) => turnTo(e, yawToward(e, cam.offX, 0), dt, 6);
  function charger(e, dt) {
    if (e.st === "go") {
      e.pose = e.z < 4.5 ? "raise" : "knife";
      e.lane = e.lane ?? Math.sign(e.x || 1) * (0.4 + Math.random() * 0.5);
      if (walkTo(e, e.lane, 1.4, dt)) { e.st = "stab"; e.tm = 0.35; }
      return;
    }
    idle(e, dt); face(e, dt);
    e.tm -= dt; e.pose = e.tm > 0.5 ? "raise" : "knife";
    if (e.tm <= 0) { hurt(STAB); sfx.thud(); e.tm = 1.1; }
  }
  function thrower(e, dt) {
    if (e.st === "go") { idle(e, dt); face(e, dt); e.st = "wind"; e.tm = 0.9; return; }
    idle(e, dt); face(e, dt);
    e.tm -= dt;
    if (e.st === "wind") {
      e.pose = "raise"; e.curlOverride = 1;
      if (e.tm <= 0) {                                         // let go: aim at the camera with an arc
        const T = 1.2, x = e.x + Math.cos(e.yaw) * 0.2, y = 2.0, z = e.z, tx = cam.offX + (Math.random() - 0.5) * 0.4, ty = 1.5, tz = 0.4;
        stones.push({ x, y, z, vx: (tx - x) / T, vy: (ty - y) / T + 0.5 * GRAV * T, vz: (tz - z) / T, spin: 0, seed: (Math.random() * 1e9) | 0 });
        noise(0.12, "bandpass", 900, 0.2, 2);
        e.st = "cool"; e.tm = 2.2 + Math.random(); e.pose = "hang";
      }
    } else if (e.tm <= 0) { e.st = "wind"; e.tm = 0.9; }
  }
  function gunman(e, dt) {
    if (e.st === "go") {
      if (e.mode === "stand") { if (!walkTo(e, e.out ?? e.x, Math.max(e.z - 1.2, 4), dt)) return; }
      e.st = "raise"; e.tm = 0.6;
    }
    idle(e, dt); face(e, dt);
    const up = e.st === "raise" || e.st === "tele" || e.st === "hold";
    e.pose = up ? "aim" : "rifle";
    if (e.mode === "cover") e.kneel = up ? 0 : 1;              // up over the car to shoot, down behind it
    e.tm -= dt;
    if (e.tm > 0) return;
    if (e.st === "raise") { e.st = "tele"; e.tm = TELE; }
    else if (e.st === "tele") { fire(e); e.st = "hold"; e.tm = 0.3; }
    else if (e.st === "hold") { e.st = "cool"; e.tm = 1.6 + Math.random() * 1.2; }
    else { e.st = "raise"; e.tm = e.mode === "cover" ? 0.7 : 0.4; }
  }
  function fire(e) { sfx.enemy(); e.flash = 0.09; hurt(DMG); G.cracks.push([0.2 + Math.random() * 0.6, 0.15 + Math.random() * 0.5, (Math.random() * 1e9) | 0]); }
  function hurt(n) {
    if (G.phase !== "play") return;
    G.hp -= n; G.shake = Math.max(G.shake, 12); G.dmg = 0.55;
    if (G.hp <= 0) { G.hp = 0; end("fail", "down"); }
  }

  // ------------------------------------------------------------------ shooting
  const inPath = (p, x, y) => p && sctx.isPointInPath(p, x, y);
  function shoot() {
    if (G.cool > 0 || G.phase !== "play") return;
    if (G.ammo === 0) { sfx.empty(); say("SPACE TO RELOAD", 1.4); return; }
    G.ammo--; G.shots++; G.cool = RATE; G.muzzle = 0.06; G.recoil = 1; G.shake = Math.max(G.shake, 2.5); sfx.shot();
    const vx = E.mouse.x * SCALE, vy = E.mouse.y * SCALE;
    for (const s of stones) {                                  // stones first: they are closest
      const [px, py, k] = project(s.x, s.y, s.z), r = Math.max(7, 0.12 * k * 1.8);
      if (Math.hypot(vx - px, vy - py) < r) {
        s.dead = true; sfx.ping();
        for (let i = 0; i < 14; i++) G.dust.push({ x: px, y: py, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.7) * 160, g: 300, age: 0, life: 0.5 + Math.random() * 0.4, r: 1 + Math.random() * 2 });
        stones = stones.filter(q => !q.dead); return;
      }
    }
    const hit = hitTest(figs, vx, vy);
    const coverHit = cover.find(c => c.geo && inPath(c.geo.sil, vx, vy) && (!hit || c.z < hit.e.z));
    if (coverHit) return spark(vx, vy);
    if (!hit) { if (parked.some(c => c.geo && inPath(c.geo.sil, vx, vy))) spark(vx, vy); return; }
    const e = hit.e; e.dying = true; e.hitFlash = 0.1;
    if (e.kind === "blue") return end("fail", "civilian");
    G.hits++; say(hit.head ? "HEADSHOT" : "DOWN", 0.9);
  }
  function spark(x, y) { sfx.ping(); for (let i = 0; i < 8; i++) G.sparks.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 120, g: 400, age: 0, life: 0.15 + Math.random() * 0.2 }); }
  function say(m, d = 2) { G.msg = m; G.msgT = d; }
  function end(phase, reason) { if (G.phase !== "play") return; G.phase = phase; G.reason = reason; G.endT = 0; setTimeout(showEnd, 1300); }
  function reload() { if (G.ammo < MAG) { G.ammo = MAG; sfx.reload(); } }
  function onDown(b) { if (b === 0) shoot(); if (b === 2) reload(); }
  function onKey(code) { if (code === "Space" || code === "KeyR") reload(); }

  // ------------------------------------------------------------------ render
  function render(t) {
    sctx.globalAlpha = 1; sctx.globalCompositeOperation = "source-over";
    drawCity(t, { headlights: false });
    const items = [...CS.lamps.map(l => ({ z: l.z, draw: () => drawLamp(l) })), ...parked.filter(c => c.z > 0.9 && c.z < 160).map(c => ({ z: c.z, draw: () => drawCar(c) }))];
    for (const it of items.sort((a, b) => b.z - a.z)) it.draw();
    for (const c of parked) if (c.z <= 0.9 || c.z >= 160) c.geo = null;
    drawFigures(figs, t);
    for (const c of cover.filter(c => c.z > 0.9).sort((a, b) => b.z - a.z)) drawCar(c);   // cover in front of the men crouched behind it
    effects(t);
    gun();
    post(t, { shake: G.shake + 0.4, dmg: G.dmg });
    hud(t);
  }

  function effects(t) {
    const g = sctx;
    for (const s of stones) {                                  // dark rock, rim-lit
      const [x, y, k] = project(s.x, s.y, s.z), r = Math.max(2, 0.09 * k);
      g.fillStyle = "#0b0c0f"; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.strokeStyle = "rgba(190,198,210,0.55)"; g.lineWidth = Math.max(1, r * 0.18); g.beginPath(); g.arc(x, y, r, s.spin, s.spin + 2.2); g.stroke();
    }
    g.globalCompositeOperation = "lighter";
    for (const e of figs) {
      if (e.dying || !e.geom || !e.geom.muzzle || e.role !== "gunman") continue;
      const [mx, my, k] = e.geom.muzzle, glint = e.st === "tele" ? (0.55 + 0.45 * Math.sin(t * 30)) * smooth((TELE - e.tm) / 0.25) : 0, fl = (e.flash || 0) > 0 ? 1 : 0;
      e.flash = Math.max(0, (e.flash || 0) - 1 / 60);
      if (!glint && !fl) continue;
      const r = Math.max(4, k * 0.1) * (fl ? 3 : 1), a = fl || glint, gg = g.createRadialGradient(mx, my, 0, mx, my, r);
      gg.addColorStop(0, `rgba(255,240,230,${a})`); gg.addColorStop(0.3, `rgba(255,60,40,${0.7 * a})`); gg.addColorStop(1, "rgba(255,30,20,0)");
      g.fillStyle = gg; g.fillRect(mx - r, my - r, r * 2, r * 2);
      g.strokeStyle = `rgba(255,200,190,${0.6 * a})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(mx - r * 1.8, my); g.lineTo(mx + r * 1.8, my); g.moveTo(mx, my - r * 1.2); g.lineTo(mx, my + r * 1.2); g.stroke();
    }
    for (const p of G.sparks) { g.fillStyle = `rgba(255,235,210,${1 - p.age / p.life})`; g.fillRect(p.x, p.y, 1.6, 1.6); }
    g.globalCompositeOperation = "source-over";
    for (const p of G.dust) { g.fillStyle = `rgba(150,155,165,${0.6 * (1 - p.age / p.life)})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
    for (const [u, v, seed] of G.cracks.slice(-4)) {          // hits you take blur the camera lens
      const r = mulberry(seed), cx = u * W, cy = v * H, R = H * 0.06;
      g.strokeStyle = "rgba(205,215,230,0.3)"; g.lineWidth = 0.7;
      for (let i = 0; i < 10; i++) {
        let a = i / 10 * 6.283 + r() * 0.4, x = cx, y = cy; g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 3; s++) { a += (r() - 0.5) * 0.5; x += Math.cos(a) * R * (0.2 + r() * 0.3); y += Math.sin(a) * R * (0.2 + r() * 0.3); g.lineTo(x, y); }
        g.stroke();
      }
    }
  }

  // your pistol, lower right, barrel into the scene, kicks on each shot
  function gun() {
    const g = sctx, k = H / 500, r = G.recoil;
    g.save();
    g.translate(W * 0.8 + r * 8 * k, H * 0.9 + r * 16 * k); g.rotate(-0.32 - r * 0.12); g.scale(k, k);
    g.fillStyle = "#050608"; g.strokeStyle = "rgba(140,150,165,0.25)"; g.lineWidth = 1 / k;
    g.beginPath(); g.roundRect(-120, -22, 132, 22, 3); g.fill(); g.stroke();                  // slide
    g.beginPath(); g.moveTo(-6, 0); g.lineTo(18, 0); g.lineTo(34, 78); g.lineTo(6, 84); g.closePath(); g.fill(); g.stroke();   // grip
    g.beginPath(); g.moveTo(-30, 0); g.quadraticCurveTo(-30, 20, -8, 20); g.stroke();       // trigger guard
    g.fillStyle = "#08090c"; g.beginPath(); g.ellipse(18, 40, 30, 40, -0.2, 0, 7); g.fill();  // your hand round the grip
    g.fillStyle = "rgba(150,160,175,0.18)"; g.fillRect(-116, -21, 120, 2);                   // top edge catching street light
    g.restore();
    if (G.muzzle > 0) {
      const mx = W * 0.8 - 118 * k * Math.cos(0.32), my = H * 0.9 - 118 * k * Math.sin(0.32) - 10 * k;
      const m = g.createRadialGradient(mx, my, 0, mx, my, H * 0.35);
      m.addColorStop(0, "rgba(255,225,180,0.55)"); m.addColorStop(1, "rgba(255,225,180,0)");
      g.globalCompositeOperation = "lighter"; g.fillStyle = m; g.fillRect(0, 0, W, H); g.globalCompositeOperation = "source-over";
    }
  }

  // ------------------------------------------------------------------ HUD + panels
  function hud(t) {
    const k = hudK(), pad = 28 * k, VW = E.VW, VH = E.VH, ink = "200,215,235";
    if (G.phase === "play") crosshair(E.mouse.x * k, E.mouse.y * k, k);
    glowText(`LEVEL 4   STREET RUN   ·   STOP ${Math.max(0, G.stop + (G.fighting ? 1 : 0))}/${STOPS.length}`, pad, pad, 13 * k, ink, 0.6, "left");
    if (G.fighting) glowText(`ARMED ${foesLeft()}`, pad, pad + 24 * k, 11 * k, "255,140,110", 0.6, "left");
    else if (G.phase === "play" && G.speed > 0.5) glowText("MOVING", pad, pad + 24 * k, 11 * k, ink, 0.45, "left");
    recDot(t);
    for (let i = 0; i < MAG; i++) {
      vctx.fillStyle = i < G.ammo ? "rgba(220,235,255,0.8)" : "rgba(220,235,255,0.12)";
      vctx.fillRect(VW - pad - (i + 1) * 7 * k, VH - pad - 20 * k, 3 * k, 20 * k);
    }
    if (G.ammo === 0 && G.phase === "play") glowText("SPACE", VW - pad, VH - pad - 36 * k, 12 * k, "255,200,150", 0.5 + 0.5 * Math.sin(t * 8), "right");
    vctx.fillStyle = "rgba(200,210,225,0.12)"; vctx.fillRect(pad, VH - pad - 6 * k, 180 * k, 6 * k);
    vctx.fillStyle = G.hp > 30 ? "rgba(190,215,240,0.75)" : "rgba(255,60,50,0.9)";
    vctx.fillRect(pad, VH - pad - 6 * k, 180 * k * G.hp / 100, 6 * k);
    if (G.msgT > 0) glowText(G.msg, VW / 2, VH * 0.2, 22 * k, ink, Math.min(1, G.msgT) * 0.9);
    if (stones.length && G.phase === "play") glowText("STONE — SHOOT IT", VW / 2, VH * 0.27, 13 * k, "255,200,150", 0.5 + 0.5 * Math.sin(t * 12));
    if (G.phase === "play" && G.helpT > 0) glowText("CLICK FIRE  ·  SPACE RELOAD  ·  ESC MENU", VW / 2, VH - pad - 3 * k, 13 * k, ink, Math.min(1, G.helpT) * 0.7);
  }

  const KEYS = [["Left click", "Fire"], ["Space", "Reload"], ["Esc", "Menu"]];
  function showBrief() {
    showPanel(`
      <p class="eyebrow">Level 4 · On foot</p>
      <h2>Street Run</h2>
      <p class="lede">The crew's friends are all over the high street tonight. You walk it end to end: the pawn shop, the cinema, the mall. You stop wherever they show themselves.</p>
      <ul class="legend">
        <li><i class="dot red"></i><span><b>Gunmen</b> shoot from doorways, rooftops, the cinema marquee and from behind parked cars. A red glint comes first.</span></li>
        <li><i class="dot orange"></i><span><b>Knife men</b> charge you. <b>Stone throwers</b> lob rocks at your head: shoot the stone out of the air.</span></li>
        <li><i class="dot blue"></i><span><b>People on the street</b> run for it. Hitting one ends the run.</span></li>
      </ul>
      <dl class="keys">${KEYS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      <div class="actions"><button id="p-go" class="primary">Start walking</button></div>`,
      { "p-go": () => { hidePanel(); G.phase = "play"; } });
  }
  function showEnd() {
    if (G.phase === "win") showPanel(`
      <p class="eyebrow">Level 4 · Complete</p>
      <h2 class="ok">The street is yours</h2>
      <p class="lede">From the pawn shop to the mall doors, nobody left standing who shouldn't be.</p>
      <dl class="stats"><dt>Time</dt><dd>${G.time.toFixed(1)} s</dd><dt>Shots</dt><dd>${G.shots}</dd><dt>Hits</dt><dd>${G.hits}</dd><dt>Health</dt><dd>${G.hp}</dd></dl>
      <div class="actions"><button id="p-again" class="primary">Play again</button><button id="p-menu">Menu</button></div>`, endActions());
    else showPanel(`
      <p class="eyebrow">Level 4 · Failed</p>
      <h2 class="bad">Run over</h2>
      <p class="lede">${G.reason === "civilian" ? "You hit a civilian." : "They got you."}</p>
      <div class="actions"><button id="p-again" class="primary">Try again</button><button id="p-menu">Menu</button></div>`, endActions());
  }
  const endActions = () => ({
    "p-again": () => { hidePanel(); init(); hidePanel(); G.phase = "play"; },
    "p-menu": () => { hidePanel(); const m = document.getElementById("menu"); if (m) m.hidden = false; init(); },
  });

  return { name: "street", init, resize, update, render, onDown, onKey, debug: () => ({ G, figs, stones, cover }) };
})();
