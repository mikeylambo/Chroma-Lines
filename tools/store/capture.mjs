// Store presence: key art, thumbnails, icon, screenshots and a portrait trailer, rendered from the real game.
// Usage: node tools/store/capture.mjs [art|trailer|all]   (BASE_URL, CHROMIUM, OUT env optional)
import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const mode = process.argv[2] ?? "all";
const OUT = path.resolve(process.env.OUT ?? "store");
mkdirSync(OUT, { recursive: true });
const port = 4600 + Math.floor(Math.random() * 300);
const server = process.env.BASE_URL ? null : spawn("node", ["node_modules/vite/bin/vite.js", "preview", "--port", String(port), "--strictPort"], { stdio: "ignore" });
if (server) await new Promise((r) => setTimeout(r, 2500));
const BASE = process.env.BASE_URL ?? `http://localhost:${port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined, args: ["--no-proxy-server", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });

const LOGO_CSS = `
body{background:linear-gradient(#070b1c,#02030a)!important}\n#game{-webkit-mask-image:radial-gradient(ellipse 62% 70% at 50% 50%,#000 72%,transparent 100%);mask-image:radial-gradient(ellipse 62% 70% at 50% 50%,#000 72%,transparent 100%)}
.sl-logo{position:fixed;z-index:99;font-family:"Inter Display",Inter,sans-serif;font-weight:900;letter-spacing:.02em;line-height:.9;color:#fff;pointer-events:none}
.sl-logo b{display:block;background:linear-gradient(90deg,#3ee8ff,#ff4fae 55%,#ffd04a);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 18px #ff4fae66)}
.sl-logo span{display:block;color:#e8fbff;text-shadow:0 0 22px #3ee8ffaa}`;

async function page(w, h, query, { dpr = 2 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const p = await ctx.newPage();
  // Fresh profile with the tutorial ghost already seen, so boards render clean.
  await p.addInitScript(() => {
    const save = { unlocked: 61, current: 1, stars: {}, hints: 3, daily: { lastKey: null, lastPlayedKey: null, streak: 0, best: 0 }, settings: { muted: true, colorAssist: false, haptics: false }, seen: { aha: true, passClears: 9 }, endless: { best: 0, bestBoards: 0, runs: 0, run: null } };
    localStorage.setItem("chroma-lines:save", JSON.stringify({ schemaVersion: 1, savedAt: new Date().toISOString(), data: save }));
  });
  await p.goto(`${BASE}${query}`);
  await p.waitForFunction(() => window.__chroma?.level());
  await p.addStyleTag({ content: LOGO_CSS });
  await p.evaluate(() => window.__chroma.hud(false));
  return { p, ctx };
}

const logo = (p, css, size) => p.evaluate(([css, size]) => {
  const d = document.createElement("div");
  d.className = "sl-logo"; d.style.cssText = css; d.style.fontSize = size + "px";
  d.innerHTML = "<b>CHROMA</b><span>LINES</span>";
  document.body.append(d);
}, [css, size]);

/** Play part of the board so lines are mid-slide with trails (a "live" moment). */
async function midAction(p, taps = 2) {
  await p.evaluate(() => window.__chroma.freeze());
  await p.evaluate(() => window.__chroma.advance(1200));
  for (let i = 0; i < taps; i++) {
    const s = await p.evaluate(() => window.__chroma.solution());
    await p.evaluate((x) => window.__chroma.tap(x), s[0]);
    await p.evaluate((ms) => window.__chroma.advance(ms), i < taps - 1 ? 500 : 90);
  }
}

async function art() {
  const shots = [
    // [file, cssW, cssH, dpr, query, logoCss, logoSize, gameShift]
    ["keyart-1920x1080.png", 960, 540, 2, "?level=47", "left:52px;top:50%;transform:translateY(-50%)", 84, "translateX(26%) scale(.92)"],
    ["thumb-1280x720.png", 640, 360, 2, "?level=33", "left:32px;top:50%;transform:translateY(-50%)", 56, "translateX(26%) scale(.92)"],
    ["portrait-1080x1920.png", 540, 960, 2, "?level=54", "left:0;right:0;top:64px;text-align:center", 88, "translateY(9%)"],
    ["square-1024.png", 512, 512, 2, "?level=26", "left:0;right:0;bottom:22px;text-align:center", 54, "translateY(-6%)"],
    ["poki-628x628.png", 314, 314, 2, "?level=26", "left:0;right:0;bottom:14px;text-align:center", 34, "translateY(-6%)"],
  ];
  for (const [file, w, h, dpr, q, css, size, shift] of shots) {
    const { p, ctx } = await page(w, h, q, { dpr });
    await p.evaluate((t) => { document.getElementById("game").style.transform = t; }, shift);
    await midAction(p, 3);
    await logo(p, css, size);
    await p.screenshot({ path: path.join(OUT, file) });
    await ctx.close();
    console.log("art", file);
  }
  // Icon: one bent tri-colour arrow, no text (reads at 48 px).
  const ctx = await browser.newContext({ viewport: { width: 512, height: 512 } });
  const p = await ctx.newPage();
  await p.setContent(`<body style="margin:0;background:#04060f"><svg width="512" height="512" viewBox="0 0 512 512">
    <defs><radialGradient id="bg" cx=".3" cy=".25" r="1"><stop offset="0" stop-color="#0d1838"/><stop offset="1" stop-color="#02030a"/></radialGradient>
    <filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <rect width="512" height="512" rx="112" fill="url(#bg)"/>
    <g filter="url(#g)" fill="none" stroke-width="34" stroke-linecap="round" stroke-linejoin="round">
      <path d="M112 388H236V236" stroke="#ff4fae"/><path d="M236 236V124" stroke="#3ee8ff"/><path d="M180 300H330" stroke="#ffd04a" stroke-width="30" opacity=".95"/>
    </g>
    <path d="M236 64l62 74H174z" fill="#e8fbff" filter="url(#g)"/>
    <path d="M330 252l60 48-60 48z" fill="#ffd04a" filter="url(#g)"/>
  </svg></body>`);
  await p.screenshot({ path: path.join(OUT, "icon-512.png") });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(OUT, "icon-512.png"), "-vf", "scale=192:192", path.join(OUT, "icon-192.png")]);
  await ctx.close();
  // In-game screenshots, portrait phone.
  for (const [q, name] of [["?level=11", "shot-1-aha"], ["?level=33", "shot-2-tri"], ["?level=56", "shot-3-silhouette"], ["?daily", "shot-4-daily"]]) {
    const { p, ctx } = await page(540, 960, q);
    await p.evaluate(() => window.__chroma.hud(true));
    await midAction(p, 2);
    await p.screenshot({ path: path.join(OUT, `${name}-1080x1920.png`) });
    await ctx.close();
    console.log("shot", name);
  }
}

async function trailer() {
  const FR = path.join(OUT, "frames");
  rmSync(FR, { recursive: true, force: true });
  mkdirSync(FR, { recursive: true });
  let f = 0;
  const grab = async (p, n = 1) => { for (let i = 0; i < n; i++) { await p.evaluate(() => window.__chroma.advance(1000 / 30)); await p.screenshot({ path: path.join(FR, `${String(f++).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 }); } };
  // Taps pass-through lines first so the game's twist is on screen as much as possible.
  const playBoard = async (p, gap, maxTaps = 99) => {
    for (let i = 0; i < maxTaps && (await p.evaluate(() => window.__chroma.remaining())) > 0; i++) {
      const pass = await p.evaluate(() => window.__chroma.passFree());
      const pick = pass.length ? pass[0] : (await p.evaluate(() => window.__chroma.solution()))[0];
      await p.evaluate((x) => window.__chroma.tap(x), pick);
      await grab(p, pass.length ? gap + 6 : gap); // linger on pass-throughs
    }
  };
  // Cold open on the twist: a jammed board, then same colours sliding through each other
  // within the first half-second. The logo lands only after that board clears.
  const segments = [
    { q: "?level=4", gap: 10, lead: 12, logoAfter: true },
    { q: "?level=33", gap: 6, lead: 10 },
    { q: "?level=54", gap: 7, lead: 10 },
    { q: "?level=58", gap: 5, lead: 10, outro: true },
  ];
  for (const seg of segments) {
    const { p, ctx } = await page(540, 960, seg.q);
    await p.evaluate(() => { window.__chroma.freeze(); window.__chroma.advance(900); }); // arrival done before frame 0
    await grab(p, seg.lead);
    await playBoard(p, seg.gap);
    await grab(p, 16);
    if (seg.logoAfter) {
      await logo(p, "left:0;right:0;top:36%;text-align:center", 96);
      await grab(p, 40);
    }
    if (seg.outro) { await logo(p, "left:0;right:0;top:38%;text-align:center", 104); await grab(p, 60); }
    await ctx.close();
    console.log("segment", seg.q, "frames", f);
  }
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "30", "-i", path.join(FR, "%05d.jpg"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", path.join(OUT, "trailer-1080x1920.mp4")]);
  rmSync(FR, { recursive: true, force: true });
  console.log("trailer", f, "frames");
}

try {
  if (mode === "art" || mode === "all") await art();
  if (mode === "trailer" || mode === "all") await trailer();
} finally {
  await browser.close();
  server?.kill();
}
