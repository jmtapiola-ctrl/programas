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
  PlanoPE,
  PanelUpdatePE,
  SubEstadoPaso,
  ReviewerReport,
  DecisionUsuario,
  SnapshotPaso,
  ContextoCuradoJr,
} from './types'
import { CONTEXTO_CURADO_CAMPOS, contextoCuradoTieneContenido } from './types'
import { denormalizarCurado, hidratarCurado } from './curado-persistence'

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

async function createRecord(table: string, fields: Record<string, any>, opts?: { typecast?: boolean }): Promise<any> {
  const res = await fetch(`${BASE_URL}/${table}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ fields, ...(opts?.typecast ? { typecast: true } : {}) }),
  })
  if (!res.ok) throw new Error(`Airtable error: ${res.status} ${await res.text()}`)
  return res.json()
}

async function updateRecord(table: string, id: string, fields: Record<string, any>, opts?: { typecast?: boolean }): Promise<any> {
  const res = await fetch(`${BASE_URL}/${table}/${id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ fields, ...(opts?.typecast ? { typecast: true } : {}) }),
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
    // Sistema Sr→Jr — hash bcrypt + flag password temporal. Si los campos no
    // existen en Airtable (users legacy), se quedan undefined → login legacy
    // que entra sin password (mantenido por compatibilidad).
    password_hash: r.fields['Password Hash'] ?? undefined,
    password_temporal: r.fields['Password Temporal'] ?? undefined,
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
  if (data.password_hash !== undefined) fields['Password Hash'] = data.password_hash
  if (data.password_temporal !== undefined) fields['Password Temporal'] = data.password_temporal
  // typecast:true → la choice 'Plan Jr' del campo Rol se auto-crea en el primer
  // write. El PAT del proyecto puede crear fields pero NO editar choices de un
  // singleSelect vía meta API (devuelve 422), así que typecast es el mecanismo.
  // Mismo patrón que el campo Rol de Turnos PE (reviewer/snapshot). Idempotente.
  const r = await createRecord(TABLA_USUARIOS, fields, { typecast: true })
  return mapUsuario(r)
}

export async function updateUsuario(id: string, data: Partial<Usuario>): Promise<Usuario> {
  const fields: Record<string, any> = {}
  if (data.nombre !== undefined) fields['Nombre'] = data.nombre
  if (data.email !== undefined) fields['Email'] = data.email
  if (data.rol !== undefined) fields['Rol'] = data.rol
  if (data.activo !== undefined) fields['Activo'] = data.activo
  if (data.password_hash !== undefined) fields['Password Hash'] = data.password_hash
  if (data.password_temporal !== undefined) fields['Password Temporal'] = data.password_temporal
  // typecast:true por la misma razón que createUsuario (Rol 'Plan Jr' auto-create).
  const r = await updateRecord(TABLA_USUARIOS, id, fields, { typecast: true })
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

// Field IDs de Turnos_PE para audit retroactivo / educativo (post-merge feature)
const TURNOS_FIELD_REVIEWER_READ_ONLY = 'fldwD774cW4QnhAlO'
const TURNOS_FIELD_REVIEWER_VIA_SCRIPT = 'fldFdFR4HLhWHaCCE'

// Field IDs nuevos de entrevistas_pe (feat/audit-reviewer Fase 1)
// Usados por nombre en updateEntrevistaPE — IDs documentados acá para referencia.
// Sub Estado Paso          fldx8Kjxmivd1Kq99
// Auditorias Paso 1 Count  fldddCG4gfTLanfNa
// Auditorias Paso 2 Count  fldl7SdmBvCJlnX8S

// Lee los 5 campos del contexto curado del Jr desde r.fields. Devuelve
// undefined si los 5 están vacíos (plan legacy o Jr sin desplegar todavía).
function mapContextoCurado(f: any): ContextoCuradoJr | undefined {
  const cc = {
    contexto: '',
    proposito: '',
    criterios_exito: '',
    metricas: '',
    supuestos: '',
  } as ContextoCuradoJr
  for (const campo of CONTEXTO_CURADO_CAMPOS) {
    cc[campo.key] = f[campo.field] ?? ''
  }
  return contextoCuradoTieneContenido(cc) ? cc : undefined
}

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

  // Plan estructurado del Paso 3 (Fase A — Decisión D2: un solo campo JSON
  // consolidado para V1). El shape sigue PlanoPE (6 keys top-level durante
  // el flow + curado aplanado al cerrar 3.E). undefined si no está poblado.
  const plan = f['Plan Paso 3 JSON']
    ? safeParseJson(f['Plan Paso 3 JSON'], undefined)
    : undefined

  // CAMPOS SPLITEADOS (2026-05): porque el JSON combinado del plan llegaba
  // a >100k chars (límite de Airtable Long Text), 3 sub-keys se persisten en
  // fields separados: borrador (3.C), inventario (3.A), curado (3.E). Cada
  // uno se mergea al `plan` si está presente.
  //   - Back-compat: planes viejos tienen todo en "Plan Paso 3 JSON". Si el
  //     field separado está vacío, dejamos lo que venga del plan original.
  //   - Forward: writes nuevas eliminan esas keys del plan original al
  //     persistir (ver updatePlanEstrategico).
  if (plan && f['Plan Borrador JSON']) {
    const borradorSeparado = safeParseJson(f['Plan Borrador JSON'], undefined)
    if (borradorSeparado) plan.borrador = borradorSeparado
  }
  if (plan && f['Plan Inventario JSON']) {
    const inventarioSeparado = safeParseJson(f['Plan Inventario JSON'], undefined)
    if (inventarioSeparado) plan.inventario = inventarioSeparado
  }
  if (plan && f['Plan Curado JSON']) {
    const curadoSeparado = safeParseJson(f['Plan Curado JSON'], undefined)
    if (curadoSeparado) plan.curado = curadoSeparado
  }

  // Migración backward-compat del curado: shape antiguo era PlanCuradoPE
  // directo (single object). Nuevo shape: PlanCuradoVersionado
  // { versiones[], version_activa }. Si detectamos shape antiguo
  // (tiene 'contexto' al nivel raíz y no tiene 'versiones'), lo envolvemos
  // en memoria como una sola versión. La próxima escritura persiste shape nuevo.
  if (plan?.curado && !plan.curado.versiones && typeof plan.curado.contexto === 'string') {
    plan.curado = { versiones: [plan.curado], version_activa: 0 }
  }

  // Hidratación del curado normalizado: cada versión persiste con
  // movimientos_ids[] y supuestos_criticos_descripciones[]. Acá los expandimos
  // a MovimientoPE / SupuestoExogenoPE completos usando el inventario y
  // preparativos del mismo plan. Backward-compat: si la versión ya tiene
  // movimientos[] (shape viejo) la pasa como está. Ver lib/curado-persistence.ts.
  if (plan?.curado) {
    plan.curado = hidratarCurado(plan.curado, plan.inventario, plan.preparativos)
  }

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
    plan,
    // ─── Campos del sistema Sr→Jr ───────────────────────────────────────
    // Si el campo no existe en Airtable (planes legacy pre-Sr→Jr), queda
    // undefined — el feature simplemente no se activa para ese plan.
    lineas_jr: safeParseJson(f['Lineas Jr JSON'], undefined),
    movs_heredados_ids: safeParseJson(f['Movs Heredados IDs'], undefined),
    movs_heredados_snapshot: safeParseJson(f['Movs Heredados Snapshot'], undefined),
    // Contexto curado split en 5 campos (reemplaza al legacy 'Contexto Curado
    // MD'). Si los 5 están vacíos/ausentes, contexto_curado queda undefined.
    contexto_curado: mapContextoCurado(f),
    dueno_jr_email: f['Dueno Jr Email'] ?? undefined,
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
    auditorias_paso_3_count: f['Auditorias Paso 3 Count'] ?? 0,
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

// Cascade delete del plan estratégico: borra todos los turnos de la entrevista
// asociada, después la entrevista, después el plan. Idempotente — si algún
// registro asociado ya no existe, sigue con el resto.
//
// IMPORTANTE: opera irreversible sobre Airtable. La validación de autorización
// (código de seguridad) la hace el endpoint que llama esta función.
export async function deletePlanEstrategico(planId: string): Promise<void> {
  // 1. Encontrar entrevistas asociadas (no usamos getEntrevistaPE porque ese
  // filtra por 'En curso' y hidrata historial — no necesitamos eso para delete).
  const entrevistas = await fetchAll(TABLA_ENTREVISTAS_PE, '')
  const entrevistasAsociadas = entrevistas.filter(r => {
    const planIds: string[] = r.fields['Plan'] ?? []
    return planIds.includes(planId)
  })

  // 2. Por cada entrevista, borrar sus turnos.
  for (const entRecord of entrevistasAsociadas) {
    const entrevistaId = entRecord.id
    const turnos = await getTurnosPE(entrevistaId)
    for (const t of turnos) {
      const airtableId = (t as any)._airtableId as string | undefined
      if (airtableId) {
        await deleteRecord(TABLA_TURNOS_PE, airtableId).catch(() => undefined)
      }
    }
    // 3. Borrar la entrevista.
    await deleteRecord(TABLA_ENTREVISTAS_PE, entrevistaId).catch(() => undefined)
  }

  // 4. Finalmente borrar el plan.
  await deleteRecord(TABLA_PLANES_PE, planId)
}

// Filtrado de planes por rol del usuario que loguea. Compatibilidad con roles
// legacy (Ejecutivo / Program Manager / Operador) + roles nuevos del sistema
// Sr→Jr (Plan Sr / Plan Jr / Admin):
//   - Ejecutivo, Program Manager, Admin: ven TODOS los planes.
//   - Plan Sr: ve los planes donde es responsable (los Sr suyos) + los Jr
//     derivados de esos Sr (heredan visibilidad).
//   - Plan Jr: ve SOLO los planes donde su email coincide con dueno_jr_email.
//     Esto le da acceso a su Jr propio. La UI de listado se encarga de
//     mostrar headers de Jr hermanos como read-only (sin entrar al contenido).
//   - Operador (legacy): ve los planes donde es responsable.
export async function getPlanesEstrategicos(userId: string, rol: string, userEmail?: string): Promise<PlanEstrategico[]> {
  const params = 'sort[0][field]=Nombre&sort[0][direction]=asc'
  const records = await fetchAll(TABLA_PLANES_PE, params)
  const planes = records.map(mapPlanEstrategico)
  if (rol === 'Ejecutivo' || rol === 'Program Manager' || rol === 'Admin') return planes
  if (rol === 'Plan Sr') {
    // Sus Sr propios + Jr derivados de esos Sr.
    const misSrIds = new Set(planes.filter(p => p.tipo === 'Sr' && p.responsable_id === userId).map(p => p.id))
    return planes.filter(p =>
      (p.tipo === 'Sr' && p.responsable_id === userId) ||
      (p.tipo === 'Jr' && p.plan_sr_id !== undefined && misSrIds.has(p.plan_sr_id))
    )
  }
  if (rol === 'Plan Jr' && userEmail) {
    // Sus Jr propios (match por email) + Sr al que pertenecen (header read-only)
    // + Jr hermanos del mismo Sr (headers read-only). La UI distingue cuáles
    // puede abrir y cuáles solo ve como referencia.
    const misJr = planes.filter(p => p.tipo === 'Jr' && p.dueno_jr_email === userEmail)
    const srIdsRelacionados = new Set(misJr.map(p => p.plan_sr_id).filter((x): x is string => !!x))
    return planes.filter(p =>
      (p.tipo === 'Jr' && p.dueno_jr_email === userEmail) ||
      (p.tipo === 'Sr' && srIdsRelacionados.has(p.id)) ||
      (p.tipo === 'Jr' && p.plan_sr_id !== undefined && srIdsRelacionados.has(p.plan_sr_id))
    )
  }
  // Operador legacy o rol no reconocido: solo lo que es suyo.
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
  // Estado inicial. Default 'En entrevista' (compat con flow normal). El
  // sistema Sr→Jr crea Plans Jr en 'Pendiente despliegue' al inicio.
  estado?: string
}): Promise<PlanEstrategico> {
  const fields: Record<string, any> = {
    'Nombre': data.nombre,
    'Tipo': data.tipo,
    'Estado': data.estado ?? 'En entrevista',
    'Version': 1,
    'Responsable': [data.responsable_id],
  }
  if (data.plan_sr_id) fields['Plan Sr ID'] = data.plan_sr_id
  if (data.plan_sr_nombre) fields['Plan Sr Nombre'] = data.plan_sr_nombre
  // typecast:true → las choices del flow Sr→Jr del campo Estado ('Pendiente
  // despliegue', 'Listo para compartir') se auto-crean en el primer write. El
  // PAT del proyecto no puede editar choices vía meta API (422). Seguro acá:
  // 'Responsable' se escribe como array de record IDs (typecast no las
  // reinterpreta), y no hay otros campos de link en este create.
  const r = await createRecord(TABLA_PLANES_PE, fields, { typecast: true })
  return mapPlanEstrategico(r)
}

// Airtable Long Text field tiene un límite de ~100,000 chars. El JSON del plan
// crece con cada iteración (inventario, palancas, borrador, etc) y puede
// alcanzar ese límite. stripEmptyValues elimina null/undefined/'' + maps {} +
// arrays [] vacíos recursivamente para reducir el tamaño antes de persistir.
function stripEmptyValues(value: any): any {
  if (value === null || value === undefined) return undefined
  if (Array.isArray(value)) {
    const cleaned = value.map(stripEmptyValues).filter(v => v !== undefined)
    return cleaned
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) {
      const cleaned = stripEmptyValues(v)
      if (cleaned === undefined) continue
      // Strip empty strings, empty objects, empty arrays.
      if (cleaned === '') continue
      if (typeof cleaned === 'object' && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0) continue
      if (Array.isArray(cleaned) && cleaned.length === 0) continue
      out[k] = cleaned
    }
    return out
  }
  return value
}

const AIRTABLE_LONG_TEXT_LIMIT = 100000

export async function updatePlanEstrategico(id: string, data: Partial<{
  nombre: string
  area: string
  estado: string
  horizonte: string
  proposito: PropositorPE
  situacion: SituacionPE
  datos_faltantes: string[]
  alineacion_sr: string
  plan: PlanoPE
  // Sistema Sr→Jr: campos persistibles del Plan Estratégico.
  lineas_jr: any[]                        // tipo: LineaJrPersistida[] — serializado a JSON.
  movs_heredados_ids: string[]            // solo Plan Jr — IDs de movs del Sr.
  movs_heredados_snapshot: any[]          // solo Plan Jr — array de MovimientoPE entero.
  contexto_curado: ContextoCuradoJr       // solo Plan Jr — los 5 campos del contexto.
  dueno_jr_email: string                  // solo Plan Jr — email del dueño formal.
}>): Promise<void> {
  const fields: Record<string, any> = {}
  if (data.nombre !== undefined) fields['Nombre'] = data.nombre
  if (data.area !== undefined) fields['Area'] = data.area
  if (data.estado !== undefined) fields['Estado'] = data.estado
  if (data.horizonte !== undefined) fields['Horizonte'] = data.horizonte
  if (data.alineacion_sr !== undefined) fields['Alineacion Sr'] = data.alineacion_sr
  if (data.datos_faltantes !== undefined) fields['Datos Faltantes'] = JSON.stringify(data.datos_faltantes)
  // Sistema Sr→Jr — campos serializados a JSON cuando aplican. La validación
  // de tamaño contra AIRTABLE_LONG_TEXT_LIMIT es relevante sobre todo para
  // movs_heredados_snapshot (puede crecer con muchos movs). El resto son
  // payloads chicos.
  if (data.lineas_jr !== undefined) fields['Lineas Jr JSON'] = JSON.stringify(data.lineas_jr)
  if (data.movs_heredados_ids !== undefined) fields['Movs Heredados IDs'] = JSON.stringify(data.movs_heredados_ids)
  if (data.movs_heredados_snapshot !== undefined) {
    const snapshotJson = JSON.stringify(data.movs_heredados_snapshot)
    if (snapshotJson.length > AIRTABLE_LONG_TEXT_LIMIT) {
      throw new Error(
        `Movs Heredados Snapshot JSON excede el límite de Airtable Long Text field (${snapshotJson.length} > ${AIRTABLE_LONG_TEXT_LIMIT} chars). ` +
        `Considerá normalizar el snapshot (ej: solo IDs + un campo aparte por mov).`,
      )
    }
    fields['Movs Heredados Snapshot'] = snapshotJson
  }
  if (data.contexto_curado !== undefined) {
    // Split en 5 campos de Airtable (uno por concepto). Ver CONTEXTO_CURADO_CAMPOS.
    for (const campo of CONTEXTO_CURADO_CAMPOS) {
      fields[campo.field] = data.contexto_curado[campo.key] ?? ''
    }
  }
  if (data.dueno_jr_email !== undefined) fields['Dueno Jr Email'] = data.dueno_jr_email
  if (data.plan !== undefined) {
    // Strategy: split los 3 sub-keys más pesados a Airtable fields separados:
    //   - plan.borrador   → "Plan Borrador JSON"   (3.C — iteraciones de Opus)
    //   - plan.inventario → "Plan Inventario JSON" (3.A — movs + razonamientos)
    //   - plan.curado     → "Plan Curado JSON"     (3.E — versionado final)
    // El resto del plan (proposito en plan, palancas, estres, preparativos)
    // queda en "Plan Paso 3 JSON". Razón: cada sub-key crece monotónico y
    // combinados saturan el límite de 100k chars del Long Text field.
    //
    // Cleanup defensive: stripEmptyValues reduce null/empty antes de
    // serializar (10-30% típicamente). Si después del strip + split alguno
    // todavía excede el límite, throw con error útil.
    const { borrador, inventario, curado, ...planRest } = data.plan as any
    const cleanedPlanRest = stripEmptyValues(planRest)
    const planJson = JSON.stringify(cleanedPlanRest)
    if (planJson.length > AIRTABLE_LONG_TEXT_LIMIT) {
      throw new Error(
        `Plan JSON (sin borrador/inventario/curado) excede el límite de Airtable Long Text field (${planJson.length} > ${AIRTABLE_LONG_TEXT_LIMIT} chars). ` +
        `Las 3 sub-keys grandes ya están en fields aparte. El exceso viene de palancas (preguntas_principal + preguntas_validador + respuestas + observaciones) o estres (preguntas + respuestas + observaciones + ajustes). ` +
        `Próximo split candidato: palancas o estres en field aparte.`,
      )
    }
    fields['Plan Paso 3 JSON'] = planJson

    // Helper para serializar + validar tamaño de cada sub-key splitado.
    function persistirSubKey(label: string, fieldName: string, value: any) {
      if (value === undefined) return 0
      const cleaned = stripEmptyValues(value)
      const json = cleaned !== undefined ? JSON.stringify(cleaned) : ''
      if (json.length > AIRTABLE_LONG_TEXT_LIMIT) {
        throw new Error(
          `${label} JSON excede el límite de Airtable Long Text field (${json.length} > ${AIRTABLE_LONG_TEXT_LIMIT} chars). ` +
          `Habría que recortar/normalizar contenido o splitear este sub-key en sub-fields.`,
        )
      }
      fields[fieldName] = json
      return json.length
    }

    const borradorSize = persistirSubKey('Borrador', 'Plan Borrador JSON', borrador)
    const inventarioSize = persistirSubKey('Inventario', 'Plan Inventario JSON', inventario)
    // Curado: denormalizar antes de persistir. Cada versión guarda solo IDs
    // (movimientos_ids[]) y descripciones (supuestos_criticos_descripciones[])
    // en lugar de los objetos completos — esos viven en plan.inventario y
    // plan.preparativos. La hidratación al leer reconstruye el shape rico.
    // Reduce ~75k chars por versión a ~5-10k. Ver lib/curado-persistence.ts.
    const curadoParaPersistir = denormalizarCurado(curado, inventario)
    const curadoSize = persistirSubKey('Curado', 'Plan Curado JSON', curadoParaPersistir)

    console.log(`[updatePlanEstrategico] split: plan=${planJson.length} · inventario=${inventarioSize} · borrador=${borradorSize} · curado=${curadoSize} chars`)
  }
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
  // typecast:true por la misma razón que createPlanEstrategico (estado
  // 'Listo para compartir' del despliegue Jr auto-create). Seguro: este update
  // solo escribe campos text/select/JSON, ningún multipleRecordLinks.
  await updateRecord(TABLA_PLANES_PE, id, fields, { typecast: true })
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
  auditorias_paso_3_count?: number
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
  if (data.auditorias_paso_3_count !== undefined) fields['Auditorias Paso 3 Count'] = data.auditorias_paso_3_count
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
  paso: 1 | 2 | 3,
  currentCount: number,
): Promise<number> {
  const MAX = 3
  if (currentCount >= MAX) {
    throw new Error(`Auditorías del Paso ${paso} ya en el máximo (${MAX}). No se puede incrementar.`)
  }
  const nuevo = currentCount + 1
  const fieldKey =
    paso === 1 ? 'auditorias_paso_1_count' :
    paso === 2 ? 'auditorias_paso_2_count' :
    'auditorias_paso_3_count'
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
    // Audit retroactivo / educativo (no debe aplicarse al plan vivo).
    // Cuando true, la UI termina en Pantalla 3 con botón "Cerrar".
    read_only?: boolean
    // true = audit corrida desde script de orquestación (no desde la UI).
    // Útil para el dashboard de métricas + indicador de procedencia.
    via_script?: boolean
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
    [TURNOS_FIELD_REVIEWER_READ_ONLY]: !!data.read_only,
    [TURNOS_FIELD_REVIEWER_VIA_SCRIPT]: !!data.via_script,
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
  readOnly: boolean
  viaScript: boolean
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
      readOnly: r.fields?.['Reviewer Read Only'] === true,
      viaScript: r.fields?.['Reviewer Ejecutado Via Script'] === true,
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
