import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

export async function exerciseLeisure(page) {
  const open = (action) => page.locator(`[data-tool="${action}"]`).click();
  const tab = (id) => page.locator(`[data-fortune-tab="${id}"]`).click();
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await open("open-retirement");
  await page.locator('[name="principal"]').fill("120000");
  await page.locator('[name="spending"]').fill("1000");
  await page.locator('[name="returns"]').fill("0");
  await page.locator('[name="inflation"]').fill("0");
  await expect(page.locator(".runway-number strong")).toHaveText("10");
  await page.locator('[data-period="year"]').click();
  await expect(page.locator('[name="spending"]')).toHaveValue("12000");
  await expect(page.locator(".runway-number strong")).toHaveText("10");
  await page.locator('[data-principal="1000000"][data-annual="50000"]').click();
  await expect(page.locator(".runway-number strong")).toHaveText("20");
  assert.equal(await page.locator(".runway-cell").count(), 72);
  await page.screenshot({
    path: "outputs/tools/retirement.png",
    fullPage: true,
    animations: "disabled",
  });
  const saved = page.waitForEvent("download");
  await page.locator("[data-save-runway]").click();
  const metadata = await sharp(
    await readFile(await (await saved).path()),
  ).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1600);
  await page.locator('[name="principal"]').fill("");
  await expect(page.locator("[data-save-runway]")).toBeDisabled();
  await page.locator('[name="principal"]').fill("1000000");
  await page.locator('[name="spending"]').fill("5000");
  await expect(page.locator(".runway-number strong")).toHaveText("100+");
  await page.locator('[name="returns"]').fill("2");
  await expect(page.locator(".runway-number strong")).toHaveText("∞");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({
    path: "outputs/tools/retirement-mobile-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await open("home");
  await open("open-fortune");
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.getByLabel("所问之事").fill("今天适合散步吗");
  await page.locator("[data-cast]").click();
  await expect(page.locator(".fortune-history .fortune-chip")).toHaveCount(1);
  const faces = await page.locator(".cup-face").allTextContents();
  const expected =
    faces[0] !== faces[1] ? "圣筊" : faces[0] === "平面" ? "笑筊" : "阴筊";
  await expect(page.locator(".jiaobei-result strong")).toHaveText(expected);
  await page.screenshot({
    path: "outputs/tools/jiaobei.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.locator("[data-clear-cups]").click();
  await expect(page.locator(".fortune-chip")).toHaveCount(0);
  await tab("wheel");
  await page.getByLabel("转盘选项", { exact: true }).fill("甲\n乙\n丙\n丁");
  await page.locator("[data-spin]").click();
  await expect(page.locator("[data-spin]")).toBeDisabled();
  await expect(page.locator(".wheel-result strong")).toHaveText(/^[甲乙丙丁]$/);
  const winner = await page.locator(".wheel-result strong").textContent();
  const rotation = await page
    .locator(".fortune-wheel")
    .evaluate((el) =>
      parseFloat(el.style.transform.match(/rotate\(([^d]+)/)[1]),
    );
  assert.equal(
    Math.floor(((360 - rotation) % 360) / 90),
    ["甲", "乙", "丙", "丁"].indexOf(winner),
  );
  await page.screenshot({
    path: "outputs/tools/wheel.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByLabel("转盘选项", { exact: true }).fill("");
  await expect(page.locator("[data-spin]")).toBeDisabled();
  await tab("lots");
  await page.getByLabel("签池", { exact: true }).fill("红签\n蓝签\n绿签");
  await page.getByLabel("每次抽取", { exact: true }).fill("4");
  await page.locator("[data-draw-lots]").click();
  await expect(page.locator(".leisure-error")).toContainText("超过");
  await page.getByLabel("每次抽取", { exact: true }).fill("2");
  await page.locator("[data-draw-lots]").click();
  await expect(page.locator(".lot-result strong")).toHaveCount(2);
  const picked = await page.locator(".lot-result strong").allTextContents();
  await page.getByLabel("每次抽取", { exact: true }).fill("1");
  await page.locator("[data-draw-lots]").click();
  await expect(page.locator("[data-draw-lots]")).toHaveText("已抽完");
  assert.ok(
    !picked.includes(await page.locator(".lot-result strong").textContent()),
  );
  await expect(page.locator("[data-draw-lots]")).toBeDisabled();
  await page.locator("[data-reset-lots]").click();
  await expect(page.locator(".lot-remaining")).toHaveText("剩余 3 签");
  await page.screenshot({
    path: "outputs/tools/lots.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await tab("jiaobei");
  await page.screenshot({
    path: "outputs/tools/jiaobei-mobile-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("[data-cast]").click();
  await expect(page.locator(".fortune-chip")).toHaveCount(1);
  await open("home");
  await page.screenshot({
    path: "outputs/tools/desktop-mobile-four.png",
    fullPage: true,
    animations: "disabled",
  });
}
