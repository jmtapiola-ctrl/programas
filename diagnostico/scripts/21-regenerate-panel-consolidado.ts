// Fase 3 paso 2: regenerar PANEL_UPDATE consolidado del Plan Sr de Terravinci
// vía 1 llamada a Opus 4.7 con el historial completo (106 turnos) + prompt
// específico pidiendo TODOS los campos del contrato poblados según lo acordado.
//
// NO persiste — solo guarda el JSON en disco y lo imprime para revisión humana.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { getEntrevistaPE, getPlanEstrategico } from '@/lib/airtable'
import { buildSystemPrompt } from '@/lib/pe-system-prompt'
import { parsePanelUpdate } from '@/lib/pe-panel-update'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const TARGET_PLAN_ID = 'recFMWxoE5gTQQrf7'

// Prompt focalizado: pide al modelo regenerar el PANEL_UPDATE final consolidado
// reflejando TODOS los acuerdos de la conversación. Esto es una recolección
// post-mortem, no un turno conversacional.
const PROMPT_REGENERACION = `[INTERVENCIÓN ADMINISTRATIVA — NO ES UNA RESPUESTA AL ÚLTIMO MENSAJE DEL USUARIO]

Soy el sistema (no el ejecutivo). Te interrumpo porque hubo un bug de persistencia: durante esta entrevista, la mayoría de los PANEL_UPDATEs que emitiste fueron parciales o no llegaron a Airtable. Como consecuencia, el panel lateral está casi vacío (solo "Proposito Escena" y "Proposito Metricas" están poblados). Necesitamos curar los datos.

Tu tarea: leé toda la entrevista completa que tenés en el contexto (los ~106 turnos previos) y emití UN solo bloque PANEL_UPDATE consolidado que refleje TODO el estado acumulado del plan tal como quedó al final del Paso 2.

Reglas estrictas:
1. Emití SOLO el bloque PANEL_UPDATE entre los marcadores <!--PANEL_UPDATE-->...<!--/PANEL_UPDATE-->. Ningún texto antes ni después del bloque.
2. TODOS los 18 campos del contrato deben estar presentes (es un Plan Sr, sin alineacion_sr).
3. Los arrays deben contener TODOS los ítems acordados en la conversación, no muestras parciales:
   - "fuera": esperá ~8 ítems (todo lo que se dejó deliberadamente afuera).
   - "metricas": esperá ~7 ítems (incluyendo PAI con disciplina de churn proxy y banco de tierras con mix geográfico).
   - "desvios_secundarios": esperá ~3 ítems (PR/Marca, PAI, infraestructura legal-fiscal o similar según se haya reformulado).
   - "resistencias": todas las que se nombraron en sub-bloque 2.G.
   - "datos_faltantes": todos los datos que quedaron pendientes a lo largo de la conversación.
4. Los campos string como "causa_raiz", "consecuencia_6m", "consecuencia_12m", "recursos_actuales", "recursos_faltantes", "intentos_previos" deben estar poblados con lo último acordado en la conversación.
5. "paso_actual": 2 (cerramos Paso 2). "sub_bloque_actual": "2.G" o el último sub-bloque trabajado.
6. "proposito.escena": la versión FINAL acordada (V7 consolidada con División Hacedora de Dueños y máquina 100→1000+).
7. "proposito.estabilidad": la nota sobre estabilidad acordada en sub-bloque 1.E.
8. JSON estrictamente válido. Comillas dobles, sin trailing commas, escape correcto de caracteres especiales en strings (incluido saltos de línea como \\n si los hay).

No agregues comentarios, explicaciones, ni texto fuera del bloque. Solo el JSON.`

async function main() {
  console.log('═'.repeat(72))
  console.log('FASE 3 PASO 2 — Regenerar PANEL_UPDATE consolidado')
  console.log('═'.repeat(72))

  const plan = await getPlanEstrategico(TARGET_PLAN_ID)
  const entrevista = await getEntrevistaPE(TARGET_PLAN_ID)
  if (!entrevista) throw new Error('Entrevista no encontrada')
  console.log(`Plan: ${plan.nombre}`)
  console.log(`Entrevista: ${entrevista.id}, ${entrevista.historial.length} turnos`)
  console.log()

  // Construir messages: TODO el historial + prompt focalizado como nuevo user
  const messages = entrevista.historial.map(t => ({
    role: t.rol === 'model' ? 'assistant' as const : 'user' as const,
    content: t.contenido,
  }))
  messages.push({ role: 'user' as const, content: PROMPT_REGENERACION })

  const systemPrompt = buildSystemPrompt(plan, null)
  console.log(`System prompt: ${systemPrompt.length.toLocaleString()} chars`)
  console.log(`Messages: ${messages.length} (último = prompt de regeneración)`)
  console.log()

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  console.log('Llamando a claude-opus-4-7 (max_tokens=16000)...')
  const start = Date.now()
  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 16000,
    system: systemPrompt,
    messages,
  })
  const latency = Date.now() - start
  console.log(`✔ Respuesta en ${(latency / 1000).toFixed(1)}s — input=${resp.usage.input_tokens} output=${resp.usage.output_tokens} costo aprox $${((resp.usage.input_tokens * 15 + resp.usage.output_tokens * 75) / 1_000_000).toFixed(2)}`)
  console.log(`stop_reason: ${resp.stop_reason}`)

  const fullText = resp.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map(c => c.text)
    .join('\n')

  // Validar con el parser strict
  const parseResult = parsePanelUpdate(fullText)
  console.log()
  if (parseResult.ok) {
    console.log('✔ PANEL_UPDATE válido')
  } else {
    console.log(`✗ PANEL_UPDATE inválido (${parseResult.reason})`)
    for (const e of parseResult.errors) console.log(`  - ${e}`)
  }

  // Estadísticas rápidas para el reviewer
  if (parseResult.ok) {
    const d = parseResult.data
    console.log()
    console.log('─── Resumen rápido del JSON regenerado ───')
    console.log(`paso_actual: ${d.paso_actual}, sub_bloque_actual: "${d.sub_bloque_actual}"`)
    console.log(`proposito.escena: ${d.proposito.escena.length} chars`)
    console.log(`proposito.metricas: ${d.proposito.metricas.length} ítems  (esperado: ~7)`)
    console.log(`proposito.fuera: ${d.proposito.fuera.length} ítems  (esperado: ~8)`)
    console.log(`proposito.horizonte: "${d.proposito.horizonte}"`)
    console.log(`proposito.estabilidad: ${d.proposito.estabilidad.length} chars`)
    console.log(`situacion.desvio_principal: ${d.situacion.desvio_principal.length} chars`)
    console.log(`situacion.desvio_cuantificado: ${d.situacion.desvio_cuantificado.length} chars`)
    console.log(`situacion.desvios_secundarios: ${d.situacion.desvios_secundarios.length} ítems  (esperado: ~3)`)
    console.log(`situacion.causa_raiz: ${d.situacion.causa_raiz.length} chars`)
    console.log(`situacion.consecuencia_6m: ${d.situacion.consecuencia_6m.length} chars`)
    console.log(`situacion.consecuencia_12m: ${d.situacion.consecuencia_12m.length} chars`)
    console.log(`situacion.recursos_actuales: ${d.situacion.recursos_actuales.length} chars`)
    console.log(`situacion.recursos_faltantes: ${d.situacion.recursos_faltantes.length} chars`)
    console.log(`situacion.intentos_previos: ${d.situacion.intentos_previos.length} chars`)
    console.log(`situacion.resistencias: ${d.situacion.resistencias.length} ítems  (esperado: varias)`)
    console.log(`datos_faltantes: ${d.datos_faltantes.length} ítems`)
  }

  // Guardar todo a disco para revisión humana + persistencia posterior
  const outPath = path.join(ROOT, 'output', '21-panel-consolidado.json')
  fs.writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    input_tokens: resp.usage.input_tokens,
    output_tokens: resp.usage.output_tokens,
    latency_ms: latency,
    stop_reason: resp.stop_reason,
    parse_result: parseResult,
    full_response: fullText,
  }, null, 2))
  console.log()
  console.log(`✔ Guardado: ${outPath}`)
  console.log()
  console.log('SIGUIENTE PASO:')
  console.log('  El JSON está listo para revisión humana.')
  console.log('  Mostrame al usuario el contenido para que lo apruebe ANTES de persistir.')
  console.log('  No correr 22-persist-* hasta tener aprobación explícita.')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
