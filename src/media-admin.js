// Adminläget för Bilder: ladda upp bilder och filmer (dra och släpp var som helst på sidan, eller välj
// flera filer), och ändra år, text och kategori eller ta bort dem. Startas av admin.js efter inloggning.
//
// En bild förminskas i webbläsaren innan den laddas upp (högst MEDIA_LIMITS.full px, JPEG). Det tar också
// bort platsinformationen ur fotot. En liten PNG och en GIF laddas upp som de är. En film laddas upp som den
// är och får en stillbild. Filerna läggs i Cloud Storage under galleri/{id}/ och uppgifterna i media/{id}.
//
// Första gången något sparas finns bilderna från gamla bloggen bara i public/bilder/bilder.json. Då kopieras
// de till samlingen media och settings/media skrivs sist (se ensureInit), så att ingen bild försvinner.
import { $, $$, el, toast, openDialog, closeDialog, focusEl } from "./ui.js";
import { withTimeout, writeErr, field, selectField, makeDialog, confirmDelete } from "./admin-kit.js";
import { getMedia, setMedia, refreshMedia, setGalleriAdmin, showCategory, beskrivning } from "./bilder.js";
import { IMAGE_CATEGORIES, MEDIA_LIMITS as L, mediaDoc, parseYear, storagePaths, fileKind, fmtBytes, fmtDuration, fromBilderJson } from "./media.js";
import { getStorageApi, storageBucket } from "./firebase.js";

let db, fs, user = null;
const MB = 1024 * 1024;
const CACHE = "public, max-age=31536000, immutable"; // en uppladdad fil ändras aldrig, ny bild = ny mapp
const STALE = "Bilderna har just ändrats, kanske av en annan administratör. Kontrollera listan och försök igen.";
const YEAR_MSG = "skriv året med fyra siffror, till exempel 2027, eller lämna fältet tomt.";

const btn = (text, attrs = {}) => el("button", { class: "btn btn-quiet btn-sm", type: "button", ...attrs, text });
const busy = (b, on, text) => { if (on) { b._text = b.textContent; b.setAttribute("aria-disabled", "true"); b.textContent = text; } else { b.removeAttribute("aria-disabled"); b.textContent = b._text; } };
const stamp = (d) => ({ ...d, updatedAt: fs.serverTimestamp(), updatedBy: user.uid });
const mediaRef = (id) => fs.doc(db, "media", id);
const isStored = (p) => !p.startsWith("/");
/** Visar ändringen direkt och bekräftar mot Firestore i bakgrunden. */
const apply = (items) => { setMedia(items, "db"); refreshMedia(true); };

/* ---------- Första sparningen ---------- */
/**
 * Kopierar bilderna i bilder.json till samlingen media om det inte redan är gjort. Tio i taget,
 * eftersom reglerna bara får slå upp adminlistan ett begränsat antal gånger per skrivning.
 * settings/media skrivs sist, så en avbruten kopiering görs om från början nästa gång.
 * change.skip = id som inte ska kopieras (en borttagning), change.replace = en ändrad bild.
 */
async function ensureInit(change = {}) {
  const marker = await withTimeout(fs.getDoc(fs.doc(db, "settings", "media")));
  if (marker.exists()) {
    // Sidan visar bilderna i bilder.json fast Firestore redan gäller (Firestore svarade inte vid hämtningen).
    if (getMedia().source !== "db") { await refreshMedia(true); if (change.skip || change.replace) throw { code: "stale" }; }
    return;
  }
  const r = await fetch("/bilder/bilder.json");
  if (!r.ok) throw { code: "unavailable" };
  const list = fromBilderJson(await r.json())
    .filter((m) => m.id !== change.skip)
    .map((m) => (change.replace && m.id === change.replace.id ? change.replace : m));
  for (let i = 0; i < list.length; i += 10) {
    const batch = fs.writeBatch(db);
    list.slice(i, i + 10).forEach((m) => batch.set(mediaRef(m.id), stamp({ ...mediaDoc(m), createdAt: fs.serverTimestamp(), createdBy: null })));
    await withTimeout(batch.commit());
  }
  await withTimeout(fs.setDoc(fs.doc(db, "settings", "media"), stamp({ initialized: true })));
  setMedia(list, "db");
}

/* ---------- Förbereda filer i webbläsaren ---------- */
const canvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Bilden kunde inte sparas."))), type, q));

/** Förminskar till högst max px på längden, i steg om hälften för en skarpare bild. Genomskinligt blir vitt. */
function draw(src, w, h, max) {
  const s = Math.min(1, max / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * s)), th = Math.max(1, Math.round(h * s));
  let cur = src, cw = w, ch = h;
  while (cw / 2 >= tw && ch / 2 >= th) {
    const c = canvas(Math.round(cw / 2), Math.round(ch / 2));
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, c.width, c.height);
    cur = c; cw = c.width; ch = c.height;
  }
  const out = canvas(tw, th), ctx = out.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, tw, th);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, 0, 0, tw, th);
  return out;
}

function decode(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => resolve({ img, done: () => URL.revokeObjectURL(url) });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

async function prepImage(file) {
  if (file.size > L.sourceImage) throw new Error(`Bilden är större än ${L.sourceImage / MB} MB.`);
  let d;
  try { d = await decode(file); } catch { throw new Error("Bilden kunde inte läsas. Spara den som JPEG eller PNG och försök igen."); }
  try {
    const { img } = d, w = img.naturalWidth, h = img.naturalHeight, type = file.type;
    if (!w || !h) throw new Error("Bilden kunde inte läsas. Spara den som JPEG eller PNG och försök igen.");
    const keep = type === "image/gif" || (type === "image/png" && Math.max(w, h) <= L.keepPng && file.size <= L.keepPngBytes);
    let full, ext, contentType, fw = w, fh = h;
    if (keep) {
      if (file.size > L.image) throw new Error(`Bilden är större än ${L.image / MB} MB.`);
      full = file; ext = type === "image/gif" ? "gif" : "png"; contentType = type;
    } else {
      const c = draw(img, w, h, L.full);
      full = await toBlob(c, "image/jpeg", 0.88); ext = "jpg"; contentType = "image/jpeg"; fw = c.width; fh = c.height;
    }
    const mini = await toBlob(draw(img, w, h, L.mini), "image/jpeg", 0.82);
    return { full, ext, contentType, mini, width: fw, height: fh, duration: null };
  } finally { d.done(); }
}

function once(target, ok, ms) {
  return new Promise((resolve, reject) => {
    const clean = () => { clearTimeout(t); target.removeEventListener(ok, yes); target.removeEventListener("error", no); };
    const yes = () => { clean(); resolve(); }, no = () => { clean(); reject(new Error(ok)); };
    const t = setTimeout(no, ms);
    target.addEventListener(ok, yes);
    target.addEventListener("error", no);
  });
}

async function prepVideo(file) {
  if (file.size > L.video) throw new Error(`Filmen är större än ${L.video / MB} MB. Korta den, eller spara den med lägre upplösning.`);
  const cannot = "Filmen kan inte spelas i webbläsaren. Spara den som MP4 (H.264) och försök igen.";
  const url = URL.createObjectURL(file), v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto";
  try {
    const loaded = once(v, "loadeddata", 20000);
    v.src = url;
    v.play()?.then(() => v.pause()).catch(() => {}); // vissa mobiler laddar inte filmen förrän den spelas
    try { await loaded; } catch { throw new Error(cannot); }
    if (!v.videoWidth || !v.videoHeight) throw new Error(cannot);
    v.pause();
    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    const t = Math.min(1, duration / 3); // stillbild nära början, men inte den ofta svarta första rutan
    if (t > 0) { const seeked = once(v, "seeked", 10000); v.currentTime = t; await seeked.catch(() => {}); }
    const mini = await toBlob(draw(v, v.videoWidth, v.videoHeight, L.poster), "image/jpeg", 0.82);
    // Filmer från mobilen (MOV) är i praktiken MP4 och sparas som det, så att fler webbläsare spelar dem.
    const webm = file.type === "video/webm" || /\.webm$/i.test(file.name);
    return { full: file, ext: webm ? "webm" : "mp4", contentType: webm ? "video/webm" : "video/mp4", mini, width: v.videoWidth, height: v.videoHeight, duration: Math.min(Math.round(duration * 10) / 10, L.duration) };
  } finally {
    v.removeAttribute("src"); v.load(); URL.revokeObjectURL(url);
  }
}

/* ---------- Ladda upp ---------- */
let U = null, rows = [], uploading = false, cancelled = false, lastCommon = "", seq = 0, prepChain = Promise.resolve();

const setRow = (r, state, text) => { r.state = state; r.li.dataset.state = state; r.status.textContent = text; };
const live = (text) => { const l = $("#md-live"); l.textContent = ""; setTimeout(() => { l.textContent = text; }, 80); };
const count = (imgs, vids) => [imgs && `${imgs} ${imgs === 1 ? "bild" : "bilder"}`, vids && `${vids} ${vids === 1 ? "film" : "filmer"}`].filter(Boolean).join(" och ");

function makeRow(file, kind) {
  const n = ++seq, video = kind === "video";
  const r = { n, file, kind, state: "wait", prep: null, url: null, task: null };
  const year = field({ id: `md-y-${n}`, label: "År", value: $("#md-year").value.trim(), inputmode: "numeric", maxlength: "4" });
  const text = field({ id: `md-t-${n}`, label: "Text", maxlength: String(L.text) });
  r.yearInput = $("input", year); r.textInput = $("input", text);
  r.thumb = el("span", { class: "md-thumb", "aria-hidden": "true" }, el("span", { text: video ? "▶" : "…" }));
  r.status = el("p", { class: "md-status", id: `md-s-${n}`, text: "Förbereder…" });
  r.prog = el("progress", { class: "md-prog", max: "100", value: "0", hidden: true, "aria-label": "Uppladdning av " + file.name });
  r.li = el("li", { class: "md-row", "data-state": "wait" },
    r.thumb,
    el("div", { class: "md-main" },
      el("p", { class: "md-name" }, el("b", { text: file.name }), el("span", { text: `${video ? "Film" : "Bild"} · ${fmtBytes(file.size)}` })),
      el("div", { class: "md-fields" }, year, text),
      r.status, r.prog),
    el("button", { class: "icon-btn", type: "button", "data-md-remove": String(n), "aria-label": `Ta bort ${file.name} ur listan` }, "×"));
  return r;
}

// Filerna förbereds en i taget, så att många stora foton inte tar slut på minnet i en mobil.
async function prepare(r) {
  if (!rows.includes(r)) return null;
  try {
    const p = r.kind === "video" ? await prepVideo(r.file) : await prepImage(r.file);
    if (!rows.includes(r)) return null;
    r.url = URL.createObjectURL(p.mini);
    r.thumb.replaceChildren(el("img", { src: r.url, alt: "" }));
    const what = r.kind === "video" ? `Film, ${fmtDuration(p.duration)}` : `${p.width} × ${p.height} px`;
    setRow(r, "ready", `${what}. ${fmtBytes(p.full.size + p.mini.size)} att ladda upp.`);
    return p;
  } catch (e) {
    setRow(r, "error", (e && e.message) || "Filen kunde inte läsas.");
    return null;
  }
}

function updateList() {
  const n = rows.length;
  $("#md-files-group").hidden = $("#md-common").hidden = !n;
  $("#md-count").textContent = n === 1 ? "1 fil" : `${n} filer`;
  $("#md-cat").closest(".field").hidden = !rows.some((r) => r.kind === "image");
  if (!uploading) U.save.textContent = n ? `Ladda upp ${n === 1 ? "1 fil" : n + " filer"}` : "Ladda upp";
}

function addFiles(list) {
  if (!storageBucket || uploading) return;
  const skipped = [];
  for (const f of list) {
    const kind = fileKind(f);
    if (!kind) { skipped.push(`${f.name}: inte en bild eller film som går att ladda upp`); continue; }
    if (rows.some((r) => r.file.name === f.name && r.file.size === f.size && r.file.lastModified === f.lastModified)) { skipped.push(`${f.name}: finns redan i listan`); continue; }
    if (rows.length >= L.batch) { skipped.push(`${f.name}: högst ${L.batch} filer åt gången`); continue; }
    const r = makeRow(f, kind);
    rows.push(r);
    $("#md-list").append(r.li);
    r.prep = prepChain = prepChain.then(() => prepare(r));
  }
  const box = $("#md-skipped");
  box.replaceChildren(...(skipped.length
    ? [el("b", { text: skipped.length === 1 ? "En fil hoppades över:" : `${skipped.length} filer hoppades över:` }), el("ul", {}, ...skipped.map((t) => el("li", { text: t })))]
    : []));
  box.hidden = !skipped.length;
  updateList();
  const added = list.length - skipped.length;
  live([added && `${added === 1 ? "En fil" : added + " filer"} har lagts till i listan.`, skipped.length && `${skipped.length === 1 ? "En fil" : skipped.length + " filer"} hoppades över.`].filter(Boolean).join(" "));
}

function forget(r) { r.li.remove(); if (r.url) URL.revokeObjectURL(r.url); }

function removeRow(r) {
  const i = rows.indexOf(r);
  if (i < 0 || uploading) return;
  rows.splice(i, 1);
  forget(r);
  updateList();
  const next = rows[i] || rows[i - 1];
  (next ? $("[data-md-remove]", next.li) : $("#md-pick")).focus();
}

function clearRows() { rows.forEach(forget); rows = []; updateList(); }

function putFile(st, storage, path, blob, contentType, r, offset, total) {
  return new Promise((resolve, reject) => {
    const task = st.uploadBytesResumable(st.ref(storage, path), blob, { contentType, cacheControl: CACHE });
    r.task = task;
    task.on("state_changed",
      (s) => { const pct = Math.round(((offset + s.bytesTransferred) / total) * 100); r.prog.value = pct; r.status.textContent = `Laddar upp … ${pct} %`; },
      (e) => { r.task = null; reject(e); },
      () => { r.task = null; resolve(); });
  });
}

function uploadErr(e) {
  const code = e && e.code;
  if (code === "storage/canceled") return "Avbruten. Välj Ladda upp för att försöka igen.";
  if (code === "storage/unauthorized" || code === "permission-denied") return "Uppladdningen nekades. Kontrollera att du fortfarande är administratör. Händer det igen: se steg 10 i docs/driftsattning.md.";
  if (code === "storage/quota-exceeded") return "Lagringsutrymmet i Firebase är fullt.";
  if (code === "storage/retry-limit-exceeded" || code === "storage/unknown") return "Ingen kontakt med Firebase. Kontrollera anslutningen och försök igen.";
  return writeErr(e, "Filen");
}

async function uploadRow(r, category) {
  const p = await r.prep;
  if (!p || cancelled || !rows.includes(r)) return null;
  const ref = fs.doc(fs.collection(db, "media")), paths = storagePaths(ref.id, r.kind, p.ext);
  const total = p.full.size + p.mini.size, uploaded = [];
  let st, storage, stage = "files";
  setRow(r, "uploading", "Laddar upp … 0 %");
  r.prog.value = 0; r.prog.hidden = false;
  try {
    ({ st, storage } = await getStorageApi());
    await putFile(st, storage, paths.file, p.full, p.contentType, r, 0, total);
    uploaded.push(paths.file);
    if (cancelled) throw { code: "storage/canceled" };
    await putFile(st, storage, paths.thumb, p.mini, "image/jpeg", r, p.full.size, total);
    uploaded.push(paths.thumb);
    const item = {
      id: ref.id, type: r.kind, category: r.kind === "video" ? "filmer" : category,
      year: parseYear(r.yearInput.value), text: r.textInput.value.trim().slice(0, L.text),
      file: paths.file, thumb: paths.thumb, width: p.width, height: p.height, duration: p.duration,
    };
    stage = "doc";
    await withTimeout(fs.setDoc(ref, stamp({ ...mediaDoc(item), createdAt: fs.serverTimestamp(), createdBy: user.uid })));
    r.prog.hidden = true;
    setRow(r, "done", "Uppladdad.");
    return { ...item, created: Date.now(), createdAt: null, createdBy: user.uid };
  } catch (e) {
    r.prog.hidden = true;
    // Ta bort filer som hann laddas upp, så att inget ligger kvar utan att synas. Dröjer bara svaret
    // från Firestore kan bilden ändå ha sparats, och då får filerna ligga kvar.
    if (st && !(stage === "doc" && e && e.code === "deadline")) uploaded.forEach((path) => st.deleteObject(st.ref(storage, path)).catch(() => {}));
    setRow(r, cancelled || (e && e.code === "storage/canceled") ? "ready" : "error", cancelled ? uploadErr({ code: "storage/canceled" }) : uploadErr(e));
    return null;
  }
}

async function pool(items, n, fn) {
  let i = 0;
  const worker = async () => { while (i < items.length && !cancelled) await fn(items[i++]); };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

function cancelUpload() {
  if (cancelled) return;
  cancelled = true;
  rows.forEach((r) => r.task && r.task.cancel());
  live("Uppladdningen avbryts.");
}

async function onUpload(ev) {
  ev.preventDefault();
  if (uploading) return;
  const K = U.kit, errs = [];
  K.clear();
  const todo = rows.filter((r) => r.state !== "done");
  if (!todo.length) { K.show([{ msg: "Dra hit eller välj minst en bild eller film." }]); return; }
  const common = $("#md-year");
  if (Number.isNaN(parseYear(common.value))) K.error(common, "År för alla filer: " + YEAR_MSG, errs);
  todo.forEach((r) => { if (Number.isNaN(parseYear(r.yearInput.value))) K.error(r.yearInput, `${r.file.name}: ${YEAR_MSG}`, errs); });
  if (errs.length) { K.show(errs); return; }

  uploading = true; cancelled = false;
  U.dlg.dataset.busy = "true";
  busy(U.save, true, "Laddar upp…");
  U.cancel.textContent = "Avbryt uppladdningen";
  const category = $("#md-cat").value, added = [];
  let failure = null;
  try {
    await ensureInit();
    await pool(todo, 2, async (r) => {
      const item = await uploadRow(r, category);
      if (item) { added.push(item); live(`${added.length} av ${todo.length} uppladdade.`); }
    });
  } catch (e) {
    failure = e && e.code === "stale" ? STALE : writeErr(e, "Bilderna");
  } finally {
    uploading = false;
    delete U.dlg.dataset.busy;
    busy(U.save, false);
    U.cancel.textContent = "Avbryt";
  }

  if (added.length) apply([...getMedia().items.filter((m) => !added.some((a) => a.id === m.id)), ...added]);
  rows.filter((r) => r.state === "done").forEach(forget);
  rows = rows.filter((r) => r.state !== "done");
  updateList();
  const imgs = added.filter((m) => m.type === "image").length, vids = added.length - imgs;
  const doneText = added.length ? `${count(imgs, vids)} ${added.length === 1 ? "är uppladdad" : "är uppladdade"}` : "";

  if (!rows.length && added.length) {
    K.snapshot();
    closeDialog(U.dlg, { target: $("#bilder-h") });
    showCategory(vids && imgs ? "alla" : vids ? "filmer" : category);
    toast(doneText);
    return;
  }
  if (failure) { K.show([{ msg: failure }]); return; }
  const failed = rows.filter((r) => r.state === "error").length;
  if (failed) {
    K.show([{ msg: `${failed === 1 ? "En fil" : failed + " filer"} kunde inte laddas upp. Felet står vid filen. Ta bort den ur listan eller försök igen.${doneText ? " " + doneText + "." : ""}` }]);
  } else if (cancelled) {
    live(`Uppladdningen avbröts.${doneText ? " " + doneText + "." : ""}`);
    U.save.focus();
  }
}

function buildUpload() {
  U = makeDialog("media-dialog", "Ladda upp bilder och filmer", "Ladda upp");
  $(".discard p", U.dlg).textContent = "Stäng utan att ladda upp? Filerna i listan laddas inte upp.";
  const input = el("input", { type: "file", id: "md-files", multiple: true, hidden: true, accept: "image/*,.heic,.heif,video/mp4,video/webm,video/quicktime,.mov,.m4v" });
  const pick = el("button", { class: "btn btn-primary btn-sm", type: "button", id: "md-pick", "aria-describedby": "md-drop-hint", text: "Välj filer" });
  const off = storageBucket ? null : el("p", { class: "login-msg", "data-kind": "error",
    text: "Uppladdning är inte påslagen än, eftersom Cloud Storage inte är inställt för sajten. Se steg 10 i docs/driftsattning.md. Bilderna som redan finns kan du ändra och ta bort under Bilder." });
  U.body.append(...[
    el("p", { class: "note", text: "Bilderna och filmerna syns direkt under Bilder på startsidan. År och text är frivilliga." }),
    off,
    el("div", { class: "drop", id: "md-drop", hidden: !storageBucket },
      el("b", { text: "Dra hit bilder och filmer" }),
      el("span", { text: "eller" }),
      pick,
      el("span", { class: "hint", id: "md-drop-hint",
        text: `Du kan välja flera filer på en gång, högst ${L.batch}. Bilder: JPEG, PNG, GIF, WebP eller HEIC. Stora bilder förminskas till ${L.full} pixlar. Filmer: MP4 eller WebM, högst ${L.video / MB} MB. Filmer från mobilen fungerar oftast också.` })),
    input,
    el("div", { class: "md-skipped", id: "md-skipped", hidden: true }),
    el("fieldset", { class: "group", id: "md-common", hidden: true }, el("legend", { text: "Gäller alla filer" }),
      el("div", { class: "row2" },
        field({ id: "md-year", label: "År", inputmode: "numeric", maxlength: "4", hint: "Fylls i på alla filer nedan. Du kan ändra året på en enskild fil." }),
        selectField({ id: "md-cat", label: "Kategori för bilderna", options: IMAGE_CATEGORIES, value: "foton" })),
      el("span", { class: "hint", text: "Filmerna hamnar under Filmer." })),
    el("fieldset", { class: "group", id: "md-files-group", hidden: true }, el("legend", { id: "md-count" }),
      el("ul", { class: "md-list", id: "md-list", "aria-labelledby": "md-count" })),
    el("p", { class: "sr-only", id: "md-live", "aria-live": "polite" }),
  ].filter(Boolean));
  if (off) U.save.hidden = true;

  pick.addEventListener("click", () => input.click());
  input.addEventListener("change", () => { addFiles([...input.files]); input.value = ""; });
  $("#md-year").addEventListener("input", (e) => {
    const v = e.target.value.trim();
    rows.forEach((r) => { if (r.state !== "done" && r.yearInput.value.trim() === lastCommon) r.yearInput.value = v; });
    lastCommon = v;
  });
  $("#md-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-md-remove]");
    if (b) removeRow(rows.find((r) => String(r.n) === b.dataset.mdRemove));
  });
  U.form.addEventListener("submit", onUpload);

  // Under uppladdningen: Avbryt och × avbryter uppladdningen, Esc gör ingenting.
  const kitClose = U.dlg._beforeClose;
  U.dlg._beforeClose = () => { if (uploading) { cancelUpload(); return false; } return kitClose(); };
  U.dlg.addEventListener("cancel", (e) => {
    if (!uploading) return;
    e.preventDefault(); e.stopImmediatePropagation();
    live("Uppladdningen pågår. Välj Avbryt uppladdningen om du vill avbryta.");
  }, true);
  U.dlg.addEventListener("close", () => { if (!uploading) clearRows(); });
}

/** Öppnar uppladdningen, eventuellt med filer som släppts på sidan. */
function openUpload(files) {
  if (!U.dlg.open) {
    U.kit.clear();
    clearRows();
    $("#md-year").value = ""; lastCommon = "";
    $("#md-cat").value = "foton";
    $("#md-skipped").hidden = true;
    U.kit.snapshot();
    openDialog(U.dlg, "#bilder-h");
    if (U.dlg._return === document.body) U.dlg._return = null; // filerna släpptes på sidan: fokus till Bilder efteråt
    (storageBucket ? $("#md-pick") : U.cancel).focus();
  }
  if (files && files.length) addFiles([...files]);
}

/* ---------- Dra och släpp var som helst på sidan ---------- */
function initDrop() {
  const hint = el("div", { class: "drop-hint", hidden: true, "aria-hidden": "true" }, el("span", { text: "Släpp filerna för att ladda upp dem till Bilder" }));
  document.body.append(hint);
  const hasFiles = (e) => [...((e.dataTransfer && e.dataTransfer.types) || [])].includes("Files");
  const otherDialog = () => $$("dialog[open]").some((d) => d !== U.dlg);
  let timer = 0;
  const off = () => { hint.hidden = true; $("#md-drop").classList.remove("is-over"); };
  window.addEventListener("dragover", (e) => {
    if (!user || !hasFiles(e)) return;
    e.preventDefault(); // annars öppnar webbläsaren filen och lämnar sidan
    if (otherDialog() || uploading) { e.dataTransfer.dropEffect = "none"; return; }
    e.dataTransfer.dropEffect = "copy";
    if (U.dlg.open) $("#md-drop").classList.add("is-over"); else hint.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(off, 250); // dragover kommer hela tiden medan filerna hålls över sidan
  });
  window.addEventListener("drop", (e) => {
    if (!user || !hasFiles(e)) return;
    e.preventDefault();
    off();
    if (!otherDialog() && !uploading) openUpload(e.dataTransfer.files);
  });
}

/* ---------- Ändra ---------- */
let E = null, editing = null, savingEdit = false;

function buildEdit() {
  E = makeDialog("media-edit-dialog", "Redigera bild");
  E.preview = el("img", { alt: "" });
  E.body.append(
    el("figure", { class: "md-preview" }, E.preview),
    el("div", { class: "row2" },
      field({ id: "me-year", label: "År", inputmode: "numeric", maxlength: "4", hint: "Frivilligt. Fyra siffror, till exempel 2027." }),
      selectField({ id: "me-cat", label: "Kategori", options: IMAGE_CATEGORIES, value: "foton" })),
    field({ id: "me-text", label: "Text", maxlength: String(L.text), hint: "Frivillig. Visas under bilden och i helskärmsvisningen." }),
  );
  E.form.addEventListener("submit", onEditSubmit);
}

function openEdit(m) {
  editing = m;
  const video = m.type === "video";
  E.kit.clear();
  $("#media-edit-dialog-h").textContent = video ? "Redigera film" : "Redigera bild";
  E.preview.src = m.mini;
  $("#me-year").value = m.year ?? "";
  $("#me-text").value = m.text;
  $("#me-cat").value = video ? "foton" : m.category;
  $("#me-cat").closest(".field").hidden = video;
  E.kit.snapshot();
  openDialog(E.dlg, `[data-media-edit="${m.id}"]`);
  $("#me-year").focus();
}

async function onEditSubmit(ev) {
  ev.preventDefault();
  if (savingEdit) return;
  const K = E.kit, errs = [], m = editing, vad = m.type === "video" ? "Filmen" : "Bilden";
  K.clear();
  const year = parseYear($("#me-year").value);
  if (Number.isNaN(year)) K.error($("#me-year"), "År: " + YEAR_MSG, errs);
  if (errs.length) { K.show(errs); return; }
  const next = { ...m, year, text: $("#me-text").value.trim().slice(0, L.text), category: m.type === "video" ? "filmer" : $("#me-cat").value };
  savingEdit = true; busy(E.save, true, "Sparar…");
  try {
    if (getMedia().source === "db") await withTimeout(fs.updateDoc(mediaRef(m.id), stamp({ year: next.year, text: next.text, category: next.category })));
    else await ensureInit({ replace: next });
    apply(getMedia().items.map((x) => (x.id === m.id ? next : x)));
    // Rutnätet ritas om, så knappen letas upp först när dialogen har stängts.
    closeDialog(E.dlg, { skipReturn: true });
    requestAnimationFrame(() => focusEl($(`[data-media-edit="${m.id}"]`) || $("#bilder-h")));
    toast("Ändringarna är sparade");
  } catch (e) {
    const code = e && e.code;
    K.show([{ msg: code === "stale" ? STALE : code === "not-found" ? `${vad} finns inte längre. Den kan ha tagits bort av en annan administratör.` : writeErr(e, vad) }]);
  } finally {
    savingEdit = false; busy(E.save, false);
  }
}

/* ---------- Ta bort (med ångra) ---------- */
async function removeFiles(paths) {
  if (!paths.length) return;
  try {
    const { storage, st } = await getStorageApi();
    await Promise.all(paths.map((p) => st.deleteObject(st.ref(storage, p)).catch((e) => { if (!e || e.code !== "storage/object-not-found") throw e; })));
  } catch { /* filen ligger kvar i Storage, men syns inte på sajten */ }
}

function askDelete(m) {
  const vad = m.type === "video" ? "Filmen" : "Bilden";
  confirmDelete({
    title: `Ta bort ${beskrivning(m)}?`,
    desc: `${vad} försvinner för alla besökare. Du kan ångra direkt efteråt.`,
    run: async () => {
      try {
        if (getMedia().source === "db") await withTimeout(fs.deleteDoc(mediaRef(m.id)));
        else await ensureInit({ skip: m.id });
        apply(getMedia().items.filter((x) => x.id !== m.id));
        closeDialog($("#confirm-dialog"), { skipReturn: true });
        // Filerna i Storage tas bort först när det inte längre går att ångra.
        const files = [m.file, m.thumb].filter(isStored);
        toast(`${vad} är borttagen`, {
          label: "Ångra",
          returnTo: "#bilder-h",
          onDismiss: () => removeFiles(files),
          run: async () => {
            try {
              await withTimeout(fs.setDoc(mediaRef(m.id), stamp({ ...mediaDoc(m), createdAt: m.createdAt || fs.serverTimestamp(), createdBy: m.createdBy ?? null })));
              apply([...getMedia().items, m]);
              focusEl($(`[data-media-edit="${m.id}"]`) || $("#bilder-h"));
              toast(`${vad} är återställd`);
            } catch (e) { removeFiles(files); toast(writeErr(e, vad)); }
          },
        });
        requestAnimationFrame(() => $("#toast-action").focus());
      } catch (e) {
        closeDialog($("#confirm-dialog"));
        toast(e && e.code === "stale" ? STALE : writeErr(e, vad));
      }
    },
  });
}

/* ---------- Knappar på korten ---------- */
const decorate = (li, m) => li.append(el("div", { class: "galleri-admin" },
  btn("Redigera", { "data-media-edit": m.id, "aria-label": "Redigera " + beskrivning(m) }),
  btn("Ta bort", { "data-media-delete": m.id, "aria-label": "Ta bort " + beskrivning(m) })));

/* ---------- Start ---------- */
export function initMedia(api) {
  ({ db, fs } = api);
  buildUpload();
  buildEdit();
  initDrop();
  document.addEventListener("click", (e) => {
    if (!user) return;
    const t = e.target.closest("[data-action='add-media'], [data-media-edit], [data-media-delete]");
    if (!t) return;
    if (t.dataset.action === "add-media") { openUpload(); return; }
    const m = getMedia().items.find((x) => x.id === (t.dataset.mediaEdit || t.dataset.mediaDelete));
    if (!m) return;
    if (t.dataset.mediaEdit) openEdit(m); else askDelete(m);
  });
}

/** Anropas av admin.js när någon loggar in eller ut. */
export function setMediaAdmin(u) {
  user = u;
  setGalleriAdmin(u ? { decorate } : null);
}
