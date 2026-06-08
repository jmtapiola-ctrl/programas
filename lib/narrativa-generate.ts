// Generación de la capa narrativa desde el plan estructurado. Compartido entre
// el endpoint narrativa/generar (entrar a edición) y reconcile/apply (regenerar
// la prosa tras coordinar). Aislado acá para no duplicar la llamada al LLM.

import Anthropic from '@anthropic-ai/sdk'
import { PE_MODEL } from './llm-config'
import {
  buildNarrativaSourceMd,
  buildNarrativaGenSystemPrompt,
  buildNarrativaGenUserMessage,
} from './narrativa-prompt'
import type { PlanEstrategico, PlanNarrativa } from './types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function parseJsonObject(text: string): any {
  try { return JSON.parse(text) } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence?.[1]) { try { return JSON.parse(fence[1].trim()) } catch {} }
  const fb = text.indexOf('{'), lb = text.lastIndexOf('}')
  if (fb !== -1 && lb > fb) { try { return JSON.parse(text.slice(fb, lb + 1)) } catch {} }
  return null
}

// Genera la prosa + anclas desde el plan estructurado. Lanza si la IA falla o
// devuelve algo no parseable.
export async function generarNarrativaDesdePlan(plan: PlanEstrategico): Promise<PlanNarrativa> {
  const sourceMd = buildNarrativaSourceMd(plan)
  const stream = anthropic.messages.stream({
    model: PE_MODEL,
    max_tokens: 16000,
    system: buildNarrativaGenSystemPrompt(),
    messages: [{ role: 'user', content: buildNarrativaGenUserMessage(sourceMd) }],
  })
  const final = await stream.finalMessage()
  const text = final.content.filter((c): c is Anthropic.TextBlock => c.type === 'text').map(c => c.text).join('\n')
  const parsed = parseJsonObject(text)
  if (!parsed || typeof parsed.prosa !== 'string') {
    throw new Error('La IA devolvió una narrativa no parseable.')
  }
  return {
    prosa: parsed.prosa,
    generada_desde_version: plan.version_activa_label ?? 'V1',
    generada_en: new Date().toISOString(),
    anclas: Array.isArray(parsed.anclas) ? parsed.anclas : [],
  }
}
