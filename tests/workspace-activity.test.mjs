import test from "node:test";
import assert from "node:assert/strict";
import {
  recordedHours,
  segmentDuration,
  periodRange,
  focusStats,
  moneyCents,
  cleanSegments,
} from "../src/workspace/activity.js";
import {
  normalize,
  emptyState,
  occurrences,
  importCopy,
  overlaps,
} from "../src/workspace/core.js";
const ms = (s) => new Date(s).getTime();

test("overlapping occurrences of the same multi-day series are detected", () => {
  assert.deepEqual(
    [
      ...overlaps([
        { id: "e1", originDay: "2026-09-18", start: "00:00", end: "18:00" },
        { id: "e1", originDay: "2026-09-19", start: "09:00", end: "24:00" },
      ]),
    ],
    ["e1"],
  );
});

test("six-minute settlement uses the requested four-minute remainder threshold", () => {
  for (const [minutes, hours] of [
    [0, 0],
    [3, 0],
    [3.99, 0],
    [4, 0.1],
    [6, 0.1],
    [9, 0.1],
    [10, 0.2],
    [59, 1],
    [60, 1],
    [63, 1],
    [64, 1.1],
  ])
    assert.equal(recordedHours(minutes * 60000), hours);
});
test("paused segments split correctly across hours, midnight and range boundaries", () => {
  const segments = [
    { start: ms("2026-09-18T23:50:00"), end: ms("2026-09-19T00:10:00") },
    { start: ms("2026-09-19T00:30:00"), end: ms("2026-09-19T01:05:00") },
  ];
  assert.equal(segmentDuration(segments), 55 * 60000);
  const records = [{ id: "f1", segments }];
  const all = focusStats(records, "2026-09-18", "2026-09-19");
  assert.equal(all.grid[4][23], 10);
  assert.equal(all.grid[5][0], 40);
  assert.equal(all.grid[5][1], 5);
  assert.equal(all.totalMs, 55 * 60000);
  assert.equal(
    focusStats(records, "2026-09-19", "2026-09-19").totalMs,
    45 * 60000,
  );
  assert.equal(
    focusStats(
      [{ ...records[0], deletedAt: "now" }],
      "2026-09-18",
      "2026-09-19",
    ).totalMs,
    0,
  );
});
test("date periods include leap day, quarter, half year and custom bounds", () => {
  assert.deepEqual(periodRange("month", "2024-02-14"), {
    start: "2024-02-01",
    end: "2024-02-29",
  });
  assert.deepEqual(periodRange("quarter", "2026-09-18"), {
    start: "2026-07-01",
    end: "2026-09-30",
  });
  assert.deepEqual(periodRange("half", "2026-09-18"), {
    start: "2026-07-01",
    end: "2026-12-31",
  });
  assert.deepEqual(periodRange("year", "2026-09-18"), {
    start: "2026-01-01",
    end: "2026-12-31",
  });
  assert.deepEqual(periodRange("week", "2026-09-18"), {
    start: "2026-09-14",
    end: "2026-09-20",
  });
  assert.throws(() =>
    periodRange("custom", "2026-09-18", "2026-09-19", "2026-09-18"),
  );
});
test("money converts decimal strings to exact cents and rejects ambiguous amounts", () => {
  assert.equal(moneyCents("0.10") + moneyCents("0.20"), 30);
  assert.equal(moneyCents("12.34"), 1234);
  for (const input of ["-1", "0", "1.001", "NaN", "1e2", ""])
    assert.throws(() => moneyCents(input));
});
test("new records, diary metadata and active timer survive backup normalization", () => {
  const s = emptyState();
  const segments = [
    { start: ms("2026-09-18T08:00:00"), end: ms("2026-09-18T08:06:00") },
  ];
  s.ledger.push({
    id: "l1",
    title: "午餐",
    kind: "expense",
    date: "2026-09-18",
    cents: 1200,
    category: "餐饮",
  });
  s.budgets.push({ id: "b1", month: "2026-09", cents: 100000 });
  s.focus.push({ id: "f1", title: "阅读", segments });
  s.focusDraft = { id: "draft", title: "继续阅读", segments, startedAt: null };
  s.notes.push({
    id: "n1",
    type: "diary",
    date: "2026-09-18",
    mood: "充实",
    body: "日记",
  });
  const restored = normalize(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.ledger[0].cents, 1200);
  assert.deepEqual(restored.focus[0].segments, segments);
  assert.deepEqual(restored.focusDraft.segments, segments);
  assert.equal(restored.notes[0].mood, "充实");
  const copy = importCopy(emptyState(), restored);
  assert.equal(copy.ledger.length, 1);
  assert.equal(copy.focus.length, 1);
  assert.notEqual(copy.focus[0].id, "f1");
  assert.throws(() =>
    cleanSegments([
      { start: 10, end: 30 },
      { start: 20, end: 40 },
    ]),
  );
});
test("cross-day repeated events render clipped hours and skip the whole occurrence", () => {
  const s = emptyState();
  s.events.push({
    id: "e1",
    title: "夜间复习",
    date: "2026-09-18",
    endDate: "2026-09-19",
    start: "23:00",
    end: "01:00",
    repeat: "weekly",
    until: "2026-10-02",
    exceptions: [],
  });
  const normalized = normalize(s);
  assert.equal(occurrences(normalized, "2026-09-18")[0].end, "24:00");
  const continued = occurrences(normalized, "2026-09-19")[0];
  assert.equal(continued.start, "00:00");
  assert.equal(continued.end, "01:00");
  assert.equal(continued.originDay, "2026-09-18");
  assert.equal(occurrences(normalized, "2026-09-26").length, 1);
  normalized.events[0].exceptions.push("2026-09-18");
  assert.equal(occurrences(normalized, "2026-09-19").length, 0);
  assert.equal(occurrences(normalized, "2026-10-03").length, 1);
});
