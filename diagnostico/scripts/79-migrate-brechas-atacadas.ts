// Migración: poblar `brechas_atacadas` en los movimientos del inventario del
// Plan Sr de Terravinci (`recFMWxoE5gTQQrf7`) usando Opus.
//
// Estrategia:
//   1. Lee el inventario actual.
//   2. Para cada mov sin `brechas_atacadas`, llama a Opus pasándole los datos
//      del mov + la lista de métricas del propósito.
//   3. Opus devuelve un array JSON con los nombres exactos de las métricas
//      que ataca ese mov.
//   4. Valida que los nombres existan en proposito.metricas (case-sensitive).
//   5. Persiste el inventario actualizado en una sola escritura.

import { getPlanEstrategico, updatePlanEstrategico } from '@/lib/airtable'
import Anthropic from '@anthropic-ai/sdk'
import type { MovimientoPE, PlanoPE } from '@/lib/types'

const PLAN_SR_ID = 'recFMWxoE5gTQQrf7'
const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'

const OPUS_INPUT_PER_M = 15
const OPUS_OUTPUT_PER_M = 75

const SYSTEM_PROMPT = `Sos un asistente de análisis estratégico. Tu única tarea es, dado un movimiento del inventario de un plan estratégico + la lista de métricas del propósito, determinar cuáles métricas ataca ese movimiento.

REGLAS:
- Devolvé EXCLUSIVAMENTE un array JSON con strings — los nombres exactos de las métricas que ataca este movimiento.
- Cada string debe coincidir EXACTAMENTE (case-sensitive, con acentos, espacios y slashes) con uno de los nombres de métrica que te paso. NO inventes nombres ni los modifiques.
- Mínimo 1 entrada. Si dudás entre 2 métricas, incluí ambas (mejor sobre-incluir que sub-incluir — el usuario edita después).
- Mirá: nombre, descripcion, que_resuelve, ataca_desvio, criterio_exito del movimiento. La métrica que ataca tiene que estar conectada con al menos uno de esos campos.
- Output: solo el array, sin texto antes ni después.

Ejemplo de output:
["Confianza", "Volumen / capacidad instalada"]`

function buildUserMessage(mov: MovimientoPE, metricas: Array<{ metrica: string; valor_objetivo: string; valor_actual: string }>): string {
  return `## Métricas del propósito (opciones válidas):
${metricas.map((m, i) => `${i + 1}. "${m.metrica}" — actual: ${m.valor_actual || '(sin baseline)'} | target: ${m.valor_objetivo}`).join('\n')}

## Movimiento a clasificar:

ID: ${mov.id}
Nombre: ${mov.nombre}
Descripción: ${mov.descripcion ?? '(no declarada)'}
Qué resuelve: ${mov.que_resuelve}
Ataca desvío (texto libre): ${mov.ataca_desvio}
Criterio de éxito: ${mov.criterio_exito}

¿Cuáles métricas del propósito (de la lista) ataca este movimiento? Devolvé solo el array JSON.`
}

async function main() {
  if ((PLAN_SR_ID as string) === (PLAN_DUMMY_ID as string)) throw new Error('Sanity check')

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const plan = await getPlanEstrategico(PLAN_SR_ID)
  const inv = plan.plan?.inventario
  if (!inv) { console.log('❌ No hay inventario'); process.exit(1) }
  const metricas = plan.proposito?.metricas ?? []
  if (metricas.length === 0) { console.log('❌ No hay métricas en propósito'); process.exit(1) }

  console.log(`[migrate] Inventario: ${inv.movimientos.length} movs. Métricas del propósito: ${metricas.length}`)
  const nombresValidos = new Set(metricas.map(m => m.metrica))

  const pendientes = inv.movimientos.filter(m => !m.brechas_atacadas || m.brechas_atacadas.length === 0)
  console.log(`[migrate] Movs sin brechas_atacadas: ${pendientes.length}/${inv.movimientos.length}`)
  if (pendientes.length === 0) {
    console.log('[migrate] Todos los movs ya tienen brechas. No-op.')
    return
  }

  const start = Date.now()
  let costoUsd = 0
  const updates: Array<{ id: string; brechas: string[] }> = []

  for (const mov of pendientes) {
    process.stdout.write(`[migrate] ${mov.id} "${mov.nombre.slice(0, 50)}"... `)
    try {
      const stream = anthropic.messages.stream({
        model: 'claude-opus-4-7',
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage(mov, metricas) }],
      })
      const finalMsg = await stream.finalMessage()
      const text = finalMsg.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map(c => c.text)
        .join('\n')
      costoUsd += (finalMsg.usage.input_tokens * OPUS_INPUT_PER_M + finalMsg.usage.output_tokens * OPUS_OUTPUT_PER_M) / 1_000_000

      let parsed: any
      try {
        parsed = JSON.parse(text.trim())
      } catch {
        const m = text.match(/\[[\s\S]*\]/)
        if (m) try { parsed = JSON.parse(m[0]) } catch { /* fall-through */ }
      }
      if (!Array.isArray(parsed) || parsed.some((x: any) => typeof x !== 'string')) {
        console.log(`❌ output no parseable: ${text.slice(0, 100)}`)
        continue
      }
      const brechas: string[] = parsed.filter((s: string) => nombresValidos.has(s))
      const invalidos = parsed.filter((s: string) => !nombresValidos.has(s))
      if (invalidos.length > 0) {
        console.log(`⚠ ${invalidos.length} nombres inválidos descartados (${invalidos.join(', ')}) — `)
      }
      if (brechas.length === 0) {
        console.log(`❌ Opus no devolvió ninguna métrica válida`)
        continue
      }
      updates.push({ id: mov.id, brechas })
      console.log(`✓ ${brechas.length}: ${brechas.join(' · ')}`)
    } catch (e) {
      console.log(`❌ error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (updates.length === 0) {
    console.log('\n[migrate] ❌ No se generaron updates. Aborto sin persistir.')
    process.exit(1)
  }

  console.log(`\n[migrate] Updates a persistir: ${updates.length}/${pendientes.length}`)
  const updatesById = new Map(updates.map(u => [u.id, u.brechas]))
  const movimientosActualizados: MovimientoPE[] = inv.movimientos.map(m => {
    const nuevas = updatesById.get(m.id)
    return nuevas ? { ...m, brechas_atacadas: nuevas } : m
  })

  const planActualizado: PlanoPE = {
    ...plan.plan,
    inventario: { ...inv, movimientos: movimientosActualizados },
  }
  await updatePlanEstrategico(PLAN_SR_ID, { plan: planActualizado })

  const latenciaS = (Date.now() - start) / 1000
  console.log(`\n[migrate] ✓ Persistido. Costo total: $${costoUsd.toFixed(3)} · Latencia: ${latenciaS.toFixed(1)}s`)
}

main().catch(e => { console.error('[migrate] FATAL:', e); process.exit(1) })
