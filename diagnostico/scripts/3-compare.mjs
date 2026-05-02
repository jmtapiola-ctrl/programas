// Compara MD vs Airtable turno-a-turno.
// Identifica:
//   - Coincidencia de los primeros N turnos (donde N = airtable.length)
//   - Punto exacto donde se cortó el guardado
//   - Qué turnos se perdieron (los del 29-30/4)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'output', 'turns-md.json'), 'utf8'))
const airtableData = JSON.parse(fs.readFileSync(path.join(ROOT, 'output', 'airtable-historial-real.json'), 'utf8'))
const at = airtableData.historial

console.log('='.repeat(70))
console.log('COMPARACIÓN MD vs AIRTABLE')
console.log('='.repeat(70))
console.log(`MD turnos:      ${md.length}`)
console.log(`Airtable turnos: ${at.length}`)
console.log(`Diferencia:     ${md.length - at.length} turnos perdidos`)
console.log()

// 1. Verificar match de los primeros N (rolling content match)
//    El MD es texto visible; Airtable persistido es texto visible (sin PANEL_UPDATE).
//    Deberían coincidir aprox. carácter-por-carácter después de normalizar whitespace.

function normalize(s) {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

let matched = 0
let firstMismatch = null
const minLen = Math.min(md.length, at.length)
for (let i = 0; i < minLen; i++) {
  const mdNorm = normalize(md[i].contenido)
  const atNorm = normalize(at[i].contenido)
  // Match laxo: mismo rol y los primeros 100 chars coinciden
  const mdHead = mdNorm.slice(0, 100)
  const atHead = atNorm.slice(0, 100)
  if (md[i].rol !== at[i].rol) {
    firstMismatch = { i, reason: 'rol', mdRol: md[i].rol, atRol: at[i].rol }
    break
  }
  if (mdHead !== atHead) {
    firstMismatch = { i, reason: 'content', mdHead, atHead }
    break
  }
  matched++
}

console.log(`Turnos que coinciden carácter-a-carácter en los primeros 100 chars: ${matched}/${minLen}`)
if (firstMismatch) {
  console.log(`Primer desajuste en index ${firstMismatch.i} — razón: ${firstMismatch.reason}`)
  if (firstMismatch.reason === 'content') {
    console.log(`  MD:  "${firstMismatch.mdHead}"`)
    console.log(`  AT:  "${firstMismatch.atHead}"`)
  }
} else {
  console.log('✔ Los primeros N turnos coinciden perfectamente entre MD y Airtable.')
}

// 2. Mostrar turnos perdidos (MD[at.length .. md.length-1])
console.log()
console.log('='.repeat(70))
console.log(`TURNOS PERDIDOS — MD[${at.length}..${md.length - 1}]`)
console.log('='.repeat(70))
const perdidos = md.slice(at.length)
console.log(`Total perdidos: ${perdidos.length}`)
const userPerdidos = perdidos.filter(t => t.rol === 'user').length
const modelPerdidos = perdidos.filter(t => t.rol === 'model').length
console.log(`  user perdidos:  ${userPerdidos}`)
console.log(`  model perdidos: ${modelPerdidos}`)
console.log()

// Listar primeros 100 chars de cada
for (const t of perdidos) {
  console.log(`[MD ${t.index}] ${t.rol.padEnd(5)} (${t.longitud_chars} chars): ${t.contenido.slice(0, 100).replace(/\n/g, ' ')}...`)
}

// 3. Analizar punto exacto del corte
console.log()
console.log('='.repeat(70))
console.log('PUNTO DEL CORTE')
console.log('='.repeat(70))
const lastSaved = at[at.length - 1]
const firstLost = perdidos[0]
const secondLost = perdidos[1]
console.log(`Último turno guardado en Airtable (MD index ${at.length - 1}):`)
console.log(`  rol=${lastSaved.rol}, ts=${lastSaved.timestamp}`)
console.log(`  preview: "${(lastSaved.contenido ?? '').slice(0, 200).replace(/\n/g, ' ')}..."`)
console.log()
console.log(`Primer turno perdido (MD index ${firstLost.index}):`)
console.log(`  rol=${firstLost.rol}`)
console.log(`  preview: "${firstLost.contenido.slice(0, 200).replace(/\n/g, ' ')}..."`)
console.log()
console.log(`Segundo turno perdido (MD index ${secondLost.index}):`)
console.log(`  rol=${secondLost.rol}`)
console.log(`  preview: "${secondLost.contenido.slice(0, 200).replace(/\n/g, ' ')}..."`)

// 4. Calcular tamaño del JSON serializado del historial COMPLETO (74 turnos)
//    para verificar si excede el límite de Airtable.
const fullHistorialJSON = JSON.stringify(md.map(t => ({
  rol: t.rol,
  contenido: t.contenido,
  timestamp: '2026-04-30T00:00:00.000Z',
  paso: 1,
})))
console.log()
console.log('='.repeat(70))
console.log('TAMAÑO DEL HISTORIAL JSON SI SE GUARDARAN LOS 74 TURNOS')
console.log('='.repeat(70))
console.log(`JSON.stringify(74 turnos) = ${fullHistorialJSON.length.toLocaleString()} chars`)
console.log(`Límite multilineText Airtable: 100.000 chars`)
console.log(`Excede el límite por: ${(fullHistorialJSON.length - 100000).toLocaleString()} chars`)
console.log()
console.log(`Tamaño actual del campo en Airtable (62 turnos): ${airtableData.tamaño_campo_chars.toLocaleString()} chars`)

// 5. Calcular incrementalmente cuándo se cruza el límite
console.log()
console.log('='.repeat(70))
console.log('A QUÉ TURNO SE CRUZA EL LÍMITE DE 100k')
console.log('='.repeat(70))
let acum = []
for (let i = 0; i < md.length; i++) {
  acum.push({
    rol: md[i].rol,
    contenido: md[i].contenido,
    timestamp: '2026-04-30T00:00:00.000Z',
    paso: 1,
  })
  const size = JSON.stringify(acum).length
  if (i === 60 || i === 61 || i === 62 || i === 63 || size >= 100000) {
    console.log(`  Después de turno MD[${i}] (rol=${md[i].rol}): JSON = ${size.toLocaleString()} chars`)
    if (size >= 100000) {
      console.log(`  ⚠ CRUZÓ EL LÍMITE en turno MD[${i}]`)
      break
    }
  }
}
