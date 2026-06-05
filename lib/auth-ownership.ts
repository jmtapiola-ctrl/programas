// Helper compartido para validar ownership/acceso a un Plan Estratégico desde
// endpoints API. Sistema Sr→Jr define las siguientes reglas:
//
//   - Roles legacy con acceso global (Ejecutivo, Program Manager, Admin):
//     pueden leer/editar CUALQUIER plan.
//   - Plan Sr: puede acceder a sus Sr propios (donde es responsable) + a los
//     Jr derivados de esos Sr.
//   - Plan Jr: puede acceder SOLO a su Jr propio (match por email contra
//     dueno_jr_email).
//   - Operador (legacy): solo planes donde es responsable.
//
// El helper devuelve { allowed: true } o { allowed: false, status, error }.
// El caller decide cómo responder (típicamente NextResponse.json).

import { getPlanEstrategico } from './airtable'
import type { PlanEstrategico } from './types'

interface SessionUser {
  id: string
  email?: string | null
  role?: string
}

export interface OwnershipCheckResult {
  allowed: boolean
  status?: number
  error?: string
  plan?: PlanEstrategico  // si allowed, retorna el plan cargado (para evitar re-fetch)
}

const ROLES_ACCESO_GLOBAL = new Set(['Ejecutivo', 'Program Manager', 'Admin'])

export async function checkPlanAccess(
  user: SessionUser,
  planId: string,
): Promise<OwnershipCheckResult> {
  const plan = await getPlanEstrategico(planId).catch(() => null)
  if (!plan) return { allowed: false, status: 404, error: 'Plan no encontrado.' }

  // Acceso global.
  if (user.role && ROLES_ACCESO_GLOBAL.has(user.role)) {
    return { allowed: true, plan }
  }

  // Plan Sr: ve sus Sr + Jr derivados.
  if (user.role === 'Plan Sr') {
    if (plan.tipo === 'Sr' && plan.responsable_id === user.id) {
      return { allowed: true, plan }
    }
    if (plan.tipo === 'Jr' && plan.plan_sr_id) {
      // Carga el Sr padre y verifica que sea suyo. Hacer fetch extra es OK
      // porque el caso es raro (Sr accediendo a Jr derivado) y no se cachea
      // estado en este helper a propósito (mantenerlo stateless).
      const planSr = await getPlanEstrategico(plan.plan_sr_id).catch(() => null)
      if (planSr && planSr.responsable_id === user.id) {
        return { allowed: true, plan }
      }
    }
    return { allowed: false, status: 403, error: 'No tenés acceso a este plan.' }
  }

  // Plan Jr: ve solo su Jr propio (match por email).
  if (user.role === 'Plan Jr') {
    if (user.email && plan.tipo === 'Jr' && plan.dueno_jr_email === user.email) {
      return { allowed: true, plan }
    }
    // También puede leer el Sr al que pertenece su Jr (header read-only del
    // listado), pero NO contenido sensible. Acá retornamos allowed=true; el
    // caller decide si filtrar campos sensibles según el rol del user.
    if (user.email && plan.tipo === 'Sr') {
      // Buscar si tiene algún Jr cuyo plan_sr_id apunte a este Sr.
      // (Sin loop adicional acá para mantener el helper liviano. Si esto se
      // vuelve cuello de botella, agregar caché o un endpoint dedicado.)
      // En la versión inicial: permitir read del Sr si user.email coincide
      // con dueno_jr_email de algún Jr derivado. Por simplicidad lo dejamos
      // como denegado en esta capa — el listado server-side lo permite vía
      // getPlanesEstrategicos. Endpoints individuales del Sr son denegados.
      return { allowed: false, status: 403, error: 'No tenés acceso al Plan Sr.' }
    }
    return { allowed: false, status: 403, error: 'No tenés acceso a este plan.' }
  }

  // Operador legacy o rol no reconocido: solo plan donde es responsable.
  if (plan.responsable_id === user.id) return { allowed: true, plan }

  return { allowed: false, status: 403, error: 'No tenés acceso a este plan.' }
}
