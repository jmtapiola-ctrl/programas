'use client'

import type { PanelUpdatePE, PlanEstrategico } from '@/lib/types'

interface Props {
  plan: PlanEstrategico
  panel: PanelUpdatePE | null
  planSr: PlanEstrategico | null
}

export function PanelLateral({ plan, panel, planSr }: Props) {
  const esSr = plan.tipo === 'Sr'
  const proposito = panel?.proposito ?? plan.proposito
  const situacion = panel?.situacion ?? plan.situacion
  const datosFaltantes = panel?.datos_faltantes ?? plan.datos_faltantes ?? []

  if (!esSr && planSr) {
    return (
      <div className="flex gap-3 h-full">
        {/* Columna izq: Plan Sr */}
        <div className="w-[45%] flex-shrink-0 overflow-y-auto rounded-xl border border-sidebar-border bg-sidebar/50 p-4 space-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
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
                  <Campo label="Fuera de scope" valor={planSr.proposito.fuera.map(f => `• ${f.item}`).join('\n')} />
                )}
              </SeccionPanel>
            </>
          )}
        </div>

        {/* Columna der: Plan Jr en construcción */}
        <div className="flex-1 overflow-y-auto space-y-4">
          <PanelConstruccion proposito={proposito} situacion={situacion} datosFaltantes={datosFaltantes} alineacion={proposito?.alineacion_sr} />
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto space-y-4">
      <PanelConstruccion proposito={proposito} situacion={situacion} datosFaltantes={datosFaltantes} />
    </div>
  )
}

function PanelConstruccion({
  proposito,
  situacion,
  datosFaltantes,
  alineacion,
}: {
  proposito: any
  situacion: any
  datosFaltantes: string[]
  alineacion?: string
}) {
  return (
    <>
      {alineacion && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Alineación con Plan Sr:</span>
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
            label="Fuera de scope"
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

function SeccionPanel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-sidebar-border bg-sidebar/50 p-4 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
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
      <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide">{label}</p>
      {texto ? (
        <p className="text-[12px] text-foreground/90 whitespace-pre-wrap leading-relaxed">{texto}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground/35 italic">{placeholder ?? '—'}</p>
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
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${colors[valor] ?? 'bg-gray-700 text-gray-200 border-gray-600'}`}>
      {valor}
    </span>
  )
}
