import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createDocumentTools } from "../src/workspace/document-tools.js";
import { normalize, emptyState } from "../src/workspace/core.js";

function harness() {
  const dom = new JSDOM('<body><main></main><div id="fields"></div></body>', {
    url: "https://localhost/",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const s = normalize({
    ...emptyState(),
    projects: [
      { id: "p1", title: "研究" },
      { id: "p2", title: "复习" },
      { id: "p3", title: "网站" },
    ],
    notes: [
      {
        id: "n1",
        title: "记录",
        body: "# 第一节\n\n原有正文\n",
        project: "p1",
        type: "document",
      },
      { id: "n2", title: "参考文档", body: "[[n1|记录]]", type: "document" },
    ],
  });
  const n = s.notes[0],
    $ = (q) => document.querySelector(q);
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const button = (label, action, id = "", extra = "") =>
    `<button type="button" data-action="${action}" data-id="${id}" ${extra}>${label}</button>`;
  const field = (label, name, value = "") =>
    `<label>${label}<input id="f-${name}" name="${name}" value="${esc(value)}"></label>`;
  const select = (label, name, opts, value = "") =>
    `<label>${label}<select id="f-${name}" name="${name}">${opts.map(([id, title]) => `<option value="${id}" ${id === value ? "selected" : ""}>${title}</option>`).join("")}</select></label>`;
  let submit,
    saves = 0,
    downloads = [],
    editable = true,
    preview = false;
  const modal = (title, html, fn) => {
    $("#fields").innerHTML = html;
    submit = fn;
  };
  const render = () => {
    $("main").innerHTML =
      `<input id="search"><div id="note-list"></div><section class="editor"><input id="note-title" value="${esc(n.title)}"><label>项目</label><select id="note-project"><option value="p1">研究</option></select><div class="editor-body"><div class="editor-main"><textarea id="note-body">${esc(n.body)}</textarea><div id="note-preview"><h1>第一节</h1></div></div><aside class="markdown-tools"></aside></div></section>`;
    tools.enhance(n, preview);
  };
  const tools = createDocumentTools({
    $,
    esc,
    button,
    field,
    select,
    area: field,
    modal,
    save: async () => {
      saves++;
    },
    render,
    message: () => {},
    download: (blob, name) => downloads.push({ blob, name }),
    state: () => s,
    note: () => n,
    projectName: (id) => s.projects.find((p) => p.id === id)?.title || "",
    markdown: (text) => esc(text),
    markdownToolbar: () => "<div></div>",
    diaryTemplateToolbar: () => "<div>复盘</div>",
    newNote: () => {},
    canEdit: () => editable,
    isPreview: () => preview,
    refreshList: () => {},
    openProject: () => {},
  });
  render();
  return {
    s,
    n,
    $,
    tools,
    dom,
    render,
    downloads,
    get saves() {
      return saves;
    },
    submit: async (values = {}) => {
      await submit(values);
      render();
    },
    cancel: () => {
      $("#fields").innerHTML = "";
    },
    conflict: () => (editable = false),
    preview: () => {
      preview = true;
      render();
    },
    click: (selector) => $(selector).click(),
    change: (selector, value) => {
      const e = $(selector);
      e.value = value;
      e.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    },
  };
}

test("multi-project picker searches without clearing hidden selections, and supports clearing all", async () => {
  const h = harness();
  await h.tools.route("doc-projects");
  h.$('.project-picker input[value="p2"]').checked = true;
  h.$("#project-search").value = "网站";
  h.$("#project-search").dispatchEvent(new h.dom.window.Event("input"));
  await h.submit();
  assert.deepEqual(h.n.projects, ["p1", "p2"]);
  assert.equal(h.n.project, "p1");
  await h.tools.route("doc-projects");
  h.$("#fields")
    .querySelectorAll('input[type="checkbox"]')
    .forEach((e) => (e.checked = false));
  await h.submit();
  assert.deepEqual(h.n.projects, []);
  assert.equal(h.n.project, "");
});
test("property updates are checkpointed and optional tags can be empty", async () => {
  const h = harness();
  await h.tools.route("doc-properties");
  assert.equal(h.$("#f-tags").required, false);
  await h.submit({ tags: "数学，研究,数学", status: "active" });
  assert.deepEqual(h.n.tags, ["数学", "研究"]);
  assert.equal(h.n.status, "active");
  assert.equal(h.n.history[0].status, "draft");
  await h.tools.route("doc-properties");
  await h.submit({ tags: "", status: "done" });
  assert.deepEqual(h.n.tags, []);
});
test("format panel switches preserve the textarea and selection", async () => {
  const h = harness(),
    body = h.$("#note-body");
  body.setSelectionRange(2, 5);
  await h.tools.route("doc-panel", "templates");
  assert.equal(h.$("#note-body"), body);
  assert.equal(body.selectionStart, 2);
  assert.equal(body.selectionEnd, 5);
  await h.tools.route("doc-panel", "format");
  await h.tools.route("doc-format", "strike");
  assert.match(h.n.body, /~~第一节~~/);
});
test("outline and backlinks are visible in preview without editing controls", async () => {
  const h = harness();
  h.preview();
  assert.equal(h.$("#note-outline button").textContent, "第一节");
  await h.tools.route("doc-panel", "links");
  assert.match(h.$(".document-tools").textContent, /被引用/);
  assert.match(h.$(".document-tools").textContent, /参考文档/);
  assert.equal(h.$('[data-action="doc-link"]'), null);
});
test("Markdown table edits add rows and columns, save at cursor, and preserve other text", async () => {
  const h = harness(),
    body = h.$("#note-body");
  body.setSelectionRange(body.value.length, body.value.length);
  await h.tools.route("doc-table");
  h.$('#md-grid [data-r="0"][data-c="0"]').value = "主题";
  h.click('[data-op="row-add"]');
  h.click('[data-op="col-add"]');
  assert.equal(h.$("#md-grid").querySelectorAll("tbody tr").length, 4);
  await h.submit();
  assert.ok(h.n.body.startsWith("# 第一节\n\n原有正文\n"));
  assert.match(h.n.body, /主题/);
  const before = h.n.body;
  h.$("#note-body").setSelectionRange(
    h.n.body.indexOf("|"),
    h.n.body.indexOf("|"),
  );
  await h.tools.route("doc-table");
  h.$('#md-grid [data-r="0"][data-c="0"]').value = "取消";
  h.cancel();
  assert.equal(h.n.body, before);
});
test("Markdown table editor handles spreadsheet cell paste and column reordering", async () => {
  const h = harness();
  await h.tools.route("doc-table");
  const input = h.$('#md-grid [data-r="0"][data-c="0"]'),
    event = new h.dom.window.Event("paste", {
      bubbles: true,
      cancelable: true,
    });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: () => "名称\t价格\n甲\t12" },
  });
  input.dispatchEvent(event);
  h.click('[data-op="col-right"][data-col="0"]');
  await h.submit();
  assert.match(h.n.body, /\| 价格 \| 名称/);
  assert.match(h.n.body, /\| 12 \| 甲/);
});
test("data table creation edits typed values and cancellation does not change original", async () => {
  const h = harness();
  await h.tools.route("dt-new");
  h.$("#dt-title").value = "资料";
  h.click('[data-op="row-add"]');
  h.$("[data-cell]").value = "线性代数";
  await h.submit();
  assert.equal(h.n.tables.length, 1);
  assert.equal(h.n.tables[0].title, "资料");
  assert.equal(Object.values(h.n.tables[0].rows[0].cells)[0], "线性代数");
  const before = structuredClone(h.n.tables);
  await h.tools.route("dt-edit", h.n.tables[0].id);
  h.$("[data-cell]").value = "未保存";
  h.click('[data-op="row-add"]');
  h.cancel();
  assert.deepEqual(h.n.tables, before);
});
test("incompatible field type changes show error and retain existing content", async () => {
  const h = harness();
  await h.tools.route("dt-new");
  h.click('[data-op="row-add"]');
  h.$("[data-cell]").value = "文字";
  h.change("[data-col-type]", "number");
  assert.match(h.$("#table-error").textContent, /数字/);
  assert.equal(h.$("[data-col-type]").value, "text");
  assert.equal(h.$("[data-cell]").value, "文字");
  await h.submit();
  assert.equal(h.n.tables[0].columns[0].type, "text");
});
test("CSV import, numeric types, filter state and export work together", async () => {
  const h = harness();
  await h.tools.route("dt-new");
  h.$("#dt-paste").value = "名称,费用\n甲,12.50\n乙,5";
  h.click('[data-op="import-replace"]');
  const types = h.$("#dt-columns").querySelectorAll("[data-col-type]");
  types[1].value = "money";
  types[1].dispatchEvent(new h.dom.window.Event("change", { bubbles: true }));
  await h.submit();
  const t = h.n.tables[0];
  assert.equal(t.rows[0].cells[t.columns[1].id], 12.5);
  assert.match(h.$(".table-statistics").textContent, /17.5/);
  h.change('[data-table-view="query"]', "甲");
  assert.equal(h.$(".data-table-card tbody").querySelectorAll("tr").length, 1);
  assert.match(h.$(".table-statistics").textContent, /12.5/);
  await h.tools.route("dt-export", t.id);
  assert.match(await h.downloads[0].blob.text(), /甲/);
  assert.doesNotMatch(await h.downloads[0].blob.text(), /乙/);
});
test("CSV exports neutralize spreadsheet formulas", async () => {
  const h = harness();
  await h.tools.route("dt-new");
  h.click('[data-op="row-add"]');
  h.$("[data-cell]").value = '=HYPERLINK("bad")';
  await h.submit();
  await h.tools.route("dt-export", h.n.tables[0].id);
  assert.match(await h.downloads[0].blob.text(), /'=HYPERLINK/);
});
test("Markdown export contains document tables and complete structured data", async () => {
  const h = harness();
  await h.tools.route("dt-new");
  h.click('[data-op="row-add"]');
  h.$("[data-cell]").value = "表格内容";
  await h.submit();
  await h.tools.route("doc-export");
  await h.submit({ format: "markdown" });
  const exported = await h.downloads[0].blob.text();
  assert.match(exported, /# 记录/);
  assert.match(exported, /原有正文/);
  assert.match(exported, /表格内容/);
  assert.equal(h.downloads[0].name, "记录.md");
});
test("internal links retain note ID across title changes and optional display text is not required", async () => {
  const h = harness();
  h.$("#note-body").setSelectionRange(0, 0);
  await h.tools.route("doc-link");
  assert.equal(h.$("#f-label").required, false);
  await h.submit({ target: "n2", label: "" });
  assert.ok(h.n.body.startsWith("[[n2|参考文档]]"));
});
test("data table deletion keeps a recoverable version and conflict guard prevents edits", async () => {
  const h = harness();
  await h.tools.route("dt-new");
  await h.submit();
  const id = h.n.tables[0].id;
  await h.tools.route("dt-delete", id);
  await h.submit();
  assert.equal(h.n.tables.length, 0);
  assert.equal(h.n.history[0].tables.length, 1);
  h.conflict();
  const before = h.n.body;
  await h.tools.route("doc-format", "strike");
  assert.equal(h.n.body, before);
});
