"use client";

import * as React from "react";
import Link from "next/link";
import { Pencil, Lock, Unlock, Loader2, Save, X, Plus, Trash2 } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import ProductCheckModal from "@/app/components/showInputProducto";

const supabaseClient = createClientComponentClient();

type ProjectContext = {
  description: string;
  stylePrompt: string;
  type: string;
  utility: string;
  palette: string;
  colors: string[] | null;
};

type Plan = {
  projectId?: string;
  tasks: string[];
  projectContext: ProjectContext;
  finalImageUrl: string | null;
  timestamp: string;
};

const Button = ({
  children,
  onClick,
  disabled,
  variant = "default",
  size = "default",
  className = "",
  style,
  ...props
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "outline" | "destructive";
  size?: "default" | "sm";
  className?: string;
  style?: React.CSSProperties;
  [key: string]: any;
}) => {
  const baseStyles =
    "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50";

  const sizeStyles = {
    default: "px-4 py-2 text-sm",
    sm: "px-3 py-1.5 text-xs",
  };

  const variantStyles = {
    default: "bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-600",
    outline:
      "border border-gray-600 hover:border-gray-400 text-white hover:bg-gray-800 disabled:border-gray-700 disabled:text-gray-500",
    destructive:
      "bg-red-600 hover:bg-red-700 text-white disabled:bg-gray-600",
  };

  const buttonStyles = `${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`;

  return (
    <button
      className={buttonStyles}
      onClick={onClick}
      disabled={disabled}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
};

export default function ProjectPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isPublic, setIsPublic] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editedPlan, setEditedPlan] = React.useState<Plan | null>(null);
  const [newTask, setNewTask] = React.useState("");
  const router = useRouter();

  const visibilityKey = `project-${id}-visibility`;

  // Función segura para leer localStorage
  const safeLocalGet = (key: string) => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  };

  const safeLocalSet = (key: string, value: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, value);
    }
  };

  React.useEffect(() => {
    const stored = safeLocalGet(visibilityKey);
    if (stored !== null) {
      setIsPublic(stored === "public");
    }
  }, [id]);

  // Guardar tras elegir el “producto” y luego cambiar la visibilidad
  // (Eliminado duplicado de handleProductSave)

  // Modifica goPrivate para aceptar el producto
  const goPrivate = async (producto?: string) => {
    setIsLoading(true);

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();

      if (!session) {
        alert("Debes iniciar sesión para cambiar la visibilidad del proyecto.");
        setIsLoading(false);
        router.push("/login");
        return;
      }

      const raw = safeLocalGet("allProjectPlans");
      const plans: Plan[] = raw ? JSON.parse(raw) : [];

      const n = Number(id);
      let chosen: Plan | null = Number.isFinite(n) ? plans[n - 1] ?? null : null;

      if (!chosen) {
        chosen = plans.find((p) => p.projectId === id) ?? null;
      }

      if (!chosen?.projectContext) {
        alert("No se encontró el plan para guardar.");
        setIsLoading(false);
        return;
      }

      const newState = !isPublic;

      const response = await fetch("/api/create-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...chosen, publico: newState }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Error al guardar la visibilidad.");
        setIsLoading(false);
        return;
      }

      setIsPublic(newState);
      safeLocalSet(visibilityKey, newState ? "public" : "private");
    } catch (error) {
      console.error(error);
      alert("Error al cambiar visibilidad.");
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = () => {
    setEditedPlan(plan ? JSON.parse(JSON.stringify(plan)) : null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEditedPlan(null);
    setIsEditing(false);
  };

  const saveChanges = () => {
    if (!editedPlan) return;

    try {
      const raw = safeLocalGet("allProjectPlans");
      const plans: Plan[] = raw ? JSON.parse(raw) : [];

      const n = Number(id);
      let index = Number.isFinite(n) ? n - 1 : plans.findIndex((p) => p.projectId === id);

      if (index >= 0 && index < plans.length) {
        plans[index] = { ...editedPlan, timestamp: new Date().toISOString() };
        safeLocalSet("allProjectPlans", JSON.stringify(plans));
        setPlan(editedPlan);
        cancelEditing();
      }
    } catch (error) {
      console.error("Error guardando cambios:", error);
      alert("Error al guardar los cambios");
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

  const arrayUpdater = (key: keyof Plan | "projectContext.colors", index: number, value?: any, remove?: boolean) => {
    if (!editedPlan) return;
    setEditedPlan((prev) => {
      if (!prev) return prev;
      let updated = { ...prev };
      if (key === "tasks") {
        const arr = [...prev.tasks];
        if (remove) arr.splice(index, 1);
        else arr[index] = value;
        updated.tasks = arr;
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

  React.useEffect(() => {
    try {
      const raw = safeLocalGet("allProjectPlans");
      const plans: Plan[] = raw ? JSON.parse(raw) : [];

      const n = Number(id);
      let chosen: Plan | null = Number.isFinite(n) ? plans[n - 1] ?? null : null;

      if (!chosen) {
        chosen = plans.find((p) => p.projectId === id) ?? null;
      }

      setPlan(chosen);
    } catch (e) {
      console.error("Error reading localStorage", e);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

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
        <Button asChild>
          <Link href="/plan">Crear un nuevo plan</Link>
        </Button>
      </div>
    );
  }

  const currentPlan = isEditing ? editedPlan : plan;

 return (
  <div className="min-h-screen text-white pt-8 pb-16 px-4 sm:px-6 lg:px-8">
    <div className="container mx-auto max-w-4xl">
      <header className="mb-8">
        <div className="flex justify-between items-start mb-6">
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

          <Button
            onClick={goPrivate}
            variant="outline"
            disabled={isLoading}
            className="text-white px-4 py-2 font-semibold rounded-xl hover:bg-[rgba(198,198,199,1)] hover:brightness-110 transition-all duration-200"
            style={{
              background: `rgba(158, 158, 149, 0.2)`,
              border: "1px solid rgba(255, 255, 255, 0.08)",
              boxShadow:
                "2px 4px 4px rgba(0, 0, 0, 0.35), inset -1px 0px 2px rgba(201, 201, 201, 0.1), inset 5px -5px 12px rgba(255, 255, 255, 0.05), inset -5px 5px 12px rgba(255, 255, 255, 0.05)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              borderRadius: "20px",
            }}
          >
            {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : isPublic ? <Unlock className="h-4 w-4 mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
            {isPublic ? "Hacer Privado" : "Hacer Público"}
          </Button>
        </div>

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

          <p className="text-sm text-gray-400">Índice local: {id}</p>

          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button
                  onClick={saveChanges}
                  className="text-white px-4 py-2 font-semibold rounded-xl hover:bg-green-600/70 bg-green-600/50 border border-green-500/30"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Guardar
                </Button>
                <Button
                  onClick={cancelEditing}
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

      <main className="space-y-6">
        {/* Contexto */}
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
            <label className="block text-sm font-medium mb-2">Tipo:</label>
            {isEditing ? (
              <input
                type="text"
                value={currentPlan?.projectContext.type || ""}
                onChange={(e) =>
                  updateEditedPlan("projectContext.type", e.target.value)
                }
                className="w-full bg-black/30 border border-gray-600 focus:border-gray-400 rounded-lg px-3 py-2 text-white outline-none transition-colors"
              />
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
                                "#3B82F6", // Color azul por defecto
                              ],
                            },
                          }
                        : prev
                    )
                  }
                  size="sm"
                  variant="outline"
                  className="text-xs"
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
                        {/* Código de color arriba */}
                        <span className="text-xs font-mono text-gray-400 text-center">
                          {color.toUpperCase()}
                        </span>
                        
                        {/* Cuadrado de color grande */}
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
                        
                        {/* Botón X rojo cuadrado */}
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
                        {/* Código de color arriba */}
                        <span className="text-xs font-mono text-gray-300 text-center">
                          {color.toUpperCase()}
                        </span>
                        
                        {/* Vista solo lectura */}
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

        {/* Tareas */}


  {/* Lista de tareas editable SIEMPRE */}
  {/* Tareas */}
        <section className="p-6 rounded-xl border border-white/10 bg-black/30 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold">
                Lista de Tareas
              </h2>
            </div>
          </div>

          {/* Lista de tareas - SIEMPRE editable */}
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {(editedPlan?.tasks ?? plan?.tasks ?? []).length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400">No hay tareas. ¡Añade la primera!</p>
              </div>
            ) : (
              (editedPlan?.tasks ?? plan?.tasks ?? []).map((task, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-md border border-white/10 group hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-grow">
                    {/* Input de tarea editable */}
                    <input
                      type="text"
                      value={task}
                      onChange={(e) => {
                        if (!editedPlan) {
                          // Si no está en modo edición, inicializar editedPlan
                          setEditedPlan(plan ? JSON.parse(JSON.stringify(plan)) : null);
                          return;
                        }
                        const updatedTasks = [...editedPlan.tasks];
                        updatedTasks[i] = e.target.value;
                        setEditedPlan({ ...editedPlan, tasks: updatedTasks });
                      }}
                      className="flex-grow bg-transparent border-none outline-none text-gray-200 placeholder:text-gray-400 hover:bg-black/20 focus:bg-black/30 rounded px-2 py-1 transition-colors"
                      placeholder="Editar tarea..."
                    />
                  </div>

                  {/* Botones de acción */}
                  <div className="flex items-center space-x-1.5 flex-shrink-0">
                    {/* Botón editar */}
                    <button
                      onClick={() => {
                        // Focus en el input de la tarea
                        const taskInput = document.querySelector(`input[value="${task}"]`);
                      }}
                      className="h-8 w-8 flex items-center justify-center rounded-md bg-blue-600/20 text-blue-300 opacity-30 group-hover:opacity-100 transition-all duration-200 hover:bg-blue-600/30 hover:text-blue-200"
                      aria-label="Editar tarea"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    
                    {/* Botón eliminar */}
                    <button
                      onClick={() => {
                        if (!editedPlan) {
                          // Si no está en modo edición, inicializar editedPlan
                          const newEditedPlan = plan ? JSON.parse(JSON.stringify(plan)) : null;
                          if (newEditedPlan) {
                            const updatedTasks = [...newEditedPlan.tasks];
                            updatedTasks.splice(i, 1);
                            setEditedPlan({ ...newEditedPlan, tasks: updatedTasks });
                          }
                          return;
                        }
                        const updatedTasks = [...editedPlan.tasks];
                        updatedTasks.splice(i, 1);
                        setEditedPlan({ ...editedPlan, tasks: updatedTasks });
                      }}
                      className="h-8 w-8 flex items-center justify-center rounded-md bg-red-600/20 text-red-300 opacity-30 group-hover:opacity-100 transition-all duration-200 hover:bg-red-600/30 hover:text-red-200"
                      aria-label="Eliminar tarea"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Añadir nueva tarea */}
          <div className="mt-4 flex gap-2 pt-4 border-t border-white/10">
            <input
              type="text"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="Añadir nueva tarea manualmente..."
              className="flex-grow bg-white/5 border border-white/20 focus:ring-indigo-400 focus:ring-1 focus:border-indigo-400 placeholder:text-gray-400 text-gray-100 rounded-lg px-3 py-2 outline-none transition-colors"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTask.trim() !== "") {
                  if (!editedPlan) {
                    // Si no está en modo edición, inicializar editedPlan
                    const newEditedPlan = plan ? JSON.parse(JSON.stringify(plan)) : null;
                    if (newEditedPlan) {
                      setEditedPlan({ ...newEditedPlan, tasks: [...newEditedPlan.tasks, newTask.trim()] });
                    }
                  } else {
                    setEditedPlan({ ...editedPlan, tasks: [...editedPlan.tasks, newTask.trim()] });
                  }
                  setNewTask("");
                }
              }}
            />
            <button
              onClick={() => {
                if (newTask.trim() === "") return;
                if (!editedPlan) {
                  // Si no está en modo edición, inicializar editedPlan
                  const newEditedPlan = plan ? JSON.parse(JSON.stringify(plan)) : null;
                  if (newEditedPlan) {
                    setEditedPlan({ ...newEditedPlan, tasks: [...newEditedPlan.tasks, newTask.trim()] });
                  }
                } else {
                  setEditedPlan({ ...editedPlan, tasks: [...editedPlan.tasks, newTask.trim()] });
                }
                setNewTask("");
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg px-4 py-2 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="h-5 w-5" />
              Añadir Tarea
            </button>
          </div>
        </section>


        {/* Imagen */}
        {plan.finalImageUrl && (
          <section className="p-6 rounded-lg border border-white/10 bg-black/20">
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
  </div>
);
}
