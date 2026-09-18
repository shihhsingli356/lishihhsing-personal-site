import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("src/pages/workspace.astro", "utf8");
const bootstrap = await readFile("src/workspace/bootstrap.js", "utf8");
const app = await readFile("src/workspace/app.js", "utf8");
const features = await readFile("src/workspace/features.js", "utf8");

test("workspace is hidden until an authenticated session starts it", () => {
  assert.match(page, /id="auth-root"/);
  assert.match(page, /data-workspace hidden/);
  assert.match(page, /workspace\/bootstrap\.js/);
  assert.doesNotMatch(page, /workspace\/app\.js/);
  assert.match(
    bootstrap,
    /if \(workspaceStarted \|\| !session\?\.user\) return/,
  );
  assert.match(bootstrap, /await import\("\.\/app\.js"\)/);
});

test("authenticated storage is scoped to the Supabase user", () => {
  assert.match(app, /"cloud:" \+ namespace \+ ":" \+ user\.id/);
  assert.match(app, /if \(!window\.__workspaceAuth\?\.user\)/);
});

test("workspace utilities stay hidden and requested controls are present", () => {
  assert.doesNotMatch(page, /id="(?:backup|image)-file" data-workspace/);
  assert.match(page, /data-action="logout"/);
  assert.match(app, /data-kind="projects"/);
  assert.match(app, /轻量复盘/);
  assert.match(app, /一周总结/);
  assert.match(features, /investment_buy/);
  assert.match(features, /ledger-account-edit/);
});
