// Regresión read-only para las cuatro correcciones de estabilización surgidas
// del caso Romina/Lab 10x. No usa red, Airtable ni modelos.
import { MODELOS_ANTHROPIC } from '../../lib/llm-config'
import { buildSystemPrompt } from '../../lib/pe-system-prompt'
import {
  mergeProposito,
  parsePanelUpdate,
} from '../../lib/pe-panel-update'
import { rutaRecuperacionAuditoria } from '../../lib/audit-navigation'
import { serializeResumenPaso } from '../../app/api/planes-estrategicos/[id]/audit/start/route'

let pass = 0
let fail = 0
function check(nombre: string, condicion: boolean) {
  if (condicion) {
    pass++
    console.log(`  ✓ ${nombre}`)
  } else {
    fail++
    console.error(`  ✗ ${nombre}`)
  }
}

const movimiento: any = {
  id: 'M-1',
  categoria: 'Crecimiento',
  nombre: 'MOVIMIENTO_ROMINA_COMPLETO',
  descripcion: 'DESCRIPCION_SIN_TRUNCAR_' + 'x'.repeat(160),
  que_resuelve: 'Resuelve el cuello de botella comercial',
  brechas_atacadas: ['Tráfico calificado'],
  costo_banda_ancha: 'media',
  impacto: 'alta',
  costo_monetario: { rango_min_usd: 1000, rango_max_usd: 2000, nota: 'presupuesto aprobado' },
  duracion_meses_ejecucion: 2,
  precondiciones: [],
  desbloquea: [],
  tipo_dependencia: 'ninguna',
  dueno: 'Directora de Growth',
  dueno_es_vacante: true,
  dueno_semanas_cobertura: 8,
  criterio_exito: '10x tráfico en el horizonte',
  estado_usuario: 'aceptado',
  ventana_temporal: { arranca: '2025-01', termina: '2025-02' },
  riesgo_ejecucion_razonamiento: 'Riesgo alto por vacancia de liderazgo',
}

const curado: any = {
  contexto: 'CONTEXTO_CURADO_COMPLETO',
  decisiones_priorizacion: [{ decision: 'Priorizar M-1', razon: 'Es el cuello de botella' }],
  secuencia_movimientos: [{ fase: 'Q4-2026', movimientos: [movimiento], razon_secuencia: 'Después de cubrir la vacancia' }],
  supuestos_criticos: [],
  criterio_exito: { pleno: '10x', minimo: '5x', path_minimo: 'M-1' },
  alternativas_descartadas: [{ decision: 'No contratar', razon: 'No resuelve capacidad' }],
  cerrado_en: '2026-07-28T12:00:00.000Z',
}

const plan: any = {
  id: 'rec-test-romina',
  nombre: 'Lab Alto tráfico 10x – Jr – 2026',
  tipo: 'Jr',
  area: 'Growth',
  horizonte: '2026',
  proposito: {
    escena: 'Escena destino',
    metricas: [{ metrica: 'Tráfico calificado', valor_objetivo: '10x', valor_actual: '1x' }],
    fuera: [],
    horizonte: '2026',
    estabilidad: 'Sostenible',
  },
  situacion: {
    desvio_principal: 'Falta tráfico',
    desvio_cuantificado: '1x vs 10x',
    desvios_secundarios: [],
    causa_raiz: 'Capacidad insuficiente',
    consecuencia_6m: 'No crece',
    consecuencia_12m: 'Pierde mercado',
    recursos_actuales: 'Equipo base',
    recursos_faltantes: 'Growth lead',
    intentos_previos: 'Paid media',
    resistencias: [],
  },
  plan: {
    inventario: {
      movimientos: [movimiento],
      resumenes_categoria: [],
      generado_en: '2026-07-28T12:00:00.000Z',
    },
    curado: { versiones: [curado], version_activa: 0 },
  },
  datos_faltantes: [],
}

async function main() {
  console.log('— Modelo:')
  check('alias sonnet apunta a Claude Sonnet 5', MODELOS_ANTHROPIC.sonnet === 'claude-sonnet-5')

  console.log('— Fuente de verdad completa:')
  const prompt = buildSystemPrompt(plan, null, {
    paso_actual: 3,
    sub_bloque_actual: '3.E',
    sub_estado_paso: 'en_curso',
    historial: [],
  })
  check('incluye declaración autoritativa', prompt.includes('FUENTE DE VERDAD AUTORITATIVA'))
  check('incluye movimiento completo', prompt.includes('MOVIMIENTO_ROMINA_COMPLETO'))
  check('no trunca descripción extensa', prompt.includes(movimiento.descripcion))
  check('incluye schedule CPM vigente', prompt.includes('CRONOGRAMA CPM VIGENTE'))
  check('omite el valor de la ventana legacy', prompt.includes('campo legacy, NO usar') && !prompt.includes('2025-01'))
  check('incluye plan curado real', prompt.includes('CONTEXTO_CURADO_COMPLETO'))

  console.log('— Reviewer sobre CPM:')
  const resumenAudit = await serializeResumenPaso(plan, 3)
  check('reviewer recibe cronograma real', resumenAudit.includes('cronograma real:'))
  check('reviewer recibe fase CPM', resumenAudit.includes('fase CPM'))
  check('reviewer no recibe la ventana legacy 2025', !resumenAudit.includes('2025-01'))

  console.log('— Recovery de auditoría:')
  check(
    'auditoria_completa vuelve a /cierre/3',
    rutaRecuperacionAuditoria('rec-test-romina', 3, 'auditoria_completa') === '/planes-estrategicos/rec-test-romina/cierre/3',
  )
  check('en_curso permanece en entrevista', rutaRecuperacionAuditoria('rec-test-romina', 3, 'en_curso') === null)

  console.log('— Borrados explícitos:')
  const actual: any = {
    escena: 'Escena anterior',
    metricas: [
      { metrica: 'A', valor_objetivo: '1', valor_actual: '0' },
      { metrica: 'B', valor_objetivo: '2', valor_actual: '0' },
      { metrica: 'CAC viejo', valor_objetivo: '3', valor_actual: '0' },
    ],
    fuera: [],
    horizonte: '2026',
    estabilidad: 'Estable',
  }
  const entrante: any = {
    ...actual,
    escena: '',
    metricas: actual.metricas.slice(0, 2),
  }
  const protegido = mergeProposito(actual, entrante)
  check('sin marca preserva escena no vacía', protegido.value.escena === 'Escena anterior')
  check('sin marca preserva array ante shrinkage', protegido.value.metricas.length === 3)

  const reemplazos = new Set(['proposito.escena', 'proposito.metricas'])
  const borrado = mergeProposito(actual, entrante, reemplazos)
  check('con marca permite limpiar scalar', borrado.value.escena === '')
  check('con marca permite array más corto', borrado.value.metricas.length === 2)
  check('registra explicit_replace', borrado.events.filter(e => e.type === 'explicit_replace').length === 2)

  const panelValido = `<!--PANEL_UPDATE-->${JSON.stringify({
    paso_actual: 1,
    sub_bloque_actual: '1.B',
    proposito: entrante,
    reemplazos_explicitos: ['proposito.escena', 'proposito.metricas'],
  })}<!--/PANEL_UPDATE-->`
  check('parser acepta reemplazos allowlisteados con valor final', parsePanelUpdate(panelValido).ok)

  const panelInvalido = `<!--PANEL_UPDATE-->${JSON.stringify({
    paso_actual: 1,
    sub_bloque_actual: '1.B',
    proposito: entrante,
    reemplazos_explicitos: ['plan.curado'],
  })}<!--/PANEL_UPDATE-->`
  check('parser rechaza una ruta no autorizada', !parsePanelUpdate(panelInvalido).ok)

  console.log(`\n${pass}/${pass + fail} checks verdes.`)
  process.exit(fail === 0 ? 0 : 1)
}

void main()
