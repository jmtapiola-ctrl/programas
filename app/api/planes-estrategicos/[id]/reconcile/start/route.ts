// POST /api/planes-estrategicos/[id]/reconcile/start
//
// Coordinación (reconcile) — Stage A: compara el plan estructurado contra la
// narrativa editada y devuelve un ReconcileChangeset con las divergencias. NO
// aplica nada (eso es reconcile/apply). Solo detección.
//
// Response: { ok: true, changeset: ReconcileChangeset }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { PE_MODEL } from '@/lib/llm-config'
import { checkPlanAccess } from '@/lib/auth-ownership'
import { getPlanNarrativa } from '@/lib/airtable'
import {
  buildReconcileEstructuraMd,
  buildReconcileSystemPrompt,
  buildReconcileUserMessage,
} from '@/lib/reconcile-prompt'
import type { ReconcileChange, ReconcileChangeset } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
export const maxDuration = 300

const SURFACES_FUERA_ALCANCE = new Set(['inventario', 'dag', 'otro'])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const access = await checkPlanAccess(session.user as any, planId)
  if (!access.allowed || !access.plan) {
    return NextResponse.json({ error: access.error ?? 'Sin acceso' }, { status: access.status ?? 403 })
  }
  const plan = access.plan

  const narrativa = await getPlanNarrativa(planId)
  if (!narrativa) {
    return NextResponse.json({ error: 'No hay narrativa para coordinar. Entrá a modo edición primero.' }, { status: 409 })
  }

  const estructuraMd = buildReconcileEstructuraMd(plan)
  let text = ''
  try {
    const stream = anthropic.messages.stream({
      model: PE_MODEL,
      max_tokens: 16000,
      system: buildReconcileSystemPrompt(),
      messages: [{ role: 'user', content: buildReconcileUserMessage(estructuraMd, narrativa.prosa) }],
    })
    const final = await stream.finalMessage()
    text = final.content.filter((c): c is Anthropic.TextBlock => c.type === 'text').map(c => c.text).join('\n')
  } catch (e) {
    return NextResponse.json({ error: `La IA falló al coordinar: ${(e as any)?.message ?? e}` }, { status: 500 })
  }

  const parsed = parseJsonObject(text)
  if (!parsed || !Array.isArray(parsed.changes)) {
    return NextResponse.json({ error: 'La coordinación devolvió un resultado no parseable.', preview: text.slice(0, 400) }, { status: 500 })
  }

  const changes: ReconcileChange[] = parsed.changes.map((c: any, i: number) => {
    const surface = c.surface ?? 'otro'
    const fuera = c.fuera_de_alcance === true || SURFACES_FUERA_ALCANCE.has(surface)
    return {
      id: `RC-${i + 1}`,
      surface,
      target_ref: c.target_ref ?? '',
      severidad: (['Alta', 'Media', 'Baja'].includes(c.severidad) ? c.severidad : 'Media'),
      que_dice_estructura: String(c.que_dice_estructura ?? ''),
      que_dice_narrativa: String(c.que_dice_narrativa ?? ''),
      cambio_propuesto: String(c.cambio_propuesto ?? ''),
      fuera_de_alcance: fuera,
    } as ReconcileChange
  }).filter((c: ReconcileChange) => c.que_dice_estructura && c.cambio_propuesto)

  const fueraCount = changes.filter(c => c.fuera_de_alcance).length
  const changeset: ReconcileChangeset = {
    changes,
    meta: {
      total: changes.length,
      aplicables: changes.length - fueraCount,
      fuera_de_alcance: fueraCount,
      confianza: (['Alta', 'Media', 'Baja'].includes(parsed.confianza) ? parsed.confianza : 'Media'),
    },
  }

  return NextResponse.json({ ok: true, changeset })
}

function parseJsonObject(text: string): any {
  try { return JSON.parse(text) } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence?.[1]) { try { return JSON.parse(fence[1].trim()) } catch {} }
  const fb = text.indexOf('{'), lb = text.lastIndexOf('}')
  if (fb !== -1 && lb > fb) { try { return JSON.parse(text.slice(fb, lb + 1)) } catch {} }
  return null
}
