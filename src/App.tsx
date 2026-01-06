import React, { useState, useRef } from 'react';
import { FaPlus, FaSync, FaGoogle } from 'react-icons/fa';
import { useEvents } from './hooks/useEvents';
import { useSync } from './hooks/useSync';
import { CalendarView } from './components/CalendarView';
import { findEarliestSlot, type SchedulerEvent } from './utils/scheduler';
import { addMinutes, parseISO } from 'date-fns';

function App() {
  const { events, addEvent } = useEvents();
  const { sync, isSyncing, lastSyncTime } = useSync();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form State
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [duration, setDuration] = useState(60);
  const [startDateTime, setStartDateTime] = useState('');

  const modalRef = useRef<HTMLDialogElement>(null);

  const handleOpenModal = () => {
    setIsModalOpen(true);
    setStartDateTime(''); // Reset start time
    setTimeout(() => modalRef.current?.showModal(), 0);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    modalRef.current?.close();
  };

  const handleAutoSchedule = () => {
    const now = new Date();
    const nowIso = now.toISOString();

    const schedulerEvents: SchedulerEvent[] = events.map(e => ({
        id: e.id,
        start: e.start,
        end: e.end,
        priority: e.priority
    }));

    const bestSlot = findEarliestSlot(schedulerEvents, duration, nowIso);
    
    if (bestSlot) {
        const date = parseISO(bestSlot);
        const localIso = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        setStartDateTime(localIso);
    } else {
        alert('No available slot found!');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startDateTime) return;

    const start = new Date(startDateTime).toISOString();
    const end = addMinutes(new Date(startDateTime), duration).toISOString();

    await addEvent({
        title,
        priority: priority as 1|2|3,
        start,
        end
    });

    setTitle('');
    setPriority(2);
    handleCloseModal();
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white shadow px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
            P
          </div>
          <h1 className="text-xl font-semibold text-gray-800">Priority Calendar</h1>
        </div>

        <div className="flex items-center gap-4">
           {lastSyncTime && (
               <span className="text-xs text-gray-400 hidden sm:inline">
                   Synced: {new Date(lastSyncTime).toLocaleTimeString()}
               </span>
           )}
           
           <button 
             onClick={() => sync()}
             disabled={isSyncing}
             className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors
               ${isSyncing ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
           >
             <FaSync className={isSyncing ? 'animate-spin' : ''} />
             {isSyncing ? 'Syncing...' : 'Sync Now'}
           </button>
           
           <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
             <FaGoogle />
           </div>
        </div>
      </header>

      <main className="flex-grow relative">
         <div className="absolute inset-0">
            <CalendarView />
         </div>
      </main>

      <button
        onClick={handleOpenModal}
        className="fixed bottom-8 right-8 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-50"
      >
        <FaPlus size={24} />
      </button>

      <dialog 
        ref={modalRef} 
        className="p-0 rounded-lg shadow-xl backdrop:bg-black/30 w-full max-w-md"
        onClose={() => setIsModalOpen(false)}
      >
        {isModalOpen && (
            <form method="dialog" onSubmit={handleSubmit} className="flex flex-col">
                <div className="p-6">
                    <h2 className="text-lg font-bold mb-4">New Event</h2>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                            <input 
                                type="text" 
                                required
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Meeting with Team"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { level: 1, label: 'High (Lock)', color: 'bg-red-100 border-red-500 text-red-700' },
                                    { level: 2, label: 'Medium', color: 'bg-blue-100 border-blue-500 text-blue-700' },
                                    { level: 3, label: 'Low', color: 'bg-green-100 border-green-500 text-green-700' }
                                ].map((opt) => (
                                    <button
                                        key={opt.level}
                                        type="button"
                                        onClick={() => setPriority(opt.level as 1|2|3)}
                                        className={`px-2 py-2 text-xs font-semibold border rounded-md transition-all ${
                                            priority === opt.level ? `${opt.color} ring-2 ring-offset-1 ring-gray-300` : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
                                <input 
                                    type="number" 
                                    value={duration}
                                    onChange={e => setDuration(Number(e.target.value))}
                                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div className="flex items-end">
                                <button 
                                    type="button"
                                    onClick={handleAutoSchedule}
                                    className="w-full px-3 py-2 bg-purple-100 text-purple-700 font-medium rounded-md hover:bg-purple-200 transition-colors text-sm"
                                >
                                    ✨ Auto-Find Slot
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                            <input 
                                type="datetime-local" 
                                required
                                value={startDateTime}
                                onChange={e => setStartDateTime(e.target.value)}
                                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                    <button 
                        type="button" 
                        onClick={handleCloseModal}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit"
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 shadow-sm"
                    >
                        Create Event
                    </button>
                </div>
            </form>
        )}
      </dialog>
    </div>
  )
}

export default App
