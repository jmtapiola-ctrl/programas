// Endpoint de transición: cierre_sugerido → esperando_auditoria.
//
// Se llama cuando el usuario aprieta el botón "Cerrar Paso N y revisar" en la
// UI del wizard, después de que el modelo emitió cierre_sugerido=true en su
// PANEL_UPDATE (lo cual ya transicionó sub_estado_paso a 'cierre_sugerido' vía
// el chat route).
//
// Body: { paso: number }
// Devuelve: { ok: true, redirect: '/planes-estrategicos/[id]/cierre/paso-N' }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEntrevistaPE, updateSubEstadoPaso } from '@/lib/airtable'

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
  if (subEstadoActual !== 'cierre_sugerido') {
    return NextResponse.json(
      {
        error: `sub_estado_paso debe ser 'cierre_sugerido' para cerrar el Paso, pero es '${subEstadoActual}'`,
        hint: subEstadoActual === 'en_curso'
          ? 'El modelo todavía no sugirió cierre. Seguí entrevistando hasta que aparezca el botón.'
          : 'El Paso ya fue cerrado o está en otra fase del flow de auditoría.',
      },
      { status: 409 },
    )
  }

  // Transición guarded: 'cierre_sugerido' → 'esperando_auditoria'.
  try {
    await updateSubEstadoPaso(entrevista.id, 'cierre_sugerido', 'esperando_auditoria')
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'transición rechazada por el guard' },
      { status: 409 },
    )
  }

  return NextResponse.json({
    ok: true,
    redirect: `/planes-estrategicos/${planId}/cierre/paso-${paso}`,
  })
}
