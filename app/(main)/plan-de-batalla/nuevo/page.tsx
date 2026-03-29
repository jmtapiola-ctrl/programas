'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { Tooltip } from '@/components/ui/Tooltip'
import type { Objetivo, Usuario } from '@/lib/types'

export default function NuevoPBPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const userId = (session?.user as any)?.id

  const [loading, setLoading] = useState(false)
  const [objetivos, setObjetivos] = useState<Objetivo[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [selectedObjetivos, setSelectedObjetivos] = useState<string[]>([])
  const [form, setForm] = useState({
    titulo: '',
    periodo: 'Día' as 'Día' | 'Semana',
    fecha: new Date().toISOString().split('T')[0],
    estado: 'Borrador' as 'Borrador' | 'Activo' | 'Completado',
    responsableId: '',
    notas: '',
  })

  // Derive responsableId from userId (session may arrive after first render)
  const responsableId = form.responsableId || userId || ''

  useEffect(() => {
    Promise.all([
      fetch('/api/airtable/tbl9ljCeFDMeCsbAT').then(r => r.json()),
      fetch('/api/airtable/tblXhgSBuh0f1BNPV').then(r => r.json()),
    ]).then(([od, ud]) => {
      setObjetivos((od.records ?? []).map((r: any): Objetivo => ({
        id: r.id,
        nombre: r.fields['Nombre'] ?? '',
        tipo: r.fields['Tipo']?.name ?? r.fields['Tipo'] ?? 'Operativo',
        programaIds: r.fields['Programa'] ?? [],
        responsableId: r.fields['Responsable']?.[0] ?? '',
        estado: r.fields['Estado']?.name ?? r.fields['Estado'] ?? 'No iniciado',
        descripcionDoingness: r.fields['Descripcion Doingness'] ?? '',
        esRepetible: r.fields['Es Repetible'] ?? false,
        pbIds: r.fields['PB'] ?? [],
        cumplimientoIds: r.fields['Cumplimientos'] ?? [],
        logIds: r.fields['Log de objetivos'] ?? [],
      })).filter((o: Objetivo) => o.estado !== 'Completado'))

      setUsuarios((ud.records ?? []).map((r: any): Usuario => ({
        id: r.id,
        nombre: r.fields['Nombre'] ?? '',
        email: r.fields['Email'] ?? '',
        rol: r.fields['Rol']?.name ?? r.fields['Rol'] ?? 'Operador',
        activo: r.fields['Activo'] ?? false,
      })).filter((u: Usuario) => u.activo))
    }).catch(() => {})
  }, [])

  function toggleObjetivo(id: string) {
    setSelectedObjetivos(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const fields: Record<string, any> = {
      'Titulo': form.titulo,
      'Periodo': form.periodo,
      'Estado': form.estado,
    }
    if (form.fecha) fields['Fecha'] = form.fecha
    if (responsableId) fields['Responsable'] = [responsableId]
    if (selectedObjetivos.length) fields['Objetivos Incluidos'] = selectedObjetivos
    if (form.notas) fields['Notas'] = form.notas

    const res = await fetch('/api/airtable/tbliUTM4zaoyztD6O', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })

    setLoading(false)
    if (res.ok) {
      const data = await res.json()
      router.push(`/plan-de-batalla/${data.id}`)
    }
  }

  const tipoColor: Record<string, string> = {
    'Primario': 'text-blue-400',
    'Vital': 'text-red-400',
    'Condicional': 'text-yellow-400',
    'Operativo': 'text-orange-400',
    'Producción': 'text-green-400',
    'Mayor': 'text-purple-400',
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-white">Nuevo Plan de Batalla</h1>
          <Tooltip texto="Una lista de objetivos para el día o la semana siguiente, que ayudan al avance de la planificación estratégica, y se ocupan de las acciones inmediatas y de los puntos fuera que la estorban." />
        </div>
        <p className="text-gray-400 text-sm mt-1">Objetivos del día/semana que implementan el plan estratégico</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-5">
          <Input
            label="Título *"
            value={form.titulo}
            onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
            placeholder="Ej: PB Semana 13 — Expansión"
            required
          />

          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Período"
              value={form.periodo}
              onChange={e => setForm(f => ({ ...f, periodo: e.target.value as any }))}
            >
              <option>Día</option>
              <option>Semana</option>
            </Select>
            <Input
              label="Fecha"
              type="date"
              value={form.fecha}
              onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
            />
            <Select
              label="Estado"
              value={form.estado}
              onChange={e => setForm(f => ({ ...f, estado: e.target.value as any }))}
            >
              <option>Borrador</option>
              <option>Activo</option>
            </Select>
          </div>

          <Select
            label="Responsable"
            value={responsableId}
            onChange={e => setForm(f => ({ ...f, responsableId: e.target.value }))}
          >
            <option value="">Sin asignar</option>
            {usuarios.map(u => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </Select>

          <Textarea
            label="Notas"
            value={form.notas}
            onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
            placeholder="Instrucciones, contexto..."
          />
        </div>

        {/* Selector de objetivos */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
          <h2 className="font-medium text-gray-200 mb-3">
            Objetivos a incluir ({selectedObjetivos.length} seleccionados)
          </h2>
          {objetivos.length === 0 ? (
            <p className="text-gray-500 text-sm">No hay objetivos disponibles.</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {objetivos.map(o => (
                <label
                  key={o.id}
                  className={`flex items-center gap-3 p-2.5 rounded-md cursor-pointer transition-colors ${
                    selectedObjetivos.includes(o.id) ? 'bg-blue-900/30 border border-blue-800' : 'hover:bg-gray-700 border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedObjetivos.includes(o.id)}
                    onChange={() => toggleObjetivo(o.id)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600"
                  />
                  <span className={`text-xs font-medium ${tipoColor[o.tipo] ?? 'text-gray-400'}`}>{o.tipo}</span>
                  <span className="text-sm text-gray-200 flex-1">{o.nombre}</span>
                  <span className="text-xs text-gray-500">{o.estado}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <Button type="submit" loading={loading}>Crear Plan de Batalla</Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancelar</Button>
        </div>
      </form>
    </div>
  )
}
