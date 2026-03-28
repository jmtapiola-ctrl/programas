import type {
  Usuario,
  Programa,
  Objetivo,
  Cumplimiento,
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

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapUsuario(r: any): Usuario {
  return {
    id: r.id,
    nombre: r.fields['fldFbWbFkhxmr7hRf'] ?? '',
    email: r.fields['fld0IIhsqQw2yny1Z'] ?? '',
    rol: r.fields['fldbVYb9q3OTbmlYR'] ?? 'Staff',
    activo: r.fields['fldtHzaYrxVt1e8q3'] ?? false,
  }
}

function mapPrograma(r: any): Programa {
  return {
    id: r.id,
    nombre: r.fields['fldrTj1ggeu12uVKu'] ?? '',
    descripcion: r.fields['fldlv4tR7tMoMMFZC'],
    objetivoMayor: r.fields['fldQuyth3IWcNzZ9g'],
    estado: r.fields['fldCNL2ZzxXfmM1KH'] ?? 'Borrador',
    responsableIds: r.fields['fldHbc6OhAkKF1iMC'] ?? [],
    fechaInicio: r.fields['fldxG2voOTeZGdXeM'],
    fechaObjetivo: r.fields['fld8fgmt8NGWj21oe'],
    notas: r.fields['fldjEen4uHIVABGPZ'],
    objetivoIds: r.fields['fldXxfiyv5DbvwTsZ'] ?? [],
  }
}

function mapObjetivo(r: any): Objetivo {
  return {
    id: r.id,
    nombre: r.fields['fldoAaiHZ0wE8skdB'] ?? '',
    tipo: r.fields['fld3P1VeDX9ierG8i'] ?? 'Operativo',
    programaIds: r.fields['fldVwyD7NNocHhORP'] ?? [],
    responsableIds: r.fields['fldcG10p89bDRUU0X'] ?? [],
    estado: r.fields['flddQzgB28scsTuLu'] ?? 'Pendiente',
    fechaLimite: r.fields['fldU1Lo1GbvDrFDuF'],
    descripcionDoingness: r.fields['fldPhw8QNJneQlJDV'],
    esRepetible: r.fields['fld0BCz0UMO7K5wCn'] ?? false,
    orden: r.fields['fldxX3JXMRguaJD2Y'],
    notas: r.fields['fldhlEJR4FBhXqC6D'],
    pbIds: r.fields['fldYvTmZeYdS8HO0H'] ?? [],
    cumplimientoIds: r.fields['fldrVW9e5WdhMpERq'] ?? [],
  }
}

function mapCumplimiento(r: any): Cumplimiento {
  return {
    id: r.id,
    cumplimiento: r.fields['fldI9lmK5k3nRNeA5'],
    objetivoIds: r.fields['fldXcu6A5QKwABMtf'] ?? [],
    reportadoPorIds: r.fields['fldb3G45AIdA6YdZ7'] ?? [],
    fecha: r.fields['fld8GA6aFyu09Ofp5'],
    descripcionCumplimiento: r.fields['fld1NMRnk5IEm0UGc'],
    aprobado: r.fields['fldGEkCdV9t2kxsky'] ?? false,
  }
}

function mapPB(r: any): PlanDeBatalla {
  return {
    id: r.id,
    titulo: r.fields['fldUdkIDSJ5bpkWQ1'] ?? '',
    responsableIds: r.fields['fldyGJqVjj9gGYCY4'] ?? [],
    periodo: r.fields['fldhCdfSUagl3qWvg'] ?? 'Día',
    fecha: r.fields['flduXU9YPEnp04XvA'],
    estado: r.fields['fldyxNXiYbvSM1Ngb'] ?? 'Borrador',
    objetivosIncluidosIds: r.fields['fldi9AIteXA9P4gp4'] ?? [],
    notas: r.fields['fldtZNjSntLLyPYlf'],
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
  const formula = encodeURIComponent(`{fld0IIhsqQw2yny1Z}="${email}"`)
  const records = await fetchAll(TABLA_USUARIOS, `filterByFormula=${formula}`)
  if (!records.length) return null
  return mapUsuario(records[0])
}

export async function createUsuario(data: Partial<Usuario>): Promise<Usuario> {
  const fields: Record<string, any> = {}
  if (data.nombre) fields['fldFbWbFkhxmr7hRf'] = data.nombre
  if (data.email) fields['fld0IIhsqQw2yny1Z'] = data.email
  if (data.rol) fields['fldbVYb9q3OTbmlYR'] = data.rol
  if (data.activo !== undefined) fields['fldtHzaYrxVt1e8q3'] = data.activo
  const r = await createRecord(TABLA_USUARIOS, fields)
  return mapUsuario(r)
}

export async function updateUsuario(id: string, data: Partial<Usuario>): Promise<Usuario> {
  const fields: Record<string, any> = {}
  if (data.nombre !== undefined) fields['fldFbWbFkhxmr7hRf'] = data.nombre
  if (data.email !== undefined) fields['fld0IIhsqQw2yny1Z'] = data.email
  if (data.rol !== undefined) fields['fldbVYb9q3OTbmlYR'] = data.rol
  if (data.activo !== undefined) fields['fldtHzaYrxVt1e8q3'] = data.activo
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
  if (data.nombre) fields['fldrTj1ggeu12uVKu'] = data.nombre
  if (data.descripcion) fields['fldlv4tR7tMoMMFZC'] = data.descripcion
  if (data.objetivoMayor) fields['fldQuyth3IWcNzZ9g'] = data.objetivoMayor
  if (data.estado) fields['fldCNL2ZzxXfmM1KH'] = data.estado
  if (data.responsableIds?.length) fields['fldHbc6OhAkKF1iMC'] = data.responsableIds
  if (data.fechaInicio) fields['fldxG2voOTeZGdXeM'] = data.fechaInicio
  if (data.fechaObjetivo) fields['fld8fgmt8NGWj21oe'] = data.fechaObjetivo
  if (data.notas) fields['fldjEen4uHIVABGPZ'] = data.notas
  const r = await createRecord(TABLA_PROGRAMAS, fields)
  return mapPrograma(r)
}

export async function updatePrograma(id: string, data: Partial<Programa>): Promise<Programa> {
  const fields: Record<string, any> = {}
  if (data.nombre !== undefined) fields['fldrTj1ggeu12uVKu'] = data.nombre
  if (data.descripcion !== undefined) fields['fldlv4tR7tMoMMFZC'] = data.descripcion
  if (data.objetivoMayor !== undefined) fields['fldQuyth3IWcNzZ9g'] = data.objetivoMayor
  if (data.estado !== undefined) fields['fldCNL2ZzxXfmM1KH'] = data.estado
  if (data.responsableIds !== undefined) fields['fldHbc6OhAkKF1iMC'] = data.responsableIds
  if (data.fechaInicio !== undefined) fields['fldxG2voOTeZGdXeM'] = data.fechaInicio
  if (data.fechaObjetivo !== undefined) fields['fld8fgmt8NGWj21oe'] = data.fechaObjetivo
  if (data.notas !== undefined) fields['fldjEen4uHIVABGPZ'] = data.notas
  const r = await updateRecord(TABLA_PROGRAMAS, id, fields)
  return mapPrograma(r)
}

export async function deletePrograma(id: string): Promise<void> {
  await deleteRecord(TABLA_PROGRAMAS, id)
}

// ─── Objetivos ────────────────────────────────────────────────────────────────

export const TABLA_OBJETIVOS = 'tbl9ljCeFDMeCsbAT'

export async function getObjetivos(programaId?: string): Promise<Objetivo[]> {
  let params = 'sort[0][field]=fldxX3JXMRguaJD2Y&sort[0][direction]=asc'
  if (programaId) {
    const formula = encodeURIComponent(`FIND("${programaId}", ARRAYJOIN({fldVwyD7NNocHhORP}))`)
    params += `&filterByFormula=${formula}`
  }
  const records = await fetchAll(TABLA_OBJETIVOS, params)
  return records.map(mapObjetivo)
}

export async function getObjetivosByResponsable(usuarioId: string): Promise<Objetivo[]> {
  const formula = encodeURIComponent(`FIND("${usuarioId}", ARRAYJOIN({fldcG10p89bDRUU0X}))`)
  const records = await fetchAll(TABLA_OBJETIVOS, `filterByFormula=${formula}`)
  return records.map(mapObjetivo)
}

export async function getObjetivo(id: string): Promise<Objetivo> {
  const r = await fetchOne(TABLA_OBJETIVOS, id)
  return mapObjetivo(r)
}

export async function createObjetivo(data: Partial<Objetivo>): Promise<Objetivo> {
  const fields: Record<string, any> = {}
  if (data.nombre) fields['fldoAaiHZ0wE8skdB'] = data.nombre
  if (data.tipo) fields['fld3P1VeDX9ierG8i'] = data.tipo
  if (data.programaIds?.length) fields['fldVwyD7NNocHhORP'] = data.programaIds
  if (data.responsableIds?.length) fields['fldcG10p89bDRUU0X'] = data.responsableIds
  if (data.estado) fields['flddQzgB28scsTuLu'] = data.estado
  if (data.fechaLimite) fields['fldU1Lo1GbvDrFDuF'] = data.fechaLimite
  if (data.descripcionDoingness) fields['fldPhw8QNJneQlJDV'] = data.descripcionDoingness
  if (data.esRepetible !== undefined) fields['fld0BCz0UMO7K5wCn'] = data.esRepetible
  if (data.orden !== undefined) fields['fldxX3JXMRguaJD2Y'] = data.orden
  if (data.notas) fields['fldhlEJR4FBhXqC6D'] = data.notas
  const r = await createRecord(TABLA_OBJETIVOS, fields)
  return mapObjetivo(r)
}

export async function updateObjetivo(id: string, data: Partial<Objetivo>): Promise<Objetivo> {
  const fields: Record<string, any> = {}
  if (data.nombre !== undefined) fields['fldoAaiHZ0wE8skdB'] = data.nombre
  if (data.tipo !== undefined) fields['fld3P1VeDX9ierG8i'] = data.tipo
  if (data.programaIds !== undefined) fields['fldVwyD7NNocHhORP'] = data.programaIds
  if (data.responsableIds !== undefined) fields['fldcG10p89bDRUU0X'] = data.responsableIds
  if (data.estado !== undefined) fields['flddQzgB28scsTuLu'] = data.estado
  if (data.fechaLimite !== undefined) fields['fldU1Lo1GbvDrFDuF'] = data.fechaLimite
  if (data.descripcionDoingness !== undefined) fields['fldPhw8QNJneQlJDV'] = data.descripcionDoingness
  if (data.esRepetible !== undefined) fields['fld0BCz0UMO7K5wCn'] = data.esRepetible
  if (data.orden !== undefined) fields['fldxX3JXMRguaJD2Y'] = data.orden
  if (data.notas !== undefined) fields['fldhlEJR4FBhXqC6D'] = data.notas
  const r = await updateRecord(TABLA_OBJETIVOS, id, fields)
  return mapObjetivo(r)
}

export async function deleteObjetivo(id: string): Promise<void> {
  await deleteRecord(TABLA_OBJETIVOS, id)
}

// ─── Cumplimientos ────────────────────────────────────────────────────────────

export const TABLA_CUMPLIMIENTOS = 'tblTbB0eYz3xsdyNk'

export async function getCumplimientos(objetivoId?: string): Promise<Cumplimiento[]> {
  let params = 'sort[0][field]=fld8GA6aFyu09Ofp5&sort[0][direction]=desc'
  if (objetivoId) {
    const formula = encodeURIComponent(`FIND("${objetivoId}", ARRAYJOIN({fldXcu6A5QKwABMtf}))`)
    params += `&filterByFormula=${formula}`
  }
  const records = await fetchAll(TABLA_CUMPLIMIENTOS, params)
  return records.map(mapCumplimiento)
}

export async function createCumplimiento(data: Partial<Cumplimiento>): Promise<Cumplimiento> {
  const fields: Record<string, any> = {}
  if (data.objetivoIds?.length) fields['fldXcu6A5QKwABMtf'] = data.objetivoIds
  if (data.reportadoPorIds?.length) fields['fldb3G45AIdA6YdZ7'] = data.reportadoPorIds
  if (data.fecha) fields['fld8GA6aFyu09Ofp5'] = data.fecha
  if (data.descripcionCumplimiento) fields['fld1NMRnk5IEm0UGc'] = data.descripcionCumplimiento
  if (data.aprobado !== undefined) fields['fldGEkCdV9t2kxsky'] = data.aprobado
  const r = await createRecord(TABLA_CUMPLIMIENTOS, fields)
  return mapCumplimiento(r)
}

export async function updateCumplimiento(id: string, data: Partial<Cumplimiento>): Promise<Cumplimiento> {
  const fields: Record<string, any> = {}
  if (data.aprobado !== undefined) fields['fldGEkCdV9t2kxsky'] = data.aprobado
  if (data.descripcionCumplimiento !== undefined) fields['fld1NMRnk5IEm0UGc'] = data.descripcionCumplimiento
  const r = await updateRecord(TABLA_CUMPLIMIENTOS, id, fields)
  return mapCumplimiento(r)
}

// ─── Planes de Batalla ────────────────────────────────────────────────────────

export const TABLA_PB = 'tbliUTM4zaoyztD6O'

export async function getPlanesDB(responsableId?: string): Promise<PlanDeBatalla[]> {
  let params = 'sort[0][field]=flduXU9YPEnp04XvA&sort[0][direction]=desc'
  if (responsableId) {
    const formula = encodeURIComponent(`FIND("${responsableId}", ARRAYJOIN({fldyGJqVjj9gGYCY4}))`)
    params += `&filterByFormula=${formula}`
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
  if (data.titulo) fields['fldUdkIDSJ5bpkWQ1'] = data.titulo
  if (data.responsableIds?.length) fields['fldyGJqVjj9gGYCY4'] = data.responsableIds
  if (data.periodo) fields['fldhCdfSUagl3qWvg'] = data.periodo
  if (data.fecha) fields['flduXU9YPEnp04XvA'] = data.fecha
  if (data.estado) fields['fldyxNXiYbvSM1Ngb'] = data.estado
  if (data.objetivosIncluidosIds?.length) fields['fldi9AIteXA9P4gp4'] = data.objetivosIncluidosIds
  if (data.notas) fields['fldtZNjSntLLyPYlf'] = data.notas
  const r = await createRecord(TABLA_PB, fields)
  return mapPB(r)
}

export async function updatePlanDB(id: string, data: Partial<PlanDeBatalla>): Promise<PlanDeBatalla> {
  const fields: Record<string, any> = {}
  if (data.titulo !== undefined) fields['fldUdkIDSJ5bpkWQ1'] = data.titulo
  if (data.responsableIds !== undefined) fields['fldyGJqVjj9gGYCY4'] = data.responsableIds
  if (data.periodo !== undefined) fields['fldhCdfSUagl3qWvg'] = data.periodo
  if (data.fecha !== undefined) fields['flduXU9YPEnp04XvA'] = data.fecha
  if (data.estado !== undefined) fields['fldyxNXiYbvSM1Ngb'] = data.estado
  if (data.objetivosIncluidosIds !== undefined) fields['fldi9AIteXA9P4gp4'] = data.objetivosIncluidosIds
  if (data.notas !== undefined) fields['fldtZNjSntLLyPYlf'] = data.notas
  const r = await updateRecord(TABLA_PB, id, fields)
  return mapPB(r)
}

export async function deletePlanDB(id: string): Promise<void> {
  await deleteRecord(TABLA_PB, id)
}
