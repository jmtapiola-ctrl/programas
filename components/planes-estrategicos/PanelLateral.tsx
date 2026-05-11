'use client'

import ReactMarkdown from 'react-markdown'
import type { PanelUpdatePE, PlanEstrategico } from '@/lib/types'

interface Props {
  plan: PlanEstrategico
  panel: PanelUpdatePE | null
  planSr: PlanEstrategico | null
}

function VerPlanCompletoLink({ planId }: { planId: string }) {
  return (
    <a
      href={`/planes-estrategicos/${planId}/vista`}
      target="_blank"
      rel="noopener noreferrer"
      className="block text-[12px] text-muted-foreground hover:text-foreground transition-colors text-right pb-2"
    >
      Ver plan completo ↗
    </a>
  )
}

export function PanelLateral({ plan, panel, planSr }: Props) {
  const esSr = plan.tipo === 'Sr'
  const proposito = panel?.proposito ?? plan.proposito
  const situacion = panel?.situacion ?? plan.situacion
  const datosFaltantes = panel?.datos_faltantes ?? plan.datos_faltantes ?? []
  const planPaso3 = panel?.plan ?? plan.plan

  if (!esSr && planSr) {
    return (
      <div className="flex gap-3 h-full">
        {/* Columna izq: Plan Sr */}
        <div className="w-[45%] flex-shrink-0 overflow-y-auto rounded-xl border border-sidebar-border bg-sidebar/50 p-4 space-y-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
              Plan Sr
            </p>
            <p className="text-[12px] font-semibold text-foreground">{planSr.nombre}</p>
          </div>
          {planSr.proposito && (
            <>
              <SeccionPanel titulo="Propósito Sr">
                <Campo label="Escena ideal" valor={planSr.proposito.escena} />
                <Campo label="Horizonte" valor={planSr.proposito.horizonte} />
                {planSr.proposito.fuera?.length > 0 && (
                  <Campo label="Lo que NO haremos" valor={planSr.proposito.fuera.map(f => `• ${f.item}`).join('\n')} />
                )}
              </SeccionPanel>
            </>
          )}
        </div>

        {/* Columna der: Plan Jr en construcción */}
        <div className="flex-1 overflow-y-auto space-y-4">
          <VerPlanCompletoLink planId={plan.id} />
          <PanelConstruccion proposito={proposito} situacion={situacion} datosFaltantes={datosFaltantes} alineacion={proposito?.alineacion_sr} planPaso3={planPaso3} />
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto space-y-4">
      <VerPlanCompletoLink planId={plan.id} />
      <PanelConstruccion proposito={proposito} situacion={situacion} datosFaltantes={datosFaltantes} planPaso3={planPaso3} />
    </div>
  )
}

function PanelConstruccion({
  proposito,
  situacion,
  datosFaltantes,
  alineacion,
  planPaso3,
}: {
  proposito: any
  situacion: any
  datosFaltantes: string[]
  alineacion?: string
  planPaso3?: any
}) {
  return (
    <>
      {alineacion && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">Alineación con Plan Sr:</span>
          <AlineacionBadge valor={alineacion} />
        </div>
      )}

      <SeccionPanel titulo="Propósito">
        <Campo label="Escena ideal" valor={proposito?.escena} placeholder="Se construye en el Paso 1" />
        {proposito?.metricas?.length > 0 && (
          <Campo
            label="Métricas"
            valor={proposito.metricas.map((m: any) => `• ${m.metrica}: ${m.valor_objetivo}${m.valor_actual ? ` (hoy: ${m.valor_actual})` : ''}`).join('\n')}
          />
        )}
        {proposito?.fuera?.length > 0 && (
          <Campo
            label="Lo que NO haremos"
            valor={proposito.fuera.map((f: any) => {
              const head = `• ${f.item}`
              const razon = f.razon ? `\n  Por qué: ${f.razon}` : ''
              return head + razon
            }).join('\n\n')}
          />
        )}
        <Campo label="Horizonte" valor={proposito?.horizonte} />
        <Campo label="Estabilidad" valor={proposito?.estabilidad} />
      </SeccionPanel>

      <SeccionPanel titulo="Situación">
        <Campo label="Desvío principal" valor={situacion?.desvio_principal} placeholder="Se construye en el Paso 2" />
        <Campo label="Cuantificación" valor={situacion?.desvio_cuantificado} />
        {situacion?.desvios_secundarios?.length > 0 && (
          <Campo
            label="Desvíos secundarios"
            valor={situacion.desvios_secundarios.map((d: any) => {
              const head = `• ${d.descripcion}`
              const datos = d.datos ? `\n  Datos: ${d.datos}` : ''
              return head + datos
            }).join('\n\n')}
          />
        )}
        <Campo label="Causa raíz" valor={situacion?.causa_raiz} />
        <Campo label="Consecuencia 6m" valor={situacion?.consecuencia_6m} />
        <Campo label="Consecuencia 12m" valor={situacion?.consecuencia_12m} />
        {situacion?.resistencias?.length > 0 && (
          <Campo
            label="Resistencias"
            valor={situacion.resistencias.map((r: any) => {
              const head = `• ${r.actor} [${r.tipo}, ${r.criticidad}]`
              const desc = r.descripcion ? `\n  Por qué: ${r.descripcion}` : ''
              const mit = r.mitigacion ? `\n  Mitigación: ${r.mitigacion}` : ''
              return head + desc + mit
            }).join('\n\n')}
          />
        )}
      </SeccionPanel>

      {planPaso3?.preparativos && <PreparativosPanel preparativos={planPaso3.preparativos} />}

      {planPaso3?.inventario && <InventarioPanel inventario={planPaso3.inventario} />}

      {planPaso3?.palancas && <PalancasPanel palancas={planPaso3.palancas} />}

      {datosFaltantes.length > 0 && (
        <SeccionPanel titulo="Datos por conseguir">
          <p className="text-[12px] text-muted-foreground whitespace-pre-wrap">
            {datosFaltantes.map(d => `• ${d}`).join('\n')}
          </p>
        </SeccionPanel>
      )}
    </>
  )
}

// Sub-bloque 3.0 — render de Preparativos cuando están poblados.
// Aparece solo si plan.preparativos existe (modelo está en o pasó por 3.0).
function PreparativosPanel({ preparativos }: { preparativos: any }) {
  const areas = preparativos.areas_afectadas ?? []
  const supuestos = preparativos.supuestos_exogenos ?? []
  const pri = preparativos.priorizacion_inicial
  const ce = preparativos.criterio_exito

  return (
    <SeccionPanel titulo="Plan — Preparativos (3.0)">
      {areas.length > 0 && (
        <Campo
          label={`Áreas afectadas (${areas.length})`}
          valor={areas.map((a: any) => `• ${a.nombre} — ${a.responsable || '[vacancia]'}${a.notas ? `\n  ${a.notas}` : ''}`).join('\n')}
        />
      )}

      {supuestos.length > 0 && (
        <Campo
          label={`Supuestos exógenos (${supuestos.length})`}
          valor={supuestos.map((s: any) => {
            const tag = `[${s.tipo} · ${s.probabilidad} prob · ${s.estrategia}]`
            const head = `• ${s.descripcion} ${tag}`
            const razon = s.razon ? `\n  ${s.razon}` : ''
            return head + razon
          }).join('\n\n')}
        />
      )}

      {pri?.desvio_elegido && (
        <Campo
          label="Priorización inicial"
          valor={`• ${pri.desvio_elegido}\n  Razón: ${pri.razon}${pri.desbloquea ? `\n  Desbloquea: ${pri.desbloquea}` : ''}`}
        />
      )}

      {ce?.por_metrica?.length > 0 && (
        <Campo
          label="Criterio de éxito"
          valor={ce.por_metrica.map((m: any) => `• ${m.metrica}\n  Pleno: ${m.pleno}\n  Mínimo: ${m.minimo}`).join('\n\n')}
        />
      )}
      {ce?.zona_fracaso && (
        <Campo label="Zona de fracaso" valor={ce.zona_fracaso} />
      )}
    </SeccionPanel>
  )
}

// Sub-bloque 3.A — render compacto del inventario en el panel lateral.
// Aparece solo si plan.inventario existe (después de la generación inicial).
function InventarioPanel({ inventario }: { inventario: any }) {
  const movs = inventario.movimientos ?? []
  const total = movs.length
  const aceptados = movs.filter((m: any) => m.estado_usuario === 'aceptado').length
  const editados = movs.filter((m: any) => m.estado_usuario === 'editado').length
  const quitados = movs.filter((m: any) => m.estado_usuario === 'quitado').length
  const pendientes = movs.filter((m: any) => m.estado_usuario === 'pendiente').length

  // Agrupar por categoría
  const porCategoria = new Map<string, number>()
  for (const m of movs) {
    porCategoria.set(m.categoria, (porCategoria.get(m.categoria) ?? 0) + 1)
  }

  return (
    <SeccionPanel titulo="Plan — Inventario (3.A)">
      <div className="space-y-2 text-[12px]">
        <p className="text-foreground/90">
          <span className="font-semibold">{total}</span> movimientos en {porCategoria.size} categorías
        </p>
        <div className="flex flex-wrap gap-1.5">
          {aceptados > 0 && <span className="rounded-full bg-green-950/40 border border-green-800/50 px-1.5 py-0.5 text-green-300">{aceptados} aceptados</span>}
          {editados > 0 && <span className="rounded-full bg-blue-950/40 border border-blue-800/50 px-1.5 py-0.5 text-blue-300">{editados} editados</span>}
          {quitados > 0 && <span className="rounded-full bg-gray-800/40 border border-gray-700/50 px-1.5 py-0.5 text-gray-400">{quitados} quitados</span>}
          {pendientes > 0 && <span className="rounded-full bg-yellow-950/30 border border-yellow-800/40 px-1.5 py-0.5 text-yellow-300">{pendientes} pendientes</span>}
        </div>
      </div>
      <Campo
        label="Categorías"
        valor={Array.from(porCategoria.entries()).map(([cat, n]) => `• ${cat} (${n})`).join('\n')}
      />
    </SeccionPanel>
  )
}

// Sub-bloque 3.B — render compacto de palancas en el panel lateral.
function PalancasPanel({ palancas }: { palancas: any }) {
  const principal = palancas.preguntas_principal ?? []
  const validador = palancas.preguntas_validador ?? []
  const respondidasPrincipal = principal.filter((q: any) => q.respuesta?.trim()).length
  const respondidasValidador = validador.filter((q: any) => q.respuesta?.trim()).length

  return (
    <SeccionPanel titulo="Plan — Palancas (3.B)">
      <div className="space-y-2 text-[12px]">
        <p className="text-foreground/90">
          <span className="font-semibold">{principal.length}</span> preguntas modelo principal
          {principal.length > 0 && ` · ${respondidasPrincipal}/${principal.length} respondidas`}
        </p>
        {validador.length > 0 && (
          <p className="text-foreground/90">
            <span className="font-semibold">{validador.length}</span> preguntas validador
            {` · ${respondidasValidador}/${validador.length} respondidas`}
          </p>
        )}
      </div>
    </SeccionPanel>
  )
}

function SeccionPanel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-sidebar-border bg-sidebar/50 p-4 space-y-3">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {titulo}
      </p>
      {children}
    </div>
  )
}

function Campo({ label, valor, placeholder }: { label: string; valor?: string; placeholder?: string }) {
  const texto = valor?.trim()
  return (
    <div className="space-y-0.5">
      <p className="text-[12px] font-medium text-muted-foreground/70 uppercase tracking-wide">{label}</p>
      {texto ? (
        <div className="text-[12px] text-foreground/90 leading-relaxed">
          <ReactMarkdown
            components={{
              // ### (heading-3) → categoría dentro del campo (ej "Gente", "Intangibles")
              h3: ({ children }) => <p className="text-[13px] font-semibold text-foreground mt-2 first:mt-0 mb-0.5">{children}</p>,
              // #### (heading-4) → subcategoría (ej "RRHH", "Marcas")
              h4: ({ children }) => <p className="text-[12px] font-semibold text-foreground/90 mt-1.5 first:mt-0 italic">{children}</p>,
              p: ({ children }) => <p className="mb-1.5 last:mb-0 whitespace-pre-wrap">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5 marker:text-muted-foreground/60">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5 marker:text-muted-foreground/60">{children}</ol>,
              li: ({ children }) => <li className="leading-snug">{children}</li>,
              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
            }}
          >
            {texto}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground/35 italic">{placeholder ?? '—'}</p>
      )}
    </div>
  )
}

function AlineacionBadge({ valor }: { valor: string }) {
  const colors: Record<string, string> = {
    Verde: 'bg-green-900 text-green-200 border-green-700',
    Amarillo: 'bg-yellow-900 text-yellow-200 border-yellow-700',
    Rojo: 'bg-red-900 text-red-200 border-red-700',
  }
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${colors[valor] ?? 'bg-gray-700 text-gray-200 border-gray-600'}`}>
      {valor}
    </span>
  )
}
