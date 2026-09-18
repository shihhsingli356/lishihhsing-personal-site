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
test("multi-project notes, table types, view filters and history survive storage and backup", async () => {
  const state = samples(),
    n = state.notes[0];
  n.projects = state.projects.map((p) => p.id);
  n.project = n.projects[0];
  n.tags = ["资料"];
  n.status = "active";
  n.tables = [
    {
      id: "table-storage",
      title: "资料",
      columns: [{ id: "amount", title: "金额", type: "money", options: [] }],
      rows: [{ id: "r1", cells: { amount: 12.5 } }],
      view: {
        column: "amount",
        operator: "gte",
        value: "10",
        query: "",
        sort: "amount",
        direction: "desc",
      },
    },
  ];
  n.history = [
    {
      title: n.title,
      body: n.body,
      projects: [...n.projects],
      tags: ["资料"],
      status: "draft",
      tables: structuredClone(n.tables),
      at: "2026-09-18T00:00:00Z",
    },
  ];
  await saveLocal("document-tables", { state, revision: 1 });
  const stored = (await loadLocal("document-tables")).state,
    restored = await readBackup(backupBlob(stored));
  assert.deepEqual(restored.notes[0].tables, n.tables);
  assert.deepEqual(restored.notes[0].projects, n.projects);
  assert.equal(
    restored.notes[0].history[0].tables[0].rows[0].cells.amount,
    12.5,
  );
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
