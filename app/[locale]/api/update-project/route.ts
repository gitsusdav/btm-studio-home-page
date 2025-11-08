import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function supabase() {
  const cookieStore = await cookies();
  return createRouteHandlerClient({ cookies: () => cookieStore });
}

export async function POST(req: Request) {
  try {
    const supabaseClient = await supabase();

    // Obtener sesión y usuario actual
    const {
      data: { session },
      error: sessionError,
    } = await supabaseClient.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json(
        {
          error:
            "No autorizado. Debes iniciar sesión para actualizar proyectos.",
        },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const {
      projectId,
      projectContext,
      tasks,
      finalImageUrl,
      timestamp,
    } = await req.json();

    if (!projectId) {
      return NextResponse.json(
        { error: "ID del proyecto es requerido." },
        { status: 400 }
      );
    }

    if (
      !projectContext ||
      typeof projectContext.description !== "string" ||
      typeof projectContext.stylePrompt !== "string" ||
      typeof projectContext.type !== "string" ||
      typeof projectContext.utility !== "string" ||
      typeof projectContext.palette !== "string"
    ) {
      return NextResponse.json(
        {
          error:
            "Datos inválidos. Se requieren datos válidos del contexto del proyecto.",
        },
        { status: 400 }
      );
    }

    // Verificar que el usuario es propietario del proyecto
    const { data: existingProject, error: fetchError } = await supabaseClient
      .from("proyectos")
      .select("user_id")
      .eq("id", projectId)
      .single();

    if (fetchError || !existingProject) {
      return NextResponse.json(
        { error: "Proyecto no encontrado." },
        { status: 404 }
      );
    }

    if (existingProject.user_id !== userId) {
      return NextResponse.json(
        { error: "No tienes permisos para actualizar este proyecto." },
        { status: 403 }
      );
    }

    // Actualizar el proyecto
    const { error: projectError } = await supabaseClient
      .from("proyectos")
      .update({
        nombre: projectContext.description,
        description: projectContext.description,
        style_prompt: projectContext.stylePrompt,
        type: projectContext.type,
        utility: projectContext.utility,
        palette: projectContext.palette,
        colors: projectContext.colors,
        imagen_url: finalImageUrl,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      })
      .eq("id", projectId);

    if (projectError) {
      console.error("Error actualizando proyecto:", projectError);
      return NextResponse.json(
        { error: projectError.message },
        { status: 400 }
      );
    }

    // Eliminar tareas existentes
    const { error: deleteTasksError } = await supabaseClient
      .from("tareas")
      .delete()
      .eq("proyecto_id", projectId);

    if (deleteTasksError) {
      console.error("Error eliminando tareas existentes:", deleteTasksError);
      return NextResponse.json(
        { error: deleteTasksError.message },
        { status: 400 }
      );
    }

    // Insertar nuevas tareas
    if (tasks && tasks.length > 0) {
      const tasksToInsert = tasks.map((task: any) => {
        if (typeof task === "string") {
          return {
            descripcion: task,
            proyecto_id: projectId,
            estado: "pendiente",
          };
        } else {
          // Extraer el texto de la tarea de diferentes posibles propiedades
          const descripcion = task.descripcion || task.text || task.title || JSON.stringify(task);
          return {
            descripcion: descripcion,
            proyecto_id: projectId,
            estado: task.estado || "pendiente",
          };
        }
      });

      const { error: tasksError } = await supabaseClient
        .from("tareas")
        .insert(tasksToInsert);

      if (tasksError) {
        console.error("Error insertando nuevas tareas:", tasksError);
        return NextResponse.json({ error: tasksError.message }, { status: 400 });
      }
    }

    return NextResponse.json(
      { message: "Proyecto actualizado con éxito", projectId },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Un error desconocido ocurrió.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}