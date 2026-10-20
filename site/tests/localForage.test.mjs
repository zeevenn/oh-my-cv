import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const resume = (id) => ({
  id,
  name: `Resume ${id}`,
  markdown: "Original content",
  css: "",
  styles: {},
  created_at: String(id),
  updated_at: String(id)
});

// Use the real database and migration code with IndexedDB-style snapshot reads.
const database = (records = [resume(1), resume(2)]) => {
  const values = new Map([
    ["ohmycv_version", "v1"],
    ["ohmycv_data", Object.fromEntries(records.map(({ id, ...record }) => [id, record]))]
  ]);
  let blockedWrite;
  let failWrite = false;
  const localForage = {
    getItem: async (key) => structuredClone(values.get(key) ?? null),
    setItem: async (key, value) => {
      if (key === "ohmycv_data" && blockedWrite) {
        const gate = blockedWrite;
        blockedWrite = null;
        gate.started.resolve();
        await gate.release.promise;
      }
      if (failWrite) {
        failWrite = false;
        throw new Error("Storage write failed");
      }
      values.set(key, structuredClone(value));
    }
  };
  const modules = new Map();
  const load = (name) => {
    if (modules.has(name)) return modules.get(name);
    const exports = {};
    modules.set(name, exports);
    const source = readFileSync(
      new URL(`../src/utils/storage/${name}.ts`, import.meta.url),
      "utf8"
    );
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    });
    runInNewContext(outputText, {
      exports,
      require: (specifier) => {
        if (specifier === "localforage") return localForage;
        if (specifier === "@renovamen/utils") {
          return { isClient: true, copy: structuredClone, now: Date.now };
        }
        if (specifier.startsWith("./")) return load(specifier.slice(2));
        throw new Error(`Unexpected dependency: ${specifier}`);
      },
      useConstant: () => ({
        VERSION: { CURRENT: "v1", VERSION_KEY: "ohmycv_version", EMPTY_FALLBACK: "v0" }
      }),
      console
    });
    return exports;
  };
  const { LocalForageDbService } = load("localForage");
  return {
    db: new LocalForageDbService(),
    anotherDb: () => new LocalForageDbService(),
    blockNextWrite: () => {
      blockedWrite = { started: deferred(), release: deferred() };
      return blockedWrite;
    },
    failNextWrite: () => {
      failWrite = true;
    }
  };
};

test("an in-flight autosave cannot restore a deleted resume", async () => {
  const { db, blockNextWrite } = database();
  const gate = blockNextWrite();
  const save = db.update({ id: 1, markdown: "Edited content" }, true);
  await gate.started.promise;
  const deletion = db.delete(1);
  // Let the deletion reach storage before releasing the older save.
  await new Promise((resolve) => setImmediate(resolve));
  gate.release.resolve();
  const [saved, deleted] = await Promise.all([save, deletion]);
  assert.equal(saved.error, null);
  assert.equal(deleted.error, null);
  assert.equal((await db.queryById(1)).data, null);
});

test("saving another resume cannot restore a deleted resume", async () => {
  const { db, anotherDb, blockNextWrite } = database();
  const gate = blockNextWrite();
  const save = db.update({ id: 2, markdown: "Keep this edit" }, true);
  await gate.started.promise;
  const deletion = anotherDb().delete(1);
  await new Promise((resolve) => setImmediate(resolve));
  gate.release.resolve();
  await Promise.all([save, deletion]);
  assert.equal((await db.queryById(1)).data, null);
  assert.equal((await db.queryById(2)).data.markdown, "Keep this edit");
});

test("concurrent creates preserve both resumes", async () => {
  const { db } = database([]);
  const created = await Promise.all([db.create(resume(1)), db.create(resume(2))]);
  assert(created.every((result) => result.error === null));
  assert.equal((await db.queryAll()).data.length, 2);
});

test("a late autosave does not recreate a resume deleted first", async () => {
  const { db } = database();
  await db.delete(1);
  const saved = await db.update({ id: 1, markdown: "Stale edit" }, true);
  assert(saved.error);
  assert.equal((await db.queryById(1)).data, null);
});

test("a failed write does not block later storage operations", async () => {
  const { db, failNextWrite } = database();
  failNextWrite();
  await assert.rejects(db.update({ id: 2, name: "Failed edit" }, true));
  assert.equal((await db.delete(1)).error, null);
  assert.equal((await db.queryById(1)).data, null);
});
