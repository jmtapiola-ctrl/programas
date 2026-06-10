// POST /api/planes-estrategicos/[id]/sugerir-lineas-jr
//
// Llama a Opus con el Plan Estratégico Sr (propósito + situación + inventario
// activo + curado) y devuelve N líneas temáticas sugeridas con sus movimientos
// asignados. Ver lib/sugerir-lineas-jr-prompt.ts.
//
// Body: ninguno (solo necesita el plan_id por params).
// Response: { ok: true, lineas: LineaJrPersistida[], metricas: { costo_usd, latencia_ms } }
//
// Validaciones:
//   - Plan debe ser tipo='Sr'.
//   - Plan debe tener paso_actual >= 4 (Paso 3 cerrado con audit).
//   - Plan debe tener inventario con al menos 3 movimientos activos.
//
// El endpoint NO persiste nada — solo devuelve la sugerencia al frontend
// para que el user revise/edite antes de confirmar en /crear-lineas-jr.

import { PE_MODEL } from '@/lib/llm-config'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { getPlanEstrategico, getEntrevistaPE } from '@/lib/airtable'
import { checkPlanAccess } from '@/lib/auth-ownership'
import {
  buildSugerirLineasSystemPrompt,
  buildSugerirLineasUserMessage,
} from '@/lib/sugerir-lineas-jr-prompt'
import type { LineaJrPersistida } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const OPUS_INPUT_PER_M = 15
const OPUS_OUTPUT_PER_M = 75

export const maxDuration = 300

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const user = {
      id: (session.user as any).id as string,
      email: (session.user as any).email as string | undefined,
      role: (session.user as any).role as string | undefined,
    }

    const { id: planId } = await params
    const access = await checkPlanAccess(user, planId)
    if (!access.allowed) {
      return NextResponse.json({ error: access.error ?? 'No autorizado' }, { status: access.status ?? 403 })
    }
    const plan = access.plan!

    // Validaciones de elegibilidad.
    if (plan.tipo !== 'Sr') {
      return NextResponse.json({ error: 'Solo Planes Sr pueden derivar Planes Jr.' }, { status: 409 })
    }
    const entrevista = await getEntrevistaPE(planId).catch(() => null)
    if (!entrevista || (entrevista.paso_actual ?? 0) < 4) {
      return NextResponse.json({
        error: 'El Plan Sr debe tener Paso 3 cerrado (con auditoría aprobada) antes de derivar Jr.',
      }, { status: 409 })
    }
    const movsActivos = (plan.plan?.inventario?.movimientos ?? []).filter(m => m.estado_usuario !== 'quitado')
    if (movsActivos.length < 3) {
      return NextResponse.json({
        error: `Inventario tiene ${movsActivos.length} movs activos; mínimo 3 para derivar Jr.`,
      }, { status: 409 })
    }

    // Llamada a Opus.
    const systemPrompt = buildSugerirLineasSystemPrompt()
    const userMessage = buildSugerirLineasUserMessage(plan)

    console.log('[sugerir-lineas-jr] start', JSON.stringify({
      plan_id: planId,
      user_message_chars: userMessage.length,
      movs_activos: movsActivos.length,
    }))

    const start = Date.now()
    let costoUsd = 0
    let latenciaMs = 0
    let text = ''

    try {
      const stream = anthropic.messages.stream({
        model: PE_MODEL,
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })
      const finalMsg = await stream.finalMessage()
      latenciaMs = Date.now() - start
      costoUsd += (finalMsg.usage.input_tokens * OPUS_INPUT_PER_M + finalMsg.usage.output_tokens * OPUS_OUTPUT_PER_M) / 1_000_000

      text = finalMsg.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map(c => c.text)
        .join('\n')

      if (finalMsg.stop_reason === 'max_tokens') {
        console.warn('[sugerir-lineas-jr] Opus truncó por max_tokens')
      }
    } catch (e) {
      const errAny = e as any
      console.error('[sugerir-lineas-jr] Opus error:', errAny?.message)
      return NextResponse.json({
        error: errAny?.message ?? String(e),
      }, { status: 500 })
    }

    // Parseo robusto del JSON (mismo patrón que /paso3/curado/generar).
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (fenceMatch?.[1]) {
        try { parsed = JSON.parse(fenceMatch[1].trim()) } catch { /* fall-through */ }
      }
      if (!parsed) {
        const firstBrace = text.indexOf('{')
        const lastBrace = text.lastIndexOf('}')
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try { parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1)) } catch { /* fall-through */ }
        }
      }
    }
    if (!parsed || !Array.isArray(parsed.lineas)) {
      console.error('[sugerir-lineas-jr] PARSE FAILED:', text.slice(0, 500))
      return NextResponse.json({
        error: 'Output de la IA no parseable como { lineas: [] }',
        output_preview: text.slice(0, 600),
      }, { status: 500 })
    }

    // Validación post-parse: cobertura 100%, no duplicados, ids válidos.
    const movsIdsValidos = new Set(movsActivos.map(m => m.id))
    const movsAsignados = new Set<string>()
    const warnings: string[] = []
    for (const linea of parsed.lineas as Array<{ movimientos_ids?: string[] }>) {
      for (const movId of linea.movimientos_ids ?? []) {
        if (!movsIdsValidos.has(movId)) {
          warnings.push(`Mov ${movId} no existe en el inventario activo — se descarta.`)
          continue
        }
        if (movsAsignados.has(movId)) {
          warnings.push(`Mov ${movId} aparece en múltiples líneas — se mantiene en la primera, se quita de las siguientes.`)
          continue
        }
        movsAsignados.add(movId)
      }
    }
    const noAsignados = [...movsIdsValidos].filter(id => !movsAsignados.has(id))
    if (noAsignados.length > 0) {
      warnings.push(`${noAsignados.length} movimiento(s) NO asignados a ninguna línea: ${noAsignados.join(', ')}. El user debe asignarlos manualmente antes de confirmar.`)
    }

    // Sanear líneas: deduplicar movs por línea, filtrar IDs inválidos, agregar
    // campos default que el frontend completa después (id local, dueño, estado).
    const movsAsignadosFinal = new Set<string>()
    const lineas: LineaJrPersistida[] = (parsed.lineas as Array<{ nombre?: string; descripcion?: string; movimientos_ids?: string[] }>)
      .map((linea, i) => {
        const movsLimpios: string[] = []
        for (const movId of linea.movimientos_ids ?? []) {
          if (movsIdsValidos.has(movId) && !movsAsignadosFinal.has(movId)) {
            movsLimpios.push(movId)
            movsAsignadosFinal.add(movId)
          }
        }
        return {
          id: `linea-${i + 1}-${Date.now()}`,
          nombre: (linea.nombre ?? `Línea ${i + 1}`).trim(),
          descripcion: (linea.descripcion ?? '').trim(),
          movimientos_ids: movsLimpios,
          dueno_jr_email: '',
          dueno_jr_nombre: '',
          estado: 'borrador',
        } as LineaJrPersistida
      })
      .filter(l => l.movimientos_ids.length > 0)

    console.log('[sugerir-lineas-jr] done', JSON.stringify({
      plan_id: planId,
      lineas_count: lineas.length,
      movs_cubiertos: movsAsignadosFinal.size,
      movs_no_asignados: noAsignados.length,
      warnings_count: warnings.length,
      costo_usd: costoUsd,
      latencia_ms: latenciaMs,
    }))

    return NextResponse.json({
      ok: true,
      lineas,
      movs_no_asignados: noAsignados,
      warnings,
      metricas: { costo_usd: costoUsd, latencia_ms: latenciaMs },
    })
  } catch (err) {
    const errAny = err as any
    console.error('[sugerir-lineas-jr] UNCAUGHT:', errAny?.message, errAny?.stack)
    return NextResponse.json({
      error: `Error interno: ${errAny?.message ?? String(err)}`,
    }, { status: 500 })
  }
}
