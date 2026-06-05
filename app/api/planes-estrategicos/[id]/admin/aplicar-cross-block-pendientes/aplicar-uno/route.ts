// POST /api/planes-estrategicos/[id]/admin/aplicar-cross-block-pendientes/aplicar-uno
//
// Aplica UN cross-block change a un campo específico del plan. El user elige
// el path destino del dropdown (cuando el locator automático falló). Reemplaza
// el valor del campo entero por el texto a aplicar y registra warning
// retroactivo en plan.warnings_retroactivos.
//
// Body: { target_path: "proposito.escena" | "proposito.metricas[i].valor_objetivo" | etc,
//         texto_a_aplicar: string,
//         cross_block_meta: { id, bloque_afectado, seccion_afectada, severidad, turno_referencia, texto_previo_reviewer } }
// Response: { ok, target_path, valor_previo, valor_nuevo }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type { PropositorPE, SituacionPE, WarningRetroactivo, PlanoPE } from '@/lib/types'

interface BodyShape {
  target_path: string
  texto_a_aplicar: string
  cross_block_meta?: {
    id?: string
    bloque_afectado?: number
    seccion_afectada?: string
    severidad?: string
    turno_referencia?: number
    texto_previo_reviewer?: string
  }
}

// Set helper: resuelve un path string contra el plan y devuelve { previo, nuevo,
// setter } o null si el path no se reconoce.
function applyPath(
  proposito: PropositorPE | undefined,
  situacion: SituacionPE | undefined,
  path: string,
  newValue: string,
): { ok: false; error: string } | { ok: true; valor_previo: string } {
  // proposito.escena | proposito.horizonte | proposito.estabilidad
  const pSimple = /^proposito\.(escena|horizonte|estabilidad)$/.exec(path)
  if (pSimple) {
    if (!proposito) return { ok: false, error: 'Plan sin propósito declarado.' }
    const key = pSimple[1] as 'escena' | 'horizonte' | 'estabilidad'
    const previo = proposito[key] ?? ''
    proposito[key] = newValue
    return { ok: true, valor_previo: previo }
  }
  // proposito.metricas[i].(valor_objetivo|valor_actual)
  const pMetrica = /^proposito\.metricas\[(\d+)\]\.(valor_objetivo|valor_actual)$/.exec(path)
  if (pMetrica) {
    if (!proposito?.metricas) return { ok: false, error: 'Plan sin métricas declaradas.' }
    const i = parseInt(pMetrica[1], 10)
    if (i < 0 || i >= proposito.metricas.length) return { ok: false, error: `Índice ${i} fuera de rango (hay ${proposito.metricas.length} métricas).` }
    const key = pMetrica[2] as 'valor_objetivo' | 'valor_actual'
    const previo = proposito.metricas[i][key] ?? ''
    proposito.metricas[i][key] = newValue
    return { ok: true, valor_previo: previo }
  }
  // proposito.fuera[i].(item|razon)
  const pFuera = /^proposito\.fuera\[(\d+)\]\.(item|razon)$/.exec(path)
  if (pFuera) {
    if (!proposito?.fuera) return { ok: false, error: 'Plan sin items fuera de scope.' }
    const i = parseInt(pFuera[1], 10)
    if (i < 0 || i >= proposito.fuera.length) return { ok: false, error: `Índice ${i} fuera de rango.` }
    const key = pFuera[2] as 'item' | 'razon'
    const previo = proposito.fuera[i][key] ?? ''
    proposito.fuera[i][key] = newValue
    return { ok: true, valor_previo: previo }
  }
  // situacion.*  (campos string directos)
  const sSimple = /^situacion\.(desvio_principal|desvio_cuantificado|causa_raiz|consecuencia_6m|consecuencia_12m|recursos_actuales|recursos_faltantes|intentos_previos)$/.exec(path)
  if (sSimple) {
    if (!situacion) return { ok: false, error: 'Plan sin situación declarada.' }
    const key = sSimple[1] as keyof SituacionPE
    const previo = (situacion[key] as string) ?? ''
    ;(situacion[key] as string) = newValue
    return { ok: true, valor_previo: previo }
  }
  // situacion.desvios_secundarios[i].(descripcion|datos)
  const sDes = /^situacion\.desvios_secundarios\[(\d+)\]\.(descripcion|datos)$/.exec(path)
  if (sDes) {
    if (!situacion?.desvios_secundarios) return { ok: false, error: 'Plan sin desvíos secundarios.' }
    const i = parseInt(sDes[1], 10)
    if (i < 0 || i >= situacion.desvios_secundarios.length) return { ok: false, error: `Índice ${i} fuera de rango.` }
    const key = sDes[2] as 'descripcion' | 'datos'
    const previo = situacion.desvios_secundarios[i][key] ?? ''
    situacion.desvios_secundarios[i][key] = newValue
    return { ok: true, valor_previo: previo }
  }
  // situacion.resistencias[i].(descripcion|mitigacion)
  const sRes = /^situacion\.resistencias\[(\d+)\]\.(descripcion|mitigacion)$/.exec(path)
  if (sRes) {
    if (!situacion?.resistencias) return { ok: false, error: 'Plan sin resistencias.' }
    const i = parseInt(sRes[1], 10)
    if (i < 0 || i >= situacion.resistencias.length) return { ok: false, error: `Índice ${i} fuera de rango.` }
    const key = sRes[2] as 'descripcion' | 'mitigacion'
    const previo = situacion.resistencias[i][key] ?? ''
    situacion.resistencias[i][key] = newValue
    return { ok: true, valor_previo: previo }
  }
  return { ok: false, error: `Path no reconocido: "${path}". Ver endpoint /campos para paths válidos.` }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const { id: planId } = await params
    const body = await req.json().catch(() => null) as BodyShape | null
    if (!body?.target_path || typeof body.texto_a_aplicar !== 'string') {
      return NextResponse.json({ error: 'Body inválido. Requiere target_path y texto_a_aplicar.' }, { status: 400 })
    }

    const plan = await getPlanEstrategico(planId).catch(() => null)
    if (!plan) return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })

    // Clone para no mutar.
    const proposito = plan.proposito ? JSON.parse(JSON.stringify(plan.proposito)) as PropositorPE : undefined
    const situacion = plan.situacion ? JSON.parse(JSON.stringify(plan.situacion)) as SituacionPE : undefined

    const result = applyPath(proposito, situacion, body.target_path, body.texto_a_aplicar)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Registrar WarningRetroactivo en plan.warnings_retroactivos.
    const entrevista = await getEntrevistaPE(planId).catch(() => null)
    const meta = body.cross_block_meta ?? {}
    const warning: WarningRetroactivo = {
      timestamp: new Date().toISOString(),
      bloque_afectado: `Paso ${meta.bloque_afectado ?? '?'} · ${meta.seccion_afectada ?? body.target_path}`,
      paso_de_origen: entrevista?.paso_actual ?? 3,
      sub_bloque_de_origen: entrevista?.sub_bloque_actual ?? '3.E',
      texto_previo: meta.texto_previo_reviewer ?? result.valor_previo,
      descripcion_cambio: `Cross-block ${meta.id ?? '?'} aplicado manualmente vía admin a ${body.target_path}. Texto a aplicar: ${body.texto_a_aplicar.slice(0, 280)}${body.texto_a_aplicar.length > 280 ? '…' : ''}`,
      impactos_detectados: [
        `Reviewer detectó modificación en turno ${meta.turno_referencia ?? '?'}`,
        `Severidad: ${meta.severidad ?? 'desconocida'}`,
        `Locator automático falló — aplicado manualmente por el usuario`,
      ],
      confirmado_por_user: true,
    }
    const planActualizado: PlanoPE = plan.plan ? { ...plan.plan } : {} as PlanoPE
    planActualizado.warnings_retroactivos = [...(planActualizado.warnings_retroactivos ?? []), warning]

    await updatePlanEstrategico(planId, {
      proposito,
      situacion,
      plan: planActualizado,
    })

    return NextResponse.json({
      ok: true,
      target_path: body.target_path,
      valor_previo: result.valor_previo,
      valor_nuevo: body.texto_a_aplicar,
    })
  } catch (err) {
    const errAny = err as any
    console.error('[aplicar-uno] UNCAUGHT:', errAny?.message)
    console.error('[aplicar-uno] stack:', errAny?.stack)
    return NextResponse.json({
      error: `Error interno: ${errAny?.message ?? String(err)}`,
    }, { status: 500 })
  }
}
