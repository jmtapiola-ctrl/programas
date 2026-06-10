// System prompt + user message para el generador de Planes Jr (Wizard
// Creación de Jr, Fase 2 del sistema Sr→Jr).
//
// Llamada desde POST /api/planes-estrategicos/[id]/sugerir-lineas-jr con
// Claude Opus 4.7 + JSON output. Latencia esperada 60-90s.
//
// Input: PlanEstrategico Sr cerrado (paso_actual >= 4). El prompt accede a:
//   - propósito (escena, métricas)
//   - situación (desvío principal, causa raíz)
//   - inventario de movimientos del Paso 3.A
//   - plan curado del Paso 3.E (versión activa)
//
// Output JSON con shape:
// {
//   "lineas": [
//     {
//       "nombre": "Demanda",
//       "descripcion": "Generación, captación y conversión de leads...",
//       "movimientos_ids": ["M-3", "M-7", "M-11", ...]
//     },
//     ...
//   ]
// }
//
// El endpoint completa los campos restantes (id local, dueno_jr_email vacío,
// estado='borrador') antes de devolver al frontend.

import type { PlanEstrategico, MovimientoPE } from './types'
import { getCuradoActivo } from './types'

export function buildSugerirLineasSystemPrompt(): string {
  return `Sos un consultor estratégico senior. Tu tarea: agrupar los movimientos del Plan Estratégico Sr en PLANES JR TEMÁTICOS. Un Plan Jr es un conjunto de 1+ movimientos del Sr asignados a un dueño formal distinto para cumplir parte de los objetivos del Sr.

El agrupamiento tiene que ser COHERENTE — un dueño tiene que poder ejecutar todos los movimientos de su Plan Jr sin depender de coordinación constante con otros Planes Jr.

REGLAS DURAS:

1. **Output JSON-only.** NO conversación, NO markdown, NO comentarios. Solo el JSON entre el primer "{" y el último "}". El sistema parsea strict.

2. **Cobertura 100%.** Cada movimiento activo del inventario debe estar asignado a EXACTAMENTE UN Plan Jr. Verificá antes de emitir: \`union(todas las movimientos_ids) === todos los movs activos del inventario\` y \`intersect entre Planes Jr === vacío\`.

3. **Cantidad de Planes Jr**: mínimo 3, máximo 8. Apuntá al rango 4-6 para planes de tamaño típico (20-40 movs). Si tenés menos movs (<15), 3 Planes Jr. Si tenés más de 40, hasta 8.

4. **Criterios de agrupamiento, en orden de prioridad**:
   - **(a) Afinidad temática** (PRINCIPAL): movimientos del mismo dominio funcional van juntos. Ej: todos los movs comerciales (PR, marketing, ventas) en un Plan Jr; todos los productivos (tierras, anteproyectos, obras) en otro; todos los de personas/RRHH en otro; todos los financieros (fondeo, securitización) en otro.
   - **(b) Apalancamiento entre movimientos** (SECUNDARIO): si M-A facilita M-B, conviene que estén en el mismo Plan Jr para que el dueño los ejecute coordinadamente.
   - **(c) Dependencias del grafo** (TERCIARIO): movs con muchas precondiciones/desbloqueos entre sí van juntos. Si dos movs están conectados por edges FS/FF críticos, intentá agruparlos.
   - **Restricción anti-fragmentación**: NO crees Planes Jr de 1 movimiento (excepto si es realmente aislado). Si un movimiento tiene mejor encaje con un Plan Jr grande, ponelo ahí.

5. **Nombres de los Planes Jr**: cortos (1-3 palabras), descriptivos del dominio. Ejemplos buenos: "Demanda", "Oferta", "Personas", "Fondos", "Producto", "Marca". Ejemplos malos: "Plan 1", "Genérico", "General". Si el plan tiene un dominio muy específico (ej: real estate), nombres pueden ser más específicos ("Tierras y obras", "Comercial").

6. **Descripciones**: 1-2 frases. Qué cubre el Plan Jr operativamente + cómo se distingue de los otros. NO repetir el nombre. Ejemplo bueno: "Generación, captación y conversión de leads. Incluye PR, marketing paid, blitz Q3, y los modelos de conversión PAI/POZO. Su output alimenta al Plan Jr Oferta vía leads cualificados."

7. **Schema del output**:

\`\`\`json
{
  "lineas": [
    {
      "nombre": "<string corto>",
      "descripcion": "<string 1-2 frases>",
      "movimientos_ids": ["M-X", "M-Y", ...]
    }
  ]
}
\`\`\`

8. **Decisiones difíciles que aparecen**:
   - **Movs cross-cutting**: si un mov ataca múltiples temas (ej: "Modelo de financiación" toca finanzas Y producto), elegí el dominio DOMINANTE — donde más se ejecuta operativamente. Si es 50/50, pesa el dueño del movimiento (donde se ejecuta él, ahí va el mov).
   - **Movs estructurales del Sr** (organización, marcas, supuestos exógenos cross-org): agrupalos en un Plan Jr "Organización" o "Estructural" que coordine.
   - **Movs de personas/contratación**: típicamente van todos juntos en un Plan Jr "Personas". Excepto si una contratación es muy específica de un dominio (ej: "Contratar Director de Tierras") — ahí va con el Plan Jr de su dominio.

9. **EVITAR**:
   - Planes Jr demasiado granulares que requieren múltiples dueños para coordinarse (ej: "PR JMT" + "Marketing paid" + "Estudio Studio" separados → mejor 1 Plan Jr "Demanda").
   - Planes Jr demasiado anchos que abarcan dominios no relacionados (ej: "Comercial + Producto + Finanzas todo junto" → fragmentar).
   - Repetir movimientos en múltiples Planes Jr (cobertura debe ser disjunta).
   - Omitir movimientos del inventario activo.

Recordá: SOLO el JSON. Sin texto antes, sin texto después.`
}

export function buildSugerirLineasUserMessage(plan: PlanEstrategico): string {
  const planoP3 = plan.plan
  if (!planoP3) throw new Error('Plan sin Paso 3 — no se pueden sugerir Planes Jr.')

  const inventario = planoP3.inventario
  const movsActivos: MovimientoPE[] = (inventario?.movimientos ?? []).filter(m => m.estado_usuario !== 'quitado')
  if (movsActivos.length === 0) throw new Error('Inventario sin movimientos activos.')

  const curado = getCuradoActivo(plan)

  let msg = `# Plan Estratégico Sr a derivar en Planes Jr

## Propósito (lugar de llegada)
Escena: ${plan.proposito?.escena ?? '(no declarada)'}
Horizonte: ${plan.proposito?.horizonte ?? '(no declarado)'}

## Situación (desvío y causa)
Desvío principal: ${plan.situacion?.desvio_principal ?? '(no declarado)'}
Causa raíz: ${plan.situacion?.causa_raiz ?? '(no declarada)'}

## Inventario activo (${movsActivos.length} movimientos)
${movsActivos.map(m => `  ${m.id} "${m.nombre}" — categoría: ${m.categoria} — dueño: ${m.dueno}${m.dueno_es_vacante ? ' [VACANTE]' : ''} — qué resuelve: ${m.que_resuelve.slice(0, 200)}`).join('\n')}

## Grafo de dependencias (precondiciones/desbloqueos)
${movsActivos.map(m => {
  const precs = (m.precondiciones ?? []).map(id => id).join(', ')
  const desbl = (m.desbloquea ?? []).map(id => id).join(', ')
  if (precs.length === 0 && desbl.length === 0) return `  ${m.id}: (sin dependencias)`
  return `  ${m.id}: ${precs.length > 0 ? `precond [${precs}]` : ''}${precs.length > 0 && desbl.length > 0 ? ' · ' : ''}${desbl.length > 0 ? `desbloquea [${desbl}]` : ''}`
}).join('\n')}
`

  if (curado) {
    msg += `
## Plan Curado (decisiones de priorización del Sr)
${curado.decisiones_priorizacion.slice(0, 5).map((d, i) => `  ${i + 1}. ${d.decision}\n     Razón: ${d.razon.slice(0, 200)}`).join('\n')}

## Secuencia de movimientos por fase (del curado)
${curado.secuencia_movimientos.map(f => `  Fase "${f.fase}" (${f.movimientos.length} movs): ${f.movimientos.map(m => m.id).join(', ')}`).join('\n')}
`
  }

  msg += `
# Tarea

Agrupá los ${movsActivos.length} movimientos activos del inventario en PLANES JR TEMÁTICOS (3-8 planes) siguiendo las reglas del system prompt. Emití el JSON estricto con \`lineas[]\`.`

  return msg
}
