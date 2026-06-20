// Validador de invariantes determinístico del wizard PE (Fase B del blindaje).
//
// Corre tras el merge de cada turno y RECONCILIA el estado para que nunca quede
// inconsistente. Es la extensión natural de los merge-protectors (mergePasoActual,
// mergeSubBloque): esos protegen cada campo por separado (monotónicos), pero NO
// garantizan que `paso_actual` y `sub_bloque_actual` sean coherentes ENTRE SÍ.
//
// Bug real que motiva esto (Lab 10x): el latch de cierre dejó `paso_actual=3` pero
// `sub_bloque_actual='2.G'` → el botón mostraba "Cerrar Paso 3" estando en contenido
// de Paso 2. Cada campo era "válido" por sí solo; la inconsistencia era cruzada.

// Paso implícito de un sub_bloque. -1 si es desconocido.
export function pasoDeSubBloque(sub: string): number {
  if (sub === '0') return 0
  if (sub === 'completado') return 4
  if (sub.startsWith('1.')) return 1
  if (sub.startsWith('2.')) return 2
  if (sub === '3.0' || sub.startsWith('3.')) return 3
  return -1
}

// Primer sub_bloque canónico de cada paso (para subir el sub_bloque cuando el paso lidera).
const PRIMER_SUB_BLOQUE: Record<number, string> = {
  0: '0',
  1: '1.A',
  2: '2.A',
  3: '3.0',
  4: 'completado',
}

export interface ReconcileResult {
  paso_actual: number
  sub_bloque_actual: string
  corregido: boolean
  nota?: string
}

// Reconcilia paso_actual ↔ sub_bloque_actual SIN regresar ninguno (monotónico):
// si uno "lidera" al otro (desincronización), sube el rezagado para que sean
// consistentes. Nunca baja un campo (respeta la monotonía del wizard).
//
//   - paso lidera (ej. paso=3, sub='2.G'): el sub_bloque nunca entró al paso 3 →
//     se sube al PRIMER sub_bloque del paso (3.0). No se pierde progreso intra-paso
//     porque sub_bloque es monotónico: si hubieran avanzado a 3.C, sub_bloque sería 3.C.
//   - sub_bloque lidera (ej. paso=2, sub='3.B'): se sube el paso a 3.
//   - sub_bloque desconocido (typo): no se toca (defensivo).
export function reconcilePasoSubBloque(paso: number, sub: string): ReconcileResult {
  const pasoImplicito = pasoDeSubBloque(sub)
  if (pasoImplicito === -1) {
    return { paso_actual: paso, sub_bloque_actual: sub, corregido: false }
  }
  if (paso === pasoImplicito) {
    return { paso_actual: paso, sub_bloque_actual: sub, corregido: false }
  }
  if (paso > pasoImplicito) {
    const nuevoSub = PRIMER_SUB_BLOQUE[paso] ?? sub
    return {
      paso_actual: paso,
      sub_bloque_actual: nuevoSub,
      corregido: true,
      nota: `paso=${paso} lideraba a sub_bloque='${sub}' (paso ${pasoImplicito}) → sub_bloque='${nuevoSub}'`,
    }
  }
  // sub_bloque lidera
  return {
    paso_actual: pasoImplicito,
    sub_bloque_actual: sub,
    corregido: true,
    nota: `sub_bloque='${sub}' (paso ${pasoImplicito}) lideraba a paso=${paso} → paso=${pasoImplicito}`,
  }
}
