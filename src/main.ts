import {
  createGameApp,
  createPuzzleAssembly,
  PhaserAdapter,
  mountBrowserDevConsole
} from "@slu/web-shell";

const rendererAdapter = new PhaserAdapter(); // wire your Phaser.Game hooks here

const app = await createGameApp({
  gameId: "chroma-lines",
  gameName: "Chroma Lines",
  version: "0.1.0",
  renderer: rendererAdapter,
  root: document.getElementById("ui")!,
  assemblies: [
    (shell) => createPuzzleAssembly({ shell })
  ]
});

if (new URLSearchParams(location.search).get("dev") === "1") {
  mountBrowserDevConsole(app.shell.studio.dev, { title: "Chroma Lines DEV" });
}

console.log("SLU game ready", app);
