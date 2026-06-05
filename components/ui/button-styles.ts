// Estilos de botón unificados del wizard PE (decidido 2026-06).
//
// Problema que resuelven: las acciones que avanzan el flujo desde el chat usaban
// un estilo "fantasma" (border + fondo transparente, 13px) que no parecía botón,
// mientras los modales gritaban en bg-primary con tamaños inconsistentes. Estas
// constantes centralizan DOS niveles de jerarquía + dos semánticos, con tipografía
// más grande y aspecto claramente clickeable.
//
// Uso: <button className={BTN_CTA}>Continuar →</button>
//      <button className={`${BTN_SECONDARY} w-full`}>Cancelar</button>
// Se puede concatenar con clases extra (w-full, ml-auto, etc.).
//
// Niveles:
//   - BTN_CTA       → acción principal / avanzar el flujo. Llamativo, invita a clickear.
//   - BTN_SECONDARY → cancelar / volver / regenerar. Claramente botón, pero más tranquilo.
//   - BTN_APPROVE   → confirmaciones positivas ("Aprobar", "Aceptar y avanzar"). Verde.
//   - BTN_DANGER    → acciones destructivas ("Eliminar"). Rojo.

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-bold whitespace-nowrap ' +
  'transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background'

// Forma/tamaño del CTA SIN color — para botones que llevan su propio color
// semántico (ej. PlanCard: lila Crear Jr, verde Ver plan, ámbar Desplegar).
// Uso: <Link className={`${BTN_CTA_SHAPE} bg-purple-700 text-purple-50 hover:bg-purple-600`}>
export const BTN_CTA_SHAPE =
  `${BASE} px-5 py-2.5 text-[15px] shadow-md hover:shadow-lg active:shadow-sm focus-visible:ring-ring`

// Acción principal — el botón llamativo que invita a clickear (color primario).
export const BTN_CTA =
  `${BASE} px-5 py-2.5 text-[15px] shadow-md hover:shadow-lg active:shadow-sm ` +
  'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary ' +
  'disabled:hover:bg-primary disabled:hover:shadow-md'

// Secundario — cancelar / volver / regenerar. Relleno sutil (no fantasma) + borde.
export const BTN_SECONDARY =
  `${BASE} border border-sidebar-border bg-secondary px-4 py-2 text-[14px] font-semibold text-secondary-foreground ` +
  'hover:bg-accent hover:text-foreground focus-visible:ring-sidebar-border'

// Confirmación positiva (verde).
export const BTN_APPROVE =
  `${BASE} bg-emerald-600 px-5 py-2.5 text-[15px] text-emerald-50 shadow-md ` +
  'hover:bg-emerald-500 hover:shadow-lg active:shadow-sm focus-visible:ring-emerald-500'

// Acción destructiva (rojo).
export const BTN_DANGER =
  `${BASE} bg-red-700 px-4 py-2 text-[14px] text-red-50 ` +
  'hover:bg-red-600 focus-visible:ring-red-500'

// Variante CTA un poco más compacta para barras con varios botones o headers.
export const BTN_CTA_SM =
  `${BASE} bg-primary px-3.5 py-1.5 text-[13px] text-primary-foreground shadow-sm ` +
  'hover:bg-primary/90 hover:shadow-md focus-visible:ring-primary'

// Variante secundaria compacta (headers, toolbars).
export const BTN_SECONDARY_SM =
  `${BASE} border border-sidebar-border bg-secondary px-3 py-1.5 text-[13px] font-semibold text-secondary-foreground ` +
  'hover:bg-accent hover:text-foreground focus-visible:ring-sidebar-border'
