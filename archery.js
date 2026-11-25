"use strict";
// =====================================================================
// The Archer. On foot along a fixed path, Street Run style: the walk
// stops wherever something shows itself and moves on once it is dealt
// with. Five acts: the forest (hunt to eat, wolves and boar charge),
// the fort wall (get in unseen), the town, the palace and the scroll,
// then the escape with every guard alerted.
// Bow: hold left mouse to draw (about 1 s), release to loose. Arrows are
// real projectiles with drop; they stick in trees, walls, shields and
// bodies, and some can be picked up as you walk past. Right mouse zooms.
// Colours: red = archers, orange = melee guards and hostile animals,
// blue = townsfolk (never hit them), green-gold = prey (food).
// =====================================================================
const ArcheryLevel = (() => {
  const K = WildKit, S = K.S;
  const GRAV = 7, VMIN = 13, VMAX = 66, DRAW_T = 1.0, SHAKE_T = 1.3, NOCK = 0.45, MAXQ = 24;
  const WALK = 2.8, EYE = 1.62, CROUCH = 1.2, TELE = 1.0, END_D = 546;
  const PIXEL = { cell: 4, levels: 8, dots: 0.3, grain: 16, sat: 1.18 };

  // ---------------------------------------------------------------- world layout
  const ZONES = [[-10, 165, "forest"], [165, 238, "meadow"], [238, 333, "town"], [333, 381, "court"], [381, 446, "hall"], [446, 506, "town"], [506, 640, "forest"]];
  const SCROLL = { here: true, screen: null };
  const SPECIALS = [
    // act 1: clearings where the animals show (no trees there) and hides
    { type: "clearing", wz: 14, x: 0, clear: [0, 30, 9] }, { type: "clearing", wz: 50, x: 0, clear: [0, 26, 7] },
    { type: "clearing", wz: 92, x: 0, clear: [0, 26, 6] }, { type: "clearing", wz: 130, x: 0, clear: [0, 30, 9] },
    { type: "bush", x: -1.7, wz: 15.5, s: 0.75, hide: true, clear: [2, 2, 1.5] },
    { type: "bush", x: 1.7, wz: 131.5, s: 0.75, hide: true, clear: [2, 2, 1.5] },
    // act 2: the fort wall
    { type: "bush", x: -1.7, wz: 205.5, s: 0.8, hide: true, clear: [2, 2, 1.5] },
    { type: "cart", x: -1.5, wz: 215.6, hide: true, clear: [2, 2, 3] },
    { type: "wall", wz: 238, h: 9, gate: [4.4, 5.5], towers: [-7, 7, -26, 26], portcullis: true, banners: [-14, 14], clear: [5, 6, 80] },
    { type: "torch", x: -2.9, y: 3.6, wz: 237.85 }, { type: "torch", x: 2.9, y: 3.6, wz: 237.85 },
    // act 3: town
    { type: "cart", x: -1.5, wz: 253.6, hide: true, clear: [2, 2, 3] },
    { type: "stall", x: 3.4, wz: 262, clear: [2, 2, 1.5] }, { type: "stall", x: -3.4, wz: 268, clear: [2, 2, 1.5] },
    { type: "box", x0: 3.6, x1: 4.8, y1: 3.6, z0: 271, z1: 272.4, rgb: [70, 56, 44], clear: [2, 3, 2] },
    { type: "walkway", side: -1, wz: 292, len: 20, h: 4.5 },
    { type: "cart", x: 1.5, wz: 283.6, hide: true, clear: [2, 2, 3] },
    { type: "cart", x: -1.5, wz: 313.6, hide: true, clear: [2, 2, 3] },
    { type: "wall", wz: 333, h: 8, gate: [4.4, 5.6], towers: [-7, 7], rgb: [84, 80, 88], banners: [-3.4, 3.4], span: 70, clear: [4, 4, 80] },
    { type: "torch", x: -3.2, y: 4.2, wz: 332.85 }, { type: "torch", x: 3.2, y: 4.2, wz: 332.85 },
    // act 4: palace
    { type: "bush", x: -1.6, wz: 347.5, s: 0.75, hide: true },
    { type: "wall", wz: 381, h: 14, gate: [3.6, 5], towers: [-9, 9], rgb: [92, 86, 84], banners: [-5, 5], span: 10, thick: 1.5 },
    { type: "torch", x: -2.6, y: 3.6, wz: 380.85 }, { type: "torch", x: 2.6, y: 3.6, wz: 380.85 },
    { type: "pillar", x: -1.1, wz: 387.4, h: 2.2, rad: 0.5, hide: true },
    { type: "wall", wz: 402, h: 9, gate: [2.6, 3.6], rgb: [66, 50, 40], span: 6, thick: 0.8 },
    { type: "pillar", x: 1.2, wz: 405.5, h: 2.2, rad: 0.5, hide: true },
    { type: "pedestal", x: -1.6, wz: 412, scroll: SCROLL },
    { type: "throne", x: 0.6, wz: 421.4 },
    // act 5: escape
    { type: "wall", wz: 424, h: 9, gate: [2.4, 3.4], rgb: [66, 50, 40], span: 6, thick: 0.8 },
    { type: "wall", wz: 446, h: 7, gate: [2.4, 3.4], rgb: [80, 76, 80], span: 14, thick: 1.2 },
    { type: "box", x0: -4.8, x1: -3.6, y1: 3.4, z0: 466, z1: 467.4, rgb: [70, 56, 44], clear: [2, 3, 2] },
    { type: "wall", wz: 506, h: 8, gate: [2.8, 3.6], towers: [-8, 9], span: 80, clear: [5, 6, 80] },
    { type: "torch", x: -2, y: 3.1, wz: 505.85 }, { type: "torch", x: 2, y: 3.1, wz: 505.85 },
  ];
  const STOPS = [
    { at: 14, act: 0, name: "THE CLEARING", hunt: true },
    { at: 50, act: 0, name: "WOLVES" },
    { at: 92, act: 0, name: "THE BOAR" },
    { at: 130, act: 0, name: "THE STREAM", hunt: true },
    { at: 204, act: 1, name: "THE TREE LINE", stealth: true },
    { at: 214, act: 1, name: "THE GATE", stealth: true },
    { at: 252, act: 2, name: "MARKET LANE", stealth: true },
    { at: 282, act: 2, name: "THE WALL WALK", stealth: true },
    { at: 312, act: 2, name: "PALACE GATE", stealth: true },
    { at: 346, act: 3, name: "THE COURTYARD", stealth: true },
    { at: 386, act: 3, name: "THE GREAT HALL", stealth: true },
    { at: 404, act: 3, name: "THE KING'S CHAMBER", stealth: true },
    { at: 409.5, act: 3, name: "THE SCROLL", scroll: true },
    { at: 428, act: 4, name: "ALARM" },
    { at: 456, act: 4, name: "THE BURNING TOWN" },
    { at: 484, act: 4, name: "THE POSTERN GATE" },
    { at: 522, act: 4, name: "INTO THE WOODS" },
  ];
  const ACTS = [
    { d: 0, name: "THE FOREST", quiver: 16 },
    { d: 168, name: "THE FORT", quiver: 16 },
    { d: 240, name: "THE TOWN", quiver: 18 },
    { d: 336, name: "THE PALACE", quiver: 18 },
    { d: 409.5, name: "ESCAPE", quiver: 20 },
  ];
  let W, H, G, figs, arrows, stuck, foeArrows;

  // ---------------------------------------------------------------- setup
  function init(act = 0) {
    G = { phase: "brief", act, hp: 100, food: 100, quiver: ACTS[act].quiver, draw: 0, drawing: false, hold: 0, nock: 0, zk: 0, zoomHeld: false,
      shake: 0, dmg: 0, msg: "", msgT: 0, big: "", bigT: 0, time: 0, shots: 0, hits: 0, kills: 0, food0: 0, endT: 0, reason: "",
      stop: -1, speed: 0, clearT: 0, fighting: false, alert: false, alarm: act === 4, scroll: act === 4, skip: false, bob: 0, helpT: 9,
      sparks: [], dust: [], bodies: [], camH: EYE, release: 0, crackT: 0, reinf: false, losT: 0, ate: new Set(), actShown: act - 1 };
    figs = []; arrows = []; stuck = []; foeArrows = [];
    SCROLL.here = act < 4;
    K.build({ zones: ZONES, specials: SPECIALS }, 7);
    S.D = ACTS[act].d;
    G.stop = STOPS.findIndex(s => s.at >= S.D - 0.01) - 1;
    if (act === 4) G.stop = STOPS.findIndex(s => s.scroll);
    showBrief();
  }
  const add = o => { const e = makeFigure(o); figs.push(e); return e; };
  const vz = wz => wz - S.D;

  function guard(role, x, wz, o = {}) {
    const [kind, weapon, pose] = { archer: ["red", "bow", "bowdn"], sword: ["orange", "sword", "hang"], spear: ["orange", "spear", "rifle"], shield: ["orange", "sword", "shield"] }[role];
    const e = add(Object.assign({ kind, weapon, pose, shield: role === "shield", role, x, z: vz(wz), foe: true, guard: true, hp: 1, sus: 0, st: "watch", speed: 1.1,
      yaw: 0, homeYaw: o.yaw ?? 0, delay: 0 }, o));
    if (e.patrol) { e.st = "patrol"; e.pi = 0; }
    if (G.alarm || G.alert) goAlert(e, o.delay ?? 0.4 + Math.random());
    return e;
  }
  function animal(species, x, wz, o = {}) {
    const kind = species === "deer" ? "green" : "orange";
    const e = add(Object.assign({ body: "quad", species, kind, x, z: vz(wz), yaw: 0, foe: species !== "deer", prey: species === "deer",
      hp: species === "wolf" ? 1 : 2, speed: 1, st: species === "deer" ? "graze" : "delay", delay: 0, grazeCur: 0, alertCur: 0 }, o));
    e.style.stride = 1; e.style.build = species === "boar" ? 1.05 : 0.95 + Math.random() * 0.1;
    return e;
  }
  function folk(x, wz, o = {}) { return add(Object.assign({ kind: "blue", role: "folk", x, z: vz(wz), speed: 1 + Math.random() * 0.3, yaw: Math.random() < 0.5 ? 0 : Math.PI, st: "stroll" }, o)); }

  // what happens at each stop (world coords; the wall walk and gate tops via y0)
  function encounter(i) {
    G.stop = i; G.fighting = true; G.alert = G.alarm; G.reinf = false; G.skip = false; say(STOPS[i].name, 2.4);
    const D = S.D;
    switch (i) {
      case 0:
        animal("deer", 2.6, D + 9, { yaw: 1.2 }); animal("deer", -3.4, D + 13, { yaw: -0.6, antlers: false }); animal("deer", 0.8, D + 18, { yaw: 2.6 });
        break;
      case 1:
        sfx.howl();
        animal("wolf", -13, D + 11, { delay: 0.6 }); animal("wolf", 12, D + 15, { delay: 2.2 }); animal("wolf", 1.5, D + 28, { delay: 3.6 }); animal("wolf", -7, D + 24, { delay: 6 });
        break;
      case 2:
        animal("boar", 0.8, D + 18, { delay: 0.8 });
        animal("deer", -14, D + 14, { st: "flee", fleeTo: [16, D + 30], yaw: -1.6, speed: 7.5 });
        break;
      case 3:
        animal("deer", -2.6, D + 10, { yaw: 0.8 }); animal("deer", 3.6, D + 14, { yaw: -1.9 }); animal("deer", -1.2, D + 20, { yaw: 2.2, antlers: false });
        animal("wolf", -15, D + 26, { delay: 9 }); animal("wolf", 15, D + 22, { delay: 10.5 });
        break;
      case 4:
        guard("archer", -3, 238.9, { y0: 9, patrol: [[-3.6, 238.9], [3.6, 238.9]] });
        guard("archer", 12, 238.9, { y0: 9, patrol: [[10, 238.9], [21, 238.9]], pi: 1 });
        guard("spear", -1.6, 236.4, { yaw: 0.2 });
        break;
      case 5:
        guard("spear", -1.8, 236.6, { yaw: 0.3 }); guard("spear", 1.8, 236.6, { yaw: -0.3 });
        guard("sword", -9, 235.4, { patrol: [[-10, 235.4], [-3, 234.8]] });
        guard("archer", -13, 238.9, { y0: 9, patrol: [[-20, 238.9], [-11, 238.9]] });
        break;
      case 6:
        folk(3.6, D + 9); folk(-3.8, D + 14); folk(3.2, D + 22, { yaw: Math.PI });
        guard("sword", -1.5, D + 30, { patrol: [[-1.5, D + 30], [-1.2, D + 12]] }); guard("sword", 1.4, D + 32, { patrol: [[1.4, D + 32], [1.6, D + 14]] });
        guard("archer", 4.2, 271.7, { y0: 3.6, yaw: -0.4 });
        break;
      case 7:
        folk(3.5, D + 8, { yaw: Math.PI }); folk(-3.2, D + 20);
        guard("archer", -5.6, 300, { y0: 4.5, patrol: [[-5.6, 298], [-5.6, 309]] }); guard("archer", -5.6, 305, { y0: 4.5, yaw: 0.5 });
        guard("sword", 2, D + 24, { patrol: [[2, D + 24], [-2, D + 13]] });
        break;
      case 8:
        guard("shield", -1.9, 331.8, { yaw: 0.15 }); guard("shield", 1.9, 331.8, { yaw: -0.15 });
        guard("archer", -3.4, 333.9, { y0: 8, patrol: [[-4, 333.9], [-0.5, 333.9]] }); guard("archer", 3.4, 333.9, { y0: 8, yaw: -0.2 });
        break;
      case 9:
        folk(-5.5, D + 12, { role: "folk", st: "stand" }); folk(5.2, D + 20, { st: "stand", yaw: -0.5 });
        guard("sword", -5, D + 14, { patrol: [[-5, D + 14], [5, D + 16]] }); guard("sword", 5, D + 24, { patrol: [[5, D + 24], [-5, D + 22]] });
        guard("shield", 0, 379.6, { hp: 2 }); guard("archer", 5.5, D + 30, { yaw: -0.4 });
        break;
      case 10:
        folk(3, D + 9, { st: "stand", yaw: -0.8 });
        guard("sword", -2.5, D + 9, { hp: 2, patrol: [[-2.5, D + 9], [-2.5, D + 14.5]] }); guard("shield", 2.5, D + 13, { hp: 2, patrol: [[2.5, D + 13], [2.5, D + 7]] });
        guard("archer", -3, 400.6, { hp: 2, yaw: 0.2 });
        break;
      case 11:
        guard("shield", -0.6, 413.6, { hp: 2, yaw: Math.PI }); guard("sword", 2.6, 417.5, { hp: 2, patrol: [[2.6, 417.5], [2.6, 410.5]] });
        guard("archer", 3.2, 420.5, { hp: 2, yaw: -0.3 }); folk(-2.8, 420.5, { st: "stand", yaw: 0.6 });
        break;
      case 12: break;                              // the scroll: click it
      case 13:
        guard("sword", -1, D + 9, { delay: 0.3 }); guard("sword", 1.4, D + 13, { delay: 1.2 }); guard("archer", 0.6, D + 16, { delay: 0.8 });
        break;
      case 14:
        folk(3.6, D + 10, { st: "flee" }); folk(-3.5, D + 15, { st: "flee" });
        guard("archer", -4.2, 466.7, { y0: 3.4, delay: 0.5 }); guard("sword", 3.6, D + 12, { delay: 1 }); guard("sword", -3.4, D + 20, { delay: 2.4 });
        guard("archer", 2, D + 26, { delay: 3 }); guard("spear", 0, D + 30, { delay: 5 });
        break;
      case 15:
        guard("spear", -1.6, 504.6, { delay: 0.5 }); guard("spear", 1.6, 504.6, { delay: 1.5 });
        guard("archer", -4, 506.8, { y0: 8, delay: 0.8 }); guard("archer", 5, 506.8, { y0: 8, delay: 2 });
        break;
      case 16:
        sfx.howl(); animal("wolf", -12, D + 12, { delay: 0.5 }); animal("wolf", 11, D + 16, { delay: 1.8 }); animal("wolf", 0.5, D + 26, { delay: 3 });
        break;
    }
    if (G.alarm) for (const f of figs) if (f.guard && !f.dying && f.st !== "alert") goAlert(f, 0.3 + Math.random());
  }
  const foesLeft = () => figs.filter(f => f.foe && !f.dying).length;
  const preyLeft = () => figs.filter(f => f.prey && !f.dying && f.st !== "flee").length;

  function resize() {
    W = E.W; H = E.H;
    cam.f = H * 0.85; cam.hor = H * 0.46; cam.cx = W / 2; cam.camH = G ? G.camH : EYE;
    K.resize();
  }

  // ---------------------------------------------------------------- update
  function update(dt, t) {
    const play = G.phase === "play";
    if (play) G.time += dt;
    if (G.phase === "fail" || G.phase === "win") G.endT += dt;
    G.shake = Math.max(0, G.shake - dt * 30); G.dmg = Math.max(0, G.dmg - dt); G.msgT -= dt; G.bigT -= dt; G.release = Math.max(0, G.release - dt);
    G.nock = Math.max(0, G.nock - dt); if (play) G.helpT -= dt;
    updateEmbers(dt);
    for (const list of [G.sparks, G.dust]) for (const p of list) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; }
    G.sparks = G.sparks.filter(p => p.age < p.life); G.dust = G.dust.filter(p => p.age < p.life);

    // hunger drains; empty hunger eats health
    if (play) { G.food = Math.max(0, G.food - dt * 100 / 300); if (G.food <= 0) hurt(dt * 1.2, true); }

    // the walk, stopping at each encounter until it is clear
    if (play) {
      const next = STOPS[G.stop + 1];
      if (!G.fighting && next && S.D >= next.at - 0.02) encounter(G.stop + 1);
      const cur = STOPS[G.stop];
      if (G.fighting && cur && !cur.scroll && foesLeft() === 0 && foeArrows.length === 0) {
        if (cur.hunt && preyLeft() > 0 && !G.skip) G.clearT = 0;
        else if ((G.clearT += dt) > 1.2) { G.fighting = false; G.clearT = 0; G.alert = G.alarm; say("MOVE", 1.2); }
      }
      const act = ACTS.reduce((a, A, i) => (i === 4 ? G.scroll : S.D >= A.d - 0.01) ? i : a, 0);
      if (act !== G.actShown) {
        G.actShown = act; G.act = act; G.big = `ACT ${act + 1}  ·  ${ACTS[act].name}`; G.bigT = 3.2;
        if (G.quiver < ACTS[act].quiver - 4) { G.quiver = ACTS[act].quiver - 4; say("FOUND ARROWS  ·  QUIVER RESTOCKED", 2); }
      }
      if (S.D >= END_D) { G.phase = "clearing"; G.endT = 0; say("YOU GOT AWAY", 2.5); }
    }
    if (G.phase === "clearing" && (G.endT += dt) > 2.4) { G.phase = "win"; G.endT = 0; showEnd(); }
    const walking = (play && !G.fighting) || G.phase === "clearing";
    G.speed = ease(G.speed, walking ? WALK : 0, 3, dt);
    let step = G.speed * dt;
    const nx = STOPS[G.stop + 1]; if (nx && !G.fighting) step = Math.min(step, Math.max(0, nx.at - S.D));
    S.D += step;
    for (const f of figs) f.z -= step;
    for (const b of G.bodies) b.age = (b.age || 0) + dt;
    G.bob += step * 1.9;
    const hid = K.hidden();
    G.hidden = hid && !walking;
    G.camH = ease(G.camH, G.hidden ? CROUCH : EYE, 4, dt);
    cam.camH = G.camH;
    cam.hor = H * 0.46 + Math.sin(G.bob * 2) * H * 0.006 * (G.speed / WALK);
    cam.offX = K.pathX(S.D) + Math.sin(G.bob) * 0.05 * (G.speed / WALK);
    pickups(step);

    // bow: draw, hold, shake
    if (G.drawing && play) {
      if (G.draw < 1) { G.draw = Math.min(1, G.draw + dt / DRAW_T); if (Math.random() < dt * 6) sfx.creak(); }
      else G.hold += dt;
    }
    G.zk = ease(G.zk, G.zoomHeld && play ? 1 : 0, 9, dt);
    cam.zoom = 1 + 0.6 * G.zk;
    const [ax, ay] = aimPoint(t), hw = W / (2 * cam.zoom), hh = H / (2 * cam.zoom);
    const [mx, my] = [E.mouse.x * SCALE, E.mouse.y * SCALE];
    cam.fx = clamp(lerp(W / 2, (mx + ax) / 2, G.zk * 0.7), hw, W - hw); cam.fy = clamp(lerp(H / 2, (my + ay) / 2, G.zk * 0.7), hh, H - hh);

    // living things
    G.losT -= dt; const losTick = G.losT <= 0; if (losTick) G.losT = 0.25;
    for (const e of figs) {
      animate(e, dt); if (updateDeath(e, dt)) e.gone = true;
      e.ping = Math.max(0, (e.ping || 0) - dt * 0.9);
      if (e.dying) continue;
      if (e.body === "quad") { animalAI(e, dt, t); continue; }
      if (e.role === "folk") { folkAI(e, dt); continue; }
      if (G.phase !== "play" && G.phase !== "clearing") { idle(e, dt); continue; }
      guardAI(e, dt, t, losTick);
    }
    for (const e of figs) if (e.gone) for (const a of stuck) if (a.fig === e) dropArrow(a);
    figs = figs.filter(f => !f.gone && f.z > -4 && f.z < 220);
    flyArrows(dt);
    flyFoeArrows(dt);
    stuck = stuck.filter(a => a.fig ? !a.fig.gone : a.p[2] - S.D > -3);
  }

  // aim point in view px: the mouse, plus a shake that grows once full draw is held too long
  function aimPoint(t) {
    const amp = (G.drawing ? 0.6 + Math.max(0, G.hold - SHAKE_T) * 9 : 0.4) * (1 + G.zk * 0.5) * (H / 500);
    return [E.mouse.x * SCALE + (Math.sin(t * 2.1) + Math.sin(t * 5.3) * 0.5) * amp * 2, E.mouse.y * SCALE + (Math.cos(t * 1.7) + Math.sin(t * 6.1) * 0.5) * amp * 1.6];
  }

  // ---------------------------------------------------------------- animals
  function animalAI(e, dt, t) {
    const sp = e.species, run = sp === "wolf" ? 2.1 : sp === "boar" ? 1.8 : 2.4;
    e.style.stride = e.speed > 3 ? run : 0.95;
    e.grazeCur = ease(e.grazeCur, e.st === "graze" && e.grazing ? 1 : 0, 3, dt);
    e.alertCur = ease(e.alertCur, e.st === "flee" || e.st === "charge" || e.wary > 0 ? 1 : 0, 4, dt);
    e.wary = Math.max(0, (e.wary || 0) - dt);
    if (G.phase !== "play" && G.phase !== "clearing" && e.st !== "flee") { idle(e, dt); return; }
    if (sp === "deer") {
      if (e.st === "graze") {
        e.tm = (e.tm ?? 1 + Math.random() * 3) - dt;
        if (e.tm <= 0) { e.grazing = !e.grazing; e.tm = e.grazing ? 2 + Math.random() * 4 : 1 + Math.random() * 2; if (!e.grazing && Math.random() < 0.5) { e.tx = e.x + (Math.random() - 0.5) * 3; e.tzw = e.z + S.D + (Math.random() - 0.5) * 3; } }
        if (!e.grazing && e.tx != null) { e.speed = 0.7; if (walkTo(e, e.tx, e.tzw - S.D, dt)) e.tx = null; } else idle(e, dt);
        // wolves on the charge or the hunter walking up make them bolt
        if (figs.some(w => w.species === "wolf" && !w.dying && w.st === "charge" && Math.hypot(w.x - e.x, w.z - e.z) < 14)) startle(e);
      } else if (e.st === "flee") {
        e.speed = 7.5;
        if (!e.fleeTo) e.fleeTo = [Math.sign(e.x || 1) * 30, e.z + S.D + 35];
        walkTo(e, e.fleeTo[0], e.fleeTo[1] - S.D, dt);
        if (Math.abs(e.x) > 27 || e.z > 70) e.gone = true;
      }
      return;
    }
    if (e.st === "delay") { idle(e, dt); if ((e.delay -= dt) <= 0) { e.st = sp === "boar" ? "paw" : "stalk"; e.ping = 1; e.tm = 1.1; if (sp === "wolf" && Math.random() < 0.5) sfx.howl(); } return; }
    if (sp === "wolf") {
      e.lane = e.lane ?? (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6);
      if (e.st === "stalk") {                      // trot in to a jumping-off point, then go
        e.speed = 2.3; const tz = Math.min(e.z, 12), tx = e.x * 0.6;
        if (walkTo(e, tx, tz, dt) || (e.tm -= dt) < -3) e.st = "charge";
      } else if (e.st === "charge") {
        e.speed = 6.6; const weave = Math.sin(t * 1.9 + e.id) * Math.min(2.2, e.z * 0.25);
        if (walkTo(e, cam.offX + e.lane + weave, 1.5, dt)) { e.st = "bite"; e.tm = 0.25; }
      } else {
        idle(e, dt); turnTo(e, yawToward(e, cam.offX, 0), dt, 8);
        if ((e.tm -= dt) <= 0) { hurt(10); sfx.flesh(); e.tm = 0.9; e.lunge = 0.25; G.shake = Math.max(G.shake, 8); }
      }
      return;
    }
    // boar: paws the ground, then a straight charge; if it reaches you it hits hard and wheels round
    if (e.st === "paw") {
      idle(e, dt); turnTo(e, yawToward(e, cam.offX, 0), dt, 5);
      if ((e.tm -= dt) <= 0) { e.st = "charge"; e.cx = cam.offX + (Math.random() - 0.5) * 0.6; noise(0.4, "lowpass", 180, 0.5, 1.5); }
    } else if (e.st === "charge") {
      e.speed = 7.6;
      if (walkTo(e, e.cx, 1.2, dt)) { hurt(22); sfx.thud(); G.shake = 16; e.st = "wheel"; e.wx = (Math.random() < 0.5 ? -1 : 1) * 5; }
    } else if (e.st === "wheel") {
      e.speed = 5.5;
      if (walkTo(e, e.wx, 10, dt)) { e.st = "paw"; e.tm = 0.9; }
    }
  }
  function startle(e) { if (e.prey && e.st !== "flee" && !e.dying) { e.st = "flee"; e.fleeTo = null; noise(0.15, "highpass", 1400, 0.12, 2); } }

  // ---------------------------------------------------------------- townsfolk
  function folkAI(e, dt) {
    if (e.st === "stand") { idle(e, dt); if (G.alert) e.st = "flee"; return; }
    if (e.st === "flee" || G.alert) {
      e.st = "flee"; e.speed = 3; e.pose = "hang";
      e.fx = e.fx ?? (Math.sign(e.x || 1) * 4.2); e.fz = e.fz ?? e.z + 30;
      if (walkTo(e, e.fx, e.fz, dt)) e.gone = true;
      return;
    }
    e.phase += dt * 2 * Math.PI * STANCE * e.speed / (2 * STRIDE * e.style.stride);
    e.walkW = ease(e.walkW, 1, 4, dt); e.z += (Math.abs(e.yaw) > 1 ? 1 : -1) * e.speed * dt;
    if (e.z < 3 || e.z > 40) { e.yaw = Math.abs(e.yaw) > 1 ? 0 : Math.PI; }
  }

  // ---------------------------------------------------------------- guards
  function goAlert(e, delay = 0.5) {
    if (e.dying) return;
    e.sus = 1; e.st = "alert"; e.ast = "delay"; e.tm = delay; e.ping = 1;
  }
  function raiseAlarm(by) {
    if (G.alert) return;
    G.alert = true; sfx.shout(); say("SPOTTED — THEY ARE ON YOU", 2.2);
    for (const f of figs) if (f.guard && !f.dying) goAlert(f, f === by ? 0.2 : 0.4 + Math.random() * 1.2);
    if (!G.reinf && STOPS[G.stop] && STOPS[G.stop].stealth) {     // calls for help: more come running
      G.reinf = true;
      setTimeout(() => { if (G.phase === "play" && G.fighting) { const e = guard("sword", (Math.random() < 0.5 ? -1 : 1) * 2.5, S.D + 24, { delay: 0.2 }); e.ping = 1; say("REINFORCEMENTS", 1.4); } }, 2500);
    }
  }
  function eyes(e) { return [e.x, e.y0 + 1.6, e.z + S.D]; }
  function guardAI(e, dt, t, losTick) {
    const yawTo = yawToward(e, cam.offX, 0), dist = Math.hypot(e.x - cam.offX, e.z, e.y0 - 1);
    if (e.st === "alert") return alertAI(e, dt, t, yawTo, dist);
    // patrol / watch / investigate
    if (e.st === "patrol") {
      const p = e.patrol[e.pi];
      e.speed = 1.05; e.pose = e.role === "archer" ? "bowdn" : e.role === "shield" ? "shield" : e.role === "spear" ? "rifle" : "hang";
      if (e.wait > 0) { e.wait -= dt; idle(e, dt); turnTo(e, e.lookYaw, dt, 2); }
      else if (walkTo(e, p[0], p[1] - S.D, dt)) { e.pi = (e.pi + 1) % e.patrol.length; e.wait = 1.6 + Math.random(); e.lookYaw = e.yaw + (Math.random() - 0.5) * 2.4; }
    } else if (e.st === "watch") {
      idle(e, dt); turnTo(e, e.homeYaw + Math.sin(t * 0.35 + e.id) * 0.9, dt, 2);
    } else if (e.st === "investigate") {
      e.speed = 1.3;
      if (e.inv && e.y0 === 0) { if (walkTo(e, e.inv[0], e.inv[1] - S.D, dt) || (e.tm -= dt) < 0) { e.inv = null; e.tm = 3; } }
      else { idle(e, dt); turnTo(e, e.invYaw ?? yawTo, dt, 3); if ((e.tm -= dt) <= 0) { e.st = e.patrol ? "patrol" : "watch"; } }
    }
    // looking for you
    if (losTick) e.los = !K.blocked(eyes(e), [cam.offX, cam.camH, S.D + 0.3]);
    let ang = Math.abs(Math.atan2(Math.sin(yawTo - e.yaw), Math.cos(yawTo - e.yaw)));
    if (ang < 1.0 && e.los && dist < 55) {
      let rate = 0.55 * (1 - dist / 62) * (dist < 7 ? 3 : 1);
      if (G.hidden) rate *= 0.1; else if (G.drawing) rate *= 1.3;
      e.sus += rate * dt;
    } else e.sus = Math.max(0, e.sus - dt * 0.04);
    // bodies on the ground
    for (const b of G.bodies) {
      if (b.seen && b.seen.has(e.id)) continue;
      const bx = b.x - e.x, bz = b.wz - S.D - e.z, d = Math.hypot(bx, bz), a2 = Math.abs(Math.atan2(Math.sin(Math.atan2(bx, -bz) - e.yaw), Math.cos(Math.atan2(bx, -bz) - e.yaw)));
      if (d < 14 && a2 < 1.0) { (b.seen = b.seen || new Set()).add(e.id); e.sus += 0.7; e.st = "investigate"; e.inv = [b.x, b.wz]; e.tm = 4; say("BODY FOUND", 1.2); }
    }
    if (e.sus > 0.55 && e.st !== "investigate") { e.st = "investigate"; e.invYaw = yawTo; e.tm = 3.5; }
    if (e.sus >= 1) raiseAlarm(e);
  }
  function alertAI(e, dt, t, yawTo, dist) {
    if (e.ast === "delay") { idle(e, dt); turnTo(e, yawTo, dt, 6); if ((e.tm -= dt) <= 0) { e.ast = "go"; e.ping = 1; } return; }
    if (e.role === "archer") {
      if (e.ast === "go") {                          // a few steps to a clear spot if he is on the ground and far
        e.ast = "raise"; e.tm = 0.5;
      }
      idle(e, dt); turnTo(e, yawTo, dt, 6);
      e.pose = e.ast === "raise" || e.ast === "tele" || e.ast === "hold" ? "bow" : "bowdn";
      if ((e.tm -= dt) > 0) return;
      if (e.ast === "raise") { e.ast = "tele"; e.tm = TELE; }
      else if (e.ast === "tele") { loose(e); e.ast = "hold"; e.tm = 0.3; }
      else if (e.ast === "hold") { e.ast = "cool"; e.tm = 1.7 + Math.random() * 1.5; }
      else { e.ast = "raise"; e.tm = 0.5; }
      return;
    }
    if (e.y0 > 0) { idle(e, dt); turnTo(e, yawTo, dt, 6); return; }   // melee man stuck up on a wall
    if (e.ast === "go") {
      e.speed = e.role === "shield" ? 1.9 : 2.8;
      e.pose = e.role === "shield" ? "shield" : e.role === "spear" ? "rifle" : e.z < 4.5 ? "raise" : "knife";
      e.lane = e.lane ?? (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.4);
      if (walkTo(e, cam.offX + e.lane, e.role === "spear" ? 2.0 : 1.4, dt)) { e.ast = "strike"; e.tm = 0.4; }
      return;
    }
    idle(e, dt); turnTo(e, yawTo, dt, 8);
    e.tm -= dt;
    e.pose = e.role === "spear" ? (e.tm > 0.5 ? "rifle" : "aim") : e.tm > 0.5 ? "raise" : e.role === "shield" ? "shield" : "knife";
    if (e.tm <= 0) { hurt(14); sfx.thud(); e.tm = 1.15; G.shake = Math.max(G.shake, 9); }
  }
  // enemy arrow: ballistic toward your head with some spread
  function loose(e) {
    const p = [e.x, e.y0 + 1.45, e.z + S.D - 0.3];
    const tgt = [cam.offX + (Math.random() - 0.5) * 0.9, cam.camH - 0.1 + (Math.random() - 0.5) * 0.7, S.D + 0.2];
    const d = Math.hypot(tgt[0] - p[0], tgt[1] - p[1], tgt[2] - p[2]), T = d / 34;
    foeArrows.push({ p, v: [(tgt[0] - p[0]) / T, (tgt[1] - p[1]) / T + 0.5 * GRAV * T, (tgt[2] - p[2]) / T], trail: [], age: 0 });
    sfx.twang(0.8); e.flash = 0.08;
  }

  // ---------------------------------------------------------------- your arrows
  function loosePlayer(t) {
    const k = G.draw; G.drawing = false; G.draw = 0; G.hold = 0;
    if (k < 0.08 || G.quiver <= 0 || G.phase !== "play") return;
    G.quiver--; G.shots++; G.nock = NOCK; G.release = 0.18; sfx.twang(k);
    const [ax, ay] = aimPoint(t), [sx, sy] = toStage(ax, ay);
    const d = norm3([(sx - cam.cx) / cam.f, (cam.hor - sy) / cam.f, 1]), v = lerp(VMIN, VMAX, Math.pow(k, 1.3));
    const p = [cam.offX + d[0] * 0.5, cam.camH - 0.04 + d[1] * 0.5, S.D + d[2] * 0.5];
    arrows.push({ p, v: [d[0] * v, d[1] * v, d[2] * v], trail: [], age: 0, power: k });
  }
  function flyArrows(dt) {
    for (const a of arrows) {
      a.age += dt; a.trail.push([...a.p, a.age]); while (a.trail.length > 2 && a.age - a.trail[0][3] > 0.3) a.trail.shift();
      const sp = Math.hypot(...a.v), n = Math.max(1, Math.ceil(sp * dt / 0.25)), h = dt / n;
      for (let i = 0; i < n && !a.done; i++) {
        const prev = a.p.slice();
        a.v[1] -= GRAV * h; a.p = [a.p[0] + a.v[0] * h, a.p[1] + a.v[1] * h, a.p[2] + a.v[2] * h];
        // living things first: the arrow crosses the plane each one stands in
        for (const f of figs) {
          if (f.dying || !f.geom || f.alpha < 0.3 || f.z < 0.8) continue;
          const fz = f.z + S.D;
          if ((prev[2] - fz) * (a.p[2] - fz) > 0) continue;
          const q = lerp3(prev, a.p, (fz - prev[2]) / ((a.p[2] - prev[2]) || 1e-6)), [qx, qy] = project(q[0], q[1], q[2] - S.D), g = f.geom;
          const head = Math.hypot(qx - g.head[0], qy - g.head[1]) < g.head[2];
          if (g.shield && sctx.isPointInPath(g.shield, qx, qy) && !head) { stick(a, q, f, false); sfx.thunk(); spark(qx, qy); continue; }
          if (head || sctx.isPointInPath(g.path, qx, qy)) { stick(a, q, f, true); hitFig(f, head, a); break; }
        }
        if (a.done) break;
        if (a.p[1] <= 0.02) { a.p[1] = 0.02; stick(a, a.p, null, true); noiseAt(a.p, 0.35); sfx.thunk(); dustAt(a.p); break; }
        const h2 = K.hitScene(prev, a.p);
        if (h2) { stick(a, a.p, null, h2.o.y1 == null || a.p[1] < 2.6); noiseAt(a.p, 0.3); sfx.thunk(); dustAt(a.p); break; }
        if (a.p[2] - S.D > 170 || a.age > 6) a.done = true;
      }
    }
    arrows = arrows.filter(a => !a.done);
  }
  function stick(a, q, f, keep) {
    a.done = true;
    const dir = norm3(a.v), s = { p: q.slice(), dir, keep: keep && Math.random() < (f ? 0.75 : 0.6), wobble: 0.35 };
    if (f) { s.fig = f; s.off = [q[0] - f.x, q[1] - f.y0, q[2] - S.D - f.z]; }
    stuck.push(s);
  }
  function dropArrow(a) { const f = a.fig; a.p = [f.x + a.off[0], 0.06, f.z + S.D + a.off[2]]; a.dir = norm3([a.dir[0], -0.05, a.dir[2]]); a.fig = null; a.flat = true; }
  function hitFig(f, head, a) {
    f.hitFlash = 0.1;
    if (f.kind === "blue") { f.dying = true; sfx.flesh(); return end("fail", "civilian"); }
    G.hits++; sfx.flesh();
    f.hp -= head ? 99 : 1;
    if (f.hp > 0) {                                // wounded: staggers, cries out, everyone knows
      f.stagger = 1; say(f.body ? "HIT — AGAIN" : "WOUNDED", 0.9);
      if (f.guard) { f.sus = 1; noiseAt([f.x, 1, f.z + S.D], 0.8, 16); raiseAlarm(f); }
      if (f.prey) startle(f);
      if (f.species === "boar" && f.st === "paw") f.tm = Math.min(f.tm, 0.2);
      return;
    }
    f.dying = true; f.fallSide = Math.sign(a.v[0]) || 1; G.kills++;
    if (f.prey) {
      G.food = Math.min(100, G.food + 35); G.food0 += 35; say(head ? "CLEAN KILL  ·  FOOD +35" : "FOOD +35", 1.4);
      for (const o of figs) if (o.prey && o !== f && Math.hypot(o.x - f.x, o.z - f.z) < 18) startle(o);
    } else say(head ? "HEADSHOT" : "DOWN", 0.9);
    if (f.guard) {
      G.bodies.push({ x: f.x, wz: f.z + S.D });
      if (f.role === "archer") G.bodies[G.bodies.length - 1].quiver = { x: f.x, wz: f.z + S.D, y: f.y0, n: 3 };
      // anyone watching him drop
      for (const o of figs) if (o.guard && !o.dying && o !== f && o.st !== "alert") {
        const bx = f.x - o.x, bz = f.z - o.z, ang = Math.abs(Math.atan2(Math.sin(Math.atan2(bx, -bz) - o.yaw), Math.cos(Math.atan2(bx, -bz) - o.yaw)));
        if (Math.hypot(bx, bz) < 22 && ang < 1.1) { o.sus += head ? 0.45 : 0.7; o.st = "investigate"; o.invYaw = Math.atan2(bx, -bz); o.tm = 3.5; }
      }
    }
  }
  // a thud where the arrow lands: guards nearby turn and come to look, deer bolt
  function noiseAt(p, amt, rad = 9) {
    for (const f of figs) {
      if (f.dying) continue;
      const d = Math.hypot(f.x - p[0], f.z + S.D - p[2]);
      if (f.prey && d < 6) startle(f);
      if (f.guard && f.st !== "alert" && d < rad) {
        f.sus += amt * (1 - d / rad); f.st = "investigate"; f.inv = [p[0], p[2]]; f.tm = 5; f.invYaw = Math.atan2(p[0] - f.x, -(p[2] - S.D - f.z));
      }
    }
  }
  function flyFoeArrows(dt) {
    for (const a of foeArrows) {
      a.age += dt; a.trail.push([...a.p, a.age]); while (a.trail.length > 2 && a.age - a.trail[0][3] > 0.3) a.trail.shift();
      const n = Math.max(1, Math.ceil(Math.hypot(...a.v) * dt / 0.3)), h = dt / n;
      for (let i = 0; i < n && !a.done; i++) {
        const prev = a.p.slice();
        a.v[1] -= GRAV * h; a.p = [a.p[0] + a.v[0] * h, a.p[1] + a.v[1] * h, a.p[2] + a.v[2] * h];
        if (a.p[2] < S.D + 0.35) {
          a.done = true;
          if (Math.abs(a.p[0] - cam.offX) < 0.42 && Math.abs(a.p[1] - cam.camH) < 0.55) { hurt(15); sfx.flesh(); G.crackT = 0.6; }
          else noise(0.12, "highpass", 2600, 0.12, 2);           // whizz past
          break;
        }
        if (a.p[1] < 0.02 || (a.age > 0.08 && K.hitScene(prev, a.p))) { a.done = true; a.p[1] = Math.max(0.02, a.p[1]); stuck.push({ p: a.p.slice(), dir: norm3(a.v), keep: Math.random() < 0.35, wobble: 0.3, foe: true }); sfx.thunk(); }
      }
      if (a.age > 5) a.done = true;
    }
    foeArrows = foeArrows.filter(a => !a.done);
  }

  // arrows and dropped quivers you can reach are picked up as you walk past
  function pickups(step) {
    if (step <= 0) return;
    for (const a of stuck) {
      if (a.fig || a.taken) continue;
      const z = a.p[2] - S.D;
      if (z < 1.3 && z > -1 && Math.abs(a.p[0] - cam.offX) < 7 && a.p[1] < 2.6) {
        a.taken = true;
        if (a.keep && G.quiver < MAXQ) { G.quiver++; flashPick("+1 ARROW"); }
      }
    }
    stuck = stuck.filter(a => !a.taken);
    for (const b of G.bodies) {
      const q = b.quiver; if (!q || q.taken) continue;
      const z = q.wz - S.D;
      if (z < 1.3 && Math.abs(q.x - cam.offX) < 6 && q.y < 0.5) { q.taken = true; G.quiver = Math.min(MAXQ, G.quiver + q.n); flashPick(`+${q.n} ARROWS`); }
    }
    for (const it of S.items) if (it.type === "stall" && !G.ate.has(it) && it.wz - S.D < 1.5) { G.ate.add(it); G.food = Math.min(100, G.food + 25); flashPick("BREAD  ·  FOOD +25"); }
  }
  function flashPick(m) { if (G.msgT < 0.3 || G.msg.startsWith("+") || G.msg.startsWith("BREAD")) say(m, 1.0); sfx.reload(); }

  function hurt(n, quiet) {
    if (G.phase !== "play") return;
    G.hp -= n;
    if (!quiet) { G.shake = Math.max(G.shake, 10); G.dmg = 0.55; }
    if (G.hp <= 0) { G.hp = 0; end("fail", G.food <= 0 && quiet ? "starved" : "down"); }
  }
  function spark(x, y) { for (let i = 0; i < 6; i++) G.sparks.push({ x, y, vx: (Math.random() - 0.5) * 140, vy: -Math.random() * 100, g: 400, age: 0, life: 0.12 + Math.random() * 0.15 }); }
  function dustAt(p) {
    const z = p[2] - S.D; if (z < 0.6) return;
    const [x, y, k] = project(p[0], p[1], z);
    for (let i = 0; i < 7; i++) G.dust.push({ x, y, vx: (Math.random() - 0.5) * k * 0.6, vy: -Math.random() * k * 0.4, g: k * 1.2, age: 0, life: 0.4 + Math.random() * 0.3, r: Math.max(0.6, k * 0.012) });
  }
  function say(m, d = 2) { G.msg = m; G.msgT = d; }
  function end(phase, reason) { if (G.phase !== "play") return; G.phase = phase; G.reason = reason; G.endT = 0; G.drawing = false; setTimeout(showEnd, 1300); }

  // ---------------------------------------------------------------- input
  function onDown(b) {
    if (b === 2) { G.zoomHeld = true; return; }
    if (b !== 0 || G.phase !== "play") return;
    const st = STOPS[G.stop];
    if (st && st.scroll && SCROLL.here && SCROLL.screen && foesLeft() === 0) {
      const [sx, sy, r] = SCROLL.screen, k = 1 / SCALE;
      if (Math.hypot(E.mouse.x - sx * k, E.mouse.y - sy * k) < Math.max(28, r * k * 1.6)) return takeScroll();
    }
    if (G.quiver <= 0) { sfx.empty(); say("QUIVER EMPTY", 1.2); return; }
    if (G.nock > 0) return;
    G.drawing = true; G.draw = 0; G.hold = 0;
  }
  function onUp(b) {
    if (b === 2) { G.zoomHeld = false; return; }
    if (b === 0 && G.drawing) loosePlayer(performance.now() / 1000);
  }
  function onKey(code) {
    if (code === "Space" && G.phase === "play" && G.fighting) {
      const st = STOPS[G.stop];
      if (st && st.hunt && foesLeft() === 0) { G.skip = true; say("MOVING ON", 1); }
    }
    if (code === "KeyZ") G.zoomHeld = !G.zoomHeld;
  }
  function takeScroll() {
    SCROLL.here = false; G.scroll = true; G.alarm = true; G.alert = true; G.fighting = false;
    sfx.shout(); setTimeout(() => sfx.shout(), 500);
    say("THE SCROLL IS YOURS — RUN", 2.6);
    G.quiver = Math.max(G.quiver, ACTS[4].quiver);
  }

  // ---------------------------------------------------------------- render
  function render(t) {
    sctx.globalAlpha = 1; sctx.globalCompositeOperation = "source-over";
    let left = figs.filter(f => !f.gone && f.z > 0.8), flushes = 0;
    // before an item at view depth z is drawn, draw the living things beyond it that it
    // could cover on screen (items carry a half-width `ext` in metres; none = could cover anything)
    const flush = (z, it) => {
      if (z < 0) { drawFigures(left, t); left = []; return; }
      if (!left.length || (it && it.ext === 0) || flushes >= 4) return;   // ponytail: past 4 layers the rest share the last one
      let x0 = -1e9, x1 = 1e9;
      if (it && it.ext != null && it.x != null && z > 0.5) { const [sx, , k] = project(it.x, 0, z); x0 = sx - it.ext * k - 4; x1 = sx + it.ext * k + 4; }
      const batch = left.filter(f => f.z > z && (!f.geom || (f.geom.box[2] > x0 && f.geom.box[0] < x1)));
      if (!batch.length) return;
      left = left.filter(f => !batch.includes(f)); flushes++;
      drawFigures(batch, t, { embers: false });
    };
    const extra = [];
    for (const a of stuck) { const wz = a.fig ? a.fig.z + S.D + a.off[2] - 0.05 : a.p[2]; extra.push({ wz, x: a.fig ? a.fig.x + a.off[0] : a.p[0], ext: 0.5, fn: () => drawStuck(a, t) }); }
    for (const a of arrows) extra.push({ wz: a.p[2], x: a.p[0], ext: 0.8, fn: () => drawFlying(a, [40, 30, 22], [230, 225, 210]) });
    for (const a of foeArrows) extra.push({ wz: a.p[2], x: a.p[0], ext: 0.8, fn: () => drawFlying(a, [30, 10, 8], [255, 130, 110]) });
    for (const b of G.bodies) if (b.quiver && !b.quiver.taken && b.quiver.y < 0.5) extra.push({ wz: b.quiver.wz + 0.1, fn: () => drawQuiver(b.quiver) });
    K.draw(t, flush, extra);
    effects(t);
    bow(t);
    post(t, { shake: G.shake + 0.3, dmg: G.dmg, pixel: PIXEL });
    hud(t);
  }

  function shaft(p, dir, len, col, lw) {
    const a = [p[0] - dir[0] * len, p[1] - dir[1] * len, p[2] - dir[2] * len - S.D], b = [p[0], p[1], p[2] - S.D];
    if (a[2] < 0.5 && b[2] < 0.5) return null;
    const A = project(a[0], a[1], Math.max(0.5, a[2])), B = project(b[0], b[1], Math.max(0.5, b[2]));
    sctx.strokeStyle = col; sctx.lineWidth = Math.max(0.9, lw * Math.min(A[2], B[2])); sctx.lineCap = "round";
    sctx.beginPath(); sctx.moveTo(A[0], A[1]); sctx.lineTo(B[0], B[1]); sctx.stroke();
    return [A, B];
  }
  function drawFlying(a, dark, streak) {
    const dir = norm3(a.v), g = sctx;
    if (a.trail.length) {                          // faint streak along the last 0.3 s of flight, fading out behind
      const pts = a.trail.concat([[...a.p, a.age]]).filter(p => p[2] - S.D > 0.5).map(p => [...project(p[0], p[1], p[2] - S.D), 1 - (a.age - p[3]) / 0.3]);
      g.globalCompositeOperation = "lighter";
      for (let i = 1; i < pts.length; i++) { g.strokeStyle = `rgba(${streak[0]},${streak[1]},${streak[2]},${0.4 * Math.max(0, pts[i][3])})`; g.lineWidth = Math.max(1.6, pts[i][2] * 0.02); g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }
      g.globalCompositeOperation = "source-over";
    }
    const s = shaft(a.p, dir, 0.75, `rgba(${streak[0]},${streak[1]},${streak[2]},0.35)`, 0.03);   // pale edge so the shaft reads on dark ground
    shaft(a.p, dir, 0.75, `rgb(${dark})`, 0.016);
    if (s) { const [A] = s; g.fillStyle = `rgba(${streak[0]},${streak[1]},${streak[2]},0.8)`; g.fillRect(A[0] - 1.5, A[1] - 1.5, 3, 3); }
  }
  function drawStuck(a, t) {
    let p = a.p;
    if (a.fig) { const f = a.fig; p = [f.x + a.off[0], f.y0 + a.off[1] - (f.fall || 0) * 0.5 * a.off[1], f.z + S.D + a.off[2]]; }
    const wob = a.wobble > 0 ? Math.sin(t * 40) * a.wobble * 0.05 : 0; a.wobble = Math.max(0, a.wobble - 1 / 60);
    const dir = a.flat ? a.dir : norm3([a.dir[0] + wob, a.dir[1], a.dir[2]]);
    shaft(p, dir, a.flat ? 0.75 : 0.5, "rgba(200,190,170,0.25)", 0.026);
    const s = shaft(p, dir, a.flat ? 0.75 : 0.5, a.foe ? "rgb(36,22,18)" : "rgb(46,36,26)", 0.014);
    if (s) {                                        // pale fletching at the tail
      const [A] = s, r = Math.max(1.2, A[2] * 0.03);
      sctx.fillStyle = a.keep && !a.fig ? "rgba(225,220,200,0.85)" : "rgba(180,170,150,0.6)";
      sctx.beginPath(); sctx.moveTo(A[0], A[1]); sctx.lineTo(A[0] - r, A[1] - r * 1.4); sctx.lineTo(A[0] + r * 0.4, A[1] - r * 0.4); sctx.closePath(); sctx.fill();
    }
  }
  function drawQuiver(q) {
    const z = q.wz - S.D; if (z < 0.6) return;
    const [x, y, k] = project(q.x + 0.3, 0.05, z);
    sctx.fillStyle = "rgb(60,40,26)"; sctx.save(); sctx.translate(x, y); sctx.rotate(-0.3); sctx.fillRect(-0.3 * k, -0.08 * k, 0.6 * k, 0.16 * k);
    sctx.strokeStyle = "rgba(225,220,200,0.8)"; sctx.lineWidth = Math.max(1, k * 0.01); sctx.beginPath(); for (let i = 0; i < 3; i++) { sctx.moveTo(-0.3 * k, (-0.05 + i * 0.05) * k); sctx.lineTo(-0.45 * k, (-0.08 + i * 0.05) * k); } sctx.stroke(); sctx.restore();
  }

  function effects(t) {
    const g = sctx;
    g.globalCompositeOperation = "lighter";
    for (const e of figs) {                         // red glint on the bow before an enemy looses
      if (e.dying || !e.geom || !e.geom.muzzle || e.role !== "archer" || e.st !== "alert") continue;
      const [mx, my, k] = e.geom.muzzle, glint = e.ast === "tele" ? (0.55 + 0.45 * Math.sin(t * 30)) * smooth((TELE - e.tm) / 0.25) : 0, fl = (e.flash || 0) > 0 ? 1 : 0;
      e.flash = Math.max(0, (e.flash || 0) - 1 / 60);
      if (!glint && !fl) continue;
      const r = Math.max(4, k * 0.1) * (fl ? 2 : 1), a = fl || glint, gg = g.createRadialGradient(mx, my, 0, mx, my, r);
      gg.addColorStop(0, `rgba(255,240,230,${a})`); gg.addColorStop(0.3, `rgba(255,60,40,${0.7 * a})`); gg.addColorStop(1, "rgba(255,30,20,0)");
      g.fillStyle = gg; g.fillRect(mx - r, my - r, r * 2, r * 2);
      g.strokeStyle = `rgba(255,200,190,${0.6 * a})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(mx - r * 1.8, my); g.lineTo(mx + r * 1.8, my); g.moveTo(mx, my - r * 1.2); g.lineTo(mx, my + r * 1.2); g.stroke();
    }
    for (const p of G.sparks) { g.fillStyle = `rgba(255,235,210,${1 - p.age / p.life})`; g.fillRect(p.x, p.y, 1.6, 1.6); }
    for (const e of figs) if ((e.foe || e.guard) && !e.dying && e.ping > 0 && e.geom) {   // ring pulses out when something shows up
      const [x, y] = e.geom.chest, u = 1 - e.ping, r = (0.5 + u * 1.6) * e.geom.kb, c = COL[e.kind].aura;
      g.strokeStyle = `rgba(${c},${e.ping * 0.8})`; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
    }
    g.globalCompositeOperation = "source-over";
    for (const p of G.dust) { g.fillStyle = `rgba(150,140,120,${0.6 * (1 - p.age / p.life)})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
    if (G.crackT > 0) G.crackT -= 1 / 60;
  }

  // your bow, left of centre: limbs bend and the string comes back as you draw
  function bow(t) {
    if (G.phase === "brief") return;
    const g = sctx, k = H / 500, d = G.drawing ? easeOut(G.draw) : 0, rel = G.release / 0.18;
    const sway = G.speed > 0.3 ? Math.sin(G.bob * 2) * 4 * k : 0, shake = G.drawing && G.hold > SHAKE_T ? Math.sin(t * 40) * Math.min(3, G.hold - SHAKE_T) * k : 0;
    const gx = W * 0.3 + shake + rel * 6 * k, gy = H * 0.66 + sway - d * 10 * k, L = 250 * k, bend = 26 * k + d * 32 * k;
    const tipT = [gx + bend * 0.9, gy - L], tipB = [gx + bend * 0.9, gy + L * 0.95];
    g.save();
    g.strokeStyle = "#0a0806"; g.lineCap = "round";
    g.lineWidth = 9 * k; g.beginPath(); g.moveTo(tipT[0], tipT[1]); g.quadraticCurveTo(gx - bend * 1.1, gy - L * 0.45, gx, gy); g.quadraticCurveTo(gx - bend * 1.1, gy + L * 0.45, tipB[0], tipB[1]); g.stroke();
    g.strokeStyle = "rgba(170,140,100,0.28)"; g.lineWidth = 1.4 * k; g.beginPath(); g.moveTo(tipT[0] - 3 * k, tipT[1]); g.quadraticCurveTo(gx - bend * 1.1 - 4 * k, gy - L * 0.45, gx - 4 * k, gy); g.stroke();
    // string: straight at rest, drawn back toward your face (lower right) at full draw
    const nock = [lerp(tipT[0] + 2 * k, W * 0.52, d), lerp(gy, H * 0.7, d)];
    g.strokeStyle = "rgba(200,190,170,0.55)"; g.lineWidth = 1.1 * k;
    g.beginPath(); g.moveTo(tipT[0], tipT[1]); g.lineTo(nock[0], nock[1]); g.lineTo(tipB[0], tipB[1]); g.stroke();
    // nocked arrow along the line to where you aim
    if (G.quiver > 0 && G.nock <= 0 && G.phase === "play") {
      const [ax, ay] = aimPoint(t), [sx, sy] = toStage(ax, ay), dx = sx - nock[0], dy = sy - nock[1], dl = Math.hypot(dx, dy) || 1, len = 230 * k;
      const tip = [nock[0] + dx / dl * len, nock[1] + dy / dl * len];
      g.strokeStyle = "#16100a"; g.lineWidth = 3.2 * k; g.beginPath(); g.moveTo(nock[0], nock[1]); g.lineTo(tip[0], tip[1]); g.stroke();
      g.fillStyle = "#0c0906"; g.beginPath(); g.moveTo(tip[0] + dx / dl * 14 * k, tip[1] + dy / dl * 14 * k); g.lineTo(tip[0] - dy / dl * 5 * k, tip[1] + dx / dl * 5 * k); g.lineTo(tip[0] + dy / dl * 5 * k, tip[1] - dx / dl * 5 * k); g.fill();
      g.fillStyle = "rgba(210,200,180,0.5)"; g.beginPath(); g.moveTo(nock[0], nock[1]); g.lineTo(nock[0] + dx / dl * 30 * k - dy / dl * 9 * k, nock[1] + dy / dl * 30 * k + dx / dl * 9 * k); g.lineTo(nock[0] + dx / dl * 34 * k, nock[1] + dy / dl * 34 * k); g.fill();
      if (d > 0) { g.fillStyle = "#0b0907"; g.beginPath(); g.ellipse(nock[0] + 10 * k, nock[1] + 16 * k, 22 * k, 30 * k, -0.5, 0, 7); g.fill(); }   // drawing hand
    }
    g.fillStyle = "#0b0907"; g.beginPath(); g.ellipse(gx + 2 * k, gy + 6 * k, 20 * k, 32 * k, 0.15, 0, 7); g.fill();   // bow hand round the grip
    g.fillStyle = "rgba(160,130,100,0.18)"; g.fillRect(gx - 14 * k, gy - 8 * k, 4 * k, 26 * k);
    g.restore();
  }

  // ---------------------------------------------------------------- HUD + panels
  function hud(t) {
    const k = hudK(), pad = 28 * k, VW = E.VW, VH = E.VH, ink = "200,215,235";
    const [ax, ay] = aimPoint(t), [cxv, cyv] = [ax / SCALE * k, ay / SCALE * k];
    if (G.phase === "play") {
      crosshair(cxv, cyv, k, 12);
      if (G.drawing) {                              // draw strength arc; goes red when the aim starts to shake
        const shaking = G.hold > SHAKE_T;
        vctx.strokeStyle = shaking ? "rgba(255,110,90,0.9)" : G.draw >= 1 ? "rgba(255,226,170,0.95)" : "rgba(220,235,255,0.75)";
        vctx.lineWidth = 3 * k; vctx.beginPath(); vctx.arc(cxv, cyv, 22 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * G.draw); vctx.stroke();
      }
    }
    const st = STOPS[G.stop], act = ACTS[G.act];
    glowText(`THE ARCHER   ·   ACT ${G.act + 1} ${act.name}${st && G.fighting ? "   ·   " + st.name : ""}`, pad, pad, 13 * k, ink, 0.6, "left");
    let line = pad + 24 * k;
    if (G.fighting && foesLeft()) { glowText(`HOSTILE ${foesLeft()}`, pad, line, 11 * k, "255,140,110", 0.6, "left"); line += 18 * k; }
    if (G.fighting && preyLeft()) { glowText(`PREY ${preyLeft()}`, pad, line, 11 * k, "200,220,120", 0.6, "left"); line += 18 * k; }
    if (G.phase === "play" && !G.fighting && G.speed > 0.5) glowText("MOVING", pad, line, 11 * k, ink, 0.45, "left");
    // detection: the most suspicious guard
    const guards = figs.filter(f => f.guard && !f.dying);
    if (guards.length && G.phase === "play") {
      const sus = G.alert ? 1 : Math.min(1, Math.max(...guards.map(f => f.sus || 0))), x = VW / 2, y = pad + 4 * k, w = 160 * k;
      vctx.fillStyle = "rgba(200,210,225,0.12)"; vctx.fillRect(x - w / 2, y, w, 5 * k);
      vctx.fillStyle = sus >= 1 ? "rgba(255,60,50,0.95)" : sus > 0.5 ? "rgba(255,170,80,0.9)" : "rgba(200,215,235,0.7)"; vctx.fillRect(x - w / 2, y, w * sus, 5 * k);
      glowText(G.alert ? "ALERTED" : G.hidden ? "HIDDEN" : "EXPOSED", x, y + 18 * k, 11 * k, G.alert ? "255,110,90" : G.hidden ? "160,220,140" : "255,200,150", 0.75);
      for (const f of guards) if (!G.alert && f.sus > 0.3 && f.geom) {      // ? over anyone who has noticed something
        const [hx, hy, hr] = f.geom.head; glowText(f.sus > 0.75 ? "!" : "?", hx / SCALE * k, (hy - hr * 2.2) / SCALE * k, 16 * k, f.sus > 0.75 ? "255,120,80" : "255,220,150", 0.9);
      }
    } else if (G.hidden && G.phase === "play") glowText("HIDDEN", VW / 2, pad + 22 * k, 11 * k, "160,220,140", 0.6);
    recDot(t);
    // health and hunger, bottom left
    const bw = 180 * k;
    for (const [i, v, label, ok, bad] of [[0, G.hp, "HEALTH", "190,215,240", "255,60,50"], [1, G.food, "HUNGER", "210,200,120", "255,150,60"]]) {
      const y = VH - pad - 6 * k - i * 26 * k;
      vctx.fillStyle = "rgba(200,210,225,0.12)"; vctx.fillRect(pad, y, bw, 6 * k);
      vctx.fillStyle = `rgba(${v > 30 ? ok : bad},${v > 30 ? 0.8 : 0.6 + 0.4 * Math.sin(t * 8)})`; vctx.fillRect(pad, y, bw * v / 100, 6 * k);
      glowText(label, pad + bw + 10 * k, y + 3 * k, 10 * k, ink, 0.45, "left");
    }
    // quiver, bottom right: one stroke per arrow
    for (let i = 0; i < Math.max(G.quiver, 0); i++) {
      const x = VW - pad - (i % 12 + 1) * 8 * k, y = VH - pad - 26 * k - Math.floor(i / 12) * 32 * k;
      vctx.fillStyle = "rgba(220,235,255,0.8)"; vctx.fillRect(x, y, 2 * k, 24 * k);
      vctx.beginPath(); vctx.moveTo(x - 2 * k, y + 20 * k); vctx.lineTo(x + 1 * k, y + 26 * k); vctx.lineTo(x + 4 * k, y + 20 * k); vctx.fill();
    }
    glowText(`${G.quiver}`, VW - pad, VH - pad - 44 * k - Math.floor(Math.max(0, G.quiver - 1) / 12) * 32 * k, 12 * k, G.quiver ? ink : "255,120,90", 0.7, "right");
    for (const e of figs) {                         // arrows at the screen edge for anything hostile out of frame
      if (!(e.foe) || e.dying || e.st === "delay" || !e.geom || (e.guard && !G.alert)) continue;
      const [hx, hy] = e.geom.head, x = hx / SCALE * k, y = hy / SCALE * k, m = 30 * k;
      if (x > m && x < VW - m && y > m && y < VH - m && e.z > 0.8) continue;
      const ax2 = clamp(x, m, VW - m), ay2 = clamp(y, m, VH - m), a = Math.atan2(y - VH / 2, x - VW / 2), c = COL[e.kind].aura;
      vctx.save(); vctx.translate(ax2, ay2); vctx.rotate(a);
      vctx.fillStyle = `rgba(${c},${0.6 + 0.4 * Math.sin(t * 10)})`; vctx.shadowColor = `rgba(${c},1)`; vctx.shadowBlur = 10 * k;
      vctx.beginPath(); vctx.moveTo(12 * k, 0); vctx.lineTo(-8 * k, -9 * k); vctx.lineTo(-8 * k, 9 * k); vctx.closePath(); vctx.fill();
      vctx.restore();
    }
    if (G.bigT > 0) glowText(G.big, VW / 2, VH * 0.36, 26 * k, "255,214,170", Math.min(1, G.bigT) * 0.9);
    if (G.msgT > 0) glowText(G.msg, VW / 2, VH * 0.2, 20 * k, ink, Math.min(1, G.msgT) * 0.9);
    const stp = STOPS[G.stop];
    if (G.phase === "play" && G.fighting && stp && stp.hunt && foesLeft() === 0 && preyLeft() > 0) glowText("SPACE  MOVE ON", VW / 2, VH * 0.27, 13 * k, "200,220,120", 0.55 + 0.3 * Math.sin(t * 4));
    if (G.phase === "play" && stp && stp.scroll && SCROLL.here && foesLeft() === 0) glowText("CLICK THE SCROLL TO TAKE IT", VW / 2, VH * 0.27, 14 * k, "255,226,170", 0.6 + 0.4 * Math.sin(t * 5));
    if (G.phase === "play" && G.quiver === 0 && arrows.length === 0) glowText("QUIVER EMPTY — PICK ARROWS UP AS YOU WALK", VW / 2, VH * 0.32, 12 * k, "255,160,120", 0.7);
    if (G.phase === "play" && G.helpT > 0) glowText("HOLD CLICK DRAW  ·  RELEASE LOOSE  ·  RIGHT HOLD ZOOM  ·  ESC MENU", VW / 2, VH - pad - 3 * k, 12 * k, ink, Math.min(1, G.helpT) * 0.7);
  }

  const KEYS = [["Hold left", "Draw (about 1 s), release to loose"], ["Right hold", "Zoom for long shots"], ["Space", "Move on from a hunt · Esc menu"]];
  function showBrief() {
    const a = G.act;
    showPanel(`
      <p class="eyebrow">The Archer · Act ${a + 1} of 5</p>
      <h2>${["Into the woods", "The fort wall", "The town", "The palace", "Escape"][a]}</h2>
      <p class="lede">${[
        "Night woods. Your bow, a quiver, nothing to eat. Hunt to stay alive. Then get into the fort, through the town and the palace, take the king's scroll and get out alive.",
        "The edge of the woods and the fort wall. Archers walk the top, spearmen hold the gate. Get in unseen: shoot from cover, aim for heads.",
        "Night streets inside the walls. Patrols, archers on the walls, townsfolk out late. Never hit a townsperson.",
        "Courtyard, great hall, then the king's chamber. The palace guard wears mail: body shots need two arrows. Shields stop arrows; heads don't.",
        "The scroll is yours and every guard knows it. Back through the corridors, the town and the postern gate into the woods.",
      ][a]}</p>
      <ul class="legend">
        <li><i class="dot green"></i><span><b>Prey</b>: deer are food. They bolt if an arrow lands near.</span></li>
        <li><i class="dot orange"></i><span><b>Wolves, boar</b> charge. <b>Swords, spears</b> close in once alerted.</span></li>
        <li><i class="dot red"></i><span><b>Archers</b> shoot back once alerted, after a red glint.</span></li>
        <li><i class="dot blue"></i><span><b>Townsfolk</b>. Hitting one ends the run.</span></li>
      </ul>
      <p class="note">Arrows drop: a weak draw falls short, a full draw flies flat. Lead moving targets. Behind a bush or cart you are hidden. Head shots are silent; misses and body shots make noise.</p>
      <dl class="keys">${KEYS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      <div class="actions"><button id="p-go" class="primary">${a ? "Start act " + (a + 1) : "Start walking"}</button>${a ? "" : '<button id="p-acts">Choose act</button>'}</div>`,
      { "p-go": () => { hidePanel(); G.phase = "play"; G.actShown = G.act - 1; }, "p-acts": () => showActs() });
  }
  function showActs() {
    showPanel(`
      <p class="eyebrow">The Archer</p>
      <h2>Choose an act</h2>
      <div class="actions">${ACTS.map((A, i) => `<button id="p-a${i}" class="${i ? "" : "primary"}">${i + 1} · ${A.name}</button>`).join("")}</div>`,
      Object.fromEntries(ACTS.map((A, i) => [`p-a${i}`, () => { init(i); }])));
  }
  function showEnd() {
    const stats = `<dl class="stats"><dt>Time</dt><dd>${G.time.toFixed(1)} s</dd><dt>Arrows loosed</dt><dd>${G.shots}</dd><dt>Hits</dt><dd>${G.hits}</dd><dt>Kills</dt><dd>${G.kills}</dd><dt>Health</dt><dd>${Math.round(G.hp)}</dd></dl>`;
    if (G.phase === "win") showPanel(`
      <p class="eyebrow">The Archer · Complete</p>
      <h2 class="ok">Into the dark with the scroll</h2>
      <p class="lede">Out of the palace, out of the town, into the woods. Nobody behind you who can still follow.</p>
      ${stats}
      <div class="actions"><button id="p-again" class="primary">Play again</button><button id="p-menu">Menu</button></div>`, endActions());
    else showPanel(`
      <p class="eyebrow">The Archer · Act ${G.act + 1} failed</p>
      <h2 class="bad">${G.reason === "civilian" ? "You hit a bystander" : G.reason === "starved" ? "Starved" : "You fell"}</h2>
      <p class="lede">${G.reason === "civilian" ? "Blue means innocent. Wait for a clear line." : G.reason === "starved" ? "Hunger ran out and took your strength with it. Hunt the deer when you see them." : "Keep your distance: shoot the chargers early, and watch for the red glint."}</p>
      ${stats}
      <div class="actions"><button id="p-retry" class="primary">Retry act ${G.act + 1}</button><button id="p-again">Start over</button><button id="p-menu">Menu</button></div>`, endActions());
  }
  const endActions = () => ({
    "p-retry": () => { const a = G.act; init(a); hidePanel(); G.phase = "play"; },
    "p-again": () => { init(0); hidePanel(); G.phase = "play"; },
    "p-menu": () => { hidePanel(); const m = document.getElementById("menu"); if (m) m.hidden = false; init(0); },
  });

  return { name: "archery", init: () => init(0), resize, update, render, onDown, onUp, onKey,
    debug: () => ({ G, figs, arrows, stuck, foeArrows, S, STOPS, ACTS, SCROLL }), start: act => { init(act); hidePanel(); G.phase = "play"; } };
})();
