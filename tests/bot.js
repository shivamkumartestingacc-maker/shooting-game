// Headless checks. Run: node tests/bot.js   (needs playwright + chromium)
// 1. every level loads and runs 120 frames without a page error (engine regressions)
// 2. The Archer: a bot plays each act at a fixed 60 Hz step with the real bow
//    (aim with drop compensation, draw, release), moves on from hunts, takes the scroll.
const { chromium } = require("playwright");
const URL = "file://" + require("path").resolve(__dirname, "../index.html");

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(300);
  let fail = 0;
  for (const name of ["bank", "chase", "metro", "street", "road", "archery"]) {
    const r = await p.evaluate(name => {
      const L = { bank: BankLevel, chase: ChaseLevel, metro: MetroLevel, street: StreetLevel, road: RoadLevel, archery: ArcheryLevel }[name];
      setLevel(L); const G = L.debug ? L.debug().G : null; if (G && "phase" in G) G.phase = "play";
      for (let i = 0; i < 120; i++) { L.update(1 / 60, i / 60); L.render(i / 60); }
      return "ok";
    }, name).catch(e => "ERR " + e.message);
    console.log(`level ${name}: ${r}`); if (r !== "ok") fail++;
  }
  const acts = process.argv[2] ? process.argv[2].split(",").map(Number) : [0, 1, 2, 3, 4];
  for (const act of acts) {
    const r = await p.evaluate(act => {
      const A = ArcheryLevel; if (E.level !== A) setLevel(A); A.start(act);
      const d = () => A.debug(), K = 1 / SCALE;
      let t = 0, frames = 0, draws = 0;
      const startStop = d().G.stop, endD = [168, 240, 336, 409.5, 546][act];
      while (frames < 60 * 240) {
        const { G, figs, S, STOPS, SCROLL } = d();
        if (G.phase !== "play" && G.phase !== "clearing") break;
        if (S.D >= endD && (act < 3 || G.scroll || act === 4)) break;
        const st = STOPS[G.stop];
        // target: nearest live hostile, else prey on a hunt, else nothing
        const live = figs.filter(f => !f.dying && f.geom && f.z > 0.9 && f.st !== "delay");
        const tgt = live.filter(f => f.foe).sort((a, b) => a.z - b.z)[0] || (st && st.hunt && G.fighting ? live.filter(f => f.prey && f.st !== "flee").sort((a, b) => a.z - b.z)[0] : null);
        if (G.fighting && st && st.hunt && !tgt && !figs.some(f => f.foe && !f.dying)) A.onKey("Space");
        if (G.fighting && st && st.scroll && SCROLL.here && SCROLL.screen && !figs.some(f => f.foe && !f.dying)) { E.mouse.x = SCROLL.screen[0] * K; E.mouse.y = SCROLL.screen[1] * K; A.onDown(0); }
        if (tgt) {
          // aim: the head, raised by the drop over that distance, led by the target's sideways speed
          const g = tgt.geom, dist = Math.hypot(tgt.x - cam.offX, tgt.z), tof = dist / 66, k = cam.f / tgt.z * cam.zoom;
          const vx = tgt.prevX != null ? (tgt.x - tgt.prevX) * 60 : 0;
          E.mouse.x = (g.head[0] + vx * tof * k) * K; E.mouse.y = (g.head[1] - 0.5 * 7 * tof * tof * k) * K;
          // hold fire while a townsperson stands between us and the target on screen
          const blocked = figs.some(f => f.kind === "blue" && !f.dying && f.geom && f.z < tgt.z + 1 && f.geom.box[0] - 6 < g.head[0] && f.geom.box[2] + 6 > g.head[0]);
          if (!G.drawing && G.nock <= 0 && G.quiver > 0) { A.onDown(0); draws++; }
          else if (G.drawing && G.draw >= 1 && !blocked) A.onUp(0);
        } else if (G.drawing) A.onUp(0);
        for (const f of figs) f.prevX = f.x;
        A.update(1 / 60, t);
        if (frames % 2 === 0) A.render(t);
        t += 1 / 60; frames++;
      }
      const { G, S } = d();
      return { act: act + 1, phase: G.phase, reason: G.reason, D: +S.D.toFixed(1), stopsDone: G.stop - startStop, hp: Math.round(G.hp), food: Math.round(G.food), quiver: G.quiver, shots: G.shots, hits: G.hits, kills: G.kills, secs: +(frames / 60).toFixed(1), scroll: G.scroll };
    }, act);
    const ok = r.phase !== "fail" && r.D >= [168, 240, 336, 409.5, 546][act] - 0.5;
    console.log(`archery act ${r.act}: ${ok ? "PASS" : "FAIL"}`, JSON.stringify(r)); if (!ok) fail++;
  }
  // stealth at THE GATE: hidden + idle stays unseen; an arrow thudding near a guard draws him; standing exposed gets you seen
  if (!process.argv[2]) {
    const r = await p.evaluate(() => {
      const A = ArcheryLevel; if (E.level !== A) setLevel(A); A.start(1);
      const d = () => A.debug(), step = n => { for (let i = 0; i < n; i++) { A.update(1 / 60, i / 60); if (i % 6 === 0) A.render(i / 60); } };
      const i = d().STOPS.findIndex(s => s.name === "THE GATE"); d().S.D = d().STOPS[i].at - 0.3; d().G.stop = i - 1;
      step(60 * 6);
      const out = { hidden: d().G.hidden, alertAfterIdle: d().G.alert, maxSus: Math.max(...d().figs.filter(f => f.guard).map(f => f.sus)).toFixed(2) };
      // drop an arrow at the feet of the left spearman
      const g = d().figs.find(f => f.role === "spear"); const before = g.sus;
      const S = d().S;
      A.debug().arrows.push({ p: [g.x + 1.2, 0.4, g.z + S.D - 0.5], v: [0, -5, 0.5], trail: [], age: 0 });
      step(10);
      out.noiseSus = +(g.sus - before).toFixed(2); out.noiseState = g.st;
      // now stand up in the open: no cover in front
      for (const it of WildKit.S.items) if (it.hide) it.hide = false;
      step(60 * 8);
      out.alertExposed = d().G.alert;
      return out;
    });
    const ok = r.hidden && !r.alertAfterIdle && r.noiseSus > 0 && r.noiseState === "investigate" && r.alertExposed;
    console.log(`archery stealth: ${ok ? "PASS" : "FAIL"}`, JSON.stringify(r)); if (!ok) fail++;
  }
  if (errs.length) { console.log("page errors:", errs.slice(0, 5)); fail++; }
  await b.close();
  process.exit(fail ? 1 : 0);
})();
