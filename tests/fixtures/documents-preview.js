// Isolated UI fixture. It has no authentication client or production data access.
import "../../src/workspace/workspace.css";
import "../../src/workspace/documents.css";
import { createDocumentTools } from "../../src/workspace/document-tools.js";
import { normalize, emptyState } from "../../src/workspace/core.js";
import { marked } from "marked";
import DOMPurify from "dompurify";
const s = normalize({
  ...emptyState(),
  projects: [
    { id: "p1", title: "考研复习" },
    { id: "p2", title: "个人网站" },
    { id: "p3", title: "阅读计划" },
  ],
  notes: [
    {
      id: "n1",
      title: "九月学习与项目安排",
      type: "document",
      date: "2026-09-18",
      projects: ["p1", "p2", "p3"],
      tags: ["计划", "学习"],
      status: "active",
      body: "# 本周重点\n\n完成数学基础复习，并整理个人网站的文档功能。\n\n## 资料清单\n\n| 资料 | 用途 |\n| --- | --- |\n| 线性代数讲义 | 概念复习 |\n| 项目笔记 | 功能设计 |\n\n## 下一步\n\n- [ ] 整理错题\n- [ ] 完成表格编辑\n",
      tables: [
        {
          id: "tab1",
          title: "学习资料",
          columns: [
            { id: "name", title: "名称", type: "text" },
            {
              id: "progress",
              title: "状态",
              type: "status",
              options: ["待开始", "进行中", "已完成"],
            },
            { id: "cost", title: "费用", type: "money" },
            { id: "project", title: "项目", type: "project" },
          ],
          rows: [
            {
              id: "r1",
              cells: {
                name: "线性代数讲义",
                progress: "进行中",
                cost: 36.5,
                project: "p1",
              },
            },
            {
              id: "r2",
              cells: {
                name: "网站设计笔记",
                progress: "已完成",
                cost: 12,
                project: "p2",
              },
            },
          ],
        },
      ],
    },
    { id: "n2", title: "项目复盘", type: "document", body: "[[n1|学习安排]]" },
  ],
});
let n = s.notes[0],
  preview = false;
const $ = (q) => document.querySelector(q),
  esc = (v) =>
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
  `<button type="button" data-action="${action}" data-id="${esc(id)}" ${extra}>${label}</button>`;
const field = (label, name, value = "") =>
  `<label>${label}<input id="f-${name}" name="${name}" value="${esc(value)}"></label>`;
const select = (label, name, opts, value = "") =>
  `<label>${label}<select id="f-${name}" name="${name}">${opts.map(([id, title]) => `<option value="${id}" ${id === value ? "selected" : ""}>${esc(title)}</option>`).join("")}</select></label>`;
function modal(title, html, submit, label = "保存") {
  $("#dialog-title").textContent = title;
  $("#fields").innerHTML = html;
  $("#submit").textContent = label;
  $("#form-error").textContent = "";
  $("#form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await submit(Object.fromEntries(new FormData(e.target)));
      $("#dialog").close();
      render();
    } catch (err) {
      $("#form-error").textContent = err.message;
    }
  };
  if (!$("#dialog").open) $("#dialog").showModal();
}
const markdown = (text) => DOMPurify.sanitize(marked.parse(text));
const tools = createDocumentTools({
  $,
  esc,
  button,
  field,
  select,
  area: field,
  modal,
  save: async () => {
    $("#saved").textContent = "测试修改已保存";
  },
  render,
  message: (text) => ($("#toast").textContent = text),
  download: () => {},
  state: () => s,
  note: () => n,
  canEdit: () => true,
  isPreview: () => preview,
  projectName: (id) => s.projects.find((p) => p.id === id)?.title || "",
  markdown,
  newNote: () => {},
  openProject: () => {},
  refreshList: () => {},
  markdownToolbar: () =>
    `<div class="markdown-tool-list">${["加粗", "斜体", "一级标题", "二级标题", "引用", "无序列表", "代码块", "链接"].map((t) => button(t, "fixture-format")).join("")}</div>`,
  diaryTemplateToolbar: () => "",
});
function render() {
  $("#content").innerHTML =
    `<div class="row spaced"><div class="actions">${button("文档", "fixture-document", "", 'class="selected"')}${button("日记", "fixture-diary")}</div>${button("新建文档", "doc-template", "", 'class="primary"')}</div><div class="split"><section><input id="search" placeholder="搜索标题与正文"><div id="note-list" class="note-list spaced">${s.notes.map((x) => `<button class="note-item ${x.id === n.id ? "active" : ""}" data-action="open-note" data-id="${x.id}"><strong>${esc(x.title)}</strong><br><small>文档 · 2026-09-18</small></button>`).join("")}</div></section><section class="card editor"><label>标题</label><input id="note-title" value="${esc(n.title)}"><label>关联项目</label><select id="note-project"></select><div class="actions spaced">${button(preview ? "返回编辑" : "Markdown 预览", "fixture-preview")}${button("插入图片", "fixture-image")}${button("选中文字转任务", "fixture-task")}${button("版本历史", "fixture-history")}</div><div class="editor-body"><div class="editor-main"><label>正文</label><textarea id="note-body" ${preview ? "hidden" : ""}>${esc(n.body)}</textarea><div id="note-preview" class="preview" ${preview ? "" : "hidden"}>${markdown(n.body)}</div></div><aside class="markdown-tools"></aside></div></section></div>`;
  tools.enhance(n, preview);
  $("#note-body").oninput = (e) => {
    n.body = e.target.value;
    tools.refreshOutline();
  };
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  try {
    if (b.dataset.action === "close") $("#dialog").close();
    else if (b.dataset.action === "fixture-preview") {
      preview = !preview;
      render();
    } else if (b.dataset.action === "open-note") {
      n = s.notes.find((n) => n.id === b.dataset.id);
      render();
    } else await tools.route(b.dataset.action, b.dataset.id || "", b);
  } catch (err) {
    $("#toast").textContent = err.message;
  }
});
$("#theme").onclick = () =>
  (document.documentElement.dataset.theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark");
render();
