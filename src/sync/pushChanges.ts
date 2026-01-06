// src/sync/pushChanges.ts
import { db } from "../db";
import { toGoogleEvent } from "../utils/eventMapper";

export const pushChangesToGoogle = async (accessToken: string) => {
    // 1. Query Dirty Events
    const dirtyEvents = await db.events
        .where("syncStatus")
        .notEqual("synced")
        .toArray();

    if (dirtyEvents.length === 0) return;

    const BASE_URL =
        "https://www.googleapis.com/calendar/v3/calendars/primary/events";

    for (const event of dirtyEvents) {
        try {
            if (event.syncStatus === "created") {
                // --- POST (Create) ---
                const response = await fetch(BASE_URL, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(toGoogleEvent(event)),
                });

                if (!response.ok)
                    throw new Error(
                        `Failed to create event: ${response.statusText}`
                    );

                const googleData = await response.json();

                // Update Local: Now we are synced and have the Google ID
                await db.events.update(event.id, {
                    googleEventId: googleData.id,
                    syncStatus: "synced",
                });
            } else if (event.syncStatus === "updated") {
                // --- PATCH (Update) ---
                if (!event.googleEventId) {
                    console.warn(
                        `Cannot update event ${event.id} - missing googleEventId`
                    );
                    continue;
                }

                const response = await fetch(
                    `${BASE_URL}/${event.googleEventId}`,
                    {
                        method: "PATCH",
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                        },
                        // Only send fields that changed? Or just send the whole mapper object?
                        // Sending whole object is safer to ensure state consistency.
                        body: JSON.stringify(toGoogleEvent(event)),
                    }
                );

                if (response.status === 404 || response.status === 410) {
                    // Event deleted strictly on server? Treat as deleted?
                    // Or recreate it? Local First says our state is truth.
                    // We should probably recreate it (POST) if it's gone?
                    // For now, simple error handling.
                    console.error(
                        "Event not found on Google. Needs recovery logic."
                    );
                } else if (response.ok) {
                    await db.events.update(event.id, { syncStatus: "synced" });
                }
            } else if (event.syncStatus === "deleted") {
                // --- DELETE ---
                if (!event.googleEventId) {
                    // It was never synced to Google, so just delete locally
                    await db.events.delete(event.id);
                    continue;
                }

                const response = await fetch(
                    `${BASE_URL}/${event.googleEventId}`,
                    {
                        method: "DELETE",
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    }
                );

                if (
                    response.ok ||
                    response.status === 404 ||
                    response.status === 410
                ) {
                    // Success (or already gone) - Remove row from Dexie permanently
                    await db.events.delete(event.id);
                }
            }
        } catch (error) {
            console.error(`Sync error for event ${event.id}:`, error);
            // We keep the syncStatus as is to retry later
        }
    }
};
