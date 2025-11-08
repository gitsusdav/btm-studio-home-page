import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

async function supabase() {
  const cookieStore = await cookies();
  return createRouteHandlerClient({ cookies: () => cookieStore });
}

// Interfaz para los eventos del calendario
interface CalendarEvent {
  id?: string;
  title: string;
  subtitle?: string;
  dayIndex: number;      // 0 = Monday, -1 = unscheduled
  color?: string;        // CSS background color
  time?: string;         // Display time for mobile view
  position?: number;     // Orden/posición del evento
  proyecto_id: number;
  created_at?: string;
  updated_at?: string;
}

// GET - Obtener eventos del calendario para un proyecto
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const projectId = parseInt(id);
    
    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'ID de proyecto inválido.' }, { status: 400 });
    }

    // Verificar que el proyecto existe y el usuario tiene permisos
    const supabaseClient = await supabase();
    const { data: project, error: projectError } = await supabaseClient
      .from('proyectos')
      .select('id, publico, user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 });
    }

    // Si el proyecto es privado, verificar que el usuario es el propietario
    if (project.publico === false) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session || session.user.id !== project.user_id) {
        return NextResponse.json({ error: 'No tienes permisos para acceder a este proyecto.' }, { status: 403 });
      }
    }

    // Obtener eventos del calendario
    const { data: eventos, error: eventosError } = await supabaseClient
      .from('eventos_calendario')
      .select('*')
      .eq('proyecto_id', projectId)
      .order('created_at', { ascending: true });

    if (eventosError) {
      console.error('Error fetching calendar events:', eventosError);
      return NextResponse.json({ error: 'Error al obtener eventos del calendario.' }, { status: 500 });
    }

    return NextResponse.json({ eventos: eventos || [] });

  } catch (error) {
    console.error('Error in GET /api/proyectos/[id]/eventos:', error);
    const errorMessage = error instanceof Error ? error.message : 'Un error desconocido ocurrió.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// POST - Crear nuevo evento del calendario
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const projectId = parseInt(id);

    console.log('📅 POST /api/proyectos/[id]/eventos - projectId:', projectId);

    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'ID de proyecto inválido.' }, { status: 400 });
    }

    const body = await req.json();
    const { title, subtitle, dayIndex, color, time, position } = body;

    console.log('📅 Datos recibidos:', { title, subtitle, dayIndex, color, time, position });

    // Validar datos requeridos
    if (!title || typeof dayIndex !== 'number') {
      console.error('❌ Validación falló:', { title, dayIndex, typeOfDayIndex: typeof dayIndex });
      return NextResponse.json({
        error: 'Datos faltantes: title y dayIndex son requeridos.'
      }, { status: 400 });
    }

    // Verificar que el usuario está autenticado
    const supabaseClient = await supabase();
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
    }

    // Verificar que el proyecto existe y el usuario es propietario
    const { data: project, error: projectError } = await supabaseClient
      .from('proyectos')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 });
    }

    if (session.user.id !== project.user_id) {
      return NextResponse.json({ error: 'No tienes permisos para modificar este proyecto.' }, { status: 403 });
    }

    // Crear el evento
    console.log('📝 Creando evento en BD...');
    const { data: newEvent, error: createError } = await supabaseClient
      .from('eventos_calendario')
      .insert({
        title,
        subtitle: subtitle || null,
        day_index: dayIndex,
        color: color || 'rgba(59, 130, 246, 0.9)',
        time: time || null,
        position: position || null,
        proyecto_id: projectId
      })
      .select()
      .single();

    if (createError) {
      console.error('❌ Error creating calendar event:', createError);
      return NextResponse.json({ error: 'Error al crear el evento del calendario.' }, { status: 500 });
    }

    console.log('✅ Evento creado exitosamente:', newEvent);
    return NextResponse.json({ evento: newEvent }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/proyectos/[id]/eventos:', error);
    const errorMessage = error instanceof Error ? error.message : 'Un error desconocido ocurrió.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// PUT - Actualizar evento del calendario
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const projectId = parseInt(id);
    
    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'ID de proyecto inválido.' }, { status: 400 });
    }

    const body = await req.json();
    const { eventId, title, subtitle, dayIndex, color, time, position } = body;

    if (!eventId) {
      return NextResponse.json({ error: 'ID del evento es requerido.' }, { status: 400 });
    }

    // Verificar que el usuario está autenticado
    const supabaseClient = await supabase();
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
    }

    // Verificar que el proyecto existe y el usuario es propietario
    const { data: project, error: projectError } = await supabaseClient
      .from('proyectos')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 });
    }

    if (session.user.id !== project.user_id) {
      return NextResponse.json({ error: 'No tienes permisos para modificar este proyecto.' }, { status: 403 });
    }

    // Actualizar el evento
    const updateData: any = { updated_at: new Date().toISOString() };
    if (title !== undefined) updateData.title = title;
    if (subtitle !== undefined) updateData.subtitle = subtitle;
    if (dayIndex !== undefined) updateData.day_index = dayIndex;
    if (color !== undefined) updateData.color = color;
    if (time !== undefined) updateData.time = time;
    if (position !== undefined) updateData.position = position;

    const { data: updatedEvent, error: updateError } = await supabaseClient
      .from('eventos_calendario')
      .update(updateData)
      .eq('id', eventId)
      .eq('proyecto_id', projectId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating calendar event:', updateError);
      return NextResponse.json({ error: 'Error al actualizar el evento del calendario.' }, { status: 500 });
    }

    if (!updatedEvent) {
      return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ evento: updatedEvent });

  } catch (error) {
    console.error('Error in PUT /api/proyectos/[id]/eventos:', error);
    const errorMessage = error instanceof Error ? error.message : 'Un error desconocido ocurrió.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// DELETE - Eliminar evento del calendario
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const projectId = parseInt(id);
    
    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'ID de proyecto inválido.' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json({ error: 'ID del evento es requerido.' }, { status: 400 });
    }

    // Verificar que el usuario está autenticado
    const supabaseClient = await supabase();
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
    }

    // Verificar que el proyecto existe y el usuario es propietario
    const { data: project, error: projectError } = await supabaseClient
      .from('proyectos')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 });
    }

    if (session.user.id !== project.user_id) {
      return NextResponse.json({ error: 'No tienes permisos para modificar este proyecto.' }, { status: 403 });
    }

    // Eliminar el evento
    const { error: deleteError } = await supabaseClient
      .from('eventos_calendario')
      .delete()
      .eq('id', eventId)
      .eq('proyecto_id', projectId);

    if (deleteError) {
      console.error('Error deleting calendar event:', deleteError);
      return NextResponse.json({ error: 'Error al eliminar el evento del calendario.' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Evento eliminado exitosamente.' });

  } catch (error) {
    console.error('Error in DELETE /api/proyectos/[id]/eventos:', error);
    const errorMessage = error instanceof Error ? error.message : 'Un error desconocido ocurrió.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}