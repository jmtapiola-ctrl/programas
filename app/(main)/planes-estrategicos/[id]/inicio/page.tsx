// Vista inicial del Plan Jr para el dueño formal cuando entra a su plan por
// primera vez. Server component que carga el Jr, valida ownership y renderiza
// read-only: contexto curado (markdown) + movimientos heredados (expandibles).
//
// Acceso permitido:
//   - Dueño formal del Jr (match por email contra dueno_jr_email).
//   - Roles globales (Ejecutivo / Program Manager / Admin) para preview.
//   - Plan Sr del que deriva el Jr (no implementado acá — el Sr no entra a
//     /inicio del hijo, ve el listado y la línea con su botón de Compartir).
//
// Estados soportados:
//   - 'Listo para compartir': flow normal — el dueño Jr lee acá por primera vez.
//   - 'En entrevista': el dueño ya clickeó "Iniciar wizard" en algún momento.
//     Por ahora redirige acá igual porque el wizard del Jr es Fase 6 (pendiente).
//
// El botón "Iniciar wizard →" queda DESHABILITADO en V1. Cuando Fase 6 esté
// implementada, ese botón llamará a POST /marcar-iniciado-jr y redirigirá al
// wizard del Jr.

import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { authOptions } from '@/lib/auth'
import { checkPlanAccess } from '@/lib/auth-ownership'
import { CONTEXTO_CURADO_CAMPOS, contextoCuradoTieneContenido } from '@/lib/types'
import type { MovimientoPE } from '@/lib/types'
import IniciarWizardButton from '@/components/planes-estrategicos/IniciarWizardButton'

export default async function InicioJrPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const { id: planJrId } = await params
  const user = {
    id: (session.user as any).id as string,
    email: (session.user as any).email as string | undefined,
    role: (session.user as any).role as string | undefined,
  }

  const access = await checkPlanAccess(user, planJrId)
  if (!access.allowed) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <h1 className="text-[26px] font-bold text-foreground mb-3">Acceso denegado</h1>
        <p className="text-[17px] text-muted-foreground">{access.error ?? 'No tenés permiso para ver este plan.'}</p>
        <div className="mt-4">
          <Link href="/planes-estrategicos" className="text-[17px] text-muted-foreground hover:text-foreground underline">
            ← Volver al listado
          </Link>
        </div>
      </div>
    )
  }

  const plan = access.plan!
  if (plan.tipo !== 'Jr') {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <h1 className="text-[26px] font-bold text-foreground mb-3">Esta página es solo para Planes Jr</h1>
        <Link href="/planes-estrategicos" className="text-[17px] text-muted-foreground hover:text-foreground underline">
          ← Volver al listado
        </Link>
      </div>
    )
  }

  // Estado de "Pendiente despliegue" — el dueño Jr no debería entrar acá
  // todavía (el contexto y snapshot no existen). Mostramos un mensaje claro.
  if (plan.estado === 'Pendiente despliegue') {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-3">
        <h1 className="text-[26px] font-bold text-foreground">El plan todavía no está listo</h1>
        <p className="text-[17px] text-muted-foreground leading-relaxed">
          El Plan Sr/Admin todavía no terminó de preparar este Plan Jr. Volvé en un rato — vas a recibir el link cuando esté listo para arrancar.
        </p>
        <Link href="/planes-estrategicos" className="inline-block text-[17px] text-muted-foreground hover:text-foreground underline">
          ← Volver al listado
        </Link>
      </div>
    )
  }

  const cc = plan.contexto_curado
  const tieneContexto = contextoCuradoTieneContenido(cc)
  const movsSnapshot: MovimientoPE[] = plan.movs_heredados_snapshot ?? []

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <header className="space-y-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="rounded-full border bg-blue-900 text-blue-200 border-blue-700 px-2 py-0.5 text-[16px] font-semibold">
            Plan Jr
          </span>
          {plan.estado === 'Listo para compartir' && (
            <span className="rounded-full border bg-purple-900 text-purple-200 border-purple-700 px-2 py-0.5 text-[16px] font-semibold">
              Listo para arrancar
            </span>
          )}
          {plan.estado === 'En entrevista' && (
            <span className="rounded-full border bg-blue-900 text-blue-200 border-blue-700 px-2 py-0.5 text-[16px] font-semibold">
              En curso
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-foreground">{plan.nombre}</h1>
        {plan.plan_sr_nombre && (
          <p className="text-[17px] text-muted-foreground">
            Derivado de: <span className="text-foreground/80">{plan.plan_sr_nombre}</span>
          </p>
        )}
      </header>

      {/* Contexto curado — una sección por concepto. El campo 'contexto'
          (bienvenida) va arriba sin label; los demás como cards con su título. */}
      {tieneContexto && cc ? (
        <div className="space-y-4">
          {CONTEXTO_CURADO_CAMPOS.map((campo) => {
            const valor = (cc[campo.key] ?? '').trim()
            if (!valor) return null
            return (
              <section
                key={campo.key}
                className="rounded-xl border border-sidebar-border bg-sidebar/20 px-6 py-5"
              >
                {campo.seccion && (
                  <p className="text-[14px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {campo.label}
                  </p>
                )}
                <div className="prose prose-invert prose-sm max-w-none">
                  <Markdown>{valor}</Markdown>
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <section className="rounded-xl border border-sidebar-border bg-sidebar/20 px-6 py-5">
          <p className="text-[17px] italic text-muted-foreground">
            El contexto curado todavía no fue generado. Pedile al Plan Sr/Admin que termine de desplegar este Jr.
          </p>
        </section>
      )}

      {/* Movimientos heredados — expandibles con <details> nativo */}
      {movsSnapshot.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[21px] font-bold text-foreground">
            Movimientos heredados — detalle técnico ({movsSnapshot.length})
          </h2>
          <p className="text-[16px] text-muted-foreground">
            Clickeá cada movimiento para ver su detalle completo. Esta es la información operativa que vas a trabajar en tu Plan Jr.
          </p>
          <div className="space-y-2 mt-3">
            {movsSnapshot.map((m) => (
              <MovHeredadoDetails key={m.id} mov={m} />
            ))}
          </div>
        </section>
      )}

      {/* Footer con CTA para iniciar/continuar el wizard del Jr (Fase 6). */}
      <section className="sticky bottom-4 rounded-lg border border-sidebar-border bg-background/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-3">
        <div className="text-[16px] text-muted-foreground">
          {plan.estado === 'En entrevista'
            ? 'Tu wizard ya está en curso. Continuá donde lo dejaste.'
            : 'Cuando estés listo, iniciá el wizard que te va a guiar para convertir estos movimientos en tu plan operativo.'}
        </div>
        <IniciarWizardButton planId={planJrId} estado={plan.estado} />
      </section>
    </div>
  )
}

// Detalle expandible de un movimiento heredado. Server component — usa
// <details>/<summary> nativos en lugar de useState para mantener todo SSR.
function MovHeredadoDetails({ mov }: { mov: MovimientoPE }) {
  const fmtUSD = (n: number) => n.toLocaleString('en-US')
  const precsCount = mov.precondiciones?.length ?? 0
  const desblCount = mov.desbloquea?.length ?? 0

  return (
    <details className="group rounded-lg border border-sidebar-border bg-sidebar/30 open:bg-sidebar/40 transition-colors">
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3 hover:bg-sidebar/50 transition-colors rounded-lg">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[16px] font-mono text-muted-foreground flex-shrink-0">{mov.id}</span>
          <span className="text-[17px] font-medium text-foreground truncate">{mov.nombre}</span>
          {mov.dueno_es_vacante && (
            <span className="text-[14px] text-amber-300 flex-shrink-0">[vacante]</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[14px] text-muted-foreground flex-shrink-0">
          <span className="hidden sm:inline">{mov.categoria}</span>
          <span className="rounded bg-sidebar/60 px-1.5 py-0.5">esfuerzo: {mov.costo_banda_ancha}</span>
          <span className="group-open:rotate-90 transition-transform inline-block w-3 text-center">▶</span>
        </div>
      </summary>
      <div className="px-4 py-3 border-t border-sidebar-border/60 space-y-2.5 text-[17px]">
        <Field label="Qué resuelve">{mov.que_resuelve}</Field>
        <Field label="Dueño operativo">
          {mov.dueno || '(sin asignar)'}
          {mov.dueno_es_vacante && (
            <span className="ml-2 text-[16px] text-amber-300">
              VACANCIA — {mov.dueno_semanas_cobertura ?? 8} semanas estimadas para cubrir
            </span>
          )}
        </Field>
        <Field label="Ventana temporal">
          {mov.ventana_temporal
            ? `${mov.ventana_temporal.arranca} → ${mov.ventana_temporal.termina}`
            : '(pendiente de secuenciar)'}
        </Field>
        <Field label="Duración estimada">
          {mov.duracion_meses_ejecucion ? `${mov.duracion_meses_ejecucion} meses` : '(sin estimar)'}
        </Field>
        <Field label="Impacto esperado">{mov.impacto ?? 'media'}</Field>
        <Field label="Costo monetario">
          USD {fmtUSD(mov.costo_monetario.rango_min_usd)}–{fmtUSD(mov.costo_monetario.rango_max_usd)}
          {mov.costo_monetario.nota && (
            <span className="text-muted-foreground"> · {mov.costo_monetario.nota}</span>
          )}
        </Field>
        <Field label={`Precondiciones (${precsCount})`}>
          {precsCount > 0
            ? (mov.precondiciones ?? []).join(', ')
            : 'Ninguna — podés arrancar este movimiento sin esperar nada.'}
        </Field>
        <Field label={`Desbloquea (${desblCount})`}>
          {desblCount > 0
            ? (mov.desbloquea ?? []).join(', ')
            : 'Ninguno.'}
        </Field>
        <Field label="Criterio de éxito">{mov.criterio_exito}</Field>
        {mov.riesgo_ejecucion_razonamiento && (
          <div className="rounded border border-amber-700/40 bg-amber-950/30 px-3 py-2">
            <p className="text-[14px] font-semibold uppercase tracking-wider text-amber-300 mb-0.5">⚠ Riesgo de ejecución</p>
            <p className="text-[16px] text-amber-200/90 leading-relaxed">{mov.riesgo_ejecucion_razonamiento}</p>
          </div>
        )}
      </div>
    </details>
  )
}

// Render de markdown con la tipografía del wizard PE (mínimo 12px).
function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h1 className="text-[26px] font-bold text-foreground mt-0 mb-3 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-[21px] font-bold text-foreground mt-5 mb-2 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-[18px] font-semibold text-foreground mt-3 mb-1.5">{children}</h3>,
        p: ({ children }) => <p className="text-[17px] text-foreground/90 leading-relaxed mb-2.5">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-5 text-[17px] text-foreground/90 space-y-1 mb-2.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 text-[17px] text-foreground/90 space-y-1 mb-2.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        hr: () => <hr className="my-4 border-sidebar-border" />,
        code: ({ children }) => <code className="rounded bg-sidebar/60 px-1 py-0.5 text-[16px] font-mono">{children}</code>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-primary pl-3 italic text-muted-foreground my-2">{children}</blockquote>,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[14px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <div className="text-[17px] text-foreground/90 leading-relaxed">{children}</div>
    </div>
  )
}
