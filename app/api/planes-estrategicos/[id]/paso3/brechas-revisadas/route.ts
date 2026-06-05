// POST /api/planes-estrategicos/[id]/paso3/brechas-revisadas
//
// Marca plan.preparativos.brechas_revisadas = true. Idempotente: si ya está
// en true, no escribe a Airtable y devuelve el state actual.
//
// Se dispara la primera vez que el modal de inventario auto-abre el modal
// de renombrar brechas (UX: el usuario ve la lista de brechas al entrar a
// 3.A, después no se vuelven a poder renombrar desde la UI del inventario).
//
// Body: vacío (o {}).
// Response: { ok: true, preparativos_actualizado: PreparativosPE }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type {
  PlanoPE,
  PreparativosPE,
  AreaAfectadaPE,
  SupuestoExogenoPE,
  PriorizacionDesvioPE,
} from '@/lib/types'

// Skeleton mínimo cuando plan.preparativos no existe todavía (caso edge —
// flow esperado siempre lo crea durante Paso 3 antes de llegar al inventario).
function preparativosSkeleton(): PreparativosPE {
  return {
    areas_afectadas: [] as AreaAfectadaPE[],
    supuestos_exogenos: [] as SupuestoExogenoPE[],
    priorizacion_inicial: {} as PriorizacionDesvioPE,
    criterio_exito: { por_metrica: [], zona_fracaso: '' },
    brechas_revisadas: true,
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  if (entrevista.paso_actual < 3) {
    return NextResponse.json({
      error: `Marcar brechas revisadas requiere paso_actual >= 3. paso_actual: ${entrevista.paso_actual}.`,
    }, { status: 409 })
  }

  const preparativosActuales = plan.plan?.preparativos
  if (preparativosActuales?.brechas_revisadas === true) {
    // Idempotente: ya estaba marcado, no escribir.
    return NextResponse.json({
      ok: true,
      preparativos_actualizado: preparativosActuales,
      no_op: true,
    })
  }

  const preparativosNuevo: PreparativosPE = preparativosActuales
    ? { ...preparativosActuales, brechas_revisadas: true }
    : preparativosSkeleton()

  const planNuevo: PlanoPE = {
    ...(plan.plan ?? {}),
    preparativos: preparativosNuevo,
  } as PlanoPE

  await updatePlanEstrategico(planId, { plan: planNuevo })

  return NextResponse.json({
    ok: true,
    preparativos_actualizado: preparativosNuevo,
  })
}
