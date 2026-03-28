'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { PlanDeBatallaView } from '@/components/pb/PlanDeBatallaView'
import type { PlanDeBatalla, Objetivo, Usuario } from '@/lib/types'

export default function PBDetailPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession()
  const userId = (session?.user as any)?.id

  const [pb, setPb] = useState<PlanDeBatalla | null>(null)
  const [objetivos, setObjetivos] = useState<Objetivo[]>([])
  const [responsables, setResponsables] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const pbRes = await fetch(`/api/airtable/tbliUTM4zaoyztD6O/${params.id}`)
      const pbData = await pbRes.json()

      const plan: PlanDeBatalla = {
        id: pbData.id,
        titulo: pbData.fields['Titulo'] ?? '',
        responsableIds: pbData.fields['Responsable'] ?? [],
        periodo: pbData.fields['Periodo']?.name ?? pbData.fields['Periodo'] ?? 'Día',
        fecha: pbData.fields['Fecha'],
        estado: pbData.fields['Estado']?.name ?? pbData.fields['Estado'] ?? 'Borrador',
        objetivosIncluidosIds: pbData.fields['Objetivos Incluidos'] ?? [],
        notas: pbData.fields['Notas'],
      }
      setPb(plan)

      if (plan.objetivosIncluidosIds.length > 0) {
        const objRes = await fetch('/api/airtable/tbl9ljCeFDMeCsbAT')
        const objData = await objRes.json()
        const allObjs: Objetivo[] = (objData.records ?? []).map((r: any): Objetivo => ({
          id: r.id,
          nombre: r.fields['Nombre'] ?? '',
          tipo: r.fields['Tipo']?.name ?? r.fields['Tipo'] ?? 'Operativo',
          programaIds: r.fields['Programa'] ?? [],
          responsableIds: r.fields['Responsable'] ?? [],
          estado: r.fields['Estado']?.name ?? r.fields['Estado'] ?? 'Pendiente',
          esRepetible: r.fields['Es Repetible'] ?? false,
          pbIds: [],
          cumplimientoIds: [],
        }))
        setObjetivos(allObjs.filter(o => plan.objetivosIncluidosIds.includes(o.id)))
      }

      if (plan.responsableIds.length > 0) {
        const usersRes = await fetch('/api/airtable/tblXhgSBuh0f1BNPV')
        const usersData = await usersRes.json()
        const allUsers: Usuario[] = (usersData.records ?? []).map((r: any) => ({
          id: r.id,
          nombre: r.fields['Nombre'] ?? '',
          email: r.fields['Email'] ?? '',
          rol: r.fields['Rol']?.name ?? r.fields['Rol'] ?? 'Staff',
          activo: r.fields['Activo'] ?? false,
        }))
        setResponsables(allUsers.filter(u => plan.responsableIds.includes(u.id)))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { load() }, [load])

  async function handleCumplirObjetivo(objetivoId: string) {
    if (!userId) return

    await fetch('/api/airtable/tblTbB0eYz3xsdyNk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          'Objetivo': [objetivoId],
          'Reportado Por': [userId],
          'Fecha': new Date().toISOString().split('T')[0],
        }
      }),
    })

    const obj = objetivos.find(o => o.id === objetivoId)
    const nuevoEstado = obj?.esRepetible ? 'Pendiente' : 'Cumplido'

    await fetch(`/api/airtable/tbl9ljCeFDMeCsbAT/${objetivoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Estado': nuevoEstado } }),
    })

    await load()
  }

  async function handleCambiarEstado(estado: PlanDeBatalla['estado']) {
    if (!pb) return
    await fetch(`/api/airtable/tbliUTM4zaoyztD6O/${pb.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'Estado': estado } }),
    })
    await load()
  }

  if (loading) return <div className="text-gray-400 py-8">Cargando...</div>
  if (!pb) return <div className="text-gray-400 py-8">Plan no encontrado.</div>

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/plan-de-batalla" className="text-gray-400 hover:text-gray-200 text-sm">← Planes de Batalla</Link>
      <PlanDeBatallaView
        pb={pb}
        objetivos={objetivos}
        responsables={responsables}
        onCumplirObjetivo={handleCumplirObjetivo}
        onCambiarEstado={handleCambiarEstado}
      />
    </div>
  )
}
