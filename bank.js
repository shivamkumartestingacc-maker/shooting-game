"use strict";
// =====================================================================
// Level 1: City Trust Bank. You are a sniper in a dark window across
// the street. Six armed men hold seven hostages inside. The first shot
// is free: after it everyone reacts. Gunmen (red) come to the windows
// and fire at you; knife men (orange) stand over the hostages.
// Hitting any civilian (blue) fails the mission.
// =====================================================================
const BankLevel = (() => {
  const SS = 3;                                 // static layers drawn at 3x so the scope stays sharp
  const FZ = 30;                                // facade plane (m from camera)
  const MAG = 5, BOLT = 0.55, ZMIN = 3, ZMAX = 8;
  const DMG = 15, TELE = 1.2;
  const REF_Z = 34;                             // typical target distance, for sway/spread in metres

  // openings in the facade (world metres); figures only show through these
  const GROUND = [[-11.3, -4.7], [-3.5, 3.5], [4.7, 11.3]].map(([x0, x1]) => ({ x0, x1, y0: 0.35, y1: 3.9, z: FZ }));
  const UPPER = [-9.6, -6.6, -1.6, 1.6, 6.6, 9.6].map(c => ({ x0: c - 1.05, x1: c + 1.05, y0: 5.3, y1: 7.7, z: FZ }));
  const NEIGHBOR = { x0: 16.2, x1: 18.2, y0: 5.2, y1: 7.3, z: FZ + 0.4 };
  const OPENINGS = [...GROUND, ...UPPER, NEIGHBOR];
  const COLUMNS = [-11.9, -4.1, 4.1, 11.9];

  let W, H, bgHi, maskView, mvctx, fgHi, fgx, openRects;
  let figs, hostages, thugs, G;

  // ------------------------------------------------------------------ setup
  function init() {
    G = {
      phase: "brief", alert: false, hp: 100, ammo: MAG, bolt: 0, scopeHeld: false, scopeToggle: false,
      zk: 0, zoom: 4.5, breath: 1, winded: 0, swayAmp: 0.16, recoil: 0, shake: 0, dmg: 0, unscopeT: 0,
      msg: "", msgT: 0, shots: 0, time: 0, endT: 0, reason: "", puffs: [], ownCracks: [], muzzle: 0, helpT: 9,
    };
    const H_POS = [[-9.2, 33.2, 0.3], [-6.4, 35.4, 2.9], [-2.6, 33.0, -0.2], [0.6, 35.2, 3.3], [3.2, 33.4, 0.4], [6.6, 34.2, -2.8], [9.0, 36.0, 0.1]];
    hostages = H_POS.map(([x, z, yaw]) => makeFigure({ kind: "blue", x, z, yaw, homeYaw: yaw, pose: "head", kneel: 1, role: "hostage" }));
    const T = (kind, weapon, path, o = {}) => makeFigure(Object.assign({
      kind, weapon, path, wp: 0, pauseT: Math.random() * 2, state: "calm", role: "thug", speed: 0.9,
      pose: weapon === "rifle" ? "rifle" : "knife", x: path[0][0], z: path[0][1],
    }, o));
    thugs = [
      T("red", "rifle", [[-9, 37], [-2, 37.5]]),
      T("red", "rifle", [[2, 31.7], [9.5, 32.1]]),
      T("red", "rifle", [[-9.6, 33], [-1.6, 33], [1.6, 33.2], [9.6, 33]], { y0: 4.4 }),
      T("orange", "knife", [[-4, 34.3], [4.5, 35.6]]),
      T("orange", "knife", [[8.0, 35.0]], { homeYaw: Math.PI * 0.6, yaw: Math.PI * 0.6 }),
      T("orange", "knife", [[-0.4, 31.2]], { homeYaw: 0 }),
    ];
    const watcher = makeFigure({ kind: "blue", x: 17.2, z: 31.6, y0: 4.4, yaw: 0.25, homeYaw: 0.25, role: "watcher" });
    figs = [...hostages, ...thugs, watcher];
    showBrief();
  }

  function resize() {
    W = E.W; H = E.H;
    cam.f = H * 1.6; cam.hor = H * 0.2; cam.cx = W / 2; cam.camH = 9;
    bgHi = mk(W * SS, H * SS); fgHi = mk(W * SS, H * SS); fgx = fgHi.getContext("2d");
    maskView = mk(W, H); mvctx = maskView.getContext("2d");
    openRects = OPENINGS.map(o => { const [x0, y0] = stage(o.x0, o.y1, o.z), [x1, y1] = stage(o.x1, o.y0, o.z); return [x0, y0, x1, y1]; });
    drawBank(); drawFg();
  }
  const isOpen = (sx, sy) => openRects.some(([x0, y0, x1, y1]) => sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1);

  // ------------------------------------------------------------------ static art (all faint, outlined)
  function drawBank() {
    const b = bgHi.getContext("2d"), r = mulberry(5);
    b.setTransform(SS, 0, 0, SS, 0, 0);
    const P = stage;
    const box = (x0, x1, y0, y1, z, fill) => { const [a, c] = P(x0, y1, z), [d, e] = P(x1, y0, z); b.fillStyle = fill; b.fillRect(a, c, d - a, e - c); };
    const quad = (pts, fill) => { b.beginPath(); b.moveTo(...pts[0]); for (const p of pts.slice(1)) b.lineTo(...p); b.closePath(); b.fillStyle = fill; b.fill(); };
    const seg = (p, q, style, w) => { b.strokeStyle = style; b.lineWidth = w; b.beginPath(); b.moveTo(...p); b.lineTo(...q); b.stroke(); };
    const floor = (x0, x1, z0, z1, y, fill) => quad([P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)], fill);

    // sky with city glow low down
    const sky = b.createLinearGradient(0, 0, 0, cam.hor + H * 0.15);
    sky.addColorStop(0, "#07090c"); sky.addColorStop(1, "#1a2028");
    b.fillStyle = sky; b.fillRect(0, 0, W, H);
    // far skyline, a few dim grey windows
    for (let i = 0; i < 34; i++) {
      const z = 70 + r() * 45, x = -75 + i * 4.6 + r() * 2, w = 3 + r() * 5, h = 16 + r() * 34;
      box(x, x + w, 0, h, z, `rgb(${11 + r() * 5 | 0},${14 + r() * 5 | 0},${19 + r() * 6 | 0})`);
      for (let wy = 3; wy < h - 1; wy += 1.6) for (let wx = x + 0.6; wx < x + w - 0.6; wx += 1.1)
        if (r() < 0.07) box(wx, wx + 0.5, wy, wy + 0.7, z, `rgba(150,160,175,${0.06 + r() * 0.1})`);
    }

    // ---- interior, ground floor (seen only through the glass)
    box(-13, 13, 0, 4.2, 40, "#1b212a");
    seg(P(-13, 1.0, 40), P(13, 1.0, 40), "rgba(120,135,150,0.08)", 0.6);
    const fl = b.createLinearGradient(0, P(0, 0, 40)[1], 0, P(0, 0, 30)[1]);
    fl.addColorStop(0, "#1f2630"); fl.addColorStop(1, "#151a21");
    floor(-13, 13, 30, 40, 0, fl);
    for (let z = 31; z <= 40; z += 1) seg(P(-13, 0, z), P(13, 0, z), "rgba(130,145,160,0.06)", 0.5);
    for (let x = -13; x <= 13; x += 1.3) seg(P(x, 0, 30), P(x, 0, 40), "rgba(130,145,160,0.06)", 0.5);
    // work light on the back wall
    const [lx, ly] = P(-1, 3.2, 40), lg = b.createRadialGradient(lx, ly, 0, lx, ly, cam.f * 0.12);
    lg.addColorStop(0, "rgba(170,180,195,0.14)"); lg.addColorStop(1, "rgba(170,180,195,0)");
    b.fillStyle = lg; b.fillRect(0, 0, W, H);
    for (const x of [-6.5, 6.5]) box(x - 0.3, x + 0.3, 0, 4.2, 37.5, "#151a20");
    // teller counter with glass partitions
    floor(-9, 9, 38.4, 39.0, 1.1, "#1c222b");
    box(-9, 9, 0, 1.1, 38.4, "#10141a");
    seg(P(-9, 1.1, 38.4), P(9, 1.1, 38.4), "rgba(150,165,185,0.18)", 0.6);
    for (let x = -9; x <= 9; x += 2.25) seg(P(x, 1.1, 38.6), P(x, 2.4, 38.6), "rgba(140,150,165,0.16)", 0.5);
    box(-9, 9, 1.1, 2.4, 38.6, "rgba(150,165,185,0.035)");

    // ---- interior, upper floor offices
    box(-13, 13, 4.4, 8.4, 37, "#1a1f27");
    floor(-13, 13, 30, 37, 4.4, "#171c23");
    for (const x of [-10, -5.5, -1.2, 2.4, 6.2, 9.8]) {
      floor(x, x + 1.8, 34.5, 35.4, 5.15, "#1d232c"); box(x, x + 1.8, 4.4, 5.15, 34.5, "#12161c");
      box(x + 0.6, x + 1.2, 5.15, 5.6, 34.9, "#0d1014");                     // monitor
    }
    for (let x = -12; x < 12; x += 2.6) box(x, x + 0.9, 4.4, 5.9, 36.8, "#14181e");   // cabinets
    // neighbour flat (behind the right-hand window)
    box(NEIGHBOR.x0 - 1, NEIGHBOR.x1 + 1, 4.4, 7.8, 34, "#141820");

    // ---- neighbouring buildings
    box(-28, -13.5, 0, 15.5, 30.6, "#11151b");
    box(13.5, 28, 0, 12.6, 30.6, "#12161c");
    for (let y = 1.2; y < 14.5; y += 2.6) for (let x = -26.5; x < -14.5; x += 2.4) {
      box(x, x + 1.3, y, y + 1.6, 30.55, r() < 0.15 ? "rgba(140,150,165,0.12)" : "#0b0e12");
    }
    for (let y = 5.2; y < 11.5; y += 2.6) for (let x = 14.2; x < 27; x += 2.6) {
      if (y === 5.2 && x > 15.5 && x < 18.5) continue;                        // the watcher's window stays open
      box(x, x + 1.6, y, y + 1.6, 30.55, "#0b0e12");
    }
    box(14.5, 22, 0.2, 3.6, 30.55, "#0f1318");                                 // shop shutter
    for (let y = 0.4; y < 3.6; y += 0.18) seg(P(14.5, y, 30.55), P(22, y, 30.55), "rgba(120,130,145,0.07)", 0.4);
    box(14.5, 22, 3.7, 4.3, 30.55, "#161b22");

    // ---- street
    floor(-60, 60, 15, 26, 0, "#0e1115");
    for (let x = -40; x < 40; x += 3.2) floor(x, x + 1.6, 21, 21.15, 0.001, "rgba(150,160,175,0.16)");
    floor(-60, 60, 26, 30.6, 0.12, "#15191f");
    seg(P(-60, 0.12, 26), P(60, 0.12, 26), "rgba(140,150,165,0.18)", 0.6);
    for (let x = -30; x < 30; x += 1.5) seg(P(x, 0.12, 26), P(x, 0.12, 30.6), "rgba(120,130,145,0.05)", 0.4);
    for (let z = 27.5; z < 30.6; z += 1.5) seg(P(-60, 0.12, z), P(60, 0.12, z), "rgba(120,130,145,0.05)", 0.4);
    for (let i = 0; i < 3; i++) {                                              // bank steps
      const z0 = 28.8 + i * 0.4, y = 0.12 + 0.13 * (i + 1);
      box(-5.2, 5.2, y - 0.13, y, z0, "#12161b"); floor(-5.2, 5.2, z0, z0 + 0.4, y, "#1a1f26");
    }
    // parked cars: side panel + roof, faint edge light
    for (const [x0, x1] of [[-8.5, -4.1], [5.2, 9.6]]) {
      const z = 24.4;
      quad([P(x0 + 0.2, 0.3, z), P(x1 - 0.2, 0.3, z), P(x1, 0.95, z), P(x0, 0.95, z)], "#0b0e12");
      quad([P(x0 + 1.1, 0.95, z), P(x1 - 0.9, 0.95, z), P(x1 - 1.4, 1.45, z + 0.2), P(x0 + 1.5, 1.45, z + 0.2)], "#090b0e");
      floor(x0 + 1.4, x1 - 1.3, z + 0.2, z + 1.6, 1.45, "#13171d");
      floor(x0, x1, z, z + 1.8, 0.95, "#10141a");
      seg(P(x0, 0.95, z), P(x1, 0.95, z), "rgba(150,165,185,0.14)", 0.5);
    }
    // street lamps: dim grey, no colour
    for (const x of [-9.5, 9.5]) {
      const z = 27;
      seg(P(x, 0.12, z), P(x, 5.6, z), "#07090c", 0.16 * cam.f / z);
      seg(P(x, 5.6, z), P(x + (x < 0 ? 1 : -1), 5.6, z), "#07090c", 0.1 * cam.f / z);
      const [hx, hy] = P(x + (x < 0 ? 1 : -1), 5.5, z), g = b.createRadialGradient(hx, hy, 0, hx, hy, cam.f * 0.09);
      g.addColorStop(0, "rgba(190,200,215,0.22)"); g.addColorStop(1, "rgba(190,200,215,0)");
      b.fillStyle = g; b.fillRect(0, 0, W, H);
      const [px, py] = P(x + (x < 0 ? 1 : -1), 0.12, z), pg = b.createRadialGradient(px, py, 0, px, py, cam.f * 0.08);
      pg.addColorStop(0, "rgba(170,180,195,0.08)"); pg.addColorStop(1, "rgba(170,180,195,0)");
      b.fillStyle = pg; b.beginPath(); b.ellipse(px, py, cam.f * 0.08, cam.f * 0.03, 0, 0, 7); b.fill();
    }

    // ---- facade: stone with the openings cut out
    const wall = new Path2D(), add = (x0, x1, y0, y1, z) => { const [a, c] = P(x0, y1, z), [d, e] = P(x1, y0, z); wall.rect(a, c, d - a, e - c); };
    add(-13.2, 13.2, 0.12, 9.6, FZ);
    for (const o of [...GROUND, ...UPPER]) add(o.x0, o.x1, o.y0, o.y1, o.z);
    const st = b.createLinearGradient(0, P(0, 9.6, FZ)[1], 0, P(0, 0, FZ)[1]);
    st.addColorStop(0, "#1c2129"); st.addColorStop(1, "#14181e");
    b.fillStyle = st; b.fill(wall, "evenodd");
    b.save(); b.clip(wall, "evenodd");
    for (let y = 0.6; y < 9.6; y += 0.55) {
      seg(P(-13.2, y, FZ), P(13.2, y, FZ), "rgba(0,0,0,0.25)", 0.4);
      for (let x = -13.2 + ((y * 7) % 1.6); x < 13.2; x += 1.6) seg(P(x, y, FZ), P(x, y + 0.55, FZ), "rgba(0,0,0,0.18)", 0.35);
    }
    b.restore();
    for (const x of COLUMNS) {
      box(x - 0.75, x + 0.75, 0.12, 0.55, FZ - 0.05, "#191e26");
      box(x - 0.6, x + 0.6, 0.55, 8.3, FZ - 0.05, "#1f252e");
      for (let i = -2; i <= 2; i++) seg(P(x + i * 0.2, 0.6, FZ - 0.05), P(x + i * 0.2, 8.25, FZ - 0.05), "rgba(0,0,0,0.3)", 0.4);
      box(x - 0.8, x + 0.8, 8.3, 8.65, FZ - 0.05, "#242b34");
      seg(P(x - 0.8, 8.3, FZ - 0.05), P(x + 0.8, 8.3, FZ - 0.05), "rgba(150,165,185,0.12)", 0.4);
    }
    box(-13.2, 13.2, 8.65, 9.6, FZ - 0.06, "#1b2028");
    for (let x = -13.2; x < 13.2; x += 0.36) box(x, x + 0.18, 9.6, 9.76, FZ - 0.07, "#20262e");
    box(-13.6, 13.6, 9.76, 10.1, FZ - 0.08, "#222831");
    seg(P(-13.6, 9.76, FZ - 0.08), P(13.6, 9.76, FZ - 0.08), "rgba(150,165,185,0.14)", 0.5);
    // engraved name: dark letters with a faint lower lip of light
    const [tx, ty] = P(0, 9.12, FZ - 0.06), fs = 0.5 * cam.f / FZ;
    b.font = `${fs}px Georgia, "Times New Roman", serif`; b.textAlign = "center"; b.textBaseline = "middle";
    if ("letterSpacing" in b) b.letterSpacing = `${fs * 0.35}px`;
    b.fillStyle = "rgba(160,170,185,0.12)"; b.fillText("CITY TRUST BANK", tx, ty + fs * 0.06);
    b.fillStyle = "#0c0f13"; b.fillText("CITY TRUST BANK", tx, ty);
    // sills and lintels on the upper windows
    for (const o of UPPER) {
      box(o.x0 - 0.15, o.x1 + 0.15, o.y0 - 0.18, o.y0, FZ - 0.06, "#232a33");
      box(o.x0 - 0.1, o.x1 + 0.1, o.y1, o.y1 + 0.28, FZ - 0.06, "#20262e");
      box((o.x0 + o.x1) / 2 - 0.15, (o.x0 + o.x1) / 2 + 0.15, o.y1, o.y1 + 0.38, FZ - 0.07, "#262d36");
    }
    // security camera over the door
    box(-3.2, -2.6, 4.0, 4.25, FZ - 0.3, "#0a0c10");
  }

  // things in front of the people: mullions, door frames, glass sheen, bullet holes
  function drawFg() {
    const g = fgx;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, fgHi.width, fgHi.height);
    g.setTransform(SS, 0, 0, SS, 0, 0);
    const P = stage, k = cam.f / FZ;
    const bar = (x0, y0, x1, y1, z, w) => {
      const [a, b1] = P(x0, y0, z), [c, d] = P(x1, y1, z);
      g.strokeStyle = "#0a0d11"; g.lineWidth = w * k; g.beginPath(); g.moveTo(a, b1); g.lineTo(c, d); g.stroke();
      g.strokeStyle = "rgba(150,165,185,0.10)"; g.lineWidth = 0.4; g.beginPath(); g.moveTo(a + w * k * 0.5, b1); g.lineTo(c + w * k * 0.5, d); g.stroke();
    };
    // windows stand open: only the frames remain
    for (const o of OPENINGS) {
      const [a, c] = P(o.x0, o.y1, o.z), [d, e] = P(o.x1, o.y0, o.z);
      g.strokeStyle = "#0b0e12"; g.lineWidth = 0.14 * k; g.strokeRect(a, c, d - a, e - c);
      g.strokeStyle = "rgba(150,165,185,0.10)"; g.lineWidth = 0.4; g.strokeRect(a - 0.07 * k, c - 0.07 * k, d - a + 0.14 * k, e - c + 0.14 * k);
    }
    // neighbour's curtain half drawn
    const [ca, cc] = P(NEIGHBOR.x0, NEIGHBOR.y1, NEIGHBOR.z), [cd, ce] = P(NEIGHBOR.x0 + 0.55, NEIGHBOR.y0, NEIGHBOR.z);
    const cg = g.createLinearGradient(ca, 0, cd, 0); cg.addColorStop(0, "#0a0c10"); cg.addColorStop(1, "rgba(10,12,16,0.75)");
    g.fillStyle = cg; g.fillRect(ca, cc, cd - ca, ce - cc);
  }

  // ------------------------------------------------------------------ helpers
  const alive = list => list.filter(e => !e.dying);
  function say(m, d = 2.5) { G.msg = m; G.msgT = d; }
  function end(phase, reason) { if (G.phase !== "play") return; G.phase = phase; G.reason = reason; G.endT = 0; G.scopeToggle = false; G.scopeHeld = false; setTimeout(showEnd, 1400); }
  const pxPerM = () => cam.f / REF_Z;
  function sway(t) {
    const a = G.swayAmp;
    return [(Math.sin(t * 0.83) + 0.5 * Math.sin(t * 1.91 + 1)) * a, (Math.cos(t * 1.17) * 0.7 + 0.4 * Math.sin(t * 2.3)) * a];
  }

  // ------------------------------------------------------------------ AI
  function updateHostage(h, dt, t) {
    if (h.dying) return;
    const threatened = thugs.some(e => !e.dying && e.state === "threat" && e.target === h);
    h.tremble = ease(h.tremble, threatened ? 1.4 : G.alert ? 0.4 : 0.1, 3, dt);
    if (G.phase === "win") { h.kneel = 0; h.cower = 0; h.pose = "hang"; turnTo(h, 0, dt, 2); return; }
    h.cower = G.alert ? 1 : 0; h.pose = G.alert ? "cower" : "head";
    turnTo(h, h.homeYaw + Math.sin(t * 0.4 + h.id) * 0.35, dt, 1.5);       // looking around, scared
  }

  function updateThug(e, dt, t) {
    if (e.dying) return;
    if (G.phase === "fail") { idle(e, dt); return; }   // freeze the scene on the failure screen
    if (e.state === "calm") {
      if (e.pauseT > 0) {
        idle(e, dt); e.pauseT -= dt;
        if (e.lookYaw != null) turnTo(e, e.lookYaw, dt, 2);
      } else if (walkTo(e, ...e.path[e.wp], dt)) {
        e.pauseT = e.path.length > 1 ? 1.5 + Math.random() * 3 : 3 + Math.random() * 3;
        e.wp = (e.wp + 1) % e.path.length;
        e.lookYaw = (e.homeYaw ?? 0) + (Math.random() - 0.5) * 2.2;
      }
      if (G.alert && (e.react -= dt) <= 0) {
        e.speed = e.weapon === "rifle" ? 1.7 : 1.35;
        if (e.weapon === "rifle") {
          // head for the nearest window so he can see the street
          const ops = e.y0 > 1 ? UPPER : GROUND, zf = FZ + 1.1;
          let best = null;
          for (const o of ops) {
            const x = clamp(e.x, (o.x0 + 0.7) * zf / FZ, (o.x1 - 0.7) * zf / FZ), d = Math.abs(x - e.x);
            if (!best || d < best.d) best = { x, d };
          }
          e.firePos = [best.x, zf]; e.state = "move";
        } else e.state = "hunt";
      }
      return;
    }
    if (e.state === "move") {
      e.pose = "rifle";
      if (walkTo(e, ...e.firePos, dt)) { e.state = "raise"; e.tm = 0.8; }
      return;
    }
    if (e.state === "raise" || e.state === "tele" || e.state === "cool") {
      idle(e, dt); turnTo(e, 0, dt, 6); e.pose = "aim";
      e.tm -= dt;
      if (e.tm > 0) return;
      if (e.state === "tele") { fireAtPlayer(e); e.state = "cool"; e.tm = 1.8 + Math.random() * 1.2; }
      else { e.state = "tele"; e.tm = TELE; }
      return;
    }
    if (e.state === "hunt") {
      e.pose = "knife";
      if (e.pauseT > 0) { idle(e, dt); e.pauseT -= dt; return; }
      if (!e.target || e.target.dying) {
        const free = alive(hostages).filter(h => !thugs.some(o => o !== e && !o.dying && o.target === h));
        if (!free.length) { idle(e, dt); return; }
        e.target = free.sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0];
      }
      const h = e.target, s = Math.sign(e.x - h.x) || 1;
      if (walkTo(e, h.x + s * 0.55, h.z - 0.3, dt)) e.state = "threat";
      return;
    }
    if (e.state === "threat") {
      const h = e.target;
      idle(e, dt); turnTo(e, yawToward(e, h.x, h.z), dt, 6); e.pose = "raise";
      e.tremble = 0.6;
      if (h.dying) { e.state = "hunt"; e.target = null; }
      // he only menaces: the hostages are scared, not harmed
    }
  }

  function fireAtPlayer(e) {
    if (G.phase !== "play") return;
    sfx.distant(); e.flash = 0.09;
    G.hp -= DMG; G.shake = 14; G.dmg = 0.6; G.unscopeT = 0.5;
    G.ownCracks.push([0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.6, (Math.random() * 1e9) | 0]);
    if (G.hp <= 0) { G.hp = 0; end("fail", "YOU WERE SHOT"); }
  }

  // ------------------------------------------------------------------ update
  function update(dt, t) {
    if (G.phase === "play") G.time += dt;
    if (G.phase === "win" || G.phase === "fail") G.endT += dt;
    G.shake = Math.max(0, G.shake - dt * 40); G.dmg = Math.max(0, G.dmg - dt); G.msgT -= dt; G.helpT -= G.phase === "play" ? dt : 0;
    G.bolt = Math.max(0, G.bolt - dt); G.unscopeT = Math.max(0, G.unscopeT - dt); G.muzzle = Math.max(0, G.muzzle - dt);
    G.recoil = ease(G.recoil, 0, 5, dt);
    updateEmbers(dt);
    for (const p of G.puffs) p.age += dt;
    G.puffs = G.puffs.filter(p => p.age < p.life);

    // breath: hold Shift to steady the scope for a few seconds, then you gasp
    const holding = E.keys.ShiftLeft || E.keys.ShiftRight;
    if (holding && G.breath > 0 && G.winded <= 0) { G.breath -= dt / 4; if (G.breath <= 0) { G.breath = 0; G.winded = 2; } }
    else G.breath = Math.min(1, G.breath + dt * 0.25);
    G.winded = Math.max(0, G.winded - dt);
    G.swayAmp = ease(G.swayAmp, holding && G.breath > 0 && G.winded <= 0 ? 0.02 : G.winded > 0 ? 0.3 : 0.16, 4, dt);

    // scope camera
    const want = (G.scopeHeld || G.scopeToggle) && G.unscopeT <= 0 && G.phase === "play";
    G.zk = ease(G.zk, want ? 1 : 0, 10, dt);
    const [swx, swy] = sway(t), m = pxPerM();
    const ax = E.mouse.x * SCALE + swx * m, ay = E.mouse.y * SCALE + swy * m - G.recoil * m;
    cam.zoom = 1 + (G.zoom - 1) * G.zk;
    const hw = W / (2 * cam.zoom), hh = H / (2 * cam.zoom);
    cam.fx = clamp(lerp(W / 2, ax, G.zk), hw, W - hw); cam.fy = clamp(lerp(H / 2, ay, G.zk), hh, H - hh);

    for (const f of figs) { animate(f, dt); if (updateDeath(f, dt)) f.gone = true; f.flash = Math.max(0, (f.flash || 0) - dt); }
    for (const h of hostages) updateHostage(h, dt, t);
    for (const e of thugs) updateThug(e, dt, t);
    const w = figs.find(f => f.role === "watcher");
    if (w && !w.dying) turnTo(w, w.homeYaw + Math.sin(t * 0.3) * 0.5, dt, 1);
    if (G.phase === "play" && thugs.every(e => e.dying)) { G.phase = "clearing"; G.endT = 0; }
    if (G.phase === "clearing" && (G.endT += dt) > 2.6) { G.phase = "win"; G.endT = 0; G.scopeToggle = false; showEnd(); }
  }

  // ------------------------------------------------------------------ input
  function shoot(t) {
    if (G.bolt > 0) return;
    if (G.ammo === 0) { sfx.empty(); say("SPACE TO RELOAD", 1.5); return; }
    G.ammo--; G.shots++; G.bolt = BOLT; G.muzzle = 0.07; G.shake = Math.max(G.shake, G.zk > 0.5 ? 5 : 3);
    sfx.sniper(); setTimeout(() => sfx.bolt(), 260);
    let vx, vy;
    if (G.zk > 0.5) { vx = W / 2; vy = H / 2; }
    else {                                       // no scope: the shot wanders
      const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * 0.45 * pxPerM();
      vx = E.mouse.x * SCALE + Math.cos(a) * rr; vy = E.mouse.y * SCALE + Math.sin(a) * rr;
    }
    G.recoil = 0.6;
    if (!G.alert) { G.alert = true; for (const e of thugs) e.react = 1.2 + Math.random() * 2.2; }
    const [sx, sy] = toStage(vx, vy);
    if (!isOpen(sx, sy)) { puff(sx, sy); return; }
    const hit = hitTest(figs.filter(f => !f.gone), vx, vy);
    if (!hit) return;
    const e = hit.e;
    e.dying = true; e.hitFlash = 0.1; e.fallSide = Math.sign(e.x - (cam.cx - W / 2)) || 1;
    if (e.kind === "blue") { end("fail", "YOU SHOT A CIVILIAN"); return; }
    say(hit.head ? "HEADSHOT" : "TARGET DOWN", 1.2);
  }
  function puff(sx, sy) {
    sfx.thud();
    G.puffs.push({ sx, sy, age: 0, life: 0.9, parts: Array.from({ length: 16 }, () => ({ a: Math.random() * 6.283, v: 0.3 + Math.random() * 0.9, s: 0.5 + Math.random() })) });
  }
  function onDown(button) {
    if (button === 2) { G.scopeHeld = true; return; }
    if (button !== 0) return;
    if (G.phase === "play") shoot(performance.now() / 1000);
  }
  function onUp(button) { if (button === 2) G.scopeHeld = false; }
  function onKey(code) {
    if (code === "Space" || code === "KeyR") { if (G.ammo < MAG) { G.ammo = MAG; sfx.reload(); } }
    if (code === "KeyZ" || code === "KeyC") G.scopeToggle = !G.scopeToggle;
  }
  function onWheel(dy) { G.zoom = clamp(G.zoom * (dy > 0 ? 0.9 : 1.1), ZMIN, ZMAX); }

  // ------------------------------------------------------------------ render
  function render(t) {
    const z = cam.zoom, sx = (cam.fx - W / (2 * z)) * SS, sy = (cam.fy - H / (2 * z)) * SS, sw = W / z * SS, sh = H / z * SS;
    sctx.globalAlpha = 1; sctx.globalCompositeOperation = "source-over";
    sctx.drawImage(bgHi, sx, sy, sw, sh, 0, 0, W, H);
    mvctx.clearRect(0, 0, W, H); mvctx.fillStyle = "#fff";
    for (const [x0, y0, x1, y1] of openRects) { const [a, b] = toView(x0, y0), [c, d] = toView(x1, y1); mvctx.fillRect(a, b, c - a, d - b); }
    drawFigures(figs.filter(f => !f.gone), t, { mask: maskView });
    sctx.drawImage(fgHi, sx, sy, sw, sh, 0, 0, W, H);
    effects(t);
    ownWindow(t);
    scopeMask();
    post(t, { shake: G.shake, dmg: G.dmg });
    hud(t);
  }

  function effects(t) {
    sctx.globalCompositeOperation = "lighter";
    for (const e of thugs) {
      if (e.dying || !e.geom || !e.geom.muzzle) continue;
      const [mx, my, k] = e.geom.muzzle;
      const glint = e.state === "tele" ? (0.55 + 0.45 * Math.sin(t * 28)) * smooth((TELE - e.tm) / 0.3) : 0;
      const fl = e.flash > 0 ? 1 : 0;
      if (!glint && !fl) continue;
      const r = Math.max(4, k * 0.12) * (fl ? 3 : 1);
      const g = sctx.createRadialGradient(mx, my, 0, mx, my, r);
      g.addColorStop(0, `rgba(255,240,230,${fl ? 1 : glint})`); g.addColorStop(0.3, `rgba(255,60,40,${(fl ? 0.8 : 0.6) * (fl || glint)})`); g.addColorStop(1, "rgba(255,30,20,0)");
      sctx.fillStyle = g; sctx.fillRect(mx - r, my - r, r * 2, r * 2);
      sctx.strokeStyle = `rgba(255,200,190,${0.6 * (fl || glint)})`; sctx.lineWidth = 1;
      sctx.beginPath(); sctx.moveTo(mx - r * 1.8, my); sctx.lineTo(mx + r * 1.8, my); sctx.moveTo(mx, my - r * 1.2); sctx.lineTo(mx, my + r * 1.2); sctx.stroke();
    }
    sctx.globalCompositeOperation = "source-over";
    for (const p of G.puffs) {
      const u = p.age / p.life, m = pxPerM() * cam.zoom;
      for (const q of p.parts) {
        const [x, y] = toView(p.sx, p.sy), d = q.v * easeOut(u) * 0.35 * m;
        sctx.fillStyle = `rgba(150,155,165,${0.5 * (1 - u)})`;
        sctx.beginPath(); sctx.arc(x + Math.cos(q.a) * d, y + Math.sin(q.a) * d * 0.6 - u * 0.1 * m, q.s * (0.03 + u * 0.05) * m, 0, 7); sctx.fill();
      }
    }
  }

  // the dark room you are shooting from: frame, sill, curtain, your rifle, holes in your glass
  function ownWindow(t) {
    const a = 1 - smooth(G.zk * 1.4);
    if (a <= 0) return;
    sctx.save(); sctx.globalAlpha = a;
    sctx.fillStyle = "#040506";
    sctx.fillRect(0, 0, W, H * 0.045); sctx.fillRect(0, 0, W * 0.03, H); sctx.fillRect(W * 0.97, 0, W * 0.03, H);
    sctx.fillRect(0, H * 0.9, W, H * 0.1);
    sctx.fillStyle = "rgba(120,130,145,0.16)"; sctx.fillRect(0, H * 0.9, W, 1);
    const cg = sctx.createLinearGradient(0, 0, W * 0.1, 0);
    cg.addColorStop(0, "rgba(3,4,5,1)"); cg.addColorStop(1, "rgba(3,4,5,0)");
    sctx.fillStyle = cg; sctx.fillRect(0, 0, W * 0.1, H);
    for (let i = 0; i < 5; i++) { sctx.fillStyle = `rgba(0,0,0,${0.25 + (i % 2) * 0.2})`; sctx.fillRect(W * (0.01 + i * 0.015), 0, W * 0.006, H * 0.9); }
    // rifle resting on the sill, bottom right
    sctx.fillStyle = "#06070a"; sctx.strokeStyle = "rgba(120,130,145,0.18)"; sctx.lineWidth = 1;
    sctx.beginPath(); sctx.moveTo(W * 1.02, H * 0.97); sctx.lineTo(W * 0.74, H * 0.86); sctx.lineTo(W * 0.735, H * 0.875); sctx.lineTo(W * 1.02, H * 1.02); sctx.closePath(); sctx.fill(); sctx.stroke();
    sctx.beginPath(); sctx.moveTo(W * 0.98, H * 0.9); sctx.lineTo(W * 0.85, H * 0.85); sctx.lineTo(W * 0.85, H * 0.875); sctx.lineTo(W * 0.98, H * 0.93); sctx.closePath(); sctx.fill(); sctx.stroke();
    if (G.muzzle > 0) {
      const g = sctx.createRadialGradient(W * 0.73, H * 0.865, 0, W * 0.73, H * 0.865, H * 0.25);
      g.addColorStop(0, "rgba(255,225,180,0.6)"); g.addColorStop(1, "rgba(255,225,180,0)");
      sctx.globalCompositeOperation = "lighter"; sctx.fillStyle = g; sctx.fillRect(0, 0, W, H); sctx.globalCompositeOperation = "source-over";
    }
    // bullet holes in your own pane
    for (const [u, v, seed] of G.ownCracks) {
      const r = mulberry(seed), cx = u * W, cy = v * H, R = H * 0.07;
      sctx.strokeStyle = "rgba(200,212,230,0.35)"; sctx.lineWidth = 0.7;
      for (let i = 0; i < 11; i++) {
        let ang = i / 11 * 6.283 + r() * 0.4, x = cx, y = cy; sctx.beginPath(); sctx.moveTo(x, y);
        for (let s = 0; s < 3; s++) { ang += (r() - 0.5) * 0.5; x += Math.cos(ang) * R * (0.2 + r() * 0.3); y += Math.sin(ang) * R * (0.2 + r() * 0.3); sctx.lineTo(x, y); }
        sctx.stroke();
      }
      sctx.fillStyle = "#020203"; sctx.beginPath(); sctx.arc(cx, cy, R * 0.05, 0, 7); sctx.fill();
    }
    sctx.restore();
  }

  function scopeMask() {
    const a = smooth(G.zk * 1.3);
    if (a <= 0.01) return;
    const R = Math.min(W, H) * 0.46, cx = W / 2, cy = H / 2;
    sctx.save(); sctx.globalAlpha = a;
    // light amplification inside the glass
    sctx.globalCompositeOperation = "screen"; sctx.fillStyle = "rgba(55,65,80,0.45)";
    sctx.beginPath(); sctx.arc(cx, cy, R, 0, 7); sctx.fill(); sctx.globalCompositeOperation = "source-over";
    const p = new Path2D(); p.rect(0, 0, W, H); p.arc(cx, cy, R, 0, Math.PI * 2);
    sctx.fillStyle = "#000"; sctx.fill(p, "evenodd");
    const ring = sctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R);
    ring.addColorStop(0, "rgba(0,0,0,0)"); ring.addColorStop(1, "rgba(0,0,0,0.85)");
    sctx.fillStyle = ring; sctx.beginPath(); sctx.arc(cx, cy, R, 0, 7); sctx.fill();
    sctx.restore();
  }

  // ------------------------------------------------------------------ panels (HTML, crisp)
  const KEYS = [["Right mouse", "Hold to scope"], ["Left click", "Fire"], ["Wheel", "Zoom 3× – 8×"], ["Shift", "Hold breath"], ["Space", "Reload"], ["Esc", "Menu"]];
  function showBrief() {
    showPanel(`
      <p class="eyebrow">Level 1 · Sniper</p>
      <h2>City Trust Bank</h2>
      <p class="lede">Six armed men are holding seven hostages. You are in a dark room across the street, rifle on the sill.</p>
      <ul class="legend">
        <li><i class="dot red"></i><span><b>Gunmen</b> come to the windows and shoot back. A red glint flashes before each shot.</span></li>
        <li><i class="dot orange"></i><span><b>Knife men</b> stand over the hostages.</span></li>
        <li><i class="dot blue"></i><span><b>Hostages and neighbours.</b> Hitting one ends the mission.</span></li>
      </ul>
      <p class="note">Your first shot is free. After it, everyone reacts.</p>
      <dl class="keys">${KEYS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      <div class="actions"><button id="p-go" class="primary">Begin mission</button></div>`,
      { "p-go": () => { hidePanel(); G.phase = "play"; } });
  }
  function showEnd() {
    if (G.phase === "win") showPanel(`
      <p class="eyebrow">Level 1 · Complete</p>
      <h2 class="ok">Bank clear</h2>
      <p class="lede">All ${hostages.filter(h => !h.dying).length} hostages walk out.</p>
      <dl class="stats"><dt>Time</dt><dd>${G.time.toFixed(1)} s</dd><dt>Shots</dt><dd>${G.shots}</dd><dt>Accuracy</dt><dd>${Math.round(thugs.length / Math.max(1, G.shots) * 100)}%</dd><dt>Health</dt><dd>${G.hp}</dd></dl>
      <div class="actions"><button id="p-again" class="primary">Play again</button><button id="p-menu">Menu</button></div>`, endActions());
    else showPanel(`
      <p class="eyebrow">Level 1 · Failed</p>
      <h2 class="bad">Mission failed</h2>
      <p class="lede">${G.reason === "YOU SHOT A CIVILIAN" ? "You hit a civilian." : "You were shot."}</p>
      <div class="actions"><button id="p-again" class="primary">Try again</button><button id="p-menu">Menu</button></div>`, endActions());
  }
  const endActions = () => ({
    "p-again": () => { hidePanel(); init(); hidePanel(); G.phase = "play"; },
    "p-menu": () => { hidePanel(); const m = document.getElementById("menu"); if (m) m.hidden = false; init(); },
  });

  // ------------------------------------------------------------------ HUD
  function hud(t) {
    const k = hudK(), pad = 28 * k, VW = E.VW, VH = E.VH;
    const ink = "200,215,235";
    if (G.zk > 0.5) reticle(t, k);
    else if (G.phase === "play") crosshair(E.mouse.x * k, E.mouse.y * k, k, 20);

    glowText("LEVEL 1   CITY TRUST BANK", pad, pad, 13 * k, ink, 0.55, "left");
    glowText("HOSTAGES", pad, pad + 24 * k, 11 * k, ink, 0.45, "left");
    hostages.forEach((h, i) => {
      vctx.fillStyle = h.dying ? "rgba(120,60,60,0.5)" : "rgba(90,170,255,0.9)";
      vctx.shadowColor = "rgba(60,150,255,0.9)"; vctx.shadowBlur = h.dying ? 0 : 6 * k;
      vctx.beginPath(); vctx.arc(pad + 82 * k + i * 13 * k, pad + 24 * k, 3.5 * k, 0, 7); vctx.fill();
    });
    vctx.shadowBlur = 0;
    glowText(`GUNMEN ${alive(thugs).length}`, pad, pad + 46 * k, 11 * k, "255,140,110", 0.55, "left");
    recDot(t);

    for (let i = 0; i < MAG; i++) {
      vctx.fillStyle = i < G.ammo ? "rgba(220,235,255,0.8)" : "rgba(220,235,255,0.12)";
      vctx.fillRect(VW - pad - (i + 1) * 11 * k, VH - pad - 26 * k, 5 * k, 26 * k);
    }
    if (G.bolt > 0) glowText("BOLT", VW - pad, VH - pad - 42 * k, 11 * k, ink, 0.5, "right");
    else if (G.ammo === 0 && G.phase === "play") glowText("SPACE", VW - pad, VH - pad - 42 * k, 12 * k, "255,200,150", 0.5 + 0.5 * Math.sin(t * 8), "right");
    vctx.fillStyle = "rgba(200,210,225,0.12)"; vctx.fillRect(pad, VH - pad - 6 * k, 180 * k, 6 * k);
    vctx.fillStyle = G.hp > 30 ? "rgba(190,215,240,0.75)" : "rgba(255,60,50,0.9)";
    vctx.fillRect(pad, VH - pad - 6 * k, 180 * k * G.hp / 100, 6 * k);

    if (G.msgT > 0) glowText(G.msg, VW / 2, VH * 0.2, 22 * k, ink, Math.min(1, G.msgT) * 0.9);
    if (G.phase === "play" && G.helpT > 0)
      glowText("RIGHT-HOLD SCOPE  ·  CLICK FIRE  ·  SHIFT BREATH  ·  SPACE RELOAD", VW / 2, VH - pad - 3 * k, 13 * k, ink, Math.min(1, G.helpT) * 0.7);

  }

  function reticle(t, k) {
    const VW = E.VW, VH = E.VH, cx = VW / 2, cy = VH / 2, R = Math.min(VW, VH) * 0.46;
    vctx.strokeStyle = "rgba(0,0,0,0.9)"; vctx.lineWidth = 3 * k;
    const lines = [[cx - R, cy, cx - 14 * k, cy], [cx + 14 * k, cy, cx + R, cy], [cx, cy - R, cx, cy - 14 * k], [cx, cy + 14 * k, cx, cy + R]];
    for (const [a, b, c, d] of lines) { vctx.beginPath(); vctx.moveTo(a, b); vctx.lineTo(c, d); vctx.stroke(); }
    vctx.strokeStyle = "rgba(225,235,250,0.85)"; vctx.lineWidth = 1 * k;
    for (const [a, b, c, d] of lines) { vctx.beginPath(); vctx.moveTo(a, b); vctx.lineTo(c, d); vctx.stroke(); }
    // thick posts at the rim
    vctx.lineWidth = 4 * k; vctx.strokeStyle = "rgba(0,0,0,0.95)";
    for (const [a, b, c, d] of [[cx - R, cy, cx - R * 0.6, cy], [cx + R * 0.6, cy, cx + R, cy], [cx, cy + R * 0.6, cx, cy + R]]) { vctx.beginPath(); vctx.moveTo(a, b); vctx.lineTo(c, d); vctx.stroke(); }
    for (let i = -4; i <= 4; i++) if (i) {                                     // mil dots
      vctx.fillStyle = "rgba(225,235,250,0.75)";
      vctx.beginPath(); vctx.arc(cx + i * R * 0.11, cy, 1.6 * k, 0, 7); vctx.fill();
      vctx.beginPath(); vctx.arc(cx, cy + i * R * 0.11, 1.6 * k, 0, 7); vctx.fill();
    }
    pinDot(cx, cy, k);
    glowText(`${G.zoom.toFixed(1)}×`, cx + R * 0.62, cy + R * 0.72, 12 * k, "200,215,235", 0.6);
    // breath gauge under the reticle
    const bw = R * 0.5, by = cy + R * 0.82;
    vctx.fillStyle = "rgba(200,215,235,0.12)"; vctx.fillRect(cx - bw / 2, by, bw, 3 * k);
    vctx.fillStyle = G.winded > 0 ? "rgba(255,90,80,0.8)" : "rgba(200,215,235,0.7)"; vctx.fillRect(cx - bw / 2, by, bw * G.breath, 3 * k);
    glowText(G.winded > 0 ? "GASPING" : "SHIFT  BREATH", cx, by + 14 * k, 10 * k, "200,215,235", 0.45);
  }

  return { name: "bank", init, resize, update, render, onDown, onUp, onKey, onWheel, debug: () => ({ G, thugs, hostages }) };
})();
