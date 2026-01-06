import {
    addMinutes as addMinutesFn,
    areIntervalsOverlapping,
    parseISO,
    differenceInMinutes,
    compareAsc,
} from "date-fns";

export interface SchedulerEvent {
    id: string;
    start: string; // ISO 8601
    end: string; // ISO 8601
    priority: number;
}

// --- Step 1: Helper Functions ---

/**
 * Checks if two events overlap in time.
 * Returns true even if they just touch edges?
 * `areIntervalsOverlapping` default is excluding start/end points.
 * We typically consider [10:00, 11:00) and [11:00, 12:00) as NON-overlapping.
 * `inclusive: false` is the default in v2, but v3/v4 might differ.
 */
export const doEventsOverlap = (
    eventA: SchedulerEvent,
    eventB: SchedulerEvent
): boolean => {
    return areIntervalsOverlapping(
        { start: parseISO(eventA.start), end: parseISO(eventA.end) },
        { start: parseISO(eventB.start), end: parseISO(eventB.end) }
    );
};

export const addMinutes = (isoString: string, minutes: number): string => {
    const date = parseISO(isoString);
    const newDate = addMinutesFn(date, minutes);
    return newDate.toISOString();
};

export const getDurationInMinutes = (event: SchedulerEvent): number => {
    return differenceInMinutes(parseISO(event.end), parseISO(event.start));
};

// --- Step 2: Gap Analysis (Find Earliest Slot) ---

/**
 * Scans for the first available gap of `durationMinutes` starting from `rangeStartIso`.
 *
 * SPECIAL LOGIC: Priority 3 (Low) events are ignored (treated as free space).
 * This implicitly suggests "overwriting" them if that's the earliest slot.
 */
export const findEarliestSlot = (
    events: SchedulerEvent[],
    durationMinutes: number,
    rangeStartIso: string
): string | null => {
    // 1. Sort events by start time.
    const sortedEvents = [...events].sort((a, b) =>
        compareAsc(parseISO(a.start), parseISO(b.start))
    );

    // 2. Filter out non-relevant events (before rangeStart) and Priority 3 events.
    //    Actually, we must keep events that *overlap* rangeStart, but we effectively ignore P3s as obstacles.
    const obstacles = sortedEvents.filter((e) => {
        // If it's Priority 3, it is NOT an obstacle (it's free space).
        if (e.priority === 3) return false;

        // We only care about obstacles that end after our search start time.
        return parseISO(e.end) > parseISO(rangeStartIso);
    });

    let currentCursor = parseISO(rangeStartIso);

    for (const nextEvent of obstacles) {
        const nextStart = parseISO(nextEvent.start);

        // If next event starts AFTER current cursor
        if (nextStart > currentCursor) {
            const gap = differenceInMinutes(nextStart, currentCursor);

            // 3. Check gap duration
            if (gap >= durationMinutes) {
                return currentCursor.toISOString();
            }
        }

        // 5. Move cursor to the end of this blocking event (if it pushes our horizon)
        //    We use max() because we might have nested events or overlapping P1/P2s?
        //    Usually assume non-overlapping P1/P2 for gap finding, but let's be safe.
        const nextEnd = parseISO(nextEvent.end);
        if (nextEnd > currentCursor) {
            currentCursor = nextEnd;
        }
    }

    // If we reach here, it means we scanned all obstacles.
    // The space AFTER the last obstacle is valid.
    return currentCursor.toISOString();
};

// --- Step 3: The Cascade Shuffler (Recursive) ---

/**
 * RECURSIVE "CHAIN REACTION" SHUFFLER
 *
 * Logic:
 * When `proposedEvent` is placed, it might overlap with existing events.
 *
 * - If overlap is P1 (High): ABORT (Error).
 * - If overlap is P2 (Medium) and we are P2/P3: ABORT (Error - cannot displace equal/higher).
 *   Wait, logic in prompt says: "If existingEvent.priority <= proposedEvent.priority: THROW ERROR".
 *   This implies P2 can only displace P3 (>). P1 can displace P2 and P3.
 *
 * If valid displacement:
 * 1. Move the `existingEvent` to start immediately AFTER `proposedEvent.end`.
 * 2. This move is treated as a NEW `proposedEvent` for the next recursion depth.
 * 3. This checks if the *displaced* event bumps into *another* event (C), and so on.
 *
 * Result:
 * Returns an array of ALL events that were touched/moved during this operation.
 */
export const resolveScheduleConflicts = (
    proposedEvent: SchedulerEvent,
    allEvents: SchedulerEvent[]
): SchedulerEvent[] => {
    // 1. Find overlapping events (excluding itself if it's in the list)
    const overlappingEvents = allEvents.filter(
        (e) => e.id !== proposedEvent.id && doEventsOverlap(proposedEvent, e)
    );

    // 2. Base Case: No overlaps
    if (overlappingEvents.length === 0) {
        return [];
    }

    let modifiedEvents: SchedulerEvent[] = [];

    for (const existingEvent of overlappingEvents) {
        // Check Priority Constraints

        // Constraint: Cannot move locked event (P1)
        if (existingEvent.priority === 1) {
            throw new Error(
                `Conflict with Locked Event (ID: ${existingEvent.id}). Cannot proceed.`
            );
        }

        // Constraint: Cannot displace equal or higher priority
        // Lower number = Higher priority.
        // Confusing naming? "priority number".
        // 1 (High) < 2 (Med) < 3 (Low).
        // So "Higher Priority" means "Lower Number".
        // "Equal or Higher priority" means existing.priority <= proposed.priority.
        // e.g. Existing(2) vs Proposed(2) -> 2 <= 2 -> Error.
        // e.g. Existing(1) vs Proposed(2) -> 1 <= 2 -> Error.
        // e.g. Existing(3) vs Proposed(2) -> 3 <= 2 -> False (OK to displace).
        if (existingEvent.priority <= proposedEvent.priority) {
            throw new Error(
                `Cannot displace event with equal or higher priority (ID: ${existingEvent.id}).`
            );
        }

        // Move Logic
        // Move existing event to start right after proposed event
        const duration = getDurationInMinutes(existingEvent);
        const newStart = proposedEvent.end;
        const newEnd = addMinutes(newStart, duration);

        const movedEvent: SchedulerEvent = {
            ...existingEvent,
            start: newStart,
            end: newEnd,
        };

        // Track this change
        modifiedEvents.push(movedEvent);

        // Recurse: Now `movedEvent` becomes the `proposedEvent` that might bump others
        const cascadingChanges = resolveScheduleConflicts(
            movedEvent,
            allEvents
        );

        modifiedEvents = [...modifiedEvents, ...cascadingChanges];
    }

    // Return unique modified events (in case recursion touched same event twice, keeping latest?)
    // Simple flatmap might have duplicates if multiple paths touch same event.
    // For this constrained vertical shuffling, usually linear chain.
    // But let's deduplicate by ID just in case.
    const uniqueMap = new Map<string, SchedulerEvent>();
    for (const e of modifiedEvents) {
        uniqueMap.set(e.id, e);
    }

    return Array.from(uniqueMap.values());
};
