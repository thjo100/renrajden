// Gemensamt för adminformulären (nyheter, årets lopp, resultatarkivet): felsammanfattning,
// fältfel, varning för osparade ändringar, rader som går att lägga till och ta bort,
// bekräfta borttagning och felmeddelanden vid sparning. Laddas bara för administratörer.
import { $, $$, el, openDialog } from "./ui.js";

// Skrivningar som inte fått svar efter 15 s räknas som osäkra (de kan ändå ha gått igenom).
export const withTimeout = (p) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject({ code: "deadline" }), 15000))]);

/** Felmeddelande vid misslyckad sparning. what = "Nyheten", "Årets lopp" osv. */
export function writeErr(e, what = "Ändringen") {
  const code = e && e.code;
  if (code === "permission-denied") return "Ändringen nekades. Ditt konto har inte administratörsbehörighet längre.";
  if (code === "invalid-argument") return `${what} kunde inte sparas eftersom något fält har fel format.`;
  if (code === "resource-exhausted") return "För många ändringar på kort tid. Vänta en stund och försök igen.";
  if (code === "deadline") return "Svaret dröjer. Kontrollera om ändringen syns på sidan innan du försöker igen.";
  return "Det gick inte att spara just nu. Kontrollera anslutningen och försök igen.";
}

let seq = 0;
/** Unikt löpnummer för id:n i rader som läggs till. */
export const nextId = () => ++seq;

/**
 * Ett fält med etikett, hjälptext och felrad. Felraden har id = fältets id + "-err",
 * vilket formKit().error() förutsätter.
 */
export function field({ id, label, type = "text", value = "", hint, textarea = false, cls, ...attrs }) {
  const describedBy = [hint ? id + "-hint" : null, id + "-err"].filter(Boolean).join(" ");
  const input = textarea
    ? el("textarea", { id, class: cls, "aria-describedby": describedBy, ...attrs })
    : el("input", { type, id, value, class: cls, "aria-describedby": describedBy, ...attrs });
  if (textarea) input.value = value;
  return el("div", { class: "field" },
    el("label", { for: id, text: label }),
    hint ? el("span", { class: "hint", id: id + "-hint", text: hint }) : null,
    input,
    el("span", { class: "err", id: id + "-err", hidden: true }));
}

/** En rullista. options = [[värde, text], …] */
export function selectField({ id, label, options, value }) {
  const sel = el("select", { id, "aria-describedby": id + "-err" }, ...options.map(([v, t]) => el("option", { value: v, text: t })));
  sel.value = value;
  return el("div", { class: "field" }, el("label", { for: id, text: label }), sel, el("span", { class: "err", id: id + "-err", hidden: true }));
}

/** Felsammanfattning och "Stäng utan att spara?" som visas i dialogen. */
export function dialogParts(prefix) {
  return {
    summary: el("div", { class: "error-summary", role: "group", "aria-labelledby": prefix + "-err-h", tabindex: "-1", hidden: true },
      el("b", { id: prefix + "-err-h", text: "Rätta följande:" }), el("ul", { class: "error-list" })),
    discard: el("div", { class: "discard", hidden: true },
      el("p", { role: "alert", text: "Stäng utan att spara? Det du har ändrat försvinner." }),
      el("div", { class: "discard-btns" },
        el("button", { class: "btn btn-quiet btn-sm", type: "button", "data-discard-keep": "", text: "Fortsätt redigera" }),
        el("button", { class: "btn btn-red btn-sm", type: "button", "data-discard-yes": "", text: "Stäng utan att spara" }))),
  };
}

/**
 * Felhantering och skydd mot att osparad text försvinner, för en dialog med ett formulär.
 * Dialogen ska innehålla .error-summary med .error-list och .discard med knapparna
 * [data-discard-keep] och [data-discard-yes] (se dialogParts).
 */
export function formKit(dlg) {
  const form = $("form", dlg), summary = $(".error-summary", dlg), list = $(".error-list", dlg), discard = $(".discard", dlg);
  let initial = "";
  const state = () => JSON.stringify($$("input, select, textarea", form).map((i) => (i.type === "checkbox" || i.type === "radio" ? i.checked : i.value)));
  const firstField = () => $$("input:not([readonly]), select, textarea", form)[0];
  const showDiscard = () => { discard.hidden = false; $("[data-discard-keep]", discard).focus(); };
  const hideDiscard = (refocus) => { discard.hidden = true; if (refocus) firstField()?.focus(); };

  dlg._beforeClose = () => { if (state() !== initial) { showDiscard(); return false; } return true; };
  dlg.addEventListener("cancel", (e) => {
    if (state() === initial) return;
    e.preventDefault();
    discard.hidden ? showDiscard() : hideDiscard(true);
  });
  $("[data-discard-keep]", discard).addEventListener("click", () => hideDiscard(true));
  $("[data-discard-yes]", discard).addEventListener("click", () => { discard.hidden = true; dlg.close(); });
  list.addEventListener("click", (e) => {
    const a = e.target.closest("a"); if (!a) return;
    e.preventDefault();
    document.getElementById(a.getAttribute("href").slice(1))?.focus();
  });

  return {
    form,
    firstField,
    /** Anropas när formuläret är ifyllt, innan dialogen öppnas. */
    snapshot() { initial = state(); },
    clear() {
      summary.hidden = true; list.replaceChildren(); discard.hidden = true;
      $$("[aria-invalid]", form).forEach((i) => i.removeAttribute("aria-invalid"));
      $$(".err", form).forEach((e) => { e.hidden = true; e.textContent = ""; });
    },
    /** Markerar ett fält som fel och lägger felet i listan errs. */
    error(input, msg, errs) {
      input.setAttribute("aria-invalid", "true");
      const errEl = document.getElementById(input.id + "-err");
      if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
      errs.push({ id: input.id, msg });
    },
    /** Visar felsammanfattningen och flyttar fokus dit. */
    show(errs) {
      errs.forEach((x) => list.append(el("li", {}, x.id ? el("a", { href: "#" + x.id, text: x.msg }) : x.msg)));
      summary.hidden = false; summary.focus();
    },
  };
}

/**
 * Rader som går att lägga till och ta bort (länkar, distanser, segrare, partners).
 * build(values, n) skapar en rad. Raden ska ha en knapp med attributet data-remove-row.
 * Knappar med data-move="up" eller data-move="down" flyttar raden ett steg. Fokus stannar på
 * knappen, eller på den andra flyttknappen om raden hamnat först eller sist. onMove(row, rows)
 * anropas efter flytten, t.ex. för att läsa upp var raden hamnade.
 * onChange(rows) anropas efter varje ändring, t.ex. för att numrera raderna.
 */
export function repeater(container, addBtn, { build, max, min = 0, onChange, onMove }) {
  const rows = () => [...container.children];
  const update = () => {
    const all = rows(), n = all.length;
    addBtn.hidden = n >= max;
    all.forEach((r, i) => {
      const b = $("[data-remove-row]", r); if (b) b.hidden = n <= min;
      const up = $('[data-move="up"]', r), down = $('[data-move="down"]', r);
      if (up) up.hidden = i === 0;
      if (down) down.hidden = i === n - 1;
    });
    if (onChange) onChange(all);
  };
  const add = (values = {}) => { const row = build(values, nextId()); container.append(row); update(); return row; };
  container.addEventListener("click", (e) => {
    const m = e.target.closest("[data-move]");
    if (m) {
      const row = rows().find((r) => r.contains(m)), up = m.dataset.move === "up";
      const other = up ? row.previousElementSibling : row.nextElementSibling;
      if (!other) return;
      if (up) other.before(row); else other.after(row);
      update();
      (m.hidden ? $(`[data-move="${up ? "down" : "up"}"]`, row) : m).focus();
      if (onMove) onMove(row, rows());
      return;
    }
    const b = e.target.closest("[data-remove-row]");
    if (!b) return;
    const row = rows().find((r) => r.contains(b));
    const next = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    update();
    (next ? $("input, select, textarea", next) : addBtn).focus();
  });
  addBtn.addEventListener("click", () => $("input, select, textarea", add()).focus());
  return {
    rows,
    /** Ersätter alla rader. */
    reset(list) { container.replaceChildren(); list.forEach((v) => add(v)); for (let i = rows().length; i < min; i++) add(); update(); },
  };
}

/* ---------- Länkrader ---------- */
/** En rad med länktext och adress. Används av nyheter och resultatarkivet. */
export function linkRow({ label = "", url = "" } = {}, n, placeholder = "https://") {
  return el("div", { class: "link-row" },
    el("div", { class: "field" }, el("label", { for: "l-label-" + n, text: "Länktext" }), el("input", { type: "text", id: "l-label-" + n, maxlength: "80", value: label })),
    el("div", { class: "field" },
      el("label", { for: "l-url-" + n, text: "Adress" }),
      el("input", { type: "url", id: "l-url-" + n, inputmode: "url", placeholder, value: url, "aria-describedby": "l-url-" + n + "-err" }),
      el("span", { class: "err", id: "l-url-" + n + "-err", hidden: true })),
    el("button", { class: "icon-btn", type: "button", "aria-label": "Ta bort länk", "data-remove-row": "" }, "×"));
}

/**
 * Läser länkraderna. Tomma rader hoppas över. Saknas länktext används webbplatsens namn.
 * re = tillåtna adresser, msg = felet när adressen inte matchar.
 */
export function readLinks(container, kit, errs, re, msg) {
  const links = [];
  let any = false;
  $$(".link-row", container).forEach((row) => {
    const [lab, url] = $$("input", row);
    const L = lab.value.trim(), U = url.value.trim();
    if (!L && !U) return;
    any = true;
    if (!re.test(U) || U.length > 2000) { kit.error(url, U ? msg : "Skriv adressen till länken.", errs); return; }
    links.push({ label: L || U.replace(/^https?:\/\//i, "").split("/")[0].slice(0, 80), url: U });
  });
  return { links, any };
}

/* ---------- Bekräfta borttagning ---------- */
// Dialogen #confirm-dialog finns i index.html. run() gör borttagningen och stänger dialogen.
let confirmRun = null, confirming = false;
export function confirmDelete({ title, desc, run, returnSel }) {
  confirmRun = run;
  $("#confirm-h").textContent = title;
  $("#confirm-desc").textContent = desc;
  openDialog($("#confirm-dialog"), returnSel);
}
let confirmReady = false;
export function initConfirm() {
  if (confirmReady) return;
  confirmReady = true;
  $("#confirm-delete").addEventListener("click", async () => {
    const run = confirmRun;
    if (!run || confirming) return;
    const btn = $("#confirm-delete");
    confirming = true; btn.setAttribute("aria-disabled", "true");
    try { await run(); }
    finally { confirming = false; btn.removeAttribute("aria-disabled"); confirmRun = null; }
  });
}
