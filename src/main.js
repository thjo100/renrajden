// Ingång. Sidan fungerar utan Firebase. Nyheterna och det senaste innehållet för årets lopp
// laddas efter första renderingen, och inloggningskoden laddas bara för administratörer.
import "@fontsource/big-shoulders-display/latin-700";
import "@fontsource/big-shoulders-display/latin-900";
import "@fontsource/familjen-grotesk/latin-400";
import "@fontsource/familjen-grotesk/latin-500";
import "@fontsource/familjen-grotesk/latin-700";
import "@fontsource/jetbrains-mono/latin-400";
import "@fontsource/jetbrains-mono/latin-600";
import "./styles.css";

import { $, store, initToast, initDialogs } from "./ui.js";
import { initSite } from "./site.js";
import { refreshContent } from "./cms/runtime.js";

const ADMIN_HINT = "rr-admin"; // samma nyckel som i admin.js

initToast();
initDialogs();
initSite();

import("./news.js").then((m) => m.startNews());
// Årets lopp och resultatarkivet finns redan i sidan från bygget. Hämta det senaste från Firestore.
refreshContent();

let adminModule = null;
const loadAdmin = () => (adminModule ??= import("./admin.js").then(async (m) => { await m.init(); return m; }));

$("#login-open").addEventListener("click", async () => {
  const btn = $("#login-open");
  btn.setAttribute("aria-busy", "true");
  try { (await loadAdmin()).onLoginButton(); }
  catch { btn.textContent = "Inloggningen kunde inte laddas. Försök igen"; }
  finally { btn.removeAttribute("aria-busy"); }
});

// Enheten har haft en admin-session: ladda inloggningen direkt så att adminläget kommer tillbaka.
if (store.get(ADMIN_HINT)) loadAdmin();
