// Bygger dev/preview.html: prototypen inslagen i samma skelett som vid publicering,
// med en lokal mock av databasen och inloggningen så att allt går att testa i webbläsaren.
//
//   node dev/build-preview.js              besökare (läser nyheter)
//   node dev/build-preview.js --admin      inloggning lyckas, CRUD fungerar
//   node dev/build-preview.js --signed-out läget utan databas
//
// Öppna sedan dev/preview.html i webbläsaren. Ändringar i mocken lever bara tills sidan laddas om.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const args = new Set(process.argv.slice(2));
const page = fs.readFileSync(path.join(root, "prototyp", "index.html"), "utf8");
const seed = JSON.parse(fs.readFileSync(path.join(root, "prototyp", "seed-news.json"), "utf8"));
const mock = fs.readFileSync(path.join(__dirname, "mock-claude.js"), "utf8");

const cfg = { admin: args.has("--admin"), signedOut: args.has("--signed-out"), seed };
const reset = ":root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}";
const json = JSON.stringify(cfg).replace(/</g, "\\u003c");

const html = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${reset}</style>
<script>window.__MOCK = ${json};</script>
<script>${mock}</script></head><body>${page}</body></html>`;

const out = path.join(__dirname, "preview.html");
fs.writeFileSync(out, html);
console.log(`Skrev ${path.relative(root, out)} (${cfg.admin ? "admin" : cfg.signedOut ? "utan databas" : "besökare"})`);
