import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

declare const __non_webpack_require__: any;

let DatabaseSyncClass: typeof DatabaseSyncType;

try {
  const loadModule =
    typeof __non_webpack_require__ !== "undefined"
      ? __non_webpack_require__
      : typeof require !== "undefined"
      ? require
      : eval("require");
  DatabaseSyncClass = loadModule("node:sqlite").DatabaseSync;
} catch {
  try {
    DatabaseSyncClass = eval('require("node:sqlite")').DatabaseSync;
  } catch {
    throw new Error("Failed to load node:sqlite. Node.js >= 22.5 is required.");
  }
}

export const DatabaseSync: typeof DatabaseSyncType = DatabaseSyncClass;
export type DatabaseSync = DatabaseSyncType;
