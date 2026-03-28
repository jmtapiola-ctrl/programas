'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import type { Usuario } from '@/lib/types'

export default function NuevoProgramaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    objetivoMayor: '',
    estado: 'Borrador' as const,
    responsableId: '',
    fechaInicio: '',
    fechaObjetivo: '',
    notas: '',
  })

  useEffect(() => {
    fetch('/api/airtable/tblXhgSBuh0f1BNPV')
      .then(r => r.json())
      .then(d => {
        const users = (d.records ?? []).map((r: any) => ({
          id: r.id,
          nombre: r.fields['fldFbWbFkhxmr7hRf'] ?? '',
          email: r.fields['fld0IIhsqQw2yny1Z'] ?? '',
          rol: r.fields['fldbVYb9q3OTbmlYR'] ?? 'Staff',
          activo: r.fields['fldtHzaYrxVt1e8q3'] ?? false,
        }))
        setUsuarios(users.filter((u: Usuario) => u.activo))
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const fields: Record<string, any> = {
      'fldrTj1ggeu12uVKu': form.nombre,
      'fldCNL2ZzxXfmM1KH': form.estado,
    }
    if (form.descripcion) fields['fldlv4tR7tMoMMFZC'] = form.descripcion
    if (form.objetivoMayor) fields['fldQuyth3IWcNzZ9g'] = form.objetivoMayor
    if (form.responsableId) fields['fldHbc6OhAkKF1iMC'] = [form.responsableId]
    if (form.fechaInicio) fields['fldxG2voOTeZGdXeM'] = form.fechaInicio
    if (form.fechaObjetivo) fields['fld8fgmt8NGWj21oe'] = form.fechaObjetivo
    if (form.notas) fields['fldjEen4uHIVABGPZ'] = form.notas

    const res = await fetch('/api/airtable/tbld952MAM0ApHqT0', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })

    setLoading(false)
    if (res.ok) {
      const data = await res.json()
      router.push(`/programas/${data.id}`)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Nuevo Programa</h1>
        <p className="text-gray-400 text-sm mt-1">Creá un nuevo programa de objetivos</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-5">
        <Input
          label="Nombre del Programa *"
          value={form.nombre}
          onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
          placeholder="Ej: Expansión Q1 2026"
          required
        />

        <Textarea
          label="Descripción"
          value={form.descripcion}
          onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
          placeholder="Descripción general del programa..."
        />

        <Textarea
          label="Objetivo Mayor"
          value={form.objetivoMayor}
          onChange={e => setForm(f => ({ ...f, objetivoMayor: e.target.value }))}
          placeholder="El gran objetivo que este programa debe lograr..."
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Estado"
            value={form.estado}
            onChange={e => setForm(f => ({ ...f, estado: e.target.value as any }))}
          >
            <option>Borrador</option>
            <option>Activo</option>
            <option>Completado</option>
            <option>Archivado</option>
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
            label="Fecha Inicio"
            type="date"
            value={form.fechaInicio}
            onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))}
          />
          <Input
            label="Fecha Objetivo"
            type="date"
            value={form.fechaObjetivo}
            onChange={e => setForm(f => ({ ...f, fechaObjetivo: e.target.value }))}
          />
        </div>

        <Textarea
          label="Notas"
          value={form.notas}
          onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
          placeholder="Notas adicionales..."
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={loading}>Crear Programa</Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancelar</Button>
        </div>
      </form>
    </div>
  )
}
