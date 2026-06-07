// Expande los códigos de movimiento (M-1, M-9, …) que el reviewer cita en el
// texto de sus hallazgos, agregándoles el nombre del movimiento entre paréntesis.
// "M-9 debe protegerse" → "M-9 (Transición de Spazios a multi-empresas) debe protegerse".
//
// El reviewer y el resumen serializado refieren los movimientos por código, lo
// cual es ilegible para el usuario que no recuerda de memoria qué es cada M-N.
// Esta expansión es puramente de presentación (no muta el reporte persistido) y
// se aplica en render sobre los campos de texto de las cards de auditoría.
//
// Lógica pura → testeable sin red (diagnostico/scripts/97-expandir-codigos-unit.ts).

// Construye el mapa id→nombre desde el inventario. Tolera nombres vacíos
// (se omiten del mapa para no producir "M-9 ()").
export function buildMovNombres(
  movimientos: { id: string; nombre?: string }[] | undefined,
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const m of movimientos ?? []) {
    const nombre = m.nombre?.trim()
    if (m.id && nombre) map[m.id] = nombre
  }
  return map
}

// Reemplaza cada "M-N" suelto por "M-N (Nombre)". No expande si:
//   - el código no está en el mapa (mov desconocido / sin nombre),
//   - ya viene seguido de "(" (evita doble expansión si el texto ya trae el nombre).
export function expandirCodigosMov(
  texto: string,
  nombres: Record<string, string>,
): string {
  if (!texto || Object.keys(nombres).length === 0) return texto
  // \bM-(\d+)\b → código de movimiento anclado a límite de palabra.
  // (?!\s*\() → negative lookahead: no tocar si ya está seguido de un paréntesis.
  return texto.replace(/\bM-(\d+)\b(?!\s*\()/g, (match, n) => {
    const nombre = nombres[`M-${n}`]
    return nombre ? `${match} (${nombre})` : match
  })
}
