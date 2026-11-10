// Bundles the demo (components + in-browser API shim) into one HTML file.
import * as esbuild from "/opt/npm-tools/node_modules/esbuild/lib/main.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const result = await esbuild.build({
  entryPoints: [path.join(root, "demo/entry.tsx")],
  bundle: true, write: false, format: "iife", platform: "browser", target: "es2020", jsx: "automatic",
  minify: true, legalComments: "none",
  nodePaths: ["/opt/npm-tools/node_modules"],
  alias: { "@": root },
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".json": "json" },
});
const js = result.outputFiles[0].text;
const css = readFileSync(path.join(root, "app/globals.css"), "utf8");
const html = `<title>JUIT Timetable Portal</title>
<style>${css}
:root { color-scheme: light; }
body { padding-left: max(0px, env(safe-area-inset-left, 0px)); padding-right: max(0px, env(safe-area-inset-right, 0px)); }
/* Printing is unavailable inside the preview frame; the deployed site keeps these controls. */
[data-print-action] { display: none !important; }
.demo-bar { background: #fff6d6; border-bottom: 1px solid #e6cf7a; font-size: 13px; padding: 8px 16px; display: flex; flex-direction: column; gap: 6px; }
.demo-bar .row { gap: 6px; }
#toast { position: fixed; left: 50%; bottom: 24px; transform: translate(-50%, 20px); background: #1a1d21; color: #fff; padding: 10px 16px; border-radius: 10px; font-size: 13.5px; opacity: 0; pointer-events: none; transition: all .2s; z-index: 100; max-width: 90vw; }
#toast.show { opacity: 1; transform: translate(-50%, 0); }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<div id="root"></div>
<script>${js}</script>`;
// Standalone copy with a full skeleton for opening from disk.
writeFileSync(path.join(root, "demo/dist/standalone.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${html}</head></html>`.replace("</style>\n<script", "</style></head><body><script").replace("</html>", "</body></html>"));
mkdirSync(path.join(root, "demo/dist"), { recursive: true });
writeFileSync(path.join(root, "demo/dist/index.html"), html);
console.log("demo/dist/index.html", (html.length / 1024).toFixed(0), "KB");
