// Fase A (blindaje memoria): verifica que buildSystemPrompt re-inyecta el estado
// estructurado COMPLETO (no solo desvio_principal+causa_raiz / stub 'declarados').
// $0, sin red. Reproduce el dato olvidado del bug (zona_fracaso, mínimos, supuestos).
import { buildSystemPrompt } from '../../lib/pe-system-prompt'
let pass = 0, fail = 0
function check(n: string, cond: boolean){ if(cond){pass++;console.log(`  ✓ ${n}`)} else {fail++;console.error(`  ✗ ${n}`)} }

const plan: any = {
  tipo: 'Sr', area: 'Comercial',
  proposito: { escena: 'Escena X', metricas: [{ metrica: 'YTV/CAC', valor_objetivo: '>3', valor_actual: '2' }], fuera: [], horizonte: '2026', estabilidad: 'estable' },
  situacion: {
    desvio_principal: 'No se replica conversión PAI',
    desvio_cuantificado: '1 asesor 15%, 30+ en 2.2%',
    desvios_secundarios: [{ descripcion: 'Modelo POZO sin construir', datos: '4/mes vs 10' }],
    causa_raiz: 'Prioridad velocidad sobre escalable',
    consecuencia_6m: 'CONSECUENCIA_SEIS_MESES_MARCADOR',
    consecuencia_12m: 'CONSECUENCIA_DOCE_MESES_MARCADOR',
    recursos_actuales: 'RECURSOS_ACTUALES_MARCADOR Loana full time',
    recursos_faltantes: 'RECURSOS_FALTANTES_MARCADOR jefe de ventas',
    intentos_previos: 'INTENTOS_PREVIOS_MARCADOR entrenamiento marzo',
    resistencias: [{ actor: 'RESISTENCIA_ACTOR_ELI', descripcion: 'fricción de egos', mitigacion: 'media Giorgetti', tipo: 'Interna', criticidad: 'Alta' }],
  },
  plan: {
    preparativos: {
      areas_afectadas: [{ nombre: 'AREA_LABS_MARCADOR', responsable: 'Martín' }],
      supuestos_exogenos: [{ descripcion: 'SUPUESTO_LOANA_MARCADOR', tipo: 'social', probabilidad: 'alta', impacto_signo: 'desfavorable', impacto_magnitud: 'alta', estrategia: 'bet', razon: 'piedra angular' }],
      priorizacion_inicial: { desvio_elegido: 'PRIORIZACION_PAI_MARCADOR', razon: 'cuello de botella' },
      criterio_exito: {
        por_metrica: [{ metrica: 'YTV/CAC', pleno: 'PLENO_TRES_MARCADOR', minimo: 'MINIMO_DOS_CINCO_MARCADOR' }],
        zona_fracaso: 'ZONA_FRACASO_YTVCAC_MENOR_2_5_MARCADOR',
      },
    },
  },
  datos_faltantes: [],
}
const out = buildSystemPrompt(plan, null, { paso_actual: 3, sub_bloque_actual: '3.0', historial: [] })

console.log('— Preparativos / criterio (el bug):')
check('contiene ZONA DE FRACASO', out.includes('ZONA_FRACASO_YTVCAC_MENOR_2_5_MARCADOR'))
check('contiene mínimo por métrica', out.includes('MINIMO_DOS_CINCO_MARCADOR'))
check('contiene pleno por métrica', out.includes('PLENO_TRES_MARCADOR'))
check('contiene supuesto + calificación (prob:alta)', out.includes('SUPUESTO_LOANA_MARCADOR') && out.includes('prob:alta'))
check('contiene priorización inicial', out.includes('PRIORIZACION_PAI_MARCADOR'))
check('contiene área afectada', out.includes('AREA_LABS_MARCADOR'))
check('NO renderiza el stub "declarados"', !out.includes('Preparativos: declarados'))

console.log('— Situación completa:')
check('contiene consecuencia 6m', out.includes('CONSECUENCIA_SEIS_MESES_MARCADOR'))
check('contiene consecuencia 12m', out.includes('CONSECUENCIA_DOCE_MESES_MARCADOR'))
check('contiene recursos actuales', out.includes('RECURSOS_ACTUALES_MARCADOR'))
check('contiene recursos faltantes', out.includes('RECURSOS_FALTANTES_MARCADOR'))
check('contiene intentos previos', out.includes('INTENTOS_PREVIOS_MARCADOR'))
check('contiene resistencia (actor)', out.includes('RESISTENCIA_ACTOR_ELI'))

console.log(`\n${pass}/${pass+fail} checks verde.`)
process.exit(fail === 0 ? 0 : 1)
