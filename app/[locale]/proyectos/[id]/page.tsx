"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Pencil, Lock, Unlock, Loader2, Save, X, Plus, Trash2, PlayIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import ProductCheckModal from "@/app/components/showInputProducto";
import { WeeklyCalendar, WeeklyGlobalEvent } from "@/app/components/calendario_plan";

const supabaseClient = createClientComponentClient();

const projectTypes: string[] = ['Lista de tareas', 'Sitio web', 'Landing Page', 'Aplicación para móviles', 'Automatizacion'];

type ProjectContext = {
  description: string;
  stylePrompt: string;
  type: string;
  utility: string;
  palette: string;
  colors: string[] | null;
};

type Task = {
  id?: number | string;
  descripcion?: string;
  text?: string;
  title?: string;
  description?: string;
  estado?: string;
  completed?: boolean;
};

type Plan = {
  projectId?: string;
  tasks: string[] | Task[];
  projectContext: ProjectContext;
  finalImageUrl: string | null;
  timestamp: string;
  calendarPositions?: Record<string, { dayIndex: number; startHour: number }>;
  calendarOnlyTasks?: Array<{ id: string; title: string; subtitle?: string }>;
};

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next.js app router sometimes passes params as Promise
  const { id } = React.use(params);
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isPublic, setIsPublic] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  // Editing state from code2
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedPlan, setEditedPlan] = React.useState<Plan | null>(null);
  const [newTask, setNewTask] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  // Product modal / privacy flow from code1
  const [productModalOpen, setProductModalOpen] = React.useState(false);

  // Supabase integration states
  const [isFromSupabase, setIsFromSupabase] = React.useState(false);
  const [supabaseProject, setSupabaseProject] = React.useState<any>(null);
  const [isFromCache, setIsFromCache] = React.useState(false);
  const [currentUser, setCurrentUser] = React.useState<any>(null);
  const [isUserLoading, setIsUserLoading] = React.useState(true);

  // Estado para controlar qué tarea tiene los botones de acción expandidos
  const [expandedTaskIndex, setExpandedTaskIndex] = React.useState<number | null>(null);

  // Referencia al contenedor de scroll de las tareas
  const tasksScrollRef = React.useRef<HTMLDivElement>(null);

  // Estados para el modal de delegación
  const [delegateModalOpen, setDelegateModalOpen] = React.useState(false);
  const [selectedTaskForDelegate, setSelectedTaskForDelegate] = React.useState<Task | string>("");
  const [delegateForm, setDelegateForm] = React.useState({
    technologies: "",
    level: ""
  });
  const [isDelegating, setIsDelegating] = React.useState(false);
  const [delegateMessage, setDelegateMessage] = React.useState("");

  // Estados para el calendario
  const [calendarEvents, setCalendarEvents] = React.useState<WeeklyGlobalEvent[]>([]);
  const [isLoadingCalendar, setIsLoadingCalendar] = React.useState(false);

  const router = useRouter();
  const visibilityKey = `project-${id}-visibility`;

  // Safe localStorage helpers
  const safeLocalGet = (key: string) => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  };
  const safeLocalSet = (key: string, value: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, value);
    }
  };

  // Verificar usuario logueado al cargar el componente
  React.useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        setCurrentUser(session?.user || null);
      } catch (error) {
        console.error("Error checking user session:", error);
        setCurrentUser(null);
      } finally {
        setIsUserLoading(false);
      }
    };

    checkUser();
  }, []);

  // On mount: read visibility
  React.useEffect(() => {
    if (!isFromSupabase) {
      const stored = safeLocalGet(visibilityKey);
      if (stored !== null) {
        setIsPublic(stored === "public");
      }
    }
  }, [id, isFromSupabase]);

  // Función para buscar proyecto en Supabase (con cache)
  const fetchProjectFromSupabase = async (identifier: string) => {
    try {
      // 1. Primero verificar cache en sessionStorage
      const cacheKey = `supabase-project-${identifier}`;
      const cachedData = sessionStorage.getItem(cacheKey);

      if (cachedData) {
        console.log('Usando datos cacheados para:', identifier);
        const parsedData = JSON.parse(cachedData);
        // Marcar que viene de cache
        parsedData._fromCache = true;
        // Limpiar cache después de usarlo para evitar datos obsoletos
        sessionStorage.removeItem(cacheKey);
        return parsedData;
      }

      // 2. Si no hay cache, hacer petición a Supabase
      const numericId = parseInt(identifier, 10);
      const isNumericId = !isNaN(numericId) && numericId.toString() === identifier;

      let query = supabaseClient
        .from('proyectos')
        .select(`
          *,
          tareas (*)
        `);

      if (isNumericId) {
        query = query.eq('id', numericId);
      } else {
        query = query.eq('producto', identifier);
      }

      const { data, error } = await query.single();

      if (error) {
        console.error('Error fetching project from Supabase:', error);
        return null;
      }

      console.log('Datos obtenidos de Supabase para:', identifier);
      return data;
    } catch (e) {
      console.error('Error in fetchProjectFromSupabase:', e);
      return null;
    }
  };

  // Función para verificar si el usuario puede ver el proyecto
  const canUserViewProject = async (project: any) => {
    // Si es público, cualquiera puede verlo
    if (project.publico === true) {
      return true;
    }

    // Si es privado, verificar si el usuario es el propietario
    if (project.publico === false) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session && session.user && session.user.id === project.user_id) {
        return true;
      }
      return false;
    }

    // Si publico es null/undefined, asumir que es público
    return true;
  };

  // Load plan from allProjectPlans or Supabase
  React.useEffect(() => {
    const loadProject = async () => {
      try {
        // 1. Primero buscar en localStorage (comportamiento original)
        const raw = safeLocalGet("allProjectPlans");
        const plans: Plan[] = raw ? JSON.parse(raw) : [];

        const n = Number(id);
        let chosen: Plan | null = Number.isFinite(n) ? plans[n - 1] ?? null : null;

        if (!chosen) {
          chosen = plans.find((p) => p.projectId === id) ?? null;
        }

        if (chosen) {
          // Encontrado en localStorage
          setPlan(chosen);
          setIsFromSupabase(false);
          setLoading(false);
          return;
        }

        // 2. Si no se encuentra en localStorage, buscar en Supabase
        const supabaseProject = await fetchProjectFromSupabase(id);

        if (supabaseProject) {
          // Verificar si el usuario puede ver este proyecto
          const canView = await canUserViewProject(supabaseProject);

          if (!canView) {
            setPlan(null);
            setLoading(false);
            return;
          }

          // Convertir el proyecto de Supabase al formato Plan
          const convertedPlan: Plan = {
            projectId: supabaseProject.id?.toString(),
            tasks: (supabaseProject.tareas || []).map((tarea: any) => ({
              id: tarea.id,
              descripcion: tarea.descripcion,
              estado: tarea.estado || 'pendiente'
            })),
            projectContext: {
              description: supabaseProject.description || supabaseProject.nombre || '',
              stylePrompt: supabaseProject.style_prompt || '',
              type: supabaseProject.type || '',
              utility: supabaseProject.utility || '',
              palette: supabaseProject.palette || '',
              colors: supabaseProject.colors || null
            },
            finalImageUrl: supabaseProject.imagen_url || null,
            timestamp: supabaseProject.timestamp || new Date().toISOString()
          };

          setPlan(convertedPlan);
          setSupabaseProject(supabaseProject);
          setIsFromSupabase(true);
          setIsFromCache(supabaseProject._fromCache || false);
          setIsPublic(supabaseProject.publico === true);
        } else {
          setPlan(null);
        }
      } catch (e) {
        console.error("Error loading project:", e);
        setPlan(null);
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [id]);

  // KEEP the privacy flow from code1 (accept product, open modal, send product + publico)
  const goPrivate = async (producto?: string) => {
    setIsLoading(true);

    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();

      if (!session) {

        setIsLoading(false);

        // Guardar la URL actual para redirigir después del login
        const currentUrl = window.location.pathname;
        const loginUrl = `/login?returnTo=${encodeURIComponent(currentUrl)}`;
        router.push(loginUrl);
        return;
      }

      // Get plans from localStorage
      const raw = safeLocalGet("allProjectPlans");
      const plans: Plan[] = raw ? JSON.parse(raw) : [];

      const n = Number(id);
      let chosen: Plan | null = Number.isFinite(n)
        ? plans[n - 1] ?? null
        : null;

      if (!chosen) {
        chosen = plans.find((p) => p.projectId === id) ?? null;
      }

      if (!chosen || !chosen.projectContext) {
        alert("No se encontró el plan para guardar.");
        setIsLoading(false);
        return;
      }

      const newState = !isPublic;

      // POST including producto and publico (same as code1)
      const response = await fetch("../api/create-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...chosen,
          producto: producto,
          publico: newState,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Error al guardar la visibilidad.");
        setIsLoading(false);
        return;
      }

      setIsPublic(newState);
      safeLocalSet(visibilityKey, newState ? "public" : "private");

      // Si se creó exitosamente y tiene producto, redirigir y cachear datos
      if (data.projectId && producto) {
        // Crear objeto completo del proyecto para cache
        const fullProjectData = {
          id: data.projectId,
          user_id: session.user.id,
          nombre: chosen.projectContext.description,
          description: chosen.projectContext.description,
          style_prompt: chosen.projectContext.stylePrompt,
          type: chosen.projectContext.type,
          utility: chosen.projectContext.utility,
          palette: chosen.projectContext.palette,
          colors: chosen.projectContext.colors,
          imagen_url: chosen.finalImageUrl,
          timestamp: chosen.timestamp,
          publico: newState,
          producto: producto,
          tareas: chosen.tasks.map((taskDesc: string | Task, index: number) => {
            if (typeof taskDesc === "string") {
              return {
                id: `temp-${index}`,
                descripcion: taskDesc,
                proyecto_id: data.projectId,
                estado: "pendiente"
              };
            } else {
              return {
                id: taskDesc.id ?? `temp-${index}`,
                descripcion: taskDesc.descripcion,
                proyecto_id: data.projectId,
                estado: taskDesc.estado ?? "pendiente"
              };
            }
          })
        };

        // Cachear los datos del proyecto
        const cacheKey = `supabase-project-${producto}`;
        sessionStorage.setItem(cacheKey, JSON.stringify(fullProjectData));

        // Redirigir a la nueva URL con el producto
        router.push(`/proyectos/${producto}`);
        return;
      }
    } catch (error) {
      alert(error);
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Función para manejar cambio de privacidad
  async function togglePrivacy() {
    if (isFromSupabase && supabaseProject) {
      // Si es proyecto de Supabase, usar el endpoint de toggle
      await toggleSupabaseProjectPrivacy();
    } else {
      // Si es proyecto de localStorage, verificar usuario antes de abrir modal
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (!session) {
          // Guardar la URL actual para redirigir después del login
          const currentUrl = window.location.pathname;
          const loginUrl = `/login?returnTo=${encodeURIComponent(currentUrl)}`;
          router.push(loginUrl);
          return;
        }

        // Si hay usuario logueado, abrir modal para crear en Supabase
        setProductModalOpen(true);
      } catch (error) {
        console.error("Error checking user session:", error);
        // En caso de error, redirigir al login por seguridad
        const currentUrl = window.location.pathname;
        const loginUrl = `/login?returnTo=${encodeURIComponent(currentUrl)}`;
        router.push(loginUrl);
      }
    }
  }

  // Nueva función para cambiar privacidad de proyectos existentes en Supabase
  const toggleSupabaseProjectPrivacy = async () => {
    setIsLoading(true);

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();

      if (!session) {
        alert("Debes iniciar sesión para cambiar la visibilidad del proyecto.");
        setIsLoading(false);

        // Guardar la URL actual para redirigir después del login
        const currentUrl = window.location.pathname;
        const loginUrl = `/login?returnTo=${encodeURIComponent(currentUrl)}`;
        router.push(loginUrl);
        return;
      }

      // Verificar que el usuario es el propietario
      if (session.user.id !== supabaseProject.user_id) {
        alert("No tienes permisos para modificar este proyecto.");
        setIsLoading(false);
        return;
      }

      const response = await fetch(`/api/proyectos/${supabaseProject.id}/toggle-privacy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Error al cambiar la visibilidad del proyecto.");
        setIsLoading(false);
        return;
      }

      // Actualizar el estado local
      setIsPublic(data.newStatus);
      setSupabaseProject((prev: any) => ({ ...prev, publico: data.newStatus }));

    } catch (error) {
      console.error("Error toggling privacy:", error);
      alert("Error al cambiar la visibilidad del proyecto.");
    } finally {
      setIsLoading(false);
    }
  };

  // Called when ProductCheckModal saves the chosen producto
  const handleProductSave = async (producto: string) => {
    setProductModalOpen(false);
    await goPrivate(producto);
  };

  // Funciones para el modal de delegación
  const openDelegateModal = (task: Task | string) => {
    setSelectedTaskForDelegate(task);
    setDelegateModalOpen(true);
  };

  const closeDelegateModal = () => {
    setDelegateModalOpen(false);
    setSelectedTaskForDelegate("");
    setDelegateForm({
      technologies: "",
      level: ""
    });
    setIsDelegating(false);
    setDelegateMessage("");
  };

  const handleDelegateSubmit = async () => {
    setIsDelegating(true);
    setDelegateMessage("");

    try {
      const taskDescription = typeof selectedTaskForDelegate === 'string'
        ? selectedTaskForDelegate
        : selectedTaskForDelegate.descripcion;

      const taskId = typeof selectedTaskForDelegate === 'object' && selectedTaskForDelegate.id
        ? selectedTaskForDelegate.id
        : null;

      const response = await fetch('/api/tareas-delegadas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tipo_tarea: 'tarea_de_proyecto',
          nivel: delegateForm.level,
          tecnologias: delegateForm.technologies,
          descripcion: taskDescription,
          proyecto_id: isFromSupabase ? supabaseProject?.id : null,
          tarea_id: taskId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al delegar la tarea');
      }

      setDelegateMessage("✅ Tarea delegada con éxito");

      // Si es proyecto de Supabase, actualizar el plan local para reflejar el cambio
      if (isFromSupabase && taskId) {
        setPlan(prevPlan => {
          if (!prevPlan) return prevPlan;
          const updatedTasks = prevPlan.tasks.map((task: any) => {
            if (typeof task === 'object' && task.id === taskId) {
              return { ...task, estado: 'delegada' };
            }
            return task;
          });
          return { ...prevPlan, tasks: updatedTasks };
        });
      }

      // Cerrar modal después de un breve delay para mostrar el mensaje
      setTimeout(() => {
        closeDelegateModal();
      }, 2000);

    } catch (error: any) {
      console.error('Error delegating task:', error);
      setDelegateMessage(`❌ ${error.message}`);
    } finally {
      setIsDelegating(false);
    }
  };

  // Cargar eventos del calendario
  const loadCalendarEvents = React.useCallback(async () => {
    setIsLoadingCalendar(true);
    try {
      if (isFromSupabase && supabaseProject) {
        // Cargar desde Supabase
        const response = await fetch(`/api/proyectos/${supabaseProject.id}/eventos`);
        if (response.ok) {
          const data = await response.json();
          const events = data.eventos.map((evento: any) => ({
            id: evento.id.toString(),
            title: evento.title,
            subtitle: evento.subtitle,
            dayIndex: evento.day_index,
            startHour: evento.start_hour,
            endHour: evento.end_hour,
            color: evento.color,
            time: evento.time
          }));
          setCalendarEvents(events);
        }
      } else if (plan) {
        // Cargar desde el plan guardado para proyectos locales
        const colors = [
          "rgba(59, 130, 246, 0.9)",
          "rgba(16, 185, 129, 0.9)",
          "rgba(245, 158, 11, 0.9)",
          "rgba(147, 51, 234, 0.9)",
          "rgba(239, 68, 68, 0.9)",
          "rgba(236, 72, 153, 0.9)"
        ];

        const events: WeeklyGlobalEvent[] = [];

        // Convertir tareas principales a eventos del calendario con sus posiciones
        if (plan.tasks) {
          plan.tasks.forEach((task, index) => {
            // Obtener el ID de la tarea
            let taskId: string;
            if (typeof task === 'object' && task.id) {
              // Si la tarea tiene un ID, usarlo directamente (puede ser string o number de Supabase)
              taskId = typeof task.id === 'number' ? `supabase-task-${task.id}` : task.id;
            } else {
              taskId = `task-${index}`;
            }

            // Obtener la posición guardada o usar valores por defecto (sin programar)
            const position = plan.calendarPositions?.[taskId] || { dayIndex: -1, startHour: 9 };

            // Obtener el título de la tarea
            const title = typeof task === 'string'
              ? task
              : (task.text || task.title || task.descripcion || '');

            events.push({
              id: taskId,
              title: title,
              subtitle: "Tarea del proyecto",
              dayIndex: position.dayIndex,
              startHour: position.startHour,
              color: colors[index % colors.length]
            });
          });
        }

        // Agregar tareas del calendario únicamente
        if (plan.calendarOnlyTasks) {
          plan.calendarOnlyTasks.forEach((calTask, index) => {
            const position = plan.calendarPositions?.[calTask.id] || { dayIndex: -1, startHour: 9 };
            events.push({
              id: calTask.id,
              title: calTask.title,
              subtitle: calTask.subtitle,
              dayIndex: position.dayIndex,
              startHour: position.startHour,
              color: colors[(plan.tasks.length + index) % colors.length]
            });
          });
        }

        setCalendarEvents(events);
      }
    } catch (error) {
      console.error('Error loading calendar events:', error);
    } finally {
      setIsLoadingCalendar(false);
    }
  }, [isFromSupabase, supabaseProject, id, plan]);

  // Guardar eventos del calendario en localStorage para proyectos locales
  const saveCalendarEventsLocal = React.useCallback((events: WeeklyGlobalEvent[]) => {
    if (!isFromSupabase && plan) {
      try {
        const raw = safeLocalGet("allProjectPlans");
        const plans: Plan[] = raw ? JSON.parse(raw) : [];

        const n = Number(id);
        let index = Number.isFinite(n) ? n - 1 : plans.findIndex((p) => p.projectId === id);

        if (!(index >= 0 && index < plans.length)) {
          index = plans.findIndex((p) => p.projectId === id);
        }

        if (index >= 0 && index < plans.length) {
          // Extraer posiciones y tareas del calendario
          const calendarPositions: Record<string, { dayIndex: number; startHour: number }> = {};
          const calendarOnlyTasks: Array<{ id: string; title: string; subtitle?: string }> = [];

          events.forEach(event => {
            calendarPositions[event.id] = {
              dayIndex: event.dayIndex,
              startHour: event.startHour
            };

            // Si el evento no es parte de las tareas principales, agregarlo a calendarOnlyTasks
            const isMainTask = plans[index].tasks.some((task, taskIndex) => {
              let taskId: string;
              if (typeof task === 'object' && task.id) {
                taskId = typeof task.id === 'number' ? `supabase-task-${task.id}` : task.id;
              } else {
                taskId = `task-${taskIndex}`;
              }
              return taskId === event.id;
            });

            if (!isMainTask) {
              calendarOnlyTasks.push({
                id: event.id,
                title: event.title,
                subtitle: event.subtitle
              });
            }
          });

          // Actualizar el plan con las nuevas posiciones y tareas del calendario
          plans[index] = {
            ...plans[index],
            calendarPositions,
            calendarOnlyTasks,
            timestamp: new Date().toISOString()
          };

          safeLocalSet("allProjectPlans", JSON.stringify(plans));
          setPlan(plans[index]);
        }
      } catch (error) {
        console.error("Error guardando eventos del calendario:", error);
      }
    }
  }, [isFromSupabase, id, plan]);

  // Cargar eventos cuando se carga el proyecto
  React.useEffect(() => {
    if (isFromSupabase && supabaseProject && !loading) {
      loadCalendarEvents();
    }
  }, [isFromSupabase, supabaseProject, loading, loadCalendarEvents]);

  // Cargar eventos para proyectos locales
  React.useEffect(() => {
    if (!isFromSupabase && !loading && plan) {
      loadCalendarEvents();
    }
  }, [isFromSupabase, loading, plan, loadCalendarEvents]);

  // Funciones para el calendario
  const handleEventMove = async (eventId: string, dayIndex: number, hour?: number) => {
    // Actualizar estado local inmediatamente
    const updatedEvents = calendarEvents.map(e => {
      if (e.id === eventId) {
        return {
          ...e,
          dayIndex,
          startHour: hour ?? e.startHour,
        };
      }
      return e;
    });
    
    setCalendarEvents(updatedEvents);

    // Si es proyecto de Supabase, actualizar en la base de datos
    if (isFromSupabase && supabaseProject) {
      try {
        await fetch(`/api/proyectos/${supabaseProject.id}/eventos`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId,
            dayIndex,
            startHour: hour
          })
        });
      } catch (error) {
        console.error('Error updating event:', error);
        // Revertir cambio en caso de error
        loadCalendarEvents();
      }
    } else {
      // Para proyectos locales, guardar en localStorage
      saveCalendarEventsLocal(updatedEvents);
    }
  };

  const handleEventRemove = async (eventId: string) => {
    // Actualizar estado local inmediatamente
    const updatedEvents = calendarEvents.filter(e => e.id !== eventId);
    setCalendarEvents(updatedEvents);

    // Si es proyecto de Supabase, eliminar de la base de datos
    if (isFromSupabase && supabaseProject) {
      try {
        await fetch(`/api/proyectos/${supabaseProject.id}/eventos?eventId=${eventId}`, {
          method: 'DELETE'
        });
      } catch (error) {
        console.error('Error deleting event:', error);
        // Recargar eventos en caso de error
        loadCalendarEvents();
      }
    } else if (plan) {
      // Para proyectos locales, verificar si es una tarea principal
      const taskIndex = plan.tasks.findIndex((task, index) => {
        let taskId: string;
        if (typeof task === 'object' && task.id) {
          taskId = typeof task.id === 'number' ? `supabase-task-${task.id}` : task.id;
        } else {
          taskId = `task-${index}`;
        }
        return taskId === eventId;
      });

      // Si es una tarea principal, eliminarla también del plan
      if (taskIndex !== -1) {
        const raw = safeLocalGet("allProjectPlans");
        const plans: Plan[] = raw ? JSON.parse(raw) : [];

        const n = Number(id);
        let planIndex = Number.isFinite(n) ? n - 1 : plans.findIndex((p) => p.projectId === id);

        if (!(planIndex >= 0 && planIndex < plans.length)) {
          planIndex = plans.findIndex((p) => p.projectId === id);
        }

        if (planIndex >= 0 && planIndex < plans.length) {
          // Eliminar la tarea del array de tareas
          const updatedTasks = [...plans[planIndex].tasks];
          updatedTasks.splice(taskIndex, 1);

          // Actualizar el plan con las tareas actualizadas
          plans[planIndex] = {
            ...plans[planIndex],
            tasks: updatedTasks,
            timestamp: new Date().toISOString()
          };

          safeLocalSet("allProjectPlans", JSON.stringify(plans));
          setPlan(plans[planIndex]);
        }
      }

      // Guardar los eventos actualizados del calendario
      saveCalendarEventsLocal(updatedEvents);
    }
  };

  const handleCellClick = (dayIndex: number, hour: number) => {
    console.log(`Clicked cell: Day ${dayIndex}, Hour ${hour}`);
  };

  const handleAddCalendarTask = async () => {
    const newEvent: WeeklyGlobalEvent = {
      id: Date.now().toString(),
      title: "Nueva tarea",
      subtitle: "Del proyecto",
      dayIndex: -1, // Unscheduled by default
      startHour: 9,
      color: "rgba(59, 130, 246, 0.9)"
    };

    // Actualizar estado local inmediatamente
    const updatedEvents = [...calendarEvents, newEvent];
    setCalendarEvents(updatedEvents);

    // Si es proyecto de Supabase, guardar en la base de datos
    if (isFromSupabase && supabaseProject) {
      try {
        const response = await fetch(`/api/proyectos/${supabaseProject.id}/eventos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: newEvent.title,
            subtitle: newEvent.subtitle,
            dayIndex: newEvent.dayIndex,
            startHour: newEvent.startHour,
            color: newEvent.color
          })
        });

        if (response.ok) {
          const data = await response.json();
          // Actualizar el evento con el ID real de la base de datos
          setCalendarEvents(prev => prev.map(e => 
            e.id === newEvent.id 
              ? { ...e, id: data.evento.id.toString() }
              : e
          ));
        }
      } catch (error) {
        console.error('Error creating event:', error);
        // Remover el evento local en caso de error
        setCalendarEvents(prev => prev.filter(e => e.id !== newEvent.id));
      }
    } else {
      // Para proyectos locales, guardar en localStorage
      saveCalendarEventsLocal(updatedEvents);
    }
  };

  const handleSuggestCalendarTask = async () => {
    const suggestions = [
      { title: "Revisar progreso", subtitle: "Proyecto", color: "rgba(16, 185, 129, 0.9)" },
      { title: "Reunión de equipo", subtitle: "30 min", color: "rgba(245, 158, 11, 0.9)" },
      { title: "Revisar código", subtitle: "Code review", color: "rgba(147, 51, 234, 0.9)" },
      { title: "Testing", subtitle: "QA", color: "rgba(239, 68, 68, 0.9)" },
      { title: "Documentación", subtitle: "Actualizar docs", color: "rgba(236, 72, 153, 0.9)" }
    ];
    
    const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
    const suggestedTask: WeeklyGlobalEvent = {
      id: Date.now().toString(),
      ...randomSuggestion,
      dayIndex: -1,
      startHour: 10
    };
    
    // Actualizar estado local inmediatamente
    const updatedEvents = [...calendarEvents, suggestedTask];
    setCalendarEvents(updatedEvents);

    // Si es proyecto de Supabase, guardar en la base de datos
    if (isFromSupabase && supabaseProject) {
      try {
        const response = await fetch(`/api/proyectos/${supabaseProject.id}/eventos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: suggestedTask.title,
            subtitle: suggestedTask.subtitle,
            dayIndex: suggestedTask.dayIndex,
            startHour: suggestedTask.startHour,
            color: suggestedTask.color
          })
        });

        if (response.ok) {
          const data = await response.json();
          // Actualizar el evento con el ID real de la base de datos
          setCalendarEvents(prev => prev.map(e => 
            e.id === suggestedTask.id 
              ? { ...e, id: data.evento.id.toString() }
              : e
          ));
        }
      } catch (error) {
        console.error('Error creating suggested event:', error);
        // Remover el evento local en caso de error
        setCalendarEvents(prev => prev.filter(e => e.id !== suggestedTask.id));
      }
    } else {
      // Para proyectos locales, guardar en localStorage
      saveCalendarEventsLocal(updatedEvents);
    }
  };

  // ---------------- Editing functions (from code2) ----------------
  const startEditing = () => {
    setEditedPlan(plan ? JSON.parse(JSON.stringify(plan)) : null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEditedPlan(null);
    setIsEditing(false);
  };

  // Función para guardar solo las tareas automáticamente
  const saveTasksOnly = async (updatedPlan: Plan) => {
    if (isFromSupabase && supabaseProject) {
      // Guardar en Supabase
      try {
        const response = await fetch("../api/update-project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: supabaseProject.id,
            projectContext: updatedPlan.projectContext,
            tasks: updatedPlan.tasks,
            finalImageUrl: updatedPlan.finalImageUrl,
            timestamp: updatedPlan.timestamp,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error("Error actualizando tareas:", data.error);
          return;
        }

        setPlan(updatedPlan);
      } catch (error) {
        console.error("Error guardando tareas en Supabase:", error);
      }
    } else {
      // Guardar en localStorage (comportamiento original)
      try {
        const raw = safeLocalGet("allProjectPlans");
        const plans: Plan[] = raw ? JSON.parse(raw) : [];

        const n = Number(id);
        let index = Number.isFinite(n) ? n - 1 : plans.findIndex((p) => p.projectId === id);

        if (!(index >= 0 && index < plans.length)) {
          index = plans.findIndex((p) => p.projectId === id);
        }

        if (index >= 0 && index < plans.length) {
          plans[index] = { ...updatedPlan, timestamp: new Date().toISOString() };
          safeLocalSet("allProjectPlans", JSON.stringify(plans));
          setPlan(updatedPlan);
        }
      } catch (error) {
        console.error("Error guardando tareas:", error);
      }
    }
  };

  // Función para hacer scroll hasta el final de las tareas
  const scrollToBottom = () => {
    setTimeout(() => {
      if (tasksScrollRef.current) {
        tasksScrollRef.current.scrollTop = tasksScrollRef.current.scrollHeight;
      }
    }, 100); // Pequeño delay para asegurar que el DOM se haya actualizado
  };

  const saveChanges = async () => {
    if (!editedPlan) return;

    setIsSaving(true);

    try {
      if (isFromSupabase && supabaseProject) {
        // Guardar en Supabase
        const response = await fetch("../api/update-project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: supabaseProject.id,
            projectContext: editedPlan.projectContext,
            tasks: editedPlan.tasks,
            finalImageUrl: editedPlan.finalImageUrl,
            timestamp: editedPlan.timestamp,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          alert(data.error || "Error al actualizar el proyecto.");
          return;
        }

        // Actualizar el estado local
        setPlan(editedPlan);
        setSupabaseProject((prev: any) => ({
          ...prev,
          nombre: editedPlan.projectContext.description,
          description: editedPlan.projectContext.description,
          style_prompt: editedPlan.projectContext.stylePrompt,
          type: editedPlan.projectContext.type,
          utility: editedPlan.projectContext.utility,
          palette: editedPlan.projectContext.palette,
          colors: editedPlan.projectContext.colors,
          imagen_url: editedPlan.finalImageUrl,
          timestamp: editedPlan.timestamp,
        }));

        alert("Proyecto actualizado con éxito");
      } else {
        // Guardar en localStorage (comportamiento original)
        const raw = safeLocalGet("allProjectPlans");
        const plans: Plan[] = raw ? JSON.parse(raw) : [];

        const n = Number(id);
        let index = Number.isFinite(n) ? n - 1 : plans.findIndex((p) => p.projectId === id);

        // If index invalid, try to find index by projectId
        if (!(index >= 0 && index < plans.length)) {
          index = plans.findIndex((p) => p.projectId === id);
        }

        if (index >= 0 && index < plans.length) {
          plans[index] = { ...editedPlan, timestamp: new Date().toISOString() };
          safeLocalSet("allProjectPlans", JSON.stringify(plans));
        } else {
          // If not found in array, push it (fallback)
          plans.push({ ...editedPlan, timestamp: new Date().toISOString() });
          safeLocalSet("allProjectPlans", JSON.stringify(plans));
        }

        // Solo actualizar el plan principal, mantener editedPlan para que las tareas sigan siendo editables
        setPlan(editedPlan);
      }

      // NO llamar cancelEditing() para mantener las tareas editables
      setIsEditing(false); // Solo cambiar el estado de edición del contexto del proyecto
    } catch (error) {
      console.error("Error guardando cambios:", error);
      alert("Error al guardar los cambios");
    } finally {
      setIsSaving(false);
    }
  };

  const updateEditedPlan = (field: string, value: any) => {
    if (!editedPlan) return;
    setEditedPlan((prev) => {
      if (!prev) return prev;
      if (field.includes(".")) {
        const [parent, child] = field.split(".");
        return {
          ...prev,
          [parent]: {
            ...(prev as any)[parent],
            [child]: value,
          },
        };
      }
      return { ...prev, [field]: value };
    });
  };

  const arrayUpdater = (
    key: keyof Plan | "projectContext.colors",
    index: number,
    value?: any,
    remove?: boolean
  ) => {
    if (!editedPlan) return;
    setEditedPlan((prev) => {
      if (!prev) return prev;
      let updated = { ...prev };
      if (key === "tasks") {
        const arr = [...prev.tasks];
        if (remove) arr.splice(index, 1);
        else arr[index] = value;
        // Ensure arr is either string[] or Task[]
        if (arr.every((item) => typeof item === "string")) {
          updated.tasks = arr as string[];
        } else if (arr.every((item) => typeof item === "object")) {
          updated.tasks = arr as Task[];
        } else {
          // fallback: convert all to Task objects
          updated.tasks = arr.map((item) =>
            typeof item === "string"
              ? { descripcion: item }
              : item
          ) as Task[];
        }
      }
      if (key === "projectContext.colors") {
        const arr = [...(prev.projectContext.colors || [])];
        if (remove) arr.splice(index, 1);
        else arr[index] = value;
        updated.projectContext = { ...prev.projectContext, colors: arr.length ? arr : null };
      }
      return updated;
    });
  };
  // ---------------- end editing functions ----------------

  // Función para determinar si se debe mostrar el botón de privacidad
  const shouldShowPrivacyButton = React.useMemo(() => {
    // Si aún está cargando el usuario, no mostrar el botón
    if (isUserLoading) return false;

    // Si es proyecto local (localStorage), siempre mostrar el botón
    if (!isFromSupabase) return true;

    // Si es proyecto de Supabase, solo mostrar si:
    // 1. Hay usuario logueado Y
    // 2. El usuario es propietario del proyecto
    if (isFromSupabase && supabaseProject) {
      return currentUser && currentUser.id === supabaseProject.user_id;
    }

    return false;
  }, [isUserLoading, isFromSupabase, currentUser, supabaseProject]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-100">
        Loading…
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center text-white px-4">
        <h1 className="text-2xl font-bold mb-4">Proyecto no encontrado</h1>
        <p className="mb-6">
          No hay un plan con id <span className="font-mono">{id}</span> en este navegador.
        </p>
        <div className="space-x-4">
          <Button asChild>
            <Link href="/plan">Crear un nuevo plan</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Volver al inicio</Link>
          </Button>
        </div>
      </div>
    );
  }

  const currentPlan = isEditing ? editedPlan : plan;

  return (
    <div className="min-h-screen text-white pt-8 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto max-w-4xl">
        <header className="mb-8">
          {/* Contenedor flex para alinear botones */}



          <div className="flex justify-between items-start mb-6">
            {/* Botón Volver */}
            <Button
              asChild
              className="text-white px-4 py-2 font-semibold rounded-xl hover:bg-[rgba(158,158,149,0.7)] hover:brightness-110 transition-all duration-200"
              style={{
                background: "rgba(158, 158, 149, 0.2)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                boxShadow:
                  "2px 4px 4px rgba(0, 0, 0, 0.35), inset -1px 0px 2px rgba(201, 201, 201, 0.1), inset 5px -5px 12px rgba(255, 255, 255, 0.05), inset -5px 5px 12px rgba(255, 255, 255, 0.05)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                borderRadius: "20px",
              }}
            >
              <Link href="/">⬅ Volver al Inicio</Link>
            </Button>
          </div>

          {/* Botón de visibilidad: mostrar solo si cumple condiciones */}
          {shouldShowPrivacyButton && (
            <div className="flex flex-col md:flex-row items-center justify-between bg-blue-900/30 border border-blue-600/30  backdrop-blur-sm rounded-xl p-4 border border-white/10 mb-6 gap-4">
              <div className="md:mb-0">
                <p className="text-sm  text-blue-200 text-center md:text-left">
                  {isPublic
                    ? "Para delegar tareas del proyecto debes convertirlo en privado"
                    : "Puedes volver el proyecto público para que todos observen el desarrollo"}
                </p>
              </div>
              <div className="flex justify-center md:justify-end">
                <Button
                  className="text-white px-4 py-2 font-semibold rounded-xl hover:bg-[rgba(198,198,199,1)] hover:brightness-110 transition-all duration-200"
                  style={{
                    background: "rgba(158, 158, 149, 0.2)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    boxShadow:
                      "2px 4px 4px rgba(0, 0, 0, 0.35), inset -1px 0px 2px rgba(201, 201, 201, 0.1), inset 5px -5px 12px rgba(255, 255, 255, 0.05), inset -5px 5px 12px rgba(255, 255, 255, 0.05)",
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                    borderRadius: "20px",
                  }}
                  onClick={togglePrivacy}
                  variant="outline"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : isPublic ? (
                    <Unlock className="h-4 w-4 mr-2" />
                  ) : (
                    <Lock className="h-4 w-4 mr-2" />
                  )}
                  {isLoading
                    ? "Cambiando..."
                    : isFromSupabase
                      ? isPublic
                        ? "Hacer Privado"
                        : "Hacer Público"
                      : isPublic
                        ? "Hacer Privado"
                        : "Pasar a Producción Privado"}
                </Button>
              </div>
            </div>
          )}

          {/* Título y descripción (editable) */}
          <div className="space-y-2">
            {isEditing ? (
              <input
                type="text"
                value={currentPlan?.projectContext.description || ""}
                onChange={(e) =>
                  updateEditedPlan("projectContext.description", e.target.value)
                }
                className="text-3xl sm:text-4xl font-bold text-gray-50 bg-transparent border border-gray-600 focus:border-gray-400 rounded-lg px-3 py-2 w-full outline-none transition-colors"
                placeholder="Descripción del proyecto"
              />
            ) : (
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-50">
                {plan.projectContext.description || "Proyecto sin título"}
              </h1>
            )}

            <p className="text-sm text-gray-400">
              {isFromSupabase ? `Proyecto: ${id}` : `Índice local: ${id}`}
              {isFromSupabase && supabaseProject?.producto && (
                <span className="ml-2 text-green-400">• {supabaseProject.producto}</span>
              )}
              {isFromCache && (
                <span className="ml-2 text-blue-400">• Cargado desde cache</span>
              )}
            </p>

            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <Button
                    onClick={saveChanges}
                    disabled={isSaving}
                    className="text-white px-4 py-2 font-semibold rounded-xl hover:bg-green-600/70 bg-green-600/50 border border-green-500/30"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    {isSaving ? "Guardando..." : "Guardar"}
                  </Button>
                  <Button
                    onClick={cancelEditing}
                    disabled={isSaving}
                    variant="outline"
                    className="text-white px-4 py-2 font-semibold rounded-xl hover:bg-red-600/70 bg-red-600/50 border border-red-500/30"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button
                  onClick={startEditing}
                  variant="outline"
                  className="text-white px-4 py-2 font-semibold rounded-xl hover:bg-[rgba(158,158,149,0.7)] hover:brightness-110 transition-all duration-200"
                  style={{
                    background: "rgba(158, 158, 149, 0.2)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    boxShadow:
                      "2px 4px 4px rgba(0, 0, 0, 0.35), inset -1px 0px 2px rgba(201, 201, 201, 0.1), inset 5px -5px 12px rgba(255, 255, 255, 0.05), inset -5px 5px 12px rgba(255, 255, 255, 0.05)",
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                    borderRadius: "20px",
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </Button>
              )}
            </div>
          </div>
        </header>

        <main>
          {/* Contexto del proyecto (editable) */}
          <section className="p-6 rounded-lg border border-white/10 bg-black/20 space-y-6">
            <h2 className="text-2xl font-semibold">Contexto del Proyecto</h2>

            {/* Estilo */}
            <div>
              <label className="block text-sm font-medium mb-2">Estilo:</label>
              {isEditing ? (
                <textarea
                  value={currentPlan?.projectContext.stylePrompt || ""}
                  onChange={(e) =>
                    updateEditedPlan("projectContext.stylePrompt", e.target.value)
                  }
                  className="w-full bg-black/30 border border-gray-600 focus:border-gray-400 rounded-lg px-3 py-2 text-white outline-none transition-colors resize-y"
                  rows={3}
                />
              ) : (
                <p className="text-gray-200">{plan.projectContext.stylePrompt}</p>
              )}
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">
                Tipo:
              </label>
              {isEditing ? (
                <div className="flex flex-wrap gap-3">
                  {projectTypes.map((type) => (
                    <div
                      key={type}
                      onClick={() => updateEditedPlan("projectContext.type", type)}
                      className={`cursor-pointer px-4 py-2 rounded-full border text-sm ${currentPlan?.projectContext.type === type
                        ? "bg-white text-gray-900 border-white"
                        : "bg-white/5 text-gray-200 border-white/20 hover:bg-white/10"
                        } transition-colors duration-150`}
                    >
                      {type}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="inline-block bg-blue-600/20 text-blue-300 border border-blue-500/30 px-3 py-1 rounded-full text-sm">
                  {plan.projectContext.type}
                </span>
              )}
            </div>

            {/* Utilidad */}
            <div>
              <label className="block text-sm font-medium mb-2">Utilidad:</label>
              {isEditing ? (
                <input
                  type="text"
                  value={currentPlan?.projectContext.utility || ""}
                  onChange={(e) =>
                    updateEditedPlan("projectContext.utility", e.target.value)
                  }
                  className="w-full bg-black/30 border border-gray-600 focus:border-gray-400 rounded-lg px-3 py-2 text-white outline-none transition-colors"
                />
              ) : (
                <p className="text-gray-200">{plan.projectContext.utility}</p>
              )}
            </div>

            {/* Paleta */}
            <div>
              <label className="block text-sm font-medium mb-2">Paleta:</label>
              {isEditing ? (
                <input
                  type="text"
                  value={currentPlan?.projectContext.palette || ""}
                  onChange={(e) =>
                    updateEditedPlan("projectContext.palette", e.target.value)
                  }
                  className="w-full bg-black/30 border border-gray-600 focus:border-gray-400 rounded-lg px-3 py-2 text-white outline-none transition-colors"
                />
              ) : (
                <p className="text-gray-200">{plan.projectContext.palette}</p>
              )}
            </div>

            {/* Colores */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Colores:</label>
                {isEditing && (
                  <Button
                    onClick={() =>
                      setEditedPlan((prev) =>
                        prev
                          ? {
                            ...prev,
                            projectContext: {
                              ...prev.projectContext,
                              colors: [
                                ...(prev.projectContext.colors || []),
                                "#3B82F6",
                              ],
                            },
                          }
                          : prev
                      )
                    }
                    style={{
                      background: "rgba(158, 158, 149, 0.2)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      boxShadow:
                        "2px 4px 4px rgba(0, 0, 0, 0.35), inset -1px 0px 2px rgba(201, 201, 201, 0.1), inset 5px -5px 12px rgba(255, 255, 255, 0.05), inset -5px 5px 12px rgba(255, 255, 255, 0.05)",
                      backdropFilter: "blur(6px)",
                      WebkitBackdropFilter: "blur(6px)",
                      borderRadius: "20px",
                    }}

                    size="sm"
                    variant="outline"
                    className="text-white px-4 py-2 font-semibold rounded-xl hover:bg-[rgba(198,198,199,1)] hover:brightness-110 transition-all duration-200"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Añadir Color
                  </Button>
                )}
              </div>

              {currentPlan?.projectContext.colors?.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {currentPlan.projectContext.colors.map((color, i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                      {isEditing ? (
                        <>
                          <span className="text-xs font-mono text-gray-400 text-center">
                            {color.toUpperCase()}
                          </span>

                          <div className="relative group">
                            <input
                              type="color"
                              value={color}
                              onChange={(e) =>
                                arrayUpdater("projectContext.colors", i, e.target.value)
                              }
                              className="w-16 h-16 border-2 border-white/20 cursor-pointer bg-transparent hover:border-white/40 transition-colors"
                              style={{ backgroundColor: color }}
                            />
                          </div>

                          <button
                            onClick={() =>
                              arrayUpdater("projectContext.colors", i, undefined, true)
                            }
                            className="bg-red-600 hover:bg-red-500 text-white font-bold w-16 h-6 flex items-center justify-center transition-all duration-200 hover:scale-105"
                            aria-label={`Eliminar color ${color}`}
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs font-mono text-gray-300 text-center">
                            {color.toUpperCase()}
                          </span>

                          <div
                            className="w-16 h-16 border-2 border-white/20 shadow-md"
                            style={{ backgroundColor: color }}
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-2 rounded-lg border-2 border-dashed border-gray-500 flex items-center justify-center">
                    <span className="text-gray-500 text-xl">?</span>
                  </div>
                  <p className="text-gray-400 text-sm">Sin colores definidos</p>
                  {isEditing && (
                    <p className="text-gray-500 text-xs mt-1">Haz clic en "Añadir Color" para empezar</p>
                  )}
                </div>
              )}
            </div>
          </section>
          {/* Tareas: editable siempre (como en code2) */}
          <section className="p-6 rounded-xl border border-white/10 bg-black/30 space-y-4 shadow-lg mt-6">
            <div className="flex flex-col md:flex-row items-center justify-between border-b border-white/10 pb-3 gap-4">
              {/* Título */}
              <h2 className="text-2xl font-semibold text-center md:text-left">
                Lista de Tareas
              </h2>

              {/* Mensaje */}
              <div className="flex flex-col md:flex-row items-center justify-between bg-blue-900/30 border border-blue-600/30 backdrop-blur-sm rounded-xl p-4 border border-white/10 gap-2">
                <div className="flex items-center">
                  <p className="text-sm text-blue-200 text-center md:text-left">
                    Para delegar una tarea, o pasarla a tu calendario haz clic en el botón
                  </p>
                  <div className="ml-2">
                    <PlayIcon className="h-4 w-4" />
                  </div>
                </div>

              </div>
            </div>

            <div ref={tasksScrollRef} className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {(editedPlan?.tasks ?? plan?.tasks ?? []).length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400">No hay tareas. ¡Añade la primera!</p>
                </div>
              ) : (
                (editedPlan?.tasks ?? plan?.tasks ?? []).map((task, i) => {
                  const taskObj = typeof task === 'string'
                    ? { descripcion: task, estado: 'pendiente' }
                    : {
                        ...task,
                        descripcion: task.descripcion || task.text || task.title || '',
                        estado: task.estado || 'pendiente'
                      };
                  const isDelegated = taskObj.estado === 'delegada';

                  return (
                    <div key={i} className="space-y-2">
                      <div className={`flex items-center justify-between p-3 rounded-md border group hover:bg-white/10 transition-colors ${isDelegated
                        ? 'bg-purple-500/10 border-purple-500/30'
                        : 'bg-white/5 border-white/10'
                        }`}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 transition-colors ${expandedTaskIndex === i
                            ? 'text-green-400 bg-green-400/10'
                            : 'text-gray-400 hover:text-green-400'
                            }`}
                          aria-label="Iniciar tarea"
                          onClick={() => setExpandedTaskIndex(expandedTaskIndex === i ? null : i)}
                        >
                          <PlayIcon className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-3 flex-grow">
                          <input
                            type="text"
                            value={taskObj.descripcion}
                            onChange={(e) => {
                              let updatedPlan: Plan;

                              if (!editedPlan) {
                                const newEditedPlan = plan ? JSON.parse(JSON.stringify(plan)) : null;
                                if (newEditedPlan) {
                                  const updatedTasks = [...newEditedPlan.tasks];
                                  updatedTasks[i] = typeof task === 'string' ? e.target.value : { ...taskObj, descripcion: e.target.value };
                                  updatedPlan = { ...newEditedPlan, tasks: updatedTasks };
                                  setEditedPlan(updatedPlan);
                                  saveTasksOnly(updatedPlan);
                                }
                                return;
                              }

                              const updatedTasks = [...editedPlan.tasks];
                              updatedTasks[i] = typeof task === 'string' ? e.target.value : { ...taskObj, descripcion: e.target.value };

                              // Ensure tasks is either string[] or Task[]
                              if (updatedTasks.every(item => typeof item === 'string')) {
                                updatedPlan = { ...editedPlan, tasks: updatedTasks as string[] };
                              } else {
                                updatedPlan = { ...editedPlan, tasks: updatedTasks.map(item => typeof item === 'string' ? { descripcion: item } : item) as Task[] };
                              }

                              setEditedPlan(updatedPlan);
                              saveTasksOnly(updatedPlan);
                            }}
                            className="flex-grow bg-transparent border-none outline-none text-gray-200 placeholder:text-gray-400 hover:bg-black/20 focus:bg-black/30 rounded px-2 py-1 transition-colors"
                            placeholder="Editar tarea..."
                          />
                          {isDelegated && <span className="ml-2 text-xs text-purple-300">(Delegada)</span>}
                        </div>

                        <div className="flex items-center space-x-1.5 flex-shrink-0">
                          <button
                            onClick={() => {
                              // attempt to focus the matching input - kept non-critical
                              const taskInputs = Array.from(document.querySelectorAll('input[type="text"]'));
                              const candidate = taskInputs.find((el) => (el as HTMLInputElement).value === task);
                              if (candidate) (candidate as HTMLInputElement).focus();
                            }}
                            className="h-8 w-8 flex items-center justify-center rounded-md bg-blue-600/20 text-blue-300 opacity-30 group-hover:opacity-100 transition-all duration-200 hover:bg-blue-600/30 hover:text-blue-200"
                            aria-label="Editar tarea"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => {
                              let updatedPlan: Plan;

                              if (!editedPlan) {
                                const newEditedPlan = plan ? JSON.parse(JSON.stringify(plan)) : null;
                                if (newEditedPlan) {
                                  const updatedTasks = [...newEditedPlan.tasks];
                                  updatedTasks.splice(i, 1);
                                  updatedPlan = { ...newEditedPlan, tasks: updatedTasks };
                                  setEditedPlan(updatedPlan);
                                  saveTasksOnly(updatedPlan);
                                }
                                return;
                              }

                              const updatedTasks = [...editedPlan.tasks];
                              updatedTasks.splice(i, 1);

                              // Ensure tasks is either string[] or Task[]
                              if (updatedTasks.every(item => typeof item === 'string')) {
                                updatedPlan = { ...editedPlan, tasks: updatedTasks as string[] };
                              } else {
                                updatedPlan = { ...editedPlan, tasks: updatedTasks.map(item => typeof item === 'string' ? { descripcion: item } : item) as Task[] };
                              }

                              setEditedPlan(updatedPlan);
                              saveTasksOnly(updatedPlan);
                            }}
                            className="h-8 w-8 flex items-center justify-center rounded-md bg-red-600/20 text-red-300 opacity-30 group-hover:opacity-100 transition-all duration-200 hover:bg-red-600/30 hover:text-red-200"
                            aria-label="Eliminar tarea"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Fila de botones de acción */}
                      {expandedTaskIndex === i && (
                        <div className="flex gap-2 pl-10 pr-3 pb-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-green-300 border-green-500/30 hover:bg-green-500/20 hover:text-white bg-green-500/10"
                            onClick={async () => {
                              const newCalendarEvent: WeeklyGlobalEvent = {
                                id: `task-${Date.now()}`,
                                title: taskObj.descripcion,
                                subtitle: "Tarea del proyecto",
                                dayIndex: -1, // Unscheduled by default
                                startHour: 9,
                                color: "rgba(16, 185, 129, 0.9)"
                              };
                              
                              // Actualizar estado local inmediatamente
                              const updatedEvents = [...calendarEvents, newCalendarEvent];
                              setCalendarEvents(updatedEvents);
                              setExpandedTaskIndex(null);

                              // Si es proyecto de Supabase, guardar en la base de datos
                              if (isFromSupabase && supabaseProject) {
                                try {
                                  const response = await fetch(`/api/proyectos/${supabaseProject.id}/eventos`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      title: newCalendarEvent.title,
                                      subtitle: newCalendarEvent.subtitle,
                                      dayIndex: newCalendarEvent.dayIndex,
                                      startHour: newCalendarEvent.startHour,
                                      color: newCalendarEvent.color
                                    })
                                  });

                                  if (response.ok) {
                                    const data = await response.json();
                                    // Actualizar el evento con el ID real de la base de datos
                                    setCalendarEvents(prev => prev.map(e => 
                                      e.id === newCalendarEvent.id 
                                        ? { ...e, id: data.evento.id.toString() }
                                        : e
                                    ));
                                  }
                                } catch (error) {
                                  console.error('Error creating calendar event from task:', error);
                                  // Remover el evento local en caso de error
                                  setCalendarEvents(prev => prev.filter(e => e.id !== newCalendarEvent.id));
                                }
                              } else {
                                // Para proyectos locales, guardar en localStorage
                                saveCalendarEventsLocal(updatedEvents);
                              }
                            }}
                          >
                            📅 Agregar a mi calendario
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-purple-300 border-purple-500/30 hover:bg-purple-500/20 hover:text-white  bg-purple-500/10"
                            onClick={() => openDelegateModal(taskObj)}
                            disabled={isDelegated}
                          >
                            👥 {isDelegated ? 'Ya Delegada' : 'Delegar'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            <div className="mt-4 flex gap-2 pt-4 border-t border-white/10">
              <input
                type="text"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Añadir nueva tarea manualmente..."
                className="flex-grow bg-white/5 border border-white/20 focus:ring-indigo-400 focus:ring-1 focus:border-indigo-400 placeholder:text-gray-400 text-gray-100 rounded-lg px-3 py-2 outline-none transition-colors"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTask.trim() !== "") {
                    let updatedPlan: Plan;

                    if (!editedPlan) {
                      const newEditedPlan = plan ? JSON.parse(JSON.stringify(plan)) : null;
                      if (newEditedPlan) {
                        updatedPlan = { ...newEditedPlan, tasks: [...newEditedPlan.tasks, newTask.trim()] };
                        setEditedPlan(updatedPlan);
                        saveTasksOnly(updatedPlan);
                      } else {
                        return;
                      }
                    } else {
                      // Ensure tasks array is either string[] or Task[]
                      const updatedTasks = [...editedPlan.tasks, newTask.trim()];
                      if (updatedTasks.every(item => typeof item === 'string')) {
                        updatedPlan = { ...editedPlan, tasks: updatedTasks as string[] };
                      } else {
                        updatedPlan = {
                          ...editedPlan,
                          tasks: updatedTasks.map(item => typeof item === 'string' ? { descripcion: item } : item) as Task[]
                        };
                      }
                      setEditedPlan(updatedPlan);
                      saveTasksOnly(updatedPlan);
                    }

                    scrollToBottom();
                    setNewTask("");
                  }
                }}
              />
              <button
                onClick={() => {
                  if (newTask.trim() === "") return;

                  let updatedPlan: Plan;

                  if (!editedPlan) {
                    const newEditedPlan = plan ? JSON.parse(JSON.stringify(plan)) : null;
                    if (newEditedPlan) {
                      const updatedTasks = [...newEditedPlan.tasks, newTask.trim()];
                      if (updatedTasks.every(item => typeof item === 'string')) {
                        updatedPlan = { ...newEditedPlan, tasks: updatedTasks as string[] };
                      } else {
                        updatedPlan = {
                          ...newEditedPlan,
                          tasks: updatedTasks.map(item => typeof item === 'string' ? { descripcion: item } : item) as Task[]
                        };
                      }
                      setEditedPlan(updatedPlan);
                      saveTasksOnly(updatedPlan);
                    } else {
                      return;
                    }
                  } else {
                    const updatedTasks = [...editedPlan.tasks, newTask.trim()];
                    if (updatedTasks.every(item => typeof item === 'string')) {
                      updatedPlan = { ...editedPlan, tasks: updatedTasks as string[] };
                    } else {
                      updatedPlan = {
                        ...editedPlan,
                        tasks: updatedTasks.map(item => typeof item === 'string' ? { descripcion: item } : item) as Task[]
                      };
                    }
                    setEditedPlan(updatedPlan);
                    saveTasksOnly(updatedPlan);
                  }

                  scrollToBottom();
                  setNewTask("");
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-2 transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <Plus className="h-5 w-5" />
                Añadir Tarea
              </button>
            </div>
          </section>

          {/* Sección del Calendario */}
          <section className="p-6 rounded-lg border border-white/10 bg-black/20 mt-6">
            <h2 className="text-2xl font-semibold mb-4">Calendario del Proyecto</h2>
            <div className="space-y-4">
              <WeeklyCalendar
                events={calendarEvents}
                onEventMove={handleEventMove}
                onEventRemove={handleEventRemove}
                onCellClick={handleCellClick}
                onAddTask={handleAddCalendarTask}
                startHour={7}
                endHour={22}
                className="flex-1"
              />
            </div>
          </section>

          {/* Imagen final */}
          {plan.finalImageUrl && (
            <section className="p-6 rounded-lg border border-white/10 bg-black/20 mt-6">
              <h2 className="text-2xl font-semibold mb-4">Imagen del Proyecto</h2>
              <img
                src={plan.finalImageUrl}
                alt="Imagen del proyecto"
                className="rounded-lg border border-white/10 w-full max-w-2xl"
              />
            </section>
          )}
        </main>
      </div>

      {/* Product modal (from code1) */}
      <ProductCheckModal
        isOpen={productModalOpen}
        onOpenChange={setProductModalOpen}
        onSave={handleProductSave}
      />

      {/* Modal de delegación */}
      <Dialog open={delegateModalOpen} onOpenChange={setDelegateModalOpen}>
        <DialogContent className="sm:max-w-md bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Delegar Tarea</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm font-medium text-gray-200">Tarea a delegar:</Label>
              <p className="text-gray-300 bg-gray-800 p-2 rounded-md mt-1">
                {typeof selectedTaskForDelegate === 'string'
                  ? selectedTaskForDelegate
                  : selectedTaskForDelegate.descripcion}
              </p>
            </div>

            <div>
              <Label htmlFor="technologies" className="text-sm font-medium text-gray-200">
                Lista de tecnologías requeridas
              </Label>
              <Textarea
                id="technologies"
                placeholder="React, Node.js, MongoDB, etc."
                value={delegateForm.technologies}
                onChange={(e) => setDelegateForm(prev => ({ ...prev, technologies: e.target.value }))}
                className="mt-1 bg-gray-800 border-gray-600 text-white placeholder:text-gray-400"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="level" className="text-sm font-medium text-gray-200">
                Nivel requerido
              </Label>
              <Select
                value={delegateForm.level}
                onValueChange={(value) => setDelegateForm(prev => ({ ...prev, level: value }))}
              >
                <SelectTrigger className="mt-1 bg-gray-800 border-gray-600 text-white">
                  <SelectValue placeholder="Selecciona el nivel" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-600">
                  <SelectItem value="1" className="text-white hover:bg-gray-700">1</SelectItem>
                  <SelectItem value="2" className="text-white hover:bg-gray-700">2</SelectItem>
                  <SelectItem value="3" className="text-white hover:bg-gray-700">3</SelectItem>
                  <SelectItem value="4" className="text-white hover:bg-gray-700">4</SelectItem>
                  <SelectItem value="5" className="text-white hover:bg-gray-700">5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Mensaje de feedback */}
          {delegateMessage && (
            <div className="mb-4">
              <p className="text-sm text-center">{delegateMessage}</p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              onClick={handleDelegateSubmit}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={!delegateForm.technologies.trim() || !delegateForm.level || isDelegating}
            >
              {isDelegating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Delegando...
                </>
              ) : (
                "Delegar Tarea"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
