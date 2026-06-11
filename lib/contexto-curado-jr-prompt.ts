// System prompt + user message para el generador del Contexto Curado del Jr
// (Wizard de Despliegue, Fase 3 del sistema Sr→Jr).
//
// Llamada desde POST /api/planes-estrategicos/[id]/proponer-contexto-curado con
// Claude Opus + streaming. Output: JSON con 5 keys (contexto, proposito,
// criterios_exito, metricas, supuestos) — cada una markdown. El endpoint parsea
// y persiste cada key en su propio campo de Airtable para revisión/aprobación
// granular por el Sr/Admin antes de confirmar el despliegue.
//
// Split decidido 2026-06-01: antes era un solo blob de markdown
// (contexto_curado_md). Ahora cada concepto es un campo independiente.
//
// Los MOVIMIENTOS heredados NO forman parte de estos 5 campos: viven en
// movs_heredados_snapshot (JSON estructurado) y se renderizan como cards
// expandibles en /inicio. La narrativa de los 5 campos NO los re-describe.
//
// Dos modos:
//   - Generación completa: emite las 5 keys (primer "Proponer contexto").
//   - Regeneración por campo: emite SOLO una key, recibiendo las otras 4
//     editadas para mantener coherencia (botón ↻ de cada campo).
//
// Input para Opus:
//   - PlanEstrategico Sr (propósito + situación + plan curado activo)
//   - LineaJrPersistida específica (nombre, descripción, dueño, movs_ids)
//   - Movimientos heredados completos (resueltos desde inventario por ID) —
//     se le pasan al modelo como CONTEXTO para que la narrativa sea fiel, pero
//     NO debe re-listarlos en la salida.

import type { PlanEstrategico, LineaJrPersistida, MovimientoPE, ContextoCuradoJr } from './types'
import { getCuradoActivo } from './types'

export type ContextoCuradoCampo = keyof ContextoCuradoJr

// Descripción de qué debe contener cada campo. Fuente de verdad compartida
// entre el modo completo y el modo por-campo.
const CAMPO_SPEC: Record<ContextoCuradoCampo, { titulo: string; instruccion: string }> = {
  contexto: {
    titulo: 'Contexto / Bienvenida',
    instruccion:
      'Markdown. Empezá con un header "# Bienvenida — Plan Jr \\"<nombre del plan>\\"" y un saludo breve al dueño por su nombre. Después, 2-3 párrafos que MIREN HACIA ATRÁS/AFUERA: la situación general del Sr (desvío principal + causa raíz, SIN nombrar otros Planes Jr) y por qué este plan es parte de la respuesta. Es el encuadre del problema que justifica el plan.',
  },
  proposito: {
    titulo: 'Propósito del plan',
    instruccion:
      'Markdown (sin header propio — el sistema le pone el título). 1-2 párrafos que MIREN HACIA ADELANTE: a dónde llega este plan, su alcance operativo (qué cubre y qué NO cubre). Es el lugar de llegada del plan, derivado del Propósito del Sr.',
  },
  criterios_exito: {
    titulo: 'Criterios de éxito',
    instruccion:
      'Markdown (sin header propio). Qué significa que el plan esté logrado — criterios concretos y verificables, derivados del "criterio_exito" de los movimientos heredados y del plan curado del Sr. APLICÁ LA REGLA ANTI-INVENCIÓN: todo VALOR/UMBRAL tiene que estar respaldado por una fuente del Sr; si falta, proponé la variable SIN valor con "[valor a definir por el admin]". Si no hay criterio específico inferible, escribí "Tu rol es ejecutar los movimientos con foco en <métrica X> hasta <horizonte Y>." Usá una lista con - cuando haya más de un criterio.',
  },
  metricas: {
    titulo: 'Métricas del Propósito',
    instruccion:
      'Markdown (sin header propio). Lista con - de las métricas del Propósito del Sr que ESTE plan apunta a mover, cada una con valor objetivo y valor actual (formato "**<métrica>**: objetivo <X> · actual <Y>"). APLICÁ LA REGLA ANTI-INVENCIÓN: los valores objetivo/actual se copian de la fuente del Sr; NO inventes números. Si una métrica del Sr es totalmente ajena a este plan, NO la incluyas. Si ninguna aplica, escribí "Este plan no mueve directamente las métricas del Propósito del Sr; su aporte es habilitante."',
  },
  supuestos: {
    titulo: 'Supuestos críticos',
    instruccion:
      'Markdown (sin header propio). Lista con - de los supuestos exógenos del Sr que afectan operativamente a ESTE plan, cada uno con su probabilidad y la estrategia frente a él. Si no hay ninguno relevante, escribí "No hay supuestos exógenos críticos específicos para este plan — los riesgos están en el plano de ejecución."',
  },
}

const REGLAS_CONFIDENCIALIDAD = `CONFIDENCIALIDAD ESTRICTA — PROHIBIDO mencionar:
- Otros Planes Jr (sus nombres, sus alcances).
- Otros dueños Jr formales.
- Movimientos que NO están en este plan (aunque aparezcan en el plan curado del Sr).
- Decisiones de priorización del Sr que mencionen explícitamente otros Planes Jr.
PERMITIDO: métricas del Propósito del Sr, desvío + causa raíz, decisiones de priorización GENERALES, supuestos exógenos críticos.`

const REGLAS_TONO = `TONO: directo, profesional, respetuoso. Sin emojis. Sin frases vacías ("es un placer trabajar contigo"). El dueño Jr es un ejecutivo que necesita información operativa, no marketing. IDs de movimientos SIEMPRE con nombre entre paréntesis si los mencionás (ej "M-3 (Diseñar campaña)").`

const REGLAS_ANTI_INVENCION = `ANTI-INVENCIÓN (CRÍTICO — la confianza del admin depende de esto):
- NUNCA inventes valores, umbrales, números, porcentajes, montos ni fechas. Todo valor cuantitativo de un criterio de éxito o de una métrica TIENE que estar respaldado por una fuente del Sr que te paso en el user message: el "criterio_exito" de un movimiento heredado, una métrica/criterio del Propósito del Sr, o el plan curado. Preferí copiar el valor TEXTUAL de la fuente.
- NO agregues precisión que la fuente NO tiene. Ej: si el Sr dice "CACm < CACm actual", NO lo conviertas en "CACm PAI del canal" salvo que la fuente lo diga explícitamente. Quedate con la redacción de la fuente.
- Si te parece que falta un criterio o variable RELEVANTE para el plan que el Sr NO especificó con un valor, está bien proponerlo — pero como VARIABLE SIN VALOR: nombrá la variable y escribí "[valor a definir por el admin]" en lugar de inventar un número. SIEMPRE es mejor una variable sin valor que un valor inventado. El admin completará el valor.`

// System prompt. Si `campo` viene, instruye regeneración de SOLO ese campo.
export function buildContextoCuradoSystemPrompt(campo?: ContextoCuradoCampo): string {
  if (campo) {
    const spec = CAMPO_SPEC[campo]
    return `Sos un consultor estratégico senior. Tu tarea: regenerar UN SOLO campo del contexto curado que recibirá el dueño formal de un Plan Jr.

Campo a regenerar: **${spec.titulo}** (key JSON: "${campo}").

${spec.instruccion}

${REGLAS_CONFIDENCIALIDAD}

${REGLAS_TONO}

${REGLAS_ANTI_INVENCION}

COHERENCIA: en el mensaje del usuario vas a recibir los otros campos del contexto YA EDITADOS por el Sr/Admin. Tu campo regenerado tiene que ser coherente con ellos (no repetir, no contradecir).

OUTPUT: SOLO un objeto JSON con UNA key, "${campo}", cuyo valor es el markdown del campo. Sin texto antes ni después, sin fences \`\`\`. Ejemplo de forma:
{"${campo}": "<markdown>"}`
  }

  const camposDesc = (Object.keys(CAMPO_SPEC) as ContextoCuradoCampo[])
    .map(k => `- **"${k}"** (${CAMPO_SPEC[k].titulo}): ${CAMPO_SPEC[k].instruccion}`)
    .join('\n\n')

  return `Sos un consultor estratégico senior. Tu tarea: escribir el CONTEXTO CURADO que recibirá el dueño formal de un Plan Jr cuando entre a su plan por primera vez.

Este contexto es lo PRIMERO que va a leer el dueño Jr y la única vista que tiene del Plan Sr — no ve el plan crudo, no ve los otros Planes Jr. Aparte de este contexto, el dueño verá una lista de sus movimientos heredados con su detalle técnico (NO los re-describas vos, se renderizan por separado).

El contexto está dividido en 5 campos independientes (el Sr/Admin los revisa y aprueba por separado):

${camposDesc}

${REGLAS_CONFIDENCIALIDAD}

${REGLAS_TONO}

${REGLAS_ANTI_INVENCION}

IMPORTANTE: NO incluyas una sección de "Movimientos heredados" ni los re-listes — eso se muestra aparte. Concentrate en los 5 campos narrativos.

OUTPUT: SOLO un objeto JSON con estas 6 keys:
- "contexto", "proposito", "criterios_exito", "metricas", "supuestos": cada valor es el markdown del campo (lo que LEE el dueño Jr).
- "fuentes": markdown SOLO PARA EL ADMIN (el dueño Jr NO lo ve nunca). Por cada criterio de éxito y cada métrica que propusiste, indicá en una línea de qué fuente del Sr salió su valor — ej "- Captación graduada: M-17 (Modelo de captación), criterio «CACm global <1000 USD»". Si un criterio/variable lo propusiste SIN valor (porque el Sr no lo especificó), marcalo como "- <variable>: [a completar por el admin — no estaba en el Sr]". Esto le permite al admin verificar de un vistazo que nada está inventado y qué le falta completar.
Sin texto antes ni después, sin fences \`\`\`. Verificá antes de emitir que no mencionaste otros Planes Jr ni sus dueños, y que ningún valor de criterio/métrica está inventado (cada uno tiene fuente o está marcado "[a definir por el admin]").`
}

// User message con el contexto del Sr. Si `opts.valoresActuales` viene (modo
// regeneración por campo), se anexan los otros campos ya editados.
export function buildContextoCuradoUserMessage(
  planSr: PlanEstrategico,
  linea: LineaJrPersistida,
  movsHeredados: MovimientoPE[],
  movsOtrasLineasIds: Set<string>,
  opts?: { campo?: ContextoCuradoCampo; valoresActuales?: ContextoCuradoJr },
): string {
  const planoP3 = planSr.plan
  if (!planoP3) throw new Error('Plan Sr sin plan curado — no se puede generar contexto.')

  const curado = getCuradoActivo(planSr)

  const movsLineaIds = new Set(linea.movimientos_ids)
  const nombrePorId = new Map<string, string>()
  for (const m of (planoP3.inventario?.movimientos ?? [])) {
    nombrePorId.set(m.id, m.nombre)
  }

  function clasificarRefs(ids: string[]): { internas: string[]; externas: string[] } {
    const internas: string[] = []
    const externas: string[] = []
    for (const id of ids) {
      if (movsLineaIds.has(id)) {
        internas.push(`${id} (${nombrePorId.get(id) ?? '?'})`)
      } else if (movsOtrasLineasIds.has(id)) {
        externas.push(id)
      }
    }
    return { internas, externas }
  }

  let msg = `# Plan Estratégico Sr — contexto para curar el Jr

## Datos generales del Plan Jr a desplegar
- **Nombre del plan:** ${linea.nombre}
- **Descripción operativa:** ${linea.descripcion || '(sin descripción específica — inferí del contenido de los movs)'}
- **Dueño formal del Jr:** ${linea.dueno_jr_nombre} (${linea.dueno_jr_email})
- **Movimientos heredados:** ${linea.movimientos_ids.length}

## Propósito del Plan Sr (lugar de llegada)
- Escena: ${planSr.proposito?.escena ?? '(no declarada)'}
- Horizonte: ${planSr.proposito?.horizonte ?? '(no declarado)'}
- Estabilidad esperada: ${planSr.proposito?.estabilidad ?? '(no declarada)'}

### Métricas del Propósito (todas — vos elegís cuáles aplican a este plan)
${(planSr.proposito?.metricas ?? []).map(m => `  - **${m.metrica}**: objetivo ${m.valor_objetivo} · actual ${m.valor_actual}`).join('\n') || '  (sin métricas declaradas)'}

## Situación del Plan Sr
- **Desvío principal:** ${planSr.situacion?.desvio_principal ?? '(no declarado)'}
- **Desvío cuantificado:** ${planSr.situacion?.desvio_cuantificado ?? '(no declarado)'}
- **Causa raíz:** ${planSr.situacion?.causa_raiz ?? '(no declarada)'}
- **Consecuencia 6 meses:** ${planSr.situacion?.consecuencia_6m ?? '(no declarada)'}
- **Consecuencia 12 meses:** ${planSr.situacion?.consecuencia_12m ?? '(no declarada)'}

## Supuestos exógenos críticos del Sr (filtrá los que aplican a este plan)
${(planoP3.preparativos?.supuestos_exogenos ?? []).map(s =>
  `  - "${s.descripcion}" · tipo ${s.tipo || '?'} · prob ${s.probabilidad || '?'} · impacto ${s.impacto_signo || '?'}/${s.impacto_magnitud || '?'} · estrategia ${s.estrategia || '?'} — ${s.razon}`,
).join('\n') || '  (sin supuestos críticos declarados)'}
`

  if (curado) {
    msg += `
## Decisiones de priorización del Sr (filtrá las que aplican o son generales)
${curado.decisiones_priorizacion.map((d, i) => `  ${i + 1}. **${d.decision}** — ${d.razon}`).join('\n')}
`
  }

  // Los movs se pasan como CONTEXTO (para que la narrativa sea fiel), pero el
  // modelo NO debe re-listarlos en la salida — se renderizan aparte.
  msg += `
## Movimientos heredados de este plan (CONTEXTO — NO los re-listes en tu salida)
Son ${movsHeredados.length} movimientos. Usalos para que el contexto, el propósito y los criterios sean fieles al trabajo real del plan.

`
  for (const m of movsHeredados) {
    const precs = clasificarRefs(m.precondiciones ?? [])
    const desbl = clasificarRefs(m.desbloquea ?? [])
    msg += `### ${m.id}. ${m.nombre}
- Categoría: ${m.categoria}
- Qué resuelve: ${m.que_resuelve}
- Dueño operativo: ${m.dueno}${m.dueno_es_vacante ? ` [VACANCIA — ${m.dueno_semanas_cobertura ?? 8} semanas estimadas para cubrir]` : ''}
- Esfuerzo (banda ancha): ${m.costo_banda_ancha} · Impacto: ${m.impacto ?? 'media'}
- Precondiciones internas: ${precs.internas.join(', ') || 'ninguna'}${precs.externas.length ? ` · externas (otros planes): ${precs.externas.length}` : ''}
- Criterio de éxito: ${m.criterio_exito}
`
  }

  // Modo regeneración por campo: anexar los otros campos ya editados.
  if (opts?.campo && opts.valoresActuales) {
    const spec = CAMPO_SPEC[opts.campo]
    msg += `
# Tarea — REGENERAR UN SOLO CAMPO

Regenerá SOLO el campo **${spec.titulo}** (key "${opts.campo}"). Los demás campos ya fueron editados por el Sr/Admin y NO los toques — están acá para que mantengas coherencia:

${(Object.keys(CAMPO_SPEC) as ContextoCuradoCampo[])
  .filter(k => k !== opts.campo)
  .map(k => `## ${CAMPO_SPEC[k].titulo} (ya editado)\n${(opts.valoresActuales![k] ?? '(vacío)').trim() || '(vacío)'}`)
  .join('\n\n')}

Emití SOLO el JSON con la key "${opts.campo}".`
  } else {
    msg += `
# Tarea

Generá el contexto curado para el dueño Jr ${linea.dueno_jr_nombre}, en los 5 campos. Verificá ANTES de emitir:
1. No mencionaste otros Planes Jr ni sus dueños.
2. No re-listaste los movimientos (se muestran aparte).
3. El tono es directo y operativo, sin marketing.

Emití SOLO el JSON con las 5 keys.`
  }

  return msg
}
