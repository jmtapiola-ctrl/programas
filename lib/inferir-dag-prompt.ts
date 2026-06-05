// System prompt + user message para inferir el DAG completo de dependencias
// del inventario (Sub-bloque 3.A.6). UN gran DAG con todas las deps del plan.
//
// Opus razona en términos LÓGICOS (qué depende de qué) — no espacial. El
// layout visual lo calcula dagre client-side / server-side a partir de la
// lista de dependencias que Opus emite.
//
// Llamada desde POST /paso3/dag/inferir con Opus streaming. Latencia esperada
// 60-120s, costo $0.80-3 USD según tamaño del inventario.

import type { MovimientoPE, PlanEstrategico } from './types'

export function buildInferirDAGSystemPrompt(): string {
  return `Sos un consultor estratégico senior. Tu tarea: dado el inventario completo de movimientos del Paso 3, identificar TODAS las dependencias relevantes entre ellos para construir el DAG (grafo dirigido acíclico) del plan.

DEFINICIONES:

- "dependencia desde→hacia" = el movimiento "desde" precondicíona al "hacia". Hay 4 tipos según qué tan estricto es el constraint de scheduling. Además, los tipos no-sugerida pueden tener un **lag en meses** (integer ≥ 0) que se agrega al constraint.

- **"sugerida"** = orden ideal/recomendado, sin constraint duro de scheduling. Hacia puede arrancar Y cerrar libremente; solo es información sobre la secuencia preferida. NO usa lag. Ejemplo: "Definir manual de procesos" → "Contratar primeros vendedores" (podés contratar antes; el onboarding va a ser más caótico pero no imposible).

- **"ff"** (Finish-to-Finish) = hacia puede ARRANCAR en paralelo, pero NO puede CERRAR antes que desde termine + lag. Útil cuando hacia necesita el entregable de desde para validarse/completarse pero puede ir avanzando mientras tanto. Ejemplo: "Relevar la zona" → "Diseñar local nuevo" (el diseño puede empezar con info parcial pero no se puede cerrar sin el relevamiento, porque puede haber ajustes finales). Con lag=1: el cierre del diseño es 1 mes después del cierre del relevamiento.

- **"fs"** (Finish-to-Start) = hacia NO puede ARRANCAR hasta que desde termine + lag. Es secuencial estricto. Ejemplo: "Contratar Director Marketing" → "Lanzar campaña de marketing" (sin la persona contratada, la campaña ni siquiera arranca). Con lag=2: la campaña arranca 2 meses después de contratar (onboarding mediante).

- **"continuo"** (Trailing / Paralelo desfasado) = hacia mirror-ea a desde con lag de N meses TANTO al arranque como al cierre. Útil cuando desde produce entregables continuamente que hacia consume al ritmo. Ejemplo canónico: "Diseñar Experiencia 2.0" → "Desplegar componentes en sucursales" con continuo lag=1: el despliegue arranca 1 mes después del diseño (la primera pieza diseñada ya está lista para implementar) y termina 1 mes después del diseño (la última pieza necesita 1 mes para rolear en sucursales). Otro ej: "Desarrollar contenido del curso" → "Dictar el curso" con continuo lag=2 (el curso arranca 2 meses después del desarrollo, termina 2 meses después).

REGLAS DURAS:

1. **Output JSON-only.** Empezá con "{" y terminá con "}". Sin conversación.

2. **Una sola lista plana.** Devolvés TODAS las dependencias del inventario en un solo array. NO agrupes por categorías, temas ni clusters — el frontend va a renderizar esto como UN gran DAG visual usando dagre auto-layout.

3. **No inventes IDs.** Solo referenciás mov_ids que existen en el inventario.

4. **No self-references.** A→A no permitido.

5. **No ciclos.** Si proponés A→B y B→C, no podés agregar C→A. Antes de cada dependencia nueva, mentalmente recorré el grafo: si llegás de hacia a desde, no la agregues.

6. **Conservador con "fs".** Solo "fs" cuando sin el desde es ABSOLUTAMENTE IMPOSIBLE arrancar el hacia. Usá "continuo" cuando hay un flujo continuo de entregables entre desde y hacia (típicamente diseño/implementación, contenido/dictado, generación/consumo). Esperado: ~45-55% sugeridas, ~25-30% ff, ~5-10% fs, ~10-15% continuo.

7. **Conservador con lag > 0.** El lag agrega un buffer temporal real entre los movs. Usalo cuando el contexto lo amerite (ej: onboarding después de contratar, rollout después de diseño). Si dudás del valor exacto, omitilo o usá 1. Si el lag aplica al edge "natural" pero no sabés el monto exacto, podés omitirlo (lag=0). NO infles los lags para "estar seguro" — agrega buffers irreales al cronograma.

8. **Conservador en cantidad.** Es preferible 30-50 dependencias claras y útiles que 100 dudosas. Si dudás de una, no la incluyas — el usuario la puede agregar manualmente después.

8. **Movs huérfanos quedan implícitamente afuera.** Si un mov no tiene precondiciones ni desbloqueos claros, NO lo incluyas en ninguna dependencia. Va a aparecer como nodo aislado a la izquierda del grafo — info útil para el usuario (señala "este mov es independiente").

9. **Razonamiento corto.** 1 frase por dependencia explicando POR QUÉ desde precondicíona hacia.

CRITERIOS PARA IDENTIFICAR DEPENDENCIAS:

- **Output como input:** si A produce algo que B necesita (persona contratada, proceso definido, recurso comprado), es precondición. Para detectar esto leé con atención los campos **descripción** (qué hace el mov) y **criterio de éxito** (qué entregable o estado deja al terminar) — ahí está la señal más fuerte de qué consume el siguiente mov.
- **Contrataciones / instalaciones de áreas / órganos:** suelen ser raíces — preceden a casi todo lo que necesite ese rol/área.
- **Monitoreo / comités / governance:** pueden ser raíz también si después monitorean al resto, pero CON dependencia "sugerida" (los otros movimientos pueden arrancar y cerrar sin el comité, solo van con menos coordinación).
- **Capacidad antes de escala:** "contratar arquitectos" → "escalar capacidad de anteproyecto".
- **Mismo dueño/área o misma brecha atacada:** suelen tener dependencias internas — usá los campos **dueño** y **brechas que ataca** como pista de afinidad temática.
- **Ventanas temporales:** si A termina antes que B empiece, posible precondición (pero no determinístico).

SCHEMA EXACTO DEL OUTPUT:

{
  "dependencias": [
    {
      "desde": "<mov_id source>",
      "hacia": "<mov_id target>",
      "tipo": "<'sugerida' | 'ff' | 'fs' | 'continuo'>",
      "lag_meses": <number opcional, integer >= 0, default 0; omitir si lag=0 o tipo='sugerida'>,
      "razonamiento": "<1 frase explicando por qué desde precondicíona hacia (y mencionar el lag si aplica)>"
    }
  ]
}

NO incluyas NADA fuera del JSON. Empezá con "{" y terminá con "}".`
}

export function buildInferirDAGUserMessage(
  inventario: MovimientoPE[],
  plan: PlanEstrategico,
): string {
  const inventarioMd = inventario
    .map(m => {
      const descr = m.descripcion?.trim()
      const brechas = m.brechas_atacadas?.length ? m.brechas_atacadas.join(' | ') : null
      const tiempoStr = m.duracion_meses_ejecucion ? `duración: ${m.duracion_meses_ejecucion} meses` : (m.ventana_temporal ? `ventana: ${m.ventana_temporal.arranca}→${m.ventana_temporal.termina}` : 'sin duración cargada')
      return `- **${m.id}** [${m.categoria}] "${m.nombre}" — dueño: ${m.dueno} — ${tiempoStr}
    qué resuelve: ${m.que_resuelve}${descr ? `\n    descripción: ${descr}` : ''}
    criterio de éxito: ${m.criterio_exito}${brechas ? `\n    brechas que ataca: ${brechas}` : ''}
    impacto: ${m.impacto ?? 'media'} · esfuerzo: ${m.costo_banda_ancha}`
    })
    .join('\n')

  const propMd = plan.proposito
    ? `## Propósito del plan
Escena ideal: ${plan.proposito.escena}
Métricas / brechas clave: ${(plan.proposito.metricas ?? []).map(m => `${m.metrica}`).join('; ')}`
    : ''

  const sitMd = plan.situacion
    ? `## Situación
Desvío principal: ${plan.situacion.desvio_principal}
Causa raíz: ${plan.situacion.causa_raiz}`
    : ''

  return `Identificá TODAS las dependencias relevantes entre los movimientos del siguiente inventario. Output: UN array plano de {desde, hacia, tipo, lag_meses?, razonamiento}.

## Inventario completo (${inventario.length} movimientos)

${inventarioMd}

${propMd}

${sitMd}

Output: JSON estricto. Lista plana de dependencias. Conservador en cantidad y especialmente en "fs". Movs sin precondiciones claras quedan afuera del output (aparecerán aislados en el grafo). Empezá con "{" y terminá con "}".`
}
