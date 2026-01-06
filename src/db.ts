// src/db.ts
import Dexie, { type EntityTable } from "dexie";

export type SyncStatus = "synced" | "created" | "updated" | "deleted";

export interface CalendarEvent {
    id: string;
    title: string;
    start: string; // ISO 8601
    end: string; // ISO 8601
    priority: 1 | 2 | 3; // 1 = High, 2 = Medium, 3 = Low
    googleEventId: string | null;
    syncStatus: SyncStatus;
}

const db = new Dexie("PriorityCalendarDB") as Dexie & {
    events: EntityTable<CalendarEvent, "id">;
};

// Schema Definition
db.version(1).stores({
    events: "id, start, end, syncStatus, googleEventId", // Primary key and indexed props
});

export { db };
