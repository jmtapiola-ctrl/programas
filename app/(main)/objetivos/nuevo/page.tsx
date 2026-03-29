'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { Tooltip } from '@/components/ui/Tooltip'
import type { Usuario, Programa } from '@/lib/types'

const DEFINICIONES_TIPO: Record<string, string> = {
  'Primario': 'Los objetivos del tipo de organización, de personal y de comunicaciones. Estos deben mantenerse.',
  'Vital': 'Por definición, un objetivo VITAL es algo que debe hacerse para funcionar en medida alguna.',
  'Condicional': 'Aquellos que se establecen como O BIEN… O, para averiguar información o si un proyecto puede hacerse, o dónde o a quién.',
  'Operativo': 'Aquellos que establecen direcciones y acciones o un calendario de eventos e itinerario.',
  'Producción': 'Aquellos que establecen cantidades como estadísticas.',
  'Mayor': 'La aspiración general y amplia, que posiblemente abarca un período de tiempo largo y aproximado.',
}

export default function NuevoObjetivoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const programaIdParam = searchParams.get('programaId') ?? ''

  const [loading, setLoading] = useState(false)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [programas, setProgramas] = useState<Programa[]>([])
  const [doignessError, setDoignessError] = useState('')
  const [form, setForm] = useState({
    nombre: '',
    tipo: 'Operativo',
    programaId: programaIdParam,
    responsableId: '',
    estado: 'Pendiente' as const,
    fechaLimite: '',
    descripcionDoingness: '',
    esRepetible: false,
    orden: '',
    notas: '',
  })

  useEffect(() => {
    Promise.all([
      fetch('/api/airtable/tblXhgSBuh0f1BNPV').then(r => r.json()),
      fetch('/api/airtable/tbld952MAM0ApHqT0').then(r => r.json()),
    ]).then(([ud, pd]) => {
      setUsuarios((ud.records ?? []).map((r: any) => ({
        id: r.id,
        nombre: r.fields['Nombre'] ?? '',
        email: r.fields['Email'] ?? '',
        rol: r.fields['Rol']?.name ?? r.fields['Rol'] ?? 'Staff',
        activo: r.fields['Activo'] ?? false,
      })).filter((u: Usuario) => u.activo))
      setProgramas((pd.records ?? []).map((r: any) => ({
        id: r.id,
        nombre: r.fields['Nombre'] ?? '',
        estado: r.fields['Estado']?.name ?? r.fields['Estado'] ?? 'Borrador',
        responsableIds: r.fields['Responsable'] ?? [],
        objetivoIds: r.fields['Objetivos'] ?? [],
      })))
    }).catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!form.descripcionDoingness.trim()) {
      setDoignessError('Un objetivo sin doingness no es un objetivo. Describí la acción concreta que lo completa.')
      return
    }
    setDoignessError('')
    setLoading(true)

    const fields: Record<string, any> = {
      'Nombre': form.nombre,
      'Tipo': form.tipo,
      'Estado': form.estado,
      'Es Repetible': form.esRepetible,
    }
    if (form.programaId) fields['Programa'] = [form.programaId]
    if (form.responsableId) fields['Responsable'] = [form.responsableId]
    if (form.fechaLimite) fields['Fecha Limite'] = form.fechaLimite
    if (form.descripcionDoingness) fields['Descripcion Doingness'] = form.descripcionDoingness
    if (form.orden) fields['Orden'] = parseInt(form.orden)
    if (form.notas) fields['Notas'] = form.notas

    const res = await fetch('/api/airtable/tbl9ljCeFDMeCsbAT', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })

    setLoading(false)
    if (res.ok) {
      const data = await res.json()
      if (form.programaId) {
        router.push(`/programas/${form.programaId}`)
      } else {
        router.push(`/objetivos/${data.id}`)
      }
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Nuevo Objetivo</h1>
        <p className="text-gray-400 text-sm mt-1">Todo objetivo debe ser terminable, realizable y completable</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-5">
        <Input
          label="Nombre del Objetivo *"
          value={form.nombre}
          onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
          placeholder="Ej: Completar informe mensual"
          required
        />

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Descripción de Doingness *</label>
          <textarea
            value={form.descripcionDoingness}
            onChange={e => {
              setForm(f => ({ ...f, descripcionDoingness: e.target.value }))
              if (e.target.value.trim()) setDoignessError('')
            }}
            rows={4}
            placeholder={"¿Cuándo está HECHO este objetivo?\nDescribí la acción concreta y terminable."}
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          {doignessError && (
            <p className="text-red-400 text-xs mt-1">{doignessError}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="block text-sm font-medium text-gray-300">Tipo</label>
              {form.tipo && DEFINICIONES_TIPO[form.tipo] && (
                <Tooltip texto={DEFINICIONES_TIPO[form.tipo]} />
              )}
            </div>
            <select
              value={form.tipo}
              onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option>Primario</option>
              <option>Vital</option>
              <option>Condicional</option>
              <option>Operativo</option>
              <option>Producción</option>
              <option>Mayor</option>
            </select>
          </div>

          <Select
            label="Estado"
            value={form.estado}
            onChange={e => setForm(f => ({ ...f, estado: e.target.value as any }))}
          >
            <option>Pendiente</option>
            <option>En curso</option>
            <option>Cumplido</option>
            <option>Incumplido</option>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Programa"
            value={form.programaId}
            onChange={e => setForm(f => ({ ...f, programaId: e.target.value }))}
          >
            <option value="">Sin programa</option>
            {programas.map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </Select>

          <Select
            label="Responsable"
            value={form.responsableId}
            onChange={e => setForm(f => ({ ...f, responsableId: e.target.value }))}
          >
            <option value="">Sin asignar</option>
            {usuarios.map(u => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Fecha Límite"
            type="date"
            value={form.fechaLimite}
            onChange={e => setForm(f => ({ ...f, fechaLimite: e.target.value }))}
          />
          <Input
            label="Orden"
            type="number"
            value={form.orden}
            onChange={e => setForm(f => ({ ...f, orden: e.target.value }))}
            placeholder="1, 2, 3..."
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="esRepetible"
            checked={form.esRepetible}
            onChange={e => setForm(f => ({ ...f, esRepetible: e.target.checked }))}
            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="esRepetible" className="text-sm text-gray-300">
            Es Repetible (al cumplirse vuelve a Pendiente)
          </label>
        </div>

        <Textarea
          label="Notas"
          value={form.notas}
          onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
          placeholder="Notas adicionales..."
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={loading}>Crear Objetivo</Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancelar</Button>
        </div>
      </form>
    </div>
  )
}
