// POST /api/planes-estrategicos/[id]/draft/chat
//
// Chat de edición: el modelo explica el IMPACTO del pedido y PROPONE cambios
// estructurales (no los aplica — el usuario los confirma con draft/aplicar-cambios).
// Persiste la conversación en el borrador.
//
// Body: { mensaje: string }
// Response: { ok, respuesta: string, cambios: ReconcileChange[] }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { PE_MODEL } from '@/lib/llm-config'
import { checkPlanAccess } from '@/lib/auth-ownership'
import { getPlanDraft, updatePlanDraft } from '@/lib/airtable'
import {
  draftComoPlan,
  buildDraftChatSystemPrompt,
  buildDraftChatUserMessage,
} from '@/lib/draft-chat-prompt'
import type { ReconcileChange, DraftMovCambio } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
export const maxDuration = 120

const SURFACES_FUERA = new Set(['inventario', 'dag', 'otro'])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const access = await checkPlanAccess(session.user as any, planId)
  if (!access.allowed || !access.plan) {
    return NextResponse.json({ error: access.error ?? 'Sin acceso' }, { status: access.status ?? 403 })
  }
  const mensaje = (((await req.json().catch(() => ({})))?.mensaje) ?? '').toString().trim()
  if (!mensaje) return NextResponse.json({ error: 'Falta el mensaje.' }, { status: 400 })

  const draft = await getPlanDraft(planId)
  if (!draft) return NextResponse.json({ error: 'No hay borrador. Entrá a modo edición primero.' }, { status: 409 })

  const draftPlan = draftComoPlan(draft)
  let text = ''
  try {
    const stream = anthropic.messages.stream({
      model: PE_MODEL,
      max_tokens: 8000,
      system: buildDraftChatSystemPrompt(),
      messages: [{ role: 'user', content: buildDraftChatUserMessage(access.plan, draftPlan, draft.mensajes, mensaje) }],
    })
    const final = await stream.finalMessage()
    text = final.content.filter((c): c is Anthropic.TextBlock => c.type === 'text').map(c => c.text).join('\n')
  } catch (e) {
    return NextResponse.json({ error: `La IA falló: ${(e as any)?.message ?? e}` }, { status: 500 })
  }

  const parsed = parseJsonObject(text)
  const respuesta: string = parsed && typeof parsed.respuesta === 'string' ? parsed.respuesta : (text || 'No pude procesar la respuesta.')
  const rawCambios: any[] = parsed && Array.isArray(parsed.cambios) ? parsed.cambios : []
  const cambios: ReconcileChange[] = rawCambios.map((c: any, i: number) => {
    const surface = c.surface ?? 'otro'
    return {
      id: `RC-${Date.now()}-${i + 1}`,
      surface,
      target_ref: c.target_ref ?? '',
      severidad: (['Alta', 'Media', 'Baja'].includes(c.severidad) ? c.severidad : 'Media'),
      que_dice_estructura: String(c.que_dice_estructura ?? ''),
      que_dice_narrativa: String(c.que_dice_narrativa ?? ''),
      cambio_propuesto: String(c.cambio_propuesto ?? ''),
      fuera_de_alcance: c.fuera_de_alcance === true || SURFACES_FUERA.has(surface),
    } as ReconcileChange
  }).filter(c => c.cambio_propuesto)

  const rawInv: any[] = parsed && Array.isArray(parsed.cambios_inventario) ? parsed.cambios_inventario : []
  const cambiosInventario: DraftMovCambio[] = rawInv.map((c: any, i: number) => ({
    id: `MV-${Date.now()}-${i + 1}`,
    mov_id: String(c.mov_id ?? ''),
    campo: c.campo,
    valor_anterior: c.valor_anterior,
    valor_nuevo: c.valor_nuevo,
    dep: c.dep,
    motivo: c.motivo,
    severidad: (['Alta', 'Media', 'Baja'].includes(c.severidad) ? c.severidad : 'Media'),
  } as DraftMovCambio)).filter(c => c.mov_id && (c.campo || c.dep))

  // Persistir la conversación en el borrador.
  const ahora = new Date().toISOString()
  draft.mensajes.push({ rol: 'user', texto: mensaje, ts: ahora })
  draft.mensajes.push({ rol: 'model', texto: respuesta, ts: ahora, cambios_propuestos: cambios, cambios_inventario: cambiosInventario })
  draft.actualizado_en = ahora
  await updatePlanDraft(planId, draft)

  return NextResponse.json({ ok: true, respuesta, cambios, cambios_inventario: cambiosInventario })
}

function parseJsonObject(text: string): any {
  try { return JSON.parse(text) } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence?.[1]) { try { return JSON.parse(fence[1].trim()) } catch {} }
  const fb = text.indexOf('{'), lb = text.lastIndexOf('}')
  if (fb !== -1 && lb > fb) { try { return JSON.parse(text.slice(fb, lb + 1)) } catch {} }
  return null
}
