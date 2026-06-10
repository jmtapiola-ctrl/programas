// POST /api/planes-estrategicos/[id]/proponer-contexto-curado
//
// Llamada desde el wizard de despliegue del Jr (Fase 3). El [id] es el del
// Plan Jr (no del Sr). El endpoint:
//   1. Carga el Plan Jr.
//   2. Verifica que tipo='Jr', estado='Pendiente despliegue'.
//   3. Carga el Plan Sr asociado vía plan_sr_id.
//   4. Resuelve la línea Jr correspondiente en planSr.lineas_jr buscando por
//      plan_jr_id (set durante /crear-lineas-jr).
//   5. Resuelve los movs heredados desde el inventario del Sr por ID.
//   6. Llama a Opus con el contexto-curado-jr-prompt → JSON con los 5 campos.
//   7. Devuelve los campos al frontend para que el Sr/Admin los edite/apruebe.
//
// Modos:
//   - Sin query param: generación completa → devuelve { contexto_curado }.
//   - ?campo=<key>: regeneración de UN campo → devuelve { campo, valor }. El
//     body lleva { valores_actuales } (los otros 4 campos editados) para
//     coherencia.
//
// NO persiste nada — el persist ocurre en /confirmar-despliegue-jr.

import { PE_MODEL } from '@/lib/llm-config'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { getPlanEstrategico } from '@/lib/airtable'
import { checkPlanAccess } from '@/lib/auth-ownership'
import {
  buildContextoCuradoSystemPrompt,
  buildContextoCuradoUserMessage,
  type ContextoCuradoCampo,
} from '@/lib/contexto-curado-jr-prompt'
import { CONTEXTO_CURADO_CAMPOS } from '@/lib/types'
import type { MovimientoPE, ContextoCuradoJr } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const OPUS_INPUT_PER_M = 15
const OPUS_OUTPUT_PER_M = 75

export const maxDuration = 300

const CAMPO_KEYS = CONTEXTO_CURADO_CAMPOS.map(c => c.key) as ContextoCuradoCampo[]

// Parsea el JSON que devuelve Opus, tolerando fences ```json y texto alrededor.
function parseJsonObjeto(raw: string): Record<string, unknown> {
  let s = raw.trim()
  const fence = s.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/)
  if (fence?.[1]) s = fence[1].trim()
  // Si hay texto antes/después, intentá recortar al primer { y último }.
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first > 0 || last < s.length - 1) {
    if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1)
  }
  return JSON.parse(s)
}

export async function POST(
  req: NextRequest,
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

    const { id: planJrId } = await params

    // Modo: campo individual o completo.
    const campoParam = req.nextUrl.searchParams.get('campo') as ContextoCuradoCampo | null
    if (campoParam && !CAMPO_KEYS.includes(campoParam)) {
      return NextResponse.json({ error: `Campo inválido: "${campoParam}".` }, { status: 400 })
    }

    const access = await checkPlanAccess(user, planJrId)
    if (!access.allowed) {
      return NextResponse.json({ error: access.error ?? 'No autorizado' }, { status: access.status ?? 403 })
    }
    const planJr = access.plan!

    if (planJr.tipo !== 'Jr') {
      return NextResponse.json({ error: 'Este endpoint solo aplica a Planes Jr.' }, { status: 409 })
    }
    if (planJr.estado !== 'Pendiente despliegue') {
      return NextResponse.json({
        error: `El Jr está en estado "${planJr.estado}" — solo se puede proponer contexto desde "Pendiente despliegue".`,
      }, { status: 409 })
    }
    if (!planJr.plan_sr_id) {
      return NextResponse.json({ error: 'El Jr no tiene plan_sr_id — no se puede resolver el Sr.' }, { status: 500 })
    }

    const rol = user.role
    if (rol === 'Plan Jr' || rol === 'Operador') {
      return NextResponse.json({ error: 'No tenés permisos para desplegar Planes Jr.' }, { status: 403 })
    }

    // Modo campo: leer los valores actuales de los otros campos (coherencia).
    let valoresActuales: ContextoCuradoJr | undefined
    if (campoParam) {
      const body = await req.json().catch(() => null) as { valores_actuales?: ContextoCuradoJr } | null
      valoresActuales = body?.valores_actuales ?? {
        contexto: '', proposito: '', criterios_exito: '', metricas: '', supuestos: '',
      }
    }

    const planSr = await getPlanEstrategico(planJr.plan_sr_id).catch(() => null)
    if (!planSr) {
      return NextResponse.json({ error: 'Plan Sr asociado no encontrado.' }, { status: 404 })
    }

    const linea = planSr.lineas_jr?.find(l => l.plan_jr_id === planJrId)
    if (!linea) {
      return NextResponse.json({
        error: 'Plan Jr no encontrado en el Plan Sr — inconsistencia entre Jr y Sr.',
      }, { status: 500 })
    }

    const movsInventarioSr: MovimientoPE[] = planSr.plan?.inventario?.movimientos ?? []
    const movsHeredados = movsInventarioSr.filter(m => linea.movimientos_ids.includes(m.id))
    if (movsHeredados.length === 0) {
      return NextResponse.json({
        error: 'El Plan Jr no tiene movimientos heredados resolvibles en el inventario del Sr.',
      }, { status: 409 })
    }

    const movsOtrasLineasIds = new Set<string>()
    for (const l of (planSr.lineas_jr ?? [])) {
      if (l.id === linea.id) continue
      for (const mid of l.movimientos_ids) movsOtrasLineasIds.add(mid)
    }

    const systemPrompt = buildContextoCuradoSystemPrompt(campoParam ?? undefined)
    const userMessage = buildContextoCuradoUserMessage(
      planSr, linea, movsHeredados, movsOtrasLineasIds,
      campoParam ? { campo: campoParam, valoresActuales } : undefined,
    )

    console.log('[proponer-contexto-curado] start', JSON.stringify({
      plan_jr_id: planJrId,
      modo: campoParam ? `campo:${campoParam}` : 'completo',
      linea_nombre: linea.nombre,
      movs_heredados: movsHeredados.length,
      user_message_chars: userMessage.length,
    }))

    const start = Date.now()
    let costoUsd = 0
    let latenciaMs = 0
    let rawOutput = ''

    try {
      const stream = anthropic.messages.stream({
        model: PE_MODEL,
        max_tokens: campoParam ? 4000 : 12000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })
      const finalMsg = await stream.finalMessage()
      latenciaMs = Date.now() - start
      costoUsd += (finalMsg.usage.input_tokens * OPUS_INPUT_PER_M + finalMsg.usage.output_tokens * OPUS_OUTPUT_PER_M) / 1_000_000

      rawOutput = finalMsg.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map(c => c.text)
        .join('\n')
        .trim()

      if (finalMsg.stop_reason === 'max_tokens') {
        console.warn('[proponer-contexto-curado] Opus truncó por max_tokens — JSON puede estar incompleto')
      }
    } catch (e) {
      const errAny = e as any
      console.error('[proponer-contexto-curado] Opus error:', errAny?.message)
      return NextResponse.json({ error: errAny?.message ?? String(e) }, { status: 500 })
    }

    let parsed: Record<string, unknown>
    try {
      parsed = parseJsonObjeto(rawOutput)
    } catch (e) {
      console.error('[proponer-contexto-curado] JSON parse falló:', (e as any)?.message, '· raw:', rawOutput.slice(0, 300))
      return NextResponse.json({
        error: 'La IA devolvió un formato inesperado (no es JSON válido). Re-intentá.',
      }, { status: 500 })
    }

    const metricas = { costo_usd: costoUsd, latencia_ms: latenciaMs }

    // Modo campo: devolver solo ese campo.
    if (campoParam) {
      const valor = parsed[campoParam]
      if (typeof valor !== 'string' || valor.trim().length === 0) {
        return NextResponse.json({
          error: `La IA no devolvió contenido para el campo "${campoParam}". Re-intentá.`,
        }, { status: 500 })
      }
      console.log('[proponer-contexto-curado] done campo', JSON.stringify({ plan_jr_id: planJrId, campo: campoParam, chars: valor.length, ...metricas }))
      return NextResponse.json({ ok: true, campo: campoParam, valor: valor.trim(), metricas })
    }

    // Modo completo: armar el objeto contexto_curado con las 5 keys.
    const contexto_curado: ContextoCuradoJr = {
      contexto: '', proposito: '', criterios_exito: '', metricas: '', supuestos: '',
    }
    const faltantes: string[] = []
    for (const key of CAMPO_KEYS) {
      const v = parsed[key]
      if (typeof v === 'string' && v.trim().length > 0) {
        contexto_curado[key] = v.trim()
      } else {
        faltantes.push(key)
      }
    }
    if (faltantes.length === CAMPO_KEYS.length) {
      return NextResponse.json({
        error: 'La IA no devolvió ninguno de los campos esperados. Re-intentá.',
      }, { status: 500 })
    }
    if (faltantes.length > 0) {
      console.warn('[proponer-contexto-curado] campos faltantes en la salida:', faltantes.join(', '))
    }

    console.log('[proponer-contexto-curado] done', JSON.stringify({
      plan_jr_id: planJrId,
      campos_ok: CAMPO_KEYS.length - faltantes.length,
      faltantes,
      ...metricas,
    }))

    return NextResponse.json({ ok: true, contexto_curado, faltantes, metricas })
  } catch (err) {
    const errAny = err as any
    console.error('[proponer-contexto-curado] UNCAUGHT:', errAny?.message, errAny?.stack)
    return NextResponse.json({
      error: `Error interno: ${errAny?.message ?? String(err)}`,
    }, { status: 500 })
  }
}
