// System prompt + user message del generador del Plan Curado (Sub-bloque 3.E).
// Output JSON-only — NO conversacional.
//
// Llamada desde POST /api/planes-estrategicos/[id]/paso3/curado/generar con
// Claude Opus 4.7 + max_tokens=24000 + streaming. Latencia esperada 60-90s.
//
// El output se parsea como esqueleto narrativo + IDs (string), y el endpoint
// hace el lookup para construir el PlanCuradoPE final (movimientos completos
// desde el inventario, supuestos completos desde plan.preparativos).
//
// Diferencia vs borrador:
//   - Borrador era una iteración en revisión (max 3, con disconformidades).
//   - Curado es FINAL. Es la versión "de prestigio" que va a vista pública.
//   - Integra: borrador aceptado + cada ajuste_aplicado de plan.estres.preguntas
//     + cualquier sugerencia explícita del user en el chat de 3.E.

import type { PlanEstrategico, BorradorIteracionPE, EstresQAPE } from './types'

export function buildCuradoSystemPrompt(): string {
  return `Sos un consultor estratégico senior. Tu tarea: CURAR el plan final integrando todo el trabajo del Paso 3.

INPUTS que vas a recibir en el user message:
  - Propósito, Situación, Preparativos: contexto inmutable, NO se modifican acá.
  - Inventario activo: lista de movimientos. Necesario para que sepas referenciar IDs correctamente.
  - Borrador aceptado (BorradorIteracionPE): es tu BASE — las decisiones, secuencia, supuestos, criterios y alternativas ya están armadas.
  - Plan.estres.preguntas (EstresQAPE[]): cada una puede tener \`ajuste_aplicado\` { tipo: 'inventario'|'borrador', descripcion: string } — son los cambios que el usuario aceptó durante 3.D y que TENÉS que aplicar al curar.

REGLAS DURAS:

1. **Output JSON-only.** NO conversación, NO markdown, NO comentarios. Solo el JSON entre el primer "{" y el último "}". El sistema parsea strict.

2. **El borrador es la base, los ajustes son patch-on-top.** Tomá el borrador aceptado entero. Por cada \`ajuste_aplicado\` en plan.estres.preguntas, aplicá el cambio que describe:
   - tipo='borrador': modificá el campo del borrador correspondiente (criterio_exito.path_minimo, supuestos_criticos, decisiones_priorizacion, etc.).
   - tipo='inventario': el cambio aplica a un movimiento del inventario. Reflejalo en la \`razon_secuencia\` de la fase donde aparece, en la decisión de priorización relacionada, o en supuestos_criticos si el ajuste eleva un riesgo.
   - Si el ajuste contradice una decisión del borrador, prevalece el ajuste (el user lo confirmó en 3.D).

3. **Schema del output** — emití EXACTAMENTE este shape (esqueleto narrativo + IDs):

\`\`\`json
{
  "contexto": "<string 1-2 párrafos, refinado vs el del borrador. Incorpora la perspectiva ganada en 3.D si aplica>",
  "decisiones_priorizacion": [
    { "decision": "<string>", "razon": "<string>" }
  ],
  "secuencia_movimientos": [
    {
      "fase": "<string ej 'Q1 2026 - Habilitación política'>",
      "movimientos_ids": ["M-1", "M-3", ...],
      "razon_secuencia": "<string>"
    }
  ],
  "supuestos_criticos_descripciones": ["<descripción exacta del supuesto, como aparece en preparativos.supuestos_exogenos>", ...],
  "criterio_exito": {
    "pleno": "<string copia del borrador con ajustes de 3.D aplicados>",
    "minimo": "<string idem>",
    "path_minimo": "<string idem, prestá especial atención a este — es donde más se aplican ajustes>"
  },
  "alternativas_descartadas": [
    { "decision": "<string>", "razon": "<string>" }
  ]
}
\`\`\`

4. **secuencia_movimientos[].movimientos_ids** es array de IDs (strings tipo "M-1"). El endpoint hace el lookup a MovimientoPE completo para el output final. NO emitas objetos enteros.

5. **supuestos_criticos_descripciones** son los strings EXACTOS de las descripciones de los supuestos en plan.preparativos.supuestos_exogenos[].descripcion. El endpoint matchea para resolver al objeto SupuestoExogenoPE completo. Si emitís una descripción que no matchea, el endpoint la deja como string (recovery), pero idealmente todas matchean.

6. **NO emitas disconformidades_usuario, numero, generado_en, costo_usd, latencia_ms, cerrado_en.** Esos los pone el backend.

7. **IDs SIEMPRE con nombre entre paréntesis en texto narrativo** (regla global del wizard). Aplicá a TODAS las apariciones en contexto, decisiones, razones, supuestos refinados, criterio_exito, alternativas_descartadas. Excepción: el array \`movimientos_ids\` mantiene solo IDs.

8. **Curado limpio, no shopping list.** El contexto debe LEERSE — no es resumen seco. Las decisiones de priorización deben explicar el "qué y por qué" sin jergas internas. Una persona que no participó del proceso debería entender la lógica del plan leyéndolo de corrido.

EVITAR:

- Repetir literalmente el borrador. Tiene que sentirse refinado por 3.D.
- Ignorar ajustes de estres. CADA \`ajuste_aplicado\` con tipo='borrador' DEBE estar reflejado.
- Cambiar drásticamente vs el borrador. Es curado, no re-arquitectura — si nada cambió en 3.D, el contenido es casi idéntico.

Recordá: SOLO el JSON. Sin texto antes, sin texto después.`
}

export function buildCuradoUserMessage(
  plan: PlanEstrategico,
  borradorAceptado: BorradorIteracionPE,
  estresPreguntas: EstresQAPE[],
  ajusteNarrativoUser?: string,
): string {
  const planoP3 = plan.plan
  if (!planoP3) throw new Error('Plan sin plan.plan — no se puede curar.')

  const inventario = planoP3.inventario
  const movsActivos = (inventario?.movimientos ?? []).filter(m => m.estado_usuario !== 'quitado')
  const supuestos = planoP3.preparativos?.supuestos_exogenos ?? []
  const ajustes = estresPreguntas.filter(q => q.ajuste_aplicado).map(q => ({
    pregunta_id: q.id,
    pregunta_text: q.pregunta.slice(0, 200),
    respuesta_text: q.respuesta.slice(0, 200),
    ajuste: q.ajuste_aplicado!,
  }))

  let msg = `# Inputs para curar el plan

## Propósito (inmutable)
Escena ideal: ${plan.proposito?.escena ?? '(no declarada)'}
Métricas: ${JSON.stringify(plan.proposito?.metricas ?? [], null, 2)}
Horizonte: ${plan.proposito?.horizonte ?? '(no declarado)'}

## Situación (inmutable)
Desvío principal: ${plan.situacion?.desvio_principal ?? '(no declarado)'}
Causa raíz: ${plan.situacion?.causa_raiz ?? '(no declarada)'}

## Inventario activo (${movsActivos.length} movimientos — para que matchees IDs)
${movsActivos.map(m => `  ${m.id}: "${m.nombre}" · dueño=${m.dueno} · ${m.categoria}`).join('\n')}

## Supuestos exógenos (de preparativos — para que matchees descripciones)
${supuestos.map((s, i) => `  [${i}] "${s.descripcion}"`).join('\n')}

## Borrador aceptado (tu BASE)

\`\`\`json
${JSON.stringify({
  contexto: borradorAceptado.contexto,
  decisiones_priorizacion: borradorAceptado.decisiones_priorizacion,
  secuencia_movimientos: borradorAceptado.secuencia_movimientos,
  supuestos_criticos: borradorAceptado.supuestos_criticos,
  criterio_exito: borradorAceptado.criterio_exito,
  alternativas_descartadas: borradorAceptado.alternativas_descartadas,
}, null, 2)}
\`\`\`

## Ajustes de 3.D (${ajustes.length} a aplicar)

${ajustes.length === 0 ? '(El usuario no marcó ajustes durante 3.D. El curado refina el borrador solo con calidad narrativa.)' : ajustes.map(a => `### ${a.pregunta_id} — tipo=${a.ajuste.tipo}
Pregunta de estrés: "${a.pregunta_text}"
Respuesta del usuario: "${a.respuesta_text}"
**Ajuste a aplicar**: ${a.ajuste.descripcion}`).join('\n\n')}

${ajusteNarrativoUser ? `## Ajuste narrativo adicional pedido por el usuario en 3.E

"${ajusteNarrativoUser}"

Aplicalo además de los ajustes de 3.D. Si contradice algo del borrador o de los ajustes de 3.D, prevalece este pedido del usuario en 3.E.` : ''}

# Tarea

Curá el plan integrando todo lo anterior. Emití el JSON estricto siguiendo el schema del system prompt.`

  return msg
}
