// src/components/CalendarView.tsx
import React, { useMemo, useCallback } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import withDragAndDrop, { type EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

import { useEvents } from '../hooks/useEvents';
import { resolveScheduleConflicts, type SchedulerEvent } from '../utils/scheduler';
import { EventRender } from './EventRender';
import { type CalendarEvent } from '../db';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

// Create a type that extends CalendarEvent but with Date objects for start/end
interface HydratedCalendarEvent extends Omit<CalendarEvent, 'start' | 'end'> {
  start: Date;
  end: Date;
}

const DnDCalendar = withDragAndDrop<HydratedCalendarEvent>(Calendar);

export const CalendarView: React.FC = () => {
  const { events, updateEvent } = useEvents();

  // Hydrate events: convert ISO strings to Date objects for RBC
  // RBC requires `start` and `end` to be Date objects.
  const hydratedEvents = useMemo(() => {
    return events.map(evt => ({
        ...evt,
        start: new Date(evt.start),
        end: new Date(evt.end)
    }));
  }, [events]);

  const onEventDrop = useCallback(async (args: EventInteractionArgs<HydratedCalendarEvent>) => {
    const { event, start, end } = args;
    
    // 1. Construct the Proposed Event (with new times)
    // start and end are string | Date, but coming from RBC they are Date
    const startStr = start instanceof Date ? start.toISOString() : new Date(start).toISOString();
    const endStr = end instanceof Date ? end.toISOString() : new Date(end).toISOString();

    const proposedEvent: SchedulerEvent = {
        id: event.id,
        start: startStr,
        end: endStr,
        priority: event.priority
    };

    // Need to map all events to SchedulerEvent format (ISO strings) logic is pure
    // We can reuse `events` from useEvents which are already raw strings
    // BUT we need to exclude the one moving from the "allEvents" list passed to resolver?
    // Actually `resolveScheduleConflicts` filters out event.id itself internally.
    // However, `events` from hook has old times for the moved event. That is correct.
    const allSchedulerEvents: SchedulerEvent[] = events.map(e => ({
        id: e.id,
        start: e.start,
        end: e.end,
        priority: e.priority
    }));

    try {
        // 2. Resolve Conflicts
        const modifications = resolveScheduleConflicts(proposedEvent, allSchedulerEvents);

        // 3. Batch Update
        // Note: 'modifications' includes the moved event AND cascading moves.
        // We must include the proposedEvent explicit update if it's not in modifications?
        // `resolveScheduleConflicts` usually returns *touched* events.
        // If no overlap, it returns []. But the user DID move the event.
        // So we must manually ensure we update the main event, plus any others.
        
        // Let's create a map of updates to perform
        const updates = new Map<string, Partial<CalendarEvent>>();
        
        // Always update the dragged event
        updates.set(proposedEvent.id, {
            start: proposedEvent.start,
            end: proposedEvent.end
        });

        // Merge in conflict resolutions
        modifications.forEach(mod => {
            updates.set(mod.id, {
                start: mod.start,
                end: mod.end
            });
        });

        // Execute Updates
        // We iterate the map and call updateEvent for each.
        // We use `force: true`? 
        // If we found a valid schedule via `resolveScheduleConflicts`, we assume it respects business rules.
        // HOWEVER, `updateEvent` throws if we move a P1.
        // If the user drags a P1, `resolveScheduleConflicts` likely didn't throw (it checks overlaps).
        // But `updateEvent` WILL throw.
        // So we should try/catch the *primary* move.
        // If `resolveScheduleConflicts` didn't throw, it means we didn't displace a P1.
        // But did we move a P1 ourselves?
        
        const updatePromises = Array.from(updates.entries()).map(([id, changes]) => {
           // Pass force=false effectively. 
           // If we are moving P1, this will fail here, which is correct (User gets alerted).
           return updateEvent(id, changes);
        });

        await Promise.all(updatePromises);

    } catch (error: unknown) {
        // 4. Catch Errors (e.g. Locked Event)
        console.error("Move prevented:", error);
        const message = error instanceof Error ? error.message : 'Unknown schedule conflict';
        window.alert(`Move Blocked: ${message}`);
        // Return false to snap back? RBC doesn't strictly use return value of onEventDrop to snap back,
        // it relies on state update. If we don't update state, it snaps back.
    }

  }, [events, updateEvent]);


  return (
    <div className="h-screen p-4 flex flex-col">
      <header className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Priority Calendar</h1>
        <div className="text-sm text-gray-500">
           <span className="inline-block w-3 h-3 bg-red-100 border border-red-500 mr-1"></span>High (Locked)
           <span className="inline-block w-3 h-3 bg-blue-100 border border-blue-500 ml-3 mr-1"></span>Medium
           <span className="inline-block w-3 h-3 bg-green-100 border border-green-500 ml-3 mr-1"></span>Low
        </div>
      </header>
      
      <div className="flex-grow bg-white shadow-lg rounded-lg overflow-hidden">
        <DnDCalendar
            localizer={localizer}
            events={hydratedEvents}
            startAccessor="start"
            endAccessor="end"
            onEventDrop={onEventDrop}
            draggableAccessor={() => true} // All are draggable, but logic might reject drop
            resizable={false} // Simplify for now
            defaultView="week"
            views={['month', 'week', 'day']}
            components={{
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                event: EventRender as any // Type casting due to generic mismatch in RBC types sometimes
            }}
            eventPropGetter={() => {
                // Remove default styles to let our component handle it
                return {
                    className: '!bg-transparent !p-0 !border-0'
                }
            }}
        />
      </div>
    </div>
  );
};
