// System prompt + user message del generador del Borrador del Plan (Sub-bloque
// 3.C del Paso 3). Output JSON-only — NO conversacional.
//
// Llamada desde POST /api/planes-estrategicos/[id]/paso3/borrador/generar con
// Claude Opus 4.7 + max_tokens alto + streaming. Latencia esperada 60-120s.
//
// El output se parsea como BorradorIteracionPE y se persiste en
// plan.borrador.iteraciones (append, no replace).
//
// Caso re-iteración: si el usuario marcó disconformidades sobre una iteración
// previa, este prompt incluye la iteración previa + las razones de
// disconformidad como contexto adicional para regenerar.

import type { PlanEstrategico, BorradorIteracionPE, MovimientoPE } from './types'
import { formatLinchpinsSection } from './linchpins'
import { buildJrContextoHeredadoMd } from './jr-paso3-context'

// ─── Post-procesamiento: inyectar nombre en cada M-X de texto narrativo ──────
//
// El system prompt instruye al modelo a emitir `M-X (nombre)` en TODAS las
// apariciones dentro de texto narrativo. Pero Opus cumple parcialmente: usa el
// formato en la 1ra mención de un ID dentro de una sección y abrevia en las
// subsiguientes. Smoke 2026-05-11 detectó 50 ocurrencias huérfanas.
//
// Este helper es defensa final: reemplaza CUALQUIER `M-X` que NO esté seguido
// por `(nombre)` con `M-X (nombre)` leyendo del inventario. Se aplica en el
// endpoint (POST /paso3/borrador/generar) y en el smoke de validación.
//
// NO toca:
//   - secuencia_movimientos[].movimientos (array estructurado de IDs)
//   - IDs no presentes en el inventario (caso raro — solo loguea)
export function inyectarNombresMovimientos(
  iteracion: BorradorIteracionPE,
  movimientos: MovimientoPE[],
): { iteracion: BorradorIteracionPE; inyecciones: number; huerfanos: number } {
  const nombrePorId = new Map<string, string>()
  for (const m of movimientos) nombrePorId.set(m.id, m.nombre)

  // Matchea M-<digits> que NO esté seguido por `\s*\(`. Captura el número.
  const MOV_SIN_NOMBRE = /\bM-(\d{1,2})\b(?!\s*\()/g

  let inyecciones = 0
  let huerfanos = 0

  function aumentar(texto: string): string {
    if (!texto) return texto
    return texto.replace(MOV_SIN_NOMBRE, (_match, num) => {
      const id = `M-${num}`
      const nombre = nombrePorId.get(id)
      if (!nombre) {
        huerfanos++
        return id
      }
      inyecciones++
      return `${id} (${nombre})`
    })
  }

  const iteracionLimpia: BorradorIteracionPE = {
    ...iteracion,
    contexto: aumentar(iteracion.contexto),
    decisiones_priorizacion: iteracion.decisiones_priorizacion.map(d => ({
      ...d,
      decision: aumentar(d.decision ?? ''),
      razon: aumentar(d.razon ?? ''),
      alternativas_descartadas: (d.alternativas_descartadas ?? []).map(aumentar),
    })),
    secuencia_movimientos: iteracion.secuencia_movimientos.map(f => ({
      ...f,
      // movimientos[] se queda como IDs estructurados — NO se toca
      razon_secuencia: aumentar(f.razon_secuencia ?? ''),
    })),
    supuestos_criticos: iteracion.supuestos_criticos.map(aumentar),
    criterio_exito: {
      pleno: aumentar(iteracion.criterio_exito.pleno),
      minimo: aumentar(iteracion.criterio_exito.minimo),
      path_minimo: aumentar(iteracion.criterio_exito.path_minimo),
    },
    alternativas_descartadas: iteracion.alternativas_descartadas.map(a => ({
      ...a,
      decision: aumentar(a.decision ?? ''),
      razon: aumentar(a.razon ?? ''),
    })),
  }

  return { iteracion: iteracionLimpia, inyecciones, huerfanos }
}

export function buildBorradorSystemPrompt(): string {
  return `Sos un consultor estratégico senior. Tu tarea: ARMAR el BORRADOR del plan estratégico, integrando:

  - Propósito (escena ideal, métricas, fuera de scope)
  - Situación (desvío principal, causa raíz, resistencias)
  - Preparativos del 3.0 (áreas afectadas, supuestos exógenos, priorización inicial, criterio de éxito)
  - Inventario del 3.A (movimientos activos — IGNORAR los con estado_usuario="quitado")
  - Palancas del 3.B (5 preguntas principal + N validador con sus respuestas) — son las RESTRICCIONES más importantes del plan

REGLAS DURAS:

1. **Output JSON-only.** NO conversación, NO explicaciones, NO markdown, NO comentarios. Solo el JSON entre el primer "{" y el último "}". El sistema parsea strict.

2. **6 secciones obligatorias** en el JSON output:
   - "contexto": string de 1-2 párrafos describiendo la transformación que se busca y por qué el plan importa AHORA. NO es resumen del propósito — es la narrativa que conecta situación → propósito vía los movimientos elegidos.
   - "decisiones_priorizacion": array de DecisionPriorizacionPE. Cada una documenta una decisión grande del plan: qué se priorizó, por qué, qué alternativas se descartaron. Min 3, max 7. Tomá estas decisiones de las respuestas del 3.B (palanca más fuerte, top 3, pares críticos, etc.).
   - "secuencia_movimientos": array de FaseSecuenciaPE. Cada fase tiene { fase: string (ej "Q1 2026 - Fundación"), movimientos: string[] (ids), razon_secuencia: string }. 3-5 fases. CRÍTICO: respetá las precondiciones declaradas en el inventario + la cadena crítica identificada en 3.B (M-3→M-4→M-1 si aplica).
   - "supuestos_criticos": array de strings. Las descripciones (NO copias literales) de los supuestos exógenos de 3.0.B que son TOP RIESGO según las respuestas del 3.B. Min 2, max 5.
   - "criterio_exito": { pleno: string, minimo: string, path_minimo: string }. Pleno y mínimo vienen del 3.0.D. path_minimo es NUEVO: describe en 1-2 oraciones qué movimientos hay que ejecutar SÍ O SÍ para llegar al mínimo aceptable (subset del path completo).
   - "alternativas_descartadas": array de { decision: string, razon: string }. Min 2, max 5. Estas son alternativas que VOS identificaste y descartaste al armar el plan — no necesariamente las del usuario.

3. **Campos del wrapper de iteración:** además de las 6 secciones, emití:
   - "numero": el número de iteración (1, 2 o 3). Te lo paso en el user message.
   - "disconformidades_usuario": [] (vacío al generar — el cliente las completa cuando el user marca).
   - "generado_en": ISO 8601 string con timestamp actual.
   - (NO emitas costo_usd ni latencia_ms — el backend los calcula.)

4. **Respetá las restricciones de 3.B.** Las 5 preguntas principal + N validador del 3.B son la voz del usuario sobre cómo armar el plan. NO ignores ninguna. Si la palanca más fuerte fue M-1, M-1 tiene que aparecer prominentemente en secuencia + decisiones. Si una cadena crítica fue identificada (ej M-3→M-4→M-1), respetala en secuencia_movimientos.

5. **NO uses movimientos quitados.** Si un movimiento tiene estado_usuario="quitado", NO lo incluyas en secuencia_movimientos. Si el usuario lo descartó, no aparece en el plan.

6. **Re-iteración con disconformidades.** Si el user message incluye una sección "ITERACIÓN PREVIA + DISCONFORMIDADES", significa que es la 2da o 3ra iteración. En ese caso:
   - Leé la iteración previa entera.
   - Leé cada disconformidad: { elemento: "<qué marcó>", razon: "<por qué no le cierra>" }.
   - Regenerá el plan resolviendo cada disconformidad PERO preservando lo que NO marcó como disconforme. Si la disconformidad fue sobre secuencia_movimientos pero el contexto y las decisiones le cerraban, no cambies contexto y decisiones — solo secuencia.

7. **Movimientos palanca (alto out-degree).** El user message incluye una sección "Movimientos palanca detectados" con los movs que desbloquean ≥3 otros del inventario. ESTOS son los habilitadores del plan: si caen tarde, el resto se demora. Reglas:
   - Salvo justificación dura (precondición externa, vacancia bloqueante, restricción regulatoria/temporal), los movs palanca van en la PRIMERA fase de \`secuencia_movimientos\` (Q1 o equivalente).
   - Si un mov palanca queda en una fase tardía, escribí la razón explícita en \`razon_secuencia\` de esa fase.
   - Mencioná al menos 1 mov palanca en \`decisiones_priorizacion\` — la decisión grande de habilitar el plan desde ahí.
   - Si la sección viene vacía (plan chico, sin palancas detectadas), ignorá esta regla.

8. **IDs de movimientos SIEMPRE con nombre entre paréntesis — TODAS las apariciones, no solo la primera** (regla crítica de legibilidad). Cuando uses un ID de movimiento (M-1, M-2, ..., M-N) en CUALQUIER campo de TEXTO NARRATIVO del output, sumá el nombre del movimiento entre paréntesis inmediatamente después. **Esto aplica a CADA aparición individual, no solo a la primera mención en una sección o frase.** Si M-1 aparece 5 veces en un mismo texto, las 5 deben tener \`M-1 (nombre)\`. Trata las menciones como atómicas, no como referencias contextualizadas.

   Formato obligatorio: \`M-X (nombre del movimiento)\`. El nombre lo sacás del inventario que te paso en el user message (cada movimiento tiene su \`"nombre"\`). Usá el nombre completo, no abreviado.

   Aplica en estos campos sin excepción:
   - \`contexto\` (string narrativo)
   - \`decisiones_priorizacion[].decision\` y \`.razon\` y \`.alternativas_descartadas[]\`
   - \`secuencia_movimientos[].razon_secuencia\` (NO el array \`.movimientos\` — ver excepción abajo)
   - \`supuestos_criticos[]\`
   - \`criterio_exito.pleno\`, \`.minimo\`, \`.path_minimo\`
   - \`alternativas_descartadas[].decision\` y \`.razon\`

   EXCEPCIÓN — \`secuencia_movimientos[].movimientos\`: este es un array de IDs estructurados (no texto narrativo). Mantenelo como solo IDs (\`["M-1", "M-3"]\`). El frontend renderiza el nombre desde el inventario.

   Ejemplos:
   - ❌ MAL: "Concentrar el frente A en M-1 durante 60 días y diferir M-2 a Q2."
   - ✅ BIEN: "Concentrar el frente A en M-1 (Contratar QA Lead senior) durante 60 días y diferir M-2 (Contratar Performance Engineer) a Q2."

   - ❌ MAL: "La cadena M-3 → M-4 → M-1 es path crítico."
   - ✅ BIEN: "La cadena M-3 (Construir business case con costo de bugs) → M-4 (Aprobación presupuesto Finanzas) → M-1 (Contratar QA Lead senior) es path crítico."

   POR QUÉ: el usuario lee el borrador en una vista dedicada y NO necesariamente recuerda qué representa cada M-X. Sin el nombre inline, el borrador es ilegible y exige cross-reference constante al inventario.

EVITAR ESTAS TRAMPAS:

- **Plan happy-path:** si las respuestas del 3.B identificaron riesgos (cuello político, mercado seco, etc.), el contexto + criterio_exito tienen que reconocerlos. NO emitas un plan que asume todo sale bien.
- **Plan-shopping list:** decisiones_priorizacion no es "qué hacemos primero" — es "qué decisión grande tomamos al elegir esta secuencia, qué se descartó y por qué".
- **Movimientos sin owner:** si un movimiento del inventario tiene dueño="[vacancia: X]", la secuencia tiene que mostrar que ese dueño se crea ANTES en una fase previa o en una fase paralela con dependencia dura.
- **Path_minimo ambiguo:** path_minimo NO es "todo es importante" — es la lista corta de movimientos que SÍ O SÍ tienen que ejecutarse para que el plan no sea fracaso (zona <umbral declarado).

OUTPUT FORMAT — schema exacto del JSON que esperás emitir:

\`\`\`json
{
  "numero": <1|2|3>,
  "contexto": "<string 1-2 párrafos>",
  "decisiones_priorizacion": [
    { "decision": "<string>", "razon": "<string>", "alternativas_descartadas": ["<string>", ...] }
  ],
  "secuencia_movimientos": [
    { "fase": "<string ej 'Q1 2026 - Fundación'>", "movimientos": ["M-1", "M-3", ...], "razon_secuencia": "<string>" }
  ],
  "supuestos_criticos": ["<string descripción>", ...],
  "criterio_exito": {
    "pleno": "<string copia del 3.0.D>",
    "minimo": "<string copia del 3.0.D>",
    "path_minimo": "<string NUEVO, 1-2 oraciones>"
  },
  "alternativas_descartadas": [
    { "decision": "<string>", "razon": "<string>" }
  ],
  "disconformidades_usuario": [],
  "generado_en": "<ISO 8601>"
}
\`\`\`

Recordá: SOLO el JSON. Sin texto antes, sin texto después.`
}

export function buildBorradorUserMessage(
  plan: PlanEstrategico,
  numeroIteracion: 1 | 2 | 3,
  iteracionPrevia?: BorradorIteracionPE,
  disconformidades?: Array<{ elemento: string; razon: string }>,
): string {
  const planoP3 = plan.plan
  if (!planoP3) throw new Error('Plan sin plan.plan — no se puede generar borrador.')

  const inventario = planoP3.inventario
  const movsActivos = (inventario?.movimientos ?? []).filter(m => m.estado_usuario !== 'quitado')

  // Plan Jr: propósito heredado (no se construye acá). Ver buildJrContextoHeredadoMd.
  const propMd = plan.tipo === 'Jr'
    ? buildJrContextoHeredadoMd(plan)
    : `## Propósito
Escena ideal: ${plan.proposito?.escena ?? '(no declarada)'}
Métricas: ${JSON.stringify(plan.proposito?.metricas ?? [], null, 2)}
Fuera de scope: ${JSON.stringify(plan.proposito?.fuera ?? [], null, 2)}
Horizonte: ${plan.proposito?.horizonte ?? '(no declarado)'}`

  let msg = `# Contexto del plan

${propMd}

## Situación
Desvío principal: ${plan.situacion?.desvio_principal ?? '(no declarado)'}
Causa raíz: ${plan.situacion?.causa_raiz ?? '(no declarada)'}
Resistencias: ${JSON.stringify(plan.situacion?.resistencias ?? [], null, 2)}

## Preparativos (3.0)
Áreas afectadas: ${JSON.stringify(planoP3.preparativos?.areas_afectadas ?? [], null, 2)}
Supuestos exógenos: ${JSON.stringify(planoP3.preparativos?.supuestos_exogenos ?? [], null, 2)}
Priorización inicial: ${JSON.stringify(planoP3.preparativos?.priorizacion_inicial ?? null, null, 2)}
Criterio de éxito: ${JSON.stringify(planoP3.preparativos?.criterio_exito ?? null, null, 2)}

## Inventario (3.A) — ${movsActivos.length} movimientos activos
${movsActivos.map(m => {
  const precond = m.precondiciones?.length ? ` precond=[${m.precondiciones.join(',')}]` : ''
  const desbloq = m.desbloquea?.length ? ` desbloquea=[${m.desbloquea.join(',')}]` : ''
  const durStr = m.duracion_meses_ejecucion ? `duración=${m.duracion_meses_ejecucion}m` : (m.ventana_temporal ? `ventana=${m.ventana_temporal.arranca}→${m.ventana_temporal.termina}` : 'sin-duración')
  // Campos user-edited inline (P-4 override + P-5 riesgo). Si están seteados,
  // los sumamos al render del mov para que el modelo del borrador los vea sin
  // tener que cross-referenciar con respuesta_estructurada de las preguntas.
  const riesgo = m.riesgo_ejecucion_razonamiento ? ` · ⚠ RIESGO ALTO ejecución: "${m.riesgo_ejecucion_razonamiento}"` : ''
  const override = m.arranca_override
    ? ` · arranca_override=${m.arranca_override}${m.arranca_override_razonamiento ? ` (razon: "${m.arranca_override_razonamiento}")` : ''}`
    : ''
  return `${m.id} (${m.categoria}): "${m.nombre}" · dueño=${m.dueno} · resuelve="${m.que_resuelve}" · ${durStr} · banda=${m.costo_banda_ancha}${precond}${desbloq}${riesgo}${override}`
}).join('\n')}

${formatLinchpinsSection(movsActivos)}

## Palancas (3.B) — 5 preguntas principal con respuestas del usuario
${(planoP3.palancas?.preguntas_principal ?? []).map(q => {
  const re = q.respuesta_estructurada
  const reStr = re ? ` [panel: ${JSON.stringify(re)}]` : ''
  // Si el modo es inline (P-4 secuenciacion, P-5 marcado_simple) y la respuesta
  // texto está vacía, decimos explícitamente que las razones viven in-line en
  // el inventario (ya rendereado más arriba con los campos user-edited).
  const modoInline = q.modo_interaccion === 'secuenciacion' || q.modo_interaccion === 'marcado_simple'
  const respTexto = q.respuesta?.trim()
    ? q.respuesta
    : (modoInline && re
        ? `(respuesta dada en el panel; los razonamientos por mov viven in-line en el inventario — ver campos arranca_override_razonamiento / riesgo_ejecucion_razonamiento de cada mov arriba)`
        : '(sin respuesta texto)')
  return `${q.id}: "${q.pregunta}"\n  → respuesta del usuario: "${respTexto}"${reStr}`
}).join('\n\n')}

${(planoP3.palancas?.preguntas_validador?.length ?? 0) > 0 ? `## Validador (3.B) — ${planoP3.palancas?.preguntas_validador?.length ?? 0} preguntas complementarias con respuestas
${(planoP3.palancas?.preguntas_validador ?? []).map(q => `${q.id}: "${q.pregunta}"\n  → respuesta del usuario: "${q.respuesta}"`).join('\n\n')}` : ''}

# Tarea

Generá el borrador del plan como JSON estricto siguiendo el schema y las reglas del system prompt. Este es la iteración #${numeroIteracion}.`

  if (numeroIteracion > 1 && iteracionPrevia && disconformidades?.length) {
    msg += `

## ITERACIÓN PREVIA + DISCONFORMIDADES

Iteración anterior (#${iteracionPrevia.numero}) — la generaste vos pero el usuario marcó disconformidades:

\`\`\`json
${JSON.stringify({
  contexto: iteracionPrevia.contexto,
  decisiones_priorizacion: iteracionPrevia.decisiones_priorizacion,
  secuencia_movimientos: iteracionPrevia.secuencia_movimientos,
  supuestos_criticos: iteracionPrevia.supuestos_criticos,
  criterio_exito: iteracionPrevia.criterio_exito,
  alternativas_descartadas: iteracionPrevia.alternativas_descartadas,
}, null, 2)}
\`\`\`

Disconformidades del usuario sobre esa iteración:

${disconformidades.map((d, i) => `${i + 1}. Elemento: "${d.elemento}"\n   Razón: "${d.razon}"`).join('\n\n')}

REGENERÁ el borrador resolviendo cada disconformidad PERO preservando lo que el user NO marcó (si la disconformidad es solo sobre secuencia, mantené contexto y decisiones del previo).`
  }

  return msg
}
