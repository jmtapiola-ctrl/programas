'use client'

// Página admin genérica: editar cualquier campo del propósito o situación
// directamente. Reusa el endpoint /aplicar-uno con cross_block_meta vacío.
// Registra un warning retroactivo en el audit trail.
//
// Caso de uso típico: el reviewer detectó un conflicto que vive en varios
// campos (escena narrativa + valor_objetivo de una métrica), aplicaste el
// cross-block a un campo pero el otro quedó con el texto viejo. Esta página
// te permite editar el campo que queda directamente.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface CampoEditable {
  path: string
  label: string
  value: string
}

function agruparCampos(campos: CampoEditable[]): Array<{ grupo: string; items: CampoEditable[] }> {
  const grupos = new Map<string, CampoEditable[]>()
  function add(grupo: string, c: CampoEditable) {
    const arr = grupos.get(grupo) ?? []
    arr.push(c)
    grupos.set(grupo, arr)
  }
  for (const c of campos) {
    if (c.path === 'proposito.escena') add('Propósito · Texto principal', c)
    else if (c.path === 'proposito.horizonte' || c.path === 'proposito.estabilidad') add('Propósito · Texto principal', c)
    else if (c.path.startsWith('proposito.metricas')) add('Propósito · Métricas', c)
    else if (c.path.startsWith('proposito.fuera')) add('Propósito · Fuera de scope', c)
    else if (c.path === 'situacion.desvio_principal' || c.path === 'situacion.desvio_cuantificado' || c.path === 'situacion.causa_raiz') add('Situación · Desvío y causa', c)
    else if (c.path.startsWith('situacion.consecuencia')) add('Situación · Consecuencias de no actuar', c)
    else if (c.path.startsWith('situacion.recursos') || c.path === 'situacion.intentos_previos') add('Situación · Recursos e intentos', c)
    else if (c.path.startsWith('situacion.desvios_secundarios')) add('Situación · Desvíos secundarios', c)
    else if (c.path.startsWith('situacion.resistencias')) add('Situación · Resistencias y amenazas', c)
    else add('Otros', c)
  }
  return Array.from(grupos.entries()).map(([grupo, items]) => ({ grupo, items }))
}

export default function EditarCamposPlanPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [campos, setCampos] = useState<CampoEditable[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState('')
  const [editableTexto, setEditableTexto] = useState('')
  const [running, setRunning] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null)

  useEffect(() => {
    if (!id) return
    let abortado = false
    fetch(`/api/planes-estrategicos/${id}/admin/aplicar-cross-block-pendientes/campos`)
      .then(r => r.json())
      .then(data => {
        if (abortado) return
        if (!data?.ok) { setLoadError(data?.error ?? 'Error cargando campos'); return }
        setCampos(data.campos ?? [])
      })
      .catch(e => { if (!abortado) setLoadError(`Error: ${e?.message ?? String(e)}`) })
    return () => { abortado = true }
  }, [id])

  // Cuando cambia el path seleccionado, pre-poblar el textarea con el valor
  // actual del campo. Si el user lo modificó, se conserva — solo arranca con
  // el valor actual al seleccionar.
  useEffect(() => {
    if (!selectedPath || !campos) {
      setEditableTexto('')
      return
    }
    const c = campos.find(c => c.path === selectedPath)
    setEditableTexto(c?.value ?? '')
    setResultado(null)
  }, [selectedPath, campos])

  async function aplicar() {
    if (!id || running || !selectedPath || !editableTexto.trim()) return
    setRunning(true)
    setResultado(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${id}/admin/aplicar-cross-block-pendientes/aplicar-uno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_path: selectedPath,
          texto_a_aplicar: editableTexto.trim(),
          cross_block_meta: {
            id: '(editor manual)',
            bloque_afectado: selectedPath.startsWith('situacion') ? 2 : 1,
            seccion_afectada: 'Edición manual vía editor de campos',
            severidad: 'Media',
          },
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setResultado({ ok: false, mensaje: data?.error ?? `HTTP ${res.status}` })
      } else {
        // Refrescar el campo en local state.
        setCampos(prev => prev?.map(c => c.path === selectedPath ? { ...c, value: data.valor_nuevo } : c) ?? null)
        setResultado({ ok: true, mensaje: `OK — "${selectedPath}" actualizado. Warning retroactivo registrado.` })
      }
    } catch (e) {
      setResultado({ ok: false, mensaje: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunning(false)
    }
  }

  if (loadError) {
    return <div className="min-h-screen bg-background p-8"><div className="max-w-3xl mx-auto"><p className="text-[14px] text-red-300">{loadError}</p></div></div>
  }
  if (!campos) {
    return <div className="min-h-screen bg-background p-8"><div className="max-w-3xl mx-auto"><p className="text-[13px] text-muted-foreground">Cargando campos del plan…</p></div></div>
  }

  const valorActual = selectedPath ? (campos.find(c => c.path === selectedPath)?.value ?? '') : ''
  const cambioPendiente = selectedPath && editableTexto.trim() !== valorActual.trim()

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <header className="space-y-2">
          <h1 className="text-[20px] font-bold text-foreground">Editor manual de campos del plan</h1>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Editá directamente cualquier campo del propósito o situación. Cada cambio registra un warning retroactivo en <code>plan.warnings_retroactivos</code> como audit trail. Útil cuando un cross-block detectó un conflicto que vive en varios campos (escena narrativa + métrica) y aplicaste solo en uno.
          </p>
        </header>

        <section className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-amber-300/90 mb-1">
              Elegí el campo a editar
            </label>
            <select
              value={selectedPath}
              onChange={e => setSelectedPath(e.target.value)}
              className="w-full rounded border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-[13px] text-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">— Seleccioná un campo —</option>
              {agruparCampos(campos).map(g => (
                <optgroup key={g.grupo} label={g.grupo}>
                  {g.items.map(c => (
                    <option key={c.path} value={c.path}>{c.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {selectedPath && (
            <>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1">Valor actual</p>
                <p className="text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap rounded border border-sidebar-border bg-background/40 px-3 py-2 italic">
                  {valorActual || '(vacío)'}
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-emerald-300/90 mb-1">
                  Nuevo valor (pre-poblado con el actual)
                </label>
                <textarea
                  value={editableTexto}
                  onChange={e => setEditableTexto(e.target.value)}
                  rows={10}
                  className="w-full resize-y rounded border border-emerald-700/40 bg-emerald-950/20 px-3 py-2 text-[13px] text-emerald-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                {cambioPendiente && (
                  <p className="mt-1 text-[11px] text-amber-200/80 italic">El texto fue modificado — al aplicar se persiste como nuevo valor del campo.</p>
                )}
              </div>

              <button
                onClick={aplicar}
                disabled={running || !cambioPendiente}
                className="rounded-md bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {running ? 'Aplicando…' : 'Aplicar cambio al campo'}
              </button>
            </>
          )}
        </section>

        {resultado && (
          <section className={`rounded-lg border px-4 py-3 ${resultado.ok ? 'border-green-700/40 bg-green-950/20' : 'border-red-700/40 bg-red-950/20'}`}>
            <p className={`text-[13px] ${resultado.ok ? 'text-green-200' : 'text-red-200'}`}>
              <span className="font-semibold">{resultado.ok ? '✓' : '✗'}</span> {resultado.mensaje}
            </p>
            {resultado.ok && (
              <p className="mt-2 text-[12px] text-green-200/85 leading-relaxed">
                Refrescá <code>/vista</code> para verificar. Podés seguir editando otros campos del mismo dropdown.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
