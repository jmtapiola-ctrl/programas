// Verificación del estado actual de los campos del Plan Sr de Terravinci
// después del cierre del Paso 2 por el usuario.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const BASE_ID = process.env.AIRTABLE_BASE_ID
const API_KEY = process.env.AIRTABLE_API_KEY
const TABLA_PLANES_PE = 'tblPJC1VMQclfCqc7'
const PLAN_ID = 'recFMWxoE5gTQQrf7'

const CAMPOS_INTERES = [
  'Nombre',
  'Area',
  'Estado',
  'Horizonte',
  'Proposito Escena',
  'Proposito Metricas',
  'Proposito Fuera',
  'Proposito Estabilidad',
  'Situacion Desvio Principal',
  'Situacion Desvio Cuantificado',
  'Situacion Desvios Secundarios',
  'Situacion Causa Raiz',
  'Situacion Consecuencia 6m',
  'Situacion Consecuencia 12m',
  'Situacion Recursos Actuales',
  'Situacion Recursos Faltantes',
  'Situacion Intentos Previos',
  'Situacion Resistencias',
  'Datos Faltantes',
]

async function main() {
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLA_PLANES_PE}/${PLAN_ID}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
    cache: 'no-store',
  } as RequestInit)
  if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`)
  const record = await r.json()

  console.log('═'.repeat(72))
  console.log(`Plan: ${record.id}`)
  console.log(`Last modified time: ${record.createdTime} (createdTime; modifiedTime no expuesto por API)`)
  console.log('═'.repeat(72))
  console.log()

  const f = record.fields ?? {}

  const status: { campo: string; estado: 'POBLADO' | 'VACÍO' | 'NO_EXISTE'; preview: string }[] = []

  for (const campo of CAMPOS_INTERES) {
    const valor = f[campo]
    let estado: 'POBLADO' | 'VACÍO' | 'NO_EXISTE'
    let preview: string

    if (valor === undefined) {
      estado = 'NO_EXISTE'
      preview = '(field not present in record)'
    } else if (valor === '' || valor === null) {
      estado = 'VACÍO'
      preview = '""'
    } else if (typeof valor === 'string') {
      // Verificar si es un JSON serializado de array vacío
      const trimmed = valor.trim()
      if (trimmed === '[]' || trimmed === '{}') {
        estado = 'VACÍO'
        preview = trimmed
      } else {
        estado = 'POBLADO'
        preview = `"${valor.slice(0, 120).replace(/\n/g, ' ')}${valor.length > 120 ? '...' : ''}"`
      }
    } else if (Array.isArray(valor)) {
      if (valor.length === 0) {
        estado = 'VACÍO'
        preview = '[]'
      } else {
        estado = 'POBLADO'
        preview = JSON.stringify(valor).slice(0, 120) + (JSON.stringify(valor).length > 120 ? '...' : '')
      }
    } else {
      estado = 'POBLADO'
      preview = JSON.stringify(valor).slice(0, 120)
    }

    status.push({ campo, estado, preview })
  }

  // Imprimir tabla
  const maxName = Math.max(...status.map(s => s.campo.length))
  for (const s of status) {
    const icon = s.estado === 'POBLADO' ? '✔' : s.estado === 'VACÍO' ? '✗' : '?'
    console.log(`  ${icon} ${s.campo.padEnd(maxName + 2)} ${s.estado.padEnd(10)} ${s.preview}`)
  }

  // Resumen
  const poblados = status.filter(s => s.estado === 'POBLADO').length
  const vacios = status.filter(s => s.estado === 'VACÍO').length
  const noExiste = status.filter(s => s.estado === 'NO_EXISTE').length
  console.log()
  console.log(`Resumen: ${poblados} poblados, ${vacios} vacíos, ${noExiste} no presentes (de ${status.length})`)

  // Veredicto
  console.log()
  console.log('═'.repeat(72))
  console.log('VEREDICTO')
  console.log('═'.repeat(72))

  // Campos que el usuario dijo que estaban vacíos antes del cierre
  const camposCriticos = [
    'Situacion Desvio Principal',
    'Situacion Desvio Cuantificado',
    'Situacion Desvios Secundarios',
    'Situacion Causa Raiz',
    'Situacion Consecuencia 6m',
    'Situacion Consecuencia 12m',
    'Situacion Recursos Actuales',
    'Situacion Recursos Faltantes',
    'Situacion Intentos Previos',
    'Situacion Resistencias',
    'Datos Faltantes',
    'Proposito Fuera',
    'Proposito Estabilidad',
  ]
  const criticosPoblados = status.filter(s => camposCriticos.includes(s.campo) && s.estado === 'POBLADO')
  const criticosVacios = status.filter(s => camposCriticos.includes(s.campo) && s.estado !== 'POBLADO')

  console.log(`Campos críticos POBLADOS: ${criticosPoblados.length}/${camposCriticos.length}`)
  console.log(`Campos críticos VACÍOS:   ${criticosVacios.length}/${camposCriticos.length}`)
  console.log()

  let escenario: 'a' | 'b' | 'c'
  if (criticosVacios.length === 0) escenario = 'a'
  else if (criticosPoblados.length === 0) escenario = 'c'
  else escenario = 'b'

  if (escenario === 'a') {
    console.log('ESCENARIO (a) — TODOS poblados.')
    console.log('  El PANEL_UPDATE final del cierre pobló todos los campos correctamente.')
    console.log('  Pero durante la conversación NO se persistían — sigue habiendo bug para usuarios futuros.')
  } else if (escenario === 'b') {
    console.log('ESCENARIO (b) — POBLAMIENTO PARCIAL.')
    console.log(`  ${criticosPoblados.length} campos sí, ${criticosVacios.length} campos NO.`)
    console.log('  Campos que SIGUEN VACÍOS:')
    for (const s of criticosVacios) console.log(`    - ${s.campo}`)
  } else {
    console.log('ESCENARIO (c) — TODOS siguen vacíos.')
    console.log('  El PANEL_UPDATE final tampoco se persistió. Pipeline de persistencia roto end-to-end.')
  }

  // Guardar dump completo
  const outPath = path.join(ROOT, 'output', '16-plan-state.json')
  fs.writeFileSync(outPath, JSON.stringify({
    checked_at: new Date().toISOString(),
    plan_id: PLAN_ID,
    fields: f,
    status,
    escenario,
  }, null, 2))
  console.log()
  console.log(`Dump completo: ${outPath}`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
