// src/utils/eventMapper.ts
import { type CalendarEvent } from "../db";

// Simplified Google Event Interface
interface GoogleEvent {
    id: string;
    summary: string;
    start: { dateTime: string };
    end: { dateTime: string };
    extendedProperties?: {
        private?: {
            uuid?: string;
            priority?: string;
        };
    };
}

/**
 * Maps a Local CalendarEvent to the structure required by Google Calendar API.
 */
export const toGoogleEvent = (
    localEvent: CalendarEvent
): Partial<GoogleEvent> => {
    return {
        summary: localEvent.title,
        start: { dateTime: localEvent.start },
        end: { dateTime: localEvent.end },
        extendedProperties: {
            private: {
                uuid: localEvent.id,
                priority: localEvent.priority.toString(),
            },
        },
    };
};

/**
 * Maps an incoming Google Event to our Local CalendarEvent Schema.
 * Note: Does not set 'syncStatus' because that depends on context (pull/push).
 */
export const fromGoogleEvent = (
    googleEvent: GoogleEvent
): Omit<CalendarEvent, "syncStatus"> => {
    const priority = googleEvent.extendedProperties?.private?.priority
        ? (parseInt(googleEvent.extendedProperties.private.priority, 10) as
              | 1
              | 2
              | 3)
        : 3; // Default to Low Priority

    // Use local UUID if it exists in extendedProperties, otherwise fallback to Google ID (for pure remote events)
    // Wait, our local ID must be a UUID v4. If we pull a fresh event from Google that wasn't created by us,
    // it won't have a UUID in extendedProperties.
    // In that case, we MUST generate a new local Local ID or use the Google ID?
    // Our schema expects a UUID string. Google IDs are alphanumeric but maybe not UUIDs.
    // Strategy: If `extendedProperties.private.uuid` exists, use it.
    // If NOT, we likely need to generate one during the Import phase or use the Google ID if it fits.
    // Let's rely on the Pull logic to handle ID collisions/generation, but here we prefer the stored UUID.

    const localId =
        googleEvent.extendedProperties?.private?.uuid || googleEvent.id;

    return {
        id: localId,
        googleEventId: googleEvent.id,
        title: googleEvent.summary || "(No Title)",
        start: googleEvent.start.dateTime,
        end: googleEvent.end.dateTime,
        priority: priority,
    };
};
