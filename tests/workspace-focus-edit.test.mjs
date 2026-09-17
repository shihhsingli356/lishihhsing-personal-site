import test from "node:test";
import assert from "node:assert/strict";
import {
  validateFocusEdit,
  focusStats,
  segmentDuration,
  recordedHours,
} from "../src/workspace/activity.js";
const time = (value) => new Date(value).getTime();
test("editing segments updates day, hour, total and settlement together while excluding pauses", () => {
  const segments = validateFocusEdit(
    [
      { start: time("2026-09-17T23:50:00"), end: time("2026-09-18T00:10:00") },
      { start: time("2026-09-18T00:20:00"), end: time("2026-09-18T00:34:00") },
    ],
    [],
    time("2026-09-19T00:00:00"),
  );
  const records = [{ id: "focus", segments }];
  const stats = focusStats(records, "2026-09-17", "2026-09-18");
  assert.equal(segmentDuration(segments), 34 * 60000);
  assert.equal(recordedHours(segmentDuration(segments)), 0.6);
  assert.equal(stats.grid[3][23], 10);
  assert.equal(stats.grid[4][0], 24);
  assert.equal(
    focusStats(records, "2026-09-18", "2026-09-18").totalMs,
    24 * 60000,
  );
});
test("invalid edits are rejected without mutating the original segments", () => {
  const original = [{ start: 1000, end: 2000 }];
  assert.deepEqual(validateFocusEdit(original, [], 3000), original);
  for (const segments of [
    [],
    [{ start: 2000, end: 1000 }],
    [{ start: 1000, end: 4000 }],
    [
      { start: 1000, end: 2000 },
      { start: 1500, end: 2500 },
    ],
  ]) {
    assert.throws(() => validateFocusEdit(segments, [], 3000));
  }
  assert.throws(() =>
    validateFocusEdit(original, [{ start: 1500, end: 3000 }], 4000),
  );
  assert.deepEqual(original, [{ start: 1000, end: 2000 }]);
});
