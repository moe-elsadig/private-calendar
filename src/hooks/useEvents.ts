// src/hooks/useEvents.ts
import { useLiveQuery } from "dexie-react-hooks";
import { v4 as uuidv4 } from "uuid";
import { db, type CalendarEvent } from "../db";

export type CreateEventInput = Omit<
    CalendarEvent,
    "id" | "syncStatus" | "googleEventId"
>;
export type UpdateEventInput = Partial<
    Omit<CalendarEvent, "id" | "syncStatus" | "googleEventId">
>;

export const useEvents = () => {
    // 1. Fetch: Return all events where syncStatus is NOT 'deleted'. Sort by start time.
    const events = useLiveQuery(() =>
        db.events.where("syncStatus").notEqual("deleted").sortBy("start")
    );

    // 2. Add Function
    const addEvent = async (input: CreateEventInput) => {
        const newEvent: CalendarEvent = {
            id: uuidv4(),
            ...input,
            googleEventId: null,
            syncStatus: "created",
        };
        await db.events.add(newEvent);
        return newEvent.id;
    };

    // 3. Update Function
    const updateEvent = async (
        id: string,
        changes: UpdateEventInput,
        force: boolean = false
    ) => {
        const existingEvent = await db.events.get(id);
        if (!existingEvent) throw new Error(`Event with id ${id} not found`);

        // Constraint: Priority 1 Lock
        if (existingEvent.priority === 1 && !force) {
            // Check if start or end are being modified
            const isTryingToChangeTime =
                (changes.start && changes.start !== existingEvent.start) ||
                (changes.end && changes.end !== existingEvent.end);

            if (isTryingToChangeTime) {
                throw new Error(
                    "Cannot move a High Priority (P1) event without force flag."
                );
            }
        }

        // Prepare update data
        const updatedData: Partial<CalendarEvent> = {
            ...changes,
            syncStatus:
                existingEvent.syncStatus === "created" ? "created" : "updated",
        };

        // If it was 'created' (not yet referenced in google), it stays 'created'.
        // Otherwise if it was 'synced' or 'updated', it becomes 'updated'.
        // If it was 'deleted' (shouldn't happen here as we don't query them), it stays 'deleted' or becomes 'updated' if restored?
        // The requirement says "Sets syncStatus to 'updated'".
        // However, if I update a local-only event ('created'), it should probably stay 'created' so syncing knows to POST it,
        // rather than trying to PATCH a non-existent ID.
        // BUT the prompt says "Sets syncStatus to 'created'" for Add, and "Sets syncStatus to 'updated'" for Update.
        // I will implement a smart check: Preserve 'created' status if it's already 'created', otherwise set to 'updated'.

        await db.events.update(id, updatedData);
    };

    // 4. Delete Function (Soft Delete)
    const deleteEvent = async (id: string) => {
        await db.events.update(id, { syncStatus: "deleted" });
    };

    return {
        events: events ?? [], // Return empty array while loading
        addEvent,
        updateEvent,
        deleteEvent,
    };
};
