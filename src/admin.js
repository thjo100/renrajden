// Administratörer: Google-inloggning (Firebase Auth) och hantering av nyheter.
// Laddas bara när någon klickar på "Logga in som administratör", eller när enheten
// redan har en admin-session (se ADMIN_HINT i main.js).
//
// Behörighet: ett Google-konto är administratör om dokumentet admins/{e-post i gemener}
// finns i Firestore. Säkerhetsreglerna (firestore.rules) kontrollerar samma sak på servern,
// så knapparna här är bara bekvämlighet – det är reglerna som stoppar obehöriga.
import { $, $$, el, store, todayIso, safeUrl, focusEl, toast, openDialog, closeDialog } from "./ui.js";
import { S, refreshNews, renderNews, setAdminMode } from "./news.js";
import { getAuthApi, getDb } from "./firebase.js";

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
const rows = () => $("#link-rows");
let linkSeq = 0, edInitial = "", saving = false, editing = null;

function addLinkRow(label = "", url = "") {
  const i = ++linkSeq;
  const row = el("div", { class: "link-row" },
    el("div", { class: "field" }, el("label", { for: "l-label-" + i, text: "Länktext" }), el("input", { type: "text", id: "l-label-" + i, maxlength: "80", value: label })),
    el("div", { class: "field" }, el("label", { for: "l-url-" + i, text: "Adress" }), el("input", { type: "url", id: "l-url-" + i, inputmode: "url", placeholder: "https://", value: url, "aria-describedby": "l-url-err-" + i }), el("span", { class: "err", id: "l-url-err-" + i, hidden: true })),
    el("button", { class: "icon-btn", type: "button", "aria-label": "Ta bort länk", "data-remove-link": "" }, "×"));
  rows().append(row);
  return row;
}

const formState = () => JSON.stringify([$("#f-title").value, $("#f-date").value, $("#f-tag").value, $("#f-body").value, $("#f-pinned").checked, $("#f-alert").checked, ...$$("input", rows()).map((i) => i.value)]);
const showDiscard = () => { $("#discard").hidden = false; $("#discard-keep").focus(); };
const hideDiscard = (refocus) => { $("#discard").hidden = true; if (refocus) $("#f-title").focus(); };

function clearErrors() {
  const form = $("#editor-form");
  $("#error-summary").hidden = true; $("#error-list").replaceChildren();
  $$("[aria-invalid]", form).forEach((i) => i.removeAttribute("aria-invalid"));
  $$(".err", form).forEach((e) => { e.hidden = true; e.textContent = ""; });
}

function openEditor(n) {
  editing = n || null;
  clearErrors(); $("#discard").hidden = true;
  $("#editor-h").textContent = n ? "Redigera nyhet" : "Ny nyhet";
  $("#save-btn").textContent = n ? "Spara ändringar" : "Publicera";
  $("#f-title").value = n ? n.title : "";
  $("#f-date").value = n ? n.date : todayIso();
  $("#f-tag").value = n ? n.tag : "Info";
  $("#f-body").value = n ? n.body : "";
  $("#f-pinned").checked = !!(n && n.pinned);
  $("#f-alert").checked = !!(n && n.alert);
  rows().replaceChildren();
  (n && n.links.length ? n.links : [{ label: "", url: "" }]).forEach((l) => addLinkRow(l.label, l.url));
  edInitial = formState();
  if (n) S.openIds.add(n.id);
  openDialog(edDlg(), n ? '[data-edit="' + n.id + '"]' : null);
  $("#f-title").focus();
}

const fieldError = (input, errEl, msg, list) => { input.setAttribute("aria-invalid", "true"); errEl.textContent = msg; errEl.hidden = false; list.push({ id: input.id, msg }); };
const writeErr = (e) => {
  const code = e && e.code;
  if (code === "permission-denied") return "Ändringen nekades. Ditt konto har inte administratörsbehörighet längre.";
  if (code === "invalid-argument") return "Nyheten kunde inte sparas eftersom något fält har fel format.";
  if (code === "resource-exhausted") return "För många ändringar på kort tid. Vänta en stund och försök igen.";
  if (code === "deadline") return "Svaret dröjer. Kontrollera om ändringen syns i listan innan du försöker igen.";
  return "Det gick inte att spara just nu. Kontrollera anslutningen och försök igen.";
};
function showErrors(msgs) {
  const list = $("#error-list");
  msgs.forEach((x) => list.append(el("li", {}, x.id ? el("a", { href: "#" + x.id, text: x.msg }) : x.msg)));
  $("#error-summary").hidden = false; $("#error-summary").focus();
}

// Skrivningar som inte fått svar efter 15 s räknas som osäkra (de kan ändå ha gått igenom).
const withTimeout = (p) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject({ code: "deadline" }), 15000))]);

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
  clearErrors(); $("#discard").hidden = true;
  const errs = [];
  const title = $("#f-title").value.trim(), date = $("#f-date").value, body = $("#f-body").value.trim();
  if (!title) fieldError($("#f-title"), $("#f-title-err"), "Skriv en rubrik.", errs);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fieldError($("#f-date"), $("#f-date-err"), "Välj ett datum.", errs);
  const links = []; let anyLink = false;
  $$(".link-row", rows()).forEach((row) => {
    const [lab, url] = $$("input", row); const errEl = $(".err", row);
    const L = lab.value.trim(), U = url.value.trim();
    if (!L && !U) return;
    anyLink = true;
    if (!safeUrl(U)) { fieldError(url, errEl, U ? "Adressen måste börja med https://" : "Skriv adressen till länken.", errs); return; }
    links.push({ label: L || U.replace(/^https:\/\//, "").split("/")[0], url: U });
  });
  if (!body && !anyLink) fieldError($("#f-body"), $("#f-body-err"), "Skriv en text eller lägg till minst en länk.", errs);
  if (errs.length) { showErrors(errs); return; }

  const fields = { title, date, tag: $("#f-tag").value, body, links, pinned: $("#f-pinned").checked, alert: $("#f-alert").checked };
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
    showErrors([{ msg: writeErr(err) }]);
  } finally {
    saving = false; save.removeAttribute("aria-disabled"); save.textContent = old;
  }
}

/* ---------- Ta bort (med ångra) ---------- */
let pendingDelete = null, deleting = false;
async function onConfirmDelete() {
  const n = pendingDelete;
  if (!n || deleting) return;
  const btn = $("#confirm-delete");
  deleting = true; btn.setAttribute("aria-disabled", "true");
  try {
    await withTimeout(fs.deleteDoc(fs.doc(db, "news", n.id)));
    closeDialog($("#confirm-dialog"), { skipReturn: true });
    refreshNews(true);
    const { id, title, date, tag, body, links, pinned, alert } = n;
    toast("Nyheten är borttagen", {
      label: "Ångra",
      run: async () => {
        try {
          await withTimeout(fs.setDoc(fs.doc(db, "news", id), stamp({ title, date, tag, body, links, pinned, alert }, n)));
          await refreshNews(true);
          S.focusAfter = { id, until: Date.now() + 6000 };
          renderNews();
          toast("Nyheten är återställd");
        } catch (err) { toast(writeErr(err)); }
      },
    });
    requestAnimationFrame(() => $("#toast-action").focus());
  } catch (err) {
    closeDialog($("#confirm-dialog"));
    toast(writeErr(err));
  } finally {
    deleting = false; btn.removeAttribute("aria-disabled"); pendingDelete = null;
  }
}

/* ---------- Start ---------- */
let started = null;
export function init() {
  return (started ??= (async () => {
    ({ auth, fa } = await getAuthApi());
    ({ db, fs } = await getDb());

    $("#google-btn").addEventListener("click", signInWithGoogle);
    $("#logout-btn").addEventListener("click", () => logout($("#main")));

    // Redigeraren
    rows().addEventListener("click", (e) => {
      const b = e.target.closest("[data-remove-link]");
      if (!b) return;
      const row = b.closest(".link-row"), next = row.nextElementSibling || row.previousElementSibling;
      row.remove();
      (next ? next.querySelector("input") : $("#add-link")).focus();
    });
    $("#add-link").addEventListener("click", () => addLinkRow().querySelector("input").focus());
    edDlg()._beforeClose = () => { if (formState() !== edInitial) { showDiscard(); return false; } return true; };
    edDlg().addEventListener("cancel", (e) => {
      if (formState() === edInitial) return;
      e.preventDefault();
      $("#discard").hidden ? showDiscard() : hideDiscard(true);
    });
    $("#discard-keep").addEventListener("click", () => hideDiscard(true));
    $("#discard-yes").addEventListener("click", () => { $("#discard").hidden = true; edDlg().close(); });
    $("#editor-form").addEventListener("submit", onSubmit);
    $("#error-list").addEventListener("click", (e) => {
      const a = e.target.closest("a"); if (!a) return;
      e.preventDefault();
      const t = document.getElementById(a.getAttribute("href").slice(1)); if (t) t.focus();
    });
    $("#confirm-delete").addEventListener("click", onConfirmDelete);

    document.addEventListener("click", (e) => {
      if (!currentUser) return;
      if (e.target.closest('[data-action="new-news"]')) { openEditor(null); return; }
      const ed = e.target.closest("[data-edit]");
      if (ed) { const n = S.news.find((x) => x.id === ed.dataset.edit); if (n) openEditor(n); return; }
      const del = e.target.closest("[data-delete]");
      if (del) {
        pendingDelete = S.news.find((x) => x.id === del.dataset.delete) || null;
        if (pendingDelete) { $("#confirm-h").textContent = "Ta bort ”" + pendingDelete.title + "”?"; openDialog($("#confirm-dialog")); }
      }
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
