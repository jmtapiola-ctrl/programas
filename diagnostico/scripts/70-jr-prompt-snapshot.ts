// Red de no-regresión para Fase 6 (wizard Jr).
//
// Captura el output de buildSystemPrompt() para un plan Sr dummy en varios
// estados. El branching Jr de Fase 6 debe ser ADITIVO: el prompt del Sr NO
// debe cambiar. Uso:
//   - `npx tsx diagnostico/scripts/70-jr-prompt-snapshot.ts baseline` → guarda
//     el baseline en diagnostico/output/sr-prompt-baseline.json
//   - `npx tsx diagnostico/scripts/70-jr-prompt-snapshot.ts check` → compara
//     contra el baseline y reporta diffs (falla si el prompt Sr cambió).
//   - `npx tsx diagnostico/scripts/70-jr-prompt-snapshot.ts jr` → imprime el
//     prompt Jr para inspección manual (no compara).

import { writeFileSync, readFileSync, existsSync } from 'fs'
import { buildSystemPrompt } from '../../lib/pe-system-prompt'

const BASELINE_PATH = 'diagnostico/output/sr-prompt-baseline.json'

const propositoDummy = {
  escena: 'Ser la cooperativa de dueños más grande del país.',
  metricas: [
    { metrica: 'Dueños/mes', valor_objetivo: '1000', valor_actual: '300' },
    { metrica: 'Macrozonas', valor_objetivo: '5', valor_actual: '2' },
  ],
  fuera: [{ item: 'Expansión internacional', razon: 'Foco local primero' }],
  horizonte: 'Fin de 2026',
  estabilidad: 'Alta',
}

const situacionDummy = {
  desvio_principal: 'Crecimiento estancado en captación de dueños.',
  desvio_cuantificado: '300/mes vs 1000 objetivo',
  desvios_secundarios: [{ descripcion: 'Churn alto', datos: '12% mensual' }],
  causa_raiz: 'Falta de cobertura geográfica.',
  consecuencia_6m: 'Pérdida de share',
  consecuencia_12m: 'Inviabilidad',
  recursos_actuales: 'Equipo de 10',
  recursos_faltantes: 'Capital de expansión',
  intentos_previos: 'Campaña digital sin tracción',
  resistencias: [{ actor: 'Directorio', descripcion: 'Aversión al riesgo', mitigacion: '', tipo: 'Interna', criticidad: 'Media' }],
}

function planSrDummy(extra: Record<string, unknown> = {}) {
  return {
    tipo: 'Sr',
    area: 'Comercial',
    horizonte: 'Fin de 2026',
    proposito: propositoDummy,
    situacion: situacionDummy,
    ...extra,
  }
}

// Estados representativos a snapshotear (cubren las ramas del prompt).
const ESTADOS = [
  { label: 'paso1', entrevista: { paso_actual: 1, sub_bloque_actual: '1.A', sub_estado_paso: 'en_curso', historial: [] } },
  { label: 'paso2', entrevista: { paso_actual: 2, sub_bloque_actual: '2.A', sub_estado_paso: 'en_curso', historial: [{}] } },
  { label: 'paso3.0', entrevista: { paso_actual: 3, sub_bloque_actual: '3.0', sub_estado_paso: 'en_curso', historial: [{}] } },
  { label: 'paso3.A', entrevista: { paso_actual: 3, sub_bloque_actual: '3.A', sub_estado_paso: 'en_curso', historial: [{}] } },
]

function capturar(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of ESTADOS) {
    out[e.label] = buildSystemPrompt(planSrDummy(), null, e.entrevista)
  }
  return out
}

const modo = process.argv[2] ?? 'check'

if (modo === 'baseline') {
  writeFileSync(BASELINE_PATH, JSON.stringify(capturar(), null, 2))
  console.log('Baseline Sr guardado en', BASELINE_PATH)
} else if (modo === 'check') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('No existe baseline. Corré primero con `baseline`.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, string>
  const actual = capturar()
  let ok = true
  for (const label of Object.keys(baseline)) {
    if (baseline[label] !== actual[label]) {
      ok = false
      console.error(`REGRESIÓN en estado "${label}": el prompt Sr cambió.`)
      // mostrar primer punto de divergencia
      const a = baseline[label], b = actual[label] ?? ''
      let i = 0
      while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++
      console.error(`  primer diff @char ${i}:`)
      console.error(`  baseline: ...${a.slice(Math.max(0, i - 40), i + 60)}...`)
      console.error(`  actual:   ...${b.slice(Math.max(0, i - 40), i + 60)}...`)
    }
  }
  if (ok) console.log('OK — prompt Sr idéntico al baseline en', Object.keys(baseline).length, 'estados.')
  else process.exit(1)
} else if (modo === 'jr') {
  // Imprime el prompt Jr (dummy con contexto curado) para inspección.
  const planJr = {
    tipo: 'Jr',
    area: 'Demanda',
    plan_sr_nombre: 'Plan Sr Dummy',
    proposito: undefined,
    situacion: undefined,
    contexto_curado: {
      contexto: '# Bienvenida\n\nTu línea ataca la captación de dueños.',
      proposito: 'Llevar la captación de tu zona a 400/mes.',
      criterios_exito: '- 400 dueños/mes sostenido\n- 3 macrozonas activas',
      metricas: '- **Dueños/mes (tu zona)**: objetivo 400 · actual 100',
      supuestos: 'Crédito hipotecario se reabre en H2.',
    },
    movs_heredados_snapshot: [],
  }
  const ent = { paso_actual: 1, sub_bloque_actual: '1.A', sub_estado_paso: 'en_curso', historial: [] }
  console.log(buildSystemPrompt(planJr, null, ent))
} else {
  console.error('Modo desconocido. Usá: baseline | check | jr')
  process.exit(1)
}
