// System prompt + user message + JSON schema del validador cross-provider del
// Sub-bloque 3.B (Preguntas de palanca).
//
// Reusa el wrapper callReviewer (lib/openai-client.ts) que ya maneja:
//   - OpenAI Responses API + structured outputs
//   - Reasoning effort=high
//   - Retry con backoff
//   - Cost cap defensivo
//
// Decisión D4 del MD del proyecto (3 mayo 2026):
//   - Modelo principal hace 5 preguntas conversacionales (en chat normal).
//   - Validador cross-provider recibe Plan + 5 preguntas + 5 respuestas + observaciones.
//   - Validador formula 0-5 preguntas COMPLEMENTARIAS (nunca redundantes).
//   - Instrucción explícita: "Si no encontrás ángulos nuevos de valor, NO sumes
//     preguntas por cumplir. Calidad > cantidad."
//   - Total: 5-10 preguntas según lo que el validador detecte. El "5+5" es
//     techo, no piso.

import type { PlanEstrategico, PalancaQAPE } from './types'
import { buildJrContextoHeredadoMd } from './jr-paso3-context'

export function buildPalancasValidadorSystemPrompt(): string {
  return `Sos un consultor estratégico senior actuando como VALIDADOR INDEPENDIENTE del Sub-bloque 3.B "Preguntas de palanca" del Paso 3 de un plan estratégico.

Otro modelo (el AI principal Claude del wizard) ya hizo al usuario 5 preguntas duras sobre el inventario de movimientos del plan. Vas a recibir las 5 preguntas + las 5 respuestas + observaciones intermedias del modelo principal. Tu tarea: detectar ÁNGULOS DE PALANCA QUE QUEDARON SIN TOCAR.

Devolvés 0 a 5 preguntas COMPLEMENTARIAS. NUNCA redundantes con las 5 ya hechas — si no encontrás ángulos nuevos de valor, devolvés array VACÍO. Calidad > cantidad. El usuario va a confiar más si proponés 0-2 preguntas afiladas que 5 dudosas.

QUÉ HACE UNA PREGUNTA DE PALANCA BUENA:

- ABIERTA, no múltiple choice. Activa el conocimiento implícito del usuario.
- ACUMULATIVA — toma de las respuestas previas (que ya leíste).
- DESBLOQUEA conocimiento que solo el usuario tiene (operaciones internas, contexto político, decisiones implícitas, recursos no obvios).
- ATACA UN PUNTO DE FRAGILIDAD del plan que el modelo principal NO tocó.

ÁNGULOS TÍPICOS NO CUBIERTOS POR PREGUNTAS GENÉRICAS DE PRIORIZACIÓN:

- Resistencias humanas / políticas que el plan asume neutralizadas.
- Recursos externos (clientes/proveedores/regulators/competencia) que el plan trata como variables exógenas pero el usuario puede influir.
- Movimientos defensivos (qué pasa si tu apuesta principal falla — Plan B explícito).
- Velocidad real de ejecución vs. velocidad asumida (comparación con benchmarks que el usuario conoce).
- Movimientos del plan que parecen seguros pero asumen capacidad organizacional sin validar.
- Outputs intermedios que NO están en el inventario pero serían medibles antes del resultado final.

REGLAS DURAS DE OUTPUT:

1. Output: JSON estricto (Responses API structured output). El sistema valida shape contra schema.
2. Cada pregunta complementaria debe ser DISTINTA de las 5 ya hechas (en ángulo, no solo en redacción). Si dos preguntas son demasiado parecidas, devolvés solo una.
3. Cada pregunta tiene "razon_complementariedad" (1 oración) que explica QUÉ ÁNGULO toca esta pregunta que las 5 anteriores no tocaron. Esto ayuda al usuario a confiar en por qué le estás haciendo más preguntas.
4. NO inventes preguntas para llenar cuota. Si el modelo principal cubrió todo, devolvés preguntas: [] y razonamiento_global explicando por qué.
5. Tono igual al modelo principal: confrontacional, directo, español rioplatense neutro ("vos"). NO emojis. NO formatos decorativos.

CASOS BORDE:

- Si las respuestas del usuario son muy cortas o evasivas en alguna pregunta principal, NO repitás la pregunta — eso es trabajo del modelo principal en su próximo turno. Vos solo agregás ángulos NUEVOS.
- Si el inventario es muy chico (<5 movimientos), probablemente haya menos espacio para palancas adicionales — devolvés 0-1 preguntas.
- Si el plan tiene un supuesto exógeno con probabilidad baja y impacto alto que el modelo principal NO tocó, esa es típicamente una buena pregunta complementaria.`
}

export function buildPalancasValidadorUserMessage(
  plan: PlanEstrategico,
  preguntasPrincipal: PalancaQAPE[],
): string {
  const proposito = plan.proposito
  const situacion = plan.situacion
  const preparativos = plan.plan?.preparativos
  const inventario = plan.plan?.inventario

  // Plan Jr: propósito heredado (no se construye acá). Ver buildJrContextoHeredadoMd.
  const propMd = plan.tipo === 'Jr'
    ? buildJrContextoHeredadoMd(plan)
    : proposito
    ? `## Propósito del plan
Escena: ${proposito.escena}
Métricas clave: ${(proposito.metricas ?? []).map(m => `${m.metrica}: ${m.valor_objetivo} (hoy: ${m.valor_actual || 'sin baseline'})`).join('; ')}
Horizonte: ${proposito.horizonte}`
    : ''

  const sitMd = situacion
    ? `## Situación
Desvío principal: ${situacion.desvio_principal}
Causa raíz: ${situacion.causa_raiz}
Resistencias clave: ${(situacion.resistencias ?? []).map(r => `${r.actor} [${r.criticidad}]`).join(', ')}`
    : ''

  const prepMd = preparativos
    ? `## Preparativos del Paso 3.0
Áreas afectadas: ${(preparativos.areas_afectadas ?? []).map(a => `${a.nombre} (${a.responsable})`).join('; ')}
Supuestos exógenos:
${(preparativos.supuestos_exogenos ?? []).map(s => `- ${s.descripcion} [${s.probabilidad} prob, ${s.impacto_signo} ${s.impacto_magnitud}, estrategia: ${s.estrategia}]`).join('\n')}
Priorización inicial: ${preparativos.priorizacion_inicial?.desvio_elegido} — ${preparativos.priorizacion_inicial?.razon}
Criterio éxito por métrica:
${(preparativos.criterio_exito?.por_metrica ?? []).map(m => `- ${m.metrica}: pleno=${m.pleno} | mínimo=${m.minimo}`).join('\n')}
Zona de fracaso: ${preparativos.criterio_exito?.zona_fracaso}`
    : ''

  const movsMd = inventario?.movimientos
    ? `## Inventario de movimientos (${inventario.movimientos.length})

${inventario.movimientos
  .filter(m => m.estado_usuario !== 'quitado')
  .map(m => `- **${m.id}** [${m.categoria}] "${m.nombre}" (${m.estado_usuario}, banda ${m.costo_banda_ancha}) — dueño: ${m.dueno}\n  qué resuelve: ${m.que_resuelve}`)
  .join('\n')}`
    : ''

  // Construye un texto sintético para la "respuesta del usuario" en modos inline
  // (P-4 secuenciacion, P-5 marcado_simple) cuando qa.respuesta está vacío. Los
  // razonamientos viven POR MOV en el inventario:
  //   - secuenciacion: precondiciones_razonamiento + arranca_override_razonamiento.
  //   - marcado_simple: riesgo_ejecucion_razonamiento.
  // Sin esta síntesis el validador recibiría "Respuesta del usuario: " vacío.
  function respuestaSintetica(qa: PalancaQAPE): string {
    if (qa.respuesta?.trim()) return qa.respuesta
    const re = qa.respuesta_estructurada
    if (!re) return '(sin respuesta)'
    const movs = inventario?.movimientos ?? []
    if (re.modo === 'marcado_simple') {
      const marcadosIds = new Set(re.marcados)
      if (marcadosIds.size === 0) {
        return '(Marcó 0 movimientos con riesgo alto — "happy path": el usuario considera que ningún mov tiene riesgo de ejecución desproporcionado.)'
      }
      const conRazon = movs
        .filter(m => marcadosIds.has(m.id) && !!m.riesgo_ejecucion_razonamiento)
        .map(m => `  - **${m.id}** "${m.nombre}" [${m.categoria}] — razon: "${m.riesgo_ejecucion_razonamiento}"`)
        .join('\n')
      return `El usuario marcó ${marcadosIds.size} movimientos con riesgo alto de ejecución y dejó razon por mov in-line en el inventario:\n${conRazon}`
    }
    if (re.modo === 'secuenciacion') {
      const conOverride = movs.filter(m => !!m.arranca_override)
      const overrideMd = conOverride.length > 0
        ? `\n\nMovimientos con arranque MOVIDO MANUALMENTE (override del CPM):\n${conOverride.map(m => `  - **${m.id}** "${m.nombre}" → arranca_override=${m.arranca_override}${m.arranca_override_razonamiento ? ` — razon: "${m.arranca_override_razonamiento}"` : ''}`).join('\n')}`
        : ''
      return `El usuario confirmó el cronograma calculado por CPM (basado en duraciones, dependencias FS/FF/continuo + lag, y vacancias).${overrideMd}`
    }
    return '(sin texto, ver respuesta_estructurada del panel)'
  }

  const qaMd = preguntasPrincipal
    .map((qa, i) => `### Pregunta ${i + 1}: ${qa.pregunta}

**Respuesta del usuario:** ${respuestaSintetica(qa)}

${qa.observacion_modelo ? `**Observación del modelo principal:** ${qa.observacion_modelo}` : ''}`)
    .join('\n\n')

  return `Material del Sub-bloque 3.B — preguntas de palanca ya hechas por el modelo principal.

${propMd}

${sitMd}

${prepMd}

${movsMd}

## Preguntas + respuestas + observaciones del modelo principal (5)

${qaMd}

---

Tu tarea: detectar ÁNGULOS DE PALANCA SIN TOCAR. Devolver 0-5 preguntas complementarias en JSON estricto. Si las 5 ya hechas cubren bien el espacio, devolver array vacío + razonamiento_global explicando por qué.`
}

// JSON schema para Responses API structured output (strict mode).
// Si OpenAI devuelve algo que no matchea, falla rápido.
export const PALANCAS_VALIDADOR_SCHEMA = {
  type: 'object',
  properties: {
    preguntas: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          pregunta: {
            type: 'string',
            description: 'La pregunta complementaria, abierta, en español rioplatense.',
          },
          razon_complementariedad: {
            type: 'string',
            description: '1 oración explicando QUÉ ÁNGULO toca esta pregunta que las 5 anteriores no tocaron.',
          },
        },
        required: ['pregunta', 'razon_complementariedad'],
        additionalProperties: false,
      },
    },
    razonamiento_global: {
      type: 'string',
      description: '1-3 oraciones sobre el espacio de palancas. Si preguntas=[], explicá por qué considerás que las 5 ya hechas cubren bien.',
    },
  },
  required: ['preguntas', 'razonamiento_global'],
  additionalProperties: false,
} as const
