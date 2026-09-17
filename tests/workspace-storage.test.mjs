import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { samples } from "../src/workspace/core.js";
import {
  saveLocal,
  loadLocal,
  recoveryPoint,
  recoveryList,
  backupBlob,
  readBackup,
} from "../src/workspace/storage.js";

test("atomic revision check rejects stale simultaneous writes", async () => {
  const scope = "race";
  await saveLocal(scope, { state: samples(), revision: 0 });
  const results = await Promise.allSettled([
    saveLocal(scope, { state: samples(), revision: 1 }, 0),
    saveLocal(scope, { state: samples(), revision: 1 }, 0),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.find((r) => r.status === "rejected").reason.code,
    "LOCAL_CONFLICT",
  );
  assert.equal((await loadLocal(scope)).revision, 1);
});
test("saved images and body survive backup roundtrip", async () => {
  const state = samples();
  state.notes[0].body = "![test](data:image/png;base64,aGVsbG8=)";
  const restored = await readBackup(backupBlob(state));
  assert.equal(restored.notes[0].body, state.notes[0].body);
});
test("recovery points retain five independent snapshots", async () => {
  const state = samples();
  for (let i = 0; i < 7; i++) {
    state.notes[0].body = "version " + i;
    await recoveryPoint("recovery-test", state, "point " + i);
  }
  const list = await recoveryList("recovery-test");
  assert.equal(list.length, 5);
  assert.equal(list[0].state.notes[0].body, "version 6");
  assert.equal(list[4].state.notes[0].body, "version 2");
});
test("local and different account namespaces remain isolated", async () => {
  const a = samples(),
    b = samples();
  a.notes[0].body = "private A";
  b.notes[0].body = "private B";
  await saveLocal("account-A", { state: a, revision: 0 });
  await saveLocal("account-B", { state: b, revision: 0 });
  assert.equal((await loadLocal("account-A")).state.notes[0].body, "private A");
  assert.equal((await loadLocal("account-B")).state.notes[0].body, "private B");
});
test("invalid import leaves saved local state intact", async () => {
  const s = samples();
  await saveLocal("import-test", { state: s, revision: 4 });
  await assert.rejects(() =>
    readBackup(new Blob(['{"state":{"projects":[]}}'])),
  );
  assert.equal((await loadLocal("import-test")).revision, 4);
});
