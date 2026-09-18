import test from "node:test";
import assert from "node:assert/strict";
import {
  dateDifference,
  shiftDate,
  pageRange,
  parseDate,
} from "../src/workspace/tool-core.js";
test("date intervals include leap days and optionally the last day", () => {
  assert.deepEqual(dateDifference("2024-02-28", "2024-03-01"), {
    days: 2,
    weekdays: 2,
  });
  assert.deepEqual(dateDifference("2026-09-21", "2026-09-18", true), {
    days: 4,
    weekdays: 2,
  });
  assert.deepEqual(dateDifference("2026-09-19", "2026-09-19"), {
    days: 0,
    weekdays: 0,
  });
  assert.throws(() => parseDate("2026-02-29"));
});
test("date shifts clamp month ends and skip weekends", () => {
  assert.equal(shiftDate("2026-01-31", 1, "month"), "2026-02-28");
  assert.equal(shiftDate("2024-02-29", 1, "year"), "2025-02-28");
  assert.equal(shiftDate("2026-09-18", 1, "weekday"), "2026-09-21");
  assert.equal(shiftDate("2026-09-21", -1, "weekday"), "2026-09-18");
  assert.equal(shiftDate("2026-12-19", -30, "day"), "2026-11-19");
  assert.throws(() => shiftDate("9999-12-31", 1, "day"));
});
test("PDF ranges preserve explicit order and reject invalid input", () => {
  assert.deepEqual(pageRange("3,1-2，2", 4), [2, 0, 1]);
  for (const value of ["0", "5", "3-2", "1,", "abc", ""])
    assert.throws(() => pageRange(value, 4));
});
