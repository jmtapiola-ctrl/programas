import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPrograma, getObjetivos, getUsuarios, updatePrograma } from '@/lib/airtable'
import { esOficialDelPrograma, puedeVerTodo, TIPO_ORDEN } from '@/lib/types'
import type { Objetivo, Rol } from '@/lib/types'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const rol = (session.user as any)?.role as string
  const userId = (session.user as any)?.id as string

  let programa
  try {
    programa = await getPrograma(id)
  } catch {
    return NextResponse.json({ error: 'Programa no encontrado' }, { status: 404 })
  }

  const puedeVer = puedeVerTodo(rol as Rol) || esOficialDelPrograma(userId, programa)
  if (!puedeVer) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const [objetivos, usuarios] = await Promise.all([
    getObjetivos(id),
    getUsuarios(),
  ])

  const usuariosMap = Object.fromEntries(usuarios.map(u => [u.id, u]))

  // Ordenar objetivos por tipo
  const ordenados = [...objetivos].sort(
    (a, b) => (TIPO_ORDEN[a.tipo] ?? 99) - (TIPO_ORDEN[b.tipo] ?? 99)
  )

  // Estadísticas
  const total = ordenados.length
  const completados = ordenados.filter(o => o.estado === 'Completado').length
  const enCurso = ordenados.filter(o => o.estado === 'En curso').length
  const noIniciados = ordenados.filter(o => o.estado === 'No iniciado' || o.estado === 'Asignado').length
  const conProblemas = ordenados.filter(o => o.estado === 'Rechazado' || o.estado === 'Incumplido').length

  // Formatear lista de objetivos
  const listaObjetivos = ordenados.map((o: Objetivo) => {
    const responsableNombre = usuariosMap[o.responsableId]?.nombre ?? 'Sin asignar'
    const doingness = o.descripcionDoingness ? ` | Doingness: ${o.descripcionDoingness}` : ''
    return `[${o.tipo}] ${o.nombre}: ${o.estado} | Responsable: ${responsableNombre}${doingness}`
  }).join('\n')

  const systemPrompt = `Sos un analista de gestión organizacional experto en la metodología de programas de L. Ronald Hubbard (Serie de Objetivos). Tu función es generar resúmenes ejecutivos claros, directos y útiles de programas de acción. Respondé en español, en prosa fluida, sin bullets ni listas. Máximo 4 párrafos.`

  const userPrompt = `Generá un resumen ejecutivo de este programa:

NOMBRE: ${programa.nombre}
SITUACIÓN: ${programa.situacion ?? 'No definida'}
PROPÓSITO: ${programa.proposito ?? 'No definido'}
OBJETIVO MAYOR: ${programa.objetivoMayor ?? 'No definido'}
PERÍODO: ${programa.fechaInicio ?? '?'} a ${programa.fechaObjetivo ?? '?'}

OBJETIVOS (${total} en total):
${listaObjetivos || 'Sin objetivos cargados'}

ESTADÍSTICAS:
- Completados: ${completados}
- En curso: ${enCurso}
- No iniciados: ${noIniciados}
- Con problemas (Rechazado/Incumplido): ${conProblemas}

Analizá:
1. Qué situación real está intentando resolver este programa y si el enfoque es coherente con esa situación
2. Cómo está estructurado el programa — qué tipos de objetivos tiene y si la secuencia lógica es correcta según la Serie (Condicionales → Primarios/Vitales → Operativos → Producción)
3. En qué estado de avance se encuentra actualmente y cuáles son los puntos de atención más importantes
4. Si hay riesgos o inconsistencias que el ejecutivo debería conocer (Primarios sin iniciar, Vitales caídos, objetivos vencidos, falta de responsables, etc.)

Sé directo y útil. No uses frases genéricas. Basate únicamente en los datos del programa.`

  const promptCompleto = `${systemPrompt}\n\n${userPrompt}`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptCompleto }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }),
      }
    )
    const data = await response.json()
    const resumen: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    if (!resumen) {
      return NextResponse.json({ error: 'Gemini no devolvió contenido' }, { status: 502 })
    }

    // Guardar en Airtable
    await updatePrograma(id, { resumenEjecutivo: resumen })

    return NextResponse.json({ resumen })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error al generar resumen' }, { status: 500 })
  }
}
