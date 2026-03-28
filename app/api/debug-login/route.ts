import { NextResponse } from 'next/server'

const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`
const API_KEY = process.env.AIRTABLE_API_KEY
const TABLA_USUARIOS = 'tblXhgSBuh0f1BNPV'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email') ?? 'jmtapiola@gmail.com'

  // 1. Listar los primeros registros sin filtro para ver cómo vienen los campos
  const rawRes = await fetch(
    `${BASE_URL}/${TABLA_USUARIOS}?pageSize=3`,
    {
      headers: { Authorization: `Bearer ${API_KEY}` },
      cache: 'no-store',
    }
  )
  const rawData = await rawRes.json()

  // 2. Buscar por email con filterByFormula
  const formula = encodeURIComponent(`{Email}="${email}"`)
  const filterRes = await fetch(
    `${BASE_URL}/${TABLA_USUARIOS}?filterByFormula=${formula}`,
    {
      headers: { Authorization: `Bearer ${API_KEY}` },
      cache: 'no-store',
    }
  )
  const filterData = await filterRes.json()

  return NextResponse.json({
    rawStatus: rawRes.status,
    rawRecords: rawData,
    filterStatus: filterRes.status,
    filterResult: filterData,
  })
}
