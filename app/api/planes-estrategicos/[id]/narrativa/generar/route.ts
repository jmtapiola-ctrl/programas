// POST /api/planes-estrategicos/[id]/narrativa/generar
//
// Entra en modo edición de un plan cerrado: setea Editable=true y genera la capa
// narrativa (prosa del plan entero) si todavía no existe. Idempotente: si ya hay
// narrativa, la devuelve sin regenerar (salvo body.force=true).
//
// Body: { force?: boolean }
// Response: { ok: true, narrativa: PlanNarrativa }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { PE_MODEL } from '@/lib/llm-config'
import { checkPlanAccess } from '@/lib/auth-ownership'
import { getPlanNarrativa, updatePlanNarrativa, updatePlanEstrategico } from '@/lib/airtable'
import {
  buildNarrativaSourceMd,
  buildNarrativaGenSystemPrompt,
  buildNarrativaGenUserMessage,
} from '@/lib/narrativa-prompt'
import type { PlanNarrativa } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const access = await checkPlanAccess(session.user as any, planId)
  if (!access.allowed || !access.plan) {
    return NextResponse.json({ error: access.error ?? 'Sin acceso' }, { status: access.status ?? 403 })
  }
  const plan = access.plan
  const body = await req.json().catch(() => ({}))
  const force = body?.force === true

  // Entrar a modo edición.
  await updatePlanEstrategico(planId, { editable: true })

  // Si ya hay narrativa y no se fuerza, devolverla.
  const existente = await getPlanNarrativa(planId)
  if (existente && !force) {
    return NextResponse.json({ ok: true, narrativa: existente, regenerada: false })
  }

  // Generar la prosa + anclas desde el plan estructurado.
  const sourceMd = buildNarrativaSourceMd(plan)
  let text = ''
  try {
    const stream = anthropic.messages.stream({
      model: PE_MODEL,
      max_tokens: 16000,
      system: buildNarrativaGenSystemPrompt(),
      messages: [{ role: 'user', content: buildNarrativaGenUserMessage(sourceMd) }],
    })
    const final = await stream.finalMessage()
    text = final.content.filter((c): c is Anthropic.TextBlock => c.type === 'text').map(c => c.text).join('\n')
  } catch (e) {
    return NextResponse.json({ error: `La IA falló al generar la narrativa: ${(e as any)?.message ?? e}` }, { status: 500 })
  }

  const parsed = parseJsonObject(text)
  if (!parsed || typeof parsed.prosa !== 'string') {
    return NextResponse.json({ error: 'La IA devolvió una narrativa no parseable.', preview: text.slice(0, 400) }, { status: 500 })
  }

  const narrativa: PlanNarrativa = {
    prosa: parsed.prosa,
    generada_desde_version: plan.version_activa_label ?? 'V1',
    generada_en: new Date().toISOString(),
    anclas: Array.isArray(parsed.anclas) ? parsed.anclas : [],
  }
  await updatePlanNarrativa(planId, narrativa)
  return NextResponse.json({ ok: true, narrativa, regenerada: true })
}

function parseJsonObject(text: string): any {
  try { return JSON.parse(text) } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence?.[1]) { try { return JSON.parse(fence[1].trim()) } catch {} }
  const fb = text.indexOf('{'), lb = text.lastIndexOf('}')
  if (fb !== -1 && lb > fb) { try { return JSON.parse(text.slice(fb, lb + 1)) } catch {} }
  return null
}
