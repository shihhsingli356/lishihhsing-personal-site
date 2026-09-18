import { marked } from "marked";
import DOMPurify from "dompurify";
import { createFeatures } from "./features.js";
import { focusStats } from "./activity.js";
import {
  collections,
  taskScheduleTypes,
  taskRepeatTypes,
  taskRepeatUnits,
  today,
  dayString,
  uid,
  addDays,
  validDay,
  dayDiff,
  normalize,
  emptyState,
  live,
  occurrences,
  overlaps,
  goalPreview,
  applyGoal,
  taskOccursOn,
  taskDoneOn,
  taskOccurrencesBetween,
  taskProgress,
  noteCheckpoint,
  importCopy,
} from "./core.js";
import {
  loadLocal,
  saveLocal,
  recoveryPoint,
  recoveryList,
  backupBlob,
  readBackup,
} from "./storage.js";

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let state = emptyState(),
  scope = "local",
  revision = 0,
  savedRevision = 0,
  baseRemote = 0;
let view = "today",
  projectId = "",
  noteId = "",
  selectedDay = today(),
  month = today().slice(0, 7),
  rangeMode = false,
  rangeStart = "",
  rangeEnd = "",
  search = "",
  archived = false,
  preview = false,
  rememberedNoteSelection = "";
let noteKind = "document";
let toastTimer,
  saveQueue = Promise.resolve(),
  persistError = false,
  tabConflict = false,
  editingHistory = null,
  editingNote = "",
  imported = null,
  undo = [],
  cloud = null;
let theme = "light";
const statusNames = {
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  cancelled: "已取消",
};
const repeatNames = { none: "不重复", daily: "每天", weekly: "每周同一天" };
const collectionNames = {
  projects: "项目",
  goals: "目标",
  tasks: "任务",
  notes: "笔记",
  events: "日程",
  ledger: "账目",
  focus: "专注记录",
  budgets: "预算",
};
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("lishihhsing-workspace-v2")
    : null;
const features = createFeatures({
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
  projectField,
  projectName,
  download,
  state: () => state,
});
function message(text, canUndo = false) {
  clearTimeout(toastTimer);
  $("#toast").innerHTML =
    `${esc(text)}${canUndo ? '<button data-action="undo">撤销</button>' : ""}`;
  toastTimer = setTimeout(
    () => $("#toast").replaceChildren(),
    canUndo ? 12000 : 5000,
  );
}
function setSaveLabel(text) {
  $("#save-status").textContent = text;
}
function applyTheme(nextTheme) {
  theme = nextTheme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  const toggle = $("#theme-toggle");
  if (toggle) {
    toggle.textContent = theme === "dark" ? "日间模式" : "夜间模式";
    toggle.setAttribute("aria-pressed", String(theme === "dark"));
  }
}
function updateSaveLabel() {
  setSaveLabel(
    tabConflict
      ? "其他标签页已修改 · 请先处理"
      : persistError
        ? "保存失败 · 请导出备份"
        : savedRevision < revision
          ? "正在保存…"
          : cloud?.conflict
            ? "本机已保存 · 云端有冲突"
            : cloud?.user
              ? "本机已保存 · " + (cloud.status || "待同步")
              : "已保存在本机 · 云同步未配置",
  );
}
function save() {
  revision++;
  const ownRevision = revision,
    ownScope = scope;
  const envelope = {
    state: structuredClone(state),
    revision: ownRevision,
    baseRemote,
    dirty: !!cloud?.user,
  };
  setSaveLabel("正在保存…");
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      if (tabConflict) throw Error("其他标签页已更新，请先处理冲突");
      await saveLocal(ownScope, envelope, ownRevision - 1);
      savedRevision = ownRevision;
      persistError = false;
      channel?.postMessage({ scope: ownScope, revision: ownRevision });
      updateSaveLabel();
      cloud?.schedule?.();
    })
    .catch((error) => {
      persistError = true;
      if (error.code === "LOCAL_CONFLICT") {
        tabConflict = true;
        render();
      }
      updateSaveLabel();
      message(error.message || "保存失败，请导出备份");
    });
  return saveQueue;
}
function change(action) {
  if (tabConflict) {
    message("请先导出本页数据或读取其他标签页的版本");
    return false;
  }
  action();
  save();
  render();
  return true;
}
function snapshotUndo(label) {
  undo.push({
    label,
    state: structuredClone(state),
    expectedRevision: revision + 1,
  });
  undo = undo.slice(-10);
}
function undoLast() {
  flushHistory();
  const item = undo.pop();
  if (!item) return message("没有可撤销的操作");
  if (item.expectedRevision !== revision)
    return message(
      "此后已有其他修改；请通过回收站或版本历史恢复，以保留新内容",
    );
  change(() => (state = item.state));
  message("已撤销：" + item.label);
}
function projectName(id) {
  return state.projects.find((p) => p.id === id)?.title || "未关联项目";
}
function currentTasks() {
  return live(state, "tasks");
}
const taskRepeatNames = {
  daily: "每天",
  weekdays: "每个工作日",
  weekly: "每周同一天",
  monthly: "每月同一天",
  custom: "自定义重复",
};
const taskRepeatUnitNames = { days: "天", weeks: "周", months: "月" };
function taskType(t, defaults = {}) {
  if (
    defaults.scheduleType &&
    taskScheduleTypes.includes(defaults.scheduleType)
  )
    return defaults.scheduleType;
  if (defaults.repeat && defaults.repeat !== "none") return "repeat";
  if (defaults.endDate) return "range";
  if (defaults.date) return "single";
  if (t?.scheduleType && taskScheduleTypes.includes(t.scheduleType))
    return t.scheduleType;
  if (t?.repeat && t.repeat !== "none") return "repeat";
  if (t?.endDate) return "range";
  if (t?.date) return "single";
  return "none";
}
function taskIsSeries(t) {
  return taskType(t) === "range" || taskType(t) === "repeat";
}
function taskDay(t, contextDay = "") {
  return t.__day || contextDay || (!taskIsSeries(t) ? t.date : today());
}
function taskScheduleLabel(t) {
  const type = taskType(t);
  if (type === "none") return "待安排";
  if (type === "single") return t.date;
  if (type === "range") return t.date + " → " + t.endDate;
  if (t.repeat === "custom")
    return (
      "每 " +
      (t.repeatInterval || 1) +
      (taskRepeatUnitNames[t.repeatUnit || "days"] || "天") +
      " · " +
      t.date +
      " 起至 " +
      t.until
    );
  return (
    (taskRepeatNames[t.repeat] || "重复") + " · " + t.date + " 起至 " + t.until
  );
}
function taskLabel(t, contextDay = "") {
  const day = t.__day || contextDay;
  if (!day || !taskIsSeries(t)) return taskScheduleLabel(t);
  return (
    day +
    " · " +
    (taskType(t) === "range"
      ? "连续区间"
      : taskRepeatNames[t.repeat] || "重复任务")
  );
}
function taskPendingOn(t, day = "") {
  const occurrenceDay = day || taskDay(t);
  return (
    !taskDoneOn(t, occurrenceDay) &&
    !t.shelved &&
    (!t.goal ||
      !["paused", "completed", "cancelled"].includes(
        state.goals.find((g) => g.id === t.goal)?.status,
      ))
  );
}
function tasksOnDay(day) {
  return currentTasks()
    .filter((t) => taskOccursOn(t, day))
    .map((t) => ({ ...t, __day: day }));
}
function taskStats(tasks, rangeStart = "", rangeEnd = "") {
  return tasks.reduce(
    (stats, t) => {
      const start = validDay(rangeStart)
          ? rangeStart
          : validDay(t.date)
            ? t.date
            : "",
        end = validDay(rangeEnd)
          ? rangeEnd
          : validDay(t.endDate)
            ? t.endDate
            : validDay(t.until)
              ? t.until
              : start,
        item =
          start && end && end >= start
            ? taskProgress(t, start, end)
            : { done: t.done ? 1 : 0, total: 1 };
      return {
        taskDone: stats.taskDone + (item.done >= item.total ? 1 : 0),
        taskTotal: stats.taskTotal + 1,
        done: stats.done + item.done,
        total: stats.total + item.total,
        hasSeries: stats.hasSeries || taskIsSeries(t),
      };
    },
    { taskDone: 0, taskTotal: 0, done: 0, total: 0, hasSeries: false },
  );
}
function upcomingTaskGroups(limit = 7) {
  const groups = new Map();
  for (let i = 1; i <= limit; i++) {
    const day = addDays(today(), i);
    for (const t of currentTasks()) {
      if (!taskOccursOn(t, day) || !taskPendingOn(t, day)) continue;
      const group = groups.get(t.id) || { task: t, items: [] };
      group.items.push({ ...t, __day: day });
      groups.set(t.id, group);
    }
  }
  return [...groups.values()];
}
function upcomingOccurrenceList(items) {
  return items
    .map((t) => {
      const checked = taskDoneOn(t, t.__day);
      return (
        '<div class="task occurrence-row"><input type="checkbox" aria-label="完成：' +
        esc(t.title) +
        " · " +
        esc(t.__day) +
        '" data-check="' +
        esc(t.id) +
        '" data-day="' +
        esc(t.__day) +
        '"' +
        (checked ? " checked" : "") +
        '><div class="body"><div class="' +
        (checked ? "done" : "") +
        '">' +
        esc(t.title) +
        "</div><small>" +
        esc(t.__day) +
        "</small></div></div>"
      );
    })
    .join("");
}
function upcomingTaskPanel() {
  const groups = upcomingTaskGroups(),
    occurrenceCount = groups.reduce(
      (sum, group) => sum + group.items.length,
      0,
    );
  return `<details class="card upcoming-panel"><summary><span>接下来 7 天</span><span class="tag">${groups.length ? groups.length + " 项任务 · " + occurrenceCount + " 次安排" : "暂无安排"}</span></summary>${
    groups.length
      ? `<div class="upcoming-groups">${groups
          .map(
            (group) =>
              `<section class="upcoming-group"><div class="row"><div><strong>${esc(group.task.title)}</strong><small class="schedule-meta">${esc(projectName(group.task.project))} · ${esc(taskScheduleLabel(group.task))}</small></div><div class="actions">${button("编辑", "task", group.task.id)}${button("删除", "delete", group.task.id, 'data-kind="tasks"')}</div></div><details><summary>显示 ${group.items.length} 次安排</summary><div class="upcoming-occurrences">${upcomingOccurrenceList(group.items)}</div></details></section>`,
          )
          .join("")}</div>`
      : '<div class="empty">未来 7 天没有待办</div>'
  }</details>`;
}
function pending(t, day = "") {
  return taskPendingOn(t, day);
}
function blank(text) {
  return `<div class="empty">${text}</div>`;
}
function button(label, action, id = "", extra = "") {
  return `<button type="button" data-action="${action}" data-id="${esc(id)}" ${extra}>${label}</button>`;
}
function field(label, name, value = "", type = "text", required = false) {
  return `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""}></div>`;
}
function area(label, name, value = "") {
  return `<div class="field"><label for="f-${name}">${label}</label><textarea id="f-${name}" name="${name}">${esc(value)}</textarea></div>`;
}
function select(label, name, options, value = "") {
  return `<div class="field"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
}
function projectField(value = "") {
  return select(
    "关联项目",
    "project",
    [
      ["", "未关联项目"],
      ...live(state, "projects", true).map((p) => [
        p.id,
        p.title + (p.archived ? "（已归档）" : ""),
      ]),
    ],
    value,
  );
}
function close() {
  $("#dialog").close();
  $("#fields").replaceChildren();
  $("#form").onsubmit = null;
  $("#form").oninput = null;
  $("#submit").hidden = false;
}
function modal(title, html, submit, label = "保存") {
  flushHistory();
  $("#dialog-title").textContent = title;
  $("#fields").innerHTML = html;
  $("#form-error").textContent = "";
  $("#submit").textContent = label;
  $("#submit").hidden = !submit;
  $("#form").oninput = null;
  $("#form").onsubmit = async (e) => {
    e.preventDefault();
    $("#form-error").textContent = "";
    $("#submit").disabled = true;
    try {
      if (tabConflict) throw Error("请先关闭窗口并处理标签页冲突");
      const result = await submit(Object.fromEntries(new FormData(e.target)));
      if (result === false) return;
      if (persistError)
        throw Error("内容尚未成功保存，请关闭窗口导出备份后重试");
      close();
      render();
    } catch (error) {
      $("#form-error").textContent = error.message || "操作失败";
    } finally {
      $("#submit").disabled = false;
    }
  };
  if (!$("#dialog").open) $("#dialog").showModal();
}
function editProject(id) {
  const p = state.projects.find((x) => x.id === id);
  modal(
    p ? "编辑项目" : "新建项目",
    field("项目名称", "title", p?.title, "text", true) +
      area("说明", "description", p?.description),
    async (v) => {
      if (!v.title.trim()) throw Error("请填写项目名称");
      if (p) Object.assign(p, v);
      else {
        const x = { id: uid(), ...v, archived: false };
        state.projects.push(x);
        projectId = x.id;
      }
      await save();
    },
  );
}
function editTask(id = "", defaults = {}) {
  const t = state.tasks.find((x) => x.id === id),
    g = state.goals.find((x) => x.id === defaults.goal),
    initial = {
      scheduleType: taskType(t, defaults),
      date: "",
      endDate: "",
      until: addDays(defaults.date || today(), 28),
      repeat: "daily",
      repeatInterval: 1,
      repeatUnit: "days",
      project: projectId,
      ...defaults,
      ...t,
    },
    scheduleLabels = {
      none: "待安排（暂不选日期）",
      single: "单日任务",
      range: "连续日期区间",
      repeat: "自定义重复任务",
    },
    repeatOptions = [
      ["daily", "每天"],
      ["weekdays", "每个工作日"],
      ["weekly", "每周同一天"],
      ["monthly", "每月同一天"],
      ["custom", "自定义间隔"],
    ];
  modal(
    t ? "编辑任务" : "添加任务",
    field("任务名称", "title", initial.title, "text", true) +
      projectField(initial.project || g?.project || "") +
      select(
        "关联目标",
        "goal",
        [
          ["", "无"],
          ...live(state, "goals", true).map((g) => [
            g.id,
            g.title + " · " + statusNames[g.status],
          ]),
        ],
        initial.goal || "",
      ) +
      select(
        "安排方式",
        "scheduleType",
        Object.entries(scheduleLabels),
        initial.scheduleType,
      ) +
      '<div id="task-schedule-fields"></div>' +
      `<label class="spaced"><input type="checkbox" name="starred" ${t?.starred ? "checked" : ""}> 星标任务（在月历中显示名称）</label>` +
      (t
        ? `<label><input name="shelved" type="checkbox" ${t.shelved ? "checked" : ""}> 暂时搁置</label>`
        : "") +
      ``,
    async (v) => {
      if (!v.title.trim()) throw Error("请填写任务名称");
      const schedule = v.scheduleType;
      if (!taskScheduleTypes.includes(schedule)) throw Error("安排方式无效");
      v.date = schedule === "none" ? "" : v.date;
      v.endDate = schedule === "range" ? v.endDate : "";
      v.repeat = schedule === "repeat" ? v.repeat : "none";
      v.repeatUnit = schedule === "repeat" ? v.repeatUnit || "days" : "days";
      v.repeatInterval =
        schedule === "repeat"
          ? Math.min(
              365,
              Math.max(1, Math.floor(Number(v.repeatInterval) || 1)),
            )
          : 1;
      v.until = schedule === "repeat" ? v.until : "";
      if (schedule !== "none" && !validDay(v.date))
        throw Error("请填写开始日期");
      if (schedule === "range" && (!validDay(v.endDate) || v.endDate < v.date))
        throw Error("请填写有效的区间结束日期");
      if (
        schedule === "repeat" &&
        (!taskRepeatTypes.includes(v.repeat) ||
          !validDay(v.until) ||
          v.until < v.date)
      )
        throw Error("请填写有效的重复频率和截止日期");
      const linked = state.goals.find((g) => g.id === v.goal);
      if (linked) {
        v.project = linked.project;
        const scheduledEnd =
          schedule === "range"
            ? v.endDate
            : schedule === "repeat"
              ? v.until
              : v.date;
        if (
          v.date &&
          (v.date < linked.start || (scheduledEnd && scheduledEnd > linked.end))
        )
          throw Error("日期超出目标范围，请调整日期或解除目标关联");
      }
      v.shelved = !!v.shelved;
      v.starred = !!v.starred;
      if (t) Object.assign(t, v);
      else
        state.tasks.push({
          id: uid(),
          done: false,
          completedOn: "",
          completedDates: [],
          exceptions: [],
          sourceNote: defaults.sourceNote || "",
          ...v,
        });
      if (t && schedule !== "repeat") t.exceptions = [];
      await save();
      message("任务已保存");
    },
  );
  let formState = { ...initial };
  const scheduleFields = $("#task-schedule-fields");
  const paintScheduleFields = () => {
    const type = $("#f-scheduleType").value;
    formState = {
      ...formState,
      ...Object.fromEntries(new FormData($("#form"))),
    };
    if (type === "none") {
      scheduleFields.innerHTML =
        '<div class="notice">这项会进入“待安排”，之后可以再补充日期、区间或重复规则。</div>';
    } else if (type === "single") {
      scheduleFields.innerHTML = field(
        "计划日期",
        "date",
        formState.date || today(),
        "date",
        true,
      );
    } else if (type === "range") {
      scheduleFields.innerHTML =
        '<div class="grid">' +
        field("开始日期", "date", formState.date || today(), "date", true) +
        field(
          "结束日期",
          "endDate",
          formState.endDate || formState.date || today(),
          "date",
          true,
        ) +
        "</div>";
    } else {
      const repeatValue = taskRepeatTypes.includes(formState.repeat)
        ? formState.repeat
        : "daily";
      formState.repeat = repeatValue;
      scheduleFields.innerHTML =
        '<div class="grid">' +
        field("开始日期", "date", formState.date || today(), "date", true) +
        field(
          "重复截止日期",
          "until",
          formState.until || addDays(formState.date || today(), 28),
          "date",
          true,
        ) +
        "</div>" +
        select("重复频率", "repeat", repeatOptions, repeatValue) +
        (repeatValue === "custom"
          ? '<div class="grid">' +
            field(
              "每隔多少",
              "repeatInterval",
              formState.repeatInterval || 1,
              "number",
              true,
            ) +
            select(
              "间隔单位",
              "repeatUnit",
              taskRepeatUnits.map((unit) => [unit, taskRepeatUnitNames[unit]]),
              formState.repeatUnit || "days",
            ) +
            "</div>"
          : "");
    }
    $("#f-repeat")?.addEventListener("change", paintScheduleFields);
  };
  $("#f-scheduleType").addEventListener("change", paintScheduleFields);
  paintScheduleFields();
}
function quickTask(text) {
  if (!text.trim()) return;
  change(() =>
    state.tasks.unshift({
      id: uid(),
      title: text.trim(),
      date: "",
      project: "",
      goal: "",
      done: false,
      shelved: false,
      completedOn: "",
      scheduleType: "none",
      endDate: "",
      repeat: "none",
      repeatUnit: "days",
      repeatInterval: 1,
      until: "",
      exceptions: [],
      completedDates: [],
    }),
  );
  message("已记下，放在待安排");
}
function editGoal(id = "") {
  const g = state.goals.find((x) => x.id === id);
  let reviewed = "";
  modal(
    g ? "编辑目标" : "创建目标",
    field("目标名称", "title", g?.title, "text", true) +
      projectField(g?.project || projectId) +
      field(
        "开始日期",
        "start",
        g?.start || rangeStart || selectedDay,
        "date",
        true,
      ) +
      field(
        "结束日期",
        "end",
        g?.end || rangeEnd || rangeStart || addDays(selectedDay, 14),
        "date",
        true,
      ) +
      select(
        "目标状态",
        "status",
        Object.entries(statusNames),
        g?.status || "active",
      ) +
      area("计划与说明", "description", g?.description) +
      (g
        ? `<label><input name="shift" type="checkbox"> 按开始日期的变化移动未完成任务</label><p class="muted">已完成任务、未安排日期的任务保持不变。暂停或结束的目标，其任务仍保留在项目中。</p><div id="move-preview"></div>`
        : ""),
    async (v) => {
      if (!v.title.trim()) throw Error("请填写目标名称");
      if (!validDay(v.start) || !validDay(v.end) || v.end < v.start)
        throw Error("请填写有效的起止日期");
      if (g) {
        const signature = JSON.stringify(v);
        if (reviewed !== signature) {
          reviewed = signature;
          showMoves(v);
          $("#submit").textContent = "确认保存调整";
          return false;
        }
        snapshotUndo("调整目标");
        const shift = !!v.shift;
        delete v.shift;
        applyGoal(state, g, v, shift);
      } else state.goals.push({ id: uid(), ...v });
      rangeStart = "";
      rangeEnd = "";
      rangeMode = false;
      await save();
      message(g ? "已调整目标，可撤销" : "目标已创建", !!g);
    },
    g ? "预览调整" : "创建目标",
  );
  function showMoves(v) {
    const changes = goalPreview(state, g, v, !!v.shift);
    $("#move-preview").innerHTML =
      `<h3>调整预览</h3><p>${g.start} → ${esc(v.start)}；截止 ${g.end} → ${esc(v.end)}<br>状态：${statusNames[g.status]} → ${statusNames[v.status]}</p>${changes.length ? `<table><thead><tr><th>任务</th><th>原日期</th><th>调整后</th></tr></thead><tbody>${changes.map((t) => `<tr><td>${esc(t.title)}${t.done ? "（已完成，保留）" : ""}</td><td>${t.from || "待安排"}</td><td>${t.to || "待安排"}${t.outside ? " · 超出目标区间" : ""}</td></tr>`).join("")}</tbody></table>` : "<p>没有关联任务。</p>"}<p class="muted">超出区间的任务会保留，并在目标中提示重新安排。</p>`;
  }
  if (g)
    $("#form").oninput = () => {
      reviewed = "";
      $("#submit").textContent = "预览调整";
      $("#move-preview").replaceChildren();
    };
}
function editEvent(id = "", day = selectedDay) {
  const event = state.events.find((x) => x.id === id);
  modal(
    event ? "编辑日程" : "添加日程",
    field("日程名称", "title", event?.title, "text", true) +
      `<div class="grid spaced">${field("开始日期", "date", event?.date || day, "date", true)}${field("结束日期", "endDate", event?.endDate || event?.date || day, "date", true)}</div>` +
      `<div class="grid">${field("开始时间", "start", event?.start || "09:00", "time", true)}${field("结束时间", "end", event?.end || "10:00", "time", true)}</div>` +
      projectField(event?.project || projectId) +
      select(
        "日程颜色",
        "color",
        [
          ["#648bd6", "蓝色 · 工作"],
          ["#4aa58c", "绿色 · 生活"],
          ["#c68d40", "橙色 · 提醒"],
          ["#b074bd", "紫色 · 其他"],
        ],
        event?.color || "#648bd6",
      ) +
      select(
        "关联任务（可选）",
        "task",
        [["", "无"], ...currentTasks().map((t) => [t.id, t.title])],
        event?.task || "",
      ) +
      select(
        "重复频率",
        "repeat",
        Object.entries(repeatNames),
        event?.repeat || "none",
      ) +
      field(
        "重复截止日期（重复时必填）",
        "until",
        event?.until || addDays(day, 28),
        "date",
      ) +
      `<p class="muted">重复截止日期指最后一次开始的日期；编辑作用于整组日程。</p>`,
    async (v) => {
      if (!v.title.trim()) throw Error("请填写名称");
      if (
        !validDay(v.date) ||
        !validDay(v.endDate) ||
        v.endDate < v.date ||
        (v.endDate === v.date && v.end <= v.start)
      )
        throw Error("结束日期和时间须晚于开始");
      if (dayDiff(v.date, v.endDate) > 366) throw Error("单次日程最长 366 天");
      if (v.repeat !== "none" && (!validDay(v.until) || v.until < v.date))
        throw Error("请选择有效的重复截止日期");
      if (v.repeat === "none") v.until = "";
      if (event) {
        Object.assign(event, v);
      } else state.events.push({ id: uid(), exceptions: [], ...v });
      await save();
      message("日程已保存");
    },
  );
}
function deleteItem(k, id) {
  const item = state[k].find((x) => x.id === id);
  if (!item) return;
  flushHistory();
  snapshotUndo("删除" + collectionNames[k]);
  change(() => (item.deletedAt = new Date().toISOString()));
  message("已移入回收站", true);
}
function restoreItem(k, id) {
  const item = state[k].find((x) => x.id === id);
  if (
    k === "notes" &&
    item.type === "diary" &&
    state.notes.some(
      (n) =>
        n.id !== id &&
        !n.deletedAt &&
        n.type === "diary" &&
        n.date === item.date,
    )
  ) {
    item.type = "document";
    item.title += "（恢复副本）";
  }
  change(() => (item.deletedAt = ""));
  message("已恢复");
}
function trash() {
  modal(
    "回收站",
    `<p class="muted">删除的内容保留在这里，可随时恢复。</p>${
      collections
        .map((k) =>
          state[k]
            .filter((x) => x.deletedAt)
            .map(
              (x) =>
                `<div class="task"><div class="body"><strong>${esc(x.title)}</strong><br><small>${collectionNames[k]} · ${esc(x.deletedAt.slice(0, 10))}</small></div>${button("恢复", "restore", x.id, `data-kind="${k}"`)}</div>`,
            )
            .join(""),
        )
        .join("") || blank("回收站为空")
    }`,
    null,
  );
}
function taskList(tasks, compact = false, contextDay = "") {
  if (!tasks.length) return blank("暂无任务");
  return tasks
    .map((t) => {
      const occurrenceDay =
          t.__day || contextDay || (!taskIsSeries(t) ? t.date : today()),
        checked = occurrenceDay ? taskDoneOn(t, occurrenceDay) : !!t.done,
        moveButton =
          !compact &&
          !checked &&
          !taskIsSeries(t) &&
          occurrenceDay &&
          occurrenceDay !== today()
            ? button("移到今天", "today-task", t.id)
            : "",
        goalTitle = state.goals.find((g) => g.id === t.goal)?.title || "",
        sourceButton =
          t.sourceNote &&
          state.notes.some((n) => n.id === t.sourceNote && !n.deletedAt)
            ? button("来源笔记", "open-note", t.sourceNote)
            : "";
      return (
        '<div class="task"><input type="checkbox" aria-label="完成：' +
        esc(t.title) +
        '" data-check="' +
        esc(t.id) +
        '" data-day="' +
        esc(occurrenceDay) +
        '"' +
        (checked ? " checked" : "") +
        '><div class="body"><div class="' +
        (checked ? "done" : "") +
        '">' +
        esc(t.title) +
        "</div><small>" +
        esc(projectName(t.project)) +
        " · " +
        esc(taskLabel(t, contextDay)) +
        (t.shelved ? " · 已搁置" : "") +
        (goalTitle ? " · " + esc(goalTitle) : "") +
        "</small>" +
        '</div><div class="actions">' +
        moveButton +
        sourceButton +
        button(
          t.starred ? "★ 主要" : "☆ 星标",
          "star-task",
          t.id,
          `aria-pressed="${!!t.starred}"`,
        ) +
        (!compact && !checked
          ? button(t.shelved ? "恢复安排" : "搁置", "shelve", t.id)
          : "") +
        button("编辑", "task", t.id) +
        button("删除", "delete", t.id, 'data-kind="tasks"') +
        "</div></div>"
      );
    })
    .join("");
}
function eventList(day) {
  const events = occurrences(state, day),
    conflicts = overlaps(events);
  return (
    events
      .map(
        (e) =>
          `<div class="event" style="border-left-color:${esc(e.color || "#648bd6")}"><div class="row"><strong>${e.continued ? "续 · " : ""}${e.start}–${e.end} ${esc(e.title)}</strong><span class="tag">${repeatNames[e.repeat]}</span></div><small>${esc(projectName(e.project))}${e.task ? " · " + esc(state.tasks.find((t) => t.id === e.task)?.title || "关联任务已移除") : ""}</small>${conflicts.has(e.id) ? '<p class="warning">与当天其他日程时间重叠</p>' : ""}<div class="actions">${button("编辑", "event", e.id)}${e.repeat !== "none" ? button("取消本次", "skip-event", e.id, `data-day="${e.originDay || day}"`) : ""}${button("删除", "delete", e.id, 'data-kind="events"')}</div></div>`,
      )
      .join("") || blank("当天没有日程")
  );
}
function goalCard(g) {
  const ts = live(state, "tasks", true).filter((t) => t.goal === g.id),
    stats = taskStats(ts, g.start, g.end),
    percent = stats.total ? Math.round((stats.done / stats.total) * 100) : 0,
    left = dayDiff(today(), g.end),
    next = ts
      .flatMap((t) =>
        taskOccurrencesBetween(t, today() < g.start ? g.start : today(), g.end)
          .filter((day) => taskPendingOn(t, day))
          .map((day) => ({ t, day })),
      )
      .sort((a, b) => a.day.localeCompare(b.day))[0],
    outside = ts.filter(
      (t) =>
        !t.done &&
        t.date &&
        (t.date < g.start || (t.endDate || t.until || t.date) > g.end),
    ).length;
  return `<section class="card"><div class="row"><h2>${esc(g.title)}</h2><span class="tag">${g.status === "active" ? (left < 0 ? "到期后 " + -left + " 天" : left === 0 ? "今天截止" : "剩余 " + left + " 天") : statusNames[g.status]}</span></div><small>${esc(projectName(g.project))} · ${g.start} → ${g.end}</small><p>${esc(g.description)}</p><div class="progress-line"><progress max="100" value="${percent}" aria-label="目标完成度 ${percent}%"></progress><span class="progress-label">${percent}%</span></div><p class="progress-meta">${stats.hasSeries ? "已完成 " + stats.done + "/" + stats.total + " 次安排 · " + stats.taskDone + "/" + stats.taskTotal + " 项任务" : "已完成 " + stats.taskDone + "/" + stats.taskTotal + " 项任务"}</p>${g.status === "active" ? `<p>下一步：${next ? esc(next.t.title) + " · " + next.day : "暂无待办，可补充任务或完成目标"}</p>` : ""}${outside ? `<p class="warning">${outside} 项任务超出目标区间，可在下方重新安排。</p>` : ""}<div class="actions">${button("编辑目标", "goal", g.id)}${button("添加任务", "goal-task", g.id)}${button("删除", "delete", g.id, 'data-kind="goals"')}</div><details><summary>关联任务</summary>${taskList(ts, true)}</details></section>`;
}
function render() {
  updateSaveLabel();
  const headings = {
    today: "今天",
    projects: "项目",
    calendar: "日历",
    notes: "笔记",
    ledger: "账本",
    focus: "专注",
  };
  $("#heading").textContent = headings[view];
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
    b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false");
  });
  $("#cloud-banner").innerHTML = tabConflict
    ? `<div class="notice warning">其他标签页已更新。为避免相互覆盖，本页暂停编辑。${button("导出本页副本", "export")}${button("读取最新版本", "reload-local")}</div>`
    : cloud?.conflict
      ? `<div class="notice warning">云端有另一份修改，本地内容仍保留。${button("处理同步冲突", "sync-conflict")}</div>`
      : "";
  const c = $("#content");
  ({
    today: renderToday,
    projects: renderProjects,
    calendar: renderCalendar,
    notes: renderNotes,
    ledger: features.renderLedger,
    focus: features.renderFocus,
  })[view](c);
}
function renderToday(c) {
  const tasks = currentTasks(),
    todayTasks = tasksOnDay(today()).filter(
      (t) => taskDoneOn(t, today()) || pending(t, today()),
    ),
    overdue = tasks.filter(
      (t) => !taskIsSeries(t) && pending(t) && t.date && t.date < today(),
    ),
    shelved = tasks.filter((t) => t.shelved && !t.done);
  c.innerHTML = `<form id="quick-form" class="card"><label for="quick">快速记一件事</label><div class="row"><input id="quick" name="title" placeholder="先记下，不必现在决定日期" required style="flex:1;min-width:180px"><button class="primary">记到待安排</button></div></form><div class="row spaced"><strong>${today()}</strong><div class="actions">${button("添加今日任务", "day-task", "", 'data-day="' + today() + '"')}${button("添加日程", "event")}${button("写日记", "diary", "", 'data-day="' + today() + '"')}</div></div><div class="grid"><section><div class="card"><h2>今日任务</h2>${taskList(todayTasks, false, today())}</div><div class="card"><h2>今日安排</h2>${eventList(today())}</div><div class="card"><h2>待安排</h2>${taskList(tasks.filter((t) => !t.date && pending(t)))}</div><details class="card"><summary>需要重新安排 · ${overdue.length} 项</summary>${taskList(overdue)}</details><details class="card"><summary>已搁置 · ${shelved.length} 项</summary>${taskList(shelved)}</details></section><section><h2>进行中的目标</h2>${
    live(state, "goals")
      .filter((g) => g.status === "active")
      .map(goalCard)
      .join("") || blank("暂时没有进行中的目标")
  }${upcomingTaskPanel()}</section></div>`;
  $("#quick-form").onsubmit = (e) => {
    e.preventDefault();
    quickTask($("#quick").value);
  };
}
function renderProjects(c) {
  const ps = live(state, "projects", true).filter(
      (p) => !!p.archived === archived,
    ),
    p = state.projects.find((p) => p.id === projectId && !p.deletedAt);
  c.innerHTML = `<div class="row spaced"><div class="actions">${button(archived ? "查看进行中" : "查看已归档", "toggle-archive")}${button("新建项目", "project", "", 'class="primary"')}</div><span class="muted">${ps.length} 个项目</span></div><div class="grid">${
    ps
      .map((p) => {
        const ts = live(state, "tasks", true).filter((t) => t.project === p.id),
          stats = taskStats(ts);
        return `<button class="card" style="text-align:left" data-action="open-project" data-id="${p.id}"><h2>${esc(p.title)}</h2><p>${esc(p.description)}</p><small>${stats.taskDone}/${stats.taskTotal} 项任务完成 · ${live(state, "notes", true).filter((n) => n.project === p.id).length} 篇笔记</small></button>`;
      })
      .join("") || blank("这里还没有项目")
  }</div>${
    p
      ? `<div class="card"><div class="row"><h2>${esc(p.title)}${p.archived ? "（已归档）" : ""}</h2><div class="actions">${button("编辑", "project", p.id)}${button(p.archived ? "恢复项目" : "归档项目", "archive-project", p.id)}</div></div><div class="actions">${button("添加任务", "task")}${button("添加目标", "goal")}${button("新建文档", "note")}${button("添加日程", "event")}</div><h3>任务</h3>${taskList(live(state, "tasks", true).filter((t) => t.project === p.id))}<h3>目标</h3>${
          live(state, "goals", true)
            .filter((g) => g.project === p.id)
            .map(goalCard)
            .join("") || blank("暂无目标")
        }<h3>笔记</h3>${
          live(state, "notes", true)
            .filter((n) => n.project === p.id)
            .map((n) => button(esc(n.title), "open-note", n.id))
            .join(" ") || blank("暂无笔记")
        }<h3>日程</h3>${
          live(state, "events", true)
            .filter((e) => e.project === p.id)
            .map(
              (e) =>
                `<p>${esc(e.title)} · ${e.date} ${e.start}–${e.end} · ${repeatNames[e.repeat]} ${button("编辑", "event", e.id)}</p>`,
            )
            .join("") || blank("暂无日程")
        }</div>`
      : ""
  }`;
}
function goalColor(id) {
  const colors = ["#648bd6", "#4aa58c", "#c68d40", "#b074bd", "#c87878"];
  return colors[
    [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % colors.length
  ];
}
function renderCalendar(c) {
  const first = new Date(month + "-01T12:00:00"),
    count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(),
    offset = (first.getDay() + 6) % 7;
  let cells = "<div></div>".repeat(offset);
  for (let i = 1; i <= count; i++) {
    const d = month + "-" + String(i).padStart(2, "0"),
      ts = tasksOnDay(d),
      es = occurrences(state, d),
      gs = live(state, "goals").filter(
        (g) => g.status === "active" && d >= g.start && d <= g.end,
      ),
      completed = ts.filter((t) => taskDoneOn(t, d)).length;
    const starred = ts.filter((t) => t.starred);
    cells += `<button class="day ${d === today() ? "today" : ""} ${rangeMode ? (rangeStart && d >= rangeStart && d <= (rangeEnd || rangeStart) ? "selected" : "") : d === selectedDay ? "selected" : ""}" data-action="date" data-id="${d}" aria-label="${rangeMode ? "选择" : "查看"} ${d}"><div class="day-top"><strong>${i}</strong><span class="goal-flags">${gs
      .slice(0, 3)
      .map(
        (g) =>
          `<i style="background:${goalColor(g.id)}" title="${esc(g.title)}" aria-label="${esc(g.title)}"></i>`,
      )
      .join(
        "",
      )}${gs.length > 3 ? `<span>+${gs.length - 3}</span>` : ""}</span></div>${starred
      .slice(0, 2)
      .map(
        (t) =>
          `<small class="calendar-star ${taskDoneOn(t, d) ? "done" : ""}" title="${esc(t.title)}">★ ${esc(t.title)}</small>`,
      )
      .join(
        "",
      )}${starred.length > 2 ? `<small>另 ${starred.length - 2} 项星标</small>` : ""}${es
      .slice(0, 2)
      .map(
        (e) =>
          `<small class="calendar-event" style="border-left-color:${esc(e.color || "#648bd6")}" title="${esc(e.title)} · ${e.start}–${e.end}">${e.continued ? "续" : e.start} ${esc(e.title)}</small>`,
      )
      .join(
        "",
      )}${es.length > 2 ? `<small>另 ${es.length - 2} 项日程</small>` : ""}${ts.length ? `<small class="calendar-count">任务 ${completed}/${ts.length} 已完成</small>` : ""}${live(state, "notes", true).some((n) => n.type === "diary" && n.date === d) ? "<small>有日记</small>" : ""}</button>`;
  }
  c.innerHTML = `<div class="card"><div class="row"><div class="actions">${button("←", "month", "-1", 'aria-label="上个月"')}<strong>${month}</strong>${button("→", "month", "1", 'aria-label="下个月"')}${button("回到今天", "calendar-today")}</div><div class="actions">${button(rangeMode ? "退出区间选择" : "选择区间", "range", "", 'aria-pressed="' + rangeMode + '"')}${button("新建目标", "goal")}</div></div><div class="goal-legend">${live(
    state,
    "goals",
  )
    .filter(
      (g) =>
        g.status === "active" &&
        g.start <= month + "-31" &&
        g.end >= month + "-01",
    )
    .map(
      (g) =>
        `<span><i style="background:${goalColor(g.id)}"></i>${esc(g.title)}</span>`,
    )
    .join(
      "",
    )}</div><div class="calendar">${["一", "二", "三", "四", "五", "六", "日"].map((x) => `<div class="week">${x}</div>`).join("")}${cells}</div>${rangeMode ? `<div class="notice row"><span>${rangeStart ? rangeStart + (rangeEnd ? " → " + rangeEnd : "，请选择结束日期") : "请选择起始日期"}</span>${rangeEnd ? button("为此区间建目标", "goal", "", 'class="primary"') : ""}</div>` : ""}</div><div class="card"><div class="row"><h2>${selectedDay} · 当天</h2><div class="actions">${button("添加任务", "day-task", "", 'data-day="' + selectedDay + '"')}${button("添加日程", "event")}${button("写日记", "diary", "", 'data-day="' + selectedDay + '"')}</div></div><h3>日程</h3>${eventList(selectedDay)}<h3>任务</h3>${taskList(tasksOnDay(selectedDay), false, selectedDay)}<h3>笔记</h3>${
    live(state, "notes", true)
      .filter((n) => n.date === selectedDay)
      .map((n) => button(esc(n.title), "open-note", n.id))
      .join(" ") || '<p class="muted">还没有记录</p>'
  }</div><h2>目标</h2><div class="grid">${live(state, "goals").map(goalCard).join("")}</div>`;
}
function flushHistory() {
  if (editingHistory && editingNote) {
    const n = state.notes.find((n) => n.id === editingNote);
    if (
      n &&
      (editingHistory.title !== n.title || editingHistory.body !== n.body)
    ) {
      n.history ??= [];
      if (
        !n.history.some(
          (h) =>
            h.title === editingHistory.title && h.body === editingHistory.body,
        )
      )
        n.history.unshift(editingHistory);
      n.history = n.history.slice(0, 30);
      save();
    }
  }
  editingHistory = null;
  editingNote = "";
}
function startHistory(n) {
  if (editingNote === n.id && editingHistory) return;
  editingNote = n.id;
  editingHistory = {
    title: n.title,
    body: n.body,
    at: new Date().toISOString(),
  };
}
function newNote(type = "document", day = today()) {
  if (!validDay(day)) return message("请选择有效日期");
  noteKind = type;
  preview = false;
  flushHistory();
  if (type === "diary") {
    const found = live(state, "notes", true).find(
      (n) => n.type === "diary" && n.date === day,
    );
    if (found) {
      noteId = found.id;
      view = "notes";
      search = "";
      rememberedNoteSelection = "";
      render();
      return;
    }
  }
  const n = {
    id: uid(),
    title: type === "diary" ? day + " 日记" : "未命名文档",
    type,
    date: day,
    project: projectId,
    body:
      type === "diary"
        ? "## 今天发生了什么\n\n## 心情与感受\n\n## 今日收获\n\n## 明天的一小步\n"
        : "",
    private: true,
    history: [],
  };
  state.notes.unshift(n);
  noteId = n.id;
  view = "notes";
  search = "";
  rememberedNoteSelection = "";
  save();
  render();
}
function markdown(text) {
  const html = DOMPurify.sanitize(marked.parse(text, { breaks: true }), {
    FORBID_TAGS: ["style", "form", "input", "iframe", "video", "audio"],
    FORBID_ATTR: ["style", "srcset"],
  });
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("img").forEach((img) => {
    if (
      !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(
        img.getAttribute("src") || "",
      )
    )
      img.replaceWith(doc.createTextNode("[外部图片未加载，请使用本地插图]"));
  });
  doc.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!/^(https?:\/\/|mailto:|#)/i.test(href)) a.removeAttribute("href");
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });
  return doc.body.innerHTML;
}
function selectedNoteText() {
  const body = $("#note-body");
  if (body && !body.hidden && body.selectionStart !== body.selectionEnd)
    return body.value.slice(body.selectionStart, body.selectionEnd).trim();
  const rendered = $("#note-preview"),
    selection = window.getSelection();
  if (
    rendered &&
    selection?.rangeCount &&
    selection.toString().trim() &&
    rendered.contains(selection.anchorNode) &&
    rendered.contains(selection.focusNode)
  )
    return selection.toString().trim();
  return rememberedNoteSelection;
}
function markdownToolbar() {
  const tools = [
    ["bold", "粗体", "** **"],
    ["italic", "斜体", "* *"],
    ["h1", "一级标题", "# "],
    ["h2", "二级标题", "## "],
    ["h3", "三级标题", "### "],
    ["quote", "引用", "> "],
    ["bullet", "无序列表", "- "],
    ["ordered", "有序列表", "1. "],
    ["code", "行内代码", "` `"],
    ["code-block", "代码块", "```"],
    ["link", "链接", "[ ]( )"],
    ["divider", "分隔线", "---"],
  ];
  return `<aside class="markdown-tools" aria-label="Markdown 快捷格式"><strong>Markdown</strong><div class="markdown-tool-list">${tools
    .map(
      ([id, label, syntax]) =>
        `<button type="button" data-action="markdown-format" data-id="${id}" title="插入 ${syntax}"><span>${label}</span><code>${syntax}</code></button>`,
    )
    .join("")}</div></aside>`;
}
function markdownFormat(kind) {
  const body = $("#note-body"),
    n = state.notes.find((item) => item.id === noteId);
  if (!body || !n || preview) {
    message("切换到编辑模式后使用 Markdown 快捷格式");
    return;
  }
  const value = body.value,
    start = body.selectionStart,
    end = body.selectionEnd,
    selected = value.slice(start, end);
  let from = start,
    to = end,
    replacement = selected,
    nextStart = start,
    nextEnd = end;
  const wrap = (open, close = open) => {
    replacement = open + selected + close;
    nextStart = start + open.length;
    nextEnd = nextStart + selected.length;
    if (!selected) nextEnd = nextStart;
  };
  const prefixLines = (prefix) => {
    if (selected) {
      from = value.lastIndexOf("\n", start - 1) + 1;
      to = end;
      replacement = value
        .slice(from, to)
        .split("\n")
        .map((line) => prefix + line)
        .join("\n");
      nextStart = from;
      nextEnd = from + replacement.length;
      return;
    }
    from = value.lastIndexOf("\n", start - 1) + 1;
    to = from;
    replacement = prefix;
    nextStart = start + prefix.length;
    nextEnd = nextStart;
  };
  switch (kind) {
    case "bold":
      wrap("**");
      break;
    case "italic":
      wrap("*");
      break;
    case "h1":
      prefixLines("# ");
      break;
    case "h2":
      prefixLines("## ");
      break;
    case "h3":
      prefixLines("### ");
      break;
    case "quote":
      prefixLines("> ");
      break;
    case "bullet":
      prefixLines("- ");
      break;
    case "ordered":
      prefixLines("1. ");
      break;
    case "code":
      wrap("`");
      break;
    case "code-block":
      replacement = "```\n" + selected + "\n```";
      nextStart = start + 4;
      nextEnd = nextStart + selected.length;
      if (!selected) nextEnd = nextStart;
      break;
    case "link":
      replacement = selected ? `[${selected}](链接)` : "[文字](链接)";
      nextStart = start + (selected ? selected.length + 3 : 1);
      nextEnd = nextStart + 2;
      break;
    case "divider":
      replacement = "\n---\n";
      nextStart = nextEnd = start + replacement.length;
      break;
    default:
      return;
  }
  noteCheckpoint(n);
  body.focus();
  body.setRangeText(replacement, from, to, "preserve");
  body.setSelectionRange(nextStart, nextEnd);
  n.title = $("#note-title").value;
  n.body = body.value;
  n.project = $("#note-project").value;
  n.updatedAt = new Date().toISOString();
  save();
  $("#note-list").innerHTML = noteList();
}
function noteList() {
  return (
    live(state, "notes", true)
      .filter((n) => n.type === noteKind)
      .sort((a, b) =>
        noteKind === "diary"
          ? b.date.localeCompare(a.date)
          : Number(!!b.pinned) - Number(!!a.pinned) ||
            (b.updatedAt || b.date).localeCompare(a.updatedAt || a.date),
      )
      .filter((n) =>
        (n.title + " " + n.body).toLowerCase().includes(search.toLowerCase()),
      )
      .map(
        (n) =>
          `<button class="note-item ${n.id === noteId ? "active" : ""}" data-action="open-note" data-id="${n.id}"><strong>${n.pinned && n.type === "document" ? "置顶 · " : ""}${esc(n.title)}</strong><br><small>${n.type === "diary" ? "日记" : "文档"} · ${n.date} · 私密<br>${esc(projectName(n.project))}</small></button>`,
      )
      .join("") || blank("没有匹配的笔记")
  );
}
function diarySummary(n) {
  const stats = focusStats(state.focus, n.date, n.date);
  const tasks = live(state, "tasks", true).filter((t) =>
    taskOccursOn(t, n.date),
  );
  const done = tasks.filter((t) => taskDoneOn(t, n.date)).length;
  return `<section class="diary-overview"><div class="row"><h2>${n.date} · 每日回顾</h2><label>今日心情<select id="diary-mood">${["", "愉快", "平静", "充实", "疲惫", "低落"].map((m) => `<option value="${m}" ${n.mood === m ? "selected" : ""}>${m || "尚未记录"}</option>`).join("")}</select></label></div><div class="metrics"><div><small>任务完成</small><strong>${done}/${tasks.length}</strong></div><div><small>实际专注</small><strong>${(stats.totalMs / 3600000).toFixed(2)} h</strong></div><div><small>专注次数</small><strong>${stats.items.length}</strong></div></div>${stats.items.length ? `<details><summary>当日专注</summary>${stats.items.map((r) => `<p>${esc(r.title)} · ${(r.duration / 3600000).toFixed(2)} h</p>`).join("")}</details>` : ""}</section>`;
}
function renderNotes(c) {
  const n = state.notes.find((n) => n.id === noteId && !n.deletedAt),
    noteEditor = n
      ? `${
          n.type === "diary"
            ? `${diarySummary(n)}<details><summary>${n.date} 的任务记录（自动关联）</summary>${taskList(
                live(state, "tasks", true).filter(
                  (t) =>
                    taskOccursOn(t, n.date) ||
                    t.completedOn === n.date ||
                    t.completedDates?.includes(n.date),
                ),
                true,
              )}</details>`
            : ""
        }<label for="note-title">标题</label><input id="note-title" value="${esc(n.title)}"><label for="note-project">关联项目</label><select id="note-project"><option value="">未关联项目</option>${live(
          state,
          "projects",
          true,
        )
          .map(
            (p) =>
              `<option value="${p.id}" ${n.project === p.id ? "selected" : ""}>${esc(p.title)}</option>`,
          )
          .join(
            "",
          )}</select><div class="actions spaced">${button(preview ? "返回编辑" : "Markdown 预览", "preview")}${button("插入图片", "image")}${button("选中文字转任务", "selection-task")}${n.type === "document" ? button(n.pinned ? "取消置顶" : "置顶", "note-pin", n.id) : ""}${button("版本历史", "history", n.id)}${button("删除", "delete", n.id, 'data-kind="notes"')}</div>${n.type === "diary" ? `<div class="actions">${button("插入复盘模板", "template", n.id)}</div>` : ""}<div class="editor-body"><div class="editor-main"><label for="note-body">正文</label><textarea id="note-body" ${preview ? "hidden" : ""} placeholder="写下一句话，或用 # 标题、- 列表、**加粗** 整理内容…">${esc(n.body)}</textarea><div id="note-preview" class="preview" ${preview ? "" : "hidden"}>${preview ? markdown(n.body) : ""}</div></div>${preview ? "" : markdownToolbar()}</div>`
      : blank("选择或新建一篇笔记");
  c.innerHTML = `<div class="row spaced"><div class="actions">${button("文档", "note-kind", "document", `class="${noteKind === "document" ? "selected" : ""}"`)}${button("日记", "note-kind", "diary", `class="${noteKind === "diary" ? "selected" : ""}"`)}</div><div class="actions">${noteKind === "diary" ? `<input id="diary-date" type="date" value="${today()}" aria-label="日记日期">${button("打开日记", "diary-date")}` : button("新建文档", "doc-template", "", 'class="primary"')}</div></div><div class="split"><section><input id="search" aria-label="搜索笔记" placeholder="搜索标题与正文" value="${esc(search)}"><div id="note-list" class="note-list spaced">${noteList()}</div></section><section class="card editor">${noteEditor}</section></div>`;
  $("#search").oninput = (e) => {
    search = e.target.value;
    $("#note-list").innerHTML = noteList();
  };
  if (n) {
    if ($("#diary-mood"))
      $("#diary-mood").onchange = (e) => {
        if (tabConflict) return message("请先处理标签页冲突");
        n.mood = e.target.value;
        n.updatedAt = new Date().toISOString();
        save();
      };
    startHistory(n);
    const update = () => {
      if (tabConflict) {
        message("其他标签页已修改，请先处理冲突");
        return;
      }
      if (
        editingHistory &&
        n.title === editingHistory.title &&
        n.body === editingHistory.body
      )
        noteCheckpoint(n);
      else if (!n.updatedAt || Date.now() - Date.parse(n.updatedAt) > 30000)
        noteCheckpoint(n);
      n.title = $("#note-title").value;
      n.body = $("#note-body").value;
      n.project = $("#note-project").value;
      n.updatedAt = new Date().toISOString();
      save();
      $("#note-list").innerHTML = noteList();
    };
    $("#note-title").oninput =
      $("#note-body").oninput =
      $("#note-project").onchange =
        update;
  }
}
function history(id) {
  const n = state.notes.find((n) => n.id === id);
  flushHistory();
  modal(
    "版本历史 · " + n.title,
    `<p class="muted">保留最近 30 个编辑版本。恢复前会保留当前版本。</p>${n.history?.map((h, i) => `<details><summary>${esc(h.at.replace("T", " ").slice(0, 19))} · ${esc(h.title)}</summary><div class="history-body">${esc(h.body)}</div>${button("恢复此版本", "restore-version", id, `data-index="${i}"`)}</details>`).join("") || blank("还没有旧版本，修改后离开笔记会保存一个历史版本。")}`,
    null,
  );
}
function imageInsert() {
  const n = state.notes.find((n) => n.id === noteId);
  if (!n) return;
  $("#image-file").value = "";
  $("#image-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          file.type,
        )
      )
        throw Error("请选择 PNG、JPEG、WebP 或 GIF 图片");
      if (file.size > 2 * 1024 * 1024) throw Error("每张图片不超过 2 MB");
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      noteCheckpoint(n);
      n.body += "\n\n![图片](" + data + ")\n";
      await save();
      render();
      message("图片已插入，随文档保存在本机");
    } catch (error) {
      message(error.message || "图片读取失败");
    }
  };
  $("#image-file").click();
}
function exportState() {
  flushHistory();
  download(backupBlob(state), "workspace-" + today() + ".json");
}
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function importDialog(file) {
  try {
    imported = await readBackup(file);
    modal(
      "导入备份",
      `<p>备份包含：${collections.map((k) => `${collectionNames[k]} ${imported[k].length}`).join("、")}。</p><p>导入前会自动保留当前恢复点；副本导入不会覆盖已有记录。</p>` +
        select(
          "导入方式",
          "mode",
          [
            ["copy", "作为副本加入（推荐）"],
            ["replace", "替换当前工作区（可从恢复点找回）"],
          ],
          "copy",
        ),
      async (v) => {
        await recoveryPoint(scope, state, "导入前的工作区");
        state =
          v.mode === "replace"
            ? normalize(imported)
            : importCopy(state, imported);
        noteId = "";
        projectId = "";
        undo = [];
        await save();
        message("备份已导入");
      },
      "导入",
    );
  } catch (error) {
    message("无法导入：" + error.message);
  }
}
async function recoveries() {
  const list = await recoveryList(scope);
  modal(
    "工作区恢复点",
    `<p class="muted">保留最近 5 个恢复点。恢复前先保留当前内容。</p>${list.map((r) => `<div class="task"><div class="body">${esc(r.label)}<br><small>${esc(r.at)}</small></div>${button("恢复", "recovery", r.id)}</div>`).join("") || blank("尚无恢复点")}`,
    null,
  );
}
async function settings() {
  flushHistory();
  modal(
    "账号与备份",
    `<section><h3>保存与备份</h3><p>${esc($("#save-status").textContent)}</p><div class="actions">${button("立即同步", "sync")}${button("导出备份", "export")}${button("导入备份", "import")}${button("创建恢复点", "checkpoint")}${button("查看恢复点", "recoveries")}${undo.length ? button("撤销上一步", "undo") : ""}</div></section><section><h3>当前账号</h3><p>${esc(cloud?.user?.email || "")}</p><div class="actions">${button("退出登录", "logout")}</div></section>`,
    null,
  );
}
async function connectCloud(context) {
  const { CloudSync } = await import("./cloud.js");
  cloud?.dispose?.();
  cloud = new CloudSync({
    get: () => ({ state: structuredClone(state), revision, baseRemote }),
    apply: async (payload, version) => {
      await recoveryPoint(scope, state, "读取云端前");
      state = normalize(payload);
      baseRemote = version;
      revision++;
      savedRevision = revision;
      await saveLocal(scope, { state, revision, baseRemote, dirty: false });
      render();
    },
    committed: async (version, sentRevision) => {
      baseRemote = version;
      await saveLocal(scope, {
        state: structuredClone(state),
        revision,
        baseRemote,
        dirty: revision !== sentRevision,
      });
      updateSaveLabel();
    },
    status: () => {
      updateSaveLabel();
      if (cloud?.conflict) render();
    },
    switchUser: async (user, namespace) => {
      await saveQueue;
      flushHistory();
      await saveQueue;
      scope = "cloud:" + namespace + ":" + user.id;
      let env = await loadLocal(scope);
      if (!env) {
        const legacy = await loadLocal("local");
        if (legacy) {
          env = { ...legacy, baseRemote: 0, dirty: true };
          await saveLocal(scope, env);
          message("原有本机内容已迁入当前账号");
        }
      }
      state = env?.state || emptyState();
      revision = env?.revision || 0;
      savedRevision = revision;
      baseRemote = env?.baseRemote || 0;
      noteId = "";
      projectId = "";
      undo = [];
      view = "today";
      noteId = live(state, "notes", true)[0]?.id || "";
      noteKind = state.notes.find((n) => n.id === noteId)?.type || "document";
      render();
      return env;
    },
    notify: message,
  });
  await cloud.attach(context);
}
async function syncConflict() {
  if (!cloud?.conflict) return;
  modal(
    "处理同步冲突",
    `<p>另一台设备已经修改了云端版本，本地没有被覆盖。先导出本地副本，再选择如何继续。</p><div class="actions">${button("导出本地副本", "export")}${button("读取云端版本（保留本地恢复点）", "pull-cloud")}${button("用本地版本更新云端", "push-cloud")}</div>`,
    null,
  );
}
async function route(action, id, b) {
  if (await features.route(action, id, b)) return;
  switch (action) {
    case "close":
      close();
      break;
    case "theme":
      applyTheme(theme === "dark" ? "light" : "dark");
      try {
        localStorage.setItem("workspace-theme", theme);
      } catch {
        // Theme still applies for this session when browser storage is unavailable.
      }
      message(theme === "dark" ? "已切换到夜间模式" : "已切换到日间模式");
      break;
    case "project":
      editProject(id);
      break;
    case "open-project":
      projectId = id;
      render();
      break;
    case "toggle-archive":
      archived = !archived;
      projectId = "";
      render();
      break;
    case "archive-project":
      snapshotUndo("归档状态");
      change(() => {
        const p = state.projects.find((p) => p.id === id);
        p.archived = !p.archived;
        projectId = "";
      });
      message("项目状态已更新；内容仍保留", true);
      break;
    case "task":
      editTask(id);
      break;
    case "day-task":
      editTask("", { date: b.dataset.day });
      break;
    case "goal-task": {
      const g = state.goals.find((g) => g.id === id);
      editTask("", { goal: id, project: g.project });
      break;
    }
    case "today-task": {
      const t = state.tasks.find((t) => t.id === id),
        g = state.goals.find((g) => g.id === t.goal);
      if (g && (today() < g.start || today() > g.end)) {
        editTask(id);
        message("今天超出目标范围，请调整目标或解除关联");
        break;
      }
      snapshotUndo("移动任务");
      change(() => {
        t.date = today();
        t.shelved = false;
      });
      message("已移到今天", true);
      break;
    }
    case "shelve":
      snapshotUndo("搁置任务");
      change(() => {
        const t = state.tasks.find((t) => t.id === id);
        t.shelved = !t.shelved;
      });
      message("已更新，可撤销", true);
      break;
    case "goal":
      editGoal(id);
      break;
    case "event":
      editEvent(id, view === "today" ? today() : selectedDay);
      break;
    case "skip-event":
      snapshotUndo("取消单次日程");
      change(() =>
        state.events.find((e) => e.id === id).exceptions.push(b.dataset.day),
      );
      message("已取消本次，后续日程保留", true);
      break;
    case "delete":
      deleteItem(b.dataset.kind, id);
      break;
    case "restore":
      restoreItem(b.dataset.kind, id);
      trash();
      break;
    case "trash":
      trash();
      break;
    case "undo":
      undoLast();
      if ($("#dialog").open) close();
      break;
    case "date":
      if (rangeMode) {
        if (!rangeStart || rangeEnd) {
          rangeStart = id;
          rangeEnd = "";
        } else {
          rangeEnd = id;
          if (rangeEnd < rangeStart)
            [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
        }
      } else selectedDay = id;
      render();
      break;
    case "range":
      rangeMode = !rangeMode;
      rangeStart = "";
      rangeEnd = "";
      render();
      break;
    case "month": {
      const d = new Date(month + "-01T12:00:00");
      d.setMonth(d.getMonth() + Number(id));
      month = dayString(d).slice(0, 7);
      render();
      break;
    }
    case "calendar-today":
      selectedDay = today();
      month = today().slice(0, 7);
      rangeMode = false;
      render();
      break;
    case "diary":
      newNote("diary", b.dataset.day || today());
      break;
    case "note":
      newNote();
      break;
    case "open-note":
      flushHistory();
      noteId = id;
      noteKind = state.notes.find((n) => n.id === id)?.type || "document";
      view = "notes";
      preview = false;
      rememberedNoteSelection = "";
      render();
      break;
    case "note-kind":
      flushHistory();
      noteKind = id;
      search = "";
      rememberedNoteSelection = "";
      noteId = live(state, "notes", true).find((n) => n.type === id)?.id || "";
      preview = false;
      render();
      break;
    case "note-pin":
      change(() => {
        const n = state.notes.find((n) => n.id === id);
        n.pinned = !n.pinned;
      });
      break;
    case "star-task":
      change(() => {
        const t = state.tasks.find((t) => t.id === id);
        t.starred = !t.starred;
      });
      break;
    case "diary-date":
      newNote("diary", $("#diary-date").value || today());
      break;
    case "doc-template":
      modal(
        "文档模板",
        select("模板", "template", [
          ["blank", "空白文档"],
          ["knowledge", "知识整理"],
          ["project", "项目方案"],
          ["reading", "阅读笔记"],
        ]),
        async (v) => {
          const templates = {
            blank: ["未命名文档", ""],
            knowledge: [
              "知识整理",
              "## 核心概念\n\n## 要点\n\n## 示例\n\n## 参考资料\n",
            ],
            project: [
              "项目方案",
              "## 目标\n\n## 方案\n\n## 里程碑\n\n## 待解决问题\n",
            ],
            reading: [
              "阅读笔记",
              "## 来源\n\n## 核心观点\n\n## 我的理解\n\n## 下一步行动\n",
            ],
          };
          newNote();
          const n = state.notes.find((n) => n.id === noteId);
          [n.title, n.body] = templates[v.template] || templates.blank;
          await save();
        },
        "创建文档",
      );
      break;
    case "preview":
      flushHistory();
      preview = !preview;
      rememberedNoteSelection = "";
      render();
      break;
    case "image":
      imageInsert();
      break;
    case "selection-task": {
      const n = state.notes.find((n) => n.id === noteId),
        selection = selectedNoteText();
      if (!selection) {
        message("先在正文或 Markdown 预览中选中一段文字，再点击转任务");
        break;
      }
      editTask("", {
        title: selection.slice(0, 300),
        project: n.project,
        sourceNote: n.id,
      });
      break;
    }
    case "markdown-format":
      markdownFormat(id);
      break;
    case "template": {
      const n = state.notes.find((n) => n.id === id);
      noteCheckpoint(n);
      change(
        () =>
          (n.body += "\n\n## 今日感受\n\n## 做得不错的事\n\n## 明天的一小步\n"),
      );
      break;
    }
    case "history":
      history(id);
      break;
    case "restore-version": {
      const n = state.notes.find((n) => n.id === id),
        h = structuredClone(n.history[Number(b.dataset.index)]);
      noteCheckpoint(n);
      n.title = h.title;
      n.body = h.body;
      await save();
      close();
      render();
      message("已恢复，恢复前的内容也保留在历史中");
      break;
    }
    case "settings":
      await settings();
      break;
    case "sync":
      await cloud?.sync();
      message(cloud?.status || "尚未连接");
      break;
    case "logout":
      await cloud?.logout();
      location.reload();
      break;
    case "sync-conflict":
      await syncConflict();
      break;
    case "pull-cloud":
      await cloud.resolve("remote");
      close();
      render();
      break;
    case "push-cloud":
      await recoveryPoint(scope, state, "云端冲突处理前");
      await cloud.resolve("local");
      close();
      render();
      break;
    case "export":
      exportState();
      break;
    case "import":
      $("#backup-file").value = "";
      $("#backup-file").click();
      break;
    case "checkpoint":
      await recoveryPoint(scope, state, "手动恢复点");
      message("已创建恢复点");
      break;
    case "recoveries":
      await recoveries();
      break;
    case "recovery": {
      const r = (await recoveryList(scope)).find((r) => r.id === id);
      if (!r) throw Error("恢复点不存在");
      await recoveryPoint(scope, state, "恢复前的工作区");
      state = normalize(r.state);
      undo = [];
      noteId = "";
      projectId = "";
      await save();
      close();
      render();
      message("工作区已恢复");
      break;
    }
    case "reload-local": {
      await saveQueue;
      const env = await loadLocal(scope);
      if (!env) throw Error("没有已保存版本");
      state = env.state;
      revision = env.revision;
      savedRevision = revision;
      baseRemote = env.baseRemote || 0;
      tabConflict = false;
      persistError = false;
      undo = [];
      editingHistory = null;
      editingNote = "";
      render();
      break;
    }
  }
}
document.addEventListener("selectionchange", () => {
  const rendered = $("#note-preview"),
    selection = window.getSelection(),
    text = selection?.toString().trim();
  if (!text) return;
  rememberedNoteSelection =
    rendered &&
    selection?.rangeCount &&
    rendered.contains(selection.anchorNode) &&
    rendered.contains(selection.focusNode)
      ? text
      : "";
});
document.addEventListener("pointerdown", (e) => {
  if (e.target.closest('button[data-action="markdown-format"]')) {
    e.preventDefault();
    return;
  }
  if (!e.target.closest('button[data-action="selection-task"]')) {
    rememberedNoteSelection = "";
    return;
  }
  const rendered = $("#note-preview"),
    selection = window.getSelection();
  if (
    rendered &&
    selection?.rangeCount &&
    rendered.contains(selection.anchorNode) &&
    rendered.contains(selection.focusNode)
  )
    rememberedNoteSelection = selection.toString().trim();
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.view) {
      flushHistory();
      view = b.dataset.view;
      projectId = "";
      render();
    } else if (b.dataset.action) {
      if (
        tabConflict &&
        !["export", "reload-local", "close"].includes(b.dataset.action)
      ) {
        message("请先处理其他标签页的修改");
        return;
      }
      await route(b.dataset.action, b.dataset.id || "", b);
    }
  } catch (error) {
    message(error.message || "操作失败");
  }
});
document.addEventListener("change", (e) => {
  if (e.target.dataset.check) {
    const t = state.tasks.find((t) => t.id === e.target.dataset.check);
    change(() => {
      const day = e.target.dataset.day;
      if (taskIsSeries(t) && day) {
        t.completedDates ??= [];
        t.completedDates = e.target.checked
          ? [...new Set([...t.completedDates, day])]
          : t.completedDates.filter((item) => item !== day);
      } else {
        t.done = e.target.checked;
        t.completedOn = t.done ? today() : "";
      }
    });
  }
});
$("#backup-file").onchange = (e) => {
  if (e.target.files[0]) importDialog(e.target.files[0]);
};
$("#dialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  close();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) flushHistory();
});
window.addEventListener("beforeunload", (e) => {
  if (savedRevision < revision || persistError) {
    e.preventDefault();
    e.returnValue = "";
  }
});
channel?.addEventListener("message", (e) => {
  if (e.data.scope === scope) {
    tabConflict = true;
    render();
  }
});
window.addEventListener("online", () => cloud?.sync());
async function init() {
  try {
    applyTheme(localStorage.getItem("workspace-theme") || "light");
  } catch {
    applyTheme("light");
  }
  try {
    if (!window.__workspaceAuth?.user) throw Error("登录状态无效，请重新登录");
    await connectCloud(window.__workspaceAuth);
  } catch (error) {
    persistError = true;
    setSaveLabel("本地数据读取失败");
    $("#content").innerHTML = blank(
      "无法打开本机数据库。原数据未删除，请重试或更换支持 IndexedDB 的浏览器。",
    );
    message(error.message);
  }
}
init();
