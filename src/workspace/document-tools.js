import { uid, live, noteCheckpoint, taskOccursOn } from "./core.js";
import {
  columnTypes,
  noteProjects,
  noteTags,
  cleanTables,
  cleanCell,
  tableRows,
  numericStats,
  parseDelimited,
  markdownTables,
  toMarkdownTable,
  headings,
  wikiLinks,
  resolveNote,
  lineDiff,
} from "./documents.js";

export const documentTemplates = {
  blank: ["空白文档", ""],
  knowledge: ["知识整理", "## 核心概念\n\n## 要点\n\n## 示例\n\n## 参考资料\n"],
  project: [
    "项目方案",
    "## 目标\n\n## 方案\n\n## 里程碑\n\n## 风险与应对\n\n## 下一步\n- [ ] \n",
  ],
  reading: [
    "阅读笔记",
    "## 来源\n\n## 核心观点\n\n## 摘录\n> \n\n## 我的理解\n\n## 下一步行动\n",
  ],
  meeting: [
    "会议记录",
    "## 议题\n\n## 参与人\n\n## 讨论记录\n\n## 决定\n\n## 行动项\n| 事项 | 负责人 | 截止日期 |\n| --- | --- | --- |\n|  |  |  |\n",
  ],
  research: [
    "研究笔记",
    "## 研究问题\n\n## 假设\n\n## 方法\n\n## 证据\n\n## 结论\n\n## 局限与后续\n\n## 来源\n",
  ],
  decision: [
    "决策记录",
    "## 背景\n\n## 可选方案\n| 方案 | 优点 | 代价 |\n| --- | --- | --- |\n|  |  |  |\n\n## 最终决定\n\n## 理由\n\n## 验证日期\n",
  ],
  review: [
    "阶段复盘",
    "## 目标与结果\n\n## 有效的做法\n\n## 遇到的问题\n\n## 原因\n\n## 下阶段行动\n- [ ] \n",
  ],
};

export function createDocumentTools(ctx) {
  const {
    $,
    esc,
    button,
    field,
    select,
    area,
    modal,
    save,
    render,
    message,
    download,
  } = ctx;
  let mode = "format",
    expanded = false;
  const note = () => ctx.note();
  const projects = () => live(ctx.state(), "projects", true);
  const notes = () => live(ctx.state(), "notes", true);
  const options = (items, value) =>
    items
      .map(
        ([id, title]) =>
          `<option value="${esc(id)}" ${id === value ? "selected" : ""}>${esc(title)}</option>`,
      )
      .join("");
  const touch = (n) => {
    n.updatedAt = new Date().toISOString();
    return save();
  };
  const mutate = (n, fn, redraw = true) => {
    if (!ctx.canEdit()) {
      message("请先处理标签页冲突");
      return;
    }
    noteCheckpoint(n);
    fn();
    touch(n);
    if (redraw) render();
  };
  const label = (c, v) =>
    c.type === "project"
      ? ctx.state().projects.find((p) => p.id === v)?.title ||
        (v ? "已删除项目" : "")
      : c.type === "task"
        ? ctx.state().tasks.find((t) => t.id === v)?.title ||
          (v ? "已删除任务" : "")
        : c.type === "checkbox"
          ? v
            ? "已勾选"
            : "未勾选"
          : String(v ?? "");
  function insert(text, replace = true) {
    const body = $("#note-body"),
      n = note();
    if (!body || body.hidden) return message("请先返回编辑");
    const start = body.selectionStart,
      end = replace ? body.selectionEnd : start;
    mutate(
      n,
      () => {
        body.setRangeText(text, start, end, "end");
        n.body = body.value;
      },
      false,
    );
    body.focus();
    refreshOutline();
    ctx.refreshList();
  }
  function projectChips(n) {
    const ids = noteProjects(n),
      shown = expanded ? ids : ids.slice(0, 2);
    return `<div class="note-projects" aria-label="关联项目">${shown.map((id) => button(esc(ctx.projectName(id)), "doc-project", id, 'class="project-chip"')).join("")}${ids.length > 2 ? button(expanded ? "收起" : `+${ids.length - 2}`, "doc-expand-projects") : ""}${button(ids.length ? "编辑关联" : "关联项目", "doc-projects", "", 'class="project-chip"')}</div>`;
  }
  function propertyHTML(n) {
    return `<div class="note-properties">${projectChips(n)}<div class="actions">${button({ draft: "草稿", active: "整理中", done: "已完成" }[n.status] || "草稿", "doc-properties", "", 'class="subtle"')}${(n.tags || []).map((t) => `<span class="note-tag">#${esc(t)}</span>`).join("")}${button("属性", "doc-properties")}${button("导出", "doc-export")}</div></div>`;
  }
  function sidebarHTML(n, preview) {
    const tabs = [
      ["format", "格式"],
      ["templates", n.type === "diary" ? "复盘" : "模板"],
      ["outline", "大纲"],
      ["links", "关联"],
    ];
    if (preview && ["format", "templates"].includes(mode)) mode = "outline";
    let content = "";
    if (mode === "format")
      content =
        ctx.markdownToolbar() +
        `<div class="markdown-tool-list">${[
          ["checklist", "待办清单"],
          ["strike", "删除线"],
          ["highlight", "高亮"],
          ["collapse", "折叠块"],
          ["callout", "提示块"],
        ]
          .map(([id, title]) => button(title, "doc-format", id))
          .join(
            "",
          )}${button("文档链接", "doc-link")}${button("文档表格", "doc-table")}${button("数据表", "dt-new")}</div>`;
    if (mode === "templates")
      content =
        n.type === "diary"
          ? ctx.diaryTemplateToolbar()
          : `<div class="markdown-tool-list">${Object.entries(documentTemplates)
              .filter(([id]) => id !== "blank")
              .map(([id, [title]]) => button(title, "doc-insert-template", id))
              .join("")}</div>`;
    if (mode === "outline")
      content = '<nav id="note-outline" aria-label="文档大纲"></nav>';
    if (mode === "links") {
      const out = [
        ...new Set(
          wikiLinks(n.body)
            .map((l) => resolveNote(notes(), l.target)?.id)
            .filter(Boolean),
        ),
      ];
      const back = notes().filter(
        (other) =>
          other.id !== n.id &&
          wikiLinks(other.body).some(
            (l) => resolveNote(notes(), l.target)?.id === n.id,
          ),
      );
      content = `<h3>引用</h3><div class="markdown-tool-list">${out.map((id) => button(esc(notes().find((x) => x.id === id).title), "open-note", id)).join("") || '<span class="muted">暂无引用</span>'}</div><h3>被引用</h3><div class="markdown-tool-list">${back.map((x) => button(esc(x.title), "open-note", x.id)).join("") || '<span class="muted">暂无引用</span>'}</div>${!preview ? button("插入链接", "doc-link") : ""}`;
    }
    return `<aside class="markdown-tools document-tools" aria-label="文档工具"><div class="note-tool-tabs">${tabs
      .filter(([id]) => !preview || !["format", "templates"].includes(id))
      .map(([id, title]) =>
        button(
          title,
          "doc-panel",
          id,
          `aria-pressed="${mode === id}" class="${mode === id ? "selected" : ""}"`,
        ),
      )
      .join("")}</div>${content}</aside>`;
  }
  function refreshOutline() {
    const root = $("#note-outline");
    if (!root || !note()) return;
    root.innerHTML =
      headings(note().body)
        .map(
          (h, i) =>
            `<button type="button" data-action="doc-heading" data-id="${i}" data-level="${h.level}">${esc(h.title)}</button>`,
        )
        .join("") || '<span class="muted">暂无标题</span>';
  }
  function enhance(n, preview) {
    const old = $("#note-project");
    old.previousElementSibling?.remove();
    old.hidden = true;
    old.insertAdjacentHTML("afterend", propertyHTML(n));
    const side = $(".editor-body .markdown-tools");
    if (side) side.remove();
    $(".editor-body").insertAdjacentHTML("beforeend", sidebarHTML(n, preview));
    $(".editor-body").insertAdjacentHTML(
      "afterend",
      `<section class="note-data-tables"><div class="row"><h2>数据表</h2>${button("新建数据表", "dt-new")}</div>${(n.tables || []).map(tableHTML).join("")}</section>`,
    );
    $("#search").placeholder = "搜索标题、正文、标签与项目";
    refreshOutline();
    const updateView = (e) => {
      const key = e.target.dataset.tableView,
        id = e.target.closest("[data-table]")?.dataset.table;
      if (!key || !id || !ctx.canEdit()) return;
      const t = n.tables.find((x) => x.id === id);
      t.view ??= {};
      if (t.view[key] === e.target.value) return;
      t.view[key] = e.target.value;
      if (key === "column") {
        t.view.value = "";
        t.view.operator = "contains";
      }
      touch(n);
      const current = e.target.closest("[data-table]"),
        template = document.createElement("template");
      template.innerHTML = tableHTML(t);
      const next = template.content.firstElementChild;
      if (key === "column") current.replaceWith(next);
      else
        for (const selector of ["tbody", ".table-statistics", "h3 .note-tag"])
          current
            .querySelector(selector)
            .replaceWith(next.querySelector(selector));
    };
    $(".note-data-tables").addEventListener("change", updateView);
    $(".note-data-tables").addEventListener("input", (e) => {
      if (["query", "value"].includes(e.target.dataset.tableView))
        updateView(e);
    });
    $("#note-body").addEventListener("input", refreshOutline);
  }
  function projectPicker(n) {
    const selected = new Set(noteProjects(n));
    const suggested = new Set();
    if (n.type === "diary") {
      for (const t of live(ctx.state(), "tasks", true))
        if (
          taskOccursOn(t, n.date) ||
          t.completedOn === n.date ||
          t.completedDates?.includes(n.date)
        )
          suggested.add(t.project);
      for (const e of live(ctx.state(), "events", true))
        if (e.date <= n.date && (e.endDate || e.date) >= n.date)
          suggested.add(e.project);
      const dayStart = new Date(n.date + "T00:00:00").getTime(),
        dayEnd = new Date(n.date + "T23:59:59.999").getTime();
      for (const f of live(ctx.state(), "focus", true))
        if (f.segments.some((s) => s.start <= dayEnd && s.end > dayStart))
          suggested.add(f.project);
    }
    modal(
      "关联项目",
      `<input id="project-search" type="search" placeholder="搜索项目" aria-label="搜索项目"><div class="project-picker">${
        projects()
          .sort(
            (a, b) => Number(suggested.has(b.id)) - Number(suggested.has(a.id)),
          )
          .map(
            (p) =>
              `<label class="project-option"><input type="checkbox" name="projects" value="${p.id}" ${selected.has(p.id) ? "checked" : ""}><span>${esc(p.title)}</span>${suggested.has(p.id) ? '<span class="note-tag">当日相关</span>' : ""}</label>`,
          )
          .join("") || "<p>暂无项目</p>"
      }</div>`,
      async () => {
        const ids = [
          ...document.querySelectorAll(".project-picker input:checked"),
        ].map((x) => x.value);
        noteCheckpoint(n);
        n.projects = ids;
        n.project = ids[0] || "";
        await touch(n);
      },
    );
    $("#project-search").oninput = (e) =>
      document
        .querySelectorAll(".project-option")
        .forEach(
          (el) =>
            (el.hidden = !el.textContent
              .toLowerCase()
              .includes(e.target.value.toLowerCase())),
        );
  }
  function properties(n) {
    modal(
      "笔记属性",
      select(
        "状态",
        "status",
        [
          ["draft", "草稿"],
          ["active", "整理中"],
          ["done", "已完成"],
        ],
        n.status || "draft",
      ) +
        field("标签", "tags", (n.tags || []).join("，")) +
        `<dl class="property-dates"><dt>创建</dt><dd>${esc(n.createdAt?.replace("T", " ").slice(0, 19) || n.date)}</dd><dt>更新</dt><dd>${esc(n.updatedAt?.replace("T", " ").slice(0, 19) || n.date)}</dd></dl>`,
      async (v) => {
        noteCheckpoint(n);
        n.status = v.status;
        n.tags = noteTags(v.tags);
        await touch(n);
      },
    );
    $("#f-tags").placeholder = "用逗号分隔";
  }
  function linkPicker() {
    const body = $("#note-body"),
      start = body.selectionStart,
      end = body.selectionEnd,
      selected = body.value.slice(start, end),
      n = note();
    modal(
      "插入文档链接",
      select(
        "文档或日记",
        "target",
        notes()
          .filter((x) => x.id !== n.id)
          .map((x) => [x.id, x.title]),
      ) + field("显示文字", "label", selected),
      async (v) => {
        const target = resolveNote(notes(), v.target);
        if (!target) throw Error("请选择一篇文档或日记");
        noteCheckpoint(n);
        const title = (v.label || target.title).replace(/[\[\]|\n]/g, " ");
        n.body =
          n.body.slice(0, start) +
          `[[${target.id}|${title}]]` +
          n.body.slice(end);
        await touch(n);
      },
      "插入",
    );
    $("#f-label").placeholder = "留空使用文档标题";
  }
  function tableHTML(t) {
    const rows = tableRows(t, label),
      v = t.view || {};
    const filterColumn = t.columns.find((c) => c.id === v.column);
    const choices =
      filterColumn?.type === "status"
        ? filterColumn.options
        : filterColumn?.type === "checkbox"
          ? ["已勾选", "未勾选"]
          : null;
    const filterValue = choices
      ? `<select data-table-view="value" aria-label="筛选值">${options([["", "全部"], ...choices.map((x) => [x, x])], v.value)}</select>`
      : `<input data-table-view="value" aria-label="筛选值" placeholder="筛选值" value="${esc(v.value || "")}">`;
    return `<article class="data-table-card" data-table="${t.id}"><div class="row"><h3>${esc(t.title)} <span class="note-tag">${rows.length}/${t.rows.length}</span></h3><div class="actions">${button("编辑", "dt-edit", t.id)}${button("导出 CSV", "dt-export", t.id)}${button("删除", "dt-delete", t.id)}</div></div><div class="table-filters"><input type="search" data-table-view="query" aria-label="搜索表格" placeholder="搜索表格" value="${esc(v.query || "")}"><select data-table-view="column" aria-label="筛选字段">${options([["", "全部字段"], ...t.columns.map((c) => [c.id, c.title])], v.column)}</select><select data-table-view="operator" aria-label="筛选条件">${options(
      [
        ["contains", "包含"],
        ["eq", "等于"],
        ["ne", "不等于"],
        ["gt", "大于 / 晚于"],
        ["gte", "大于等于"],
        ["lt", "小于 / 早于"],
        ["lte", "小于等于"],
        ["empty", "为空"],
        ["filled", "不为空"],
      ],
      v.operator || "contains",
    )}</select>${filterValue}<select data-table-view="sort" aria-label="排序字段">${options([["", "原始顺序"], ...t.columns.map((c) => [c.id, c.title])], v.sort)}</select><select data-table-view="direction" aria-label="排序方向">${options(
      [
        ["asc", "升序"],
        ["desc", "降序"],
      ],
      v.direction || "asc",
    )}</select></div><div class="table-scroll"><table><thead><tr>${t.columns.map((c) => `<th>${esc(c.title)}<span class="column-type">${columnTypes[c.type]}</span></th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${t.columns.map((c) => `<td>${cellHTML(c, r.cells[c.id])}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${t.columns.length}">暂无记录</td></tr>`}</tbody></table></div><div class="table-statistics">${t.columns
      .filter((c) => ["number", "money"].includes(c.type))
      .map((c) => {
        const s = numericStats(rows, c),
          f = (v) => Number(v.toFixed(2)).toLocaleString("zh-CN");
        return `<details><summary>${esc(c.title)} · 合计 ${f(s.sum)}</summary><span>均值 ${f(s.average)} · 最小 ${f(s.min)} · 最大 ${f(s.max)} · ${s.count} 项</span></details>`;
      })
      .join("")}</div></article>`;
  }
  function cellHTML(c, v) {
    const text = label(c, v);
    if (v && c.type === "project")
      return button(esc(text), "doc-project", v, 'class="table-link"');
    if (v && c.type === "task")
      return button(esc(text), "task", v, 'class="table-link"');
    if (c.type === "status")
      return `<span class="note-tag">${esc(text)}</span>`;
    if (c.type === "checkbox")
      return `<span aria-label="${text}">${v ? "☑" : "☐"}</span>`;
    if (c.type === "money" && v !== "")
      return Number(v).toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    return esc(text);
  }
  function markdownTableEditor(index) {
    const n = note(),
      body = $("#note-body"),
      tables = markdownTables(n.body),
      caret = body.selectionStart;
    const existing = Number.isInteger(index)
      ? tables[index]
      : tables.find((t) => caret >= t.start && caret <= t.end);
    const start = existing?.start ?? caret,
      end = existing?.end ?? body.selectionEnd;
    let rows = structuredClone(
        existing?.rows || [
          ["列 1", "列 2", "列 3"],
          ["", "", ""],
          ["", "", ""],
        ],
      ),
      align = [...(existing?.align || ["left", "left", "left"])];
    const capture = () =>
      document.querySelectorAll("#md-grid [data-r]").forEach((el) => {
        rows[+el.dataset.r][+el.dataset.c] = el.value;
      });
    const draw = () => {
      $("#md-grid").innerHTML =
        `<div class="table-scroll"><table><thead><tr><th>行</th>${rows[0]
          .map(
            (_, c) =>
              `<th><select data-align="${c}" aria-label="第 ${c + 1} 列对齐">${options(
                [
                  ["left", "左对齐"],
                  ["center", "居中"],
                  ["right", "右对齐"],
                ],
                align[c] || "left",
              )}</select><div class="actions"><button type="button" data-op="col-left" data-col="${c}" aria-label="左移第 ${c + 1} 列">←</button><button type="button" data-op="col-right" data-col="${c}" aria-label="右移第 ${c + 1} 列">→</button><button type="button" data-op="col-delete" data-col="${c}" aria-label="删除第 ${c + 1} 列">×</button></div></th>`,
          )
          .join(
            "",
          )}</tr></thead><tbody>${rows.map((r, i) => `<tr><th>${i === 0 ? "表头" : `<div class="actions"><button type="button" data-op="row-up" data-row="${i}" aria-label="上移第 ${i} 行">↑</button><button type="button" data-op="row-down" data-row="${i}" aria-label="下移第 ${i} 行">↓</button><button type="button" data-op="row-delete" data-row="${i}" aria-label="删除第 ${i} 行">×</button></div>`}</th>${r.map((v, c) => `<td><textarea rows="2" data-r="${i}" data-c="${c}" aria-label="第 ${i + 1} 行第 ${c + 1} 列">${esc(v)}</textarea></td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    };
    modal(
      existing ? "编辑文档表格" : "插入文档表格",
      `<div class="table-builder">${!existing && tables.length ? `<label>已有表格<select id="existing-md-table"><option value="">新建表格</option>${tables.map((t, i) => `<option value="${i}">${esc(t.rows[0].join(" · "))}</option>`).join("")}</select></label>` : ""}<div class="actions"><button type="button" data-op="row-add">添加行</button><button type="button" data-op="col-add">添加列</button></div><div id="md-grid"></div><details><summary>粘贴表格</summary><textarea id="md-paste" placeholder="粘贴 Excel 单元格、CSV 或 TSV" aria-label="表格数据"></textarea><button type="button" data-op="paste">替换表格</button></details><p role="alert" id="table-error"></p></div>`,
      async () => {
        capture();
        const md = toMarkdownTable(rows, align);
        noteCheckpoint(n);
        n.body =
          n.body.slice(0, start) +
          (start && !n.body.slice(0, start).endsWith("\n\n") ? "\n\n" : "") +
          md +
          "\n" +
          n.body.slice(end);
        await touch(n);
      },
      existing ? "保存表格" : "插入表格",
    );
    draw();
    if ($("#existing-md-table"))
      $("#existing-md-table").onchange = (e) => {
        if (e.target.value !== "") markdownTableEditor(+e.target.value);
      };
    $(".table-builder").onclick = (e) => {
      const b = e.target.closest("[data-op]");
      if (!b) return;
      capture();
      const op = b.dataset.op,
        c = +b.dataset.col,
        r = +b.dataset.row;
      try {
        if (op === "row-add") {
          if (rows.length >= 2001) throw Error("最多 2000 行");
          rows.push(rows[0].map(() => ""));
        }
        if (op === "col-add") {
          if (rows[0].length >= 30) throw Error("最多 30 列");
          rows.forEach((row, i) =>
            row.push(i === 0 ? `列 ${row.length + 1}` : ""),
          );
          align.push("left");
        }
        if (op === "row-delete") rows.splice(r, 1);
        if (op === "col-delete") {
          if (rows[0].length === 1) throw Error("至少保留一列");
          rows.forEach((row) => row.splice(c, 1));
          align.splice(c, 1);
        }
        if (op === "row-up" && r > 1)
          [rows[r], rows[r - 1]] = [rows[r - 1], rows[r]];
        if (op === "row-down" && r < rows.length - 1)
          [rows[r], rows[r + 1]] = [rows[r + 1], rows[r]];
        const to = op === "col-left" ? c - 1 : op === "col-right" ? c + 1 : -1;
        if (to >= 0 && to < rows[0].length) {
          rows.forEach((row) => {
            [row[c], row[to]] = [row[to], row[c]];
          });
          [align[c], align[to]] = [align[to], align[c]];
        }
        if (op === "paste") {
          rows = parseDelimited($("#md-paste").value);
          align = rows[0].map(() => "left");
        }
        $("#table-error").textContent = "";
        draw();
      } catch (err) {
        $("#table-error").textContent = err.message;
      }
    };
    $("#md-grid").onchange = (e) => {
      if (e.target.dataset.align !== undefined)
        align[+e.target.dataset.align] = e.target.value;
    };
    $("#md-grid").onpaste = (e) => {
      if (!e.target.matches("[data-r]")) return;
      const text = e.clipboardData?.getData("text/plain");
      if (!text?.includes("\t")) return;
      e.preventDefault();
      capture();
      try {
        const pasted = parseDelimited(text, "\t"),
          r = +e.target.dataset.r,
          c = +e.target.dataset.c;
        if (r + pasted.length > 2001 || c + pasted[0].length > 30)
          throw Error("表格最多 30 列、2000 行");
        const width = Math.max(rows[0].length, c + pasted[0].length);
        rows = rows.map((row) =>
          Array.from({ length: width }, (_, i) => row[i] || ""),
        );
        while (rows.length < r + pasted.length)
          rows.push(Array(width).fill(""));
        pasted.forEach((row, i) =>
          row.forEach((v, j) => (rows[r + i][c + j] = v)),
        );
        draw();
      } catch (err) {
        $("#table-error").textContent = err.message;
      }
    };
  }
  function dataEditor(id) {
    const n = note(),
      original = n.tables?.find((t) => t.id === id);
    let t = structuredClone(
      original || {
        id: uid(),
        title: "新建数据表",
        columns: [
          { id: uid(), title: "名称", type: "text", options: [] },
          {
            id: uid(),
            title: "状态",
            type: "status",
            options: ["待开始", "进行中", "已完成"],
          },
        ],
        rows: [],
        view: {},
      },
    );
    const error = (err) => ($("#table-error").textContent = err.message);
    function capture() {
      t.title = $("#dt-title").value;
      document
        .querySelectorAll("[data-col-title]")
        .forEach(
          (el) =>
            (t.columns.find((c) => c.id === el.dataset.colTitle).title =
              el.value),
        );
      document.querySelectorAll("[data-cell]").forEach((el) => {
        const row = t.rows.find((r) => r.id === el.dataset.row);
        row.cells[el.dataset.cell] =
          el.type === "checkbox" ? el.checked : el.value;
      });
    }
    function input(c, r) {
      const v = r.cells[c.id] ?? "",
        attr = `data-cell="${c.id}" data-row="${r.id}" aria-label="${esc(c.title)}"`;
      if (["status", "project", "task"].includes(c.type)) {
        const opts =
          c.type === "status"
            ? c.options.map((v) => [v, v])
            : live(
                ctx.state(),
                c.type === "project" ? "projects" : "tasks",
                true,
              ).map((x) => [x.id, x.title]);
        if (v && !opts.some(([id]) => id === v)) opts.push([v, label(c, v)]);
        return `<select ${attr}>${options([["", "未选择"], ...opts], v)}</select>`;
      }
      if (c.type === "checkbox")
        return `<input type="checkbox" ${attr} ${v === true || v === "true" ? "checked" : ""}>`;
      if (c.type === "text")
        return `<textarea rows="2" ${attr}>${esc(v)}</textarea>`;
      return `<input ${attr} type="${c.type === "date" ? "date" : "number"}" ${c.type === "money" ? 'step="0.01"' : 'step="any"'} value="${esc(v)}">`;
    }
    function draw() {
      $("#dt-columns").innerHTML = t.columns
        .map(
          (c, i) =>
            `<div class="column-editor"><input data-col-title="${c.id}" value="${esc(c.title)}" aria-label="字段名称"><select data-col-type="${c.id}" aria-label="字段类型">${options(Object.entries(columnTypes), c.type)}</select>${c.type === "status" ? `<input data-col-options="${c.id}" value="${esc(c.options.join("，"))}" aria-label="状态选项" placeholder="状态，用逗号分隔">` : ""}<div class="actions"><button type="button" data-op="col-up" data-col="${i}" aria-label="左移字段">←</button><button type="button" data-op="col-down" data-col="${i}" aria-label="右移字段">→</button><button type="button" data-op="col-delete" data-col="${i}">删除列</button></div></div>`,
        )
        .join("");
      $("#dt-grid").innerHTML =
        `<div class="table-scroll"><table><thead><tr><th>操作</th>${t.columns.map((c) => `<th>${esc(c.title)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r, i) => `<tr><td><div class="actions"><button type="button" data-op="row-up" data-row="${i}" aria-label="上移行">↑</button><button type="button" data-op="row-down" data-row="${i}" aria-label="下移行">↓</button><button type="button" data-op="row-delete" data-row="${i}" aria-label="删除行">×</button></div></td>${t.columns.map((c) => `<td>${input(c, r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    modal(
      original ? "编辑数据表" : "新建数据表",
      `<div class="data-builder"><label>表格名称<input id="dt-title" value="${esc(t.title)}" required maxlength="200"></label><details open><summary>字段</summary><div id="dt-columns"></div><button type="button" data-op="col-add">添加字段</button></details><div class="actions"><button type="button" data-op="row-add">添加记录</button></div><div id="dt-grid"></div><details><summary>导入表格</summary><textarea id="dt-paste" placeholder="粘贴 Excel 单元格、CSV 或 TSV（首行为字段名）" aria-label="导入数据"></textarea><label>选择 CSV / TSV 文件<input id="dt-file" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values"></label><div class="actions"><button type="button" data-op="import-append">追加记录</button><button type="button" data-op="import-replace">替换表格</button></div></details><p role="alert" id="table-error"></p></div>`,
      async () => {
        capture();
        const cleaned = cleanTables([t])[0];
        noteCheckpoint(n);
        n.tables ??= [];
        const index = n.tables.findIndex((x) => x.id === t.id);
        if (index >= 0) n.tables[index] = cleaned;
        else {
          if (n.tables.length >= 30) throw Error("每篇文档最多 30 个数据表");
          n.tables.push(cleaned);
        }
        await touch(n);
      },
    );
    draw();
    $("#dt-file").onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) throw Error("请选择 5 MB 以内的表格");
        $("#dt-paste").value = await file.text();
      } catch (err) {
        error(err);
      }
    };
    $(".data-builder").onchange = (e) => {
      const id = e.target.dataset.colType || e.target.dataset.colOptions;
      if (!id) return;
      capture();
      const c = t.columns.find((c) => c.id === id),
        old = structuredClone(c);
      try {
        if (e.target.dataset.colType) {
          c.type = e.target.value;
          if (c.type === "status" && !c.options.length)
            c.options = ["待开始", "进行中", "已完成"];
        } else c.options = noteTags(e.target.value);
        const converted = t.rows.map((r) => cleanCell(r.cells[c.id], c));
        t.rows.forEach((r, i) => (r.cells[c.id] = converted[i]));
        $("#table-error").textContent = "";
        draw();
      } catch (err) {
        Object.assign(c, old);
        error(err);
        draw();
      }
    };
    $(".data-builder").onclick = (e) => {
      const b = e.target.closest("[data-op]");
      if (!b) return;
      capture();
      const op = b.dataset.op,
        c = +b.dataset.col,
        r = +b.dataset.row;
      try {
        if (op === "col-add") {
          if (t.columns.length >= 30) throw Error("最多 30 列");
          t.columns.push({
            id: uid(),
            title: `字段 ${t.columns.length + 1}`,
            type: "text",
            options: [],
          });
        }
        if (op === "row-add") {
          if (t.rows.length >= 2000) throw Error("最多 2000 行");
          t.rows.push({ id: uid(), cells: {} });
        }
        if (op === "col-delete") {
          if (t.columns.length === 1) throw Error("至少保留一个字段");
          t.columns.splice(c, 1);
        }
        if (op === "row-delete") t.rows.splice(r, 1);
        if (op === "row-up" && r > 0)
          [t.rows[r], t.rows[r - 1]] = [t.rows[r - 1], t.rows[r]];
        if (op === "row-down" && r < t.rows.length - 1)
          [t.rows[r], t.rows[r + 1]] = [t.rows[r + 1], t.rows[r]];
        if (op === "col-up" && c > 0)
          [t.columns[c], t.columns[c - 1]] = [t.columns[c - 1], t.columns[c]];
        if (op === "col-down" && c < t.columns.length - 1)
          [t.columns[c], t.columns[c + 1]] = [t.columns[c + 1], t.columns[c]];
        if (op.startsWith("import-")) {
          const data = parseDelimited($("#dt-paste").value);
          if (op === "import-replace") {
            t.columns = data[0].map((title) => ({
              id: uid(),
              title: title || "未命名列",
              type: "text",
              options: [],
            }));
            t.rows = [];
            t.view = {};
          }
          const mapping = t.columns.map((c, index) =>
            op === "import-replace"
              ? index
              : data[0].findIndex((title) => title === c.title),
          );
          if (
            op === "import-append" &&
            new Set(data[0]).size !== data[0].length
          )
            throw Error("追加导入时，字段名称不能重复");
          if (mapping.every((i) => i < 0))
            throw Error("首行需要包含已有字段名称");
          const imported = data.slice(1).map((row) => ({
            id: uid(),
            cells: Object.fromEntries(
              t.columns.map((c, j) => {
                let v = mapping[j] < 0 ? "" : row[mapping[j]];
                if (c.type === "project" || c.type === "task") {
                  const items = live(
                      ctx.state(),
                      c.type === "project" ? "projects" : "tasks",
                      true,
                    ),
                    matches = items.filter((x) => x.id === v || x.title === v);
                  if (v && matches.length !== 1)
                    throw Error(c.title + "需匹配唯一的项目或任务名称");
                  v = matches[0]?.id || "";
                }
                if (c.type === "checkbox")
                  v = ["true", "1", "是", "已勾选", "✓"].includes(v);
                return [c.id, cleanCell(v, c)];
              }),
            ),
          }));
          if (t.rows.length + imported.length > 2000)
            throw Error("最多 2000 行");
          t.rows.push(...imported);
        }
        $("#table-error").textContent = "";
        draw();
      } catch (err) {
        error(err);
      }
    };
  }
  function exportTable(t) {
    const cell = (v) => {
      let s = String(v ?? "");
      if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv = [
      t.columns.map((c) => c.title),
      ...tableRows(t, label).map((r) =>
        t.columns.map((c) => label(c, r.cells[c.id])),
      ),
    ]
      .map((r) => r.map(cell).join(","))
      .join("\r\n");
    download(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
      safeName(t.title) + ".csv",
    );
  }
  const safeName = (s) =>
    String(s || "文档")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .slice(0, 100);
  function exportNote(n) {
    modal(
      "导出文档",
      select("格式", "format", [
        ["markdown", "Markdown (.md)"],
        ["pdf", "PDF / 打印"],
      ]),
      async (v) => {
        const tables = (n.tables || [])
          .map(
            (t) =>
              "\n\n## " +
              t.title +
              "\n\n" +
              toMarkdownTable([
                t.columns.map((c) => c.title),
                ...t.rows.map((r) =>
                  t.columns.map((c) => label(c, r.cells[c.id])),
                ),
              ]),
          )
          .join("");
        if (v.format === "markdown")
          download(
            new Blob(["# " + n.title + "\n\n" + n.body + tables], {
              type: "text/markdown;charset=utf-8",
            }),
            safeName(n.title) + ".md",
          );
        else {
          $("#document-print")?.remove();
          const root = document.createElement("article");
          root.id = "document-print";
          root.innerHTML =
            "<h1>" + esc(n.title) + "</h1>" + ctx.markdown(n.body + tables);
          document.body.append(root);
          root
            .querySelectorAll("button")
            .forEach((b) =>
              b.replaceWith(document.createTextNode(b.textContent)),
            );
          root.querySelectorAll("details").forEach((el) => (el.open = true));
          await Promise.all(
            [...root.querySelectorAll("img")].map((img) =>
              img.decode().catch(() => {}),
            ),
          );
          const originalTitle = document.title;
          document.title = n.title;
          try {
            window.print();
          } finally {
            document.title = originalTitle;
            root.remove();
          }
        }
      },
      "导出",
    );
  }
  function historyHTML(n) {
    const diffHTML = (lines) =>
      `<div class="history-diff">${lines.map((l) => `<div class="diff-${l.type}"><span>${l.type === "added" ? "+" : l.type === "removed" ? "−" : " "}</span>${esc(l.text) || " "}</div>`).join("")}</div>`;
    const tableText = (tables) =>
      (tables || [])
        .map((t) =>
          [
            t.title,
            t.columns
              .map((c) => c.title + "（" + columnTypes[c.type] + "）")
              .join(" | "),
            ...t.rows.map((r) =>
              t.columns.map((c) => label(c, r.cells[c.id])).join(" | "),
            ),
          ].join("\n"),
        )
        .join("\n\n");
    return (
      (n.history || [])
        .map((h, i) => {
          const diff = lineDiff(h.body, n.body),
            metadata =
              h.projects &&
              JSON.stringify(h.projects) !== JSON.stringify(noteProjects(n)),
            tables =
              h.tables &&
              JSON.stringify(h.tables) !== JSON.stringify(n.tables || []);
          return `<details><summary>${esc(h.at.replace("T", " ").slice(0, 19))} · ${esc(h.title)}</summary><div class="diff-legend"><span>− 历史版本</span><span>+ 当前版本</span></div>${h.title !== n.title ? `<p>标题：${esc(h.title)} → ${esc(n.title)}</p>` : ""}${metadata ? `<p>项目：${esc(h.projects.map(ctx.projectName).join("、") || "无")} → ${esc(noteProjects(n).map(ctx.projectName).join("、") || "无")}</p>` : ""}${JSON.stringify(h.tags || []) !== JSON.stringify(n.tags || []) ? `<p>标签：${esc((h.tags || []).join("、") || "无")} → ${esc((n.tags || []).join("、") || "无")}</p>` : ""}${h.status && h.status !== n.status ? "<p>状态已变化</p>" : ""}${diffHTML(diff)}${tables ? `<details><summary>数据表变更</summary>${diffHTML(lineDiff(tableText(h.tables), tableText(n.tables)))}</details>` : ""}${button("恢复此版本", "restore-version", n.id, `data-index="${i}"`)}</details>`;
        })
        .join("") || "<p>还没有旧版本</p>"
    );
  }
  async function route(action, id, b) {
    if (!action.startsWith("doc-") && !action.startsWith("dt-")) return false;
    const n = note();
    if (action === "doc-template") {
      modal(
        "新建文档",
        select(
          "模板",
          "template",
          Object.entries(documentTemplates).map(([id, [title]]) => [id, title]),
        ),
        async (v) => {
          ctx.newNote();
          const n = note(),
            [title, body] =
              documentTemplates[v.template] || documentTemplates.blank;
          n.title = v.template === "blank" ? "未命名文档" : title;
          n.body = body;
          await touch(n);
        },
        "创建",
      );
      return true;
    }
    if (!n) return true;
    if (!ctx.canEdit()) {
      message("请先处理标签页冲突");
      return true;
    }
    switch (action) {
      case "doc-panel":
        mode = id;
        $(".editor-body .markdown-tools").outerHTML = sidebarHTML(
          n,
          ctx.isPreview(),
        );
        refreshOutline();
        break;
      case "doc-heading": {
        const h = headings(n.body)[Number(id)];
        if (!h) break;
        if (ctx.isPreview())
          $("#note-preview")
            .querySelectorAll("h1,h2,h3,h4,h5,h6")
            [Number(id)]?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
        else {
          const body = $("#note-body");
          body.focus();
          body.setSelectionRange(h.offset, h.offset);
          const ratio = h.offset / Math.max(body.value.length, 1);
          body.scrollTop = ratio * (body.scrollHeight - body.clientHeight);
        }
        break;
      }
      case "doc-expand-projects":
        expanded = !expanded;
        $(".note-projects").outerHTML = projectChips(n);
        break;
      case "doc-project":
        ctx.openProject(id);
        break;
      case "doc-projects":
        projectPicker(n);
        break;
      case "doc-properties":
        properties(n);
        break;
      case "doc-export":
        exportNote(n);
        break;
      case "doc-link":
        linkPicker();
        break;
      case "doc-table":
        markdownTableEditor();
        break;
      case "doc-insert-template":
        insert("\n\n" + documentTemplates[id][1]);
        break;
      case "doc-format": {
        const body = $("#note-body"),
          s = body.value.slice(body.selectionStart, body.selectionEnd);
        const text = {
          checklist: s
            ? s
                .split("\n")
                .map((l) => "- [ ] " + l)
                .join("\n")
            : "- [ ] ",
          strike: "~~" + s + "~~",
          highlight: "<mark>" + esc(s) + "</mark>",
          collapse:
            "\n<details>\n<summary>展开内容</summary>\n\n" +
            s +
            "\n\n</details>\n",
          callout: "\n> **提示**\n> " + s.replace(/\n/g, "\n> ") + "\n",
        }[id];
        if (text !== undefined) insert(text);
        break;
      }
      case "dt-new":
        dataEditor();
        break;
      case "dt-edit":
        dataEditor(id);
        break;
      case "dt-export": {
        const t = n.tables?.find((t) => t.id === id);
        if (t) exportTable(t);
        break;
      }
      case "dt-delete": {
        const t = n.tables?.find((t) => t.id === id);
        if (t)
          modal(
            "删除数据表",
            `<p>${esc(t.title)}</p>`,
            async () => {
              noteCheckpoint(n);
              n.tables = n.tables.filter((t) => t.id !== id);
              await touch(n);
            },
            "确认删除",
          );
        break;
      }
    }
    return true;
  }
  return { enhance, route, refreshOutline, historyHTML };
}
