import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { ensureSqliteDatabaseReady } from "@/lib/sqliteSchema";

it("repairs missing diff stats after migration baselining without losing tasks or cached stats", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kanvibe-schema-"));
  const databasePath = path.join(directory, "test.db");
  try {
    ensureSqliteDatabaseReady(databasePath);
    let database = new Database(databasePath);
    try {
      database.exec(`
        INSERT INTO kanban_tasks (id, title) VALUES ('task-1', 'Keep this task');
        CREATE TABLE migrations (name TEXT NOT NULL);
        INSERT INTO migrations VALUES ('AddTaskDiffStats1771900000000');
        DROP TABLE task_diff_stats;
      `);
    } finally {
      database.close();
    }

    ensureSqliteDatabaseReady(databasePath);
    database = new Database(databasePath);
    try {
      expect(database.prepare("SELECT title FROM kanban_tasks").get()).toEqual({ title: "Keep this task" });
      database.exec("INSERT INTO task_diff_stats (task_id, additions) VALUES ('task-1', 7)");
    } finally {
      database.close();
    }

    ensureSqliteDatabaseReady(databasePath);
    database = new Database(databasePath);
    try {
      expect(database.prepare("SELECT file_count, additions, deletions FROM task_diff_stats").get())
        .toEqual({ file_count: 0, additions: 7, deletions: 0 });
      database.pragma("foreign_keys = ON");
      database.exec("DELETE FROM kanban_tasks WHERE id = 'task-1'");
      expect(database.prepare("SELECT * FROM task_diff_stats").all()).toEqual([]);
    } finally {
      database.close();
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
