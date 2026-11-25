// Administratörer: Google-inloggning (Firebase Auth) och hantering av nyheter.
// Årets lopp och resultatarkivet redigeras i cms-admin.js, som startas härifrån.
// Laddas bara när någon klickar på "Logga in som administratör", eller när enheten
// redan har en admin-session (se ADMIN_HINT i main.js).
//
// Behörighet: ett Google-konto är administratör om dokumentet admins/{e-post i gemener}
// finns i Firestore. Säkerhetsreglerna (firestore.rules) kontrollerar samma sak på servern,
// så knapparna här är bara bekvämlighet – det är reglerna som stoppar obehöriga.
import { $, $$, store, todayIso, focusEl, toast, openDialog, closeDialog } from "./ui.js";
import { S, refreshNews, renderNews, setAdminMode } from "./news.js";
import { getAuthApi, getDb } from "./firebase.js";
import { withTimeout, writeErr, formKit, repeater, linkRow, readLinks, confirmDelete, initConfirm } from "./admin-kit.js";
import { initCms, setCmsAdmin } from "./cms-admin.js";
import { HTTPS } from "./cms/model.js";

export const ADMIN_HINT = "rr-admin";

let auth, fa, db, fs;
let currentUser = null;
let adminCheck = null; // { uid, promise }

const loginDlg = () => $("#login-dialog");
const loginMsg = () => $("#login-msg");
const showLoginMsg = (kind, text) => { const m = loginMsg(); m.hidden = false; m.dataset.kind = kind; m.textContent = text; };

/* ---------- Behörighet ---------- */
function checkAdmin(user) {
  if (adminCheck && adminCheck.uid === user.uid) return adminCheck.promise;
  const promise = (async () => {
    const email = (user.email || "").toLowerCase();
    if (!email || !user.emailVerified) return false;
    if (!user.providerData.some((p) => p.providerId === "google.com")) return false;
    try { return (await fs.getDoc(fs.doc(db, "admins", email))).exists(); }
    catch { return false; } // permission-denied eller nätverksfel: inte admin
  })();
  adminCheck = { uid: user.uid, promise };
  return promise;
}

function applyAdmin(on, user) {
  currentUser = on ? user : null;
  $("#admin-bar").hidden = !on;
  $$("[data-admin-only]").forEach((b) => (b.hidden = !on));
  $("#login-open").textContent = on ? "Logga ut som administratör" : "Logga in som administratör";
  if (on) {
    $("#admin-name").textContent = user.displayName || user.email;
    const img = $("#admin-avatar");
    if (user.photoURL) { img.src = user.photoURL; img.referrerPolicy = "no-referrer"; img.hidden = false; } else img.hidden = true;
    store.set(ADMIN_HINT, true);
  } else {
    store.set(ADMIN_HINT, null);
  }
  setAdminMode(on);
  setCmsAdmin(on ? user : null);
}

/* ---------- Inloggning ---------- */
async function signInWithGoogle() {
  const btn = $("#google-btn"), label = $("#google-label");
  if (btn.getAttribute("aria-disabled") === "true") return;
  btn.setAttribute("aria-disabled", "true"); label.textContent = "Väntar på Google…"; loginMsg().hidden = true;
  const provider = new fa.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    const cred = await fa.signInWithPopup(auth, provider);
    label.textContent = "Kontrollerar behörighet…";
    if (await checkAdmin(cred.user)) {
      applyAdmin(true, cred.user);
      closeDialog(loginDlg(), { target: $("#admin-bar button") });
      toast("Du är inloggad som administratör");
    } else {
      const email = cred.user.email || "kontot";
      await fa.signOut(auth);
      showLoginMsg("error", `${email} är inte administratör för Renrajden. Du kan fortfarande läsa allt på sidan. Behöver du behörighet? Kontakta info@renrajden.se.`);
    }
  } catch (e) {
    const code = e && e.code;
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      store.set(ADMIN_HINT, true); // så att admin.js laddas när vi kommer tillbaka
      await fa.signInWithRedirect(auth, provider);
      return;
    }
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") showLoginMsg("info", "Inloggningen avbröts. Försök igen när du vill.");
    else if (code === "auth/network-request-failed") showLoginMsg("error", "Ingen kontakt med Google. Kontrollera anslutningen och försök igen.");
    else if (code === "auth/unauthorized-domain") showLoginMsg("error", "Den här adressen är inte godkänd för inloggning. Lägg till domänen under Authentication → Settings → Authorized domains i Firebase.");
    else showLoginMsg("error", "Inloggningen misslyckades. Försök igen om en stund.");
  } finally {
    btn.removeAttribute("aria-disabled"); label.textContent = "Logga in med Google";
  }
}

async function logout(focusTarget) {
  await fa.signOut(auth);
  applyAdmin(false);
  toast("Du är utloggad");
  focusEl(focusTarget);
}

/** Anropas av main.js när någon klickar på inloggningsknappen i sidfoten. */
export function onLoginButton() {
  if (currentUser) { logout($("#login-open")); return; }
  loginMsg().hidden = true;
  $("#google-btn").removeAttribute("aria-disabled");
  $("#google-label").textContent = "Logga in med Google";
  openDialog(loginDlg());
}

/* ---------- Skapa / redigera ---------- */
const edDlg = () => $("#editor-dialog");
let kit = null, links = null, saving = false, editing = null;

function openEditor(n) {
  editing = n || null;
  kit.clear();
  $("#editor-h").textContent = n ? "Redigera nyhet" : "Ny nyhet";
  $("#save-btn").textContent = n ? "Spara ändringar" : "Publicera";
  $("#f-title").value = n ? n.title : "";
  $("#f-date").value = n ? n.date : todayIso();
  $("#f-tag").value = n ? n.tag : "Info";
  $("#f-body").value = n ? n.body : "";
  $("#f-pinned").checked = !!(n && n.pinned);
  $("#f-alert").checked = !!(n && n.alert);
  links.reset(n && n.links.length ? n.links : [{}]);
  kit.snapshot();
  if (n) S.openIds.add(n.id);
  openDialog(edDlg(), n ? '[data-edit="' + n.id + '"]' : null);
  $("#f-title").focus();
}

/** Fälten som säkerhetsreglerna kräver vid varje skrivning. */
const stamp = (fields, n) => ({
  ...fields,
  createdAt: n && n.createdAtRaw && typeof n.createdAtRaw.toDate === "function" ? n.createdAtRaw : fs.serverTimestamp(),
  createdBy: n ? n.createdBy ?? null : currentUser.uid,
  updatedAt: fs.serverTimestamp(),
  updatedBy: currentUser.uid,
});

async function onSubmit(e) {
  e.preventDefault();
  if (saving) return;
  kit.clear();
  const errs = [];
  const title = $("#f-title").value.trim(), date = $("#f-date").value, body = $("#f-body").value.trim();
  if (!title) kit.error($("#f-title"), "Skriv en rubrik.", errs);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) kit.error($("#f-date"), "Välj ett datum.", errs);
  const { links: list, any: anyLink } = readLinks($("#link-rows"), kit, errs, HTTPS, "Adressen måste börja med https://");
  if (!body && !anyLink) kit.error($("#f-body"), "Skriv en text eller lägg till minst en länk.", errs);
  if (errs.length) { kit.show(errs); return; }

  const fields = { title, date, tag: $("#f-tag").value, body, links: list, pinned: $("#f-pinned").checked, alert: $("#f-alert").checked };
  const save = $("#save-btn"), old = save.textContent, wasEdit = !!editing;
  saving = true; save.setAttribute("aria-disabled", "true"); save.textContent = "Sparar…";
  try {
    const ref = editing ? fs.doc(db, "news", editing.id) : fs.doc(fs.collection(db, "news"));
    await withTimeout(fs.setDoc(ref, stamp(fields, editing)));
    closeDialog(edDlg(), { skipReturn: true });
    await refreshNews(true);
    // Fokusmålet sätts först när listan har färsk data.
    S.focusAfter = { sel: wasEdit ? '[data-edit="' + ref.id + '"]' : null, id: ref.id, until: Date.now() + 6000 };
    renderNews();
    toast(wasEdit ? "Ändringarna är sparade" : "Nyheten är publicerad");
  } catch (err) {
    kit.show([{ msg: writeErr(err, "Nyheten") }]);
  } finally {
    saving = false; save.removeAttribute("aria-disabled"); save.textContent = old;
  }
}

/* ---------- Ta bort (med ångra) ---------- */
function askDelete(n) {
  confirmDelete({
    title: "Ta bort ”" + n.title + "”?",
    desc: "Nyheten försvinner för alla besökare. Du kan ångra direkt efteråt.",
    run: async () => {
      try {
        await withTimeout(fs.deleteDoc(fs.doc(db, "news", n.id)));
        closeDialog($("#confirm-dialog"), { skipReturn: true });
        refreshNews(true);
        const { id, title, date, tag, body, links: l, pinned, alert } = n;
        toast("Nyheten är borttagen", {
          label: "Ångra",
          run: async () => {
            try {
              await withTimeout(fs.setDoc(fs.doc(db, "news", id), stamp({ title, date, tag, body, links: l, pinned, alert }, n)));
              await refreshNews(true);
              S.focusAfter = { id, until: Date.now() + 6000 };
              renderNews();
              toast("Nyheten är återställd");
            } catch (err) { toast(writeErr(err, "Nyheten")); }
          },
        });
        requestAnimationFrame(() => $("#toast-action").focus());
      } catch (err) {
        closeDialog($("#confirm-dialog"));
        toast(writeErr(err, "Nyheten"));
      }
    },
  });
}

/* ---------- Start ---------- */
let started = null;
export function init() {
  return (started ??= (async () => {
    ({ auth, fa } = await getAuthApi());
    ({ db, fs } = await getDb());

    $("#google-btn").addEventListener("click", signInWithGoogle);
    $("#logout-btn").addEventListener("click", () => logout($("#main")));

    // Redigeraren för nyheter
    kit = formKit(edDlg());
    links = repeater($("#link-rows"), $("#add-link"), { build: (v, n) => linkRow(v, n), max: 12 });
    $("#editor-form").addEventListener("submit", onSubmit);
    initConfirm();
    // Årets lopp och resultatarkivet
    initCms({ db, fs });

    document.addEventListener("click", (e) => {
      if (!currentUser) return;
      if (e.target.closest('[data-action="new-news"]')) { openEditor(null); return; }
      const ed = e.target.closest("[data-edit]");
      if (ed) { const n = S.news.find((x) => x.id === ed.dataset.edit); if (n) openEditor(n); return; }
      const del = e.target.closest("[data-delete]");
      if (del) { const n = S.news.find((x) => x.id === del.dataset.delete); if (n) askDelete(n); }
    });

    // Fel från omdirigeringsflödet (om popup blockerades)
    fa.getRedirectResult(auth).catch(() => toast("Inloggningen misslyckades. Försök igen."));

    // Sessionen överlever omladdning. Är kontot inte (längre) admin loggas det ut tyst.
    fa.onAuthStateChanged(auth, async (user) => {
      if (!user) { if (currentUser) applyAdmin(false); else store.set(ADMIN_HINT, null); return; }
      if (await checkAdmin(user)) { if (!currentUser) applyAdmin(true, user); }
      else { await fa.signOut(auth); store.set(ADMIN_HINT, null); }
    });
  })());
}
