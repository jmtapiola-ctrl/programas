// Helper compartido por los prompt builders del Paso 3 (inventario, borrador,
// curado, validador) cuando el plan es Jr. Aporta el CONTEXTO HEREDADO del Sr
// como material SUPLEMENTARIO (narrativa del propósito heredado + criterios +
// baseline de movs que el Sr estimó). NO reemplaza al propósito estructurado:
// el Jr define sus propias métricas en el Paso 1 (proposito.metricas), y el
// builder las muestra aparte; cada movimiento del inventario debe atacar esas
// métricas vía brechas_atacadas (mismo mecanismo que el Sr).
//
// Decisión de diseño (Fase 6): inventario FRESCO — los movs heredados son
// REFERENCIA/baseline, no el inventario del Jr. El cap (contraste) avisa al
// cerrar el Paso 3 si el plan del Jr se queda corto respecto de lo heredado.

import type { PlanEstrategico } from './types'
import { contextoCuradoToMarkdown } from './types'

export function buildJrContextoHeredadoMd(plan: PlanEstrategico): string {
  const cc = contextoCuradoToMarkdown(plan.contexto_curado)
  const movs = plan.movs_heredados_snapshot ?? []
  const movsMd = movs.length > 0 ? `
## Baseline del Sr — movimientos que el Sr estimó para este plan (REFERENCIA, NO copiar)

El Sr estimó ${movs.length} movimientos para este plan. NO son tu inventario —
vos armás uno fresco. Son la referencia de alcance/costo/duración que esperaba el
Sr. Usalos para calibrar y para detectar si tu plan se queda corto (cap).
${movs.map(m => `- ${m.id} "${m.nombre}" [${m.categoria}] · esfuerzo ${m.costo_banda_ancha} · USD ${m.costo_monetario?.rango_min_usd ?? '?'}-${m.costo_monetario?.rango_max_usd ?? '?'} · ${m.duracion_meses_ejecucion ?? '?'}m · criterio: ${(m.criterio_exito ?? '').slice(0, 140)}`).join('\n')}
` : ''

  return `
## Contexto heredado del Plan Sr (propósito/criterios del plan — DADO, no se redefine)

Este es un Plan Jr. La narrativa del propósito y los criterios de éxito YA están
definidos por el plan superior. Tu inventario tiene que existir para ENTREGAR las
MÉTRICAS del plan (que figuran arriba en el bloque "Propósito") — esas métricas
son la operacionalización de estos criterios heredados:

${cc || '(contexto curado no disponible)'}
${movsMd}`
}
