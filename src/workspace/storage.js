import { normalize } from "./core.js";
const DB = "lishihhsing-workspace-v2";
let opening;
export function database() {
  return (opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("records");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
export async function getRecord(key) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const r = db.transaction("records").objectStore("records").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function putRecord(key, value) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error("保存中断"));
  });
}
export async function loadLocal(scope) {
  const data = await getRecord("state:" + scope);
  return data ? { ...data, state: normalize(data.state) } : null;
}
export async function saveLocal(scope, envelope, expectedRevision) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readwrite"),
      store = tx.objectStore("records");
    let conflict = false;
    const request = store.get("state:" + scope);
    request.onsuccess = () => {
      if (
        expectedRevision !== undefined &&
        (request.result?.revision || 0) !== expectedRevision
      ) {
        conflict = true;
        tx.abort();
        return;
      }
      store.put(envelope, "state:" + scope);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => {
      const error = Error(
        conflict
          ? "其他标签页已经保存了新版本，请先导出本页副本，再读取最新版本"
          : "本机保存中断",
      );
      error.code = conflict ? "LOCAL_CONFLICT" : "SAVE_FAILED";
      reject(error);
    };
  });
}
export async function recoveryPoint(scope, state, label) {
  const old = (await getRecord("recovery:" + scope)) || [];
  old.unshift({
    id: crypto.randomUUID(),
    label,
    at: new Date().toISOString(),
    state: structuredClone(state),
  });
  await putRecord("recovery:" + scope, old.slice(0, 5));
}
export function recoveryList(scope) {
  return getRecord("recovery:" + scope).then((x) => x || []);
}
export function backupBlob(state) {
  return new Blob(
    [
      JSON.stringify(
        {
          format: "lishihhsing-workspace",
          exportedAt: new Date().toISOString(),
          state,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
}
export async function readBackup(file) {
  if (file.size > 30 * 1024 * 1024) throw Error("备份超过 30 MB");
  const raw = JSON.parse(await file.text());
  return normalize(raw.state || raw);
}
