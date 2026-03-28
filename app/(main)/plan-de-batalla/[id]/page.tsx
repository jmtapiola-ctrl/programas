'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PlanDeBatallaView } from '@/components/pb/PlanDeBatallaView'
import type { PlanDeBatalla, Objetivo, Usuario } from '@/lib/types'

export default function PBDetailPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession()
  const userId = (session?.user as any)?.id
  const router = useRouter()

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
        titulo: pbData.fields['fldUdkIDSJ5bpkWQ1'] ?? '',
        responsableIds: pbData.fields['fldyGJqVjj9gGYCY4'] ?? [],
        periodo: pbData.fields['fldhCdfSUagl3qWvg'] ?? 'Día',
        fecha: pbData.fields['flduXU9YPEnp04XvA'],
        estado: pbData.fields['fldyxNXiYbvSM1Ngb'] ?? 'Borrador',
        objetivosIncluidosIds: pbData.fields['fldi9AIteXA9P4gp4'] ?? [],
        notas: pbData.fields['fldtZNjSntLLyPYlf'],
      }
      setPb(plan)

      if (plan.objetivosIncluidosIds.length > 0) {
        const objRes = await fetch('/api/airtable/tbl9ljCeFDMeCsbAT')
        const objData = await objRes.json()
        const allObjs: Objetivo[] = (objData.records ?? []).map((r: any): Objetivo => ({
          id: r.id,
          nombre: r.fields['fldoAaiHZ0wE8skdB'] ?? '',
          tipo: r.fields['fld3P1VeDX9ierG8i'] ?? 'Operativo',
          programaIds: r.fields['fldVwyD7NNocHhORP'] ?? [],
          responsableIds: r.fields['fldcG10p89bDRUU0X'] ?? [],
          estado: r.fields['flddQzgB28scsTuLu'] ?? 'Pendiente',
          esRepetible: r.fields['fld0BCz0UMO7K5wCn'] ?? false,
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
          nombre: r.fields['fldFbWbFkhxmr7hRf'] ?? '',
          email: r.fields['fld0IIhsqQw2yny1Z'] ?? '',
          rol: r.fields['fldbVYb9q3OTbmlYR'] ?? 'Staff',
          activo: r.fields['fldtHzaYrxVt1e8q3'] ?? false,
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
          'fldXcu6A5QKwABMtf': [objetivoId],
          'fldb3G45AIdA6YdZ7': [userId],
          'fld8GA6aFyu09Ofp5': new Date().toISOString().split('T')[0],
        }
      }),
    })

    const obj = objetivos.find(o => o.id === objetivoId)
    const nuevoEstado = obj?.esRepetible ? 'Pendiente' : 'Cumplido'

    await fetch(`/api/airtable/tbl9ljCeFDMeCsbAT?id=${objetivoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'flddQzgB28scsTuLu': nuevoEstado } }),
    })

    await load()
  }

  async function handleCambiarEstado(estado: PlanDeBatalla['estado']) {
    if (!pb) return
    await fetch(`/api/airtable/tbliUTM4zaoyztD6O?id=${pb.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { 'fldyxNXiYbvSM1Ngb': estado } }),
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
