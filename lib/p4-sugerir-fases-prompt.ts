// System + user message para que Opus sugiera fases temporales para cada
// movimiento del inventario en la pregunta P-4 del 3.B (modo secuenciación).
//
// Las fases del plan son 3:
//   - Q2 (Arranque, mayo-junio): movs que SÍ O SÍ tienen que arrancar ya.
//   - Q3 (Aceleración, julio-septiembre): ejecución a escala, blitz, replica.
//   - Q4 (Consolidación, octubre-diciembre): cierre de ciclos, validación.
//
// Opus se basa en:
//   - Topología del DAG (capa longest-path).
//   - Linchpins (alto out-degree → Q2 salvo justificación).
//   - Tipo dura/blanda de cada edge.
//   - Ventana temporal declarada (mov.ventana_temporal.arranca).
//   - Propósito + situación + respuestas P-1..P-3 (contexto humano).
//
// Output JSON-only: { sugerencias: { [movId]: { fase, razonamiento } } }.

import type { MovimientoPE, PlanEstrategico, PalancaQAPE } from './types'
import { formatLinchpinsSection } from './linchpins'

export function buildP4SugerirFasesSystemPrompt(): string {
  return `Sos un consultor estratégico senior. Tu tarea: dado el inventario completo de movimientos de un plan estratégico (con sus dependencias declaradas en el DAG del Paso 3.A.6) y el contexto del plan, asignar cada movimiento a UNA de 3 fases temporales.

DEFINICIONES DE LAS FASES:

- **Q2 — Arranque (mayo-junio 2026, ~2 meses)**: movimientos que SÍ O SÍ tienen que arrancar ya. Foco en precondiciones, contrataciones críticas, palancas tempranas. Lo que no se inicia en Q2 atrasa el resto del plan.

- **Q3 — Aceleración (julio-septiembre 2026, ~3 meses)**: movimientos que dependen de que Q2 esté armado. Foco en ejecución a escala, blitz, replicación. Acá la rampa toma velocidad.

- **Q4 — Consolidación (octubre-diciembre 2026, ~3 meses)**: movimientos que cierran ciclos, validan, dejan listo el terreno 2027. Foco en cosecha, control, traspaso de aprendizajes.

CRITERIOS DE DECISIÓN (en orden de prioridad):

1. **Linchpins (palancas) — Q2 casi siempre**: si un movimiento desbloquea ≥3 otros (alto out-degree), debe arrancar en Q2 para no demorar el resto. La sección "Movimientos palanca detectados" en el user message los identifica explícitamente. EXCEPCIÓN: si el linchpin tiene un dueño vacante con N semanas de lead time tal que no pueda arrancar dentro de Q2, hay que empujarlo a la fase donde efectivamente puede arrancar.

2. **Vacancia del dueño (es_vacante + semanas_cobertura)** — REGLA CRÍTICA con cálculo basado en HOY:
   - Si un movimiento tiene \`dueno_es_vacante: true\` con \`dueno_semanas_cobertura: N\`, su FECHA EFECTIVA DE INICIO es **HOY + N semanas**.
   - El user message incluye una sección "Contexto temporal" con la fecha actual y, para cada fase, cuántas semanas QUEDAN hasta el fin de esa fase (contadas DESDE HOY). NO asumas que las fases arrancan ahora — el plan puede estar ya en marcha y consumió parte de Q2.
   - Asignación de fase para un mov vacante:
     - Si N ≤ semanas_restantes_Q2 → cabe en Q2.
     - Si N > semanas_restantes_Q2 pero ≤ semanas_restantes_Q3 → arranca en Q3.
     - Si N > semanas_restantes_Q3 pero ≤ semanas_restantes_Q4 → arranca en Q4.
     - Si N > semanas_restantes_Q4 → el mov no entra en el horizonte del plan (asignar Q4 igual, pero el razonamiento debe flagear el problema).
   - El razonamiento de output debe MENCIONAR EXPLÍCITAMENTE la vacancia y el cálculo cuando empuja la fase, ej: "Vacante 8 sem > ${'{'}semanas_rest_Q2${'}'} restantes en Q2 → arranca en Q3."

3. **Topología del DAG (longest-path)**: a más capas de precondiciones, más tarde el movimiento puede arrancar.
   - Capa 0 (sin precondiciones) → candidato natural a Q2.
   - Capa 1 → Q2 si las precondiciones son fast/Q2; Q3 sino.
   - Capa 2+ → Q3 o Q4 según.

4. **Tipo de dependencia DURA**: si A → B con tipo DURA, B no puede arrancar antes que A termine. Respetar el orden de fases (A en Q2 → B en Q2 o Q3 o Q4, NUNCA Q1).

5. **Ventana temporal declarada (mov.ventana_temporal.arranca)**: si el user declaró que el movimiento arranca en YYYY-MM, eso indica fase:
   - arranca <= 2026-06 → Q2.
   - arranca 2026-07 a 2026-09 → Q3.
   - arranca >= 2026-10 → Q4.
   Tomá esto como hint fuerte pero no infalible — el user puede haber declarado sin pensar la fase. Si choca con la vacancia (ej: ventana arranca 2026-05 pero vacancia toma 12 sem), gana la vacancia.

6. **Contexto humano (propósito + situación + respuestas P-1..P-3)**: el user ya respondió preguntas sobre palancas, cadenas críticas, top 3 movs. Usá esa info para validar tus asignaciones. Si el user marcó M-X como palanca más fuerte en P-1, M-X probablemente va en Q2 (si la vacancia lo permite).

REGLAS DURAS:

1. **Output JSON-only.** Empezá con "{" y terminá con "}". Sin conversación, markdown, ni explicaciones fuera del JSON.

2. **Todos los movs activos del inventario reciben una fase**. NO dejar ningún mov sin asignar.

3. **Fases válidas: "Q2", "Q3", "Q4" exclusivamente**. No inventar otras.

4. **Razonamiento corto** (1 frase, max ~150 chars). Mencioná el criterio principal que aplicaste:
   - Si es linchpin: "Linchpin del plan (desbloquea N movs), arranca temprano".
   - Si tiene precondiciones tardías: "Depende de M-Y (Q3), se demora hasta Q4".
   - Si la ventana temporal indica: "Ventana declarada arranca 2026-07, encaja en Q3".
   - Etc.

5. **Si un mov tiene una precondición DURA en una fase POSTERIOR a la suya, eso es un ciclo lógico — evitarlo**. La fase asignada al precondicionado debe ser ≥ a la del precondicionante.

6. **Balance esperable**: típicamente la mayoría de movs van en Q2 (arranque del plan). Q4 suele tener menos. No fuerces balance artificial — asigná según la lógica.

SCHEMA EXACTO DEL OUTPUT:

{
  "sugerencias": {
    "M-1": { "fase": "Q2", "razonamiento": "Linchpin del plan, desbloquea 5 movs." },
    "M-2": { "fase": "Q3", "razonamiento": "Depende de M-1 (Q2), ejecución a escala." },
    "M-3": { "fase": "Q4", "razonamiento": "Movimiento de consolidación, cierra ciclo de validación." },
    ...
  }
}

NO incluyas NADA fuera del JSON. Empezá con "{" y terminá con "}".`
}

export function buildP4SugerirFasesUserMessage(
  inventarioActivo: MovimientoPE[],
  plan: PlanEstrategico,
  preguntasPrevias: PalancaQAPE[],
): string {
  // Inventario serializado con precondiciones, desbloquea, tipos, ventanas.
  const inventarioMd = inventarioActivo
    .map(m => {
      const precs = (m.precondiciones ?? []).map(pid => {
        const tipo = m.precondiciones_tipo?.[pid] ?? 'blanda'
        return `${pid} (${tipo})`
      })
      const precondStr = precs.length ? ` precond=[${precs.join(', ')}]` : ''
      const desbloqStr = (m.desbloquea ?? []).length ? ` desbloquea=[${m.desbloquea.join(',')}]` : ''
      const ventana = m.ventana_temporal ? `${m.ventana_temporal.arranca}→${m.ventana_temporal.termina}` : 'sin definir'
      // Detección de vacancia: flag explícito O heurística legacy sobre el
      // string del dueño. Para legacy asumimos 8 sem y lo marcamos como tal.
      const esVacanteFlag = m.dueno_es_vacante === true
      const esVacanteLegacy = !esVacanteFlag && /vacanc|vacante/i.test(m.dueno ?? '')
      const esVacante = esVacanteFlag || esVacanteLegacy
      const vacanciaStr = esVacante
        ? esVacanteFlag
          ? ` · ⏳ VACANTE (${m.dueno_semanas_cobertura ?? 8} sem para cubrir)`
          : ` · ⏳ VACANTE (legacy — asumir 8 sem)`
        : ''
      return `- **${m.id}** [${m.categoria}] "${m.nombre}"
    dueño: ${m.dueno}${vacanciaStr} · ventana: ${ventana} · impacto: ${m.impacto ?? 'media'} · esfuerzo: ${m.costo_banda_ancha}
    qué resuelve: ${m.que_resuelve}${precondStr}${desbloqStr}`
    })
    .join('\n')

  // Sección de linchpins (reusamos el helper compartido).
  const linchpinsSection = formatLinchpinsSection(inventarioActivo)

  // Respuestas P-1..P-3 (las que ya el user respondió).
  const previas = preguntasPrevias
    .filter(q => q.respuesta && q.respuesta.trim())
    .map(q => `**${q.id}** — "${q.pregunta}"\n  Respuesta del user: ${q.respuesta}`)
    .join('\n\n')

  const propMd = plan.proposito
    ? `## Propósito del plan
Escena ideal: ${plan.proposito.escena}
Horizonte: ${plan.proposito.horizonte}
Métricas: ${(plan.proposito.metricas ?? []).map(m => m.metrica).join('; ')}`
    : ''

  const sitMd = plan.situacion
    ? `## Situación
Desvío principal: ${plan.situacion.desvio_principal}
Causa raíz: ${plan.situacion.causa_raiz}`
    : ''

  // Contexto temporal: hoy + semanas restantes por fase (CRÍTICO para que la
  // AI calcule correctamente movs con dueño vacante).
  const hoy = new Date()
  const year = hoy.getFullYear()
  const q2End = new Date(year, 5, 30)   // 30 junio
  const q3End = new Date(year, 8, 30)   // 30 septiembre
  const q4End = new Date(year, 11, 31)  // 31 diciembre
  const semanasHasta = (d: Date) => Math.max(0, Math.ceil((d.getTime() - hoy.getTime()) / (7 * 86400000)))
  const remQ2 = semanasHasta(q2End)
  const remQ3 = semanasHasta(q3End)
  const remQ4 = semanasHasta(q4End)
  const fmtFecha = hoy.toISOString().slice(0, 10)
  const contextoTemporalMd = `## Contexto temporal — leer ANTES de asignar fases

Fecha actual: **${fmtFecha}**

Semanas restantes desde HOY hasta el fin de cada fase:
- Q2 termina ${q2End.toISOString().slice(0, 10)} → quedan **${remQ2} semanas** desde hoy.
- Q3 termina ${q3End.toISOString().slice(0, 10)} → quedan **${remQ3} semanas** desde hoy.
- Q4 termina ${q4End.toISOString().slice(0, 10)} → quedan **${remQ4} semanas** desde hoy.

⚠️ El plan puede estar ya en marcha — Q2 ya consumió ${Math.max(0, 8 - remQ2)} semanas aproximadamente. NO asumas que las fases arrancan en este momento; usá estos números para juzgar si un mov vacante con N semanas de cobertura cabe en cada fase.`

  return `Asigná cada movimiento del siguiente inventario a una fase temporal (Q2/Q3/Q4) basándote en el DAG, ventanas declaradas, y contexto.

${contextoTemporalMd}

## Inventario completo (${inventarioActivo.length} movimientos activos)

${inventarioMd}

${linchpinsSection}

${propMd}

${sitMd}

${previas ? `## Respuestas previas del usuario en 3.B

${previas}` : ''}

# Tarea

Para cada movimiento del inventario, sugerí la fase ("Q2", "Q3" o "Q4") y un razonamiento corto (~1 frase). Output JSON-only siguiendo el schema del system prompt. Todos los movs del inventario tienen que tener una fase asignada.

RECORDATORIO CRÍTICO: para movs con \`dueno_es_vacante: true\`, comparar \`dueno_semanas_cobertura\` con las semanas restantes por fase del "Contexto temporal". Si la cobertura excede lo restante en Q2, NO lo asignes a Q2 — empujalo a Q3 o más adelante según corresponda.`
}
