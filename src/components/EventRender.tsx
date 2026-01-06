// src/components/EventRender.tsx
import React from 'react';
import { FaLock, FaCloudUploadAlt } from 'react-icons/fa';
import { CalendarEvent } from '../db';

interface EventRenderProps {
  event: CalendarEvent & { title: string }; // react-big-calendar adds generic properties
}

export const EventRender: React.FC<EventRenderProps> = ({ event }) => {
  const isHighPriority = event.priority === 1;
  const isPendingSync = event.syncStatus !== 'synced';

  // Base classes with dynamic background based on priority
  // Note: Standard RBC events have their own background. We might need to override via style prop or custom container.
  // RBC renders this component INSIDE the event container.
  // To get the full colored look, we usually return a div that fills the height.
  
  return (
    <div className={`h-full w-full p-1 text-xs flex items-center justify-between ${
      isHighPriority ? 'bg-red-100 text-red-900 border-l-4 border-red-500' : 
      event.priority === 2 ? 'bg-blue-100 text-blue-900 border-l-4 border-blue-500' : 
      'bg-green-100 text-green-900 border-l-4 border-green-500'
    } ${
        isPendingSync ? 'dashed-border' : ''
    }`}>
        <div className="flex items-center gap-1 overflow-hidden">
            {isHighPriority && <FaLock className="shrink-0" />}
            <span className="truncate font-medium">{event.title}</span>
        </div>
        
        {isPendingSync && (
            <FaCloudUploadAlt className="shrink-0 text-gray-500 animate-pulse" title="Sync Pending" />
        )}
    </div>
  );
};
