import type { SubEstadoPaso } from './types'

export const ESTADOS_AUDITORIA: readonly SubEstadoPaso[] = [
  'esperando_auditoria',
  'auditoria_en_proceso',
  'auditoria_completa',
  'aplicando_cambios',
  'esperando_aprobacion_final',
] as const

export function esEstadoAuditoria(estado: SubEstadoPaso): boolean {
  return ESTADOS_AUDITORIA.includes(estado)
}

export function rutaRecuperacionAuditoria(
  planId: string,
  paso: number,
  estado: SubEstadoPaso,
): string | null {
  if (!esEstadoAuditoria(estado)) return null
  return `/planes-estrategicos/${planId}/cierre/${paso}`
}
