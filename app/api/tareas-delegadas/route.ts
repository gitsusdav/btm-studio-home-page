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
          error: "No autorizado. Debes iniciar sesión para delegar tareas.",
        },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const {
      tipo_tarea,
      nivel,
      tecnologias,
      descripcion,
      proyecto_id,
      tarea_id,
    } = await req.json();

    // Validar datos requeridos
    if (!tipo_tarea || !nivel || !descripcion) {
      return NextResponse.json(
        {
          error: "Datos incompletos. Se requiere descripción, nivel y tipo de tarea.",
        },
        { status: 400 }
      );
    }

    // Convertir tecnologias a array si es string
    let tecnologiasArray = tecnologias;
    if (typeof tecnologias === 'string') {
      tecnologiasArray = tecnologias.split(',').map((tech: string) => tech.trim()).filter(Boolean);
    }

    // Buscar el usuario en la tabla usuario usando el user_id de auth
    const { data: userData, error: userError } = await supabaseClient
      .from("usuario")
      .select("id")
      .eq("id_usuario", userId)
      .single();

    if (userError || !userData) {
      console.error("Error finding user:", userError);
      return NextResponse.json(
        { error: "Usuario no encontrado en el sistema." },
        { status: 404 }
      );
    }

    // Insertar la tarea delegada
    const { data: delegatedTask, error: delegateError } = await supabaseClient
      .from("tareas_delegadas")
      .insert({
        usuario_id: userData.id,
        tipo_tarea,
        nivel,
        tecnologias: tecnologiasArray || [],
        descripcion,
      })
      .select()
      .single();

    if (delegateError) {
      console.error("Error delegating task:", delegateError);
      return NextResponse.json(
        { error: "Error al delegar la tarea: " + delegateError.message },
        { status: 400 }
      );
    }

    // Si tenemos tarea_id y proyecto_id, actualizar el estado de la tarea original
    if (tarea_id && proyecto_id) {
      const { error: updateError } = await supabaseClient
        .from("tareas")
        .update({ estado: "delegada" })
        .eq("id", tarea_id)
        .eq("proyecto_id", proyecto_id);

      if (updateError) {
        console.error("Error updating task status:", updateError);
        // No fallar completamente, solo registrar el error
      }
    }

    return NextResponse.json(
      { 
        message: "Tarea delegada con éxito", 
        taskId: delegatedTask.id,
        data: delegatedTask
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Un error desconocido ocurrió.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}