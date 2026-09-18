import test from "node:test";
import assert from "node:assert/strict";
import {
  runway,
  runwayLabel,
  randomIndex,
  parseChoices,
  drawChoices,
  jiaobeiResult,
} from "../src/workspace/leisure-core.js";

test("runway handles zero returns, monthly conversion, inflation and partial years", () => {
  const base = {
    principal: 120000,
    spending: 1000,
    period: "month",
    returns: 0,
    inflation: 0,
  };
  assert.equal(runway(base).years, 10);
  assert.deepEqual(
    runway(base),
    runway({ ...base, period: "year", spending: 12000 }),
  );
  assert.equal(runway({ ...base, principal: 6000 }).years, 0.5);
  assert.ok(runway({ ...base, inflation: 5 }).years < 10);
  assert.ok(runway({ ...base, returns: -5 }).years < 10);
  assert.equal(runway({ ...base, principal: 0 }).years, 0);
  assert.throws(() => runway({ ...base, spending: NaN }));
  assert.throws(() => runway({ ...base, inflation: -100 }));
});

test("perpetuity and long but finite savings remain distinct", () => {
  const base = {
    principal: 1000000,
    spending: 10000,
    period: "year",
    returns: 1,
    inflation: 0,
  };
  assert.equal(runwayLabel(runway(base)), "∞");
  assert.equal(runway({ ...base, returns: 0 }).years, 100);
  const long = runway({ ...base, spending: 5000, returns: 0 });
  assert.equal(long.perpetual, false);
  assert.equal(runwayLabel(long), "100+");
  assert.equal(runway({ ...base, spending: 0 }).perpetual, true);
});

test("uniform random indexing rejects the biased tail and selection cannot repeat", () => {
  const words = [0xffffffff, 5];
  let calls = 0;
  assert.equal(
    randomIndex(3, (buffer) => {
      buffer[0] = words[calls++];
    }),
    2,
  );
  assert.equal(calls, 2);
  assert.throws(() => randomIndex(0));
  const items = parseChoices("甲\n乙\r\n甲\n 丙\n");
  assert.deepEqual(items, ["甲", "乙", "丙"]);
  const draw = drawChoices(items, 3, () => 0);
  assert.deepEqual(draw.picked, items);
  assert.equal(draw.remaining.length, 0);
  assert.throws(() => drawChoices(items, 4));
  assert.throws(() => parseChoices(" "));
});

test("jiaobei maps the four independent face combinations correctly", () => {
  assert.equal(jiaobeiResult(true, false).name, "圣筊");
  assert.equal(jiaobeiResult(false, true).name, "圣筊");
  assert.equal(jiaobeiResult(true, true).name, "笑筊");
  assert.equal(jiaobeiResult(false, false).name, "阴筊");
});
