// Pantalla 4 — `/planes-estrategicos/[id]/cierre/[paso]/final`
//
// Vista del Paso DESPUÉS del apply de decisiones de la auditoría. Muestra el
// resumen actualizado con indicadores visuales en los campos modificados
// (borde verde + tooltip "Modificado por auditoría").
//
// Toggle "Solo cambios | Plan completo" — server pasa el flag al cliente para
// que la UI lo controle con state. Default: solo cambios.
//
// Footer client: 3 botones (Aceptar / Comentar / Re-auditar) renderizados por
// PantallaFinalClient.
//
// Validación de estado: requiere sub_estado_paso === 'esperando_aprobacion_final'.
// Otro estado redirige al wizard.

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Source_Serif_4 } from 'next/font/google'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  getUsuario,
  getReviewerTurnos,
} from '@/lib/airtable'
import { computeFieldsModificados } from '@/lib/audit-apply'
import { PantallaFinalClient } from '@/components/audit/PantallaFinalClient'
import '../../../vista/vista.css'

const serif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
})

export const metadata = {
  title: 'Resumen actualizado — Plan Estratégico',
}

export default async function PantallaFinalPage({
  params,
}: {
  params: Promise<{ id: string; paso: string }>
}) {
  const { id, paso: pasoStr } = await params
  const paso = Number.parseInt(pasoStr, 10)
  if (!Number.isInteger(paso) || paso < 1 || paso > 5) notFound()

  const plan = await getPlanEstrategico(id).catch(() => null)
  if (!plan) notFound()

  const [entrevista, responsable] = await Promise.all([
    getEntrevistaPE(id).catch(() => null),
    plan.responsable_id ? getUsuario(plan.responsable_id).catch(() => null) : Promise.resolve(null),
  ])
  if (!entrevista) notFound()

  const sub = entrevista.sub_estado_paso ?? 'en_curso'
  if (sub !== 'esperando_aprobacion_final') {
    // Si todavía estamos en auditoria_completa, el user debería estar en Pantalla 3
    // procesando decisiones. Redirigimos a /cierre/[paso] (Pantalla 1 con hidratación P3).
    if (sub === 'auditoria_completa') {
      redirect(`/planes-estrategicos/${id}/cierre/${paso}`)
    }
    // Cualquier otro estado: redirigir al wizard.
    redirect(`/planes-estrategicos/${id}/entrevista`)
  }

  // Cargar el último turno reviewer del paso para tomar el snapshot pre-apply
  // y los conteos de re-audit disponibles.
  const reviewerTurnos = await getReviewerTurnos(entrevista.id, paso).catch(() => [])
  const ultimoExitoso = [...reviewerTurnos].reverse().find(r => {
    const j = r.report?.meta?.justificacion_confianza ?? ''
    return !/skipped|failed/i.test(j)
  })

  const snapshotPreApply = ultimoExitoso?.snapshotPreApply
  const fieldsModificados = snapshotPreApply
    ? computeFieldsModificados(snapshotPreApply, plan)
    : new Set<string>()

  const auditCount = paso === 1
    ? (entrevista.auditorias_paso_1_count ?? 0)
    : (entrevista.auditorias_paso_2_count ?? 0)
  const reAuditDisponible = auditCount < 3

  return (
    <div className={`pe-vista-root ${serif.variable}`}>
      <div className="pe-vista-container">
        {/* Header */}
        <header className="pe-vista-header">
          <div className="top-bar">
            <Link href={`/planes-estrategicos/${id}/entrevista`} className="back">
              ← Volver al wizard
            </Link>
            <span className="back" style={{ fontSize: 11 }}>
              Resumen actualizado · Paso {paso}
            </span>
          </div>
          <h1>{plan.nombre || '(plan sin nombre)'}</h1>
          <p className="subtitle">
            Plan {plan.tipo}
            {responsable && ` · ${responsable.nombre}`}
            {plan.area && ` · ${plan.area}`}
          </p>
          <p className="meta" style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
            Resumen tras aplicar las decisiones de la auditoría · {fieldsModificados.size} campo{fieldsModificados.size === 1 ? '' : 's'} modificado{fieldsModificados.size === 1 ? '' : 's'}.
          </p>
        </header>

        <PantallaFinalClient
          planId={id}
          paso={paso}
          plan={plan}
          fieldsModificados={Array.from(fieldsModificados)}
          reAuditDisponible={reAuditDisponible}
          auditCountActual={auditCount}
        />
      </div>
    </div>
  )
}
