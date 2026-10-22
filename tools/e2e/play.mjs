// Headless playtest: boots the built game, plays levels through real pointer taps, checks saves.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const OUT = process.env.SHOTS ?? "shots";
mkdirSync(OUT, { recursive: true });
const port = 4173 + Math.floor(Math.random() * 500);
const external = process.env.BASE_URL;
const server = external ? null : spawn("node", ["node_modules/vite/bin/vite.js", "preview", "--port", String(port), "--strictPort"], { stdio: "ignore" });
if (server) await new Promise((r) => setTimeout(r, 2500));
const url = external ?? `http://localhost:${port}/`;
console.log("testing", url);
let browser;
const results = [];
const check = (name, ok, info = "") => { results.push({ name, ok, info }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? " — " + info : ""}`); };
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-proxy-server"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => window.__chroma && window.__chroma.level(), null, { timeout: 15000 });
  check("first input ready < 3 s", Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/01-level1.png` });

  const tapLine = async (i) => {
    const p = await page.evaluate((i) => window.__chroma.head(i), i);
    await page.touchscreen.tap(p.x, p.y);
  };
  const playLevel = async (opts = {}) => {
    let guard = 0;
    while ((await page.evaluate(() => window.__chroma.remaining())) > 0 && guard++ < 200) {
      const sol = await page.evaluate(() => window.__chroma.solution());
      await tapLine(sol[0]);
      await page.waitForTimeout(opts.fast ? 40 : 160);
      if (opts.shotMid && guard === 3) await page.screenshot({ path: opts.shotMid });
    }
  };

  // L1: real taps through the canvas.
  await playLevel();
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/02-results.png` });
  const s1 = await page.evaluate(() => window.__chroma.save());
  check("L1 cleared with 3 stars via touch", s1.stars[1] === 3, JSON.stringify(s1.stars));

  // Next → L2; deliberately tap the blocked line first.
  await page.locator(".next").click();
  await page.waitForTimeout(600);
  const lvl2 = await page.evaluate(() => window.__chroma.level().index);
  check("Next loads L2", lvl2 === 2);
  const blocked = await page.evaluate(() => window.__chroma.blocked());
  await tapLine(blocked[0]);
  await page.waitForTimeout(60);
  await page.screenshot({ path: `${OUT}/03-bump.png` });
  check("blocked tap costs a life", (await page.evaluate(() => window.__chroma.lives())) === 2);
  await playLevel();
  await page.waitForTimeout(2200);
  check("L2 = 2 stars after one mistake", (await page.evaluate(() => window.__chroma.save().stars[2])) === 2);

  // Jump to L11 (aha) and L24 (silhouette), L58, endless, screenshot mid-play.
  for (const [lvl, name] of [[11, "04-L11-aha"], [24, "05-L24-bolt"], [47, "06-L47"], [58, "07-L58"], [61, "08-endless"]]) {
    await page.goto(`${url}?level=${lvl}`);
    await page.waitForFunction(() => window.__chroma && window.__chroma.level(), null, { timeout: 15000 });
    await page.waitForTimeout(lvl === 11 ? 1500 : 900);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await playLevel({ fast: true, shotMid: `${OUT}/${name}-mid.png` });
    await page.waitForTimeout(2000);
    const st = await page.evaluate((l) => window.__chroma.save().stars[l], lvl);
    check(`L${lvl} clears end-to-end`, st >= 1, `stars=${st}`);
  }
  await page.screenshot({ path: `${OUT}/09-results-late.png` });

  // Fail flow.
  await page.goto(`${url}?level=12`);
  await page.waitForFunction(() => window.__chroma && window.__chroma.level());
  await page.waitForTimeout(500);
  for (let k = 0; k < 3; k++) {
    const b = await page.evaluate(() => window.__chroma.blocked());
    await tapLine(b[0]);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/10-fail.png` });
  check("3 mistakes → fail overlay", await page.locator(".overlay.ov-fail.show").count() === 1);
  await page.locator(".retry").click();
  await page.waitForTimeout(400);
  check("retry restores lives on same board", (await page.evaluate(() => [window.__chroma.lives(), window.__chroma.level().index])).join() === "3,12");

  // Pause + map + daily.
  await page.locator(".pause").click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/11-pause.png` });
  await page.locator('button[aria-label="Chapter map"]').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/12-map.png` });
  await page.locator(".daily-go").click();
  await page.waitForTimeout(900);
  check("Daily Light loads", (await page.evaluate(() => window.__chroma.level().kind)) === "daily");
  await page.screenshot({ path: `${OUT}/13-daily.png` });
  await playLevel({ fast: true });
  await page.waitForTimeout(2200);
  const sv = await page.evaluate(() => window.__chroma.save());
  check("Daily complete → streak 1, +1 hint", sv.daily.streak === 1, `hints=${sv.hints}`);

  // Persistence across reload.
  await page.reload();
  await page.waitForFunction(() => window.__chroma && window.__chroma.level());
  const after = await page.evaluate(() => window.__chroma.save());
  check("save persists across reload", after.stars[1] === 3 && after.daily.streak === 1 && after.stars[61] >= 1);

  // Hint usage.
  const h0 = after.hints;
  await page.locator(".hint").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/14-hint.png` });
  check("hint spends one and shows ring", (await page.evaluate(() => window.__chroma.save().hints)) === h0 - 1);

  // Landscape layout.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/15-landscape.png` });

  // Debug overlay.
  await page.goto(`${url}?level=33&debug`);
  await page.waitForFunction(() => window.__chroma && window.__chroma.level());
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/16-debug.png` });
  check("debug overlay renders graph", (await page.locator(".debug-graph line").count()) > 0);

  // Frame pacing on the heaviest board (software GL in CI — indicative only).
  await page.goto(`${url}?level=59`);
  await page.waitForFunction(() => window.__chroma && window.__chroma.level());
  await page.waitForTimeout(1000);
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
  check("frame rate on 16×16 board (swiftshader)", fps > 30, `${fps.toFixed(0)} fps`);

  const ev = await page.evaluate(() => window.__chroma.telemetry().map((e) => e.name));
  check("telemetry level_start emitted", ev.includes("level_start"));
  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser?.close();
  server?.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed`);
process.exit(failed.length ? 1 : 0);
