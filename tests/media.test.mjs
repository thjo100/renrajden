// Enhetstester av datamodellen för bilder och filmer (src/media.js). Ingen emulator behövs.
// Körs med: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanMedia, fromBilderJson, staticId, mediaDoc, sortMedia, mediaUrl, parseYear, fileKind, fmtDuration, fmtBytes, storagePaths, CATEGORIES } from "../src/media.js";

const BILDER = JSON.parse(readFileSync("public/bilder/bilder.json", "utf8"));
const ID = "abcDEF0123456789wxyz";
const upload = (over = {}) => ({
  type: "image", category: "foton", year: 2027, text: "Upploppet", file: `galleri/${ID}/bild.jpg`, thumb: `galleri/${ID}/mini.jpg`,
  width: 2048, height: 1365, duration: null, ...over,
});

test("alla bilder från gamla bloggen följer med, med unika id som reglerna godtar", () => {
  const items = fromBilderJson(BILDER);
  assert.equal(items.length, BILDER.length);
  assert.equal(new Set(items.map((m) => m.id)).size, items.length, "två bilder fick samma id");
  for (const m of items) {
    assert.match(m.id, /^[A-Za-z0-9-]{1,80}$/);
    assert.match(m.file, /^\/bilder\/[A-Za-z0-9/._-]+$/);
    assert.match(m.thumb, /^\/bilder\/[A-Za-z0-9/._-]+$/);
    assert.ok(m.year && m.text && m.width > 0 && m.height > 0, m.id);
  }
  assert.equal(staticId("/bilder/foton/2015-tre-akare-i-dimman.jpg"), "foton-2015-tre-akare-i-dimman");
  assert.deepEqual(mediaDoc(items[0]), {
    type: "image", category: "foton", year: 2015, text: "Tre åkare i dimman",
    file: "/bilder/foton/2015-tre-akare-i-dimman.jpg", thumb: "/bilder/mini/foton/2015-tre-akare-i-dimman.jpg",
    width: 2048, height: 1536, duration: null,
  });
});

test("uppladdade bilder och filmer läses in, och fel format visas inte", () => {
  assert.equal(cleanMedia(upload(), ID).file, `galleri/${ID}/bild.jpg`);
  const film = cleanMedia(upload({ type: "video", category: "foton", file: `galleri/${ID}/film.mp4`, duration: 42.5 }), ID);
  assert.equal(film.category, "filmer", "en film hamnar alltid under Filmer");
  assert.equal(film.duration, 42.5);
  assert.equal(cleanMedia(upload({ year: null, text: undefined, category: "okänd" }), ID).category, "foton");
  assert.equal(cleanMedia(upload({ year: 1980 }), ID).year, null);
  const bad = {
    "annan mapp": { file: "galleri/annatid/bild.jpg" },
    "extern adress": { file: "https://example.com/bild.jpg" },
    "javascript": { thumb: "javascript:alert(1)" },
    "svg": { file: `galleri/${ID}/bild.svg` },
    "film som bild": { file: `galleri/${ID}/film.mp4` },
    "okänd typ": { type: "audio" },
    "bredd noll": { width: 0 },
  };
  for (const [name, over] of Object.entries(bad)) assert.equal(cleanMedia(upload(over), ID), null, name);
  assert.equal(cleanMedia(upload(), "ogiltigt id!"), null);
  assert.equal(cleanMedia(null, ID), null);
});

test("nyaste året först, och en bild utan år sorteras på året den laddades upp", () => {
  const created = new Date("2027-02-01T12:00:00Z").getTime();
  const m = (id, over) => ({ ...cleanMedia(upload(over), ID), id });
  const list = sortMedia([
    m("gammal", { year: 2015, text: "B" }),
    m("affisch", { year: 2030, category: "affischer" }),
    m("utan-ar", { year: null, text: "Ny" }),
    m("film", { type: "video", file: `galleri/${ID}/film.mp4`, duration: 3 }),
    m("ocksa-gammal", { year: 2015, text: "A" }),
  ].map((x) => (x.id === "utan-ar" ? { ...x, created } : x)));
  assert.deepEqual(list.map((x) => x.id), ["utan-ar", "ocksa-gammal", "gammal", "film", "affisch"]);
  assert.deepEqual(CATEGORIES.map((c) => c[0]), ["foton", "filmer", "affischer", "banor", "sponsorer", "seedning"]);
});

test("adresser till filerna", () => {
  const base = "https://firebasestorage.googleapis.com/v0/b/renrajden.firebasestorage.app/o/";
  assert.equal(mediaUrl("/bilder/foton/a.jpg", base), "/bilder/foton/a.jpg");
  assert.equal(mediaUrl(`galleri/${ID}/bild.jpg`, base), `${base}galleri%2F${ID}%2Fbild.jpg?alt=media`);
  assert.equal(mediaUrl(`galleri/${ID}/bild.jpg`, null), null, "utan Storage går filen inte att visa");
  assert.deepEqual(storagePaths(ID, "video", "webm"), { file: `galleri/${ID}/film.webm`, thumb: `galleri/${ID}/mini.jpg` });
  assert.deepEqual(storagePaths(ID, "image", "png"), { file: `galleri/${ID}/bild.png`, thumb: `galleri/${ID}/mini.jpg` });
});

test("år i formuläret är frivilliga men måste vara rimliga", () => {
  assert.equal(parseYear(""), null);
  assert.equal(parseYear("  "), null);
  assert.equal(parseYear(" 2027 "), 2027);
  for (const bad of ["27", "20277", "1980", "2101", "två", "2027.0"]) assert.ok(Number.isNaN(parseYear(bad)), bad);
});

test("filtyper, längd och storlek", () => {
  const f = (name, type) => ({ name, type });
  assert.equal(fileKind(f("a.jpg", "image/jpeg")), "image");
  assert.equal(fileKind(f("a.heic", "")), "image", "HEIC utan typ känns igen på ändelsen");
  assert.equal(fileKind(f("a.mov", "video/quicktime")), "video");
  assert.equal(fileKind(f("a.webm", "video/webm")), "video");
  assert.equal(fileKind(f("a.svg", "image/svg+xml")), null, "SVG kan innehålla skript");
  assert.equal(fileKind(f("a.pdf", "application/pdf")), null);
  assert.equal(fileKind(f("a.avi", "video/x-msvideo")), null);
  assert.equal(fmtDuration(42.4), "0:42");
  assert.equal(fmtDuration(62), "1:02");
  assert.equal(fmtDuration(3723), "1:02:03");
  assert.equal(fmtBytes(500), "1 kB");
  assert.equal(fmtBytes(71 * 1024), "71 kB");
  assert.equal(fmtBytes(12.4 * 1024 * 1024), "12 MB");
  assert.equal(fmtBytes(2.5 * 1024 * 1024), "2,5 MB");
});
