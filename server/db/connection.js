import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "schema.sql");

let db = null;

export function openDb(dbPath) {
  const database = new DatabaseSync(dbPath);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(readFileSync(schemaPath, "utf-8"));
  return database;
}

export function getDb() {
  if (!db) {
    const dbPath = process.env.WILDERWEB_DB_PATH
      || path.join(__dirname, "..", "..", "data", "campaign.db");
    db = openDb(dbPath);
  }
  return db;
}
