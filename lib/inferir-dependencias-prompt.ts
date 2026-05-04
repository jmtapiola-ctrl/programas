// System prompt + user message para inferir dependencias de un movimiento
// nuevo agregado por el usuario (Bug 2 del checkpoint Fase C — el usuario
// no tiene contexto del resto del inventario para definir precondiciones/
// desbloquea).
//
// Llamada desde POST /paso3/inventario/inferir-dependencias con Opus
// streaming (mismo patrón que /generar). Latencia esperada 10-20s, costo
// $0.05-0.10. Output JSON-only con propuesta de dependencias.
//
// El usuario después confirma/rechaza desde un modal con checkboxes —
// nada se aplica automáticamente al inventario.

import type { MovimientoPE, PlanEstrategico } from './types'

export function buildInferirDependenciasSystemPrompt(): string {
  return `Sos un consultor estratégico senior. Tu tarea: dado un movimiento nuevo agregado por el usuario al inventario del Paso 3, identificar sus DEPENDENCIAS naturales con el resto del inventario.

DEFINICIONES:

- "precondiciones" del movimiento nuevo = lista de IDs de movimientos del inventario que DEBEN o CONVIENE estar terminados ANTES de empezar el movimiento nuevo.
- "desbloquea" del movimiento nuevo = lista de IDs de movimientos del inventario que se vuelven posibles, fáciles, o más efectivos UNA VEZ que el movimiento nuevo termina.
- "tipo_dependencia" del movimiento nuevo respecto a sus precondiciones:
  - "dura": las precondiciones DEBEN estar terminadas antes (sino el movimiento nuevo no puede arrancar).
  - "blanda": las precondiciones FACILITAN el movimiento nuevo, pero éste puede arrancar sin ellas (con más fricción).
  - "ninguna": no hay precondiciones identificables (el movimiento nuevo es independiente).

REGLAS DURAS:

1. **Output JSON-only.** NO conversación, NO explicaciones fuera del JSON. Solo el objeto entre primer "{" y último "}". El sistema parsea strict.

2. **No inventes IDs.** Solo podés referenciar IDs que existan en el inventario que te paso. Si dudás si un movimiento es precondición real, NO lo incluyas.

3. **Conservador es mejor.** Es preferible proponer 1-3 dependencias claras que 5-10 dudosas. El usuario va a confirmar cada una con checkbox; si proponés muchas dudosas, la confianza del usuario en la propuesta cae.

4. **Excluir el propio movimiento.** Nunca incluir el ID del movimiento nuevo en sus propias precondiciones o desbloquea.

5. **Razonamiento corto.** El campo "razonamiento" es para que el usuario entienda POR QUÉ proponés esas dependencias. 1-3 oraciones máximo.

CRITERIOS PARA IDENTIFICAR DEPENDENCIAS:

- Recursos compartidos: si dos movimientos usan el mismo dueño/área, suele haber secuenciamiento práctico.
- Outputs como inputs: si A produce algo que B necesita (ej: "contratar QA Lead" → desbloquea "diseñar protocolo de QA"), eso es precondición dura.
- Precondiciones fuertes vs blandas: contrataciones suelen ser dura (no podés arrancar sin la persona); definición de procesos suele ser blanda (podés arrancar pero con más fricción).
- Categorías relacionadas: movimientos en la misma categoría suelen tener más dependencias entre sí.
- Ventanas temporales: si la ventana de A termina antes que la de B arranque, A puede ser precondición de B.

SCHEMA EXACTO DEL OUTPUT:

{
  "precondiciones": ["<id>", ...],
  "desbloquea": ["<id>", ...],
  "tipo_dependencia": "<'dura' | 'blanda' | 'ninguna'>",
  "razonamiento": "<1-3 oraciones explicando por qué proponés esas dependencias>"
}

NO incluyas NADA fuera del JSON. Empezá con "{" y terminá con "}".

CASOS BORDE:

- Si el inventario es muy chico (<3 movimientos), probable que no haya dependencias claras — devolvé arrays vacíos y tipo_dependencia="ninguna" con razonamiento explicando.
- Si el movimiento nuevo es claramente independiente (ej: una contratación específica que no afecta a otros), arrays vacíos y "ninguna".
- Si dudás entre dura y blanda, elegí blanda — el usuario puede ajustar después.`
}

export function buildInferirDependenciasUserMessage(
  movimientoNuevo: MovimientoPE,
  inventarioCompleto: MovimientoPE[],
  plan: PlanEstrategico,
): string {
  // El movimiento nuevo ya está persistido en el inventario, lo excluimos del
  // listado para que el modelo no lo considere en sus propias dependencias.
  const otros = inventarioCompleto.filter(m => m.id !== movimientoNuevo.id)

  // Renderizado compacto del inventario — incluye lo necesario para inferir
  // dependencias sin saturar el contexto.
  const inventarioMd = otros
    .map(m => `- **${m.id}** [${m.categoria}] "${m.nombre}" — dueño: ${m.dueno} — ventana: ${m.ventana_temporal.arranca}→${m.ventana_temporal.termina}
    qué resuelve: ${m.que_resuelve}`)
    .join('\n')

  const propMd = plan.proposito
    ? `## Propósito del plan
Escena ideal: ${plan.proposito.escena}
Métricas clave: ${(plan.proposito.metricas ?? []).map(m => `${m.metrica}: ${m.valor_objetivo}`).join('; ')}`
    : ''

  return `Inferí las dependencias del siguiente movimiento NUEVO con respecto al inventario existente del Paso 3.

## Movimiento nuevo (recién agregado por el usuario)

- **${movimientoNuevo.id}** [${movimientoNuevo.categoria}] "${movimientoNuevo.nombre}"
- Dueño: ${movimientoNuevo.dueno}
- Ventana: ${movimientoNuevo.ventana_temporal.arranca} → ${movimientoNuevo.ventana_temporal.termina}
- Qué resuelve: ${movimientoNuevo.que_resuelve}
- Ataca desvío: ${movimientoNuevo.ataca_desvio}
- Criterio de éxito: ${movimientoNuevo.criterio_exito}
- Costo banda ancha: ${movimientoNuevo.costo_banda_ancha}

## Inventario existente (${otros.length} movimientos, excluye el nuevo)

${inventarioMd}

${propMd}

Output: JSON estricto según schema del system prompt. Sin texto fuera del JSON. Conservador es mejor — solo dependencias claras. Empezá con "{" y terminá con "}".`
}
