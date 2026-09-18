import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { emptyState, normalize } from "../src/workspace/core.js";

test("actual workspace integrates multi-project editing, preview links, tables, history and sync payload", async () => {
  const html = (
    await readFile(
      new URL("../src/pages/workspace.astro", import.meta.url),
      "utf8",
    )
  )
    .replace(/^---[\s\S]*?---/, "")
    .replace(/<script>[\s\S]*?<\/script>/g, "");
  const dom = new JSDOM(html, { url: "https://workspace.test/" }),
    win = dom.window;
  win.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  win.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  win.HTMLElement.prototype.scrollIntoView = function () {};
  const properties = [
    "window",
    "document",
    "localStorage",
    "location",
    "navigator",
    "DOMParser",
    "NodeFilter",
    "Node",
    "FormData",
    "BroadcastChannel",
    "setInterval",
    "setTimeout",
  ];
  const old = new Map(
    properties.map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const timers = [],
    nativeTimeout = globalThis.setTimeout,
    nativeInterval = globalThis.setInterval;
  for (const key of properties.slice(0, 10))
    Object.defineProperty(globalThis, key, {
      value: win[key] ?? win,
      configurable: true,
      writable: true,
    });
  globalThis.BroadcastChannel = undefined;
  globalThis.setInterval = (fn, ms, ...args) => {
    const t = nativeInterval(fn, ms, ...args);
    timers.push(t);
    return t;
  };
  globalThis.setTimeout = (fn, ms, ...args) => {
    const t = nativeTimeout(fn, ms, ...args);
    timers.push(t);
    return t;
  };
  const initial = normalize({
    ...emptyState(),
    projects: [
      { id: "p1", title: "复习" },
      { id: "p2", title: "网站" },
    ],
    goals: [
      {
        id: "g-later",
        title: "上线准备",
        project: "p2",
        start: "2026-10-01",
        end: "2026-10-20",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "g-sooner",
        title: "界面检查",
        project: "p2",
        start: "2026-09-18",
        end: "2026-09-25",
        createdAt: "2026-09-10T00:00:00.000Z",
      },
    ],
    tasks: [
      {
        id: "t-linked",
        title: "完成项目导航",
        project: "p2",
        goal: "g-sooner",
        date: "2026-09-20",
      },
      {
        id: "t-loose",
        title: "未分组任务",
        project: "p2",
        date: "2026-09-21",
      },
    ],
    notes: [
      {
        id: "n1",
        title: "整合笔记",
        type: "document",
        project: "p1",
        body: '# 计划\n\n[[n2|相关资料]]\n\n- [ ] 学习\n\n<button data-action="delete" data-id="n1">恶意按钮</button>',
      },
      { id: "n2", title: "相关资料", type: "document", body: "资料内容" },
    ],
  });
  let remote = { payload: initial, version: 1 };
  win.__workspaceAuth = {
    user: { id: "fixture-user", email: "test@example.invalid" },
    namespace: "isolated-test",
    client: {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            return { data: structuredClone(remote), error: null };
          },
        };
      },
      async rpc(name, { expected_version, new_payload }) {
        assert.equal(expected_version, remote.version);
        remote = {
          payload: structuredClone(new_payload),
          version: remote.version + 1,
        };
        return { data: remote.version, error: null };
      },
    },
  };
  const $ = (q) => win.document.querySelector(q);
  const until = async (fn) => {
    for (let i = 0; i < 150; i++) {
      if (fn()) return;
      await delay(10);
    }
    throw Error("UI did not settle: " + ($("#toast")?.textContent || ""));
  };
  const click = async (selector) => {
    assert.ok($(selector), selector);
    $(selector).click();
    await delay(15);
  };
  const submit = async () => {
    $("#form").dispatchEvent(
      new win.Event("submit", { bubbles: true, cancelable: true }),
    );
    await until(() => !$("#dialog").open || $("#form-error").textContent);
    assert.equal($("#form-error").textContent, "");
  };
  try {
    const compiled = await build({
      entryPoints: [
        fileURLToPath(new URL("../src/workspace/app.js", import.meta.url)),
      ],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      loader: { ".css": "empty" },
    });
    await import(
      "data:text/javascript;base64," +
        Buffer.from(compiled.outputFiles[0].text).toString("base64")
    );
    await until(() => $("#save-status").textContent.includes("已同步"));
    await click('[data-view="projects"]');
    await click('[data-action="open-project"][data-id="p2"]');
    const projectText = $(".project-detail").textContent;
    assert.ok(
      projectText.indexOf("界面检查") < projectText.indexOf("上线准备"),
    );
    assert.ok(
      projectText.indexOf("目标 · 2") < projectText.indexOf("未关联目标的任务"),
    );
    assert.equal(projectText.match(/完成项目导航/g)?.length, 1);
    assert.match(projectText, /未分组任务/);
    await click('[data-action="project-sort"]');
    assert.match($('[data-action="project-sort"]').textContent, /时间远→近/);
    const reversedProjectText = $(".project-detail").textContent;
    assert.ok(
      reversedProjectText.indexOf("上线准备") <
        reversedProjectText.indexOf("界面检查"),
    );
    await click('.project-head [data-action="task"]');
    $("#f-goal").value = "g-sooner";
    $("#f-goal").dispatchEvent(new win.Event("change", { bubbles: true }));
    assert.equal($("#f-project").value, "p2");
    $("#f-project").value = "p1";
    $("#f-project").dispatchEvent(new win.Event("change", { bubbles: true }));
    assert.equal($("#f-goal").value, "");
    await click('[data-action="close"]');
    await click('[data-view="notes"]');
    await click('[data-action="open-note"][data-id="n1"]');
    assert.ok($(".note-projects"));
    assert.equal($("#note-project").hidden, true);
    await click('[data-action="doc-projects"]');
    $('.project-picker input[value="p2"]').checked = true;
    await submit();
    assert.match($(".note-projects").textContent, /复习/);
    assert.match($(".note-projects").textContent, /网站/);
    await click('[data-action="preview"]');
    assert.equal($("#note-preview input"), null);
    assert.match($("#note-preview").textContent, /☐/);
    assert.equal($('#note-preview [data-action="delete"]'), null);
    await click('#note-preview [data-action="open-note"]');
    assert.equal($("#note-title").value, "相关资料");
    await click('[data-action="open-note"][data-id="n1"]');
    await click('[data-action="dt-new"]');
    $("#dt-title").value = "任务资料";
    await click('[data-op="row-add"]');
    $("[data-cell]").value = "保留内容";
    await submit();
    assert.match($(".note-data-tables").textContent, /保留内容/);
    await click('[data-action="dt-edit"]');
    $("[data-cell]").value = "修改内容";
    await submit();
    assert.match($(".note-data-tables").textContent, /修改内容/);
    await click('[data-action="history"]');
    assert.match($("#fields").textContent, /数据表变更/);
    await click('[data-action="restore-version"]');
    await until(() => !$("#dialog").open);
    assert.match($(".note-data-tables").textContent, /保留内容/);
    assert.match($(".note-projects").textContent, /网站/);
    await click('[data-view="ledger"]');
    await click('[data-action="debt-edit"]');
    $("#f-title").value = "学费分期";
    $("#f-party").value = "学校";
    $("#f-amount").value = "1000";
    $("#f-date").value = "2026-09-18";
    $("#f-dueDate").value = "2026-12-31";
    $("#f-project").value = "p2";
    await submit();
    assert.match($(".debt-card").textContent, /学费分期/);
    await click('.debt-card [data-action="debt-payment"]');
    $("#f-amount").value = "250";
    $("#f-date").value = "2026-09-20";
    await submit();
    assert.match($(".debt-card").textContent, /750\.00/);
    await click('[data-action="settings"]');
    await click('[data-action="sync"]');
    await until(() => remote.payload.notes[0].tables.length === 1);
    const saved = remote.payload.notes.find((n) => n.id === "n1");
    assert.deepEqual(saved.projects, ["p1", "p2"]);
    assert.equal(Object.values(saved.tables[0].rows[0].cells)[0], "保留内容");
    const savedDebt = remote.payload.debts.find(
      (debt) => debt.title === "学费分期",
    );
    assert.equal(savedDebt.project, "p2");
    assert.equal(savedDebt.payments[0].cents, 25000);
    assert.ok(
      saved.history.some((h) =>
        h.tables?.[0]?.rows.some((r) =>
          Object.values(r.cells).includes("修改内容"),
        ),
      ),
    );
  } finally {
    for (const timer of timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    win.close();
  }
});
