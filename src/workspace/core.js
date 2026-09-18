import { cleanSegments } from "./activity.js";
import {
  cleanTables,
  noteProjects,
  noteTags,
  noteSnapshot,
} from "./documents.js";
export const collections = [
  "projects",
  "goals",
  "tasks",
  "notes",
  "events",
  "accounts",
  "ledger",
  "debts",
  "focus",
  "budgets",
];
export const taskScheduleTypes = ["none", "single", "range", "repeat"];
export const taskRepeatTypes = [
  "daily",
  "weekdays",
  "weekly",
  "monthly",
  "custom",
];
export const taskRepeatUnits = ["days", "weeks", "months"];
export const dayString = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const today = () => dayString();
export const uid = () => crypto.randomUUID();
export function addDays(day, n) {
  const d = new Date(day + "T12:00:00");
  d.setDate(d.getDate() + n);
  return dayString(d);
}
export function dayDiff(a, b) {
  return Math.round(
    (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000,
  );
}
export function validDay(s) {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    dayString(new Date(s + "T12:00:00")) === s
  );
}
const str = (v, fallback = "") => (typeof v === "string" ? v : fallback);
const allowed = (v, values, fallback) => (values.includes(v) ? v : fallback);
const cleanDay = (v, fallback = "") => (validDay(v) ? v : fallback);
const cleanDays = (values) => [
  ...new Set((Array.isArray(values) ? values : []).filter(validDay)),
];

function legacyTaskScheduleType(x) {
  if (x.scheduleType && taskScheduleTypes.includes(x.scheduleType))
    return x.scheduleType;
  if (x.repeat && x.repeat !== "none") return "repeat";
  if (validDay(x.endDate)) return "range";
  if (validDay(x.date)) return "single";
  return "none";
}

function repeatMonthIndex(day) {
  const d = new Date(day + "T12:00:00");
  return d.getFullYear() * 12 + d.getMonth();
}

function isLastDayOfMonth(day) {
  const d = new Date(day + "T12:00:00");
  return (
    d.getDate() === new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  );
}

export function taskOccursOn(task, day) {
  if (!task || task.deletedAt || !validDay(day) || task.shelved) return false;
  const type = legacyTaskScheduleType(task);
  if (type === "none" || !validDay(task.date)) return false;
  if (type === "single") return day === task.date;
  if (type === "range")
    return validDay(task.endDate) && day >= task.date && day <= task.endDate;
  if (day < task.date || (task.until && day > task.until)) return false;
  if (Array.isArray(task.exceptions) && task.exceptions.includes(day))
    return false;
  const diff = dayDiff(task.date, day);
  const repeat = task.repeat || "daily";
  if (repeat === "daily") return diff >= 0;
  if (repeat === "weekdays") {
    const weekday = new Date(day + "T12:00:00").getDay();
    return weekday >= 1 && weekday <= 5;
  }
  if (repeat === "weekly") return diff >= 0 && diff % 7 === 0;
  if (repeat === "monthly") {
    const original = new Date(task.date + "T12:00:00");
    const current = new Date(day + "T12:00:00");
    const targetDate = isLastDayOfMonth(task.date)
      ? new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
      : original.getDate();
    return (
      repeatMonthIndex(day) >= repeatMonthIndex(task.date) &&
      current.getDate() === targetDate
    );
  }
  const interval = Math.max(1, Number(task.repeatInterval) || 1);
  const unit = task.repeatUnit || "days";
  if (unit === "weeks") return diff >= 0 && diff % (interval * 7) === 0;
  if (unit === "months")
    return (
      repeatMonthIndex(day) >= repeatMonthIndex(task.date) &&
      (repeatMonthIndex(day) - repeatMonthIndex(task.date)) % interval === 0 &&
      new Date(day + "T12:00:00").getDate() ===
        new Date(task.date + "T12:00:00").getDate()
    );
  return diff >= 0 && diff % interval === 0;
}

export function taskDoneOn(task, day) {
  const type = legacyTaskScheduleType(task);
  if (type === "range" || type === "repeat")
    return (
      task.completedDates?.includes(day) ||
      (!!task.done && (!task.completedOn || task.completedOn === day))
    );
  return !!task.done;
}

export function taskOccurrencesBetween(task, start, end) {
  if (!validDay(start) || !validDay(end) || end < start) return [];
  const result = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (taskOccursOn(task, day)) result.push(day);
    if (result.length > 10000) break;
  }
  return result;
}

export function taskProgress(task, start, end) {
  const dates = taskOccurrencesBetween(task, start, end);
  if (!dates.length) return { done: task.done ? 1 : 0, total: 1 };
  return {
    done: dates.filter((day) => taskDoneOn(task, day)).length,
    total: dates.length,
  };
}
export function emptyState() {
  return {
    version: 4,
    projects: [],
    goals: [],
    tasks: [],
    notes: [],
    events: [],
    accounts: [],
    ledger: [],
    debts: [],
    focus: [],
    budgets: [],
    focusDraft: null,
  };
}
// Whitelist fields at every import boundary, never spread arbitrary imported objects.
export function normalize(raw) {
  if (
    !raw ||
    typeof raw !== "object" ||
    (raw.version && ![1, 2, 3, 4].includes(raw.version))
  )
    throw Error("不支持的备份版本");
  if (
    !["projects", "goals", "tasks", "notes"].every((k) => Array.isArray(raw[k]))
  )
    throw Error("备份缺少项目、目标、任务或笔记");
  const s = emptyState();
  const ids = new Set();
  for (const k of collections) {
    if (raw[k] !== undefined && !Array.isArray(raw[k]))
      throw Error("备份集合格式错误");
    if ((raw[k] || []).length > 10000) throw Error("单个集合超过 10000 条记录");
    s[k] = (raw[k] || []).map((x) => {
      if (
        !x ||
        typeof x !== "object" ||
        !/^[\w-]{1,100}$/.test(x.id) ||
        ids.has(x.id)
      )
        throw Error("记录标识无效或重复");
      ids.add(x.id);
      const y = {
        id: x.id,
        title: str(x.title, "未命名"),
        deletedAt: str(x.deletedAt),
        updatedAt: str(x.updatedAt),
        createdAt: str(x.createdAt || x.updatedAt),
      };
      if (k === "projects")
        return {
          ...y,
          description: str(x.description),
          archived: !!x.archived,
        };
      const project = str(x.project);
      if (k === "goals") {
        if (!validDay(x.start) || !validDay(x.end) || x.end < x.start)
          throw Error("目标日期无效");
        return {
          ...y,
          project,
          start: x.start,
          end: x.end,
          description: str(x.description),
          status: allowed(
            x.status,
            ["active", "paused", "completed", "cancelled"],
            "active",
          ),
        };
      }
      if (k === "tasks") {
        let scheduleType = legacyTaskScheduleType(x);
        const date = cleanDay(x.date);
        const endDate = cleanDay(x.endDate);
        const repeat = allowed(x.repeat, taskRepeatTypes, "daily");
        const repeatUnit = allowed(x.repeatUnit, taskRepeatUnits, "days");
        const repeatInterval = Math.min(
          365,
          Math.max(1, Math.floor(Number(x.repeatInterval) || 1)),
        );
        const until = cleanDay(x.until);
        // Very old backups could retain a single-day marker after the date
        // was cleared; preserve that task as an undated item.
        if (scheduleType === "single" && !date) scheduleType = "none";
        if (scheduleType === "range" && (!date || !endDate || endDate < date))
          throw Error("区间任务需要有效的起止日期");
        if (
          scheduleType === "repeat" &&
          (!date || !until || until < date || !taskRepeatTypes.includes(repeat))
        )
          throw Error("重复任务需要有效的开始和截止日期");
        return {
          ...y,
          project,
          goal: str(x.goal),
          scheduleType,
          date,
          endDate: scheduleType === "range" ? endDate : "",
          repeat: scheduleType === "repeat" ? repeat : "none",
          repeatUnit: scheduleType === "repeat" ? repeatUnit : "days",
          repeatInterval: scheduleType === "repeat" ? repeatInterval : 1,
          until: scheduleType === "repeat" ? until : "",
          exceptions: cleanDays(x.exceptions),
          completedDates: cleanDays(x.completedDates),
          done: !!x.done,
          shelved: !!x.shelved,
          completedOn: cleanDay(x.completedOn, x.done ? cleanDay(x.date) : ""),
          sourceNote: str(x.sourceNote),
          starred: !!x.starred,
        };
      }
      if (k === "notes")
        return {
          ...y,
          project,
          projects: noteProjects(x).filter((p) => typeof p === "string"),
          tags: noteTags(Array.isArray(x.tags) ? x.tags.join(",") : ""),
          status: allowed(x.status, ["draft", "active", "done"], "draft"),
          createdAt: str(x.createdAt || x.updatedAt || x.date),
          tables: cleanTables(x.tables || []),
          date: cleanDay(x.date, today()),
          type: allowed(x.type, ["diary", "document"], "document"),
          body: str(x.body),
          private: true,
          pinned: !!x.pinned,
          mood: allowed(
            x.mood,
            ["", "愉快", "平静", "充实", "疲惫", "低落"],
            "",
          ),
          history: (Array.isArray(x.history) ? x.history : [])
            .slice(0, 30)
            .map((h) => ({
              title: str(h.title),
              body: str(h.body),
              at: str(h.at),
              ...(Array.isArray(h.projects)
                ? { projects: noteProjects(h) }
                : {}),
              ...(Array.isArray(h.tags)
                ? { tags: noteTags(h.tags.join(",")) }
                : {}),
              ...(h.status
                ? {
                    status: allowed(
                      h.status,
                      ["draft", "active", "done"],
                      "draft",
                    ),
                  }
                : {}),
              ...(Array.isArray(h.tables)
                ? { tables: cleanTables(h.tables) }
                : {}),
            })),
        };
      if (k === "accounts") {
        const openingCents = Number.isSafeInteger(x.openingCents)
          ? x.openingCents
          : 0;
        const rate = Number(x.rate ?? 1);
        if (Math.abs(openingCents) > 99999999999) throw Error("账户余额无效");
        if (!Number.isFinite(rate) || rate <= 0 || rate > 1000000)
          throw Error("账户汇率无效");
        return {
          ...y,
          type: allowed(
            x.type,
            ["cash", "bank", "savings", "ewallet", "credit", "investment"],
            "bank",
          ),
          currency: allowed(
            x.currency,
            ["CNY", "USD", "HKD", "EUR", "JPY", "GBP"],
            "CNY",
          ),
          openingCents,
          rate,
        };
      }
      if (k === "ledger" || k === "budgets") {
        if (
          !Number.isSafeInteger(x.cents) ||
          x.cents <= 0 ||
          x.cents > 99999999999
        )
          throw Error("金额无效");
        if (k === "budgets") {
          if (!validDay(x.month + "-01")) throw Error("预算月份无效");
          return { ...y, month: x.month, cents: x.cents };
        }
        if (
          !validDay(x.date) ||
          ![
            "income",
            "expense",
            "transfer",
            "investment_buy",
            "investment_sell",
          ].includes(x.kind)
        )
          throw Error("账目日期或类型无效");
        const rate = Number(x.rate ?? 1);
        const quantity = Number(x.quantity ?? 0);
        if (!Number.isFinite(rate) || rate <= 0 || rate > 1000000)
          throw Error("汇率无效");
        if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1000000000)
          throw Error("投资数量无效");
        return {
          ...y,
          project,
          date: x.date,
          cents: x.cents,
          kind: x.kind,
          currency: allowed(
            x.currency,
            ["CNY", "USD", "HKD", "EUR", "JPY", "GBP"],
            "CNY",
          ),
          rate,
          category: str(x.category, "其他"),
          account: str(x.account, "默认账户"),
          toAccount: str(x.toAccount),
          asset: str(x.asset),
          quantity,
          memo: str(x.memo),
        };
      }
      if (k === "debts") {
        if (!validDay(x.date) || (x.dueDate && !validDay(x.dueDate)))
          throw Error("债务日期无效");
        if (x.dueDate && x.dueDate < x.date)
          throw Error("到期日不能早于起始日");
        if (
          !Number.isSafeInteger(x.principalCents) ||
          x.principalCents <= 0 ||
          x.principalCents > 99999999999
        )
          throw Error("债务金额无效");
        const rate = Number(x.rate ?? 1),
          paymentIds = new Set();
        if (!Number.isFinite(rate) || rate <= 0 || rate > 1000000)
          throw Error("债务汇率无效");
        const payments = (Array.isArray(x.payments) ? x.payments : [])
          .slice(0, 500)
          .map((payment) => {
            if (
              !payment ||
              !/^[\w-]{1,100}$/.test(payment.id) ||
              paymentIds.has(payment.id) ||
              !validDay(payment.date) ||
              !Number.isSafeInteger(payment.cents) ||
              payment.cents <= 0
            )
              throw Error("还款记录无效");
            paymentIds.add(payment.id);
            return {
              id: payment.id,
              date: payment.date,
              cents: payment.cents,
              memo: str(payment.memo),
              createdAt: str(payment.createdAt),
            };
          });
        if (
          payments.reduce((sum, payment) => sum + payment.cents, 0) >
          x.principalCents
        )
          throw Error("还款总额不能超过债务金额");
        return {
          ...y,
          project,
          kind: allowed(x.kind, ["payable", "receivable"], "payable"),
          party: str(x.party),
          principalCents: x.principalCents,
          currency: allowed(
            x.currency,
            ["CNY", "USD", "HKD", "EUR", "JPY", "GBP"],
            "CNY",
          ),
          rate,
          date: x.date,
          dueDate: x.dueDate || "",
          account: str(x.account),
          memo: str(x.memo),
          payments,
        };
      }
      if (k === "focus")
        return {
          ...y,
          project,
          task: str(x.task),
          segments: cleanSegments(x.segments),
          finishedAt: str(x.finishedAt),
        };
      const eventEndDate = x.endDate ? cleanDay(x.endDate) : x.date;
      if (
        !validDay(x.date) ||
        !validDay(eventEndDate) ||
        eventEndDate < x.date ||
        dayDiff(x.date, eventEndDate) > 366 ||
        !/^\d{2}:\d{2}$/.test(x.start) ||
        !/^\d{2}:\d{2}$/.test(x.end) ||
        (eventEndDate === x.date && x.start >= x.end) ||
        x.start > "23:59" ||
        x.end > "23:59" ||
        Number(x.start.slice(3)) > 59 ||
        Number(x.end.slice(3)) > 59
      )
        throw Error("日程时间无效");
      const repeat = allowed(x.repeat, ["none", "daily", "weekly"], "none"),
        until = cleanDay(x.until);
      if (repeat !== "none" && (!until || until < x.date))
        throw Error("重复日程需要有效的结束日期");
      return {
        ...y,
        project,
        date: x.date,
        endDate: eventEndDate,
        color: /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : "#648bd6",
        start: x.start,
        end: x.end,
        repeat,
        until,
        task: str(x.task),
        exceptions: (Array.isArray(x.exceptions) ? x.exceptions : []).filter(
          validDay,
        ),
      };
    });
  }
  if (raw.focusDraft) {
    const f = raw.focusDraft;
    const segments = cleanSegments(f.segments || []);
    if (
      f.startedAt !== null &&
      f.startedAt !== undefined &&
      (!Number.isFinite(f.startedAt) ||
        f.startedAt <= 0 ||
        f.startedAt > Date.now() + 60000 ||
        (segments.length && f.startedAt < segments.at(-1).end))
    )
      throw Error("计时状态无效");
    s.focusDraft = {
      id: str(f.id) || uid(),
      title: str(f.title),
      task: str(f.task),
      project: str(f.project),
      startedAt: f.startedAt || null,
      segments,
    };
  }
  for (const k of [
    "goals",
    "tasks",
    "notes",
    "events",
    "ledger",
    "debts",
    "focus",
  ])
    for (const x of s[k])
      if (x.project && !s.projects.some((p) => p.id === x.project))
        x.project = "";
  for (const t of s.tasks) {
    const g = s.goals.find((g) => g.id === t.goal);
    if (!g) t.goal = "";
    else t.project = g.project;
  }
  for (const n of s.notes) {
    n.projects = n.projects.filter((id) => s.projects.some((p) => p.id === id));
    n.project = n.projects[0] || "";
  }
  return s;
}
export function live(state, collection, includeArchived = false) {
  return state[collection].filter(
    (x) =>
      !x.deletedAt &&
      (includeArchived ||
        (collection === "projects"
          ? !x.archived
          : collection === "notes"
            ? !noteProjects(x).length ||
              noteProjects(x).some((id) =>
                state.projects.some(
                  (p) => p.id === id && !p.archived && !p.deletedAt,
                ),
              )
            : !state.projects.some(
                (p) => p.id === x.project && (p.archived || p.deletedAt),
              ))),
  );
}
export function occurrences(state, day) {
  const result = [];
  for (const e of live(state, "events")) {
    const span = dayDiff(e.date, e.endDate || e.date);
    // Inspect only possible starts covering this date, not the entire series.
    for (let offset = 0; offset <= span; offset++) {
      const originDay = addDays(day, -offset);
      if (originDay < e.date || e.exceptions.includes(originDay)) continue;
      if (
        e.repeat === "none"
          ? originDay !== e.date
          : originDay > e.until ||
            (e.repeat === "weekly" && dayDiff(e.date, originDay) % 7 !== 0)
      )
        continue;
      const lastDay = addDays(originDay, span);
      const start = day === originDay ? e.start : "00:00";
      const end = day === lastDay ? e.end : "24:00";
      if (start < end)
        result.push({
          ...e,
          start,
          end,
          originDay,
          occurrenceEndDate: lastDay,
          continued: originDay !== day,
        });
    }
  }
  return result.sort((a, b) => a.start.localeCompare(b.start));
}
export function overlaps(events) {
  return new Set(
    events
      .filter((a) =>
        events.some(
          (b) =>
            (a.id !== b.id || a.originDay !== b.originDay) &&
            a.start < b.end &&
            b.start < a.end,
        ),
      )
      .map((x) => x.id),
  );
}
export function goalPreview(state, goal, draft, shift = false) {
  const delta = dayDiff(goal.start, draft.start);
  return state.tasks
    .filter((t) => !t.deletedAt && t.goal === goal.id)
    .map((t) => {
      const next = shift && !t.done && t.date ? addDays(t.date, delta) : t.date;
      const nextEnd =
        shift && !t.done && t.endDate ? addDays(t.endDate, delta) : t.endDate;
      const nextUntil =
        shift && !t.done && t.until ? addDays(t.until, delta) : t.until;
      const nextCompletedDates =
        shift && !t.done && Array.isArray(t.completedDates)
          ? t.completedDates.map((day) => addDays(day, delta))
          : t.completedDates;
      const nextExceptions =
        shift && !t.done && Array.isArray(t.exceptions)
          ? t.exceptions.map((day) => addDays(day, delta))
          : t.exceptions;
      return {
        id: t.id,
        title: t.title,
        from: t.date,
        to: next,
        fromEnd: t.endDate,
        toEnd: nextEnd,
        fromUntil: t.until,
        toUntil: nextUntil,
        toCompletedDates: nextCompletedDates,
        toExceptions: nextExceptions,
        done: t.done,
        outside:
          !!next &&
          !t.done &&
          (next < draft.start ||
            (nextEnd || next) > draft.end ||
            (nextUntil || next) > draft.end),
      };
    });
}
export function applyGoal(state, goal, draft, shift = false) {
  const changes = goalPreview(state, goal, draft, shift);
  for (const change of changes) {
    const t = state.tasks.find((t) => t.id === change.id);
    t.date = change.to;
    t.endDate = change.toEnd || "";
    t.until = change.toUntil || "";
    if (change.toCompletedDates) t.completedDates = change.toCompletedDates;
    if (change.toExceptions) t.exceptions = change.toExceptions;
    t.project = draft.project;
  }
  Object.assign(goal, draft);
}
export function noteCheckpoint(n) {
  n.history ??= [];
  const last = n.history[0];
  const snapshot = noteSnapshot(n);
  if (last && JSON.stringify(noteSnapshot(last)) === JSON.stringify(snapshot))
    return;
  n.history.unshift({ ...snapshot, at: new Date().toISOString() });
  n.history = n.history.slice(0, 30);
}
export function importCopy(state, incoming) {
  const map = new Map(
    collections.flatMap((k) => incoming[k].map((x) => [x.id, uid()])),
  );
  for (const k of collections)
    for (const original of incoming[k]) {
      const x = structuredClone(original);
      x.id = map.get(x.id);
      for (const f of ["project", "goal", "sourceNote", "task"])
        if (f in x) x[f] = map.get(x[f]) || "";
      if (k === "notes") {
        const remap = (n) => {
          if (n.projects)
            n.projects = n.projects.map((id) => map.get(id)).filter(Boolean);
          n.body = n.body.replace(
            /\[\[([^\]|\n]+)(\|[^\]\n]*)?\]\]/g,
            (all, id, label) =>
              map.has(id) ? `[[${map.get(id)}${label || ""}]]` : all,
          );
          for (const table of n.tables || [])
            for (const c of table.columns)
              if (["project", "task"].includes(c.type))
                for (const row of table.rows)
                  row.cells[c.id] = map.get(row.cells[c.id]) || "";
        };
        remap(x);
        x.history?.forEach(remap);
        x.project = x.projects?.[0] || x.project;
      }
      if (k === "ledger") {
        if (map.has(x.account)) x.account = map.get(x.account);
        if (map.has(x.toAccount)) x.toAccount = map.get(x.toAccount);
      }
      if (k === "debts" && map.has(x.account)) x.account = map.get(x.account);
      if (
        k === "notes" &&
        x.type === "diary" &&
        !x.deletedAt &&
        state.notes.some(
          (n) => !n.deletedAt && n.type === "diary" && n.date === x.date,
        )
      ) {
        x.type = "document";
        x.title += "（导入副本）";
      }
      state[k].push(x);
    }
  return state;
}
export function samples() {
  const d = today();
  return normalize({
    projects: [
      {
        id: "p1",
        title: "考研复习",
        description: "示例项目：阶段目标、任务和复盘。",
      },
      {
        id: "p2",
        title: "个人网站建设",
        description: "审阅工作区，逐步完善内容。",
      },
    ],
    goals: [
      {
        id: "g1",
        title: "数学阶段复习",
        project: "p1",
        start: d,
        end: addDays(d, 14),
        description: "练习、整理错题，再做阶段复盘。",
      },
    ],
    tasks: [
      {
        id: "t1",
        title: "完成一组积分练习",
        project: "p1",
        goal: "g1",
        date: d,
        done: false,
      },
      {
        id: "t2",
        title: "整理昨天的错题",
        project: "p1",
        goal: "g1",
        date: d,
        done: true,
      },
      { id: "t3", title: "整理想读的书单", project: "", date: "", done: false },
    ],
    notes: [
      {
        id: "n1",
        title: "工作区使用说明",
        type: "document",
        date: d,
        project: "p2",
        body: "# 从一件小事开始\n\n- 在「今天」快速记下一件事\n- 单击日历查看当天，切换「选择区间」建立目标\n- 日记会自动列出当天任务，正文可以只写一句话\n\n**所有笔记默认私密。**",
      },
    ],
    events: [],
  });
}
