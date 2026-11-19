import type { Db } from "./connection.ts";

export type SqlParam = string | number | bigint | null | Uint8Array;

/**
 * node:sqlite only accepts null/number/bigint/string/Uint8Array bind values.
 * Normalising here prevents accidental boolean/undefined binds.
 */
export function toParam(value: unknown): SqlParam {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    return value;
  }
  if (value instanceof Uint8Array) return value;
  throw new TypeError(`Unsupported SQL parameter type: ${typeof value}`);
}

export function all<T>(db: Db, sql: string, params: unknown[] = []): T[] {
  const statement = db.prepare(sql);
  return statement.all(...params.map(toParam)) as unknown as T[];
}

export function one<T>(db: Db, sql: string, params: unknown[] = []): T | undefined {
  const statement = db.prepare(sql);
  return statement.get(...params.map(toParam)) as unknown as T | undefined;
}

export function run(db: Db, sql: string, params: unknown[] = []): {
  changes: number;
  lastInsertRowid: number | bigint;
} {
  const statement = db.prepare(sql);
  const result = statement.run(...params.map(toParam));
  return {
    changes: Number(result.changes ?? 0),
    lastInsertRowid: result.lastInsertRowid ?? 0,
  };
}

/** Run a set of statements atomically. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
