// System prompt + user message del generador de inventario inicial (Sub-bloque
// 3.A del Paso 3). Output JSON-only — NO conversacional.
//
// Llamada desde POST /api/planes-estrategicos/[id]/paso3/inventario/generar
// con Claude Opus 4.7, max_tokens alto (32k), streaming. Latencia esperada
// 30-60s para un plan rico (con 5-10 áreas, 10-20 supuestos, 2-7 métricas).
//
// El output se parsea como InventarioPE y se persiste en plan.inventario.
// El cuestionario conversacional posterior (3.A revisión categoría por
// categoría) corre por el chat normal — este endpoint solo genera la
// hipótesis inicial.

import type { PlanEstrategico } from './types'

export function buildInventarioSystemPrompt(): string {
  return `Sos un consultor estratégico senior. Tu tarea: generar un INVENTARIO INICIAL de movimientos candidatos para un plan estratégico, basado en el Propósito + Situación + Preparativos del Paso 3.0 (áreas afectadas, supuestos exógenos, priorización, criterio de éxito).

REGLAS DURAS:

1. **Output JSON-only.** NO conversación, NO explicaciones, NO markdown. Solo el JSON entre el primer "{" y el último "}". El sistema parsea strict.

2. **Categorías auto-detectadas.** NO uses categorías fijas. Detectá 4-7 categorías que emerjan del plan concreto (ej: "Cobertura geográfica" / "Motor de adquisición" / "Capacidad organizacional" / "Gobernanza" / "Plataforma financiera"). Cada categoría debe cerrar UNA brecha clara entre Situación y Propósito.

3. **15-25 movimientos totales.** Menos de 15 = inventario flaco; más de 25 = el usuario no va a poder revisar uno por uno. Distribuilos en las categorías según necesidad real, no equilibrio forzado.

4. **Cada movimiento es ATÓMICO.** Una acción organizacional con principio y fin, dueño claro, recursos definidos. NO movimientos vagos tipo "mejorar la cultura" — sí "lanzar programa de onboarding mensual con materiales videos + checklist + evaluación 90 días".

5. **Dueños CONCRETOS.** Tomá los responsables del campo plan.preparativos.areas_afectadas. Si el área tiene responsable asignado (ej "Vicky Flores"), usalo. Si está como '[vacancia]', el dueño del movimiento es '[vacancia: <rol>]' Y agregás un movimiento separado de contratación.

6. **Dependencias declaradas.** Para cada movimiento, listá:
   - precondiciones: ids de movimientos que tienen que estar hechos primero
   - desbloquea: ids de movimientos que se vuelven posibles cuando este termina
   - tipo_dependencia: 'dura' (A debe terminar antes de empezar B) | 'blanda' (A facilita B pero no bloquea) | 'ninguna' (A y B pueden correr en paralelo)
   Esto permite secuenciar el plan correctamente en sub-bloques posteriores.

7. **Resumen por categoría.** Al final del JSON, generá un objeto por categoría con: total / aceptados (=0) / editados (=0) / quitados (=0). El usuario va a actualizar estos números cuando revise.

8. **Estado inicial: "pendiente".** TODOS los movimientos arrancan con estado_usuario="pendiente". El usuario va a aceptar/editar/quitar uno por uno en la fase de revisión.

EVITAR LAS 4 TRAMPAS DE H1:

- "Reproducir lo obvio": no listes solo lo que cualquiera vería sin pensar (ej: "contratar más gente" sin especificar). Cada movimiento debe tener especificidad operativa.
- "Plan-Frankenstein": no combines TODAS las palancas. Si dos movimientos atacan el mismo desvío, prioriza el más fuerte y dejá el otro como "alternativa descartada" (eso vendrá en 3.C, no acá).
- "Plan ideal pero improbable": no asumas recursos que no existen. Si el plan necesita 3 contrataciones críticas en 60 días, es un movimiento de alto riesgo (declaralo como tal con costo_banda_ancha='alta').
- "Plan mediocre pero seguro": tampoco uses solo lo que ya está garantizado. Algunos movimientos deben requerir esfuerzo real para que el plan alcance el propósito.

SCHEMA EXACTO DEL OUTPUT:

{
  "movimientos": [
    {
      "id": "M-1",
      "categoria": "<string — usar la misma categoría para movimientos relacionados>",
      "nombre": "<string — frase corta accionable>",
      "que_resuelve": "<string — qué brecha cierra de la SituaciónPropósito>",
      "ataca_desvio": "<string — referencia al desvío del Bloque 0-2 o capacidad del Propósito>",
      "costo_banda_ancha": "<'baja' | 'media' | 'alta'>",
      "costo_monetario": {
        "rango_min_usd": <number>,
        "rango_max_usd": <number>,
        "nota": "<string opcional>"
      },
      "ventana_temporal": {
        "arranca": "<YYYY-MM>",
        "termina": "<YYYY-MM>"
      },
      "precondiciones": ["<id de otro movimiento>"],
      "desbloquea": ["<id de otro movimiento>"],
      "tipo_dependencia": "<'dura' | 'blanda' | 'ninguna'>",
      "dueno": "<string — actor concreto del organigrama>",
      "criterio_exito": "<string — qué tiene que pasar para considerar el movimiento exitoso>",
      "estado_usuario": "pendiente"
    }
  ],
  "resumenes_categoria": [
    {
      "categoria": "<string>",
      "total": <number>,
      "aceptados": 0,
      "editados": 0,
      "quitados": 0
    }
  ],
  "generado_en": "<ISO datetime, lo seteás vos al momento de emitir>"
}

NO INCLUYAS NADA fuera de ese JSON. Empezá tu respuesta con "{" y terminá con "}". Si necesitas explicar algo, hacelo dentro del campo "nota" de costo_monetario o en "criterio_exito".

CASOS BORDE:

- Si una categoría detectada tiene solo 1 movimiento, está OK — no fuerces a 3 movimientos por categoría.
- Si dos movimientos parecen redundantes, dejá solo uno (más fuerte). Si dudás, dejá ambos y el usuario va a quitar uno.
- Si el plan tiene supuestos exógenos con estrategia "hedge" (ej: "si crédito reactiva, expandirse a media-baja"), el hedge se vuelve un movimiento candidato del inventario con su propia ventana temporal y precondiciones.
- Las "vacancias" del campo areas_afectadas se vuelven movimientos de contratación separados con dueño = '[vacancia]' y precondiciones para los movimientos que dependen de esa contratación.`
}

export function buildInventarioUserMessage(plan: PlanEstrategico): string {
  const proposito = plan.proposito
  const situacion = plan.situacion
  const preparativos = plan.plan?.preparativos

  const propMd = proposito ? `
## Propósito (a dónde queremos llegar)

Escena ideal: ${proposito.escena}

Métricas (${proposito.metricas?.length ?? 0}):
${(proposito.metricas ?? []).map(m => `- ${m.metrica}: objetivo=${m.valor_objetivo} | actual=${m.valor_actual || '(sin baseline)'}`).join('\n')}

Fuera de scope (${proposito.fuera?.length ?? 0}):
${(proposito.fuera ?? []).map(f => `- ${f.item}${f.razon ? ` — ${f.razon}` : ''}`).join('\n')}

Horizonte: ${proposito.horizonte}
Estabilidad: ${proposito.estabilidad}
` : '(propósito no declarado — no se puede generar inventario)'

  const sitMd = situacion ? `
## Situación (de dónde partimos)

Desvío principal: ${situacion.desvio_principal}
Cuantificación: ${situacion.desvio_cuantificado}
Causa raíz: ${situacion.causa_raiz}

Desvíos secundarios (${situacion.desvios_secundarios?.length ?? 0}):
${(situacion.desvios_secundarios ?? []).map(d => `- ${d.descripcion}: ${d.datos}`).join('\n')}

Recursos actuales:
${situacion.recursos_actuales}

Recursos faltantes:
${situacion.recursos_faltantes}

Resistencias (${situacion.resistencias?.length ?? 0}):
${(situacion.resistencias ?? []).map(r => `- ${r.actor} [${r.tipo} · ${r.criticidad}]: ${r.descripcion}${r.mitigacion ? ` — mitigación: ${r.mitigacion}` : ''}`).join('\n')}
` : '(situación no declarada)'

  const prepMd = preparativos ? `
## Preparativos del Paso 3.0 (inputs duros para el inventario)

Áreas afectadas (${preparativos.areas_afectadas?.length ?? 0}):
${(preparativos.areas_afectadas ?? []).map(a => `- ${a.nombre} → ${a.responsable}${a.notas ? ` (${a.notas})` : ''}`).join('\n')}

Supuestos exógenos (${preparativos.supuestos_exogenos?.length ?? 0}):
${(preparativos.supuestos_exogenos ?? []).map(s => `- ${s.descripcion} [${s.tipo}, prob ${s.probabilidad}, impacto ${s.impacto_signo} ${s.impacto_magnitud}, estrategia ${s.estrategia}] — ${s.razon}`).join('\n')}

Priorización inicial (primeros 60 días):
- Desvío elegido: ${preparativos.priorizacion_inicial?.desvio_elegido}
- Razón: ${preparativos.priorizacion_inicial?.razon}
${preparativos.priorizacion_inicial?.desbloquea ? `- Desbloquea: ${preparativos.priorizacion_inicial.desbloquea}` : ''}

Criterio de éxito por métrica:
${(preparativos.criterio_exito?.por_metrica ?? []).map(m => `- ${m.metrica}: pleno=${m.pleno} | mínimo=${m.minimo}`).join('\n')}

Zona de fracaso: ${preparativos.criterio_exito?.zona_fracaso}
` : '(preparativos no declarados — no se puede generar inventario sin esto)'

  return `Generá el inventario inicial de movimientos para este plan estratégico.

${propMd}

${sitMd}

${prepMd}

Output: JSON estricto según el schema del system prompt. Sin texto fuera del JSON. 15-25 movimientos en 4-7 categorías auto-detectadas. Empezá con "{" y terminá con "}".`
}
