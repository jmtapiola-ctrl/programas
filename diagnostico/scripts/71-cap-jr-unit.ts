// Unit test sin red del cap determinístico del Jr (Fase 6, Hito 6).
// Verifica generarDivergenciasCapJr() con fixtures: sin divergencia, sobrecosto,
// subcosto, y baja cobertura. $0, segundos, reproducible.

import { generarDivergenciasCapJr } from '../../lib/cap-jr'

let pass = 0
let fail = 0
function check(nombre: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✓ ${nombre}`) }
  else { fail++; console.error(`  ✗ ${nombre}${extra ? ` — ${extra}` : ''}`) }
}

function mov(id: string, costoMax: number, dur = 2) {
  return { id, costo_monetario: { rango_min_usd: 0, rango_max_usd: costoMax }, duracion_meses_ejecucion: dur, precondiciones: [], desbloquea: [] }
}

// mov de inventario del Jr con duración (+ precond) — el cierre del Jr se computa
// por CPM desde plan.inventario.movimientos, NO desde ventana_temporal.
function movInv(id: string, dur: number, precond: string[] = []) {
  return { id, costo_monetario: { rango_min_usd: 0, rango_max_usd: 100 }, duracion_meses_ejecucion: dur, precondiciones: precond, desbloquea: [] }
}

// mov del baseline Sr CONGELADO: ventana_temporal real + sr_desbloquea_total (rol).
function movSr(id: string, arranca: string, termina: string, desbloquea = 0, costoMax = 100) {
  return { id, costo_monetario: { rango_min_usd: 0, rango_max_usd: costoMax }, duracion_meses_ejecucion: 2, precondiciones: [], desbloquea: [], ventana_temporal: { arranca, termina }, sr_desbloquea_total: desbloquea }
}

function planJr(opts: { curadoMovs: any[]; baseline: any[]; inventarioMovs?: any[]; criterios?: string; metricas?: string }) {
  const inv = opts.inventarioMovs ?? opts.curadoMovs
  return {
    tipo: 'Jr',
    movs_heredados_snapshot: opts.baseline,
    contexto_curado: {
      contexto: '', proposito: '', supuestos: '',
      criterios_exito: opts.criterios ?? '- crit 1\n- crit 2',
      metricas: opts.metricas ?? '- métrica 1',
    },
    plan: {
      inventario: { movimientos: inv, resumenes_categoria: [], generado_en: '' },
      curado: {
        version_activa: 0,
        versiones: [{
          contexto: '', decisiones_priorizacion: [], supuestos_criticos: [],
          criterio_exito: { pleno: '', minimo: '', path_minimo: '' },
          alternativas_descartadas: [], cerrado_en: '2026-06-01',
          secuencia_movimientos: [{ fase: 'F1', movimientos: opts.curadoMovs, razon_secuencia: '' }],
        }],
      },
    },
  } as any
}

// baseDate del CPM del Jr se deriva de NOW → determinístico. Mediodía local
// mid-month (sin Z) para evitar que el offset de timezone corra el mes.
const NOW = '2026-06-15T12:00:00.000'

// Caso 1: costo Jr ~= baseline → sin divergencias de costo/cobertura.
{
  const p = planJr({
    curadoMovs: [mov('A', 100), mov('B', 100), mov('C', 100)],
    baseline: [mov('X', 100), mov('Y', 100), mov('Z', 100)],
  })
  const { divergencias, capSnapshot } = generarDivergenciasCapJr(p, NOW)
  console.log('Caso 1 — paridad:')
  check('sin divergencias', divergencias.length === 0, `tiene ${divergencias.length}`)
  check('costo Jr=300', capSnapshot.costo_total_jr_usd === 300)
  check('costo baseline=300', capSnapshot.costo_baseline_sr_usd === 300)
  check('criterios_evaluados=3', capSnapshot.criterios_evaluados === 3, `es ${capSnapshot.criterios_evaluados}`)
}

// Caso 2: sobrecosto (>1.3x) → cap-costo-sobre CRITICA.
{
  const p = planJr({
    curadoMovs: [mov('A', 500), mov('B', 500)],
    baseline: [mov('X', 300), mov('Y', 300)],
  })
  const { divergencias } = generarDivergenciasCapJr(p, NOW)
  console.log('Caso 2 — sobrecosto:')
  check('hay cap-costo-sobre', divergencias.some(d => d.id === 'cap-costo-sobre'))
  check('es CRITICA', divergencias.find(d => d.id === 'cap-costo-sobre')?.categoria === 'CRITICA')
}

// Caso 3: subcosto (<0.7x) → cap-costo-bajo RECOMENDADA.
{
  const p = planJr({
    curadoMovs: [mov('A', 100)],
    baseline: [mov('X', 300), mov('Y', 300)],
  })
  const { divergencias } = generarDivergenciasCapJr(p, NOW)
  console.log('Caso 3 — subcosto:')
  check('hay cap-costo-bajo', divergencias.some(d => d.id === 'cap-costo-bajo'))
}

// Caso 4: baja cobertura (Jr 1 mov vs baseline 5) → cap-cobertura CRITICA.
{
  const p = planJr({
    curadoMovs: [mov('A', 250)],  // costo ~= baseline para aislar la cobertura
    baseline: [mov('V', 50), mov('W', 50), mov('X', 50), mov('Y', 50), mov('Z', 50)],
  })
  const { divergencias } = generarDivergenciasCapJr(p, NOW)
  console.log('Caso 4 — baja cobertura:')
  check('hay cap-cobertura', divergencias.some(d => d.id === 'cap-cobertura'), divergencias.map(d => d.id).join(','))
}

// Caso 5: sin baseline (Jr sin movs heredados) → no rompe, sin divergencias de costo.
{
  const p = planJr({ curadoMovs: [mov('A', 100)], baseline: [] })
  const { divergencias, capSnapshot } = generarDivergenciasCapJr(p, NOW)
  console.log('Caso 5 — sin baseline:')
  check('no rompe', Array.isArray(divergencias))
  check('costo baseline=0', capSnapshot.costo_baseline_sr_usd === 0)
}

// Caso 6: atraso temporal. Jr CPM cierra 2027-02 (mov dur=8 desde 2026-06) vs Sr
// esperaba 2026-08 (ventana congelada) = 6 meses → cap-tiempo-atraso CRITICA.
{
  const p = planJr({
    curadoMovs: [mov('A', 100)],
    inventarioMovs: [movInv('A', 8)],
    baseline: [movSr('X', '2026-06', '2026-08', 0)],
  })
  const { divergencias, capSnapshot } = generarDivergenciasCapJr(p, NOW)
  console.log('Caso 6 — atraso temporal (CPM real):')
  check('hay cap-tiempo-atraso', divergencias.some(d => d.id === 'cap-tiempo-atraso'), divergencias.map(d => d.id).join(','))
  check('es CRITICA', divergencias.find(d => d.id === 'cap-tiempo-atraso')?.categoria === 'CRITICA')
  check('cierre_jr=2027-02', capSnapshot.cierre_jr_ym === '2027-02', `es ${capSnapshot.cierre_jr_ym}`)
  check('cierre_sr=2026-08', capSnapshot.cierre_esperado_sr_ym === '2026-08', `es ${capSnapshot.cierre_esperado_sr_ym}`)
}

// Caso 7: dentro del horizonte (Jr cierra 1 mes después = bajo umbral) → SIN cap-tiempo-atraso.
{
  const p = planJr({
    curadoMovs: [mov('A', 100)],
    inventarioMovs: [movInv('A', 2)],            // 2026-06→2026-08
    baseline: [movSr('X', '2026-06', '2026-07', 0)],
  })
  const { divergencias } = generarDivergenciasCapJr(p, NOW)
  console.log('Caso 7 — dentro del horizonte:')
  check('no hay cap-tiempo-atraso', !divergencias.some(d => d.id === 'cap-tiempo-atraso'), divergencias.map(d => d.id).join(','))
}

// Caso 8: MAGNITUD — el Jr expande un enabler corto. Jr span 6m (2026-06→2026-12),
// Sr presupuestó span 1m. Jr cierra ANTES que la termina del Sr (2027-02) → NO hay
// atraso temporal, pero SÍ cap-magnitud-expansion.
{
  const p = planJr({
    curadoMovs: [mov('A', 100)],
    inventarioMovs: [movInv('A', 6)],            // 2026-06→2026-12
    baseline: [movSr('X', '2027-01', '2027-02', 0)],  // span 1m, termina lejana
  })
  const { divergencias } = generarDivergenciasCapJr(p, NOW)
  console.log('Caso 8 — magnitud/expansión:')
  check('hay cap-magnitud-expansion', divergencias.some(d => d.id === 'cap-magnitud-expansion'), divergencias.map(d => d.id).join(','))
  check('NO hay cap-tiempo-atraso (cierra antes)', !divergencias.some(d => d.id === 'cap-tiempo-atraso'))
}

// Caso 9: GATE — lo heredado es prerequisite (desbloquea 13). Jr alineado (sin atraso
// ni expansión) → igual debe disparar cap-gate-cierre-minimo (garantía de alerta).
{
  const p = planJr({
    curadoMovs: [mov('A', 100)],
    inventarioMovs: [movInv('A', 1)],            // 2026-06→2026-07, alineado
    baseline: [movSr('X', '2026-06', '2026-07', 13)],
  })
  const { divergencias } = generarDivergenciasCapJr(p, NOW)
  console.log('Caso 9 — gate de cierre mínimo (prerequisite):')
  check('hay cap-gate-cierre-minimo', divergencias.some(d => d.id === 'cap-gate-cierre-minimo'), divergencias.map(d => d.id).join(','))
  check('es RECOMENDADA', divergencias.find(d => d.id === 'cap-gate-cierre-minimo')?.categoria === 'RECOMENDADA')
  check('NO atraso ni expansión', !divergencias.some(d => ['cap-tiempo-atraso','cap-magnitud-expansion'].includes(d.id)))
}

// Caso 10: NO prerequisite (desbloquea 0) + alineado → SIN gate.
{
  const p = planJr({
    curadoMovs: [mov('A', 100)],
    inventarioMovs: [movInv('A', 1)],
    baseline: [movSr('X', '2026-06', '2026-07', 0)],
  })
  const { divergencias } = generarDivergenciasCapJr(p, NOW)
  console.log('Caso 10 — sin prerequisite → sin gate:')
  check('no hay cap-gate-cierre-minimo', !divergencias.some(d => d.id === 'cap-gate-cierre-minimo'), divergencias.map(d => d.id).join(','))
}

console.log(`\n${pass}/${pass + fail} checks verde.`)
process.exit(fail === 0 ? 0 : 1)
