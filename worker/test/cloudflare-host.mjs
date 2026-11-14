// Lets a check import a module that imports `cloudflare:workers` (an entrypoint or a Durable Object) directly, with
// the host's base classes stood in for, instead of rewriting its source. Import this first, then the module dynamically
// (`await import(...)`): a static import is linked before this file runs. Also a D1 stand-in over node:sqlite, so the
// SQL a check exercises is the SQL a migration made, run for real.
import { register } from "node:module";
import { readFileSync, readdirSync } from "node:fs";

const STUB = `export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }
export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }
export class WebSocketRequestResponsePair { constructor(request, response) { this.request = request; this.response = response; } }`;
const HOOKS = `export const resolve = (specifier, context, next) => specifier === "cloudflare:workers"
  ? { url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(STUB)}`)}, shortCircuit: true } : next(specifier, context);`;
register(`data:text/javascript,${encodeURIComponent(HOOKS)}`);

// node:sqlite says it is experimental once per process; nothing else in these checks prints, so keep it that way.
const emit = process.emitWarning;
process.emitWarning = (warning, ...rest) => (String(warning).includes("SQLite") ? undefined : emit.call(process, warning, ...rest));
const { DatabaseSync } = await import("node:sqlite");

/** A D1 database in memory with every migration in `dir` applied in order: prepare/bind/first/all/run and batch. */
export const memoryD1 = (dir) => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(file, dir), "utf8"));
  const statement = (sql, values = []) => ({
    sql, values,
    bind: (...next) => statement(sql, next),
    first: async (column) => { const row = db.prepare(sql).get(...values); return row === undefined ? null : column ? row[column] : { ...row }; },
    all: async () => ({ results: db.prepare(sql).all(...values).map((row) => ({ ...row })) }),
    run: async () => { const info = db.prepare(sql).run(...values); return { meta: { changes: Number(info.changes) } }; },
  });
  return {
    raw: db,
    prepare: (sql) => statement(sql),
    // D1 runs a batch as one transaction: all of it or none.
    batch: async (statements) => {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
};

/** A JSONC file (wrangler's configs) as data: comments and trailing commas dropped, strings kept exactly. */
export const readJsonc = (url) => {
  const source = readFileSync(url, "utf8");
  let out = "", i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '"') {
      let j = i + 1;
      while (source[j] !== '"') j += source[j] === "\\" ? 2 : 1;
      out += source.slice(i, j + 1); i = j + 1;
    } else if (c === "/" && source[i + 1] === "/") { while (i < source.length && source[i] !== "\n") i++; }
    else if (c === "/" && source[i + 1] === "*") { i = source.indexOf("*/", i + 2) + 2; }
    else { out += c; i++; }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
};
