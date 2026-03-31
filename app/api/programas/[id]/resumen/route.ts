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

  // Agrupar objetivos por tipo en el orden correcto
  const ordenados = [...objetivos].sort(
    (a, b) => (TIPO_ORDEN[a.tipo] ?? 99) - (TIPO_ORDEN[b.tipo] ?? 99)
  )

  // Agrupar por tipo para el prompt
  const tiposOrden = ['Primario', 'Vital', 'Condicional', 'Operativo', 'Producción', 'Mayor']
  const porTipo: Record<string, Objetivo[]> = {}
  for (const o of ordenados) {
    if (!porTipo[o.tipo]) porTipo[o.tipo] = []
    porTipo[o.tipo].push(o)
  }
  const objetivosPorTipo = tiposOrden
    .filter(t => porTipo[t]?.length)
    .map(t => [t, porTipo[t]] as [string, Objetivo[]])

  // Estadísticas
  const totalObjetivos = ordenados.length
  const completados = ordenados.filter(o => o.estado === 'Completado').length
  const enCurso = ordenados.filter(o => o.estado === 'En curso').length
  const noIniciados = ordenados.filter(o => o.estado === 'No iniciado' || o.estado === 'Asignado').length
  const conProblemas = ordenados.filter(o =>
    o.estado === 'Rechazado' || o.estado === 'Incumplido' || o.estado === 'Cancelado'
  ).length

  // Lista de objetivos por tipo
  const listaObjetivos = objetivosPorTipo.length > 0
    ? objetivosPorTipo.map(([tipo, objs]) =>
        `${tipo.toUpperCase()}:\n` +
        objs.map((o: Objetivo) =>
          `  - "${o.nombre}" | Estado: ${o.estado} | ` +
          `Responsable: ${usuariosMap[o.responsableId]?.nombre ?? 'Sin asignar'} | ` +
          `Doingness: ${o.descripcionDoingness ?? 'No definido'}`
        ).join('\n')
      ).join('\n\n')
    : 'Sin objetivos cargados'

  const systemPrompt = `Sos un analista experto en gestión organizacional con profundo conocimiento de la Serie de Objetivos de L. Ronald Hubbard. Generás resúmenes ejecutivos ricos, detallados y útiles para ejecutivos que necesitan entender rápidamente el estado real de un programa. Escribís en español, en prosa fluida con párrafos bien desarrollados. Usás **negritas** en Markdown para destacar puntos clave. Cada párrafo debe tener al menos 3-4 oraciones. No usés bullets ni listas.`

  const userPrompt = `Generá un resumen ejecutivo completo y detallado de este programa.

NOMBRE DEL PROGRAMA: ${programa.nombre}
PERÍODO: ${programa.fechaInicio ?? 'No definida'} → ${programa.fechaObjetivo ?? 'No definida'}

SITUACIÓN (el problema que justifica el programa):
${programa.situacion ?? 'No definida'}

PROPÓSITO (por qué existe el programa):
${programa.proposito ?? 'No definido'}

OBJETIVO MAYOR (qué se logra al completarlo):
${programa.objetivoMayor ?? 'No definido'}

OBJETIVOS DEL PROGRAMA (${totalObjetivos} en total):
${listaObjetivos}

ESTADÍSTICAS DE AVANCE:
- Completados: ${completados}/${totalObjetivos}
- En curso: ${enCurso}
- Sin iniciar: ${noIniciados}
- Con problemas (Rechazado/Incumplido/Cancelado): ${conProblemas}

Redactá 4 párrafos completos y bien desarrollados:

**Párrafo 1 — Situación y coherencia:**
Describí el problema real que este programa intenta resolver. ¿La situación está bien identificada? ¿El propósito y el objetivo mayor son coherentes con esa situación? ¿El programa tiene sentido como respuesta al problema planteado?

**Párrafo 2 — Estructura del programa:**
Analizá cómo está armado el programa según la Serie de Objetivos de LRH. ¿Tiene todos los tipos de objetivos necesarios (Condicionales, Primarios/Vitales, Operativos, Producción)? ¿La secuencia es correcta? ¿Hay tipos que faltan o están sobredimensionados?

**Párrafo 3 — Estado de avance actual:**
¿Dónde está parado el programa hoy? ¿Qué se completó, qué está en curso, qué no arrancó? ¿Cuáles son los puntos de atención más importantes en este momento?

**Párrafo 4 — Riesgos y recomendaciones:**
¿Hay Primarios o Vitales sin iniciar que bloquean el resto? ¿Objetivos vencidos? ¿Responsables sin asignar? ¿La estructura del programa garantiza que se va a poder ejecutar? ¿Qué debería hacer el ejecutivo primero?

Sé específico y directo. Mencioná nombres de objetivos concretos cuando sea relevante. No uses frases genéricas.`

  const promptCompleto = `${systemPrompt}\n\n${userPrompt}`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptCompleto }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
        }),
      }
    )
    const data = await response.json()
    const resumen: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    if (!resumen) {
      return NextResponse.json({ error: 'Gemini no devolvió contenido' }, { status: 502 })
    }

    await updatePrograma(id, { resumenEjecutivo: resumen })
    return NextResponse.json({ resumen })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error al generar resumen' }, { status: 500 })
  }
}
