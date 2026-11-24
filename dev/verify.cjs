// Funktionstest av de viktigaste flödena (efter UX-utvärderingen).
//   node dev/verify.cjs
const { openPage } = require("./harness.cjs");

const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "OK  " : "FEL "} ${name}${detail ? " – " + detail : ""}`);
const q = (page, fn) => page.evaluate(fn);

(async () => {
  for (const w of [320, 360]) {
    const { browser, page } = await openPage({ width: w, height: 700 });
    const sw = await q(page, () => document.documentElement.scrollWidth);
    check(`ingen sidledsscroll vid ${w}px`, sw <= w, `scrollWidth ${sw}`);
    await browser.close();
  }

  {
    const { browser, page } = await openPage({ width: 1440, height: 900, admin: true });
    const errs = []; page.on("pageerror", e => errs.push(e.message));
    await page.click("#login-open"); await page.click("#google-btn"); await page.waitForTimeout(500);
    check("inloggning ger fokus i adminraden", await q(page, () => document.activeElement.textContent.includes("Ny nyhet")));

    await page.focus('[data-delete="2025-02-renrajden-2025"]'); await page.keyboard.press("Enter"); await page.waitForTimeout(200);
    await page.focus("#confirm-delete"); await page.keyboard.press("Enter"); await page.waitForTimeout(700);
    check("fokus på Ångra efter borttagning", await q(page, () => document.activeElement.id === "toast-action"));
    await page.waitForTimeout(11000);
    check("toasten ligger kvar när den har fokus", await q(page, () => !document.getElementById("toast").hidden));
    await page.keyboard.press("Enter"); await page.waitForTimeout(900);
    check("fokus på återställd nyhet efter ångra", await q(page, () => document.activeElement.id === "nt-2025-02-renrajden-2025"));

    await page.click('[data-action="new-news"] >> nth=0'); await page.waitForTimeout(200);
    await page.fill("#f-title", "Utkast"); await page.keyboard.press("Escape"); await page.waitForTimeout(150);
    check("Esc med osparad text frågar först", await q(page, () => document.getElementById("editor-dialog").open && document.activeElement.id === "discard-keep"));
    await page.keyboard.press("Escape"); await page.waitForTimeout(150);
    check("andra Esc = fortsätt redigera", await q(page, () => document.getElementById("discard").hidden && document.activeElement.id === "f-title"));

    await page.fill("#f-title", "Testnyhet"); await page.fill("#link-rows input[type=url]", "http://exempel.se");
    await page.click("#save-btn"); await page.waitForTimeout(200);
    check("http-länk nekas", await q(page, () => document.activeElement.id === "error-summary"));
    await page.fill("#link-rows input[type=url]", "https://exempel.se");
    await page.click("#save-btn"); await page.waitForTimeout(900);
    check("ny nyhet publiceras och får fokus", await q(page, () => !document.getElementById("editor-dialog").open && document.activeElement.tagName === "H3" && document.activeElement.textContent === "Testnyhet"));
    check("inga JS-fel", !errs.length, errs.join("; "));
    await browser.close();
  }

  {
    const { browser, page } = await openPage({ width: 390, height: 844 });
    await page.click("#menu-btn");
    for (let i = 0; i < 9; i++) await page.keyboard.press("Tab");
    check("mobilmenyn stängs när fokus lämnar den", await q(page, () => !document.getElementById("site-nav").hasAttribute("data-open")));
    await page.evaluate(() => { document.querySelector("footer details").open = true; });
    await page.click('[data-phase-btn="raceweek"]');
    check("tävlingsveckoläget byter knappar", await q(page, () => document.getElementById("cta-1").textContent === "PM och tider"));
    await browser.close();
  }

  console.log(results.join("\n"));
  process.exitCode = results.some(r => r.startsWith("FEL")) ? 1 : 0;
})();
