"use strict";
// =====================================================================
// Level 2: The Getaway. You ride shotgun chasing the bank crew's sedan
// through the city at night. Five armed men inside. They lean out of
// the side windows or stand up through the sunroof to fire back.
// Every pane takes four hits: cracks, more cracks, frosted, shattered.
// Shatter the rear glass and you can reach the driver: kill him and
// the car crashes. Waves: one car, bikes, another car with an escort,
// more bikes, then two cars at once. Bikes carry a rider and a gunman
// on the back; drop the rider and the bike goes down.
// Pedestrians and other drivers are blue: never hit.
// =====================================================================
const ChaseLevel = (() => {
  const { LANES, ROAD, FACADE, SIDEWALK, C, PANE, S: CS, makeCar, cw, cp, drawCar, drawPane, uvTo, toUV, drawCity, drawLamp } = CityKit;
  const MAG = 15, RATE = 0.1, DMG = 12, TELE = 0.95, CRUISE = 22;
  const SEATS = [
    { role: "driver", x: -0.42, z: 2.95, side: -1 },
    { role: "front", x: 0.42, z: 2.95, side: 1, lean: "R2" },
    { role: "rearL", x: -0.5, z: 2.0, side: -1, lean: "L1" },
    { role: "rearM", x: 0, z: 2.0, side: 0, pop: true },
    { role: "rearR", x: 0.5, z: 2.0, side: 1, lean: "R1" },
  ];

  const CREWS = { 5: ["driver", "front", "rearL", "rearM", "rearR"], 4: ["driver", "front", "rearL", "rearR"], 3: ["driver", "front", "rearM"] };
  const WAVES = [
    { title: "", cars: [5], bikes: 0 },
    { title: "BIKES COMING UP", cars: [], bikes: 2 },
    { title: "SECOND CAR", cars: [4], bikes: 1 },
    { title: "MORE BIKES", cars: [], bikes: 3 },
    { title: "TWO CARS", cars: [4, 4], bikes: 0 },
  ];
  const BL = 2.1;                                  // bike length
  let W, H, G, cars, bikes, foes, peds, mWin, mwx, mSil, msx, mLow, mlx, mBike, mbx;

  // ------------------------------------------------------------------ setup
  function seat(car, s, kind, weapon) {
    const e = makeFigure({ kind, weapon, pose: s.role === "driver" ? "reach" : weapon ? "rifle" : "hang", kneel: 1, yaw: Math.PI });
    Object.assign(e, { car, seat: s, lean: 0, rise: 0, turn: 0, st: "in", tm: 0, mode: null });
    car.occ.push(e); return e;
  }

  function init() {
    G = { phase: "brief", hp: 100, ammo: MAG, cool: 0, shake: 0, dmg: 0, muzzle: 0, msg: "", msgT: 0, time: 0, shots: 0, hits: 0,
      endT: 0, reason: "", leanT: 3, V: CRUISE, dist: 0, wcracks: [], sparks: [], shards: [], smoke: [], lampLight: 0, helpT: 8, wave: 0, nextWaveT: 2.5, stopped: 0 };
    cars = []; bikes = []; foes = []; peds = [];
    CityKit.resetCity();
    spawnWave(0); cars[0].z = 9;
    for (const side of [-1, 1]) for (let z = 6 + Math.random() * 10; z < 150; z += 14 + Math.random() * 30) cars.push(makeCar({ x: side * 6.25, z, kind: "parked", tone: [9 + Math.random() * 8 | 0, 11 + Math.random() * 8 | 0, 14 + Math.random() * 8 | 0] }));
    for (let i = 0; i < 7; i++) spawnPed(15 + Math.random() * 120);
    showBrief();
  }
  function spawnPed(z) {
    const side = Math.random() < 0.5 ? -1 : 1, toward = Math.random() < 0.5;
    peds.push(makeFigure({ kind: "blue", x: side * (SIDEWALK + (Math.random() - 0.5) * 2), z, yaw: toward ? 0 : Math.PI,
      walkW: 1, speed: 1.1 + Math.random() * 0.5, toward, role: "ped" }));
  }
  function spawnWave(i) {
    const w = WAVES[i]; G.wave = i; if (w.title) say(w.title, 2.2);
    foes = foes.filter(f => !foeDone(f));
    const lanes = [...LANES].sort(() => Math.random() - 0.5);
    w.cars.forEach((n, j) => {
      const c = makeCar({ kind: "enemy", x: lanes[j], lane: lanes[j], z: 45 + j * 16, slot: w.cars.length > 1 ? [8, 14][j] : 8.5, laneT: 2 + j * 1.5, tone: [10, 12, 15] });
      for (const role of CREWS[n]) seat(c, SEATS.find(q => q.role === role), "red", role === "driver" ? null : "rifle");
      cars.push(c); foes.push(c);
    });
    for (let j = 0; j < w.bikes; j++) spawnBike(j);
    if (w.bikes) noise(1.4, "lowpass", 170, 0.55, 1.3);          // engines roaring up behind
  }
  const foeDone = f => !!f.crash || f.occ.every(e => e.dying);
  function spawnBike(j) {
    const side = j % 2 ? 1 : -1;
    const b = { kind: "bike", x: side * (4.4 + Math.random()), z: -2 - j * 2.5, tx: (Math.random() - 0.5) * 8, slot: 6 + Math.random() * 6,
      laneT: 1 + Math.random(), vx: 0, yaw: 0, tilt: 0, occ: [], crash: null };
    for (const [s, weapon] of [[{ role: "rider", x: 0, z: 0.9, y: 0.36 }, null], [{ role: "pillion", x: 0, z: 0.45, y: 0.4 }, "pistol"]]) {
      const e = makeFigure({ kind: "red", weapon, sit: 1, yaw: Math.PI, pose: weapon ? "rifle" : "reach" });
      Object.assign(e, { bike: b, seat: s, lean: 0, rise: 0, turn: 0, st: "in", tm: 0, mode: null });
      b.occ.push(e);
    }
    bikes.push(b); foes.push(b);
  }
  function spawnCiv() {
    const lanes = LANES.filter(l => !foes.some(f => f.kind === "enemy" && !f.crash && Math.abs(l - f.x) < 2));
    if (!lanes.length) return;
    const car = makeCar({ kind: "civ", x: lanes[(Math.random() * lanes.length) | 0], z: 110 + Math.random() * 30, speed: CRUISE - 6 - Math.random() * 4,
      tone: [16 + Math.random() * 10 | 0, 18 + Math.random() * 10 | 0, 22 + Math.random() * 10 | 0] });
    seat(car, SEATS[0], "blue", null);
    if (Math.random() < 0.5) seat(car, SEATS[1], "blue", null).pose = "hang";
    car.glass.rear.tint = 0.3;
    cars.push(car);
  }

  function resize() {
    W = E.W; H = E.H;
    cam.f = H * 0.95; cam.hor = H * 0.4; cam.cx = W / 2; cam.camH = 1.35;
    CityKit.resizeCity();
    mWin = mk(W, H); mwx = mWin.getContext("2d"); mBike = mk(W, H); mbx = mBike.getContext("2d"); mSil = mk(W, H); msx = mSil.getContext("2d"); mLow = mk(W, H); mlx = mLow.getContext("2d");
  }

  // ------------------------------------------------------------------ occupants
  function place(e, dt) {
    const car = e.car, s = e.seat, out = Math.max(e.lean, e.rise, e.turn);
    const [x, z] = cw(car, lerp(s.x, s.side * (C.w + 0.3), e.lean), s.z);
    e.x = x; e.z = z; e.y0 = 0.07 + 0.36 * e.lean + 0.42 * e.rise;   // leaners sit up on the door sill
    const fwd = Math.PI - car.yaw, back = yawToward(e, cam.offX, 0);
    let d = back - fwd; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (!e.dying) {
      e.yaw = fwd + d * smooth(out);
      e.fall = 0.22 * e.lean; e.fallSide = s.side || 1;
      e.kneel = 1 - e.rise;
      e.pose = out > 0.4 && e.weapon ? "aim" : s.role === "driver" ? "reach" : e.weapon ? "rifle" : "hang";
      if (s.role === "driver") e.curlOverride = 0.9;
    } else e.rise = Math.max(0, e.rise - dt * 1.5);
  }
  // bike local -> world, with the roll of a falling bike
  function bw(b, lx, ly, lz) {
    const roll = b.tilt * (b.crashDir || 1), x1 = lx * Math.cos(roll) + ly * Math.sin(roll), y1 = -lx * Math.sin(roll) + ly * Math.cos(roll);
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dz = lz - BL / 2;
    return [b.x + x1 * c + dz * s, y1, b.z + BL / 2 - x1 * s + dz * c];
  }
  function placeBike(e) {
    const b = e.bike, s = e.seat, [x, , z] = bw(b, s.x, 0, s.z);
    e.x = x; e.z = z; e.y0 = s.y;
    const fwd = Math.PI - b.yaw, back = yawToward(e, cam.offX, 0);
    let d = back - fwd; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (e.dying) return;
    e.yaw = fwd + d * smooth(e.turn); e.sit = 1;
    e.pose = e.turn > 0.4 && e.weapon ? "aim" : e.weapon ? "rifle" : "reach";
    if (!e.weapon) e.curlOverride = 0.9;
  }
  function updateShooter(e, dt) {
    if (e.dying || !e.weapon) return;
    const k = e.mode === "pop" ? "rise" : e.mode === "inside" ? "turn" : "lean";
    switch (e.st) {
      case "out": e[k] = Math.min(1, e[k] + dt / 0.35); if (e[k] >= 1) { e.st = "aim"; e.tm = TELE; } break;
      case "aim": if ((e.tm -= dt) <= 0) { fireAtPlayer(e); e.st = "hold"; e.tm = 0.35; } break;
      case "hold": if ((e.tm -= dt) <= 0) e.st = "back"; break;
      case "back": e[k] = Math.max(0, e[k] - dt / 0.35); if (e[k] <= 0) { e.st = "in"; e.mode = null; } break;
    }
  }
  function fireAtPlayer(e) {
    if (G.phase !== "play") return;
    sfx.enemy(); e.flash = 0.09;
    G.hp -= DMG; G.shake = 12; G.dmg = 0.55;
    G.wcracks.push([0.2 + Math.random() * 0.6, 0.12 + Math.random() * 0.5, (Math.random() * 1e9) | 0]);
    if (G.hp <= 0) { G.hp = 0; end("fail", "shot"); }
  }

  // ------------------------------------------------------------------ update
  function update(dt, t) {
    if (G.phase === "play") G.time += dt;
    G.shake = Math.max(0, G.shake - dt * 30) ; G.dmg = Math.max(0, G.dmg - dt); G.muzzle = Math.max(0, G.muzzle - dt);
    G.cool = Math.max(0, G.cool - dt); G.msgT -= dt; if (G.phase === "play") G.helpT -= dt;
    updateEmbers(dt);
    for (const list of [G.sparks, G.shards, G.smoke]) for (const p of list) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; }
    G.sparks = G.sparks.filter(p => p.age < p.life); G.shards = G.shards.filter(p => p.age < p.life); G.smoke = G.smoke.filter(p => p.age < p.life);

    // the world streams past
    const V = G.V, step = V * dt;
    CityKit.advance(step);
    cam.bend = 0.00045 * Math.sin(t * 0.11) + 0.00025 * Math.sin(t * 0.29 + 1);
    for (const p of peds) {
      animate(p, dt); if (updateDeath(p, dt)) p.gone = true;
      if (!p.dying) p.phase += dt * 2 * Math.PI * STANCE * p.speed / (2 * STRIDE * p.style.stride);
      p.z -= step + (p.dying ? 0 : (p.toward ? p.speed : -p.speed) * dt);
    }
    peds = peds.filter(p => p.z > 1.5 && !p.gone);
    while (peds.length < 7) spawnPed(110 + Math.random() * 50);

    // cars: parked ones slide by, civilians are slower traffic we overtake
    for (const c of cars) {
      if (c.kind === "parked") { c.z -= step; if (c.z < -C.len) { c.z += 150 + Math.random() * 20; } }
      if (c.kind === "civ") c.z -= (V - c.speed) * dt;
      for (const e of c.occ) { animate(e, dt); if (updateDeath(e, dt)) e.gone = true; place(e, dt); }
    }
    cars = cars.filter(c => c.kind !== "civ" || c.z > 0.9);
    if (G.phase === "play" && cars.filter(c => c.kind === "civ").length < 2 && Math.random() < dt * 0.25) spawnCiv();

    for (const c of cars) if (c.kind === "enemy") { if (c.crash) updateCarCrash(c, dt); else driveEnemy(c, dt, t); }
    cars = cars.filter(c => !(c.kind === "enemy" && c.crash && c.z < -C.len - 2));
    for (const b of bikes) { updateBike(b, dt, t); for (const e of b.occ) { animate(e, dt); if (updateDeath(e, dt)) e.gone = true; placeBike(e); } }
    bikes = bikes.filter(b => !(b.crash && b.z < -3));

    if (G.phase === "play") {
      const active = foes.filter(f => !f.crash);
      const shooters = active.flatMap(f => f.occ).filter(e => e.weapon && !e.dying);
      const outNow = shooters.filter(e => e.st !== "in").length, cap = active.length > 2 ? 3 : 2;
      G.leanT -= dt;
      if (G.leanT <= 0 && outNow < cap) {
        const ready = shooters.filter(e => e.st === "in");
        if (ready.length) {
          const e = ready[(Math.random() * ready.length) | 0];
          if (e.bike) e.mode = "inside";                           // the man on the back twists round
          else {
            const car = e.car, rearOpen = car.glass.rear.stage >= 4 && e.seat.z < 2.5;
            e.mode = rearOpen && Math.random() < 0.5 ? "inside" : e.seat.pop ? "pop" : "lean";
            if (e.mode === "lean") car.glass[e.seat.lean].open = true;    // window rolled down
          }
          e.st = "out";
        }
        G.leanT = 1.1 + Math.random() * 1.8 + shooters.length * 0.08;
      }
      for (const e of shooters) updateShooter(e, dt);
      // next wave once this one is stopped
      if (foes.every(foeDone) && (G.nextWaveT -= dt) <= 0) {
        if (G.wave + 1 < WAVES.length) { spawnWave(G.wave + 1); G.nextWaveT = 2.5; }
        else { G.phase = "clearing"; G.endT = 0; say("THE CREW IS FINISHED", 2.4); }
      }
    }
    if (G.phase === "clearing") { G.V = ease(G.V, 0, 0.9, dt); if ((G.endT += dt) > 3) { G.phase = "win"; G.endT = 0; showEnd(); } }
    // our car follows the getaway loosely
    const act = foes.filter(f => !f.crash && f.z > 1);
    if (act.length) cam.offX = ease(cam.offX, clamp(act.reduce((s, f) => s + f.x, 0) / act.length * 0.55, -2.2, 2.2), 0.8, dt);
    if (G.phase === "fail" || G.phase === "win") G.endT += dt;
  }

  function driveEnemy(c, dt, t) {
    if ((c.laneT -= dt) <= 0) {
      const taken = cars.filter(o => o !== c && (o.kind === "civ" || (o.kind === "enemy" && !o.crash)) && o.z > c.z - 6 && o.z < c.z + 25);
      const opts = LANES.filter(l => l !== c.lane && !taken.some(o => Math.abs((o.lane ?? o.x) - l) < 1));
      if (opts.length) c.lane = opts[(Math.random() * opts.length) | 0];
      c.laneT = 2.5 + Math.random() * 3.5;
    }
    // swerve out of a civilian's way
    if (cars.some(o => o.kind === "civ" && Math.abs(o.x - c.lane) < 1 && o.z > c.z && o.z < c.z + 12)) c.laneT = 0;
    const ax = (c.lane - c.x) * 2.2 - c.vx * 2.4;
    c.vx += ax * dt; c.x += c.vx * dt;
    c.yaw = clamp(c.vx * 0.07, -0.25, 0.25);
    const want = c.slot + 2.2 * Math.sin(t * 0.33 + c.slot) + 1.2 * Math.sin(t * 0.81);
    c.z = ease(c.z, want, c.z > 25 ? 0.35 : 0.7, dt);
  }
  function updateBike(b, dt, t) {
    if (b.crash) {                                             // down: slides, sparks, left behind
      b.crash.t += dt; b.vw = ease(b.vw, 0, 1.8, dt); b.z -= (G.V - b.vw) * dt;
      b.tilt = Math.min(1.45, b.tilt + dt * 3.2); b.x += b.crashDir * dt * 2;
      if (b.geo && b.z > 1 && Math.random() < 0.9) {
        const [x, y, z] = bw(b, 0, 0.05, 0.8), p = project(x, y, z);
        for (let i = 0; i < 3; i++) G.sparks.push({ x: p[0], y: p[1], vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 90, g: 380, age: 0, life: 0.2 + Math.random() * 0.3 });
      }
      return;
    }
    if ((b.laneT -= dt) <= 0) { b.tx = clamp((Math.random() - 0.5) * 9.5, -5, 5); b.laneT = 1.2 + Math.random() * 2; }
    const ax = (b.tx - b.x) * 3 - b.vx * 2.6;
    b.vx += ax * dt; b.x += b.vx * dt;
    b.yaw = clamp(b.vx * 0.08, -0.3, 0.3);
    b.z = ease(b.z, b.slot + 1.5 * Math.sin(t * 0.7 + b.slot), 0.9, dt);
  }

  function crashCar(c) {
    if (c.crash) return;
    c.crash = { t: 0, dir: c.x >= 0 ? 1 : -1, hit: false }; c.vw = G.V; G.stopped++;
    say("DRIVER DOWN", 1.6);
  }
  function updateCarCrash(c, dt) {
    const k = c.crash; k.t += dt;
    c.vw = ease(c.vw, 0, 1.4, dt); c.z -= (G.V - c.vw) * dt;
    c.x = ease(c.x, k.dir * 6.6, 1.6, dt); c.yaw = ease(c.yaw, k.dir * 0.95, 2.2, dt);
    if (k.t > 0.7 && !k.hit) {
      k.hit = true; G.shake = Math.max(G.shake, 12); sfx.thud(); sfx.ping();
      c.occ.filter(e => !e.dying).forEach((e, i) => setTimeout(() => { e.dying = true; }, 250 + i * 220));
      const [x, y] = cp(c, [0, 0.8, C.len]);
      for (let i = 0; i < 40; i++) G.sparks.push({ x, y, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 200, g: 500, age: 0, life: 0.3 + Math.random() * 0.4 });
    }
    if (k.hit && c.z > 1 && Math.random() < 0.6) {
      const [x, y, kk] = cp(c, [k.dir * 0.4, 1.0, C.len - 0.3]);
      G.smoke.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: -15 - Math.random() * 20, age: 0, life: 2, r: 0.3 * kk });
    }
  }
  function crashBike(b) {
    if (b.crash) return;
    b.crash = { t: 0 }; b.crashDir = b.x >= cam.offX ? 1 : -1; b.vw = G.V; G.stopped++;
    sfx.thud(); say("BIKE DOWN", 1.4);
    b.occ.filter(e => !e.dying).forEach(e => setTimeout(() => { e.dying = true; }, 300));
  }

  // ------------------------------------------------------------------ shooting
  const inPath = (p, x, y) => p && sctx.isPointInPath(p, x, y);
  function shoot() {
    if (G.cool > 0 || G.phase !== "play") return;
    if (G.ammo === 0) { sfx.empty(); say("SPACE TO RELOAD", 1.4); return; }
    G.ammo--; G.shots++; G.cool = RATE; G.muzzle = 0.06; G.shake = Math.max(G.shake, 2.5); sfx.shot();
    const vx = E.mouse.x * SCALE, vy = E.mouse.y * SCALE;
    const occ = cars.flatMap(c => c.occ).filter(e => !e.gone);
    // a car only blocks a target it stands in front of (or the target's own car body)
    const blocked = (e, key) => cars.some(c => c.geo && (c.z < e.z - 0.3 || c === e.car) && inPath(c.geo[c === e.car ? key : "sil"], vx, vy));
    // 1. men leaning out or standing in the sunroof are in front of the cars
    let hit = hitTest(occ.filter(e => e.lean > 0.05), vx, vy);
    if (hit && !blocked(hit.e, "lower")) return kill(hit.e);
    hit = hitTest(occ.filter(e => e.rise > 0.05), vx, vy);
    if (hit && !blocked(hit.e, "sil")) return kill(hit.e);
    hit = hitTest(bikes.flatMap(b => b.occ).filter(e => !e.gone && e.bike.geo), vx, vy);
    if (hit && !blocked(hit.e, "sil") && !inPath(hit.e.bike.geo.body, vx, vy)) return kill(hit.e);
    // 2. vehicles, nearest first: bikes spark, glass soaks rounds until it breaks
    for (const c of [...cars.filter(c => c.geo), ...bikes.filter(b => b.geo)].sort((a, b) => a.z - b.z)) {
      if (c.kind === "bike") { if (inPath(c.geo.body, vx, vy)) return spark(vx, vy); continue; }
      if (!inPath(c.geo.sil, vx, vy) && !c.geo.panes.some(p => inPath(p.path, vx, vy))) continue;
      const pane = c.geo.panes.find(p => inPath(p.path, vx, vy));
      if (pane) {
        const st = c.glass[pane.key];
        if (!st.open && st.stage < 4) return damagePane(c, pane, vx, vy);
        hit = hitTest(c.occ.filter(e => !e.gone && e.lean <= 0.05 && e.rise <= 0.05), vx, vy);
        if (hit) return kill(hit.e);
        return;
      }
      return spark(vx, vy);
    }
    // 3. the street
    hit = hitTest(peds, vx, vy);
    if (hit && !blocked(hit.e, "sil")) kill(hit.e);
  }
  function kill(e) {
    e.dying = true; e.hitFlash = 0.1;
    if (e.kind === "blue") { end("fail", "civilian"); return; }
    G.hits++;
    if (e.seat && e.seat.role === "driver") crashCar(e.car);
    else if (e.seat && e.seat.role === "rider") crashBike(e.bike);
    else say(e.car && e.car.occ.filter(o => !o.dying).length === 1 ? "ONLY THE DRIVER LEFT" : "DOWN", 1.2);
  }
  function damagePane(car, pane, vx, vy) {
    const st = car.glass[pane.key];
    st.stage++; st.cracks.push([...toUV(pane.pts, vx, vy), (Math.random() * 1e9) | 0]);
    sfx.glass();
    if (st.stage >= 4) {                                     // burst: shards fly back at us in the wind
      sfx.glass(); setTimeout(() => sfx.glass(), 60);
      for (let i = 0; i < 70; i++) {
        const [x, y] = uvTo(pane.pts, Math.random(), Math.random());
        G.shards.push({ x, y, vx: (x - W / 2) * (0.5 + Math.random()) + (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 80, g: 420, age: 0, life: 0.6 + Math.random() * 0.6, s: 0.8 + Math.random() * 2.2, rot: Math.random() * 6 });
      }
      if (car.kind === "enemy" && pane.key === "rear") say("REAR GLASS GONE", 1.4);
    }
  }
  function spark(x, y) {
    sfx.ping();
    for (let i = 0; i < 8; i++) G.sparks.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 120, g: 400, age: 0, life: 0.15 + Math.random() * 0.2 });
  }
  function say(m, d = 2) { G.msg = m; G.msgT = d; }
  function end(phase, reason) { if (G.phase !== "play") return; G.phase = phase; G.reason = reason; G.endT = 0; setTimeout(showEnd, 1300); }

  function onDown(b) { if (b === 0) shoot(); if (b === 2) reload(); }
  function reload() { if (G.ammo < MAG) { G.ammo = MAG; sfx.reload(); } }
  function onKey(code) { if (code === "Space" || code === "KeyR") reload(); }

  // ------------------------------------------------------------------ render
  function render(t) {
    sctx.globalAlpha = 1; sctx.globalCompositeOperation = "source-over";
    drawCity(t);
    // street furniture and cars, far to near
    const items = [...CS.lamps.map(l => ({ z: l.z, draw: () => drawLamp(l) })), ...cars.filter(c => c.z < 160).map(c => ({ z: c.z, draw: () => drawCar(c) }))];
    for (const it of items.sort((a, b) => b.z - a.z)) it.draw();
    for (const c of cars) if (c.z >= 160) c.geo = null;
    // masks: windows / outside car silhouettes / outside lower bodies
    mwx.clearRect(0, 0, W, H); mwx.fillStyle = "#fff";
    for (const c of cars) if (c.geo) for (const p of c.geo.panes) mwx.fill(p.path);
    for (const [m, key] of [[msx, "sil"], [mlx, "lower"]]) {
      m.globalCompositeOperation = "source-over"; m.fillStyle = "#fff"; m.fillRect(0, 0, W, H);
      m.globalCompositeOperation = "destination-out"; for (const c of cars) if (c.geo) m.fill(c.geo[key]);
      m.globalCompositeOperation = "source-over";
    }
    const occ = cars.flatMap(c => c.occ).filter(e => !e.gone && e.z < 160);
    drawFigures([...peds.filter(p => !p.gone), ...occ.filter(e => e.rise > 0.05)], t, { mask: mSil, embers: false });
    drawFigures(occ.filter(e => e.lean <= 0.05 && e.rise <= 0.05), t, { mask: mWin, embers: false });
    for (const c of cars) if (c.geo) for (const p of c.geo.panes) drawPane(c, p);
    // bikes: riders first (hidden only by cars nearer than the nearest bike), then the machines over their legs
    const live = bikes.filter(b => b.z > 1 && b.z < 150);
    if (live.length) {
      const zMin = Math.min(...live.map(b => b.z));
      mbx.globalCompositeOperation = "source-over"; mbx.fillStyle = "#fff"; mbx.fillRect(0, 0, W, H);
      mbx.globalCompositeOperation = "destination-out"; for (const c of cars) if (c.geo && c.z < zMin) mbx.fill(c.geo.sil);
      mbx.globalCompositeOperation = "source-over";
      drawFigures(live.flatMap(b => b.occ).filter(e => !e.gone), t, { mask: mBike, embers: false });
    }
    for (const b of bikes) b.geo = null;
    for (const b of live.sort((a, c) => c.z - a.z)) drawBike(b);
    drawFigures(occ.filter(e => e.lean > 0.05), t, { mask: mLow });
    effects(t);
    ownCar(t);
    post(t, { shake: G.shake + 0.6 + Math.random() * 0.4 * (G.V / CRUISE), dmg: G.dmg });
    hud(t);
  }

  function drawBike(b) {
    const g = sctx, P = l => project(...bw(b, ...l)), body = new Path2D();
    const near = cars.filter(c => c.geo && c.z < b.z);
    g.save();
    if (near.length) { const cl = new Path2D(); cl.rect(0, 0, W, H); for (const c of near) cl.addPath(c.geo.sil); g.clip(cl, "evenodd"); }
    const side = clamp(Math.abs(b.x - cam.offX) / Math.max(1, b.z) * 1.6 + Math.abs(b.yaw), 0.16, 0.95), rot = b.tilt * (b.crashDir || 1);
    for (const wz of [1.75, 0.35]) {                          // tyres: thin from behind, rounder seen from the side
      const c = P([0, 0.33, wz]), k = c[2];
      g.fillStyle = "#030405"; g.beginPath(); g.ellipse(c[0], c[1], 0.33 * k * side, 0.33 * k, rot, 0, 7); g.fill();
      body.moveTo(c[0] + 0.33 * k * side, c[1]); body.ellipse(c[0], c[1], 0.33 * k * side, 0.33 * k, rot, 0, 7);
    }
    const prof = [[0.1, 0.5], [0.25, 0.86], [1.0, 0.9], [1.35, 1.02], [1.55, 0.98], [1.72, 0.52], [1.0, 0.36]];
    for (const xo of [-0.13, 0.13]) poly(body, prof.map(([z, y]) => P([xo, y, z])).map(q => [q[0], q[1]]));
    const lit = clamp(1 - b.z / 18, 0, 1);
    g.fillStyle = `rgb(${8 + lit * 10 | 0},${10 + lit * 11 | 0},${13 + lit * 12 | 0})`; g.fill(body);
    const seat = [[-0.16, 0.88, 0.3], [0.16, 0.88, 0.3], [0.16, 0.92, 1.0], [-0.16, 0.92, 1.0]].map(P);
    g.fillStyle = `rgba(30,35,42,${0.9})`; g.beginPath(); g.moveTo(seat[0][0], seat[0][1]); for (const q of seat.slice(1)) g.lineTo(q[0], q[1]); g.fill();
    const h0 = P([-0.4, 1.14, 1.45]), h1 = P([0.4, 1.14, 1.45]);
    g.strokeStyle = "#050608"; g.lineWidth = Math.max(1, 0.035 * h0[2]); g.beginPath(); g.moveTo(h0[0], h0[1]); g.lineTo(h1[0], h1[1]); g.stroke();
    const ex0 = P([0.2, 0.42, 0.15]), ex1 = P([0.2, 0.52, 1.0]);
    g.strokeStyle = `rgba(140,150,165,${0.25 + lit * 0.2})`; g.lineWidth = Math.max(1, 0.05 * ex0[2]); g.beginPath(); g.moveTo(ex0[0], ex0[1]); g.lineTo(ex1[0], ex1[1]); g.stroke();
    const tl = P([0, 0.82, 0.05]);
    g.fillStyle = "rgba(120,45,35,0.6)"; g.fillRect(tl[0] - 0.06 * tl[2], tl[1] - 0.03 * tl[2], 0.12 * tl[2], 0.05 * tl[2]);
    g.restore();
    b.geo = { body };
  }

  function effects(t) {
    const g = sctx;
    g.globalCompositeOperation = "lighter";
    for (const e of foes.flatMap(f => f.occ)) {
      if (e.dying || !e.geom || !e.geom.muzzle) continue;
      const [mx, my, k] = e.geom.muzzle, glint = e.st === "aim" ? (0.55 + 0.45 * Math.sin(t * 30)) * smooth((TELE - e.tm) / 0.25) : 0, fl = (e.flash || 0) > 0 ? 1 : 0;
      e.flash = Math.max(0, (e.flash || 0) - 1 / 60);
      if (!glint && !fl) continue;
      const r = Math.max(4, k * 0.1) * (fl ? 3 : 1), a = fl || glint;
      const gg = g.createRadialGradient(mx, my, 0, mx, my, r);
      gg.addColorStop(0, `rgba(255,240,230,${a})`); gg.addColorStop(0.3, `rgba(255,60,40,${0.7 * a})`); gg.addColorStop(1, "rgba(255,30,20,0)");
      g.fillStyle = gg; g.fillRect(mx - r, my - r, r * 2, r * 2);
      g.strokeStyle = `rgba(255,200,190,${0.6 * a})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(mx - r * 1.8, my); g.lineTo(mx + r * 1.8, my); g.moveTo(mx, my - r * 1.2); g.lineTo(mx, my + r * 1.2); g.stroke();
    }
    for (const p of G.sparks) { const a = 1 - p.age / p.life; g.fillStyle = `rgba(255,235,210,${a})`; g.fillRect(p.x, p.y, 1.6, 1.6); }
    for (const p of G.shards) {
      const a = 1 - p.age / p.life, s = p.s * (1 + p.age * 3);
      g.fillStyle = `rgba(215,225,240,${0.7 * a})`;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot + p.age * 9); g.fillRect(-s / 2, -s / 4, s, s / 2); g.restore();
    }
    g.globalCompositeOperation = "source-over";
    for (const p of G.smoke) { const a = 1 - p.age / p.life; g.fillStyle = `rgba(70,76,86,${0.12 * a})`; g.beginPath(); g.arc(p.x, p.y, p.r * (1 + p.age * 1.2), 0, 7); g.fill(); }
  }

  // our car: windshield frame, mirror, dash with a lit speedo, hood catching lamp light, cracks
  function ownCar(t) {
    const g = sctx;
    g.fillStyle = "#040506";
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, H * 0.05); g.quadraticCurveTo(W / 2, H * 0.085, 0, H * 0.05); g.fill();
    for (const s of [0, 1]) {
      g.beginPath();
      if (!s) { g.moveTo(0, 0); g.lineTo(W * 0.075, 0); g.lineTo(W * 0.02, H * 0.8); g.lineTo(0, H * 0.8); }
      else { g.moveTo(W, 0); g.lineTo(W * 0.925, 0); g.lineTo(W * 0.98, H * 0.8); g.lineTo(W, H * 0.8); }
      g.fill();
    }
    g.fillStyle = "#06070a"; g.beginPath(); g.roundRect(W * 0.43, H * 0.06, W * 0.14, H * 0.055, 6); g.fill();
    g.strokeStyle = "rgba(140,150,165,0.18)"; g.lineWidth = 1; g.stroke();
    // hood
    const hood = g.createLinearGradient(0, H * 0.78, 0, H * 0.86);
    hood.addColorStop(0, `rgba(30,35,42,${0.9})`); hood.addColorStop(1, "rgba(8,9,12,1)");
    g.fillStyle = hood; g.beginPath(); g.moveTo(W * 0.02, H * 0.86); g.quadraticCurveTo(W / 2, H * 0.765, W * 0.98, H * 0.86); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    if (CS.lampLight > 0.05) {                               // lamp light sliding over the hood
      const y = H * 0.8, hx = W * (0.5 + 0.1 * Math.sin(CS.dist * 0.05));
      const hg = g.createRadialGradient(hx, y, 0, hx, y, W * 0.25);
      hg.addColorStop(0, `rgba(190,200,215,${0.12 * clamp(CS.lampLight, 0, 1)})`); hg.addColorStop(1, "rgba(190,200,215,0)");
      g.globalCompositeOperation = "lighter"; g.fillStyle = hg; g.fillRect(0, H * 0.75, W, H * 0.12); g.globalCompositeOperation = "source-over";
    }
    // dashboard
    g.fillStyle = "#030405"; g.beginPath(); g.moveTo(0, H * 0.87); g.quadraticCurveTo(W * 0.5, H * 0.83, W, H * 0.88); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    g.strokeStyle = "rgba(140,150,165,0.14)"; g.beginPath(); g.moveTo(0, H * 0.87); g.quadraticCurveTo(W * 0.5, H * 0.83, W, H * 0.88); g.stroke();
    g.font = `500 ${H * 0.03}px "JetBrains Mono", ui-monospace, monospace`; g.textAlign = "center"; g.fillStyle = "rgba(190,200,215,0.35)";
    g.fillText(`${Math.round(G.V * 3.6)} km/h`, W * 0.24, H * 0.93);
    if (G.muzzle > 0) {
      const mg = g.createRadialGradient(W * 0.8, H * 0.95, 0, W * 0.8, H * 0.95, H * 0.5);
      mg.addColorStop(0, "rgba(255,225,180,0.45)"); mg.addColorStop(1, "rgba(255,225,180,0)");
      g.globalCompositeOperation = "lighter"; g.fillStyle = mg; g.fillRect(0, 0, W, H); g.globalCompositeOperation = "source-over";
    }
    for (const [u, v, seed] of G.wcracks) {
      const r = mulberry(seed), cx = u * W, cy = v * H, R = H * 0.08;
      g.strokeStyle = "rgba(205,215,230,0.4)"; g.lineWidth = 0.7;
      for (let i = 0; i < 12; i++) {
        let a = i / 12 * 6.283 + r() * 0.4, x = cx, y = cy; g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 3; s++) { a += (r() - 0.5) * 0.5; x += Math.cos(a) * R * (0.2 + r() * 0.3); y += Math.sin(a) * R * (0.2 + r() * 0.3); g.lineTo(x, y); }
        g.stroke();
      }
      g.beginPath(); g.arc(cx, cy, R * 0.3, 0, 7); g.stroke();
    }
  }

  // ------------------------------------------------------------------ HUD + panels
  function hud(t) {
    const k = hudK(), pad = 28 * k, VW = E.VW, VH = E.VH, ink = "200,215,235";
    if (G.phase === "play") crosshair(E.mouse.x * k, E.mouse.y * k, k);
    glowText(`LEVEL 2   THE GETAWAY   ·   WAVE ${G.wave + 1}/${WAVES.length}`, pad, pad + 30 * k, 13 * k, ink, 0.6, "left");
    glowText("CREW", pad, pad + 54 * k, 11 * k, ink, 0.5, "left");
    const focus = foes.filter(f => f.kind === "enemy" && !f.crash).sort((a, b) => a.z - b.z)[0];
    foes.filter(f => !f.crash).flatMap(f => f.occ).forEach((e, i) => {
      vctx.fillStyle = e.dying ? "rgba(120,60,60,0.45)" : "rgba(255,60,45,0.95)";
      vctx.shadowColor = "rgba(255,40,30,0.9)"; vctx.shadowBlur = e.dying ? 0 : 6 * k;
      vctx.beginPath(); vctx.arc(pad + 54 * k + i * 13 * k, pad + 54 * k, 3.5 * k, 0, 7); vctx.fill();
    });
    vctx.shadowBlur = 0;
    if (focus) {
      glowText("REAR GLASS", pad, pad + 76 * k, 11 * k, ink, 0.5, "left");
      for (let i = 0; i < 4; i++) {
        vctx.fillStyle = i < focus.glass.rear.stage ? "rgba(220,230,245,0.85)" : "rgba(220,230,245,0.15)";
        vctx.fillRect(pad + 90 * k + i * 14 * k, pad + 71 * k, 10 * k, 9 * k);
      }
    }
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
    if (G.phase === "play" && G.helpT > 0) glowText("CLICK FIRE  ·  SPACE RELOAD  ·  ESC MENU", VW / 2, VH * 0.95, 13 * k, ink, Math.min(1, G.helpT) * 0.7);
  }

  const KEYS = [["Left click", "Fire"], ["Space", "Reload"], ["Esc", "Menu"]];
  function showBrief() {
    showPanel(`
      <p class="eyebrow">Level 2 · Pursuit</p>
      <h2>The Getaway</h2>
      <p class="lede">The bank crew is running for it: four cars and a pack of motorbikes, coming at you in waves. You're riding shotgun at 80 km/h.</p>
      <ul class="legend">
        <li><i class="dot red"></i><span><b>The crew</b> lean out of the side windows or stand up through the sunroof to fire. A red glint flashes before each shot. That is your moment.</span></li>
        <li><i class="dot red" style="opacity:.55"></i><span><b>The glass</b> takes four hits: cracks, more cracks, frosted, then it breaks. Through broken rear glass you can reach the driver. Drop him and the car crashes.</span></li>
        <li><i class="dot red" style="opacity:.8"></i><span><b>Bikes</b> roar up from behind. The man on the back twists round to shoot; drop the rider and the bike goes down.</span></li>
        <li><i class="dot blue"></i><span><b>Other drivers and people on the street.</b> Hitting one ends the chase.</span></li>
      </ul>
      <dl class="keys">${KEYS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      <div class="actions"><button id="p-go" class="primary">Start the chase</button></div>`,
      { "p-go": () => { hidePanel(); G.phase = "play"; } });
  }
  function showEnd() {
    if (G.phase === "win") showPanel(`
      <p class="eyebrow">Level 2 · Complete</p>
      <h2 class="ok">The getaway is over</h2>
      <p class="lede">Four cars wrapped round lamp posts and a trail of bikes on the tarmac behind you.</p>
      <dl class="stats"><dt>Time</dt><dd>${G.time.toFixed(1)} s</dd><dt>Shots</dt><dd>${G.shots}</dd><dt>Crew hit</dt><dd>${G.hits}</dd><dt>Stopped</dt><dd>${G.stopped} vehicles</dd><dt>Health</dt><dd>${G.hp}</dd></dl>
      <div class="actions"><button id="p-again" class="primary">Play again</button><button id="p-menu">Menu</button></div>`, endActions());
    else showPanel(`
      <p class="eyebrow">Level 2 · Failed</p>
      <h2 class="bad">Chase failed</h2>
      <p class="lede">${G.reason === "civilian" ? "You hit a civilian." : "You were shot."}</p>
      <div class="actions"><button id="p-again" class="primary">Try again</button><button id="p-menu">Menu</button></div>`, endActions());
  }
  const endActions = () => ({
    "p-again": () => { hidePanel(); init(); hidePanel(); G.phase = "play"; },
    "p-menu": () => { hidePanel(); const m = document.getElementById("menu"); if (m) m.hidden = false; init(); },
  });

  return { name: "chase", init, resize, update, render, onDown, onKey, debug: () => ({ G, cars, bikes, foes, peds, spawnWave, get enemy() { return foes.find(f => f.kind === "enemy" && !f.crash); } }) };
})();
