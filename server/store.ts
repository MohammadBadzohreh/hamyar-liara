import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.ts";
import { canonical, hash, redact } from "./security.ts";
export type Project = {
  id: string;
  name: string;
  repo: string;
  ref: string;
  app: string;
  port: number;
  url: string;
  healthPath: string;
  lastGoodCommit?: string;
  currentCommit?: string;
  monitor: boolean;
};
export type Operation = {
  id: string;
  projectId: string;
  kind: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  parameters: any;
  proposal: any;
  events: any[];
  result?: any;
  error?: string;
};
export class Store {
  db: DatabaseSync;
  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec(
      `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT,id TEXT,data TEXT,PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY,operation TEXT UNIQUE,digest TEXT,expires INTEGER,state TEXT,owner TEXT); CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,csrf TEXT,expires INTEGER);`,
    );
  }
  put(kind: string, id: string, data: any) {
    this.db
      .prepare("INSERT OR REPLACE INTO records VALUES(?,?,?)")
      .run(kind, id, JSON.stringify(data));
    return data;
  }
  get<T = any>(kind: string, id: string): T | undefined {
    const row = this.db
      .prepare("SELECT data FROM records WHERE kind=? AND id=?")
      .get(kind, id) as any;
    return row ? JSON.parse(row.data) : undefined;
  }
  list<T = any>(kind: string): T[] {
    return (
      this.db
        .prepare("SELECT data FROM records WHERE kind=? ORDER BY rowid DESC")
        .all(kind) as any[]
    ).map((r) => JSON.parse(r.data));
  }
  operation(
    projectId: string,
    kind: string,
    parameters: any,
    proposal: any,
  ): Operation {
    parameters = JSON.parse(JSON.stringify(parameters));
    const digest = hash(canonical({ projectId, kind, parameters }));
    const existing = this.db
      .prepare(
        "SELECT operation FROM approvals WHERE digest=? AND state='pending' AND expires>?",
      )
      .get(digest, Date.now()) as any;
    if (existing) return this.get<Operation>("operation", existing.operation)!;
    const op = {
      id: randomUUID(),
      projectId,
      kind,
      status: "awaiting_approval",
      parameters,
      proposal,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      events: [],
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.put("operation", op.id, op);
      this.db
        .prepare("INSERT INTO approvals VALUES(?,?,?,?,?,?)")
        .run(
          randomUUID(),
          op.id,
          digest,
          Date.now() + 600000,
          "pending",
          "owner",
        );
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return op;
  }
  approve(id: string, owner = "owner") {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const op = this.get<Operation>("operation", id);
      if (!op) throw new Error("عملیات پیدا نشد.");
      const a = this.db
        .prepare("SELECT * FROM approvals WHERE operation=?")
        .get(id) as any;
      if (
        !a ||
        a.owner !== owner ||
        a.state !== "pending" ||
        a.expires < Date.now() ||
        a.digest !==
          hash(
            canonical({
              projectId: op.projectId,
              kind: op.kind,
              parameters: op.parameters,
            }),
          )
      )
        throw new Error("تأیید نامعتبر، منقضی یا قبلاً مصرف شده است.");
      if (
        this.list<Operation>("operation").some(
          (x) => x.projectId === op.projectId && x.status === "running",
        )
      )
        throw new Error("عملیات دیگری برای این پروژه در حال اجراست.");
      this.db
        .prepare("UPDATE approvals SET state='consumed' WHERE operation=?")
        .run(id);
      op.status = "running";
      this.put("operation", id, op);
      this.db.exec("COMMIT");
      return op;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  reject(id: string) {
    const op = this.get<Operation>("operation", id);
    if (!op || op.status !== "awaiting_approval")
      throw new Error("قابل رد کردن نیست.");
    op.status = "rejected";
    this.db
      .prepare("UPDATE approvals SET state='rejected' WHERE operation=?")
      .run(id);
    return this.put("operation", id, op);
  }
  event(id: string, message: string, detail?: any) {
    const op = this.get<Operation>("operation", id)!;
    op.events.push({ at: Date.now(), message, detail: redact(detail) });
    op.updatedAt = Date.now();
    return this.put("operation", id, op);
  }
  finish(id: string, status: string, result?: any, error?: string) {
    const op = this.get<Operation>("operation", id)!;
    op.status = status;
    op.updatedAt = Date.now();
    op.result = redact(result);
    op.error = redact(error);
    return this.put("operation", id, op);
  }
  close() {
    this.db.close();
  }
}
mkdirSync(config.dataDir, { recursive: true });
export const store = new Store(join(config.dataDir, "hamyar.sqlite"));
