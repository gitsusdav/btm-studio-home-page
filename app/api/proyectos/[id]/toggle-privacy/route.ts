// app/api/proyectos/[id]/privacidad/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

async function supabase() {
  const cookieStore = await cookies();
  return createRouteHandlerClient({ cookies: () => cookieStore });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    const supabaseClient = await supabase();

    // 1. Obtener el estado actual del proyecto
    const { data: project, error: fetchError } = await supabaseClient
      .from('proyectos')
      .select('publico')
      .eq('id', projectId)
      .single();

    if (fetchError || !project) {
      return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 });
    }

    // 2. Cambiar el estado de publico a su opuesto
    const newStatus = !project.publico;
    const { error: updateError } = await supabaseClient
      .from('proyectos')
      .update({ publico: newStatus })
      .eq('id', projectId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Error al actualizar la privacidad del proyecto.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: 'Privacidad actualizada con éxito', newStatus },
      { status: 200 }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Un error desconocido ocurrió.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}