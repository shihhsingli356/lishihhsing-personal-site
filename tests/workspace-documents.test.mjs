import test from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  emptyState,
  noteCheckpoint,
  importCopy,
  live,
} from "../src/workspace/core.js";
import {
  cleanTables,
  cleanCell,
  noteProjects,
  noteSnapshot,
  tableRows,
  numericStats,
  parseDelimited,
  markdownTables,
  toMarkdownTable,
  headings,
  wikiLinks,
  resolveNote,
  lineDiff,
} from "../src/workspace/documents.js";

const table = () => ({
  id: "table1",
  title: "研究资料",
  columns: [
    { id: "title", title: "名称", type: "text" },
    { id: "cost", title: "费用", type: "money" },
    { id: "project", title: "项目", type: "project" },
    { id: "task", title: "任务", type: "task" },
  ],
  rows: [
    {
      id: "r1",
      cells: { title: "资料A", cost: "12.50", project: "p1", task: "t1" },
    },
    { id: "r2", cells: { title: "资料B", cost: "5", project: "p2", task: "" } },
  ],
});
function sample() {
  return {
    ...emptyState(),
    projects: [
      { id: "p1", title: "项目一" },
      { id: "p2", title: "项目二" },
    ],
    tasks: [{ id: "t1", title: "任务一", project: "p1" }],
    notes: [
      {
        id: "n1",
        title: "文档",
        type: "document",
        project: "p1",
        body: "内容",
      },
    ],
  };
}

test("legacy notes migrate to multiple projects without losing a single association", () => {
  const s = normalize({ ...sample(), version: 2 });
  assert.equal(s.version, 3);
  assert.deepEqual(s.notes[0].projects, ["p1"]);
  s.notes[0].projects = ["p1", "p2", "missing", "p1"];
  s.notes[0].tags = ["研究", "研究"];
  s.notes[0].status = "done";
  s.notes[0].tables = [table()];
  const n = normalize(s).notes[0];
  assert.deepEqual(n.projects, ["p1", "p2"]);
  assert.deepEqual(n.tags, ["研究"]);
  assert.equal(n.tables[0].rows[0].cells.cost, 12.5);
  assert.equal(n.status, "done");
  n.projects = [];
  assert.deepEqual(noteProjects(n), []);
});
test("notes remain available when one of multiple linked projects is active", () => {
  const s = normalize(sample());
  s.notes[0].projects = ["p1", "p2"];
  s.projects[0].archived = true;
  assert.equal(live(s, "notes").length, 1);
  s.projects[1].deletedAt = "2026-01-01";
  assert.equal(live(s, "notes").length, 0);
  assert.equal(live(s, "notes", true).length, 1);
});
test("checkpoint includes and independently clones projects, properties and data tables", () => {
  const n = normalize(sample()).notes[0];
  n.tables = cleanTables([table()]);
  noteCheckpoint(n);
  noteCheckpoint(n);
  assert.equal(n.history.length, 1);
  n.projects.push("p2");
  n.tables[0].rows[0].cells.cost = 99;
  noteCheckpoint(n);
  assert.equal(n.history.length, 2);
  assert.equal(n.history[1].tables[0].rows[0].cells.cost, 12.5);
  assert.deepEqual(n.history[1].projects, ["p1"]);
  const roundtrip = normalize({ ...sample(), notes: [n] }).notes[0];
  assert.deepEqual(noteSnapshot(roundtrip), noteSnapshot(n));
  assert.equal(roundtrip.history[1].tables[0].rows[0].cells.cost, 12.5);
});
test("copy import remaps many-project associations, wiki IDs, table cells and history references", () => {
  const incoming = sample();
  incoming.notes[0].projects = ["p1", "p2"];
  incoming.notes[0].tables = [table()];
  incoming.notes[0].body = "[[n1|文档]]";
  noteCheckpoint(incoming.notes[0]);
  const s = importCopy(emptyState(), normalize(incoming)),
    n = s.notes[0];
  assert.deepEqual(
    n.projects,
    s.projects.map((p) => p.id),
  );
  assert.equal(n.project, s.projects[0].id);
  assert.equal(n.tables[0].rows[0].cells.project, s.projects[0].id);
  assert.equal(n.tables[0].rows[0].cells.task, s.tasks[0].id);
  assert.equal(n.body, `[[${n.id}|文档]]`);
  assert.equal(n.history[0].tables[0].rows[0].cells.task, s.tasks[0].id);
});
test("typed cells validate numbers, status, dates and checkboxes", () => {
  assert.equal(cleanCell("1.239", { type: "money", title: "金额" }), 1.24);
  assert.equal(
    cleanCell("2024-02-29", { type: "date", title: "日期" }),
    "2024-02-29",
  );
  for (const value of ["2025-02-29", "2024-13-01", "x"])
    assert.throws(() => cleanCell(value, { type: "date", title: "日期" }));
  assert.throws(() => cleanCell("abc", { type: "number", title: "数字" }));
  assert.throws(() => cleanCell("Infinity", { type: "number", title: "数字" }));
  assert.throws(() => cleanCell("lost", { type: "checkbox", title: "勾选" }));
  assert.equal(cleanCell("true", { type: "checkbox" }), true);
  assert.throws(() =>
    cleanCell("无效", { type: "status", title: "状态", options: ["已完成"] }),
  );
});
test("malformed and prototype-sensitive tables fail before modifying state", () => {
  const t = table();
  t.columns[0].id = "__proto__";
  assert.throws(() => cleanTables([t]));
  const duplicate = table();
  duplicate.rows.push(duplicate.rows[0]);
  assert.throws(() => cleanTables([duplicate]));
  const s = sample();
  s.notes[0].tables = [duplicate];
  const before = JSON.stringify(s);
  assert.throws(() => normalize(s));
  assert.equal(JSON.stringify(s), before);
});
test("filters use relationship labels, sort numerically and summarize filtered rows", () => {
  const t = cleanTables([table()])[0];
  t.view.sort = "cost";
  assert.deepEqual(
    tableRows(t).map((r) => r.id),
    ["r2", "r1"],
  );
  t.view.direction = "desc";
  assert.deepEqual(
    tableRows(t).map((r) => r.id),
    ["r1", "r2"],
  );
  t.view.query = "项目一";
  const rows = tableRows(t, (c, v) =>
    c.type === "project" ? { p1: "项目一", p2: "项目二" }[v] : String(v),
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(numericStats(rows, t.columns[1]), {
    count: 1,
    sum: 12.5,
    average: 12.5,
    min: 12.5,
    max: 12.5,
  });
});
test("numeric, exact and empty filters preserve zero and ignore blank amounts", () => {
  const t = cleanTables([table()])[0];
  t.rows.push(
    { id: "blank", cells: { title: "空", cost: "" } },
    { id: "zero", cells: { title: "零", cost: 0 } },
  );
  t.view = { column: "cost", operator: "gte", value: "10" };
  assert.deepEqual(
    tableRows(t).map((r) => r.id),
    ["r1"],
  );
  t.view = { column: "cost", operator: "lt", value: "1" };
  assert.deepEqual(
    tableRows(t).map((r) => r.id),
    ["zero"],
  );
  t.view.operator = "empty";
  assert.deepEqual(
    tableRows(t).map((r) => r.id),
    ["blank"],
  );
  t.view = { column: "title", operator: "eq", value: "资料A" };
  assert.deepEqual(
    tableRows(t).map((r) => r.id),
    ["r1"],
  );
});
test("CSV and spreadsheet paste preserve commas, quotes, unicode and multiline cells", () => {
  assert.deepEqual(
    parseDelimited('\uFEFF名称,备注\r\n"甲,乙","一行\r\n二行"\r\n"a""b",3'),
    [
      ["名称", "备注"],
      ["甲,乙", "一行\n二行"],
      ['a"b', "3"],
    ],
  );
  assert.deepEqual(parseDelimited("名称\t数值\n甲\t12\n乙\t"), [
    ["名称", "数值"],
    ["甲", "12"],
    ["乙", ""],
  ]);
  assert.throws(() => parseDelimited('"unfinished'));
  assert.throws(() => parseDelimited(Array(31).fill("x").join(",")));
});
test("Markdown tables roundtrip with alignments, escaped pipes and multiline cells", () => {
  const rows = [
      ["标题", "金额"],
      ["a|b", "一\n二"],
    ],
    md = toMarkdownTable(rows, ["center", "right"]),
    found = markdownTables(md);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].rows, rows);
  assert.deepEqual(found[0].align, ["center", "right"]);
  assert.equal(md.slice(found[0].start, found[0].end), md);
  assert.equal(markdownTables(toMarkdownTable([["唯一列"], ["值"]])).length, 1);
});
test("table replacement bounds exclude surrounding text and fenced examples", () => {
  const md =
    "before\n\n" +
    toMarkdownTable([
      ["A", "B"],
      ["1", "2"],
    ]) +
    "\nafter\n\n```\n| x | y |\n| --- | --- |\n```";
  const found = markdownTables(md);
  assert.equal(found.length, 1);
  assert.equal(md.slice(found[0].end).startsWith("\nafter"), true);
  assert.equal(md.slice(0, found[0].start), "before\n\n");
});
test("outline offsets and wiki backlinks ignore code samples", () => {
  const text =
    "# 标题\n\n```\n## 示例\n[[hidden]]\n```\n\n## 第二节\n[[n1|显示名]] `[[code]]`";
  const hs = headings(text);
  assert.equal(hs.length, 2);
  assert.equal(text.slice(hs[1].offset).startsWith("## 第二节"), true);
  assert.deepEqual(wikiLinks(text), [{ target: "n1", label: "显示名" }]);
  assert.equal(
    resolveNote([{ id: "n1", title: "改过名" }], "n1").title,
    "改过名",
  );
});
test("line diff reconstructs both history and current body", () => {
  const before = "a\nb\nc",
    after = "a\nx\nc\nd",
    diff = lineDiff(before, after);
  assert.equal(
    diff
      .filter((l) => l.type !== "added")
      .map((l) => l.text)
      .join("\n"),
    before,
  );
  assert.equal(
    diff
      .filter((l) => l.type !== "removed")
      .map((l) => l.text)
      .join("\n"),
    after,
  );
});
