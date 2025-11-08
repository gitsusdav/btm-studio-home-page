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
            "No autorizado. Debes iniciar sesión para guardar proyectos privados.",
        },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const {
      projectContext,
      tasks,
      finalImageUrl,
      timestamp,
      publico,
      producto, // ← extrae producto del body
    } = await req.json();

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
            "Datos inválidos. Se requieren datos validos. " + projectContext.stylePrompt + projectContext.utility + projectContext.palette ,
        },
        { status: 400 }
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
    let country = "Unknown";

    try {
      const geoResponse = await fetch(`https://ipapi.co/${ip}/json/`);
      if (geoResponse.ok) {
        const geoData = await geoResponse.json();
        country = geoData.country_name || "Unknown";
      }
    } catch (geoError) {
      console.error("Error fetching geolocation data:", geoError);
    }

    const { data: projectData, error: projectError } = await supabaseClient
      .from("proyectos")
      .insert({
        user_id: userId,
        nombre: projectContext.description,
        description: projectContext.description,
        style_prompt: projectContext.stylePrompt,
        type: projectContext.type,
        utility: projectContext.utility,
        palette: projectContext.palette,
        colors: projectContext.colors,
        imagen_url: finalImageUrl,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        ip_creacion: ip,
        pais_creacion: country,
        publico: false,
        producto, // ← guarda el producto aquí
      })
      .select()
      .single();

    if (projectError) {
      console.error("Error en Supabase (Proyecto):", projectError);
      return NextResponse.json(
        { error: projectError.message },
        { status: 400 }
      );
    }

    const tasksToInsert = tasks.map((task: any) => {
      // Extraer el texto de la tarea
      let descripcion: string;
      if (typeof task === "string") {
        descripcion = task;
      } else {
        // Si es un objeto, intentar extraer el texto de diferentes propiedades
        descripcion = task.descripcion || task.text || task.title || JSON.stringify(task);
      }

      return {
        descripcion: descripcion,
        proyecto_id: projectData.id,
        estado: "pendiente",
      };
    });

    const { error: tasksError } = await supabaseClient
      .from("tareas")
      .insert(tasksToInsert);

    if (tasksError) {
      console.error("Error en Supabase (Tareas):", tasksError);
      await supabaseClient
        .from("proyectos")
        .delete()
        .match({ id: projectData.id });
      return NextResponse.json({ error: tasksError.message }, { status: 400 });
    }

    return NextResponse.json(
      { message: "Proyecto creado con éxito", projectId: projectData.id },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Un error desconocido ocurrió.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
