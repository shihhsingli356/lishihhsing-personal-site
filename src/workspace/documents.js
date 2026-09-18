export const columnTypes = {
  text: "文本",
  number: "数字",
  money: "金额",
  date: "日期",
  status: "状态",
  checkbox: "勾选",
  project: "项目",
  task: "任务",
};
export const noteProjects = (n) => [
  ...new Set(
    Array.isArray(n.projects) ? n.projects : n.project ? [n.project] : [],
  ),
];
export const noteSnapshot = (n) => ({
  title: n.title,
  body: n.body,
  projects: noteProjects(n),
  tags: [...(n.tags || [])],
  status: n.status || "draft",
  tables: structuredClone(n.tables || []),
});
export const noteTags = (text) =>
  [
    ...new Set(
      String(text || "")
        .split(/[,，\n]/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ].slice(0, 50);
export function cleanTables(value = []) {
  if (!Array.isArray(value) || value.length > 30) throw Error("数据表格式无效");
  const ids = new Set();
  return value.map((t) => {
    if (!t || !/^[\w-]{1,100}$/.test(t.id) || ids.has(t.id))
      throw Error("数据表标识无效");
    ids.add(t.id);
    if (
      !Array.isArray(t.columns) ||
      !t.columns.length ||
      t.columns.length > 30 ||
      !Array.isArray(t.rows) ||
      t.rows.length > 2000
    )
      throw Error("数据表最多 30 列、2000 行");
    const colIds = new Set();
    const columns = t.columns.map((c) => {
      if (
        !c ||
        !/^[\w-]{1,100}$/.test(c.id) ||
        ["__proto__", "constructor", "prototype"].includes(c.id) ||
        colIds.has(c.id) ||
        !Object.hasOwn(columnTypes, c.type)
      )
        throw Error("数据表列无效");
      colIds.add(c.id);
      return {
        id: c.id,
        title: String(c.title || "未命名列").slice(0, 100),
        type: c.type,
        options: Array.isArray(c.options)
          ? [...new Set(c.options.map(String))].slice(0, 50)
          : ["待开始", "进行中", "已完成"],
      };
    });
    const rowIds = new Set();
    const rows = t.rows.map((r) => {
      if (!r || !/^[\w-]{1,100}$/.test(r.id) || rowIds.has(r.id))
        throw Error("数据表行无效");
      rowIds.add(r.id);
      const cells = {};
      for (const c of columns)
        cells[c.id] = cleanCell(r.cells?.[c.id] ?? "", c);
      return { id: r.id, cells };
    });
    return {
      id: t.id,
      title: String(t.title || "数据表").slice(0, 200),
      columns,
      rows,
      view: {
        query: String(t.view?.query || ""),
        column: colIds.has(t.view?.column) ? t.view.column : "",
        operator: [
          "contains",
          "eq",
          "ne",
          "gt",
          "gte",
          "lt",
          "lte",
          "empty",
          "filled",
        ].includes(t.view?.operator)
          ? t.view.operator
          : "contains",
        value: String(t.view?.value || ""),
        sort: colIds.has(t.view?.sort) ? t.view.sort : "",
        direction: t.view?.direction === "desc" ? "desc" : "asc",
      },
    };
  });
}
export function cleanCell(value, column) {
  if (column.type === "checkbox") {
    if (![true, false, "true", "false", "", null, undefined].includes(value))
      throw Error(column.title + "需要勾选值");
    return value === true || value === "true";
  }
  if (value === "" || value == null) return "";
  if (["number", "money"].includes(column.type)) {
    if (
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(value)) ||
      !Number.isFinite(Number(value))
    )
      throw Error(column.title + "需要有效数字");
    const number = Number(value);
    if (Math.abs(number) > 1e12) throw Error(column.title + "数值过大");
    return column.type === "money"
      ? (Math.sign(number) *
          Math.round((Math.abs(number) + Number.EPSILON) * 100)) /
          100
      : number;
  }
  const text = String(value).slice(0, 10000);
  if (
    column.type === "date" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(text) ||
      !Number.isFinite(Date.parse(text + "T12:00:00Z")) ||
      new Date(text + "T12:00:00Z").toISOString().slice(0, 10) !== text)
  )
    throw Error(column.title + "日期无效");
  if (column.type === "status" && !column.options.includes(text))
    throw Error(column.title + "不在状态选项中");
  return text;
}
export function tableRows(table, label = (_, v) => String(v ?? "")) {
  const v = table.view || {};
  const filterColumn = table.columns.find((c) => c.id === v.column);
  const matches = (r) => {
    if (!filterColumn) return true;
    const raw = r.cells[filterColumn.id],
      text = label(filterColumn, raw).toLowerCase(),
      value = (v.value || "").toLowerCase();
    if (v.operator === "empty") return raw === "" || raw === undefined;
    if (v.operator === "filled") return raw !== "" && raw !== undefined;
    if (!value) return true;
    if (v.operator === "eq") return text === value;
    if (v.operator === "ne") return text !== value;
    if (["gt", "gte", "lt", "lte"].includes(v.operator)) {
      if (raw === "" || raw == null) return false;
      const numeric = ["number", "money"].includes(filterColumn.type),
        a = numeric ? Number(raw) : text,
        b = numeric ? Number(value) : value;
      if (numeric && !Number.isFinite(b)) return false;
      return v.operator === "gt"
        ? a > b
        : v.operator === "gte"
          ? a >= b
          : v.operator === "lt"
            ? a < b
            : a <= b;
    }
    return text.includes(value);
  };
  const rows = table.rows.filter(
    (r) =>
      (!v.query ||
        table.columns.some((c) =>
          label(c, r.cells[c.id]).toLowerCase().includes(v.query.toLowerCase()),
        )) &&
      matches(r),
  );
  const col = table.columns.find((c) => c.id === v.sort);
  if (col)
    rows.sort((a, b) => {
      const av = a.cells[col.id],
        bv = b.cells[col.id];
      if (av === "" && bv !== "") return 1;
      if (bv === "" && av !== "") return -1;
      const result = ["number", "money", "checkbox"].includes(col.type)
        ? Number(av) - Number(bv)
        : label(col, av).localeCompare(label(col, bv), "zh-CN", {
            numeric: true,
          });
      return result * (v.direction === "desc" ? -1 : 1);
    });
  return rows;
}
export function numericStats(rows, column) {
  const values = rows
    .map((r) => r.cells[column.id])
    .filter((v) => v !== "" && Number.isFinite(Number(v)))
    .map(Number);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    sum,
    average: values.length ? sum / values.length : 0,
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
  };
}
export function parseDelimited(text, delimiter) {
  text = String(text)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  delimiter ||= text.includes("\t") ? "\t" : ",";
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || !cell) quoted = !quoted;
      else cell += ch;
    } else if (!quoted && (ch === delimiter || ch === "\n")) {
      row.push(cell);
      cell = "";
      if (ch === "\n") {
        rows.push(row);
        row = [];
      }
    } else cell += ch;
  }
  if (quoted) throw Error("引号未闭合");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length || rows.length > 2001 || rows.some((r) => r.length > 30))
    throw Error("表格最多 30 列、2000 行");
  const width = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => Array.from({ length: width }, (_, i) => r[i] || ""));
}
const splitRow = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) =>
      c
        .trim()
        .replace(/\\\|/g, "|")
        .replace(/<br\s*\/?\s*>/gi, "\n")
        .replace(/&#92;/g, "\\")
        .replace(/&amp;/g, "&"),
    );
export function markdownTables(text) {
  const lines = String(text).split("\n"),
    result = [];
  let offset = 0,
    fenced = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fenced = !fenced;
    if (
      !fenced &&
      lines[i].includes("|") &&
      i + 1 < lines.length &&
      splitRow(lines[i + 1]).every((c) => /^:?-{3,}:?$/.test(c)) &&
      splitRow(lines[i + 1]).length === splitRow(lines[i]).length
    ) {
      const start = offset,
        rows = [splitRow(lines[i])],
        align = splitRow(lines[i + 1]).map((c) =>
          c.startsWith(":") && c.endsWith(":")
            ? "center"
            : c.endsWith(":")
              ? "right"
              : "left",
        );
      offset += lines[i].length + 1 + lines[i + 1].length + 1;
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        offset += lines[i].length + 1;
        i++;
      }
      i--;
      const width = rows[0].length;
      result.push({
        start,
        end: Math.min(text.length, offset),
        rows: rows.map((r) =>
          Array.from({ length: width }, (_, j) => r[j] || ""),
        ),
        align,
      });
    } else offset += lines[i].length + 1;
  }
  return result;
}
export function toMarkdownTable(rows, align = []) {
  if (!rows.length || !rows[0].length) throw Error("表格不能为空");
  const encode = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/\\/g, "&#92;")
      .replace(/\|/g, "\\|")
      .replace(/\r?\n/g, "<br>");
  const line = (r) => "| " + r.map(encode).join(" | ") + " |";
  return (
    [
      line(rows[0]),
      line(
        rows[0].map((_, i) =>
          align[i] === "center"
            ? ":---:"
            : align[i] === "right"
              ? "---:"
              : "---",
        ),
      ),
      ...rows.slice(1).map(line),
    ].join("\n") + "\n"
  );
}
export function headings(text) {
  let offset = 0,
    fenced = false;
  const result = [];
  for (const line of String(text).split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const match = !fenced && /^(#{1,6})\s+(.+?)(?:\s+#+)?$/.exec(line);
    if (match) result.push({ level: match[1].length, title: match[2], offset });
    offset += line.length + 1;
  }
  return result;
}
export const wikiLinks = (text) =>
  [
    ...String(text)
      .replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1[^\n]*$/gm, "")
      .replace(/`+[^`]*`+/g, "")
      .matchAll(/\[\[([^\]\n]+)\]\]/g),
  ].map((m) => ({
    target: m[1].split("|")[0].trim(),
    label: (m[1].split("|")[1] || m[1].split("|")[0]).trim(),
  }));
export const resolveNote = (notes, target) =>
  notes.find((n) => !n.deletedAt && n.id === target) ||
  notes.find((n) => !n.deletedAt && n.title === target);
export function lineDiff(before, after) {
  const a = String(before).split("\n"),
    b = String(after).split("\n");
  if (a.length * b.length > 1000000)
    return [
      ...a.map((text) => ({ type: "removed", text })),
      ...b.map((text) => ({ type: "added", text })),
    ];
  const dp = Array.from(
    { length: a.length + 1 },
    () => new Uint32Array(b.length + 1),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0,
    j = 0;
  const result = [];
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      result.push({ type: "same", text: a[i++] });
      j++;
    } else if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j]))
      result.push({ type: "added", text: b[j++] });
    else result.push({ type: "removed", text: a[i++] });
  }
  return result;
}
