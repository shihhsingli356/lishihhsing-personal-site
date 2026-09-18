import test from "node:test";
import assert from "node:assert/strict";
import {
  samples,
  normalize,
  emptyState,
  addDays,
  dayDiff,
  validDay,
  live,
  occurrences,
  overlaps,
  taskOccursOn,
  taskDoneOn,
  taskOccurrencesBetween,
  taskProgress,
  goalPreview,
  applyGoal,
  noteCheckpoint,
  importCopy,
} from "../src/workspace/core.js";

test("date arithmetic crosses months, leap days and years", () => {
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(dayDiff("2026-03-01", "2026-04-01"), 31);
  assert.equal(validDay("2026-02-30"), false);
});
test("v1 migration preserves titles and notes; task may have no date", () => {
  const old = samples();
  delete old.version;
  delete old.events;
  old.notes[0].body = "旧版用户内容";
  old.tasks[0].date = "";
  const s = normalize(old);
  assert.equal(s.notes[0].body, "旧版用户内容");
  assert.equal(s.tasks[0].date, "");
  assert.deepEqual(s.events, []);
  assert.equal(s.notes[0].private, true);
});
test("untrusted malformed imports fail before changing state", () => {
  assert.throws(() =>
    normalize({ projects: [], goals: [], tasks: {}, notes: [] }),
  );
  const s = samples();
  s.tasks[0].id = s.projects[0].id;
  assert.throws(() => normalize(s));
  const g = samples();
  g.goals[0].end = "bad";
  assert.throws(() => normalize(g));
  const v = samples();
  v.version = 100;
  assert.throws(() => normalize(v));
});
test("goal preview does not mutate and never moves completed/undated tasks", () => {
  const s = samples(),
    g = s.goals[0],
    before = structuredClone(s);
  s.tasks.push({ id: "undated", goal: g.id, date: "", done: false });
  const draft = { ...g, start: addDays(g.start, 7), end: addDays(g.end, 7) };
  const changes = goalPreview(s, g, draft, true);
  assert.equal(changes.find((t) => t.id === "t1").to, addDays(g.start, 7));
  assert.equal(changes.find((t) => t.id === "t2").to, before.tasks[1].date);
  assert.equal(changes.find((t) => t.id === "undated").to, "");
  assert.deepEqual(g, before.goals[0]);
  applyGoal(s, g, draft, true);
  assert.equal(s.tasks[1].date, before.tasks[1].date);
});
test("shortened goal flags outside tasks without removing them", () => {
  const s = samples(),
    g = s.goals[0];
  s.tasks[0].date = g.end;
  const changes = goalPreview(s, g, { ...g, end: g.start }, false);
  assert.equal(changes.find((t) => t.id === "t1").outside, true);
  assert.equal(s.tasks[0].date, g.end);
});
test("shifting a goal keeps range task dates and per-day completion aligned", () => {
  const s = samples();
  const g = s.goals[0];
  const start = g.start;
  s.tasks.push(
    normalize({
      version: 2,
      projects: s.projects,
      goals: [g],
      tasks: [
        {
          id: "series",
          title: "阶段任务",
          scheduleType: "range",
          date: start,
          endDate: addDays(start, 2),
          goal: g.id,
          completedDates: [addDays(start, 1)],
          exceptions: [],
        },
      ],
      notes: [],
      events: [],
    }).tasks[0],
  );
  const series = s.tasks.at(-1);
  const draft = {
    ...g,
    start: addDays(g.start, 2),
    end: addDays(g.end, 2),
  };
  applyGoal(s, g, draft, true);
  assert.equal(series.date, addDays(start, 2));
  assert.equal(series.endDate, addDays(start, 4));
  assert.deepEqual(series.completedDates, [addDays(start, 3)]);
});
const event = (extra = {}) => ({
  id: "e1",
  title: "课",
  date: "2026-09-18",
  start: "09:00",
  end: "10:00",
  repeat: "weekly",
  until: "2026-10-02",
  exceptions: [],
  project: "",
  ...extra,
});
test("weekly repeats include endpoints, exclude other days and exceptions", () => {
  const s = emptyState();
  s.events = [event()];
  assert.equal(occurrences(s, "2026-09-18").length, 1);
  assert.equal(occurrences(s, "2026-09-19").length, 0);
  assert.equal(occurrences(s, "2026-10-02").length, 1);
  assert.equal(occurrences(s, "2026-10-09").length, 0);
  s.events[0].exceptions.push("2026-09-25");
  assert.equal(occurrences(s, "2026-09-25").length, 0);
});
test("daily and one-off schedules use inclusive bounds", () => {
  const s = emptyState();
  s.events = [event({ repeat: "daily", until: "2026-09-20" })];
  assert.equal(occurrences(s, "2026-09-17").length, 0);
  assert.equal(occurrences(s, "2026-09-19").length, 1);
  assert.equal(occurrences(s, "2026-09-21").length, 0);
  s.events[0].repeat = "none";
  assert.equal(occurrences(s, "2026-09-19").length, 0);
});
test("time conflicts flag both, adjacent time slots are allowed", () => {
  assert.equal(
    overlaps([event(), event({ id: "e2", start: "10:00", end: "11:00" })]).size,
    0,
  );
  assert.equal(
    overlaps([event(), event({ id: "e2", start: "09:30", end: "10:30" })]).size,
    2,
  );
});
test("archive hides project data in daily view, not project history", () => {
  const s = samples();
  s.projects[0].archived = true;
  assert.equal(live(s, "tasks").filter((t) => t.project === "p1").length, 0);
  assert.equal(
    live(s, "tasks", true).filter((t) => t.project === "p1").length,
    2,
  );
  s.projects[0].archived = false;
  assert.equal(live(s, "tasks").filter((t) => t.project === "p1").length, 2);
});
test("soft delete and restore preserve record data", () => {
  const s = samples();
  const t = s.tasks[0],
    title = t.title;
  t.deletedAt = new Date().toISOString();
  assert.ok(!live(s, "tasks").includes(t));
  t.deletedAt = "";
  assert.ok(live(s, "tasks").includes(t));
  assert.equal(t.title, title);
});
test("debts validate payments and survive copy import with remapped links", () => {
  const raw = emptyState();
  raw.projects.push({ id: "debt-project", title: "家庭财务" });
  raw.accounts.push({
    id: "debt-account",
    title: "还款账户",
    type: "bank",
    currency: "CNY",
    rate: 1,
    openingCents: 0,
  });
  raw.debts.push({
    id: "debt-one",
    title: "学费分期",
    project: "debt-project",
    account: "debt-account",
    kind: "payable",
    principalCents: 100000,
    currency: "CNY",
    rate: 1,
    date: "2026-09-01",
    dueDate: "2026-12-01",
    payments: [
      { id: "payment-one", date: "2026-09-18", cents: 25000, memo: "首期" },
    ],
  });
  const incoming = normalize(raw);
  assert.equal(incoming.version, 4);
  assert.equal(incoming.debts[0].payments[0].cents, 25000);
  const destination = emptyState();
  importCopy(destination, incoming);
  const copied = destination.debts[0];
  assert.notEqual(copied.id, "debt-one");
  assert.notEqual(copied.project, "debt-project");
  assert.notEqual(copied.account, "debt-account");
  assert.equal(destination.projects[0].id, copied.project);
  assert.equal(destination.accounts[0].id, copied.account);

  raw.debts[0].payments.push({
    id: "payment-two",
    date: "2026-09-19",
    cents: 80000,
  });
  assert.throws(() => normalize(raw), /还款总额/);
  raw.debts[0].payments.pop();
  raw.debts[0].dueDate = "2026-08-31";
  assert.throws(() => normalize(raw), /到期日/);
});
test("history deduplicates and keeps at most thirty versions", () => {
  const n = { title: "A", body: "original", history: [] };
  noteCheckpoint(n);
  noteCheckpoint(n);
  assert.equal(n.history.length, 1);
  for (let i = 0; i < 40; i++) {
    n.body = "v" + i;
    noteCheckpoint(n);
  }
  assert.equal(n.history.length, 30);
  assert.equal(n.history[0].body, "v39");
});
test("copy import remaps relationships and keeps both same-day diaries", () => {
  const s = samples();
  s.notes[0].type = "diary";
  s.tasks[0].sourceNote = s.notes[0].id;
  const imported = structuredClone(s);
  const originalIds = new Set(s.tasks.map((t) => t.id));
  importCopy(s, imported);
  assert.equal(s.projects.length, 4);
  const copied = s.tasks.find(
    (t) => !originalIds.has(t.id) && t.title === imported.tasks[0].title,
  );
  assert.notEqual(copied.goal, imported.tasks[0].goal);
  assert.ok(
    s.goals.some((g) => g.id === copied.goal && g.project === copied.project),
  );
  assert.equal(s.notes.filter((n) => n.type === "diary").length, 1);
  assert.ok(s.notes.some((n) => n.id === copied.sourceNote));
});
test("bad event times and repeat boundaries rejected on import", () => {
  const s = emptyState();
  s.events = [event({ start: "24:00" })];
  assert.throws(() => normalize(s));
  s.events = [event({ until: "" })];
  assert.throws(() => normalize(s));
});
test("task schedules support ranges and repeat rules with inclusive dates", () => {
  const s = normalize({
    version: 2,
    projects: [{ id: "p", title: "计划" }],
    goals: [],
    tasks: [
      {
        id: "range",
        title: "连续任务",
        scheduleType: "range",
        date: "2026-09-18",
        endDate: "2026-09-20",
        project: "p",
      },
      {
        id: "weekday",
        title: "工作日任务",
        scheduleType: "repeat",
        date: "2026-09-18",
        until: "2026-09-25",
        repeat: "weekdays",
        project: "p",
      },
      {
        id: "custom",
        title: "每两周任务",
        scheduleType: "repeat",
        date: "2026-09-18",
        until: "2026-10-10",
        repeat: "custom",
        repeatInterval: 2,
        repeatUnit: "weeks",
        project: "p",
      },
    ],
    notes: [],
    events: [],
  });
  const [range, weekday, custom] = s.tasks;
  assert.equal(taskOccursOn(range, "2026-09-19"), true);
  assert.equal(taskOccursOn(range, "2026-09-21"), false);
  assert.equal(taskOccursOn(weekday, "2026-09-18"), true);
  assert.equal(taskOccursOn(weekday, "2026-09-19"), false);
  assert.equal(taskOccursOn(weekday, "2026-09-21"), true);
  assert.deepEqual(taskOccurrencesBetween(custom, "2026-09-18", "2026-10-10"), [
    "2026-09-18",
    "2026-10-02",
  ]);
  custom.completedDates = ["2026-10-02"];
  assert.equal(taskDoneOn(custom, "2026-09-18"), false);
  assert.equal(taskDoneOn(custom, "2026-10-02"), true);
  assert.deepEqual(taskProgress(range, "2026-09-18", "2026-09-20"), {
    done: 0,
    total: 3,
  });
  range.completedDates = ["2026-09-19"];
  assert.deepEqual(taskProgress(range, "2026-09-18", "2026-09-20"), {
    done: 1,
    total: 3,
  });
});
test("invalid task ranges and repeats are rejected", () => {
  const base = {
    version: 2,
    projects: [],
    goals: [],
    notes: [],
    events: [],
  };
  assert.throws(() =>
    normalize({
      ...base,
      tasks: [
        {
          id: "range",
          title: "缺少结束日期",
          scheduleType: "range",
          date: "2026-09-18",
        },
      ],
    }),
  );
  assert.throws(() =>
    normalize({
      ...base,
      tasks: [
        {
          id: "repeat",
          title: "截止日期早于开始",
          scheduleType: "repeat",
          date: "2026-09-18",
          until: "2026-09-17",
          repeat: "daily",
        },
      ],
    }),
  );
});

test("accounts, foreign currency and investments survive normalization", () => {
  const state = normalize({
    version: 2,
    projects: [],
    goals: [],
    tasks: [],
    notes: [],
    events: [],
    accounts: [
      {
        id: "usd-savings",
        title: "美元存款",
        type: "savings",
        currency: "USD",
        openingCents: 120000,
        rate: 7.1,
      },
    ],
    ledger: [
      {
        id: "buy-index",
        title: "买入指数基金",
        kind: "investment_buy",
        date: "2026-09-18",
        cents: 50000,
        currency: "USD",
        rate: 7.1,
        account: "usd-savings",
        asset: "VOO",
        quantity: 1.25,
      },
    ],
  });
  assert.equal(state.accounts[0].currency, "USD");
  assert.equal(state.accounts[0].openingCents, 120000);
  assert.equal(state.ledger[0].kind, "investment_buy");
  assert.equal(state.ledger[0].rate, 7.1);
  assert.equal(state.ledger[0].asset, "VOO");
  assert.equal(state.ledger[0].quantity, 1.25);
});
