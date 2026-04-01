import type {
  Usuario,
  Programa,
  Objetivo,
  Cumplimiento,
  LogEvento,
  PlanDeBatalla,
} from './types'

const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`
const API_KEY = process.env.AIRTABLE_API_KEY

function headers() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  }
}

async function fetchAll(table: string, params?: string): Promise<any[]> {
  const records: any[] = []
  let offset: string | undefined

  do {
    let url = `${BASE_URL}/${table}?pageSize=100`
    if (params) url += `&${params}`
    if (offset) url += `&offset=${offset}`

    const res = await fetch(url, { headers: headers(), cache: 'no-store' })
    if (!res.ok) throw new Error(`Airtable error: ${res.status} ${await res.text()}`)
    const data = await res.json()
    records.push(...data.records)
    offset = data.offset
  } while (offset)

  return records
}

async function fetchOne(table: string, id: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/${table}/${id}`, {
    headers: headers(),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Airtable error: ${res.status}`)
  return res.json()
}

async function createRecord(table: string, fields: Record<string, any>): Promise<any> {
  const res = await fetch(`${BASE_URL}/${table}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) throw new Error(`Airtable error: ${res.status} ${await res.text()}`)
  return res.json()
}

async function updateRecord(table: string, id: string, fields: Record<string, any>): Promise<any> {
  const res = await fetch(`${BASE_URL}/${table}/${id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) throw new Error(`Airtable error: ${res.status} ${await res.text()}`)
  return res.json()
}

async function deleteRecord(table: string, id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/${table}/${id}`, {
    method: 'DELETE',
    headers: headers(),
  })
  if (!res.ok) throw new Error(`Airtable error: ${res.status}`)
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapUsuario(r: any): Usuario {
  return {
    id: r.id,
    nombre: r.fields['Nombre'] ?? '',
    email: r.fields['Email'] ?? '',
    rol: r.fields['Rol']?.name ?? r.fields['Rol'] ?? 'Operador',
    activo: r.fields['Activo'] ?? false,
  }
}

function mapPrograma(r: any): Programa {
  return {
    id: r.id,
    nombre: r.fields['Nombre'] ?? '',
    situacion: r.fields['Situacion'],
    descripcion: r.fields['Descripcion'],
    proposito: r.fields['Proposito'],
    objetivoMayor: r.fields['Objetivo Mayor'],
    estado: r.fields['Estado']?.name ?? r.fields['Estado'] ?? 'Borrador',
    responsableIds: r.fields['Responsable'] ?? [],
    aprobadorId: r.fields['Aprobador']?.[0] ?? undefined,
    fechaInicio: r.fields['Fecha Inicio'],
    fechaObjetivo: r.fields['Fecha Objetivo'],
    notas: r.fields['Notas'],
    objetivoIds: r.fields['Objetivos'] ?? [],
    resumenEjecutivo: r.fields['Resumen Ejecutivo'] ?? undefined,
  }
}

function mapObjetivo(r: any): Objetivo {
  return {
    id: r.id,
    nombre: r.fields['Nombre'] ?? '',
    tipo: r.fields['Tipo']?.name ?? r.fields['Tipo'] ?? 'Operativo',
    programaIds: r.fields['Programa'] ?? [],
    responsableId: r.fields['Responsable']?.[0] ?? '',
    aprobadorId: r.fields['Aprobador']?.[0] ?? undefined,
    estado: r.fields['Estado']?.name ?? r.fields['Estado'] ?? 'No iniciado',
    fechaInicioReal: r.fields['Fecha inicio real'],
    fechaCumplimientoReportado: r.fields['Fecha Cumplimiento Reportado'],
    fechaLimite: r.fields['Fecha Limite'],
    descripcionDoingness: r.fields['Descripcion Doingness'] ?? '',
    esRepetible: r.fields['Es Repetible'] ?? false,
    esCondicional: r.fields['Es Condicional'] as boolean ?? false,
    orden: r.fields['Orden'],
    notas: r.fields['Notas'],
    pbIds: r.fields['PB'] ?? [],
    cumplimientoIds: r.fields['Cumplimientos'] ?? [],
    logIds: r.fields['Log de objetivos'] ?? [],
  }
}

function mapCumplimiento(r: any): Cumplimiento {
  return {
    id: r.id,
    cumplimiento: r.fields['Cumplimiento'],
    objetivoIds: r.fields['Objetivo'] ?? [],
    reportadoPorId: r.fields['Reportado Por']?.[0] ?? '',
    aprobadoPorId: r.fields['Aprobado por']?.[0] ?? undefined,
    fecha: r.fields['Fecha'],
    rechazado: r.fields['Rechazado'] ?? false,
    motivoRechazo: r.fields['Motivo rechazo'],
    descripcionCumplimiento: r.fields['Descripcion del Cumplimiento'],
    aprobado: r.fields['Aprobado'] ?? false,
  }
}

function mapLogEvento(r: any): LogEvento {
  return {
    id: r.id,
    nombre: r.fields['Nombre'],
    objetivoIds: r.fields['Objetivo'] ?? [],
    tipoEvento: r.fields['Tipo Evento']?.name ?? r.fields['Tipo Evento'] ?? '',
    usuarioId: r.fields['Usuario']?.[0] ?? '',
    fechaYHora: r.fields['Fecha y Hora'],
    notas: r.fields['Notas'],
  }
}

function mapPB(r: any): PlanDeBatalla {
  return {
    id: r.id,
    titulo: r.fields['Titulo'] ?? '',
    responsableIds: r.fields['Responsable'] ?? [],
    periodo: r.fields['Periodo']?.name ?? r.fields['Periodo'] ?? 'Día',
    fecha: r.fields['Fecha'],
    estado: r.fields['Estado']?.name ?? r.fields['Estado'] ?? 'Borrador',
    objetivosIncluidosIds: r.fields['Objetivos Incluidos'] ?? [],
    notas: r.fields['Notas'],
  }
}

// ─── Usuarios ─────────────────────────────────────────────────────────────────

export const TABLA_USUARIOS = 'tblXhgSBuh0f1BNPV'

export async function getUsuarios(): Promise<Usuario[]> {
  const records = await fetchAll(TABLA_USUARIOS)
  return records.map(mapUsuario)
}

export async function getUsuario(id: string): Promise<Usuario> {
  const r = await fetchOne(TABLA_USUARIOS, id)
  return mapUsuario(r)
}

export async function getUsuarioByEmail(email: string): Promise<Usuario | null> {
  const formula = encodeURIComponent(`{Email}="${email}"`)
  const records = await fetchAll(TABLA_USUARIOS, `filterByFormula=${formula}`)
  if (!records.length) return null
  return mapUsuario(records[0])
}

export async function createUsuario(data: Partial<Usuario>): Promise<Usuario> {
  const fields: Record<string, any> = {}
  if (data.nombre) fields['Nombre'] = data.nombre
  if (data.email) fields['Email'] = data.email
  if (data.rol) fields['Rol'] = data.rol
  if (data.activo !== undefined) fields['Activo'] = data.activo
  const r = await createRecord(TABLA_USUARIOS, fields)
  return mapUsuario(r)
}

export async function updateUsuario(id: string, data: Partial<Usuario>): Promise<Usuario> {
  const fields: Record<string, any> = {}
  if (data.nombre !== undefined) fields['Nombre'] = data.nombre
  if (data.email !== undefined) fields['Email'] = data.email
  if (data.rol !== undefined) fields['Rol'] = data.rol
  if (data.activo !== undefined) fields['Activo'] = data.activo
  const r = await updateRecord(TABLA_USUARIOS, id, fields)
  return mapUsuario(r)
}

// ─── Programas ────────────────────────────────────────────────────────────────

export const TABLA_PROGRAMAS = 'tbld952MAM0ApHqT0'

export async function getProgramas(): Promise<Programa[]> {
  const records = await fetchAll(TABLA_PROGRAMAS)
  return records.map(mapPrograma)
}

export async function getPrograma(id: string): Promise<Programa> {
  const r = await fetchOne(TABLA_PROGRAMAS, id)
  return mapPrograma(r)
}

export async function createPrograma(data: Partial<Programa>): Promise<Programa> {
  const fields: Record<string, any> = {}
  if (data.nombre) fields['Nombre'] = data.nombre
  if (data.situacion) fields['Situacion'] = data.situacion
  if (data.descripcion) fields['Descripcion'] = data.descripcion
  if (data.proposito) fields['Proposito'] = data.proposito
  if (data.objetivoMayor) fields['Objetivo Mayor'] = data.objetivoMayor
  if (data.estado) fields['Estado'] = data.estado
  if (data.responsableIds?.length) fields['Responsable'] = data.responsableIds
  if (data.aprobadorId) fields['Aprobador'] = [data.aprobadorId]
  if (data.fechaInicio) fields['Fecha Inicio'] = data.fechaInicio
  if (data.fechaObjetivo) fields['Fecha Objetivo'] = data.fechaObjetivo
  if (data.notas) fields['Notas'] = data.notas
  const r = await createRecord(TABLA_PROGRAMAS, fields)
  return mapPrograma(r)
}

export async function updatePrograma(id: string, data: Partial<Programa>): Promise<Programa> {
  const fields: Record<string, any> = {}
  if (data.nombre !== undefined) fields['Nombre'] = data.nombre
  if (data.situacion !== undefined) fields['Situacion'] = data.situacion
  if (data.descripcion !== undefined) fields['Descripcion'] = data.descripcion
  if (data.proposito !== undefined) fields['Proposito'] = data.proposito
  if (data.objetivoMayor !== undefined) fields['Objetivo Mayor'] = data.objetivoMayor
  if (data.estado !== undefined) fields['Estado'] = data.estado
  if (data.responsableIds !== undefined) fields['Responsable'] = data.responsableIds
  if (data.aprobadorId !== undefined) fields['Aprobador'] = data.aprobadorId ? [data.aprobadorId] : []
  if (data.fechaInicio !== undefined) fields['Fecha Inicio'] = data.fechaInicio
  if (data.fechaObjetivo !== undefined) fields['Fecha Objetivo'] = data.fechaObjetivo
  if (data.notas !== undefined) fields['Notas'] = data.notas
  if (data.resumenEjecutivo !== undefined) fields['Resumen Ejecutivo'] = data.resumenEjecutivo
  const r = await updateRecord(TABLA_PROGRAMAS, id, fields)
  return mapPrograma(r)
}

export async function deletePrograma(id: string): Promise<void> {
  await deleteRecord(TABLA_PROGRAMAS, id)
}

export async function getProgramasByResponsable(usuarioId: string): Promise<Programa[]> {
  // ARRAYJOIN on linked fields returns names, not IDs — filter in memory
  const records = await fetchAll(TABLA_PROGRAMAS, '')
  return records.map(mapPrograma).filter(p => p.responsableIds.includes(usuarioId))
}

export async function getProgramasVisiblesParaUsuario(usuarioId: string): Promise<Programa[]> {
  const comoResponsable = await getProgramasByResponsable(usuarioId)
  const objetivos = await getObjetivosByResponsable(usuarioId)
  const programaIdsDeObjetivos = [...new Set(objetivos.flatMap(o => o.programaIds))]
  const idsYaIncluidos = new Set(comoResponsable.map(p => p.id))
  const programasExtra = await Promise.all(
    programaIdsDeObjetivos
      .filter(id => !idsYaIncluidos.has(id))
      .map(id => getPrograma(id).catch(() => null))
  )
  return [
    ...comoResponsable,
    ...(programasExtra.filter(Boolean) as Programa[]),
  ]
}

// ─── Objetivos ────────────────────────────────────────────────────────────────

export const TABLA_OBJETIVOS = 'tbl9ljCeFDMeCsbAT'

export async function getObjetivos(programaId?: string): Promise<Objetivo[]> {
  // ARRAYJOIN on linked fields returns names, not IDs — filter in memory
  const params = 'sort[0][field]=fldxX3JXMRguaJD2Y&sort[0][direction]=asc'
  const records = await fetchAll(TABLA_OBJETIVOS, params)
  const all = records.map(mapObjetivo)
  if (programaId) {
    return all.filter(o => o.programaIds.includes(programaId))
  }
  return all
}

export async function getObjetivosByResponsable(usuarioId: string): Promise<Objetivo[]> {
  // ARRAYJOIN on linked fields returns names, not IDs — filter in memory
  const params = 'sort[0][field]=fldxX3JXMRguaJD2Y&sort[0][direction]=asc'
  const records = await fetchAll(TABLA_OBJETIVOS, params)
  return records.map(mapObjetivo).filter(o => o.responsableId === usuarioId)
}

export async function getObjetivo(id: string): Promise<Objetivo> {
  const r = await fetchOne(TABLA_OBJETIVOS, id)
  return mapObjetivo(r)
}

export async function createObjetivo(
  data: Partial<Objetivo> & { creadorId: string }
): Promise<Objetivo> {
  const fields: Record<string, any> = {}
  if (data.nombre) fields['Nombre'] = data.nombre
  if (data.tipo) fields['Tipo'] = data.tipo
  if (data.programaIds?.length) fields['Programa'] = data.programaIds
  if (data.responsableId) fields['Responsable'] = [data.responsableId]
  if (data.aprobadorId) fields['Aprobador'] = [data.aprobadorId]
  if (data.fechaLimite) fields['Fecha Limite'] = data.fechaLimite
  if (data.descripcionDoingness) fields['Descripcion Doingness'] = data.descripcionDoingness
  if (data.esRepetible !== undefined) fields['Es Repetible'] = data.esRepetible
  if (data.esCondicional !== undefined) fields['Es Condicional'] = data.esCondicional
  if (data.orden !== undefined) fields['Orden'] = data.orden
  if (data.notas) fields['Notas'] = data.notas
  fields['Estado'] = data.responsableId === data.creadorId ? 'No iniciado' : 'Asignado'
  const r = await createRecord(TABLA_OBJETIVOS, fields)
  return mapObjetivo(r)
}

export async function updateObjetivo(id: string, data: Partial<Objetivo>): Promise<Objetivo> {
  const fields: Record<string, any> = {}
  if (data.nombre !== undefined) fields['Nombre'] = data.nombre
  if (data.tipo !== undefined) fields['Tipo'] = data.tipo
  if (data.programaIds !== undefined) fields['Programa'] = data.programaIds
  if (data.responsableId !== undefined) fields['Responsable'] = data.responsableId ? [data.responsableId] : []
  if (data.aprobadorId !== undefined) fields['Aprobador'] = data.aprobadorId ? [data.aprobadorId] : []
  if (data.estado !== undefined) fields['Estado'] = data.estado
  if (data.fechaInicioReal !== undefined) fields['Fecha inicio real'] = data.fechaInicioReal
  if (data.fechaCumplimientoReportado !== undefined) fields['Fecha Cumplimiento Reportado'] = data.fechaCumplimientoReportado
  if (data.fechaLimite !== undefined) fields['Fecha Limite'] = data.fechaLimite
  if (data.descripcionDoingness !== undefined) fields['Descripcion Doingness'] = data.descripcionDoingness
  if (data.esRepetible !== undefined) fields['Es Repetible'] = data.esRepetible
  if (data.esCondicional !== undefined) fields['Es Condicional'] = data.esCondicional
  if (data.orden !== undefined) fields['Orden'] = data.orden
  if (data.notas !== undefined) fields['Notas'] = data.notas
  const r = await updateRecord(TABLA_OBJETIVOS, id, fields)
  return mapObjetivo(r)
}

export async function deleteObjetivo(id: string): Promise<void> {
  await deleteRecord(TABLA_OBJETIVOS, id)
}

// ─── Cumplimientos ────────────────────────────────────────────────────────────

export const TABLA_CUMPLIMIENTOS = 'tblTbB0eYz3xsdyNk'

export async function getCumplimientos(objetivoId?: string): Promise<Cumplimiento[]> {
  // ARRAYJOIN on linked fields returns names, not IDs — filter in memory
  const params = 'sort[0][field]=fld8GA6aFyu09Ofp5&sort[0][direction]=desc'
  const records = await fetchAll(TABLA_CUMPLIMIENTOS, params)
  const all = records.map(mapCumplimiento)
  if (objetivoId) {
    return all.filter(c => c.objetivoIds.includes(objetivoId))
  }
  return all
}

export async function createCumplimiento(data: Partial<Cumplimiento>): Promise<Cumplimiento> {
  const fields: Record<string, any> = {}
  if (data.objetivoIds?.length) fields['Objetivo'] = data.objetivoIds
  if (data.reportadoPorId) fields['Reportado Por'] = [data.reportadoPorId]
  if (data.fecha) fields['Fecha'] = data.fecha
  if (data.descripcionCumplimiento) fields['Descripcion del Cumplimiento'] = data.descripcionCumplimiento
  fields['Aprobado'] = false
  fields['Rechazado'] = false
  const r = await createRecord(TABLA_CUMPLIMIENTOS, fields)
  return mapCumplimiento(r)
}

export async function updateCumplimiento(id: string, data: Partial<Cumplimiento>): Promise<Cumplimiento> {
  const fields: Record<string, any> = {}
  if (data.aprobado !== undefined) fields['Aprobado'] = data.aprobado
  if (data.descripcionCumplimiento !== undefined) fields['Descripcion del Cumplimiento'] = data.descripcionCumplimiento
  if (data.aprobadoPorId !== undefined) fields['Aprobado por'] = data.aprobadoPorId ? [data.aprobadoPorId] : []
  if (data.rechazado !== undefined) fields['Rechazado'] = data.rechazado
  if (data.motivoRechazo !== undefined) fields['Motivo rechazo'] = data.motivoRechazo
  const r = await updateRecord(TABLA_CUMPLIMIENTOS, id, fields)
  return mapCumplimiento(r)
}

// ─── Log de Objetivos ─────────────────────────────────────────────────────────

export const TABLA_LOG = 'tblX04cxihBvwPs8c'

export async function getLogObjetivo(objetivoId: string): Promise<LogEvento[]> {
  // ARRAYJOIN on linked fields returns names, not IDs — filter in memory
  const params = 'sort[0][field]=fld2MTbzWmFkLoohR&sort[0][direction]=asc'
  const records = await fetchAll(TABLA_LOG, params)
  return records.map(mapLogEvento).filter(e => e.objetivoIds.includes(objetivoId))
}

export async function getAllLogEventos(): Promise<LogEvento[]> {
  const params = 'sort[0][field]=fld2MTbzWmFkLoohR&sort[0][direction]=desc'
  const records = await fetchAll(TABLA_LOG, params)
  return records.map(mapLogEvento)
}

// Simplified count for badge (no log event check — state-based only)
export async function getInboxCount(usuarioId: string, rol: string): Promise<number> {
  const objetivos = await getObjetivos()
  const rolNorm = rol.toLowerCase()

  if (rolNorm === 'operador' || rolNorm === 'staff') {
    return objetivos.filter(
      (o) => o.responsableId === usuarioId && o.estado === 'Asignado'
    ).length
  }

  if (rolNorm === 'ejecutivo') {
    const relevantes = ['Completado pendiente', 'Modificación solicitada', 'Rechazado']
    return objetivos.filter(
      (o) => relevantes.includes(o.estado) && o.aprobadorId === usuarioId
    ).length
  }

  if (rolNorm === 'program manager') {
    const programasConProblemas = new Set<string>()
    for (const obj of objetivos) {
      if ((obj.tipo === 'Primario' || obj.tipo === 'Vital') && obj.estado === 'Incumplido') {
        const progId = obj.programaIds[0]
        if (progId) programasConProblemas.add(progId)
      }
    }
    return programasConProblemas.size
  }

  return 0
}

export async function crearLogEvento({
  objetivoId,
  tipoEvento,
  usuarioId,
  notas,
}: {
  objetivoId: string
  tipoEvento: string
  usuarioId: string
  notas?: string
}): Promise<void> {
  await createRecord(TABLA_LOG, {
    'Objetivo': [objetivoId],
    'Tipo Evento': tipoEvento,
    'Usuario': [usuarioId],
    'Fecha y Hora': new Date().toISOString(),
    'Notas': notas ?? '',
  })
}

// ─── Planes de Batalla ────────────────────────────────────────────────────────

export const TABLA_PB = 'tbliUTM4zaoyztD6O'

export async function getPlanesDB(responsableId?: string): Promise<PlanDeBatalla[]> {
  let params = 'sort[0][field]=flduXU9YPEnp04XvA&sort[0][direction]=desc'
  if (responsableId) {
    params += `&filterByFormula=${encodeURIComponent(
      `FIND("${responsableId}",ARRAYJOIN({Responsable}))`
    )}`
  }
  const records = await fetchAll(TABLA_PB, params)
  return records.map(mapPB)
}

export async function getPlanDB(id: string): Promise<PlanDeBatalla> {
  const r = await fetchOne(TABLA_PB, id)
  return mapPB(r)
}

export async function createPlanDB(data: Partial<PlanDeBatalla>): Promise<PlanDeBatalla> {
  const fields: Record<string, any> = {}
  if (data.titulo) fields['Titulo'] = data.titulo
  if (data.responsableIds?.length) fields['Responsable'] = data.responsableIds
  if (data.periodo) fields['Periodo'] = data.periodo
  if (data.fecha) fields['Fecha'] = data.fecha
  if (data.estado) fields['Estado'] = data.estado
  if (data.objetivosIncluidosIds?.length) fields['Objetivos Incluidos'] = data.objetivosIncluidosIds
  if (data.notas) fields['Notas'] = data.notas
  const r = await createRecord(TABLA_PB, fields)
  return mapPB(r)
}

export async function updatePlanDB(id: string, data: Partial<PlanDeBatalla>): Promise<PlanDeBatalla> {
  const fields: Record<string, any> = {}
  if (data.titulo !== undefined) fields['Titulo'] = data.titulo
  if (data.responsableIds !== undefined) fields['Responsable'] = data.responsableIds
  if (data.periodo !== undefined) fields['Periodo'] = data.periodo
  if (data.fecha !== undefined) fields['Fecha'] = data.fecha
  if (data.estado !== undefined) fields['Estado'] = data.estado
  if (data.objetivosIncluidosIds !== undefined) fields['Objetivos Incluidos'] = data.objetivosIncluidosIds
  if (data.notas !== undefined) fields['Notas'] = data.notas
  const r = await updateRecord(TABLA_PB, id, fields)
  return mapPB(r)
}

export async function deletePlanDB(id: string): Promise<void> {
  await deleteRecord(TABLA_PB, id)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function getUsuariosByIds(ids: string[]): Promise<Record<string, Usuario>> {
  if (!ids.length) return {}
  const unique = [...new Set(ids.filter(Boolean))]
  const usuarios = await Promise.all(unique.map(id => getUsuario(id).catch(() => null)))
  const result: Record<string, Usuario> = {}
  usuarios.forEach((u, i) => { if (u) result[unique[i]] = u })
  return result
}
