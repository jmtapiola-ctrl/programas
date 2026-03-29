import { NextResponse } from 'next/server'

const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`
const API_KEY = process.env.AIRTABLE_API_KEY
const TABLA_OBJETIVOS = 'tbl9ljCeFDMeCsbAT'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const programaId = searchParams.get('programaId') ?? 'rec4dbjoMzyze8pTQ'

  // 1. Todos los objetivos sin filtro (primeros 10)
  const rawRes = await fetch(
    `${BASE_URL}/${TABLA_OBJETIVOS}?pageSize=10`,
    { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' }
  )
  const rawData = await rawRes.json()

  // 2. Con filtro por programa
  const formula = encodeURIComponent(`FIND("${programaId}", ARRAYJOIN({Programa}))`)
  const filterRes = await fetch(
    `${BASE_URL}/${TABLA_OBJETIVOS}?filterByFormula=${formula}`,
    { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' }
  )
  const filterData = await filterRes.json()

  // 3. Con sort por Orden
  const sortRes = await fetch(
    `${BASE_URL}/${TABLA_OBJETIVOS}?sort[0][field]=Orden&sort[0][direction]=asc&pageSize=10`,
    { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' }
  )
  const sortData = await sortRes.json()

  return NextResponse.json({
    rawStatus: rawRes.status,
    rawFirstRecord: rawData.records?.[0] ?? rawData,
    rawTotal: rawData.records?.length,
    filterStatus: filterRes.status,
    filterResult: filterData,
    sortStatus: sortRes.status,
    sortError: sortData.error ?? null,
  })
}
