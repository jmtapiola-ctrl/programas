// Smoke test Fase 0.1 — emisión confiable del flag `cierre_sugerido` (RE-RUN).
//
// Cambios vs run anterior (NO-GO 1/3 → ahora target 4/4):
//   - Suma retryPanelUpdate replicado del chat route, con instrucción extra
//     sobre cierre_sugerido en la pregunta de retry (cierra brecha entre el
//     bug sistémico de no_block y el feature nuevo).
//   - Plan mocks por escenario que matchean el corte de la conversación
//     (evita el sesgo "el modelo se basa en estadoActual completo en vez de
//     la conversación cortada").
//   - Suma escenario D adversarial duro: ~80% del Paso 1 cubierto (falta
//     solo 1 sub-bloque), usuario fuerza cierre. Modelo debe emitir false
//     y nombrar qué falta. Caso límite: tentador para el modelo decir true.
//
// 4 escenarios. Criterio GO: 4/4 correctos.
//
// Output: diagnostico/output/29-cierre-sugerido-smoke.{md,json}.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { getPlanEstrategico, getEntrevistaPE, getTurnosPE } from '@/lib/airtable'
import { buildSystemPrompt } from '@/lib/pe-system-prompt'
import { parsePanelUpdate } from '@/lib/pe-panel-update'
import type { TurnoPE, PlanEstrategico, PanelUpdatePE } from '@/lib/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PLAN_ID = 'recFMWxoE5gTQQrf7' // Plan Sr de Terravinci

interface EscenarioResult {
  escenario: string
  descripcion: string
  turnos_previos: number
  ultimo_user_message: string
  esperado: boolean
  plan_mock_nivel: string
  parse_first: 'ok' | 'no_block' | 'malformed_json' | 'invalid_shape'
  retry_disparado: boolean
  retry_ok: boolean | null
  parse_final_ok: boolean
  parse_final_errors?: string[]
  cierre_sugerido: boolean | undefined
  coincide: boolean
  // Métricas combinadas (primer intento + retry si lo hubo)
  latency_ms: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
  texto_conversacional: string
}

// ─── Plan mocks para los escenarios ──────────────────────────────────────────

function planMockParcial(planReal: PlanEstrategico): PlanEstrategico {
  // ~50% del Paso 1: escena ideal definida, 2 métricas en discusión.
  // Falta: fuera, horizonte, estabilidad. Sin situación.
  return {
    ...planReal,
    proposito: {
      escena: planReal.proposito?.escena ?? '',
      metricas: (planReal.proposito?.metricas ?? []).slice(0, 2),
      fuera: [],
      horizonte: '',
      estabilidad: '',
    },
    situacion: undefined,
    datos_faltantes: [],
  }
}

function planMockCasiCompleto(planReal: PlanEstrategico): PlanEstrategico {
  // ~80% del Paso 1: escena + todas las métricas + fuera + horizonte.
  // Falta solo: estabilidad. Sin situación.
  return {
    ...planReal,
    proposito: {
      escena: planReal.proposito?.escena ?? '',
      metricas: planReal.proposito?.metricas ?? [],
      fuera: planReal.proposito?.fuera ?? [],
      horizonte: planReal.proposito?.horizonte ?? '',
      estabilidad: '', // ← lo único que falta
    },
    situacion: undefined,
    datos_faltantes: [],
  }
}

// ─── Retry mechanism (replicado del chat route) ──────────────────────────────

async function retryPanelUpdate(
  client: Anthropic,
  systemPrompt: string,
  originalMessages: Anthropic.MessageParam[],
  failedAssistantResponse: string,
): Promise<
  | { ok: true; data: PanelUpdatePE; tokens: { input: number; output: number }; latency_ms: number }
  | { ok: false; errors: string[]; tokens: { input: number; output: number }; latency_ms: number }
> {
  const instrucciones = `Tu respuesta NO incluyó el bloque PANEL_UPDATE. El bloque es OBLIGATORIO en cada turno tuyo, sin excepción.

Re-emitilo con TODO lo acumulado de la conversación. Asegurate especialmente del campo "cierre_sugerido": si considerás que el Paso actual está conceptualmente cerrado (las 4 condiciones de detección), emití true; en cualquier otro caso, false. NO omitas el campo cierre_sugerido.

Re-emití SOLO el bloque PANEL_UPDATE entre los marcadores <!--PANEL_UPDATE-->...<!--/PANEL_UPDATE-->, sin texto fuera del bloque. JSON válido, todos los campos del contrato presentes.`

  const retryMessages: Anthropic.MessageParam[] = [
    ...originalMessages,
    { role: 'assistant', content: failedAssistantResponse },
    { role: 'user', content: instrucciones },
  ]

  const start = Date.now()
  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 12000,
    system: systemPrompt,
    messages: retryMessages,
  })
  const latency = Date.now() - start
  const text = resp.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map(c => c.text)
    .join('\n')

  const tokens = { input: resp.usage.input_tokens, output: resp.usage.output_tokens }
  const result = parsePanelUpdate(text)
  if (result.ok) return { ok: true, data: result.data, tokens, latency_ms: latency }
  return { ok: false, errors: (result as any).errors ?? [], tokens, latency_ms: latency }
}

// ─── Runner por escenario ────────────────────────────────────────────────────

async function correrEscenario(
  client: Anthropic,
  esc: {
    nombre: string
    descripcion: string
    turnos: TurnoPE[]
    ultimoUserMessage: string
    esperado: boolean
    plan: PlanEstrategico
    planNivel: string
  },
): Promise<EscenarioResult> {
  console.log(`\n--- Escenario ${esc.nombre} ---`)
  console.log(`  ${esc.descripcion}`)
  console.log(`  Plan mock nivel: ${esc.planNivel}`)
  console.log(`  Turnos previos: ${esc.turnos.length}`)
  console.log(`  Último user msg: "${esc.ultimoUserMessage}"`)
  console.log(`  Esperado cierre_sugerido: ${esc.esperado}`)

  // Asegurar alternancia: si último previo es 'user', descartar.
  let turnos = esc.turnos
  while (turnos.length > 0 && turnos[turnos.length - 1].rol === 'user') {
    turnos = turnos.slice(0, -1)
  }

  const messages: Anthropic.MessageParam[] = turnos.map(t => ({
    role: t.rol === 'model' ? 'assistant' : 'user',
    content: t.contenido,
  }))
  messages.push({ role: 'user', content: esc.ultimoUserMessage })

  const systemPrompt = buildSystemPrompt(esc.plan, null)

  // Primer intento
  const start = Date.now()
  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 16000,
    system: systemPrompt,
    messages,
  })
  const firstLatency = Date.now() - start
  const firstText = resp.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map(c => c.text)
    .join('\n')

  const firstParse = parsePanelUpdate(firstText)
  const firstReason = firstParse.ok ? 'ok' : (firstParse as any).reason

  let panelUpdate: PanelUpdatePE | undefined = firstParse.ok ? firstParse.data : undefined
  let retryDisparado = false
  let retryOk: boolean | null = null
  let totalLatency = firstLatency
  let totalInput = resp.usage.input_tokens
  let totalOutput = resp.usage.output_tokens
  let parseFinalErrors: string[] | undefined = firstParse.ok ? undefined : (firstParse as any).errors

  if (!firstParse.ok) {
    retryDisparado = true
    console.log(`  primer parse: ${firstReason} → disparando retry`)
    const retry = await retryPanelUpdate(client, systemPrompt, messages, firstText)
    totalLatency += retry.latency_ms
    totalInput += retry.tokens.input
    totalOutput += retry.tokens.output
    if (retry.ok) {
      panelUpdate = retry.data
      retryOk = true
      parseFinalErrors = undefined
      console.log(`  retry: ok`)
    } else {
      retryOk = false
      parseFinalErrors = retry.errors
      console.log(`  retry: falló — errors: ${retry.errors.slice(0, 2).join(' | ')}`)
    }
  }

  const cierreSugeridoEmitido = panelUpdate?.cierre_sugerido
  const parseFinalOk = panelUpdate !== undefined
  const coincide = parseFinalOk && cierreSugeridoEmitido === esc.esperado

  // claude-opus-4-7: $15/M input, $75/M output
  const costUsd = (totalInput * 15 + totalOutput * 75) / 1_000_000

  console.log(`  cierre_sugerido emitido: ${cierreSugeridoEmitido}`)
  console.log(`  ¿coincide con esperado?: ${coincide ? '✅' : '❌'}`)
  console.log(`  latencia total: ${(totalLatency / 1000).toFixed(1)}s | tokens: ${totalInput.toLocaleString()}/${totalOutput.toLocaleString()} | costo: $${costUsd.toFixed(3)}`)

  const PANEL_RE = /<!--PANEL_UPDATE-->[\s\S]*?(<!--\/PANEL_UPDATE-->|$)/
  const textoConversacional = firstText.replace(PANEL_RE, '').trim()

  return {
    escenario: esc.nombre,
    descripcion: esc.descripcion,
    turnos_previos: turnos.length,
    ultimo_user_message: esc.ultimoUserMessage,
    esperado: esc.esperado,
    plan_mock_nivel: esc.planNivel,
    parse_first: firstReason as any,
    retry_disparado: retryDisparado,
    retry_ok: retryOk,
    parse_final_ok: parseFinalOk,
    parse_final_errors: parseFinalErrors,
    cierre_sugerido: cierreSugeridoEmitido,
    coincide,
    latency_ms: totalLatency,
    input_tokens: totalInput,
    output_tokens: totalOutput,
    cost_usd: costUsd,
    texto_conversacional: textoConversacional.slice(0, 3000),
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(72))
  console.log('Fase 0.1 — Smoke cierre_sugerido (re-run con retry + plan mocks + D)')
  console.log('═'.repeat(72))

  // 1. Cargar plan + turnos del piloto
  console.log('\nCargando datos del piloto desde Airtable...')
  const planReal = await getPlanEstrategico(PLAN_ID)
  const entrevista = await getEntrevistaPE(PLAN_ID)
  if (!entrevista) throw new Error('entrevista no encontrada')

  const turnos = await getTurnosPE(entrevista.id)
  console.log(`  Turnos totales: ${turnos.length}`)
  const turnosPaso1 = turnos.filter(t => t.paso <= 1)
  console.log(`  Turnos del Paso 0+1: ${turnosPaso1.length}`)
  if (turnosPaso1.length < 30) {
    throw new Error(`Solo ${turnosPaso1.length} turnos en Paso 0+1; el plan exige conversaciones realistas (30-50). Abortando.`)
  }

  const corte50 = Math.floor(turnosPaso1.length * 0.5)
  const corte80 = Math.floor(turnosPaso1.length * 0.8)
  console.log(`  Cortes: ~50% turno ${corte50} | ~80% turno ${corte80} | 100% turno ${turnosPaso1.length}`)

  const planA_C = planMockParcial(planReal)
  const planD = planMockCasiCompleto(planReal)
  console.log(`\n  Plan mock parcial (A,C): propósito con ${planA_C.proposito?.metricas.length} métricas, sin fuera/horizonte/estabilidad`)
  console.log(`  Plan mock casi-completo (D): propósito con escena + ${planD.proposito?.metricas.length} métricas + ${planD.proposito?.fuera.length} fuera + horizonte. Falta SOLO estabilidad`)
  console.log(`  Plan real (B): propósito y situación completos`)

  // 2. Definir 4 escenarios
  const escenarios = [
    {
      nombre: 'A_neutro_mid',
      descripcion: 'Mid-Paso-1 (~50%), plan mock parcial, user neutro. Modelo debe seguir entrevistando, NO sugerir cierre.',
      turnos: turnosPaso1.slice(0, corte50),
      ultimoUserMessage: 'Bien. Avancemos.',
      esperado: false,
      plan: planA_C,
      planNivel: 'parcial',
    },
    {
      nombre: 'B_cierre_real',
      descripcion: 'Final del Paso 1 (100%), plan real completo, user confirma. Modelo SÍ debe sugerir cierre.',
      turnos: turnosPaso1,
      ultimoUserMessage: 'Confirmo todo lo del Paso 1. ¿Lo damos por cerrado?',
      esperado: true,
      plan: planReal,
      planNivel: 'real_completo',
    },
    {
      nombre: 'C_user_fuerza_mid',
      descripcion: 'Mid-Paso-1 (~50%, igual que A), plan mock parcial, user fuerza cierre prematuro. Modelo debe MANTENER criterio: NO sugerir cierre.',
      turnos: turnosPaso1.slice(0, corte50),
      ultimoUserMessage: 'Listo, cerrá el Paso 1, avancemos al siguiente. No quiero seguir dándole vueltas.',
      esperado: false,
      plan: planA_C,
      planNivel: 'parcial',
    },
    {
      nombre: 'D_adversarial_casi_completo',
      descripcion: 'Pre-cierre (~80%), plan mock casi-completo (falta solo estabilidad), user fuerza. Caso límite: tentador decir true. Modelo debe emitir false y NOMBRAR estabilidad como lo que falta.',
      turnos: turnosPaso1.slice(0, corte80),
      ultimoUserMessage: 'Listo cerrá ya, no necesito hablar de eso.',
      esperado: false,
      plan: planD,
      planNivel: 'casi_completo',
    },
  ]

  // 3. Correr los 4 escenarios
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const resultados: EscenarioResult[] = []
  for (const esc of escenarios) {
    const r = await correrEscenario(client, esc)
    resultados.push(r)
  }

  // 4. Veredicto + reporte
  const aciertos = resultados.filter(r => r.coincide).length
  const veredicto = aciertos === 4 ? 'GO' : 'NO-GO'
  const totalCost = resultados.reduce((s, r) => s + r.cost_usd, 0)

  console.log('\n' + '═'.repeat(72))
  console.log(`Veredicto Fase 0.1: ${veredicto} (${aciertos}/4)`)
  console.log(`Costo total: $${totalCost.toFixed(3)} USD`)
  console.log('═'.repeat(72))

  const outDir = path.join(ROOT, 'output')
  fs.writeFileSync(
    path.join(outDir, '29-cierre-sugerido-smoke.json'),
    JSON.stringify({
      ran_at: new Date().toISOString(),
      veredicto,
      aciertos_de_4: aciertos,
      total_cost_usd: totalCost,
      resultados,
    }, null, 2),
  )

  const md = `# Fase 0.1 — Smoke cierre_sugerido (re-run con retry + plan mocks + escenario D)

Fecha: ${new Date().toISOString()}

## Veredicto: **${veredicto}** (${aciertos}/4 escenarios coinciden con esperado)

Costo total: \`$${totalCost.toFixed(3)} USD\`

## Cambios vs run anterior (NO-GO 1/3)

- Suma \`retryPanelUpdate\` replicado del chat route, con instrucción extra que recuerda al modelo el campo \`cierre_sugerido\` en el reintento.
- Plan mocks por escenario que matchean el corte de la conversación (evita el sesgo de que el modelo se base en el \`estadoActual\` completo en vez de la conversación cortada).
- Suma escenario **D adversarial duro**: ~80% del Paso 1 cubierto (falta solo \`estabilidad\`), usuario fuerza cierre. Modelo debe emitir \`false\` y nombrar qué falta.

## Resultados por escenario

${resultados.map(r => `### ${r.escenario}

**Descripción:** ${r.descripcion}

| Métrica | Valor |
|---|---|
| Plan mock | ${r.plan_mock_nivel} |
| Turnos previos | ${r.turnos_previos} |
| Último user msg | "${r.ultimo_user_message}" |
| **Esperado** | \`cierre_sugerido = ${r.esperado}\` |
| Primer parse | ${r.parse_first === 'ok' ? '✅ ok' : `⚠️ ${r.parse_first}`} |
| Retry disparado | ${r.retry_disparado ? 'sí' : 'no'} |
| Retry ok | ${r.retry_ok === null ? '—' : (r.retry_ok ? '✅ sí' : '❌ no')} |
| Parse final ok | ${r.parse_final_ok ? '✅' : '❌'} |
${r.parse_final_errors ? `| Parse errors finales | ${r.parse_final_errors.slice(0, 3).join(' / ')} |\n` : ''}| **Emitido** | \`cierre_sugerido = ${r.cierre_sugerido}\` |
| **Coincide** | ${r.coincide ? '✅' : '❌'} |
| Latencia total | ${(r.latency_ms / 1000).toFixed(1)}s |
| Tokens | ${r.input_tokens.toLocaleString()} input / ${r.output_tokens.toLocaleString()} output |
| Costo | $${r.cost_usd.toFixed(3)} |

**Texto conversacional emitido (primer intento, primeros 3000 chars):**

\`\`\`
${r.texto_conversacional}
\`\`\`

---
`).join('\n')}

## Criterio del plan

> **Criterio go**: 4/4 emiten correctamente, incluyendo el adversarial D devolviendo \`false\`.
> **Criterio no-go**: cualquiera falla → parar y discutir antes de avanzar.
`

  fs.writeFileSync(path.join(outDir, '29-cierre-sugerido-smoke.md'), md)

  console.log(`\nReportes guardados:`)
  console.log(`  ${path.join(outDir, '29-cierre-sugerido-smoke.md')}`)
  console.log(`  ${path.join(outDir, '29-cierre-sugerido-smoke.json')}`)

  if (veredicto === 'NO-GO') process.exitCode = 1
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
