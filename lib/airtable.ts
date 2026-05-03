import type {
  Usuario,
  Programa,
  Objetivo,
  Cumplimiento,
  LogEvento,
  PlanDeBatalla,
  PlanEstrategico,
  EntrevistaPE,
  TurnoPE,
  PropositorPE,
  SituacionPE,
  PanelUpdatePE,
  SubEstadoPaso,
  ReviewerReport,
  DecisionUsuario,
  SnapshotPaso,
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
    modo: ((r.fields['Modo'] as any)?.name ?? 'Secuencial') as 'Secuencial' | 'Paralelo',
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
  if (data.modo) fields['Modo'] = data.modo
  if (data.orden !== undefined) fields['Orden'] = data.orden
  if (data.notas) fields['Notas'] = data.notas
  if (data.tipo === 'Vital') {
    fields['Estado'] = 'Completado'
  } else {
    fields['Estado'] = data.responsableId === data.creadorId ? 'No iniciado' : 'Asignado'
  }
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
  if (data.modo !== undefined) fields['Modo'] = data.modo
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
      if (obj.tipo === 'Primario' && obj.estado === 'Incumplido') {
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

// ─── Planes Estratégicos ──────────────────────────────────────────────────────
// Reemplazar estos IDs con los IDs reales una vez creadas las tablas en Airtable

export const TABLA_PLANES_PE = 'tblPJC1VMQclfCqc7'
export const TABLA_ENTREVISTAS_PE = 'tblbOOk5jvVu3GsPJ'
export const TABLA_TURNOS_PE = 'tblWxPv53CRscq18w'

// Field IDs de Turnos_PE — usados en mappers y create payloads
const TURNOS_FIELD_ETIQUETA = 'fld2dhV3Nebuxp6dz'
const TURNOS_FIELD_ENTREVISTA = 'fldXVs7CFAqtFLFZ2'
const TURNOS_FIELD_INDICE = 'fldvqiDvekQZHAPm6'
const TURNOS_FIELD_ROL = 'fld3O3WBTnVx0GdMY'
const TURNOS_FIELD_CONTENIDO = 'fldxJbxdePyn88p4k'
const TURNOS_FIELD_TIMESTAMP = 'fldblAcqCgrGPIUHq'
const TURNOS_FIELD_PASO = 'fld8n5nbfvHkppsnk'

// Field IDs de Turnos_PE para rol=reviewer (feat/audit-reviewer Fase 1)
const TURNOS_FIELD_REVIEWER_BLOQUE = 'fldTjDPLvtsnhUvWK'
const TURNOS_FIELD_REVIEWER_MODELO = 'fldFqNpoLObBfeeui'
const TURNOS_FIELD_REVIEWER_ERRORES_TOTAL = 'fldreloD9xOBNYb9s'
const TURNOS_FIELD_REVIEWER_PREGUNTAS_TOTAL = 'fld9PLlkGYodW27XK'
const TURNOS_FIELD_REVIEWER_DECISIONES = 'fldCWJkl6rutPHo8G'
const TURNOS_FIELD_REVIEWER_SNAPSHOT_PRE_APPLY = 'fld36Iee0NKKHQM2g'
const TURNOS_FIELD_REVIEWER_COSTO = 'fldI9ciNKhWLt2fWI'
const TURNOS_FIELD_REVIEWER_LATENCIA = 'fldy42FvR4RV9KfTq'
const TURNOS_FIELD_REVIEWER_SKIPPED = 'fld2ASBHhPgQNYt5r'
const TURNOS_FIELD_REVIEWER_SKIPPED_REASON = 'fldWVuR0v31Ccqcx3'
const TURNOS_FIELD_REVIEWER_FAILED = 'fldgwL6Pxj2Ii1vy5'
const TURNOS_FIELD_REVIEWER_RETRY_COUNT = 'fldGhBmHiwXhUiA03'
const TURNOS_FIELD_APPLY_COSTO = 'fld36noMHgnJfKU0o'
const TURNOS_FIELD_APPLY_LATENCIA = 'fldVOyd9R9lnPkmSs'

// Field IDs de Turnos_PE para rol=snapshot
const TURNOS_FIELD_SNAPSHOT_PASO = 'fldra6jRHH32yM0Th'
const TURNOS_FIELD_SNAPSHOT_RESUMEN = 'fldk4WTpCtTPuirUr'

// Field IDs nuevos de entrevistas_pe (feat/audit-reviewer Fase 1)
// Usados por nombre en updateEntrevistaPE — IDs documentados acá para referencia.
// Sub Estado Paso          fldx8Kjxmivd1Kq99
// Auditorias Paso 1 Count  fldddCG4gfTLanfNa
// Auditorias Paso 2 Count  fldl7SdmBvCJlnX8S

function mapPlanEstrategico(r: any): PlanEstrategico {
  const f = r.fields ?? {}
  const proposito = f['Proposito Escena'] ? {
    escena: f['Proposito Escena'] ?? '',
    metricas: safeParseJson(f['Proposito Metricas'], []),
    fuera: safeParseJson(f['Proposito Fuera'], []),
    horizonte: f['Horizonte'] ?? '',
    estabilidad: f['Proposito Estabilidad'] ?? '',
    ...(f['Alineacion Sr'] ? { alineacion_sr: f['Alineacion Sr'] } : {}),
  } as PropositorPE : undefined

  const situacion = f['Situacion Desvio Principal'] ? {
    desvio_principal: f['Situacion Desvio Principal'] ?? '',
    desvio_cuantificado: f['Situacion Desvio Cuantificado'] ?? '',
    desvios_secundarios: safeParseJson(f['Situacion Desvios Secundarios'], []),
    causa_raiz: f['Situacion Causa Raiz'] ?? '',
    consecuencia_6m: f['Situacion Consecuencia 6m'] ?? '',
    consecuencia_12m: f['Situacion Consecuencia 12m'] ?? '',
    recursos_actuales: f['Situacion Recursos Actuales'] ?? '',
    recursos_faltantes: f['Situacion Recursos Faltantes'] ?? '',
    intentos_previos: f['Situacion Intentos Previos'] ?? '',
    resistencias: safeParseJson(f['Situacion Resistencias'], []),
  } as SituacionPE : undefined

  return {
    id: r.id,
    nombre: f['Nombre'] ?? '',
    area: f['Area'] ?? '',
    tipo: f['Tipo'] ?? 'Sr',
    plan_sr_id: f['Plan Sr ID'] ?? undefined,
    plan_sr_nombre: f['Plan Sr Nombre'] ?? undefined,
    estado: f['Estado'] ?? 'Borrador',
    version: f['Version'] ?? 1,
    responsable_id: f['Responsable']?.[0] ?? '',
    horizonte: f['Horizonte'] ?? undefined,
    proposito,
    situacion,
    datos_faltantes: safeParseJson(f['Datos Faltantes'], []),
  }
}

function safeParseJson(value: any, fallback: any) {
  if (!value) return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

function mapEntrevistaPE(r: any): EntrevistaPE {
  const f = r.fields ?? {}
  return {
    id: r.id,
    plan_id: f['Plan']?.[0] ?? '',
    estado: f['Estado'] ?? 'En curso',
    paso_actual: f['Paso Actual'] ?? 0,
    sub_bloque_actual: f['Sub Bloque Actual'] ?? '0',
    // historial se hidrata después desde Turnos_PE; lo dejo vacío acá.
    // Conservamos el parseo del campo legacy como FALLBACK para entrevistas
    // que aún no fueron migradas a Turnos_PE.
    historial: safeParseJson(f['Historial'], []),
    ultima_actividad: f['Ultima Actividad'] ?? '',
    // Tracking de salud del PANEL_UPDATE (Fase 2 instrumentación)
    ultimo_panel_update_ok: f['Ultimo Panel Update OK'] ?? undefined,
    turnos_sin_panel_consecutivos: f['Turnos Sin Panel Consecutivos'] ?? 0,
    retries_panel_update_acumulados: f['Retries Panel Update Acumulados'] ?? 0,
    // Estado del flow de cierre+auditoría (feat/audit-reviewer Fase 1+)
    sub_estado_paso: (f['Sub Estado Paso']?.name ?? f['Sub Estado Paso'] ?? 'en_curso') as SubEstadoPaso,
    auditorias_paso_1_count: f['Auditorias Paso 1 Count'] ?? 0,
    auditorias_paso_2_count: f['Auditorias Paso 2 Count'] ?? 0,
  }
}

function mapTurnoPE(r: any): TurnoPE & { _airtableId: string; _indice: number } {
  const f = r.fields ?? {}
  return {
    _airtableId: r.id,
    _indice: f['Indice'] ?? 0,
    rol: (f['Rol']?.name ?? f['Rol'] ?? 'user') as TurnoPE['rol'],
    contenido: f['Contenido'] ?? '',
    timestamp: f['Timestamp'] ?? '',
    paso: f['Paso'] ?? 0,
  }
}

// ─── Turnos_PE ────────────────────────────────────────────────────────────────

/**
 * Lista los turnos de una entrevista, ordenados por Indice ascendente.
 * Pagina automáticamente si hay más de 100 turnos.
 */
export async function getTurnosPE(entrevistaId: string): Promise<TurnoPE[]> {
  // ARRAYJOIN sobre linked field devuelve el primaryFieldId del registro linkeado
  // (Etiqueta autogenerada) — para filtrar por record ID, filtramos en memoria.
  const params = `sort[0][field]=${TURNOS_FIELD_INDICE}&sort[0][direction]=asc`
  const records = await fetchAll(TABLA_TURNOS_PE, params)
  return records
    .filter(r => {
      const ent: string[] = r.fields?.[TURNOS_FIELD_ENTREVISTA] ?? r.fields?.['Entrevista'] ?? []
      return ent.includes(entrevistaId)
    })
    .map(r => {
      const m = mapTurnoPE(r)
      // Strip private fields antes de devolver al caller
      const { _airtableId, _indice, ...turno } = m
      return turno
    })
}

/**
 * Bulk-crea N turnos en Turnos_PE para una entrevista, comenzando en el índice
 * dado. Actualiza también `Ultima Actividad` de la entrevista.
 * Devuelve los record IDs creados.
 *
 * Nota: Airtable acepta hasta 10 records por bulk-create. Para N=2 (caso típico
 * user+model) está sobrado. Si en el futuro se reciben >10, hay que chunkear.
 */
export async function appendTurnosPE(
  entrevistaId: string,
  turnos: TurnoPE[],
  indiceInicial: number,
): Promise<{ ids: string[] }> {
  if (turnos.length === 0) return { ids: [] }
  if (turnos.length > 10) {
    throw new Error(`appendTurnosPE: máximo 10 turnos por llamada, recibidos ${turnos.length}`)
  }

  const records = turnos.map((t, i) => {
    const indice = indiceInicial + i
    return {
      fields: {
        [TURNOS_FIELD_ETIQUETA]: `${String(indice).padStart(4, '0')}|${t.rol}`,
        [TURNOS_FIELD_ENTREVISTA]: [entrevistaId],
        [TURNOS_FIELD_INDICE]: indice,
        [TURNOS_FIELD_ROL]: t.rol,
        [TURNOS_FIELD_CONTENIDO]: t.contenido,
        [TURNOS_FIELD_TIMESTAMP]: t.timestamp,
        [TURNOS_FIELD_PASO]: t.paso,
      },
    }
  })

  const res = await fetch(`${BASE_URL}/${TABLA_TURNOS_PE}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ records }),
  })
  if (!res.ok) {
    throw new Error(`Airtable appendTurnosPE error: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return { ids: data.records.map((r: any) => r.id) }
}

export async function getPlanesEstrategicos(userId: string, rol: string): Promise<PlanEstrategico[]> {
  const params = 'sort[0][field]=Nombre&sort[0][direction]=asc'
  const records = await fetchAll(TABLA_PLANES_PE, params)
  const planes = records.map(mapPlanEstrategico)
  if (rol === 'Ejecutivo' || rol === 'Program Manager') return planes
  return planes.filter(p => p.responsable_id === userId)
}

export async function getPlanEstrategico(id: string): Promise<PlanEstrategico> {
  const r = await fetchOne(TABLA_PLANES_PE, id)
  return mapPlanEstrategico(r)
}

export async function createPlanEstrategico(data: {
  nombre: string
  tipo: 'Sr' | 'Jr'
  plan_sr_id?: string
  plan_sr_nombre?: string
  responsable_id: string
}): Promise<PlanEstrategico> {
  const fields: Record<string, any> = {
    'Nombre': data.nombre,
    'Tipo': data.tipo,
    'Estado': 'En entrevista',
    'Version': 1,
    'Responsable': [data.responsable_id],
  }
  if (data.plan_sr_id) fields['Plan Sr ID'] = data.plan_sr_id
  if (data.plan_sr_nombre) fields['Plan Sr Nombre'] = data.plan_sr_nombre
  const r = await createRecord(TABLA_PLANES_PE, fields)
  return mapPlanEstrategico(r)
}

export async function updatePlanEstrategico(id: string, data: Partial<{
  nombre: string
  area: string
  estado: string
  horizonte: string
  proposito: PropositorPE
  situacion: SituacionPE
  datos_faltantes: string[]
  alineacion_sr: string
}>): Promise<void> {
  const fields: Record<string, any> = {}
  if (data.nombre !== undefined) fields['Nombre'] = data.nombre
  if (data.area !== undefined) fields['Area'] = data.area
  if (data.estado !== undefined) fields['Estado'] = data.estado
  if (data.horizonte !== undefined) fields['Horizonte'] = data.horizonte
  if (data.alineacion_sr !== undefined) fields['Alineacion Sr'] = data.alineacion_sr
  if (data.datos_faltantes !== undefined) fields['Datos Faltantes'] = JSON.stringify(data.datos_faltantes)
  if (data.proposito) {
    const p = data.proposito
    fields['Proposito Escena'] = p.escena
    fields['Proposito Metricas'] = JSON.stringify(p.metricas)
    fields['Proposito Fuera'] = JSON.stringify(p.fuera)
    fields['Proposito Estabilidad'] = p.estabilidad
    if (p.horizonte) fields['Horizonte'] = p.horizonte
    if (p.alineacion_sr) fields['Alineacion Sr'] = p.alineacion_sr
  }
  if (data.situacion) {
    const s = data.situacion
    fields['Situacion Desvio Principal'] = s.desvio_principal
    fields['Situacion Desvio Cuantificado'] = s.desvio_cuantificado
    fields['Situacion Desvios Secundarios'] = JSON.stringify(s.desvios_secundarios)
    fields['Situacion Causa Raiz'] = s.causa_raiz
    fields['Situacion Consecuencia 6m'] = s.consecuencia_6m
    fields['Situacion Consecuencia 12m'] = s.consecuencia_12m
    fields['Situacion Recursos Actuales'] = s.recursos_actuales
    fields['Situacion Recursos Faltantes'] = s.recursos_faltantes
    fields['Situacion Intentos Previos'] = s.intentos_previos
    fields['Situacion Resistencias'] = JSON.stringify(s.resistencias)
  }
  await updateRecord(TABLA_PLANES_PE, id, fields)
}

export async function getEntrevistaPE(planId: string): Promise<EntrevistaPE | null> {
  // ARRAYJOIN on linked fields returns names, not IDs — filter in memory
  const records = await fetchAll(TABLA_ENTREVISTAS_PE, 'sort[0][field]=Ultima Actividad&sort[0][direction]=desc')
  const matching = records.filter(r => {
    const planIds: string[] = r.fields['Plan'] ?? []
    return planIds.includes(planId)
  })
  if (!matching.length) return null
  const enCurso = matching.find(r => r.fields['Estado'] === 'En curso')
  const entrevista = mapEntrevistaPE(enCurso ?? matching[0])

  // Hidratar historial desde Turnos_PE. Fallback al campo legacy si la tabla
  // todavía no tiene registros para esta entrevista (entrevistas no migradas).
  const turnos = await getTurnosPE(entrevista.id)
  if (turnos.length > 0) {
    entrevista.historial = turnos
  }
  // Si turnos.length === 0, dejamos el historial parseado del campo legacy
  // (que ya viene en mapEntrevistaPE). Esto cubre el periodo pre-migración.

  return entrevista
}

export async function createEntrevistaPE(planId: string): Promise<EntrevistaPE> {
  const fields: Record<string, any> = {
    'Titulo': `Entrevista ${new Date().toISOString().split('T')[0]}`,
    'Plan': [planId],
    'Estado': 'En curso',
    'Paso Actual': 0,
    'Sub Bloque Actual': '0',
    'Historial': '[]',
    'Ultima Actividad': new Date().toISOString(),
  }
  const r = await createRecord(TABLA_ENTREVISTAS_PE, fields)
  return mapEntrevistaPE(r)
}

export async function updateEntrevistaPE(id: string, data: {
  estado?: string
  paso_actual?: number
  sub_bloque_actual?: string
  ultimo_panel_update_ok?: string
  turnos_sin_panel_consecutivos?: number
  retries_panel_update_acumulados?: number
  sub_estado_paso?: SubEstadoPaso
  auditorias_paso_1_count?: number
  auditorias_paso_2_count?: number
}): Promise<void> {
  const fields: Record<string, any> = { 'Ultima Actividad': new Date().toISOString() }
  if (data.estado !== undefined) fields['Estado'] = data.estado
  if (data.paso_actual !== undefined) fields['Paso Actual'] = data.paso_actual
  if (data.sub_bloque_actual !== undefined) fields['Sub Bloque Actual'] = data.sub_bloque_actual
  if (data.ultimo_panel_update_ok !== undefined) fields['Ultimo Panel Update OK'] = data.ultimo_panel_update_ok
  if (data.turnos_sin_panel_consecutivos !== undefined) fields['Turnos Sin Panel Consecutivos'] = data.turnos_sin_panel_consecutivos
  if (data.retries_panel_update_acumulados !== undefined) fields['Retries Panel Update Acumulados'] = data.retries_panel_update_acumulados
  if (data.sub_estado_paso !== undefined) fields['Sub Estado Paso'] = data.sub_estado_paso
  if (data.auditorias_paso_1_count !== undefined) fields['Auditorias Paso 1 Count'] = data.auditorias_paso_1_count
  if (data.auditorias_paso_2_count !== undefined) fields['Auditorias Paso 2 Count'] = data.auditorias_paso_2_count
  // El campo Historial (legacy multilineText) ya no se escribe — los turnos van a Turnos_PE
  await updateRecord(TABLA_ENTREVISTAS_PE, id, fields)
}

// ─── Helpers de auditoría (feat/audit-reviewer Fase 1+) ──────────────────────
//
// Nota sobre `typecast: true`: las choices `reviewer` y `snapshot` del campo
// `Rol` en Turnos_PE se agregan manualmente desde la UI de Airtable, o on-the-fly
// por la API con `typecast: true`. Mientras no estén pre-agregadas, typecast las
// crea en el primer createRecord. Una vez creadas, typecast es no-op (idempotente).

/**
 * Máquina de estados del flow de cierre+auditoría. Mapea cada estado al
 * conjunto de estados a los que se puede transicionar desde él.
 *
 * Exportado para tests unitarios y para que el frontend pueda hacer
 * pre-checks sin tener que llamar al backend.
 */
export const SUB_ESTADO_TRANSICIONES_VALIDAS: Record<SubEstadoPaso, SubEstadoPaso[]> = {
  en_curso: ['cierre_sugerido'],
  cierre_sugerido: ['esperando_auditoria', 'en_curso'],          // user puede volver a entrevistar
  esperando_auditoria: ['auditoria_en_proceso', 'completo'],     // o skip directo
  auditoria_en_proceso: ['auditoria_completa', 'esperando_auditoria', 'esperando_aprobacion_final'], // rollback al estado origen (re-audit puede venir de aprobacion_final)
  auditoria_completa: ['aplicando_cambios', 'esperando_auditoria'],    // re-audit
  aplicando_cambios: ['esperando_aprobacion_final'],
  esperando_aprobacion_final: ['completo', 'aplicando_cambios', 'auditoria_en_proceso'], // re-audit o re-apply
  completo: [],  // estado terminal del Paso
}

/**
 * Función pura: ¿es válida la transición `desde → hasta` según la máquina
 * de estados? Útil para pre-checks en frontend y para tests unitarios sin red.
 */
export function isValidTransition(desde: SubEstadoPaso, hasta: SubEstadoPaso): boolean {
  return SUB_ESTADO_TRANSICIONES_VALIDAS[desde]?.includes(hasta) ?? false
}

/**
 * Update guarded: valida que la transición de sub_estado_paso sea legal según
 * la máquina de estados del flow de cierre+auditoría. Lanza error si no lo es.
 */
export async function updateSubEstadoPaso(
  entrevistaId: string,
  desde: SubEstadoPaso,
  hasta: SubEstadoPaso,
): Promise<void> {
  const transicionesValidas = SUB_ESTADO_TRANSICIONES_VALIDAS[desde]
  if (!transicionesValidas.includes(hasta)) {
    throw new Error(`Transición inválida de sub_estado_paso: '${desde}' → '${hasta}'. Válidas desde '${desde}': ${transicionesValidas.join(', ') || '(ninguna)'}`)
  }
  await updateEntrevistaPE(entrevistaId, { sub_estado_paso: hasta })
}

/**
 * Incrementa el contador de auditorías para el Paso especificado.
 * Devuelve el nuevo conteo. Lanza error si supera el max (3 por Paso).
 */
export async function incrementAuditoriasPaso(
  entrevistaId: string,
  paso: 1 | 2,
  currentCount: number,
): Promise<number> {
  const MAX = 3
  if (currentCount >= MAX) {
    throw new Error(`Auditorías del Paso ${paso} ya en el máximo (${MAX}). No se puede incrementar.`)
  }
  const nuevo = currentCount + 1
  const fieldKey = paso === 1 ? 'auditorias_paso_1_count' : 'auditorias_paso_2_count'
  await updateEntrevistaPE(entrevistaId, { [fieldKey]: nuevo })
  return nuevo
}

/**
 * Crea un turno con rol=reviewer en Turnos_PE. Persiste el reporte completo
 * + metadata (costo, latencia, modelo, etc.).
 *
 * El `contenido` del turno es el JSON serializado del ReviewerReport — esto
 * mantiene consistencia con cómo se almacena el resto de los turnos (string).
 */
export async function appendReviewerTurno(
  entrevistaId: string,
  indice: number,
  data: {
    paso: number
    bloqueAuditado: number
    modelo: string
    report: ReviewerReport
    costo_usd: number
    latencia_ms: number
    retry_count: number
    skipped?: boolean
    skipped_reason?: string
    failed?: boolean
  },
): Promise<{ id: string }> {
  const fields: Record<string, any> = {
    [TURNOS_FIELD_ETIQUETA]: `${String(indice).padStart(4, '0')}|reviewer`,
    [TURNOS_FIELD_ENTREVISTA]: [entrevistaId],
    [TURNOS_FIELD_INDICE]: indice,
    [TURNOS_FIELD_ROL]: 'reviewer',
    [TURNOS_FIELD_CONTENIDO]: JSON.stringify(data.report),
    [TURNOS_FIELD_TIMESTAMP]: new Date().toISOString(),
    [TURNOS_FIELD_PASO]: data.paso,
    [TURNOS_FIELD_REVIEWER_BLOQUE]: data.bloqueAuditado,
    [TURNOS_FIELD_REVIEWER_MODELO]: data.modelo,
    [TURNOS_FIELD_REVIEWER_ERRORES_TOTAL]: data.report.errors.length,
    [TURNOS_FIELD_REVIEWER_PREGUNTAS_TOTAL]: data.report.questions.length,
    [TURNOS_FIELD_REVIEWER_COSTO]: data.costo_usd,
    [TURNOS_FIELD_REVIEWER_LATENCIA]: data.latencia_ms,
    [TURNOS_FIELD_REVIEWER_RETRY_COUNT]: data.retry_count,
    [TURNOS_FIELD_REVIEWER_SKIPPED]: !!data.skipped,
    [TURNOS_FIELD_REVIEWER_FAILED]: !!data.failed,
  }
  if (data.skipped_reason) fields[TURNOS_FIELD_REVIEWER_SKIPPED_REASON] = data.skipped_reason

  // typecast:true necesario hasta que las choices reviewer/snapshot del campo Rol
  // se agreguen manualmente en la UI (Meta API no permite agregar choices via PATCH).
  const res = await fetch(`${BASE_URL}/${TABLA_TURNOS_PE}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  })
  if (!res.ok) throw new Error(`Airtable appendReviewerTurno error: ${res.status} ${await res.text()}`)
  const created = await res.json()
  return { id: created.records[0].id }
}

/**
 * Persiste SOLO el array de decisiones del usuario en un turno reviewer existente.
 * Se llama desde el PATCH /audit/[turno_id]/decision en cada cambio que el user
 * hace en Pantalla 3. NO toca snapshot pre-apply ni métricas de apply — eso es
 * exclusivo de updateReviewerDecisionesAndApply (Fase 4).
 */
export async function updateReviewerDecisionesOnly(
  reviewerTurnoId: string,
  decisiones: DecisionUsuario[],
): Promise<void> {
  await updateRecord(TABLA_TURNOS_PE, reviewerTurnoId, {
    [TURNOS_FIELD_REVIEWER_DECISIONES]: JSON.stringify(decisiones),
  })
}

/**
 * Persiste decisiones FINALES + snapshot pre-apply + métricas de la llamada de
 * apply changes (Opus). Se llama desde el endpoint /apply (Fase 4) tras procesar
 * todas las decisiones aprobadas.
 */
export async function updateReviewerDecisionesAndApply(
  reviewerTurnoId: string,
  decisiones: DecisionUsuario[],
  snapshotPreApply: { proposito?: PropositorPE; situacion?: SituacionPE; datos_faltantes: string[] },
  applyMetrics: { costo_usd: number; latencia_ms: number },
): Promise<void> {
  await updateRecord(TABLA_TURNOS_PE, reviewerTurnoId, {
    [TURNOS_FIELD_REVIEWER_DECISIONES]: JSON.stringify(decisiones),
    [TURNOS_FIELD_REVIEWER_SNAPSHOT_PRE_APPLY]: JSON.stringify(snapshotPreApply),
    [TURNOS_FIELD_APPLY_COSTO]: applyMetrics.costo_usd,
    [TURNOS_FIELD_APPLY_LATENCIA]: applyMetrics.latencia_ms,
  })
}

/**
 * Crea un turno con rol=snapshot. Marca el cierre definitivo de un Paso —
 * congela el resumen completo (proposito + situacion + datos_faltantes) en el
 * campo `Snapshot Resumen JSON`. Inmutable después de crearse.
 */
export async function appendSnapshotTurno(
  entrevistaId: string,
  indice: number,
  snapshot: SnapshotPaso,
): Promise<{ id: string }> {
  const fields: Record<string, any> = {
    [TURNOS_FIELD_ETIQUETA]: `${String(indice).padStart(4, '0')}|snapshot|p${snapshot.paso}`,
    [TURNOS_FIELD_ENTREVISTA]: [entrevistaId],
    [TURNOS_FIELD_INDICE]: indice,
    [TURNOS_FIELD_ROL]: 'snapshot',
    [TURNOS_FIELD_CONTENIDO]: JSON.stringify(snapshot),
    [TURNOS_FIELD_TIMESTAMP]: snapshot.cerrado_en,
    [TURNOS_FIELD_PASO]: snapshot.paso,
    [TURNOS_FIELD_SNAPSHOT_PASO]: snapshot.paso,
    [TURNOS_FIELD_SNAPSHOT_RESUMEN]: JSON.stringify(snapshot),
  }
  const res = await fetch(`${BASE_URL}/${TABLA_TURNOS_PE}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  })
  if (!res.ok) throw new Error(`Airtable appendSnapshotTurno error: ${res.status} ${await res.text()}`)
  const created = await res.json()
  return { id: created.records[0].id }
}

/**
 * Devuelve los turnos con rol=reviewer de una entrevista para un Paso dado,
 * ordenados cronológicamente. Útil para re-auditorías (M5: pasar al reviewer
 * el contexto del reporte previo + decisiones del usuario).
 */
export async function getReviewerTurnos(
  entrevistaId: string,
  paso: number,
): Promise<Array<{
  airtableId: string
  report: ReviewerReport
  decisiones?: DecisionUsuario[]
  snapshotPreApply?: { proposito?: PropositorPE; situacion?: SituacionPE; datos_faltantes: string[] }
  costo_usd: number
  latencia_ms: number
  retry_count: number
  applyCostoUsd: number
  applyLatenciaMs: number
}>> {
  // IMPORTANTE: Airtable devuelve r.fields con los NOMBRES como keys (no field
  // IDs) cuando NO se pasa returnFieldsByFieldId=true. Por convención del
  // proyecto, los reads usan nombres y los writes (POST/PATCH bodies) usan
  // field IDs. Mantener la convención.
  const params = `sort[0][field]=${TURNOS_FIELD_INDICE}&sort[0][direction]=asc`
  const records = await fetchAll(TABLA_TURNOS_PE, params)
  return records
    .filter(r => {
      const rolName = r.fields?.['Rol']?.name ?? r.fields?.['Rol']
      const ent: string[] = r.fields?.['Entrevista'] ?? []
      const turnoPaso = r.fields?.['Reviewer Bloque Auditado']
      return rolName === 'reviewer' && ent.includes(entrevistaId) && turnoPaso === paso
    })
    .map(r => ({
      airtableId: r.id,
      report: safeParseJson(r.fields?.['Contenido'], { errors: [], questions: [], cross_block_changes: [], meta: {} }),
      decisiones: r.fields?.['Reviewer Decisiones JSON']
        ? safeParseJson(r.fields['Reviewer Decisiones JSON'], [])
        : undefined,
      snapshotPreApply: r.fields?.['Reviewer Snapshot Pre Apply JSON']
        ? safeParseJson(r.fields['Reviewer Snapshot Pre Apply JSON'], null) ?? undefined
        : undefined,
      costo_usd: r.fields?.['Reviewer Costo USD'] ?? 0,
      latencia_ms: r.fields?.['Reviewer Latencia MS'] ?? 0,
      retry_count: r.fields?.['Reviewer Retry Count'] ?? 0,
      applyCostoUsd: r.fields?.['Apply Changes Cost USD'] ?? 0,
      applyLatenciaMs: r.fields?.['Apply Changes Latency MS'] ?? 0,
    }))
}

/**
 * Devuelve el snapshot inmutable del Paso N de una entrevista (si existe).
 * Útil para mostrar el resumen congelado en la UI o para operaciones de rollback.
 */
export async function getSnapshotPaso(
  entrevistaId: string,
  paso: number,
): Promise<SnapshotPaso | null> {
  // Mismo patrón que getReviewerTurnos: reads usan nombres, no field IDs.
  const params = `sort[0][field]=${TURNOS_FIELD_INDICE}&sort[0][direction]=asc`
  const records = await fetchAll(TABLA_TURNOS_PE, params)
  const match = records.find(r => {
    const rolName = r.fields?.['Rol']?.name ?? r.fields?.['Rol']
    const ent: string[] = r.fields?.['Entrevista'] ?? []
    const snapshotPaso = r.fields?.['Snapshot Paso']
    return rolName === 'snapshot' && ent.includes(entrevistaId) && snapshotPaso === paso
  })
  if (!match) return null
  const raw = match.fields?.['Snapshot Resumen JSON']
  return safeParseJson(raw, null)
}
