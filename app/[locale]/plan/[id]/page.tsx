"use client"

import { useState, useEffect, useId, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"

import { IntegratedCalendar, CalendarOnlyTask } from "../../../components/calendario_plan";
import {
  Edit2Icon,
  CheckIcon,
  PlusIcon,
  Trash2Icon,
  PlayIcon,
  SparklesIcon,
  ImageIcon,
  Loader2,
  RefreshCwIcon,
  FileEditIcon,
  XIcon,
  Save,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { generateSingleTaskAction, enhanceSummaryAction, generateImageAction } from "@/app/actions/openai-actions"
import { cn } from "@/lib/utils"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

// ✅ Una sola interfaz Task (la más completa)
interface Task {
  id: string;
  title?: string;
  text?: string;
  description?: string;
  isManual?: boolean;
  completed: boolean;
}

interface ProjectContext {
  description: string;
  stylePrompt: string;
  type: string;
  utility: string;
  palette: string;
  colors: string[] | null; 
}

interface PlanData {
  tasks: Task[];
  projectContext: ProjectContext;
  suggestionId?: string;
}

export default function PlanPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [currentProjectContext, setCurrentProjectContext] = useState<ProjectContext | null>(null)
  const [suggestionId, setSuggestionId] = useState<string | undefined>(undefined)
  const [newTaskText, setNewTaskText] = useState("")
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTaskText, setEditingTaskText] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isGeneratingTask, setIsGeneratingTask] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // State for new features
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [imageGenerationCount, setImageGenerationCount] = useState(0)
  const [isEditingSummary, setIsEditingSummary] = useState(false)
  const [editableDescription, setEditableDescription] = useState("")
  const [editableStylePrompt, setEditableStylePrompt] = useState("")
  const [isEnhancingSummary, setIsEnhancingSummary] = useState(false)
  const [finalImageUrl, setFinalImageUrl] = useState<string | null>(null)

  // State for submission
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // State for calendar positions and tasks
  const [calendarPositions, setCalendarPositions] = useState<Record<string, { dayIndex: number; startHour: number }>>({})
  const [calendarOnlyTasks, setCalendarOnlyTasks] = useState<CalendarOnlyTask[]>([])

  const uniqueIdBase = useId()
  const router = useRouter()
  const params = useParams()
  const supabase = createClientComponentClient()
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const justAddedTaskId = useRef<string | null>(null)

  // Función para buscar proyecto en Supabase por producto o ID numérico
  const fetchProjectFromSupabase = async (identifier: string) => {
    try {
      // Intentar convertir a número para verificar si es un ID numérico
      const numericId = parseInt(identifier, 10)
      const isNumericId = !isNaN(numericId) && numericId.toString() === identifier
      
      let query = supabase
        .from('proyectos')
        .select(`
          *,
          tareas (*)
        `)

      // Si es un ID numérico, buscar por ID, sino por campo producto
      if (isNumericId) {
        query = query.eq('id', numericId)
      } else {
        query = query.eq('producto', identifier)
      }

      const { data, error } = await query.single()

      if (error) {
        console.error('Error fetching project from Supabase:', error)
        return null
      }

      // Verificar si el proyecto debe mostrarse (solo si es público o si no tiene campo público definido)
      if (data.publico === false) {
        console.warn(`Proyecto ${identifier} es privado y no se puede mostrar`)
        return null
      }

      return data
    } catch (e) {
      console.error('Error in fetchProjectFromSupabase:', e)
      return null
    }
  }

  // ✅ useEffect corregido para manejar ambos formatos y búsqueda en Supabase
  useEffect(() => {
    const loadProjectData = async () => {
      // Limpiar el loading global cuando la página esté lista
      const clearLoadingWhenReady = () => {
        // Delay mínimo para mostrar el spinner, luego limpiar cuando esté listo
        setTimeout(() => {
          sessionStorage.removeItem("projectLoading")
          window.dispatchEvent(new Event("projectLoadingChange"))
        }, 1000) // Reducido a 1 segundo
      }

      try {
        // Obtener el parámetro dinámico 'id' de la URL
        const urlIdentifier = params.id as string
        
        if (urlIdentifier && urlIdentifier !== 'session') {
          // Si hay ID en URL y no es 'session', buscar en Supabase (puede ser ID numérico o campo producto)
          const supabaseProject = await fetchProjectFromSupabase(urlIdentifier)
          
          if (supabaseProject) {
            // Convertir datos de Supabase al formato esperado
            const projectContext: ProjectContext = {
              description: supabaseProject.description || supabaseProject.nombre || '',
              stylePrompt: supabaseProject.style_prompt || '',
              type: supabaseProject.type || '',
              utility: supabaseProject.utility || '',
              palette: supabaseProject.palette || '',
              colors: supabaseProject.colors || null
            }

            // Convertir tareas de Supabase al formato esperado
            const processedTasks: Task[] = (supabaseProject.tareas || []).map((tarea: any, index: number) => ({
              id: `supabase-task-${tarea.id}`,
              text: tarea.descripcion || '',
              title: tarea.descripcion || '',
              completed: tarea.estado === 'completado',
              isManual: false
            }))

            setTasks(processedTasks)
            setCurrentProjectContext(projectContext)
            setEditableDescription(projectContext.description)
            setEditableStylePrompt(projectContext.stylePrompt)
            
            if (supabaseProject.imagen_url) {
              setFinalImageUrl(supabaseProject.imagen_url)
              setGeneratedImageUrl(supabaseProject.imagen_url)
            }
            
            setIsLoading(false)
            clearLoadingWhenReady()
            return
          } else {
            setError(`No se encontró el proyecto con ID: ${urlIdentifier} o el proyecto es privado`)
            setIsLoading(false)
            clearLoadingWhenReady()
            return
          }
        }

        // Si no hay ID en URL o es 'session', cargar desde sessionStorage (comportamiento original)
        const storedData = sessionStorage.getItem("projectPlanData")
        console.log(storedData)
        if (storedData) {
          const parsedData: PlanData = JSON.parse(storedData)
          
          // Procesar las tareas para manejar ambos formatos
          const processedTasks = parsedData.tasks.map((task, index) => {
            if (typeof task === 'string') {
              // Si es string (formato viejo)
              const cleanTask = (task as string)
                .trim()
                .replace(/^["'\s]*|["',\s]*$/g, "");
              
              return {
                id: `${uniqueIdBase}-task-${index}`,
                text: cleanTask,
                completed: false,
              }
            } else {
              // Si es objeto Task (formato nuevo)
              return {
                id: task.id || `${uniqueIdBase}-task-${index}`,
                text: task.title || task.text || '',
                title: task.title || task.text || '',
                description: task.description || '',
                isManual: task.isManual || false,
                completed: task.completed || false,
              }
            }
          }).filter(task => task.text && task.text !== "[" && task.text !== "]");

          setTasks(processedTasks)
          setCurrentProjectContext(parsedData.projectContext)
          if (parsedData.projectContext) {
            setEditableDescription(parsedData.projectContext.description)
            setEditableStylePrompt(parsedData.projectContext.stylePrompt)
          }
          setSuggestionId(parsedData.suggestionId)
        } else {
          setError("No se encontraron datos del plan. Por favor, inicia un nuevo proyecto.")
        }
      } catch (e) {
        console.error("Error loading plan data:", e)
        setError("Error al cargar los datos del plan. Intenta de nuevo.")
      } finally {
        setIsLoading(false)
        // Limpiar el loading global cuando la carga esté completa
        clearLoadingWhenReady()
      }
    }

    loadProjectData()
  }, [uniqueIdBase, params, supabase])

  useEffect(() => {
    if (justAddedTaskId.current && scrollAreaRef.current) {
      const taskElement = document.getElementById(justAddedTaskId.current)
      if (taskElement) {
        taskElement.scrollIntoView({ behavior: "smooth", block: "end" })
      }
      justAddedTaskId.current = null
    }
  }, [tasks])

  const updateSessionStorageProjectContext = (updatedContext: ProjectContext) => {
    const storedData = sessionStorage.getItem("projectPlanData")
    if (storedData) {
      try {
        const parsedData: PlanData = JSON.parse(storedData)
        const newPlanData = { ...parsedData, projectContext: updatedContext }
        sessionStorage.setItem("projectPlanData", JSON.stringify(newPlanData))
      } catch (e) {
        console.error("Error updating sessionStorage:", e)
      }
    }
  }

  const handleAddTask = (taskText: string, shouldScroll: boolean = true) => {
    if (taskText.trim() === "") return
    const newId = `${uniqueIdBase}-task-${tasks.length}-${Date.now()}`
    const newTask: Task = {
      id: newId,
      text: taskText.trim(),
      title: taskText.trim(),
      completed: false
    }
    setTasks((prevTasks) => [...prevTasks, newTask])
    if (shouldScroll) {
      justAddedTaskId.current = newId
    }
    return newTask
  }

  const handleManualAddTask = () => {
    handleAddTask(newTaskText)
    setNewTaskText("")
  }

  const handleGenerateSingleTask = async (shouldScroll: boolean = true) => {
    if (!currentProjectContext) return
    setIsGeneratingTask(true)
    const result = await generateSingleTaskAction(
      currentProjectContext.description,
      currentProjectContext.stylePrompt,
      tasks.map((t) => t.text || t.title || ''),
    )
    if (result.task) {
      handleAddTask(result.task, shouldScroll)
    } else if (result.error) {
      console.error(result.error)
    }
    setIsGeneratingTask(false)
  }

  const toggleTaskCompletion = (id: string) => {
    setTasks(tasks.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task)))
  }

  const handleDeleteTask = (id: string) => {
    setTasks(tasks.filter((task) => task.id !== id))
  }

  const handleStartEditTask = (task: Task) => {
    setEditingTaskId(task.id)
    setEditingTaskText(task.text || task.title || '')
  }

  const handleSaveEditTask = (id: string) => {
    if (editingTaskText.trim() === "") {
      handleDeleteTask(id)
    } else {
      setTasks(tasks.map((task) => (
        task.id === id 
          ? { ...task, text: editingTaskText.trim(), title: editingTaskText.trim() } 
          : task
      )))
    }
    setEditingTaskId(null)
    setEditingTaskText("")
  }

  const handleFinalizePlan = async () => {
    if (!currentProjectContext || tasks.length === 0) {
      setSubmitError("No hay suficiente información para crear el proyecto. Añade una descripción y tareas.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    // Guardar las tareas con sus IDs para poder sincronizar con el calendario
    const taskList = tasks.map((task) => ({
      id: task.id,
      text: task.text || task.title || '',
      title: task.title || task.text || '',
      description: task.description,
      completed: task.completed
    }));
    const projectName = currentProjectContext.description;

    const newPlan = {
      tasks: taskList,
      projectContext: {
        description: currentProjectContext.description,
        stylePrompt: currentProjectContext.stylePrompt,
        type: currentProjectContext.type,
        utility: currentProjectContext.utility,
        palette: currentProjectContext.palette,
        colors: currentProjectContext.colors
      },
      finalImageUrl: finalImageUrl || null,
      timestamp: new Date().toISOString(),
      calendarPositions: calendarPositions,
      calendarOnlyTasks: calendarOnlyTasks,
    };

    console.log(newPlan)

    var newID = 0;
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("allProjectPlans") : null;
      const existingPlans: any[] = raw ? JSON.parse(raw) : [];
      const existingCount = existingPlans.length;
      newID = existingCount !== 0 ? existingCount + 1 : 1;

      const updatedPlans = [...existingPlans, newPlan];
      if (typeof window !== "undefined") {
        window.localStorage.setItem("allProjectPlans", JSON.stringify(updatedPlans));
      }
    } catch (error) {
      console.error("Error guardando en localStorage:", error);
      setSubmitError("Ocurrió un error al guardar localmente el proyecto.");
      setIsSubmitting(false);
      return;
    }

    console.log("Plan guardado localmente:", newPlan, newID);

    // Pequeño delay para mostrar el estado de carga antes de navegar
    await new Promise(resolve => setTimeout(resolve, 500));

    router.push(`/proyectos/${newID}`);
    setIsSubmitting(false);
  };

  const [imageGenerationError, setImageGenerationError] = useState<string | null>(null);

  const handleGenerateImage = async () => {
    if (!currentProjectContext) return;
    setIsGeneratingImage(true);
    setGeneratedImageUrl(null);
    setImageGenerationError(null);

    const result = await generateImageAction(
      currentProjectContext.description,
      currentProjectContext.stylePrompt
    );

    if (result.imageUrl) {
      setGeneratedImageUrl(result.imageUrl);
      setFinalImageUrl(result.imageUrl);
    } else {
      setImageGenerationError(result.error || "Ocurrió un error desconocido al generar la imagen.");
    }

    setIsGeneratingImage(false);
  };

  const handleToggleEditSummary = () => {
    if (!isEditingSummary && currentProjectContext) {
      setEditableDescription(currentProjectContext.description)
      setEditableStylePrompt(currentProjectContext.stylePrompt)
    }
    setIsEditingSummary(!isEditingSummary)
  }

 const handleSaveSummary = () => {
  if (!currentProjectContext) return;

  const updatedContext = {
    ...currentProjectContext, // conservar propiedades existentes
    description: editableDescription ?? currentProjectContext.description,
    stylePrompt: editableStylePrompt ?? currentProjectContext.stylePrompt,
  };

  setCurrentProjectContext(updatedContext);
  updateSessionStorageProjectContext(updatedContext);
  setIsEditingSummary(false);
};


  const handleEnhanceSummaryWithAI = async () => {
    if (!currentProjectContext) return
    setIsEnhancingSummary(true)
    const result = await enhanceSummaryAction(currentProjectContext.description, currentProjectContext.stylePrompt)
    if (result.enhancedDescription) {
      const updatedContext = {
        ...currentProjectContext,
        description: result.enhancedDescription,
      }
      setCurrentProjectContext(updatedContext)
      setEditableDescription(result.enhancedDescription)
      updateSessionStorageProjectContext(updatedContext)
    } else if (result.error) {
      console.error(result.error)
    }
    setIsEnhancingSummary(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-100">
        <p>Cargando plan del proyecto...</p>
      </div>
    )
  }

  if (error || !currentProjectContext) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center px-4 text-gray-100">
        <h1 className="text-2xl font-bold mb-4">Error</h1>
        <p className="mb-6">{error || "No se pudo cargar el contexto del proyecto."}</p>

        <Button
          asChild                
          className="text-white px-4 py-2 font-semibold rounded-xl hover:bg-[rgba(158,158,149,0.7)] hover:brightness-110 transition-all duration-200"
          style={{
            background: 'rgba(158, 158, 149, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow:
              '2px 4px 4px rgba(0, 0, 0, 0.35), inset -1px 0px 2px rgba(201, 201, 201, 0.1), inset 5px -5px 12px rgba(255, 255, 255, 0.05), inset -5px 5px 12px rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            borderRadius: '20px',
          }}
        >
          <Link href="/">⬅ Volver al Inicio</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col text-gray-100 pt-8 pb-16 px-4 sm:px-6 lg:px-8">
      {/* El resto del JSX permanece igual... */}
      <header className="mb-8">
        <div className="container mx-auto max-w-5xl">
        <Link href="/">
        <Button
          className="text-white px-4 py-2 font-semibold rounded-xl hover:bg-[rgba(158,158,149,0.7)] hover:brightness-110 transition-all duration-200"
          style={{
            background: `rgba(158, 158, 149, 0.2)`,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow:
              '2px 4px 4px rgba(0, 0, 0, 0.35), inset -1px 0px 2px rgba(201, 201, 201, 0.1), inset 5px -5px 12px rgba(255, 255, 255, 0.05), inset -5px 5px 12px rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            borderRadius: '20px',
          }}
        >
          ⬅ Volver al Inicio
        </Button>
        </Link>
          <h1 className="text-3xl sm:text-4xl font-bold text-center text-gray-50 mb-3">Plan de Proyecto</h1>
          <p className="text-center text-gray-300 max-w-2xl mx-auto mb-6">
            Revisa, edita y añade tareas para definir el alcance de tu proyecto.
          </p>

          {/* Enhanced Project Summary Section */}
          <div
            className="p-4 sm:p-6 rounded-lg border border-white/10"
            style={{
              background: "rgba(40, 40, 38, 0.7)",
              backdropFilter: "blur(5px)",
              WebkitBackdropFilter: "blur(5px)",
            }}
          >
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-semibold text-gray-100">Resumen del Proyecto</h2>
              <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleEditSummary}
                className="text-xs text-white font-semibold px-3 py-1 rounded-xl border border-white/10 bg-white/10 hover:bg-gray-700 hover:text-white transition-all"
                style={{
                  boxShadow:
                    '2px 4px 4px rgba(0, 0, 0, 0.35), inset -1px 0px 2px rgba(201, 201, 201, 0.1), inset 5px -5px 12px rgba(255, 255, 255, 0.05), inset -5px 5px 12px rgba(255, 255, 255, 0.05)',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                  borderRadius: '20px',
                }}
                disabled={isEnhancingSummary}
              >
                {isEditingSummary ? <XIcon className="h-4 w-4 mr-1" /> : <FileEditIcon className="h-4 w-4 mr-1" />}
                {isEditingSummary ? "Cancelar" : "Editar"}
              </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEnhanceSummaryWithAI}
                  style={{
                    boxShadow:
                      '2px 4px 4px rgba(0, 0, 0, 0.35), inset -1px 0px 2px rgba(201, 201, 201, 0.1), inset 5px -5px 12px rgba(255, 255, 255, 0.05), inset -5px 5px 12px rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                    borderRadius: '20px',
                  }}
                  className="text-xs bg-purple-600/30 border-purple-500/70 text-purple-300 hover:bg-purple-600/10 hover:text-purple-200"
                  disabled={isEditingSummary || isEnhancingSummary}
                >
                  <SparklesIcon className={cn("h-4 w-4 mr-1", isEnhancingSummary && "animate-pulse")} />
                  {isEnhancingSummary ? "Mejorando..." : "Ideas IA"}
                </Button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 items-start">
              {/* Textual Summary and Edit Fields */}
              <div className="space-y-3">
                {isEditingSummary ? (
                  <>
                    <div>
                      <label htmlFor="editDesc" className="block text-xs font-medium text-gray-300 mb-1">
                        Descripción del Proyecto:
                      </label>
                      <Textarea
                        id="editDesc"
                        value={editableDescription}
                        onChange={(e) => setEditableDescription(e.target.value)}
                        rows={5}
                        className="w-full bg-white/10 border-white/20 text-sm p-2 focus:ring-gray-400 text-gray-100"
                      />
                    </div>
                    <div>
                      <label htmlFor="editStyle" className="block text-xs font-medium text-gray-300 mb-1">
                        Estilo de Inspiración (Prompt):
                      </label>
                      <Textarea
                        id="editStyle"
                        value={editableStylePrompt}
                        onChange={(e) => setEditableStylePrompt(e.target.value)}
                        rows={3}
                        className="w-full bg-white/10 border-white/20 text-sm p-2 focus:ring-gray-400 text-gray-100"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={handleSaveSummary}
                      className="bg-green-500 hover:bg-green-600 text-white"
                    >
                      Guardar Cambios
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-300">
                      <strong className="text-gray-200">Descripción:</strong> {currentProjectContext.description}
                    </p>
                    <p className="text-sm text-gray-300">
                      <strong className="text-gray-200">Estilo:</strong> {currentProjectContext.stylePrompt}
                    </p>
                  </>
                )}
              </div>

              {/* Image Generation Area */}
              <div className="flex flex-col items-center justify-center space-y-2 p-3 border border-white/10 rounded-md bg-black/20 min-h-[200px]">
                {isGeneratingImage ? (
                  <div className="flex flex-col items-center justify-center text-gray-300">
                    <Loader2 className="h-12 w-12 animate-spin text-purple-400 mb-2" />
                    <p className="text-sm">Generando imagen del resumen...</p>
                  </div>
                ) : generatedImageUrl ? (
                  <Image
                    src={generatedImageUrl || "/placeholder.svg"}
                    alt="Visualización del resumen del proyecto"
                    width={300}
                    height={200}
                    className="rounded-md object-cover shadow-lg"
                  />
                ) : (
                  <p className="text-sm text-gray-400 text-center">
                    Haz clic en "Generar Imagen" para visualizar tu resumen.
                  </p>
                )}
                {imageGenerationError && (
                  <p className="text-xs text-red-400 text-center mt-2">{imageGenerationError}</p>
                )}
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage || isEditingSummary}
                    className="text-xs bg-cyan-600/30  border-cyan-600/30 text-cyan-300 hover:bg-cyan-500/10 hover:text-cyan-200"
                  >
                    <ImageIcon className="h-4 w-4 mr-1" />
                    {generatedImageUrl ? "Re-generar" : "Generar Imagen"}
                  </Button>
                  {generatedImageUrl && !isGeneratingImage && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateImage}
                      className="text-xs bg-gray-700 border-gray-500 text-gray-300 hover:bg-gray-500 hover:text-white"
                    >
                      <RefreshCwIcon className="h-4 w-4 mr-1" />
                      Más
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto max-w-5xl">
        <div
          className="p-4 sm:p-6 rounded-lg border border-white/10 w-full"
          style={{
            background: "rgba(30, 30, 28, 0.8)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <h3 className="text-2xl font-semibold text-gray-100 mb-4">Lista de Tareas Sugeridas</h3>
          <ScrollArea className="h-[calc(100vh-650px)] min-h-[250px] pr-3 custom-scrollbar mb-4" ref={scrollAreaRef}>
            {tasks.length === 0 ? (
              <p className="text-gray-400 text-center py-4">No hay tareas. ¡Añade la primera!</p>
            ) : (
              <ul className="space-y-2.5">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    id={task.id}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-md border border-white/10 group"
                  >
                    <div className="flex items-center gap-3 flex-grow">
                      <Checkbox
                        id={`task-check-${task.id}`}
                        checked={task.completed}
                        onCheckedChange={() => toggleTaskCompletion(task.id)}
                        className="border-gray-500 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-400"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-green-400"
                        aria-label="Iniciar tarea"
                      >
                        <PlayIcon className="h-4 w-4" />
                      </Button>
                      {editingTaskId === task.id ? (
                        <Textarea
                          value={editingTaskText}
                          onChange={(e) => setEditingTaskText(e.target.value)}
                          rows={1}
                          autoFocus
                          className="flex-grow mr-2 bg-white/10 border-white/20 text-sm py-1.5 px-2.5 focus:ring-gray-400 text-gray-100"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault()
                              handleSaveEditTask(task.id)
                            } else if (e.key === "Escape") {
                              setEditingTaskId(null)
                            }
                          }}
                          onBlur={() => {
                            if (editingTaskId === task.id) handleSaveEditTask(task.id)
                          }}
                        />
                      ) : (
                        <span
                          className={`text-sm flex-grow mr-2 cursor-pointer ${
                            task.completed ? "text-gray-500 line-through" : "text-gray-200"
                          }`}
                          onClick={() => handleStartEditTask(task)}
                        >
                          {task.text || task.title}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      {editingTaskId === task.id ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleSaveEditTask(task.id)}
                          className="h-7 w-7 bg-green-400/20 text-green-300 hover:bg-transparent hover:text-green-400"
                          aria-label="Guardar tarea"
                        >
                          <CheckIcon className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStartEditTask(task)}
                          className="h-7 w-7 bg-blue-400/20 text-blue-300 opacity-30 group-hover:opacity-100 transition-opacity hover:bg-transparent hover:text-blue-400"
                          aria-label="Editar tarea"
                        >
                          <Edit2Icon className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteTask(task.id)}
                        className="h-7 w-7 bg-red-400/20 text-red-300 opacity-30 group-hover:opacity-100 transition-opacity hover:bg-transparent hover:text-red-400"
                        aria-label="Eliminar tarea"
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
          <div className="mt-4 flex flex-col sm:flex-row gap-2 pt-4 border-t border-white/10">
            <Input
              type="text"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              placeholder="Añadir nueva tarea manualmente..."
              className="flex-grow bg-white/5 border-white/20 focus:ring-gray-400 placeholder:text-gray-400 text-gray-100"
              onKeyDown={(e) => e.key === "Enter" && handleManualAddTask()}
            />
            <Button onClick={handleManualAddTask} className="bg-blue-500 hover:bg-blue-600 text-white w-full sm:w-auto">
              <PlusIcon className="h-4 w-4 mr-1.5" /> Añadir Tarea
            </Button>
            <Button
              onClick={handleGenerateSingleTask}
              className="bg-[rgba(0,0,0,0.4)] text-white hover:bg-[rgba(0,0,0,0.6)] focus-visible:ring-gray-400 w-full sm:w-auto"
              disabled={isGeneratingTask}
            >
              {isGeneratingTask ? (
                <SparklesIcon className="h-4 w-4 mr-1.5 animate-pulse" />
              ) : (
                <SparklesIcon className="h-4 w-4 mr-1.5" />
              )}
              Sugerir Tarea
            </Button>
          </div>
        </div>
<br/>
        <section className="flex-grow container mx-auto max-w-5xl">
        <div
          className="p-4 sm:p-6 rounded-lg border border-white/10 w-full"
          style={{
            background: "rgba(30, 30, 28, 0.8)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >

            <IntegratedCalendar
              tasks={tasks}
              onTaskMove={(taskId: string, dayIndex: number) => {
                // Update task when moved in calendar
                console.log(`Task ${taskId} moved to day ${dayIndex}`);
              }}
              onTaskRemove={(taskId: string) => {
                // Remove task when deleted from calendar
                handleDeleteTask(taskId);
              }}
              onSuggestTask={() => handleGenerateSingleTask(false)}
              onPositionsChange={(positions) => {
                setCalendarPositions(positions);
              }}
              onCalendarTasksChange={(calendarTasks) => {
                setCalendarOnlyTasks(calendarTasks);
              }}
              initialPositions={calendarPositions}
              initialCalendarTasks={calendarOnlyTasks}
            />
          </div>
</section>

      </main>


      <footer className="mt-12 container mx-auto max-w-5xl text-center">
        <div className="flex flex-col items-center">
            <Button 
                onClick={handleFinalizePlan} 
                size="lg" 
                className="bg-green-500 hover:bg-green-600 text-white px-8 w-full sm:w-auto"
                disabled={isSubmitting}
            >
            {isSubmitting ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
                <Save className="h-5 w-5 mr-2" />
            )}
            {isSubmitting ? "Guardando..." : "Finalizar y Guardar Plan"}
            </Button>
            {submitError && (
                <p className="text-sm text-red-400 mt-4">{submitError}</p>
            )}
        </div>
      </footer>
    </div>
  )
}