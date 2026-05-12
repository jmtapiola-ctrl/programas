'use client'

// Modal interactivo para 3.0.D — Criterio de éxito mínimo vs pleno.
//
// Para cada métrica del propósito muestra: el pleno (target original, read-only,
// pre-llenado desde proposito.metricas si el modelo no lo cargó) + textarea para
// que el user defina el mínimo aceptable. Al final, textarea global para la
// zona de fracaso.
//
// On submit: (1) manda mensaje formateado al chat para el modelo, (2) el
// caller también puede patchear Airtable directo como fallback de persistencia.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CriterioExitoMetricaPE, MetricaPE } from '@/lib/types'

interface Props {
  // Métricas del propósito (de plan.proposito.metricas) — usadas para
  // pre-llenar el pleno automáticamente si el modelo no lo cargó.
  metricasProposito: (MetricaPE | string)[]
  // Estado actual del criterio_exito en plan.preparativos (puede estar parcial
  // o vacío). El modal mergea con metricasProposito para tener la lista completa.
  criterioActual: { por_metrica: CriterioExitoMetricaPE[]; zona_fracaso: string }
  onEnviar: (textoMensaje: string) => void
  onCerrar: () => void
  saving?: boolean
}

interface FilaEditable {
  metrica: string
  pleno: string
  minimo: string
}

function nombreDeMetrica(m: MetricaPE | string): string {
  return typeof m === 'string' ? m : m.metrica
}

function plenoDeMetrica(m: MetricaPE | string): string {
  return typeof m === 'string' ? '' : (m.valor_objetivo || '')
}

export function CriterioExitoFormModal(props: Props) {
  if (typeof document === 'undefined') return null
  return createPortal(<Contenido {...props} />, document.body)
}

function Contenido({ metricasProposito, criterioActual, onEnviar, onCerrar, saving }: Props) {
  // Combinar métricas del propósito con criterio_exito actual.
  // Para cada métrica del propósito, buscar si ya existe en criterioActual.por_metrica.
  // Si existe, usar pleno + minimo del actual. Si no, prellenar pleno desde proposito.
  const filasIniciales: FilaEditable[] = useMemo(() => {
    return metricasProposito.map(m => {
      const nombre = nombreDeMetrica(m)
      const existente = criterioActual.por_metrica.find(c => c.metrica === nombre)
      return {
        metrica: nombre,
        pleno: existente?.pleno || plenoDeMetrica(m),
        minimo: existente?.minimo || '',
      }
    })
  }, [metricasProposito, criterioActual])

  const [filas, setFilas] = useState<FilaEditable[]>(filasIniciales)
  const [zonaFracaso, setZonaFracaso] = useState(criterioActual.zona_fracaso || '')
  const [mostrarDoctrina, setMostrarDoctrina] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !saving) onCerrar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCerrar, saving])

  function actualizar(idx: number, parcial: Partial<FilaEditable>) {
    setFilas(prev => prev.map((f, i) => i === idx ? { ...f, ...parcial } : f))
  }

  const completos = filas.filter(f => f.minimo.trim()).length
  const total = filas.length
  const puedeEnviar = completos === total && total > 0

  function handleEnviar() {
    if (!puedeEnviar) return
    const texto = serializar(filas, zonaFracaso)
    onEnviar(texto)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
      onClick={() => !saving && onCerrar()}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Sub-bloque 3.0.D · Criterio de éxito
            </p>
            <h2 className="mt-1 text-[18px] font-semibold text-foreground">
              Mínimo aceptable para cada métrica ({total})
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Pleno = target original (Paso 1) · Mínimo aceptable = el resultado más bajo donde el plan NO se considera fracasado.
            </p>
          </div>
          <button
            onClick={onCerrar}
            disabled={saving}
            aria-label="Cerrar"
            className="rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 p-1 text-[16px] leading-none disabled:opacity-40"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* Bloque doctrina */}
          <div className="rounded-lg border border-sidebar-border bg-sidebar/20 px-4 py-3">
            <p className="text-[13px] text-foreground/90 leading-relaxed">
              Para cada métrica del propósito definí dos puntos: el éxito <strong>pleno</strong> (target ya declarado en Paso 1, lo precarga el sistema) y el <strong>mínimo aceptable</strong> (el resultado más bajo donde el plan NO se considera fracasado).
            </p>
            <button
              onClick={() => setMostrarDoctrina(v => !v)}
              className="mt-2 text-[12px] text-primary hover:text-primary/80 font-medium"
            >
              {mostrarDoctrina ? '▾ Ocultar doctrina' : '▸ ¿Por qué importa esto?'}
            </button>
            {mostrarDoctrina && (
              <div className="mt-3 space-y-2 text-[13px] text-foreground/80 leading-relaxed">
                <p>
                  Sin el mínimo declarado de antemano, cualquier resultado parece justificable y el plan no tiene <strong>gate de éxito</strong> real. Cuando llegue Q3 o Q4 y los números no estén donde el pleno los pone, vas a estar tentado a racionalizar ("igual estamos mejor que antes") en lugar de pivotar.
                </p>
                <p>
                  Tener el mínimo escrito <em>antes</em> de ver los resultados te da disciplina: si caés debajo del mínimo, hay que pivotar (cambiar palancas, replantear, rescatar lo que se pueda). Si quedás entre mínimo y pleno, sostené y ajustá. Si superás el pleno, doblá la apuesta.
                </p>
                <p>
                  <strong className="text-foreground">Zona de fracaso</strong> (al final del form) — opcional pero recomendado: la condición global por debajo de la cual el plan está fracasando independientemente de qué métrica específica falle. Sirve como early-warning agregado.
                </p>
              </div>
            )}
          </div>

          {filas.map((fila, idx) => (
            <MetricaCard
              key={idx}
              idx={idx}
              fila={fila}
              onChange={(parcial) => actualizar(idx, parcial)}
            />
          ))}

          {/* Zona de fracaso */}
          <div className="rounded-lg border-2 border-sidebar-border bg-sidebar/30 px-4 py-4 space-y-2">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-foreground/80">Zona de fracaso</p>
            <p className="text-[12px] text-muted-foreground italic">
              Condición global por debajo de la cual el plan está fracasando. Opcional.
            </p>
            <textarea
              value={zonaFracaso}
              onChange={(e) => setZonaFracaso(e.target.value)}
              placeholder="ej: Si en Q3 no estamos en al menos 3 macrozonas operativas O el piloto PAI sigue debajo de 100/mes, el plan fracasó."
              rows={3}
              className="w-full rounded-md border border-sidebar-border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-4 flex items-center justify-between gap-4">
          <p className="text-[13px] text-muted-foreground">
            {completos === total
              ? <span className="text-foreground"><strong>{completos}/{total}</strong> mínimos definidos · listo para enviar</span>
              : <span>{completos}/{total} mínimos definidos · faltan {total - completos}</span>}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onCerrar}
              disabled={saving}
              className="rounded-md px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              onClick={handleEnviar}
              disabled={!puedeEnviar || saving}
              className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Enviando…' : 'Enviar respuestas →'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ─── Tarjeta de una métrica ─────────────────────────────────────────────────

function MetricaCard({
  idx,
  fila,
  onChange,
}: {
  idx: number
  fila: FilaEditable
  onChange: (parcial: Partial<FilaEditable>) => void
}) {
  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar/30 px-4 py-3 space-y-3">
      <div>
        <p className="text-[13px] font-semibold uppercase tracking-wider text-foreground/80">
          Métrica {idx + 1} · {fila.metrica}
        </p>
      </div>

      <div>
        <p className="text-[13px] font-medium text-foreground/90">Pleno
          <span className="ml-2 text-[12px] text-muted-foreground italic">target original del Paso 1</span>
        </p>
        {fila.pleno ? (
          <p className="mt-1 text-[14px] text-foreground/70 leading-relaxed">{fila.pleno}</p>
        ) : (
          <p className="mt-1 text-[13px] text-muted-foreground italic">(sin target declarado — revisar Paso 1)</p>
        )}
      </div>

      <div>
        <label className="text-[13px] font-medium text-foreground/90">Mínimo aceptable
          <span className="ml-2 text-[12px] text-muted-foreground italic">por debajo de esto el plan fracasó</span>
        </label>
        <textarea
          value={fila.minimo}
          onChange={(e) => onChange({ minimo: e.target.value })}
          placeholder={hintParaMetrica(fila.metrica, fila.pleno)}
          rows={2}
          className="mt-1 w-full rounded-md border border-sidebar-border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
        />
      </div>
    </div>
  )
}

// Hint contextual basado en el nombre de la métrica (heurística simple).
function hintParaMetrica(nombre: string, pleno: string): string {
  const n = nombre.toLowerCase()
  if (n.includes('volumen') || n.includes('capacidad')) return 'ej: 700 dueños/mes sostenido (vs pleno 1.000+)'
  if (n.includes('organización') || n.includes('productividad') || n.includes('person')) return 'ej: 600 personas / productividad fijos 1.5x (vs pleno 2x)'
  if (n.includes('confianza') || n.includes('marca') || n.includes('awareness')) return 'ej: 60% awareness asistido en al menos 1 marca (vs pleno 90%+)'
  if (n.includes('finan') || n.includes('cashflow')) return 'ej: cashflow positivo con buffer 10% en peor momento (vs pleno 20%)'
  if (n.includes('expansión') || n.includes('geográfic') || n.includes('macrozona')) return 'ej: 3 macrozonas operativas (vs pleno 6)'
  if (n.includes('tierra')) return 'ej: tierras suficientes para 8k dueños 2027 (vs pleno 12-15k)'
  if (n.includes('pai')) return 'ej: 120 ventas/mes en piloto (vs pleno 200) o 2 sucursales (vs pleno 3-5)'
  return pleno ? 'Definí cuál sería el resultado mínimo bajo el cual considerarías el plan como fracasado en esta métrica.' : 'Mínimo aceptable de esta métrica.'
}

// ─── Serialización al formato que parsea el modelo ──────────────────────────

function serializar(filas: FilaEditable[], zonaFracaso: string): string {
  const lineas: string[] = ['[Respuestas a criterio de éxito]', '']
  filas.forEach((f, i) => {
    lineas.push(`Métrica ${i + 1} (${f.metrica}):`)
    lineas.push(`Pleno: ${f.pleno}`)
    lineas.push(`Mínimo: ${f.minimo.trim()}`)
    lineas.push('')
  })
  if (zonaFracaso.trim()) {
    lineas.push(`Zona de fracaso: ${zonaFracaso.trim()}`)
  } else {
    lineas.push(`Zona de fracaso: (no declarada)`)
  }
  return lineas.join('\n').trim()
}
