import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function supabase() {
  const cookieStore = await cookies();
  return createRouteHandlerClient({ cookies: () => cookieStore });
}

export async function POST(req: Request) {
  console.log("🔍 POST /api/upload-avatar - Subiendo avatar");

  try {
    const supabaseClient = await supabase();

    // 1) Verificar sesión
    const {
      data: { session },
      error: sessionError,
    } = await supabaseClient.auth.getSession();

    if (sessionError) {
      console.error("❌ Error de sesión:", sessionError);
      return NextResponse.json(
        { 
          error: "Error de autenticación: " + sessionError.message,
          timestamp: new Date().toISOString()
        },
        { status: 401 }
      );
    }

    if (!session?.user) {
      console.log("❌ No hay sesión activa");
      return NextResponse.json(
        { 
          error: "No autorizado. Debes iniciar sesión.",
          timestamp: new Date().toISOString()
        },
        { status: 401 }
      );
    }

    const authUserId = session.user.id;
    console.log("✅ Subiendo avatar para usuario:", authUserId);

    // 2) Get form data
    const formData = await req.formData();
    const file = formData.get('avatar') as File;

    if (!file) {
      return NextResponse.json(
        { 
          error: "No se proporcionó ningún archivo",
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    // 3) Validate file
    if (file.size > 5 * 1024 * 1024) { // 5MB
      return NextResponse.json(
        { 
          error: "La imagen es demasiado grande. Máximo 5MB.",
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { 
          error: "El archivo debe ser una imagen.",
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      );
    }

    // 4) Generate unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${authUserId}_${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    console.log("📁 Subiendo archivo:", filePath);

    // 5) Upload to Supabase Storage
    const { data, error } = await supabaseClient.storage
      .from('avatars')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error("❌ Error subiendo archivo:", error);
      
      // If bucket doesn't exist, try to create it
      if (error.message.includes('Bucket not found')) {
        console.log("🔧 Intentando crear bucket 'avatars'...");
        
        const { error: bucketError } = await supabaseClient.storage
          .createBucket('avatars', {
            public: true,
            allowedMimeTypes: ['image/*'],
            fileSizeLimit: 5242880 // 5MB
          });

        if (bucketError) {
          console.error("❌ Error creando bucket:", bucketError);
          return NextResponse.json(
            { 
              error: "Error configurando almacenamiento de imágenes: " + bucketError.message,
              timestamp: new Date().toISOString()
            },
            { status: 500 }
          );
        }

        // Retry upload after creating bucket
        const { data: retryData, error: retryError } = await supabaseClient.storage
          .from('avatars')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (retryError) {
          console.error("❌ Error en reintento de subida:", retryError);
          return NextResponse.json(
            { 
              error: "Error subiendo imagen: " + retryError.message,
              timestamp: new Date().toISOString()
            },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { 
            error: "Error subiendo imagen: " + error.message,
            timestamp: new Date().toISOString()
          },
          { status: 500 }
        );
      }
    }

    // 6) Get public URL
    const { data: { publicUrl } } = supabaseClient.storage
      .from('avatars')
      .getPublicUrl(filePath);

    console.log("✅ Avatar subido exitosamente:", publicUrl);

    return NextResponse.json(
      {
        success: true,
        message: "Avatar subido exitosamente",
        avatarUrl: publicUrl,
        filePath: filePath,
        timestamp: new Date().toISOString()
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error("💥 Error crítico en POST /api/upload-avatar:", error);
    
    return NextResponse.json(
      { 
        error: "Error interno del servidor",
        details: {
          message: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          name: error.name,
        },
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}