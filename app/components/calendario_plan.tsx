"use client";
import React, { useState, useEffect } from "react";
import { Plus, Sparkles, X, ChevronDown, ChevronUp } from "lucide-react";

export type WeeklyGlobalEvent = {
  id: string;
  title: string;
  subtitle?: string;
  dayIndex: number;      // 0 = Monday, -1 = unscheduled
  startHour: number;     // 24h
  endHour?: number;
  color?: string;        // CSS background color
  time?: string;         // Display time for mobile view
};

type Props = {
  weekStart?: Date;
  startHour?: number;    // default 7
  endHour?: number;      // default 21
  days?: number;         // default 7
  events?: WeeklyGlobalEvent[];
  onEventMove?: (eventId: string, dayIndex: number, hour?: number) => void;
  onEventRemove?: (eventId: string) => void;
  onCellClick?: (dayIndex: number, hour: number) => void;
  onAddTask?: () => void;
  onSuggestTask?: () => void;
  className?: string;
};

const dayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const dayNamesFull = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function getLabelDate(weekStart: Date, idx: number) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + idx);
  return d.getDate();
}

function formatHour(h: number) {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  if (h > 12) return `${h - 12} PM`;
  return `${h} AM`;
}

function getWeekRange(weekStart: Date, days: number) {
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + days - 1);

  const startMonth = monthNames[start.getMonth()];
  const endMonth = monthNames[end.getMonth()];
  const startDate = start.getDate();
  const endDate = end.getDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDate} - ${endDate}`;
  }
  return `${startMonth} ${startDate} - ${endMonth} ${endDate}`;
}

/* === Glass styles === */
const headerCardStyle: React.CSSProperties = {
  background: "rgba(41, 41, 38, 0.8)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  boxShadow:
    "2px 4px 4px rgba(0,0,0,0.35), inset -1px 0px 2px rgba(201,201,201,0.1), inset 5px -5px 12px rgba(255,255,255,0.05), inset -5px 5px 12px rgba(255,255,255,0.05)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  borderRadius: "20px",
  padding: "15px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
};

const headerStickyStyle: React.CSSProperties = {
  background: "rgba(25,25,25,0.95)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

const buttonStyle: React.CSSProperties = {
  background: "rgba(41, 41, 38, 0.8)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  boxShadow:
    "2px 4px 4px rgba(0,0,0,0.35), inset -1px 0px 2px rgba(201,201,201,0.1), inset 5px -5px 12px rgba(255,255,255,0.05), inset -5px 5px 12px rgba(255,255,255,0.05)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  borderRadius: "12px",
  padding: "8px 16px",
  color: "white",
  fontSize: "14px",
  fontWeight: "500",
  cursor: "pointer",
  transition: "all 0.2s ease",
};

/* Helpers */
function getMonday(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // 0=Mon … 6=Sun
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

// Helper to check if today is within the current week
function isDateInWeek(date: Date, weekStart: Date, days: number): number {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + days);

  if (date >= weekStart && date < weekEnd) {
    const dayDiff = Math.floor((date.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
    return dayDiff;
  }
  return -1;
}

/* ===== Componente de texto expandible ===== */
interface ExpandableTextProps {
  text: string;
  maxLength?: number;
  className?: string;
  expandedClassName?: string;
}

function ExpandableText({ text, maxLength = 50, className = "", expandedClassName = "" }: ExpandableTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const needsTruncate = text.length > maxLength;

  const displayText = isExpanded || !needsTruncate
    ? text
    : text.slice(0, maxLength) + "...";

  if (!needsTruncate) {
    return <div className={`${className} break-words overflow-hidden`}>{text}</div>;
  }

  return (
    <div className={`${className} ${isExpanded ? expandedClassName : ''} flex items-start gap-1`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
        className="inline-flex items-center text-white/80 hover:text-white transition-colors flex-shrink-0 mt-0.5"
        title={isExpanded ? "Ver menos" : "Ver más"}
      >
        {isExpanded ? (
          <ChevronUp size={12} className="inline" />
        ) : (
          <ChevronDown size={12} className="inline" />
        )}
      </button>
      <span className="flex-1 break-words overflow-hidden">{displayText}</span>
    </div>
  );
}

export function WeeklyCalendar({
  weekStart = getMonday(new Date()),
  startHour = 7,
  endHour = 21,
  days = 7,
  events = [],
  onEventMove,
  onEventRemove,
  onCellClick,
  onAddTask,
  onSuggestTask,
  className,
}: Props) {
  const [draggedEvent, setDraggedEvent] = useState<WeeklyGlobalEvent | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const cols = Array.from({ length: days }, (_, i) => i);

  // Check if current time should show the indicator
  const todayIndex = isDateInWeek(currentTime, weekStart, days);

  // Get all events for a specific day
  const getEventsForDay = (dayIndex: number) =>
    events.filter((e) => e.dayIndex === dayIndex).sort((a, b) => a.startHour - b.startHour);

  // Get unscheduled events
  const getUnscheduledEvents = () =>
    events.filter((e) => e.dayIndex === -1);

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, event: WeeklyGlobalEvent) => {
    setDraggedEvent(event);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, dayIndex: number, hour?: number) => {
    e.preventDefault();
    if (draggedEvent && onEventMove) {
      onEventMove(draggedEvent.id, dayIndex, hour);
    }
    setDraggedEvent(null);
  };

  const handleEventDoubleClick = (eventId: string) => {
    if (onEventRemove) {
      onEventRemove(eventId);
    }
  };

  // Mobile day data
  const mobileDays = cols.map(idx => {
    const date = getLabelDate(weekStart, idx);
    return {
      key: idx,
      name: dayNamesFull[idx],
      shortName: dayNames[idx],
      date,
      isToday: todayIndex === idx
    };
  });

  return (
    <div className={`w-full h-auto ${className || ''} overflow-hidden`} style={{
      background: 'transparent',
      height: 'auto'
    }}>
      {/* Desktop View */}
      <div className="hidden lg:flex flex-col h-full rounded-lg bg-transparent relative overflow-hidden">
        
        {/* Navigation Header */}
        <div className="flex-shrink-0 p-3 mb-2" style={{
          background: 'rgba(158, 158, 149, 0.2)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '2px 4px 4px rgba(0, 0, 0, 0.35), inset -1px 0px 2px rgba(201, 201, 201, 0.1), inset 5px -5px 12px rgba(255, 255, 255, 0.05), inset -5px 5px 12px rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(6px)',
          borderRadius: '15px'
        }}>
          <div className="text-center">
            <h1 className="text-lg font-bold text-white mb-1">Actividades de la Semana</h1>
            <p className="text-sm text-white/80">{getWeekRange(weekStart, days)}</p>
          </div>
        </div>

        {/* Header row (sticky) */}
        <div
          className="flex-shrink-0 z-20 grid border-b border-white/10"
          style={{
            ...headerStickyStyle,
            gridTemplateColumns: `repeat(${days}, minmax(0,1fr))`,
          }}
        >
          {cols.map((d) => (
            <div key={d} className="px-2 flex items-center justify-center">
              <div style={headerCardStyle} className="w-full text-center">
                <span className="text-[11px] font-medium text-white/80">
                  {dayNames[d]}
                </span>
                <span className="text-xl leading-none font-semibold text-white mt-1">
                  {getLabelDate(weekStart, d)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Grid - Days */}
        <div
          className="flex-1 grid relative overflow-hidden"
          style={{
            gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))`,
            minHeight: '200px',
          }}
        >
          {cols.map((d) => (
            <div
              key={d}
              className="border-l border-gray-100 relative hover:bg-white/5 cursor-pointer h-full flex flex-col"
              onClick={() => onCellClick?.(d, 0)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, d)}
            >
              <div className="p-2 flex-1">
                <div className="space-y-2">
                  {getEventsForDay(d).map((ev) => (
                    <div
                      key={ev.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, ev)}
                      className="group relative text-sm rounded-md px-3 py-2 shadow-sm cursor-move hover:opacity-90 text-white flex-shrink-0 transition-all duration-200"
                      style={{ background: ev.color || 'rgba(59, 130, 246, 0.8)' }}
                      title={`${ev.title}${ev.subtitle ? ` - ${ev.subtitle}` : ''}`}
                    >
                      <ExpandableText
                        text={ev.title}
                        maxLength={60}
                        className="font-medium pr-5"
                      />
                      {ev.subtitle && (
                        <ExpandableText
                          text={ev.subtitle}
                          maxLength={40}
                          className="text-xs opacity-75 mt-1"
                        />
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleEventDoubleClick(ev.id);
                        }}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:scale-110 hover:bg-white/20 rounded p-0.5"
                        title="Eliminar tarea"
                      >
                        <X size={14} className="text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Unscheduled Tasks Section - Desktop */}
        <div className="flex-shrink-0 p-3 mt-2" style={{
          background: 'rgba(30, 30, 30, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '2px 4px 4px rgba(0, 0, 0, 0.35), inset -1px 0px 2px rgba(201, 201, 201, 0.1)',
          backdropFilter: 'blur(6px)',
          borderRadius: '15px'
        }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-sm font-medium">Tareas sin programar:</h3>
            {onSuggestTask && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSuggestTask?.();
                  }}
                  style={buttonStyle}
                  className="flex items-center gap-2 hover:bg-purple-600/20 transition-colors"
                >
                  <Sparkles size={16} />
                  Sugerir Tarea
                </button>
              </div>
            )}
          </div>
          
          <div 
            className="min-h-[60px] p-2 rounded-md"
            style={{
              background: 'rgba(40, 40, 40, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, -1)}
          >
            <div className="flex flex-wrap gap-2">
              {getUnscheduledEvents().map((ev) => (
                <div
                  key={ev.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, ev)}
                  className="group relative text-sm rounded-md px-3 py-2 shadow-sm cursor-move hover:opacity-90 text-white inline-block transition-all duration-200"
                  style={{ background: ev.color || 'rgba(59, 130, 246, 0.8)' }}
                  title="Arrastra para programar"
                >
                  <ExpandableText
                    text={ev.title}
                    maxLength={60}
                    className="font-medium pr-5"
                  />
                  {ev.subtitle && (
                    <ExpandableText
                      text={ev.subtitle}
                      maxLength={40}
                      className="text-xs opacity-75 mt-1"
                    />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleEventDoubleClick(ev.id);
                    }}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:scale-110 hover:bg-white/20 rounded p-0.5"
                    title="Eliminar tarea"
                  >
                    <X size={14} className="text-white" />
                  </button>
                </div>
              ))}
              {getUnscheduledEvents().length === 0 && (
                <div className="text-white/50 text-sm italic">
                  No hay tareas sin programar
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile View */}
      <div className="lg:hidden h-full flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex-shrink-0 bg-white/10 backdrop-blur-sm text-white p-3 rounded-t-lg text-center text-sm font-medium border border-white/20">
          Semana: {getWeekRange(weekStart, days)}
        </div>

        {/* Calendar Days */}
        <div className="flex-1 border border-white/20 border-t-0 bg-white/5 backdrop-blur-sm">
          <div className="h-full">
            {mobileDays.map((d) => (
              <div key={d.key} className="border-b border-white/10 last:border-b-0">
                <div className="flex relative min-h-[80px] max-h-[120px]">
                  <div className="w-16 bg-white/10 border-r border-white/10 flex flex-col items-center justify-center py-2 flex-shrink-0">
                    <div className="text-xs text-white/70 font-medium">
                      {d.shortName.toLowerCase()}
                    </div>
                    <div
                      className={`text-sm font-bold mt-1 ${d.isToday
                        ? "bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs"
                        : "text-white"
                        }`}
                    >
                      {d.date}
                    </div>
                  </div>
                  <div
                    className="flex-1 p-2"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, d.key)}
                  >
                    <div className="flex flex-col gap-1">
                      {getEventsForDay(d.key).map((t) => (
                        <div
                          key={t.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, t)}
                          className="group relative px-2 py-1 rounded text-xs cursor-move hover:opacity-90 text-white flex-shrink-0 transition-all duration-200"
                          style={{ background: t.color || 'rgba(59, 130, 246, 0.8)' }}
                          title="Arrastra para mover"
                        >
                          <ExpandableText
                            text={t.title}
                            maxLength={40}
                            className="font-medium pr-4 text-xs"
                          />
                          {t.subtitle && (
                            <ExpandableText
                              text={t.subtitle}
                              maxLength={30}
                              className="text-xs opacity-75 mt-0.5"
                            />
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleEventDoubleClick(t.id);
                            }}
                            className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:scale-110 hover:bg-white/20 rounded p-0.5"
                            title="Eliminar tarea"
                          >
                            <X size={12} className="text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Unscheduled Tasks Section - Mobile */}
        <div className="flex-shrink-0 p-3 mt-2" style={{
          background: 'rgba(30, 30, 30, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '2px 4px 4px rgba(0, 0, 0, 0.35), inset -1px 0px 2px rgba(201, 201, 201, 0.1)',
          backdropFilter: 'blur(6px)',
          borderRadius: '15px'
        }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-sm font-medium">Tareas sin programar:</h3>
            {onSuggestTask && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSuggestTask?.();
                  }}
                  style={buttonStyle}
                  className="hover:bg-purple-600/20 transition-colors text-xs"
                >
                  <Sparkles size={12} />
                  Sugerir
                </button>
              </div>
            )}
          </div>
          
          <div 
            className="min-h-[50px] p-2 rounded-md"
            style={{
              background: 'rgba(40, 40, 40, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, -1)}
          >
            <div className="flex flex-wrap gap-1">
              {getUnscheduledEvents().map((ev) => (
                <div
                  key={ev.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, ev)}
                  className="group relative text-xs rounded-md px-2 py-1 shadow-sm cursor-move hover:opacity-90 text-white inline-block transition-all duration-200"
                  style={{ background: ev.color || 'rgba(59, 130, 246, 0.8)' }}
                  title="Arrastra para programar"
                >
                  <ExpandableText
                    text={ev.title}
                    maxLength={35}
                    className="font-medium pr-4 text-xs"
                  />
                  {ev.subtitle && (
                    <ExpandableText
                      text={ev.subtitle}
                      maxLength={25}
                      className="text-[10px] opacity-75 mt-0.5"
                    />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleEventDoubleClick(ev.id);
                    }}
                    className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:scale-110 hover:bg-white/20 rounded p-0.5"
                    title="Eliminar tarea"
                  >
                    <X size={10} className="text-white" />
                  </button>
                </div>
              ))}
              {getUnscheduledEvents().length === 0 && (
                <div className="text-white/50 text-xs italic">
                  No hay tareas sin programar
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Task interface from plan page
interface Task {
  id: string;
  title?: string;
  text?: string;
  description?: string;
  isManual?: boolean;
  completed: boolean;
}

// Props for integrated calendar
interface IntegratedCalendarProps {
  tasks?: Task[];
  onTaskMove?: (taskId: string, dayIndex: number) => void;
  onTaskRemove?: (taskId: string) => void;
  onSuggestTask?: () => void;
  onPositionsChange?: (positions: Record<string, { dayIndex: number; startHour: number }>) => void;
  onCalendarTasksChange?: (calendarTasks: CalendarOnlyTask[]) => void;
  initialPositions?: Record<string, { dayIndex: number; startHour: number }>;
  initialCalendarTasks?: CalendarOnlyTask[];
}

// Calendar-only task (not in the main task list)
export interface CalendarOnlyTask {
  id: string;
  title: string;
  subtitle?: string;
}

// Integrated Calendar Component
export function IntegratedCalendar({
  tasks = [],
  onTaskMove,
  onTaskRemove,
  onSuggestTask,
  onPositionsChange,
  onCalendarTasksChange,
  initialPositions = {},
  initialCalendarTasks = [],
}: IntegratedCalendarProps) {
  const colors = [
    "rgba(59, 130, 246, 0.9)",
    "rgba(16, 185, 129, 0.9)",
    "rgba(245, 158, 11, 0.9)",
    "rgba(147, 51, 234, 0.9)",
    "rgba(239, 68, 68, 0.9)",
    "rgba(236, 72, 153, 0.9)"
  ];

  // Keep track of event positions locally
  const [eventPositions, setEventPositions] = useState<Record<string, { dayIndex: number; startHour: number }>>(initialPositions);
  const [newTaskText, setNewTaskText] = useState("");
  // Calendar-only tasks (not synced with main task list)
  const [calendarOnlyTasks, setCalendarOnlyTasks] = useState<CalendarOnlyTask[]>(initialCalendarTasks);

  // Convert tasks from main list to calendar events with their positions
  const taskEvents: WeeklyGlobalEvent[] = tasks.map((task, index) => {
    const position = eventPositions[task.id] || { dayIndex: -1, startHour: 9 };
    return {
      id: task.id,
      title: task.title || task.text || '',
      subtitle: task.description,
      dayIndex: position.dayIndex,
      startHour: position.startHour,
      color: colors[index % colors.length]
    };
  });

  // Convert calendar-only tasks to events
  const calendarOnlyEvents: WeeklyGlobalEvent[] = calendarOnlyTasks.map((task, index) => {
    const position = eventPositions[task.id] || { dayIndex: -1, startHour: 9 };
    return {
      id: task.id,
      title: task.title,
      subtitle: task.subtitle,
      dayIndex: position.dayIndex,
      startHour: position.startHour,
      color: colors[(tasks.length + index) % colors.length]
    };
  });

  // Combine both types of events
  const events: WeeklyGlobalEvent[] = [...taskEvents, ...calendarOnlyEvents];

  const handleEventMove = (eventId: string, dayIndex: number, hour?: number) => {
    // Update local position state
    const newPositions = {
      ...eventPositions,
      [eventId]: {
        dayIndex,
        startHour: hour ?? eventPositions[eventId]?.startHour ?? 9
      }
    };
    setEventPositions(newPositions);

    // Notify parent of position changes
    if (onPositionsChange) {
      onPositionsChange(newPositions);
    }

    if (onTaskMove) {
      onTaskMove(eventId, dayIndex);
    }
  };

  const handleEventRemove = (eventId: string) => {
    // Check if it's a calendar-only task
    const isCalendarOnlyTask = calendarOnlyTasks.some(task => task.id === eventId);

    if (isCalendarOnlyTask) {
      // Remove from calendar-only tasks
      setCalendarOnlyTasks(prev => prev.filter(task => task.id !== eventId));
    } else {
      // Remove from main task list via callback
      if (onTaskRemove) {
        onTaskRemove(eventId);
      }
    }

    // Remove from local position state
    setEventPositions(prev => {
      const newPositions = { ...prev };
      delete newPositions[eventId];
      return newPositions;
    });
  };

  const handleAddTaskClick = () => {
    if (newTaskText.trim()) {
      const newTask: CalendarOnlyTask = {
        id: `calendar-task-${Date.now()}`,
        title: newTaskText.trim()
      };
      const updatedTasks = [...calendarOnlyTasks, newTask];
      setCalendarOnlyTasks(updatedTasks);
      setNewTaskText("");

      // Notify parent of calendar tasks changes
      if (onCalendarTasksChange) {
        onCalendarTasksChange(updatedTasks);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddTaskClick();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <WeeklyCalendar
        events={events}
        onEventMove={handleEventMove}
        onEventRemove={handleEventRemove}
        onCellClick={() => {}}
        onAddTask={undefined}
        onSuggestTask={onSuggestTask}
        startHour={7}
        endHour={22}
        className="flex-1"
      />

      {/* Add Task Input Section */}
      <div
        className="p-3 rounded-lg"
        style={{
          background: 'rgba(50, 50, 50, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)'
        }}
      >
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe una nueva tarea..."
            className="flex-1 px-3 py-2 rounded-md text-white placeholder-white/60 focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-sm"
            style={{
              background: 'rgba(40, 40, 40, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}
          />

          <button
            onClick={handleAddTaskClick}
            disabled={!newTaskText.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600/30"
            style={{
              background: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
            }}
          >
            <Plus size={16} />
            Añadir Tarea
          </button>
        </div>
      </div>
    </div>
  );
}

// Example usage component
export default function CalendarExample() {
  const [events, setEvents] = useState<WeeklyGlobalEvent[]>([
    { id: "1", title: "Revisar emails", subtitle: "Inbox", dayIndex: -1, startHour: 9, color: "rgba(16, 185, 129, 0.9)" },
    { id: "2", title: "Ejercicio", subtitle: "30 min", dayIndex: -1, startHour: 10, color: "rgba(245, 158, 11, 0.9)" },
    { id: "3", title: "Lectura", subtitle: "Libro técnico", dayIndex: -1, startHour: 11, color: "rgba(147, 51, 234, 0.9)" },
    { id: "4", title: "Planificar mañana", subtitle: "5 min", dayIndex: -1, startHour: 12, color: "rgba(239, 68, 68, 0.9)" },
    { id: "5", title: "Llamar cliente", dayIndex: -1, startHour: 13, color: "rgba(59, 130, 246, 0.9)" },
    { id: "6", title: "Backup datos", subtitle: "Servidor", dayIndex: -1, startHour: 14, color: "rgba(236, 72, 153, 0.9)" },
  ]);
  
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskSubtitle, setNewTaskSubtitle] = useState("");

  const handleEventMove = (eventId: string, dayIndex: number, hour?: number) => {
    setEvents(prev => prev.map(e => {
      if (e.id === eventId) {
        return {
          ...e,
          dayIndex,
          startHour: hour ?? e.startHour,
          time: hour ? formatHour(hour) : e.time
        };
      }
      return e;
    }));
  };

  const handleEventRemove = (eventId: string) => {
    setEvents(prev => prev.filter(e => e.id !== eventId));
  };

  const handleCellClick = (dayIndex: number, hour: number) => {
    console.log(`Clicked cell: Day ${dayIndex}, Hour ${hour}`);
  };

  const handleAddTask = () => {
    // Focus the input when clicking add task
    const input = document.querySelector('input[placeholder*="nueva tarea"]') as HTMLInputElement;
    if (input) {
      input.focus();
    }
  };

  const handleCreateTask = () => {
    if (newTaskTitle.trim()) {
      const colors = [
        "rgba(59, 130, 246, 0.9)",
        "rgba(16, 185, 129, 0.9)",
        "rgba(245, 158, 11, 0.9)",
        "rgba(147, 51, 234, 0.9)",
        "rgba(239, 68, 68, 0.9)",
        "rgba(236, 72, 153, 0.9)"
      ];
      
      const newTask: WeeklyGlobalEvent = {
        id: Date.now().toString(),
        title: newTaskTitle.trim(),
        subtitle: newTaskSubtitle.trim() || undefined,
        dayIndex: -1, // Unscheduled by default
        startHour: 9,
        color: colors[Math.floor(Math.random() * colors.length)]
      };
      
      setEvents(prev => [...prev, newTask]);
      setNewTaskTitle("");
      setNewTaskSubtitle("");
    }
  };

  const handleSuggestTask = () => {
    const suggestions = [
      { title: "Revisar emails", subtitle: "Inbox", color: "rgba(16, 185, 129, 0.9)" },
      { title: "Ejercicio", subtitle: "30 min", color: "rgba(245, 158, 11, 0.9)" },
      { title: "Lectura", subtitle: "Libro técnico", color: "rgba(147, 51, 234, 0.9)" },
      { title: "Planificar mañana", subtitle: "5 min", color: "rgba(239, 68, 68, 0.9)" },
      { title: "Llamar cliente", color: "rgba(59, 130, 246, 0.9)" },
      { title: "Backup datos", subtitle: "Servidor", color: "rgba(236, 72, 153, 0.9)" }
    ];
    
    const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
    const suggestedTask: WeeklyGlobalEvent = {
      id: Date.now().toString(),
      ...randomSuggestion,
      dayIndex: -1,
      startHour: 10
    };
    
    setEvents(prev => [...prev, suggestedTask]);
  };

  return (
    <div 
      className="h-auto p-4 flex flex-col"
    
    >
      <WeeklyCalendar
        events={events}
        onEventMove={handleEventMove}
        onEventRemove={handleEventRemove}
        onCellClick={handleCellClick}
        onAddTask={handleAddTask}
        onSuggestTask={handleSuggestTask}
        startHour={7}
        endHour={22}
        className="flex-1"
      />
      
      {/* Add Task Input - Bottom */}
      <div 
        className="mt-4 p-3 rounded-lg"
        style={{
          background: 'rgba(50, 50, 50, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)'
        }}
      >
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Escribe una nueva tarea..."
            className="flex-1 px-3 py-2 rounded-md text-white placeholder-white/60 focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-sm"
            style={{
              background: 'rgba(40, 40, 40, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCreateTask();
              }
            }}
          />
          
          <input
            type="text"
            value={newTaskSubtitle}
            onChange={(e) => setNewTaskSubtitle(e.target.value)}
            placeholder="Subtítulo (opcional)"
            className="w-32 px-3 py-2 rounded-md text-white placeholder-white/60 focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-sm"
            style={{
              background: 'rgba(40, 40, 40, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCreateTask();
              }
            }}
          />
          
          <button
            onClick={handleCreateTask}
            style={buttonStyle}
            className="hover:bg-blue-600/20 transition-colors"
            disabled={!newTaskTitle.trim()}
          >
            <Plus size={14} />
            Añadir
          </button>
        </div>
      </div>
    </div>
  );
}