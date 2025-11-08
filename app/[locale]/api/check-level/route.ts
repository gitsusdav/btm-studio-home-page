// app/[locale]/api/check-level/route.ts
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function supabase() {
  const cookieStore = await cookies();
  return createRouteHandlerClient({ cookies: () => cookieStore });
}

const TOTAL_TIME_BASE = process.env.TOTAL_TIME_BASE || "http://localhost:3000";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "POST, OPTIONS" },
  });
}

export async function POST(req: Request) {
  try {
    const supabaseClient = await supabase();

    // 1) Sesión
    const {
      data: { session },
      error: sessionError,
    } = await supabaseClient.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json({ error: "No autorizado. Debes iniciar sesión." }, { status: 401 });
    }

    const authUserId = session.user.id; // UUID de Supabase Auth

    // 2) Body
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

    const { tareaId } = body;
    if (!tareaId) return NextResponse.json({ error: "tareaId es requerido" }, { status: 400 });
    const userId = session.user.id;
    // 3) Mapear authUserId -> usuario.id (buscando por usuario.id_usuario = authUserId)
    const { data: usuarioRow, error: usrErr } = await supabaseClient
      .from("usuario")
      .select("id_usuario")
      .eq("id_usuario", authUserId)
      .single();

    if (usrErr || !usuarioRow) {
      return NextResponse.json(
        { error: "Usuario no encontrado en tabla 'usuario' (id_usuario no coincide)." },
        { status: 404 }
      );
    }

    // 4) Insert en solicitud_nivel (usa la columna correcta: usuario_id)
    const { data: created, error: insertErr } = await supabaseClient
      .from("solicitud_nivel")
      .insert({
        user_id: userId,
        tarea_id: tareaId,
        estado: "pendiente",
        comienzo: new Date(),
      })
      .select()
      .single();

    if (insertErr) {
    //  console.error("Error insertando solicitud_nivel:", insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // 5) Redirigir a total-time (comparten BD)
    const redirectUrl = `${TOTAL_TIME_BASE}/nivel/${created.id}`;

    return NextResponse.json(
      { message: "Solicitud creada", solicitud: created, redirectUrl },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Error en POST /api/check-level:", err);
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
