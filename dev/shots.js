// Skärmdumpar i fyra lägen + kontroll av sidledsscroll och JS-fel.
//   node dev/shots.js [utkatalog]   (standard: dev/shots)
const path = require("path");
const fs = require("fs");
const { openPage } = require("./harness");

(async () => {
  const out = process.argv[2] || path.join(__dirname, "shots");
  fs.mkdirSync(out, { recursive: true });
  const errors = [];
  const modes = {
    desktop: { width: 1440, height: 900 },
    desktopDark: { width: 1440, height: 900, dark: true },
    mobile: { width: 390, height: 844 },
    mobileDarkAdmin: { width: 390, height: 844, dark: true, admin: true },
  };
  for (const [name, o] of Object.entries(modes)) {
    const { browser, page } = await openPage(o);
    page.on("pageerror", e => errors.push(name + ": " + e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(name + " console: " + m.text()); });
    await page.reload(); await page.waitForTimeout(1200);
    if (o.admin) { await page.click("#login-open"); await page.click("#google-btn"); await page.waitForTimeout(400); }
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > o.width) errors.push(`${name}: sidledsscroll ${sw} > ${o.width}`);
    await page.screenshot({ path: path.join(out, name + "-top.png") });
    await page.screenshot({ path: path.join(out, name + "-full.png"), fullPage: true });
    await browser.close();
  }
  console.log(errors.length ? errors.join("\n") : "Inga fel. Bilder i " + path.relative(process.cwd(), out));
  process.exitCode = errors.length ? 1 : 0;
})();
