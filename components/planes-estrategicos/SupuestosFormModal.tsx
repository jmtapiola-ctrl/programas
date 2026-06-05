'use client'

// Modal interactivo para 3.0.B — Supuestos exógenos.
//
// El modelo emite plan.preparativos.supuestos_exogenos con campos
// (probabilidad/impacto/estrategia/razon) vacíos. Este componente renderiza
// un form con segmented controls para cada supuesto, más opción de agregar
// nuevos o quitar sobrantes. On submit, serializa todas las respuestas en
// texto plano y lo pasa al callback (que las manda como mensaje normal al
// /chat) — el modelo parsea y emite PANEL_UPDATE con supuestos_exogenos
// completos.

import { BTN_CTA } from '@/components/ui/button-styles'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  SupuestoExogenoPE,
  SupuestoTipo,
  Probabilidad,
  EstrategiaSupuesto,
} from '@/lib/types'

interface Props {
  supuestos: SupuestoExogenoPE[]
  onEnviar: (textoMensaje: string) => void
  onCerrar: () => void
  saving?: boolean
}

type ImpactoSigno = 'favorable' | 'desfavorable'

interface FilaEditable {
  // null en los originales que no se quitaron, true cuando se marcan "sobrante"
  removida: boolean
  // marca de origen para serializar
  origen: 'original' | 'nuevo'
  // Index original (1-based, S-N) — solo para 'original'. Para 'nuevo' es -1.
  numeroOriginal: number
  // Datos editables
  descripcion: string
  tipo: SupuestoTipo
  probabilidad: Probabilidad | ''
  impacto_signo: ImpactoSigno | ''
  impacto_magnitud: 'alta' | 'media' | 'baja' | ''
  estrategia: EstrategiaSupuesto | ''
  razon: string
}

function filaDesdeSupuesto(s: SupuestoExogenoPE, numeroOriginal: number): FilaEditable {
  return {
    removida: false,
    origen: 'original',
    numeroOriginal,
    descripcion: s.descripcion,
    tipo: s.tipo,
    probabilidad: s.probabilidad || '',
    impacto_signo: (s.impacto_signo as ImpactoSigno) || '',
    impacto_magnitud: s.impacto_magnitud || '',
    estrategia: s.estrategia || '',
    razon: s.razon || '',
  }
}

function filaVacia(): FilaEditable {
  return {
    removida: false,
    origen: 'nuevo',
    numeroOriginal: -1,
    descripcion: '',
    tipo: 'macro',
    probabilidad: '',
    impacto_signo: '',
    impacto_magnitud: '',
    estrategia: '',
    razon: '',
  }
}

export function SupuestosFormModal(props: Props) {
  if (typeof document === 'undefined') return null
  return createPortal(<Contenido {...props} />, document.body)
}

function Contenido({ supuestos, onEnviar, onCerrar, saving }: Props) {
  const [filas, setFilas] = useState<FilaEditable[]>(() =>
    supuestos.map((s, i) => filaDesdeSupuesto(s, i + 1))
  )
  const [mostrarDoctrina, setMostrarDoctrina] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !saving) onCerrar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCerrar, saving])

  function actualizar(idx: number, parcial: Partial<FilaEditable>) {
    setFilas(prev => prev.map((f, i) => i === idx ? { ...f, ...parcial } : f))
  }

  function agregarNuevo() {
    setFilas(prev => [...prev, filaVacia()])
  }

  function quitar(idx: number) {
    const fila = filas[idx]
    if (fila.origen === 'nuevo') {
      // Si es nuevo, eliminamos del array directo
      setFilas(prev => prev.filter((_, i) => i !== idx))
    } else {
      // Si es original, marcamos como removida (se serializa en "Supuestos a quitar")
      actualizar(idx, { removida: true })
    }
  }

  function restaurar(idx: number) {
    actualizar(idx, { removida: false })
  }

  // Validación: todas las filas no-removidas tienen los 4 campos. Nuevas también requieren descripcion.
  const errores = useMemo(() => {
    const errs: { idx: number; campo: string }[] = []
    filas.forEach((f, idx) => {
      if (f.removida) return
      if (f.origen === 'nuevo' && !f.descripcion.trim()) errs.push({ idx, campo: 'descripción' })
      if (!f.probabilidad) errs.push({ idx, campo: 'probabilidad' })
      if (!f.impacto_signo) errs.push({ idx, campo: 'impacto signo' })
      if (!f.impacto_magnitud) errs.push({ idx, campo: 'impacto magnitud' })
      if (!f.estrategia) errs.push({ idx, campo: 'estrategia' })
    })
    return errs
  }, [filas])

  const completos = filas.filter(f => !f.removida && f.probabilidad && f.impacto_signo && f.impacto_magnitud && f.estrategia && (f.origen === 'original' || f.descripcion.trim())).length
  const totalActivos = filas.filter(f => !f.removida).length
  const puedeEnviar = errores.length === 0 && totalActivos > 0

  function handleEnviar() {
    if (!puedeEnviar) return
    const texto = serializar(filas)
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
              Sub-bloque 3.0.B · Supuestos exógenos
            </p>
            <h2 className="mt-1 text-[18px] font-semibold text-foreground">
              Calificá los {supuestos.length} supuestos detectados
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Probabilidad subjetiva · Impacto si rompe · Estrategia (hedge / bet / aceptar). Podés agregar los que el modelo no detectó o marcar como sobrantes.
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
          {/* Bloque doctrina expandible */}
          <div className="rounded-lg border border-sidebar-border bg-sidebar/20 px-4 py-3">
            <p className="text-[13px] text-foreground/90 leading-relaxed">
              Para cada supuesto declarado, decidí: qué tan probable es que se <strong>mantenga</strong> (probabilidad), qué pasa <strong>si NO se cumple</strong> (impacto + magnitud), y cómo manejás el riesgo (estrategia).
            </p>
            <button
              onClick={() => setMostrarDoctrina(v => !v)}
              className="mt-2 text-[12px] text-primary hover:text-primary/80 font-medium"
            >
              {mostrarDoctrina ? '▾ Ocultar doctrina' : '▸ ¿Cómo funciona cada dimensión?'}
            </button>
            {mostrarDoctrina && (
              <div className="mt-3 space-y-2 text-[13px] text-foreground/80 leading-relaxed">
                <p>
                  <strong className="text-foreground">Probabilidad</strong> que el supuesto se <em>mantenga verdadero</em> hasta fin del horizonte del plan. Alta = es muy probable que se cumpla. Baja = es frágil, podría romperse.
                </p>
                <p>
                  <strong className="text-foreground">Impacto si ROMPE</strong> (sentido + magnitud). Si el supuesto no se cumple, ¿el plan queda mejor (favorable) o peor (desfavorable)? Y de qué magnitud.
                </p>
                <p>
                  <strong className="text-foreground">Estrategia</strong> de cómo manejás el supuesto — son las 3 actitudes canónicas frente a un supuesto crítico:
                </p>
                <ul className="ml-4 space-y-1.5">
                  <li>
                    <strong className="text-foreground">Hedge</strong> — tomar acciones para <em>mitigar</em> el daño si rompe. Reducir exposición, comprar opcionalidad, planes de contingencia.
                  </li>
                  <li>
                    <strong className="text-foreground">Bet</strong> — ir <em>a fondo</em> apostando que se mantiene. El plan depende activamente del supuesto; si rompe se reescribe, pero el upside vale el riesgo concentrado.
                  </li>
                  <li>
                    <strong className="text-foreground">Aceptar</strong> — ni mitigar ni apostar. El supuesto está, podría romper, no hay forma razonable de prepararse — si rompe, te adaptás reactivamente.
                  </li>
                </ul>
                <p className="text-foreground/70 italic mt-2">
                  Bet vs Aceptar: Bet es ACTIVO (concentrás recursos en una dirección que asume el supuesto); Aceptar es PASIVO (el supuesto está pero no le dedicás respuesta específica).
                </p>
              </div>
            )}
          </div>

          {filas.map((fila, idx) => (
            <SupuestoCard
              key={idx}
              fila={fila}
              idx={idx}
              onChange={(parcial) => actualizar(idx, parcial)}
              onQuitar={() => quitar(idx)}
              onRestaurar={() => restaurar(idx)}
            />
          ))}

          <button
            onClick={agregarNuevo}
            disabled={saving}
            className="w-full rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-4 text-[15px] font-semibold text-foreground hover:bg-primary/10 hover:border-primary/60 transition-colors disabled:opacity-40"
          >
            + Agregar supuesto que el modelo no detectó
          </button>
        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-4 flex items-center justify-between gap-4">
          <p className="text-[13px] text-muted-foreground">
            {completos === totalActivos
              ? <span className="text-foreground"><strong>{completos}/{totalActivos}</strong> completos · listo para enviar</span>
              : <span>{completos}/{totalActivos} completos · faltan {totalActivos - completos}</span>}
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
              className={BTN_CTA}
            >
              {saving ? 'Enviando…' : 'Enviar respuestas →'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ─── Tarjeta de un supuesto ─────────────────────────────────────────────────

function SupuestoCard({
  fila,
  idx,
  onChange,
  onQuitar,
  onRestaurar,
}: {
  fila: FilaEditable
  idx: number
  onChange: (parcial: Partial<FilaEditable>) => void
  onQuitar: () => void
  onRestaurar: () => void
}) {
  if (fila.removida) {
    return (
      <div className="rounded-lg border border-dashed border-sidebar-border/50 bg-sidebar/30 px-4 py-3 flex items-center justify-between gap-3 opacity-60">
        <p className="text-[13px] text-muted-foreground line-through">
          S-{fila.numeroOriginal}: {fila.descripcion}
        </p>
        <button
          onClick={onRestaurar}
          className="flex-shrink-0 text-[13px] text-muted-foreground hover:text-foreground"
        >
          Restaurar
        </button>
      </div>
    )
  }

  const titulo = fila.origen === 'original'
    ? `S-${fila.numeroOriginal} (${fila.tipo})`
    : `Nuevo supuesto (#${idx + 1})`

  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar/30 px-4 py-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-foreground/80">{titulo}</p>
          {fila.origen === 'original' ? (
            <p className="mt-1 text-[14px] text-foreground leading-relaxed">{fila.descripcion}</p>
          ) : (
            <div className="mt-1 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-[13px] text-foreground/90">Tipo:</label>
                <SegmentedControl
                  options={[
                    { value: 'macro', label: 'Macro' },
                    { value: 'mercado', label: 'Mercado' },
                    { value: 'regulatorio', label: 'Regulatorio' },
                    { value: 'social', label: 'Social' },
                  ]}
                  value={fila.tipo}
                  onChange={(v) => onChange({ tipo: v as SupuestoTipo })}
                  size="sm"
                />
              </div>
              <textarea
                value={fila.descripcion}
                onChange={(e) => onChange({ descripcion: e.target.value })}
                placeholder="Describí el supuesto (ej: 'Tasa BCRA baja a un dígito en H1-2026')"
                rows={2}
                className="w-full rounded-md border border-sidebar-border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
              />
            </div>
          )}
        </div>
        <button
          onClick={onQuitar}
          className="flex-shrink-0 rounded-md text-[13px] text-muted-foreground hover:text-red-400"
          aria-label="Quitar supuesto"
        >
          Quitar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[13px] font-medium text-foreground/90">Probabilidad</label>
          <span className="ml-2 text-[12px] text-muted-foreground italic">que se mantenga</span>
          <SegmentedControl
            options={[
              { value: 'alta', label: 'Alta' },
              { value: 'media', label: 'Media' },
              { value: 'baja', label: 'Baja' },
            ]}
            value={fila.probabilidad}
            onChange={(v) => onChange({ probabilidad: v as Probabilidad })}
          />
        </div>

        <div>
          <label className="text-[13px] font-medium text-foreground/90">Estrategia</label>
          <span className="ml-2 text-[12px] text-muted-foreground italic">cómo lo manejás</span>
          <SegmentedControl
            options={[
              { value: 'hedge', label: 'Hedge' },
              { value: 'bet', label: 'Bet' },
              { value: 'aceptar', label: 'Aceptar' },
            ]}
            value={fila.estrategia}
            onChange={(v) => onChange({ estrategia: v as EstrategiaSupuesto })}
          />
        </div>

        <div>
          <label className="text-[13px] font-medium text-foreground/90">Impacto</label>
          <span className="ml-2 text-[12px] text-muted-foreground italic">si rompe</span>
          <SegmentedControl
            options={[
              { value: 'favorable', label: 'Favorable' },
              { value: 'desfavorable', label: 'Desfavorable' },
            ]}
            value={fila.impacto_signo}
            onChange={(v) => onChange({ impacto_signo: v as ImpactoSigno })}
          />
        </div>

        <div>
          <label className="text-[13px] font-medium text-foreground/90">Impacto · magnitud</label>
          <span className="ml-2 text-[12px] text-muted-foreground italic">si rompe</span>
          <SegmentedControl
            options={[
              { value: 'alta', label: 'Alta' },
              { value: 'media', label: 'Media' },
              { value: 'baja', label: 'Baja' },
            ]}
            value={fila.impacto_magnitud}
            onChange={(v) => onChange({ impacto_magnitud: v as 'alta' | 'media' | 'baja' })}
          />
        </div>
      </div>

      <div>
        <label className="text-[13px] font-medium text-foreground/90">Razón (opcional)</label>
        <textarea
          value={fila.razon}
          onChange={(e) => onChange({ razon: e.target.value })}
          placeholder="Por qué la probabilidad/impacto/estrategia que elegiste"
          rows={2}
          className="mt-1 w-full rounded-md border border-sidebar-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
        />
      </div>
    </div>
  )
}

// ─── Segmented control reusable ─────────────────────────────────────────────

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { value: T; label: string }[]
  value: T | ''
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  const pad = size === 'sm' ? 'px-2 py-1' : 'px-3 py-1.5'
  const text = size === 'sm' ? 'text-[12px]' : 'text-[13px]'
  return (
    <div className="mt-1 inline-flex rounded-md border border-sidebar-border bg-background">
      {options.map((o, i) => {
        const selected = value === o.value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`${pad} ${text} font-medium transition-colors ${
              selected
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
            } ${i > 0 ? 'border-l border-sidebar-border' : ''} first:rounded-l-md last:rounded-r-md`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Serialización al formato que parsea el modelo ──────────────────────────

function serializar(filas: FilaEditable[]): string {
  const respuestas: string[] = []
  const adicionales: string[] = []
  const quitados: string[] = []

  for (const f of filas) {
    if (f.removida) {
      if (f.origen === 'original') {
        quitados.push(`S-${f.numeroOriginal} (${truncar(f.descripcion, 80)})`)
      }
      continue
    }
    const linea = `probabilidad=${f.probabilidad} · impacto=${f.impacto_signo}·${f.impacto_magnitud} · estrategia=${f.estrategia}`
    const razon = f.razon.trim() ? `\nRazón: ${f.razon.trim()}` : ''
    if (f.origen === 'original') {
      respuestas.push(`S-${f.numeroOriginal}: ${linea}${razon}`)
    } else {
      adicionales.push(`(Tipo: ${f.tipo}) ${f.descripcion.trim()}: ${linea}${razon}`)
    }
  }

  const partes: string[] = []
  partes.push('[Respuestas a supuestos exógenos]')
  if (respuestas.length > 0) partes.push(respuestas.join('\n\n'))
  if (adicionales.length > 0) {
    partes.push('\n[Supuestos adicionales que el modelo no detectó]')
    partes.push(adicionales.join('\n\n'))
  }
  if (quitados.length > 0) {
    partes.push('\n[Supuestos a quitar de la lista]')
    partes.push(quitados.join('\n'))
  }

  return partes.join('\n\n').trim()
}

function truncar(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}
