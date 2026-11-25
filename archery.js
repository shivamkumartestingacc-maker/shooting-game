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
  const GRAV = 7, VMIN = 13, VMAX = 66, NOCK = 0.55, MAXQ = 24;   // one click looses at FIRE_POWER, NOCK s between shots
  const WALK = 2.8, EYE = 1.62, CROUCH = 1.2, TELE = 1.0, END_D = 546;
  const PIXEL = { cell: 4, levels: 9, dots: 0.26, grain: 12, sat: 1.45, contrast: 1.3, lift: 6 };

  // ---------------------------------------------------------------- world layout
  const ZONES = [[-10, 165, "forest"], [165, 260, "town"], [260, 333, "meadow"], [333, 381, "court"], [381, 446, "hall"], [446, 506, "town"], [506, 640, "forest"]];
  const SCROLL = { here: true, screen: null };
  const SPECIALS = [
    // act 1: clearings where the animals show (no trees there) and hides
    { type: "clearing", wz: 14, x: 0, clear: [0, 30, 9] }, { type: "clearing", wz: 50, x: 0, clear: [0, 26, 7] },
    { type: "clearing", wz: 92, x: 0, clear: [0, 26, 6] }, { type: "clearing", wz: 130, x: 0, clear: [0, 30, 9] },
    { type: "bush", x: -1.7, wz: 15.5, s: 0.75, hide: true, clear: [2, 2, 1.5] },
    { type: "bush", x: 1.7, wz: 131.5, s: 0.75, hide: true, clear: [2, 2, 1.5] },
    // act 2: the town under the fort, its gate out to the fields
    { type: "cart", x: -1.5, wz: 180.6, hide: true, clear: [2, 2, 3] },
    { type: "stall", x: 3.4, wz: 189, clear: [2, 2, 1.5] }, { type: "stall", x: -3.4, wz: 195, clear: [2, 2, 1.5] },
    { type: "box", x0: 3.6, x1: 4.8, y1: 3.6, z0: 198, z1: 199.4, rgb: [70, 56, 44], clear: [2, 3, 2] },
    { type: "walkway", side: -1, wz: 219, len: 20, h: 4.5 },
    { type: "cart", x: 1.5, wz: 210.6, hide: true, clear: [2, 2, 3] },
    { type: "cart", x: -1.5, wz: 240.6, hide: true, clear: [2, 2, 3] },
    { type: "wall", wz: 260, h: 8, gate: [4.4, 5.6], towers: [-7, 7], rgb: [84, 80, 88], banners: [-3.4, 3.4], span: 70, clear: [4, 4, 80] },
    { type: "torch", x: -3.2, y: 4.2, wz: 259.85 }, { type: "torch", x: 3.2, y: 4.2, wz: 259.85 },
    // act 3: the fields and the fort wall, then the palace courtyard inside
    { type: "bush", x: -1.7, wz: 300.5, s: 0.8, hide: true, clear: [2, 2, 1.5] },
    { type: "cart", x: -1.5, wz: 310.6, hide: true, clear: [2, 2, 3] },
    { type: "wall", wz: 333, h: 9, gate: [4.4, 5.5], towers: [-7, 7, -26, 26], portcullis: true, banners: [-14, 14], clear: [5, 6, 80] },
    { type: "torch", x: -2.9, y: 3.6, wz: 332.85 }, { type: "torch", x: 2.9, y: 3.6, wz: 332.85 },
    // act 4: palace
    { type: "bush", x: -1.6, wz: 347.5, s: 0.75, hide: true },
    { type: "wall", wz: 381, h: 14, gate: [3.6, 5], towers: [-9, 9], rgb: [92, 86, 84], banners: [-5, 5], span: 10, thick: 1.5 },
    { type: "torch", x: -2.6, y: 3.6, wz: 380.85 }, { type: "torch", x: 2.6, y: 3.6, wz: 380.85 },
    { type: "pillar", x: -1.1, wz: 387.4, h: 2.2, rad: 0.5, hide: true, rgb: [150, 120, 90] },
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
    { at: 179, act: 1, name: "MARKET LANE", stealth: true },
    { at: 209, act: 1, name: "THE WALL WALK", stealth: true },
    { at: 239, act: 1, name: "TOWN GATE", stealth: true },
    { at: 299, act: 2, name: "THE TREE LINE", stealth: true },
    { at: 309, act: 2, name: "THE FORT GATE", stealth: true },
    { at: 346, act: 2, name: "THE COURTYARD", stealth: true },
    { at: 386, act: 3, name: "THE GREAT HALL", stealth: true },
    { at: 404, act: 3, name: "THE KING'S CHAMBER", stealth: true },
    { at: 409.5, act: 3, name: "THE SCROLL", scroll: true },
    { at: 428, act: 4, name: "ALARM" },
    { at: 456, act: 4, name: "THE BURNING TOWN" },
    { at: 484, act: 4, name: "THE POSTERN GATE" },
    { at: 522, act: 4, name: "INTO THE WOODS" },
  ];
  const ACTS = [
    { d: 0, name: "THE FOREST" },
    { d: 165, name: "THE TOWN" },
    { d: 263, name: "THE FORT" },
    { d: 378, name: "THE PALACE" },
    { d: 409.5, name: "ESCAPE" },
  ];
  let W, H, G, figs, arrows, stuck, foeArrows;

  // ---------------------------------------------------------------- setup
  function init(act = 0) {
    G = { phase: "brief", act, hp: 100, food: 100, quiver: Infinity, nock: 0, zk: 0, zoomHeld: false,
      shake: 0, dmg: 0, msg: "", msgT: 0, big: "", bigT: 0, time: 0, shots: 0, hits: 0, kills: 0, food0: 0, endT: 0, reason: "",
      stop: -1, speed: 0, clearT: 0, fighting: false, alert: false, alarm: act === 4, scroll: act === 4, skip: false, bob: 0, helpT: 9,
      sparks: [], dust: [], tracers: [], bodies: [], camH: EYE, release: 0, crackT: 0, reinf: false, losT: 0, ate: new Set(), actShown: act - 1 };
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
    switch (STOPS[i].name) {
      case "THE CLEARING":
        animal("deer", 2.6, D + 9, { yaw: 1.2 }); animal("deer", -3.4, D + 13, { yaw: -0.6, antlers: false }); animal("deer", 0.8, D + 18, { yaw: 2.6 });
        break;
      case "WOLVES":
        sfx.howl();
        animal("wolf", -13, D + 11, { delay: 0.6 }); animal("wolf", 12, D + 15, { delay: 2.2 }); animal("wolf", 1.5, D + 28, { delay: 3.6 }); animal("wolf", -7, D + 24, { delay: 6 });
        break;
      case "THE BOAR":
        animal("boar", 0.8, D + 18, { delay: 0.8 });
        animal("deer", -14, D + 14, { st: "flee", fleeTo: [16, D + 30], yaw: -1.6, speed: 7.5 });
        break;
      case "THE STREAM":
        animal("deer", -2.6, D + 10, { yaw: 0.8 }); animal("deer", 3.6, D + 14, { yaw: -1.9 }); animal("deer", -1.2, D + 20, { yaw: 2.2, antlers: false });
        animal("wolf", -15, D + 26, { delay: 9 }); animal("wolf", 15, D + 22, { delay: 10.5 });
        break;
      case "THE TREE LINE":
        guard("archer", -3, 333.9, { y0: 9, patrol: [[-3.6, 333.9], [3.6, 333.9]] });
        guard("archer", 12, 333.9, { y0: 9, patrol: [[10, 333.9], [21, 333.9]], pi: 1 });
        guard("spear", -1.6, 331.4, { yaw: 0.2 });
        break;
      case "THE FORT GATE":
        guard("spear", -1.8, 331.6, { yaw: 0.3 }); guard("spear", 1.8, 331.6, { yaw: -0.3 });
        guard("sword", -9, 330.4, { patrol: [[-10, 330.4], [-3, 329.8]] });
        guard("archer", -13, 333.9, { y0: 9, patrol: [[-20, 333.9], [-11, 333.9]] });
        break;
      case "MARKET LANE":
        folk(3.6, D + 9); folk(-3.8, D + 14); folk(3.2, D + 22, { yaw: Math.PI });
        guard("sword", -1.5, D + 30, { patrol: [[-1.5, D + 30], [-1.2, D + 12]] }); guard("sword", 1.4, D + 32, { patrol: [[1.4, D + 32], [1.6, D + 14]] });
        guard("archer", 4.2, 198.7, { y0: 3.6, yaw: -0.4 });
        break;
      case "THE WALL WALK":
        folk(3.5, D + 8, { yaw: Math.PI }); folk(-3.2, D + 20);
        guard("archer", -5.6, 227, { y0: 4.5, patrol: [[-5.6, 225], [-5.6, 236]] }); guard("archer", -5.6, 232, { y0: 4.5, yaw: 0.5 });
        guard("sword", 2, D + 24, { patrol: [[2, D + 24], [-2, D + 13]] });
        break;
      case "TOWN GATE":
        guard("shield", -1.9, 258.8, { yaw: 0.15 }); guard("shield", 1.9, 258.8, { yaw: -0.15 });
        guard("archer", -3.4, 260.9, { y0: 8, patrol: [[-4, 260.9], [-0.5, 260.9]] }); guard("archer", 3.4, 260.9, { y0: 8, yaw: -0.2 });
        break;
      case "THE COURTYARD":
        folk(-5.5, D + 12, { role: "folk", st: "stand" }); folk(5.2, D + 20, { st: "stand", yaw: -0.5 });
        guard("sword", -5, D + 14, { patrol: [[-5, D + 14], [5, D + 16]] }); guard("sword", 5, D + 24, { patrol: [[5, D + 24], [-5, D + 22]] });
        guard("shield", 0, 379.6, { hp: 2 }); guard("archer", 5.5, D + 30, { yaw: -0.4 });
        break;
      case "THE GREAT HALL":
        folk(3, D + 9, { st: "stand", yaw: -0.8 });
        guard("sword", -2.5, D + 9, { hp: 2, patrol: [[-2.5, D + 9], [-2.5, D + 14.5]] }); guard("shield", 2.5, D + 13, { hp: 2, patrol: [[2.5, D + 13], [2.5, D + 7]] });
        guard("archer", -3, 400.6, { hp: 2, yaw: 0.2 });
        break;
      case "THE KING'S CHAMBER":
        guard("shield", -0.6, 413.6, { hp: 2, yaw: Math.PI }); guard("sword", 2.6, 417.5, { hp: 2, patrol: [[2.6, 417.5], [2.6, 410.5]] });
        guard("archer", 3.2, 420.5, { hp: 2, yaw: -0.3 }); folk(-2.8, 420.5, { st: "stand", yaw: 0.6 });
        break;
      case "THE SCROLL": break;                              // the scroll: click it
      case "ALARM":
        guard("sword", -1, D + 9, { delay: 0.3 }); guard("sword", 1.4, D + 13, { delay: 1.2 }); guard("archer", 0.6, D + 16, { delay: 0.8 });
        break;
      case "THE BURNING TOWN":
        folk(3.6, D + 10, { st: "flee" }); folk(-3.5, D + 15, { st: "flee" });
        guard("archer", -4.2, 466.7, { y0: 3.4, delay: 0.5 }); guard("sword", 3.6, D + 12, { delay: 1 }); guard("sword", -3.4, D + 20, { delay: 2.4 });
        guard("archer", 2, D + 26, { delay: 3 }); guard("spear", 0, D + 30, { delay: 5 });
        break;
      case "THE POSTERN GATE":
        guard("spear", -1.6, 504.6, { delay: 0.5 }); guard("spear", 1.6, 504.6, { delay: 1.5 });
        guard("archer", -4, 506.8, { y0: 8, delay: 0.8 }); guard("archer", 5, 506.8, { y0: 8, delay: 2 });
        break;
      case "INTO THE WOODS":
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

  // aim point in view px: the mouse plus a small steady wobble (bigger when zoomed in)
  function aimPoint(t) {
    const amp = 0.4 * (1 + G.zk * 0.5) * (H / 500);
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
      if (G.hidden) rate *= 0.1;
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
  // crossbow: the bolt goes exactly where the crosshair points, instantly (a ray, no drop)
  function loosePlayer(t) {
    if (G.phase !== "play") return;
    G.shots++; G.nock = NOCK; G.release = 0.18; sfx.twang(1.3); setTimeout(() => sfx.reload(), NOCK * 900);
    const [ax, ay] = aimPoint(t), [sx, sy] = toStage(ax, ay);
    const d = norm3([(sx - cam.cx) / cam.f, (cam.hor - sy) / cam.f, 1]), o = [cam.offX, cam.camH, S.D];
    const bolt = { v: [d[0] * 80, d[1] * 80, d[2] * 80] };
    const hit = hitTest(figs.filter(f => !f.gone && f.z > 0.8), ax, ay);
    const tMax = hit ? hit.e.z / d[2] : 160;
    let end = null, prev = o, onGround = false;
    for (let tt = 0.5; tt <= tMax; tt += 0.4) {           // scenery in front of the target stops the bolt
      const p = [o[0] + d[0] * tt, o[1] + d[1] * tt, o[2] + d[2] * tt];
      if (p[1] <= 0.02) { end = [p[0], 0.02, p[2]]; onGround = true; break; }
      if (K.hitScene(prev, p)) { end = p; break; }
      prev = p;
    }
    const at = q => G.tracers.push({ to: q, age: 0 });
    if (!end && hit) {
      const f = hit.e, q = [o[0] + d[0] * tMax, o[1] + d[1] * tMax, o[2] + d[2] * tMax], g = f.geom;
      at(q);
      if (g.shield && !hit.head && sctx.isPointInPath(g.shield, ax, ay)) { stick(bolt, q, f, false); sfx.thunk(); spark(ax, ay); return; }
      stick(bolt, q, f, true); hitFig(f, hit.head, bolt); return;
    }
    if (!end) end = [o[0] + d[0] * tMax, o[1] + d[1] * tMax, o[2] + d[2] * tMax];
    at(end);
    if (end[2] - S.D < 150) { stick(bolt, end, null, onGround || end[1] < 2.6); noiseAt(end, 0.3); sfx.thunk(); dustAt(end); }
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
      }
    }
    stuck = stuck.filter(a => !a.taken);
    for (const b of G.bodies) {
      const q = b.quiver; if (!q || q.taken) continue;
      const z = q.wz - S.D;
      if (z < 1.3 && Math.abs(q.x - cam.offX) < 6 && q.y < 0.5) q.taken = true;
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
  function end(phase, reason) { if (G.phase !== "play") return; G.phase = phase; G.reason = reason; G.endT = 0; setTimeout(showEnd, 1300); }

  // ---------------------------------------------------------------- input
  function onDown(b) {
    if (b === 2) { G.zoomHeld = true; return; }
    if (b !== 0 || G.phase !== "play") return;
    const st = STOPS[G.stop];
    if (st && st.scroll && SCROLL.here && foesLeft() === 0) return takeScroll();   // at the pedestal any click takes it
    if (G.quiver <= 0) { sfx.empty(); say("QUIVER EMPTY", 1.2); return; }
    if (G.nock > 0) return;
    loosePlayer(performance.now() / 1000);       // one click, one arrow
  }
  function onUp(b) { if (b === 2) G.zoomHeld = false; }
  function onKey(code) {
    const st0 = STOPS[G.stop];
    if ((code === "KeyE" || code === "Space") && G.phase === "play" && st0 && st0.scroll && SCROLL.here && foesLeft() === 0) return takeScroll();
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
  }

  // ---------------------------------------------------------------- render
  function render(t) {
    sctx.globalAlpha = 1; sctx.globalCompositeOperation = "source-over";
    let left = figs.filter(f => !f.gone && f.z > 0.8), flushes = 0;
    // before an item at view depth z is drawn, draw the living things beyond it that it
    // could cover on screen (items carry a half-width `ext` in metres; none = could cover anything)
    const flush = (z, it) => {
      if (z < 0) { drawFigures(left, t, { outline: 0.75 }); left = []; return; }
      if (!left.length || (it && it.ext === 0) || flushes >= 4) return;   // ponytail: past 4 layers the rest share the last one
      let x0 = -1e9, x1 = 1e9;
      if (it && it.ext != null && it.x != null && z > 0.5) { const [sx, , k] = project(it.x, 0, z); x0 = sx - it.ext * k - 4; x1 = sx + it.ext * k + 4; }
      const batch = left.filter(f => f.z > z && (!f.geom || (f.geom.box[2] > x0 && f.geom.box[0] < x1)));
      if (!batch.length) return;
      left = left.filter(f => !batch.includes(f)); flushes++;
      drawFigures(batch, t, { embers: false, outline: 0.75 });
    };
    const extra = [];
    for (const a of stuck) { const wz = a.fig ? a.fig.z + S.D + a.off[2] - 0.05 : a.p[2]; extra.push({ wz, x: a.fig ? a.fig.x + a.off[0] : a.p[0], ext: 0.5, fn: () => drawStuck(a, t) }); }
    for (const a of arrows) extra.push({ wz: a.p[2], x: a.p[0], ext: 0.8, fn: () => drawFlying(a, [40, 30, 22], [230, 225, 210]) });
    for (const a of foeArrows) extra.push({ wz: a.p[2], x: a.p[0], ext: 0.8, fn: () => drawFlying(a, [30, 10, 8], [255, 130, 110]) });
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
    for (const tr of G.tracers) {
      tr.age += 1 / 60; const z = tr.to[2] - S.D; if (z < 0.6) continue;
      const [x, y] = project(tr.to[0], tr.to[1], z), a = Math.max(0, 1 - tr.age / 0.18);
      g.strokeStyle = `rgba(255,240,210,${0.55 * a})`; g.lineWidth = 2.5 * (H / 500); g.beginPath(); g.moveTo(W * 0.58, H * 0.8); g.lineTo(x, y); g.stroke();
      g.fillStyle = `rgba(255,250,230,${a})`; g.fillRect(x - 2, y - 2, 4, 4);
    }
    G.tracers = G.tracers.filter(tr => tr.age < 0.2);
    for (const e of figs) if ((e.foe || e.guard) && !e.dying && e.ping > 0 && e.geom) {   // ring pulses out when something shows up
      const [x, y] = e.geom.chest, u = 1 - e.ping, r = (0.5 + u * 1.6) * e.geom.kb, c = COL[e.kind].aura;
      g.strokeStyle = `rgba(${c},${e.ping * 0.8})`; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
    }
    g.globalCompositeOperation = "source-over";
    for (const p of G.dust) { g.fillStyle = `rgba(150,140,120,${0.6 * (1 - p.age / p.life)})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
    if (G.crackT > 0) G.crackT -= 1 / 60;
  }

  // your crossbow, low and centre, stock pointing at the crosshair; the string snaps forward on each shot
  function bow(t) {
    if (G.phase === "brief") return;
    const g = sctx, k = H / 500, rel = G.release / 0.18, sway = G.speed > 0.3 ? Math.sin(G.bob * 2) * 4 * k : 0;
    const [ax, ay] = aimPoint(t), B = [W * 0.58 + rel * 4 * k, H * 1.12 + sway + rel * 12 * k];
    let ux = ax - B[0], uy = ay - B[1]; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
    const nx = -uy, ny = ux, L = Math.min(210 * k, ul * 0.55), P = (s, n = 0) => [B[0] + ux * s * L + nx * n, B[1] + uy * s * L + ny * n];
    const F = P(0.78), span = 110 * k, bend = 22 * k;
    const tipA = [F[0] + nx * span - ux * bend, F[1] + ny * span - uy * bend], tipB = [F[0] - nx * span - ux * bend, F[1] - ny * span - uy * bend];
    const loaded = G.nock <= 0 && G.quiver > 0, N = P(loaded ? 0.5 : 0.7);
    g.save(); g.lineCap = "round"; g.lineJoin = "round";
    g.strokeStyle = "#1a120a"; g.lineWidth = 34 * k; g.beginPath(); g.moveTo(...P(-0.1)); g.lineTo(...P(0.82)); g.stroke();        // stock
    g.strokeStyle = "rgba(190,140,90,0.35)"; g.lineWidth = 4 * k; g.beginPath(); g.moveTo(...P(-0.1, -15 * k)); g.lineTo(...P(0.8, -15 * k)); g.stroke();
    g.strokeStyle = "#0c0906"; g.lineWidth = 12 * k; g.beginPath(); g.moveTo(...tipA); g.quadraticCurveTo(F[0] + ux * 12 * k, F[1] + uy * 12 * k, ...tipB); g.stroke();   // prod
    g.strokeStyle = "rgba(220,210,190,0.7)"; g.lineWidth = 2 * k; g.beginPath(); g.moveTo(...tipA); g.lineTo(...N); g.lineTo(...tipB); g.stroke();                     // string
    if (loaded) {                                  // bolt in the groove
      const T = P(0.98);
      g.strokeStyle = "#2a1c10"; g.lineWidth = 6 * k; g.beginPath(); g.moveTo(...N); g.lineTo(...T); g.stroke();
      g.fillStyle = "#cfc6b0"; g.beginPath(); g.moveTo(T[0] + ux * 16 * k, T[1] + uy * 16 * k); g.lineTo(T[0] + nx * 7 * k, T[1] + ny * 7 * k); g.lineTo(T[0] - nx * 7 * k, T[1] - ny * 7 * k); g.fill();
    }
    g.fillStyle = "#0b0907"; for (const [s2, n] of [[0.12, 22 * k], [0.62, -26 * k]]) { const [hx, hy] = P(s2, n); g.beginPath(); g.ellipse(hx, hy, 34 * k, 26 * k, Math.atan2(uy, ux), 0, 7); g.fill(); }   // hands
    g.restore();
  }


  // ---------------------------------------------------------------- HUD + panels
  // ---------------------------------------------------------------- HUD: pixel font, framed plates, pixel icons
  const FONT = '"Silkscreen", ui-monospace, Menlo, monospace', GOLD = "#f0d48a", INK = "#f4ecd8";
  const ICON = {
    heart: [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."],
    meat:  ["...XXX.", "..XXXXX", "..XXXXX", "...XXX.", "..X....", ".XX....", "XX....."],
    eye:   ["..XXXXX..", ".XX...XX.", "XX..X..XX", "XX.XXX.XX", ".XX...XX.", "..XXXXX.."],
    arrow: ["..X..", ".XXX.", "X.X.X", "..X..", "..X..", "..X..", "..X..", ".X.X.", "X...X"],
    deer:  ["X...X", ".X.X.", "..XXX", "..XX.", ".XXXX", "XXXX.", "X..X."],
    skull: [".XXX.", "XXXXX", "X.X.X", "XXXXX", ".X.X."],
  };
  function icon(name, x, y, px, col) {
    const b = ICON[name];
    vctx.fillStyle = "rgba(0,0,0,0.9)";
    for (let r = 0; r < b.length; r++) for (let c = 0; c < b[r].length; c++) if (b[r][c] === "X") vctx.fillRect(x + c * px + px * 0.6, y + r * px + px * 0.6, px, px);
    vctx.fillStyle = col;
    for (let r = 0; r < b.length; r++) for (let c = 0; c < b[r].length; c++) if (b[r][c] === "X") vctx.fillRect(x + c * px, y + r * px, px, px);
  }
  function txt(s, x, y, size, col = INK, align = "left", a = 1) {
    vctx.font = `700 ${Math.round(size)}px ${FONT}`; vctx.textAlign = align; vctx.textBaseline = "middle"; vctx.globalAlpha = a;
    const o = Math.max(1, Math.round(size * 0.09));
    vctx.fillStyle = "rgba(0,0,0,0.9)"; vctx.fillText(s, x + o, y + o);
    vctx.fillStyle = col; vctx.fillText(s, x, y); vctx.globalAlpha = 1;
    return vctx.measureText(s).width;
  }
  // dark plate with a two-tone pixel frame and notched corners
  function plate(x, y, w, h, k, edge = GOLD, a = 0.8) {
    const b = Math.max(2, Math.round(2 * k));
    vctx.fillStyle = `rgba(14,11,9,${a})`; vctx.fillRect(x + b, y + b, w - 2 * b, h - 2 * b);
    vctx.fillStyle = "rgba(0,0,0,0.9)"; vctx.fillRect(x + b, y, w - 2 * b, b * 2); vctx.fillRect(x + b, y + h - b * 2, w - 2 * b, b * 2); vctx.fillRect(x, y + b, b * 2, h - 2 * b); vctx.fillRect(x + w - b * 2, y + b, b * 2, h - 2 * b);
    vctx.fillStyle = edge; vctx.fillRect(x + b, y, w - 2 * b, b); vctx.fillRect(x + b, y + h - b, w - 2 * b, b); vctx.fillRect(x, y + b, b, h - 2 * b); vctx.fillRect(x + w - b, y + b, b, h - 2 * b);
  }
  function bar(x, y, w, h, v, segs, col, k, warn) {
    const g = Math.max(1, Math.round(k)), sw = (w - g * (segs - 1)) / segs;
    for (let i = 0; i < segs; i++) {
      const f = clamp(v * segs - i, 0, 1), sx = x + i * (sw + g);
      vctx.fillStyle = "rgba(255,255,255,0.1)"; vctx.fillRect(sx, y, sw, h);
      if (f > 0) { vctx.fillStyle = warn ? "#ff4a3a" : col; vctx.fillRect(sx, y, sw * f, h); vctx.fillStyle = "rgba(255,255,255,0.35)"; vctx.fillRect(sx, y, sw * f, Math.max(1, h * 0.25)); }
    }
  }
  function hud(t) {
    const k = hudK(), pad = 22 * k, VW = E.VW, VH = E.VH, play = G.phase === "play";
    const [ax, ay] = aimPoint(t), cxv = ax / SCALE * k, cyv = ay / SCALE * k;
    if (play) {                                    // crosshair: four ticks and a dot
      const c = INK, r = 9 * k, L = 6 * k;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { vctx.fillStyle = "#000"; vctx.fillRect(cxv + dx * r - 2 * k + (dy ? 0 : dx * L / 2), cyv + dy * r - 2 * k + (dx ? 0 : dy * L / 2), dy ? 4 * k : L + 2 * k, dx ? 4 * k : L + 2 * k); }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { vctx.fillStyle = c; vctx.fillRect(cxv + dx * r - k + (dy ? 0 : dx * L / 2), cyv + dy * r - k + (dx ? 0 : dy * L / 2), dy ? 2 * k : L, dx ? 2 * k : L); }
      vctx.fillStyle = "#000"; vctx.fillRect(cxv - 2 * k, cyv - 2 * k, 4 * k, 4 * k); vctx.fillStyle = c; vctx.fillRect(cxv - k, cyv - k, 2 * k, 2 * k);
    }
    // top left: act badge, act name, stop
    const st = STOPS[G.stop], act = ACTS[G.act];
    plate(pad, pad, 300 * k, 56 * k, k);
    vctx.fillStyle = "#c2412c"; vctx.fillRect(pad + 10 * k, pad + 10 * k, 36 * k, 36 * k); vctx.fillStyle = "rgba(255,255,255,0.25)"; vctx.fillRect(pad + 10 * k, pad + 10 * k, 36 * k, 4 * k);
    txt(`${G.act + 1}`, pad + 28 * k, pad + 29 * k, 24 * k, INK, "center");
    txt(act.name, pad + 56 * k, pad + 20 * k, 17 * k, GOLD);
    txt(st && G.fighting ? st.name : G.phase === "play" && G.speed > 0.5 ? "on the move" : "the archer", pad + 56 * k, pad + 40 * k, 12 * k, INK, "left", 0.8);
    let px = pad;
    const pill = (label, n, col, ic) => { const w = 78 * k; plate(px, pad + 62 * k, w, 26 * k, k, col, 0.7); icon(ic, px + 8 * k, pad + 68 * k, 2 * k, col); txt(`${n}`, px + 30 * k, pad + 75 * k, 14 * k, INK); txt(label, px + 46 * k, pad + 75 * k, 9 * k, INK, "left", 0.6); px += w + 6 * k; };
    if (G.fighting && foesLeft()) pill("FOE", foesLeft(), "#ff7a2a", "skull");
    if (G.fighting && preyLeft()) pill("PREY", preyLeft(), "#b8d040", "deer");
    // top right: the journey, five acts on one line, you on it
    const jw = 260 * k, jx = VW - pad - jw, jy = pad + 28 * k;
    plate(jx - 12 * k, pad, jw + 24 * k, 56 * k, k);
    vctx.fillStyle = "rgba(255,255,255,0.18)"; vctx.fillRect(jx, jy - 2 * k, jw, 4 * k);
    vctx.fillStyle = GOLD; vctx.fillRect(jx, jy - 2 * k, jw * clamp(S.D / END_D, 0, 1), 4 * k);
    ACTS.forEach((A, i) => { const x = jx + jw * clamp(A.d / END_D, 0, 1) + (i === 4 ? 0 : 0); vctx.fillStyle = "#000"; vctx.fillRect(x - 4 * k, jy - 6 * k, 8 * k, 12 * k); vctx.fillStyle = i <= G.act ? GOLD : "#6a6050"; vctx.fillRect(x - 3 * k, jy - 5 * k, 6 * k, 10 * k); txt(`${i + 1}`, x, jy + 16 * k, 10 * k, i === G.act ? GOLD : INK, "center", i === G.act ? 1 : 0.5); });
    const mx = jx + jw * clamp(S.D / END_D, 0, 1); icon("arrow", mx - 5 * k, jy - 24 * k + Math.sin(t * 5) * k, 2 * k, G.scroll ? "#ff6a50" : INK);
    txt(G.scroll ? "SCROLL ✦" : "", jx, pad + 12 * k, 10 * k, "#ff9a70", "left");
    // detection, top centre: eye, ten pips, state
    const guards = figs.filter(f => f.guard && !f.dying);
    if (guards.length && play) {
      const sus = G.alert ? 1 : Math.min(1, Math.max(...guards.map(f => f.sus || 0))), w = 190 * k, x = VW / 2 - w / 2, y = pad;
      const col = G.alert ? "#ff4a3a" : sus > 0.5 ? "#ffab3a" : G.hidden ? "#8fd86a" : INK;
      plate(x, y, w, 44 * k, k, col);
      icon("eye", x + 10 * k, y + 9 * k, 2.4 * k, col);
      bar(x + 42 * k, y + 10 * k, w - 54 * k, 9 * k, sus, 10, col, k);
      txt(G.alert ? "ALERTED" : G.hidden ? "HIDDEN" : "EXPOSED", x + 42 * k, y + 31 * k, 11 * k, col, "left", 0.95);
      for (const f of guards) if (!G.alert && f.sus > 0.3 && f.geom) {      // ? or ! over anyone who has noticed something
        const [hx, hy, hr] = f.geom.head, bx = hx / SCALE * k, by = (hy - hr * 2.6) / SCALE * k, hot = f.sus > 0.75;
        plate(bx - 10 * k, by - 12 * k, 20 * k, 22 * k, k, hot ? "#ff6a40" : GOLD, 0.85); txt(hot ? "!" : "?", bx, by, 15 * k, hot ? "#ff6a40" : GOLD, "center");
      }
    } else if (G.hidden && play) { plate(VW / 2 - 50 * k, pad, 100 * k, 28 * k, k, "#8fd86a", 0.7); txt("HIDDEN", VW / 2, pad + 14 * k, 12 * k, "#8fd86a", "center"); }
    // bottom left: heart + health, drumstick + hunger
    const bw = 210 * k, by0 = VH - pad - 70 * k;
    plate(pad, by0, bw + 56 * k, 70 * k, k);
    icon("heart", pad + 12 * k, by0 + 12 * k, 2.6 * k, G.hp > 30 ? "#ff5a6a" : `rgba(255,70,60,${0.5 + 0.5 * Math.sin(t * 9)})`);
    bar(pad + 40 * k, by0 + 14 * k, bw, 12 * k, G.hp / 100, 10, "#ff5a6a", k, G.hp <= 30);
    icon("meat", pad + 12 * k, by0 + 40 * k, 2.6 * k, G.food > 30 ? "#e8a050" : `rgba(255,150,60,${0.5 + 0.5 * Math.sin(t * 9)})`);
    bar(pad + 40 * k, by0 + 44 * k, bw, 12 * k, G.food / 100, 10, "#e8b050", k, G.food <= 20);
    // bottom right: quiver
    const qx = VW - pad - 150 * k, qy = VH - pad - 70 * k;
    plate(qx, qy, 150 * k, 70 * k, k, G.quiver ? GOLD : "#ff6a50");
    icon("arrow", qx + 14 * k, qy + 12 * k, 5 * k, G.quiver ? INK : "#ff6a50");
    txt("×∞", qx + 48 * k, qy + 37 * k, 26 * k, G.quiver ? INK : "#ff6a50");
    for (const e of figs) {                         // arrows at the screen edge for anything hostile out of frame
      if (!(e.foe) || e.dying || e.st === "delay" || !e.geom || (e.guard && !G.alert)) continue;
      const [hx, hy] = e.geom.head, x = hx / SCALE * k, y = hy / SCALE * k, m = 30 * k;
      if (x > m && x < VW - m && y > m && y < VH - m && e.z > 0.8) continue;
      const ax2 = clamp(x, m * 3, VW - m * 3), ay2 = clamp(y, m * 4, VH - m * 4), a = Math.atan2(y - VH / 2, x - VW / 2), c = COL[e.kind].aura;
      vctx.save(); vctx.translate(ax2, ay2); vctx.rotate(a);
      vctx.fillStyle = "#000"; vctx.beginPath(); vctx.moveTo(16 * k, 0); vctx.lineTo(-10 * k, -12 * k); vctx.lineTo(-10 * k, 12 * k); vctx.closePath(); vctx.fill();
      vctx.fillStyle = `rgba(${c},${0.7 + 0.3 * Math.sin(t * 10)})`; vctx.beginPath(); vctx.moveTo(12 * k, 0); vctx.lineTo(-7 * k, -8 * k); vctx.lineTo(-7 * k, 8 * k); vctx.closePath(); vctx.fill();
      vctx.restore();
    }
    // act banner and messages
    if (G.bigT > 0) {
      const a = Math.min(1, G.bigT), y = VH * 0.36, w = Math.min(VW - 2 * pad, 560 * k);
      vctx.globalAlpha = a; plate(VW / 2 - w / 2, y - 34 * k, w, 68 * k, k, GOLD, 0.85);
      vctx.fillStyle = "#c2412c"; vctx.fillRect(VW / 2 - w / 2 - 14 * k, y - 22 * k, 16 * k, 44 * k); vctx.fillRect(VW / 2 + w / 2 - 2 * k, y - 22 * k, 16 * k, 44 * k);
      vctx.globalAlpha = 1; txt(G.big, VW / 2, y, 30 * k, GOLD, "center", a);
    }
    if (G.msgT > 0) txt(G.msg, VW / 2, VH * 0.2, 22 * k, INK, "center", Math.min(1, G.msgT));
    const stp = STOPS[G.stop], hint = (s, col) => { const w = txt(s, -999, -999, 14 * k) + 30 * k; plate(VW / 2 - w / 2, VH * 0.27 - 16 * k, w, 32 * k, k, col, 0.75); txt(s, VW / 2, VH * 0.27, 14 * k, col, "center", 0.7 + 0.3 * Math.sin(t * 5)); };
    if (play && G.fighting && stp && stp.hunt && foesLeft() === 0 && preyLeft() > 0) hint("SPACE  ·  MOVE ON", "#b8d040");
    if (play && stp && stp.scroll && SCROLL.here && foesLeft() === 0) hint("CLICK OR PRESS E  ·  TAKE THE SCROLL", GOLD);
    if (play && G.quiver === 0 && arrows.length === 0) txt("QUIVER EMPTY — PICK ARROWS UP AS YOU WALK", VW / 2, VH * 0.33, 13 * k, "#ff9a70", "center");
    if (play && G.helpT > 0) {                    // key caps
      const a = Math.min(1, G.helpT), keys = [["LMB", "fire"], ["RMB", "zoom"], ["ESC", "menu"]];
      vctx.font = `700 ${Math.round(12 * k)}px ${FONT}`;
      const ws = keys.map(([c, l]) => vctx.measureText(c).width + vctx.measureText(l).width + 34 * k), tot = ws.reduce((s, w) => s + w, 0) + 16 * k * (keys.length - 1);
      let x = VW / 2 - tot / 2; const y = VH - pad - 16 * k;
      vctx.globalAlpha = a;
      keys.forEach(([c, l], i) => { const cw = vctx.measureText(c).width + 14 * k; plate(x, y - 13 * k, cw, 26 * k, k, INK, 0.85); vctx.globalAlpha = 1; txt(c, x + cw / 2, y, 12 * k, INK, "center", a); txt(l, x + cw + 8 * k, y, 12 * k, INK, "left", 0.8 * a); vctx.globalAlpha = a; x += ws[i] + 16 * k; });
      vctx.globalAlpha = 1;
    }
  }

  const KEYS = [["Left click", "Fire the crossbow. It hits what the crosshair is on"], ["Right hold", "Zoom for long shots"], ["Space", "Move on from a hunt · Esc menu"]];
  function showBrief() {
    const a = G.act;
    showPanel(`
      <p class="eyebrow">The Archer · Act ${a + 1} of 5</p>
      <h2>${["Into the woods", "The town", "The fort wall", "The palace", "Escape"][a]}</h2>
      <p class="lede">${[
        "Night woods. Your crossbow and endless bolts, nothing to eat. Hunt to stay alive. Then through the town, over the fort wall and into the palace: take the king's scroll and get out alive.",
        "The town under the fort, out late. Patrols in the lanes, archers on the walls, townsfolk everywhere. Never hit a townsperson.",
        "Fields under the fort wall. Archers walk the top, spearmen hold the gate. Get in unseen from cover, then cross the palace courtyard.",
        "The great hall, then the king's chamber. Palace guards wear mail: body shots need two bolts. Shields stop bolts; heads don't. Take the scroll.",
        "The scroll is yours and every guard knows it. Out through the corridors, the back streets and the postern gate into the woods.",
      ][a]}</p>
      <ul class="legend">
        <li><i class="dot green"></i><span><b>Prey</b>: deer are food. They bolt if an arrow lands near.</span></li>
        <li><i class="dot orange"></i><span><b>Wolves, boar</b> charge. <b>Swords, spears</b> close in once alerted.</span></li>
        <li><i class="dot red"></i><span><b>Archers</b> shoot back once alerted, after a red glint.</span></li>
        <li><i class="dot blue"></i><span><b>Townsfolk</b>. Hitting one ends the run.</span></li>
      </ul>
      <p class="note">Crossbow bolts fly dead straight: whatever is under the crosshair is what you hit. Behind a bush or cart you are hidden. Head shots are silent; misses and body shots make noise.</p>
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
