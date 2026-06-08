// POST /api/planes-estrategicos/[id]/narrativa/chat
//
// Edita la capa narrativa (prosa) de un plan según un pedido en lenguaje natural.
// NO toca el plan estructurado — solo la prosa (scratchpad). La reconciliación
// estructura↔narrativa es un paso aparte (Hito 2).
//
// Body: { mensaje: string }
// Response: { ok: true, narrativa: PlanNarrativa, resumen_cambio: string }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { PE_MODEL } from '@/lib/llm-config'
import { checkPlanAccess } from '@/lib/auth-ownership'
import { getPlanNarrativa, updatePlanNarrativa } from '@/lib/airtable'
import {
  buildNarrativaChatSystemPrompt,
  buildNarrativaChatUserMessage,
} from '@/lib/narrativa-prompt'
import type { PlanNarrativa } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const access = await checkPlanAccess(session.user as any, planId)
  if (!access.allowed) {
    return NextResponse.json({ error: access.error ?? 'Sin acceso' }, { status: access.status ?? 403 })
  }

  const body = await req.json().catch(() => ({}))
  const mensaje = (body?.mensaje ?? '').toString().trim()
  if (!mensaje) return NextResponse.json({ error: 'Falta el mensaje.' }, { status: 400 })

  const narrativa = await getPlanNarrativa(planId)
  if (!narrativa) {
    return NextResponse.json({ error: 'No hay narrativa generada. Entrá a modo edición primero.' }, { status: 409 })
  }

  let text = ''
  try {
    const stream = anthropic.messages.stream({
      model: PE_MODEL,
      max_tokens: 16000,
      system: buildNarrativaChatSystemPrompt(),
      messages: [{ role: 'user', content: buildNarrativaChatUserMessage(narrativa.prosa, mensaje) }],
    })
    const final = await stream.finalMessage()
    text = final.content.filter((c): c is Anthropic.TextBlock => c.type === 'text').map(c => c.text).join('\n')
  } catch (e) {
    return NextResponse.json({ error: `La IA falló al editar la narrativa: ${(e as any)?.message ?? e}` }, { status: 500 })
  }

  const parsed = parseJsonObject(text)
  if (!parsed || typeof parsed.prosa !== 'string') {
    return NextResponse.json({ error: 'La IA devolvió una respuesta no parseable.', preview: text.slice(0, 400) }, { status: 500 })
  }

  const actualizada: PlanNarrativa = {
    ...narrativa,
    prosa: parsed.prosa,
    editada_en: new Date().toISOString(),
  }
  await updatePlanNarrativa(planId, actualizada)
  return NextResponse.json({
    ok: true,
    narrativa: actualizada,
    resumen_cambio: typeof parsed.resumen_cambio === 'string' ? parsed.resumen_cambio : '',
  })
}

function parseJsonObject(text: string): any {
  try { return JSON.parse(text) } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence?.[1]) { try { return JSON.parse(fence[1].trim()) } catch {} }
  const fb = text.indexOf('{'), lb = text.lastIndexOf('}')
  if (fb !== -1 && lb > fb) { try { return JSON.parse(text.slice(fb, lb + 1)) } catch {} }
  return null
}
