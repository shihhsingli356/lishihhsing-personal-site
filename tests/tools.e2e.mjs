import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import sharp from "sharp";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { exerciseLeisure } from "./leisure.e2e.mjs";
const server = await createServer({
  cacheDir: "node_modules/.vite-tools-test",
  server: { host: "127.0.0.1", port: 5199 },
  logLevel: "error",
});
await server.listen();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [],
  outside = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (
    !r.url().startsWith("http://127.0.0.1:5199") &&
    !r.url().startsWith("blob:") &&
    !r.url().startsWith("data:")
  )
    outside.push(r.url());
});
const click = (action) => page.locator(`[data-tool="${action}"]`).click();
const ready = () =>
  page.waitForFunction(
    () => !document.querySelector(".tools-root").hasAttribute("aria-busy"),
  );
async function download(action) {
  const pending = page.waitForEvent("download").catch(async error => {
    error.message += `\nTool status: ${await page.locator('.tool-status').textContent()}`;
    throw error;
  });
  await click(action);
  const d = await pending;
  await ready();
  return readFile(await d.path());
}
try {
  await mkdir("outputs/tools", { recursive: true });
  await page.goto("http://127.0.0.1:5199/tests/tool-preview.html");
  await page.locator(".tool-app").first().waitFor();
  assert.equal(await page.locator(".tool-app").count(), 4);
  await page.screenshot({ path: "outputs/tools/desktop.png" });
  await click("open-date");
  await page.getByLabel("开始日期").fill("2026-10-20");
  await page.getByLabel("结束日期").fill("2026-11-18");
  await page.getByLabel("包含结束当天").check();
  await page.getByRole("button", { name: "计算", exact: true }).click();
  assert.equal(await page.locator(".date-result strong").textContent(), "30");
  await page.screenshot({ path: "outputs/tools/date.png" });
  await click("home");
  await click("open-pdf");
  const a = await PDFDocument.create();
  a.addPage([300, 400]);
  a.addPage([400, 500]);
  const b = await PDFDocument.create();
  b.addPage([500, 600]);
  await page.locator(".tool-file").setInputFiles([
    {
      name: "first.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await a.save()),
    },
    {
      name: "second.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await b.save()),
    },
  ]);
  await ready();
  assert.equal(await page.locator(".tool-page").count(), 3);
  await page.locator('[data-tool="move-left"][data-index="2"]').click();
  await page.locator('[data-tool="rotate"][data-index="0"]').click();
  const merged = await PDFDocument.load(await download("export"));
  assert.deepEqual(
    merged.getPages().map((p) => p.getWidth()),
    [300, 500, 400],
  );
  assert.equal(merged.getPage(0).getRotation().angle, 90);
  await page.locator('[data-select="1"]').check();
  const extracted = await PDFDocument.load(await download("extract"));
  assert.equal(extracted.getPageCount(), 1);
  assert.equal(extracted.getPage(0).getWidth(), 500);
  await page.screenshot({ path: "outputs/tools/pdf.png" });
  await click("mode-split");
  const split = unzipSync(await download("export"));
  assert.equal(Object.keys(split).length, 3);
  await page.locator("#split-type").selectOption("groups");
  await page.locator("#split-range").fill("1-2;3");
  const groups = unzipSync(await download("export"));
  assert.equal(
    (await PDFDocument.load(Object.values(groups)[0])).getPageCount(),
    2,
  );
  await click("mode-pages");
  await page.locator('[data-tool="remove"][data-index="1"]').click();
  assert.equal(await page.locator(".tool-page").count(), 2);
  await click("mode-images");
  const png = await sharp({
    create: { width: 800, height: 600, channels: 4, background: "#df563b" },
  })
    .png()
    .toBuffer();
  await page
    .locator(".tool-file")
    .setInputFiles({ name: "sample.png", mimeType: "image/png", buffer: png });
  await ready();
  const imagePdf = await PDFDocument.load(await download("export"));
  assert.equal(imagePdf.getPageCount(), 1);
  assert.ok(Math.abs(imagePdf.getPage(0).getWidth() - 595.28) < 0.01);
  await click("mode-convert");
  await page.locator("#image-size").fill("400");
  const jpg = await sharp(await download("export")).metadata();
  assert.equal(jpg.format, "jpeg");
  assert.equal(jpg.width, 400);
  assert.equal(jpg.height, 300);
  await page.locator("#image-format").selectOption("image/webp");
  assert.equal(
    (await sharp(await download("export")).metadata()).format,
    "webp",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({
    path: "outputs/tools/mobile-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "mobile overflow",
  );
  await click("home");
  await page.screenshot({
    path: "outputs/tools/mobile-home.png",
    fullPage: true,
  });
  await exerciseLeisure(page);
  assert.deepEqual(errors, []);
  assert.deepEqual(outside, []);
  console.log(
    "PASS: dates, merge/order/rotation, extraction, split, deletion, image PDF, JPG/WebP resize, mobile layout, no external requests",
  );
} finally {
  await browser.close();
  await server.close();
}
