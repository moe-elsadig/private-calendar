// src/sync/pullChanges.ts
import { db } from "../db";
import { fromGoogleEvent } from "../utils/eventMapper";

export const pullChangesFromGoogle = async (accessToken: string) => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 30);
    const timeMin = threeMonthsAgo.toISOString();

    const BASE_URL = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&timeMin=${timeMin}`;

    try {
        const response = await fetch(BASE_URL, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok)
            throw new Error(`Google Fetch Failed: ${response.statusText}`);

        const data = await response.json();
        const googleEvents = data.items || [];

        for (const gEvent of googleEvents) {
            // 1. Map to Local Schema
            const incomingEvent = fromGoogleEvent(gEvent);

            // 2. Find Local Counterpart
            // Try finding by internal UUID first (most reliable), then by Google ID
            let localEvent = await db.events.get(incomingEvent.id); // Try ID mapping first

            if (!localEvent && incomingEvent.googleEventId) {
                // Fallback: Check if we have an event with this googleEventId but different local ID (shouldn't happen if UUIDs are used correctly)
                localEvent = await db.events
                    .where("googleEventId")
                    .equals(incomingEvent.googleEventId)
                    .first();
            }

            // 3. Conflict Resolution
            if (!localEvent) {
                // DOES NOT EXIST -> ADD (Synced)
                // If the ID from google is not a valid UUID (e.g. existing google event),
                // we might fail if we require strict UUIDs.
                // For now, assuming string IDs are fine in Dexie.
                await db.events.add({
                    ...incomingEvent,
                    syncStatus: "synced",
                });
            } else {
                // EXISTS
                if (localEvent.syncStatus === "synced") {
                    // CLEAN LOCAL -> UPDATE (Overwrite with Remote)
                    await db.events.update(localEvent.id, {
                        ...incomingEvent,
                        syncStatus: "synced",
                        // Preserve local ID if it differs?
                        // incomingEvent.id might be Google ID if UUID missing.
                        // We want to keep our stable Local ID.
                        id: localEvent.id,
                    });
                } else {
                    // DIRTY LOCAL -> IGNORE REMOTE
                    // "Local First" means we prioritize our pending changes.
                    // We assume next Push will overwrite Google or cause a conflict resolution later.
                    // console.log(`Skipping update for dirty event: ${localEvent.title}`);
                }
            }
        }

        // Note: This logic strictly ADD/UPDATES. It does not handle DELETIONS from Google side yet.
        // (i.e., if event is missing in list, we don't delete it locally).
        // To handle remote deletions, we'd need a "Sync Token" approach or compare lists.
        // For Phase 5 MVP, we focus on getting data IN.
    } catch (error) {
        console.error("Pull Sync Error:", error);
        throw error;
    }
};
