// Normalización / hidratación del PlanCuradoVersionado para persistencia.
//
// Problema: cada PlanCuradoPE persiste objetos MovimientoPE COMPLETOS dentro
// de secuencia_movimientos[].movimientos[] y objetos SupuestoExogenoPE COMPLETOS
// dentro de supuestos_criticos[]. Esos objetos YA viven en plan.inventario y
// plan.preparativos.supuestos_exogenos. Con N versiones del curado, cada
// MovimientoPE (~2-3k chars) se duplica N veces — saturando el field
// "Plan Curado JSON" en Airtable (~75k chars con 1 versión, >150k con 2).
//
// Solución: persistir solo IDs (movs) y descripciones (supuestos). Al cargar,
// hidratar usando el inventario + preparativos del mismo plan.
//
// Backward-compat: shape viejo (objetos completos embebidos) se detecta y
// pasa como está al leer; la próxima escritura lo deja en shape normalizado.

import type {
  PlanCuradoPE,
  PlanCuradoVersionado,
  MovimientoPE,
  SupuestoExogenoPE,
  InventarioPE,
  PreparativosPE,
} from './types'

// Shape que va a Airtable. Solo IDs y descripciones para movs/supuestos.
// El resto del PlanCuradoPE persiste igual.
interface PlanCuradoPEPersisted {
  contexto: string
  decisiones_priorizacion: { decision: string; razon: string }[]
  secuencia_movimientos: { fase: string; movimientos_ids: string[]; razon_secuencia: string }[]
  supuestos_criticos_descripciones: string[]
  criterio_exito: { pleno: string; minimo: string; path_minimo: string }
  alternativas_descartadas: { decision: string; razon: string }[]
  cerrado_en: string
}

interface PlanCuradoVersionadoPersisted {
  versiones: PlanCuradoPEPersisted[]
  version_activa: number
}

// Detección de shape: si la primera versión tiene movimientos_ids[] en la
// primera fase, está en shape normalizado. Si tiene movimientos[] (array de
// objetos), está en shape viejo.
function esShapeNormalizado(curado: any): boolean {
  const v0 = curado?.versiones?.[0]
  const f0 = v0?.secuencia_movimientos?.[0]
  if (!f0) return true  // vacío — asumir shape nuevo
  return Array.isArray(f0.movimientos_ids)
}

// Convierte el shape rico (con objetos completos) al shape persistible (solo IDs).
// Si el curado ya viene en shape persistible, lo retorna como está.
export function denormalizarCurado(
  versionado: PlanCuradoVersionado | undefined,
  _inventario: InventarioPE | undefined,
): PlanCuradoVersionadoPersisted | undefined {
  if (!versionado || !versionado.versiones || versionado.versiones.length === 0) return versionado as any
  const versionesNorm = versionado.versiones.map(v => {
    const vAny = v as any
    return {
      contexto: v.contexto,
      decisiones_priorizacion: v.decisiones_priorizacion,
      secuencia_movimientos: v.secuencia_movimientos.map(f => {
        const fAny = f as any
        // Si ya viene normalizada (movimientos_ids), respetar. Si viene rica
        // (movimientos[] objetos), extraer IDs.
        const movimientos_ids = Array.isArray(fAny.movimientos_ids)
          ? fAny.movimientos_ids
          : (f.movimientos ?? []).map(m => m.id)
        return {
          fase: f.fase,
          movimientos_ids,
          razon_secuencia: f.razon_secuencia,
        }
      }),
      supuestos_criticos_descripciones: Array.isArray(vAny.supuestos_criticos_descripciones)
        ? vAny.supuestos_criticos_descripciones
        : (v.supuestos_criticos ?? []).map(s => s.descripcion),
      criterio_exito: v.criterio_exito,
      alternativas_descartadas: v.alternativas_descartadas,
      cerrado_en: v.cerrado_en,
    }
  })
  return {
    versiones: versionesNorm,
    version_activa: versionado.version_activa,
  }
}

// Convierte el shape persistido (solo IDs/descripciones) al shape rico (objetos
// completos), haciendo lookup contra el inventario + supuestos del mismo plan.
//
// Backward-compat: si el curado ya viene con shape rico (legacy, antes del
// split de normalización), lo retorna como está sin tocar.
//
// Huérfanos: si un ID de mov o una descripción de supuesto no existe en el
// inventario/preparativos actual (porque el user editó después de curar), se
// filtra silenciosamente. Coherente con el endpoint /generar.
export function hidratarCurado(
  curado: any,
  inventario: InventarioPE | undefined,
  preparativos: PreparativosPE | undefined,
): PlanCuradoVersionado | undefined {
  if (!curado || !curado.versiones || curado.versiones.length === 0) return curado
  if (!esShapeNormalizado(curado)) return curado  // shape viejo — pasar como está

  const movsById = new Map<string, MovimientoPE>()
  for (const m of inventario?.movimientos ?? []) movsById.set(m.id, m)
  const supuestosByDesc = new Map<string, SupuestoExogenoPE>()
  for (const s of preparativos?.supuestos_exogenos ?? []) supuestosByDesc.set(s.descripcion, s)

  const versionesHidratadas: PlanCuradoPE[] = curado.versiones.map((v: PlanCuradoPEPersisted) => ({
    contexto: v.contexto,
    decisiones_priorizacion: v.decisiones_priorizacion ?? [],
    secuencia_movimientos: (v.secuencia_movimientos ?? []).map(f => ({
      fase: f.fase,
      movimientos: (f.movimientos_ids ?? [])
        .map(id => movsById.get(id))
        .filter((m): m is MovimientoPE => m !== undefined),
      razon_secuencia: f.razon_secuencia,
    })),
    supuestos_criticos: (v.supuestos_criticos_descripciones ?? [])
      .map(desc => supuestosByDesc.get(desc))
      .filter((s): s is SupuestoExogenoPE => s !== undefined),
    criterio_exito: v.criterio_exito,
    alternativas_descartadas: v.alternativas_descartadas ?? [],
    cerrado_en: v.cerrado_en,
  }))

  return {
    versiones: versionesHidratadas,
    version_activa: curado.version_activa ?? 0,
  }
}
