// Mide el tamaño del PANEL_UPDATE consolidado típico del dummy en 3.B,
// y simula cuánto se reduciría si el modelo omitiera `plan.inventario` y
// `plan.preparativos` (que se preservan vía mergePlan protector).
//
// Útil para reportar el impacto de latencia al user antes de aplicar fix.

import { getPlanEstrategico } from '../../lib/airtable'

const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'

async function main() {
  const plan = await getPlanEstrategico(PLAN_DUMMY_ID)

  // PANEL_UPDATE consolidado tal como lo emite el modelo HOY (todo el plan)
  const panelCompleto = {
    paso_actual: 3,
    sub_bloque_actual: '3.B',
    proposito: plan.proposito,
    situacion: plan.situacion,
    datos_faltantes: plan.datos_faltantes ?? [],
    plan: plan.plan,
    cierre_sugerido: false,
  }

  // PANEL_UPDATE optimizado: solo lo nuevo (palancas) + claves estáticas mínimas
  const panelOptimizado = {
    paso_actual: 3,
    sub_bloque_actual: '3.B',
    proposito: plan.proposito,
    situacion: plan.situacion,
    datos_faltantes: plan.datos_faltantes ?? [],
    plan: {
      // Solo palancas — preparativos e inventario se preservan vía merge
      palancas: plan.plan?.palancas ?? null,
    },
    cierre_sugerido: false,
  }

  const completo = JSON.stringify(panelCompleto, null, 2)
  const optimo = JSON.stringify(panelOptimizado, null, 2)

  // Aproximación de tokens: ~4 chars por token en JSON estructurado
  const tokensCompleto = Math.ceil(completo.length / 4)
  const tokensOptimo = Math.ceil(optimo.length / 4)

  // Latencia estimada: Opus emite ~50-70 tokens/seg en streaming
  // Tomemos 60 t/s como promedio.
  const segCompleto = Math.round(tokensCompleto / 60)
  const segOptimo = Math.round(tokensOptimo / 60)

  console.log(`\n=== PANEL_UPDATE size analysis ===\n`)
  console.log(`Plan dummy: ${plan.nombre}`)
  console.log(`Inventario: ${plan.plan?.inventario?.movimientos?.length ?? 0} movimientos`)
  console.log()
  console.log(`Completo (lo que emite hoy):`)
  console.log(`  chars:  ${completo.length.toLocaleString()}`)
  console.log(`  tokens: ~${tokensCompleto.toLocaleString()}`)
  console.log(`  emitir streaming a 60 t/s: ~${segCompleto}s`)
  console.log()
  console.log(`Optimizado (omitiendo preparativos + inventario):`)
  console.log(`  chars:  ${optimo.length.toLocaleString()}`)
  console.log(`  tokens: ~${tokensOptimo.toLocaleString()}`)
  console.log(`  emitir streaming a 60 t/s: ~${segOptimo}s`)
  console.log()
  console.log(`Reducción: ${Math.round((1 - tokensOptimo / tokensCompleto) * 100)}%`)
  console.log(`Speedup estimado: ${(segCompleto / segOptimo).toFixed(1)}x`)

  // Desglose por sección del plan
  console.log(`\n=== Desglose del plan completo (chars) ===`)
  const secciones = {
    proposito: JSON.stringify(plan.proposito ?? {}).length,
    situacion: JSON.stringify(plan.situacion ?? {}).length,
    'plan.preparativos': JSON.stringify(plan.plan?.preparativos ?? {}).length,
    'plan.inventario': JSON.stringify(plan.plan?.inventario ?? {}).length,
    'plan.palancas': JSON.stringify(plan.plan?.palancas ?? {}).length,
  }
  const total = Object.values(secciones).reduce((a, b) => a + b, 0)
  for (const [k, v] of Object.entries(secciones)) {
    const pct = ((v / total) * 100).toFixed(1)
    console.log(`  ${k.padEnd(20)} ${String(v).padStart(7)} chars (${pct}%)`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
