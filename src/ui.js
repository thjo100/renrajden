// Gemensamma hjälpfunktioner: DOM, format, fokus, skärmläsarannonser, toast och dialoger.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "text") n.textContent = v; else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids) if (k != null) n.append(k);
  return n;
};

export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* privat läge */ } },
};

export const fmtDate = (iso) => {
  try { return new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso + "T12:00:00")); }
  catch { return iso; }
};
export const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const safeUrl = (u) => (typeof u === "string" && /^https:\/\/[^\s<>"]+$/i.test(u.trim()) ? u.trim() : null);

export const FOCUSABLE = "a[href],button,summary,input,select,textarea,[tabindex]";
export const focusEl = (t) => {
  if (!t) return false;
  if (!t.matches(FOCUSABLE)) t.setAttribute("tabindex", "-1");
  t.focus();
  return document.activeElement === t;
};

export const announce = (text) => {
  const live = $("#sr-live");
  live.textContent = "";
  setTimeout(() => { live.textContent = text; }, 80);
};

/* ---------- Toast: pausar när den har fokus eller hovras ---------- */
let toastTimer = 0;
let toastAction = null;
export function hideToast() {
  const toastEl = $("#toast");
  const hadFocus = toastEl.contains(document.activeElement);
  toastEl.hidden = true; toastAction = null; clearTimeout(toastTimer);
  if (hadFocus) focusEl($("#news-h"));
}
function armToast(ms) {
  const toastEl = $("#toast");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    (toastEl.contains(document.activeElement) || toastEl.matches(":hover")) ? armToast(3000) : hideToast();
  }, ms);
}
export function toast(text, action) {
  const toastEl = $("#toast"), btn = $("#toast-action");
  $("#toast-text").textContent = text;
  toastAction = action ? action.run : null;
  btn.hidden = !action;
  if (action) btn.textContent = action.label;
  toastEl.hidden = false;
  announce(text);
  armToast(action ? 10000 : 5000);
}
export function initToast() {
  const toastEl = $("#toast");
  toastEl.addEventListener("focusout", (e) => { if (!toastEl.contains(e.relatedTarget)) armToast(5000); });
  toastEl.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); hideToast(); } });
  $("#toast-action").addEventListener("click", () => { const run = toastAction; hideToast(); if (run) run(); });
  $("#toast-close").addEventListener("click", hideToast);
}

/* ---------- Dialoger ---------- */
// Fokus återgår till det som öppnade dialogen, utom när en åtgärd själv bestämmer målet.
export function openDialog(dlg, returnSel) {
  dlg._return = document.activeElement;
  dlg._returnSel = returnSel || null;
  dlg._skip = false;
  dlg.showModal();
}
export function closeDialog(dlg, opts = {}) {
  if (opts.skipReturn) dlg._skip = true;
  if (opts.target) { dlg._return = opts.target; dlg._returnSel = null; }
  dlg.close();
}
export function initDialogs() {
  $$("dialog").forEach((d) => {
    d.addEventListener("close", () => {
      if (d._skip) { d._skip = false; return; }
      const r = d._return, sel = d._returnSel;
      d._return = d._returnSel = null;
      requestAnimationFrame(() => focusEl((r && document.contains(r) && r) || (sel && $(sel)) || $("#news-h")));
    });
    d.addEventListener("click", (e) => {
      if (!e.target.closest("[data-close]")) return;
      if (typeof d._beforeClose === "function" && d._beforeClose() === false) return;
      d.close();
    });
  });
}
