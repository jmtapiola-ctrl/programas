// Endpoint de transición: cierre_sugerido → esperando_auditoria.
//
// Se llama cuando el usuario aprieta el botón "Cerrar Paso N y revisar" en la
// UI del wizard, después de que el modelo emitió cierre_sugerido=true en su
// PANEL_UPDATE (lo cual ya transicionó sub_estado_paso a 'cierre_sugerido' vía
// el chat route).
//
// Body: { paso: number }
// Devuelve: { ok: true, redirect: '/planes-estrategicos/[id]/cierre/N' }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEntrevistaPE, getPlanEstrategico, updateSubEstadoPaso } from '@/lib/airtable'
import { getCuradoActivo } from '@/lib/types'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => ({}))
  const paso = body?.paso

  if (typeof paso !== 'number' || !Number.isInteger(paso) || paso < 1) {
    return NextResponse.json({ error: 'paso debe ser integer >= 1' }, { status: 400 })
  }

  const entrevista = await getEntrevistaPE(planId)
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  // Validaciones:
  //   1. El paso del request debe coincidir con paso_actual.
  //   2. sub_estado_paso debe ser 'cierre_sugerido' (lo seteó el chat route
  //      cuando el modelo emitió cierre_sugerido=true).
  if (paso !== entrevista.paso_actual) {
    return NextResponse.json(
      { error: `paso=${paso} no coincide con paso_actual=${entrevista.paso_actual}` },
      { status: 409 },
    )
  }

  const subEstadoActual = entrevista.sub_estado_paso ?? 'en_curso'

  // Camino 1 — el modelo emitió cierre_sugerido: transición directa.
  // Camino 2 (Fase C blindaje) — cierre DETERMINÍSTICO: el usuario puede cerrar el
  // Paso 3 aunque el modelo NO haya emitido cierre_sugerido, SIEMPRE que el Paso esté
  // estructuralmente completo (existe el plan curado de 3.E). Evita que el usuario
  // quede trabado esperando una señal probabilística del modelo. Respeta la máquina
  // de estados haciendo las dos transiciones válidas (en_curso → cierre_sugerido →
  // esperando_auditoria).
  try {
    if (subEstadoActual === 'cierre_sugerido') {
      await updateSubEstadoPaso(entrevista.id, 'cierre_sugerido', 'esperando_auditoria')
    } else if (subEstadoActual === 'en_curso' && paso === 3) {
      const plan = await getPlanEstrategico(planId)
      const curado = getCuradoActivo(plan)
      if (!curado) {
        return NextResponse.json(
          {
            error: 'El Paso 3 no está completo: falta el plan curado.',
            hint: 'Generá y aprobá el plan curado en 3.E antes de cerrar el Paso.',
          },
          { status: 409 },
        )
      }
      await updateSubEstadoPaso(entrevista.id, 'en_curso', 'cierre_sugerido')
      await updateSubEstadoPaso(entrevista.id, 'cierre_sugerido', 'esperando_auditoria')
    } else {
      return NextResponse.json(
        {
          error: `No se puede cerrar el Paso desde sub_estado_paso='${subEstadoActual}'`,
          hint: subEstadoActual === 'en_curso'
            ? 'El cierre determinístico requiere el plan curado (Paso 3, sub-bloque 3.E). En Pasos 1 y 2, esperá a que el modelo sugiera el cierre.'
            : 'El Paso ya fue cerrado o está en otra fase del flow de auditoría.',
        },
        { status: 409 },
      )
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'transición rechazada por el guard' },
      { status: 409 },
    )
  }

  return NextResponse.json({
    ok: true,
    redirect: `/planes-estrategicos/${planId}/cierre/${paso}`,
  })
}
