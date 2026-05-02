// Parsea raw-md.md → turns.json + clean-md.md
// Fija el mojibake (UTF-8 leído como Latin-1) y separa por turnos.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const rawPath = path.join(ROOT, 'raw-md.md')
const cleanPath = path.join(ROOT, 'output', 'clean-md.md')
const turnsPath = path.join(ROOT, 'output', 'turns-md.json')

// 1. Leer raw como latin1, re-decodificar como utf8 para arreglar mojibake.
//    El archivo en disco está guardado como UTF-8 que contiene chars como "Ã¡"
//    (bytes 0xC3 0x83 0xC2 0xA1 en utf8). Si lo leo como latin1, obtengo
//    una string con esos chars literales (0xC3 0x83 0xC2 0xA1). Esos bytes,
//    interpretados como UTF-8, dan "á" (que es lo que queremos).
const rawBuf = fs.readFileSync(rawPath)
// El raw es UTF-8 (porque Write lo escribió como utf8). Para deshacer la
// doble codificación: leerlo como utf8 (string interna con chars Ã¡), luego
// pasarlo a latin1 bytes y reinterpretar como utf8.
const rawStr = rawBuf.toString('utf8')
const fixed = Buffer.from(rawStr, 'latin1').toString('utf8')

// 2. Separar en paragrafos. La especificación dice "dobles \n\n".
//    Permito 2+ newlines.
const paragraphs = fixed.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean)

// 3. Alternar user/model. Comienza en user ("Comenzar entrevista").
const turns = paragraphs.map((contenido, i) => ({
  index: i,
  rol: i % 2 === 0 ? 'user' : 'model',
  contenido,
  longitud_chars: contenido.length,
  tiene_panel_update: /<!--\s*PANEL_UPDATE\s*-->/.test(contenido),
}))

// 4. Diagnostic numbers
const total = turns.length
const userCount = turns.filter(t => t.rol === 'user').length
const modelCount = turns.filter(t => t.rol === 'model').length
const charsTotalUser = turns.filter(t => t.rol === 'user').reduce((a, t) => a + t.longitud_chars, 0)
const charsTotalModel = turns.filter(t => t.rol === 'model').reduce((a, t) => a + t.longitud_chars, 0)
const turnosConPanel = turns.filter(t => t.tiene_panel_update).length

console.log('='.repeat(70))
console.log('PARSE MD — resumen')
console.log('='.repeat(70))
console.log(`Turnos totales:        ${total}`)
console.log(`  user:                ${userCount}`)
console.log(`  model:               ${modelCount}`)
console.log(`Chars totales user:    ${charsTotalUser.toLocaleString()}`)
console.log(`Chars totales model:   ${charsTotalModel.toLocaleString()}`)
console.log(`Chars totales total:   ${(charsTotalUser + charsTotalModel).toLocaleString()}`)
console.log(`Turnos con PANEL_UPDATE inline (sospecha de leak): ${turnosConPanel}`)
console.log()
console.log(`Primer turno (user, primeros 80 chars):`)
console.log(`  "${turns[0].contenido.slice(0, 80)}..."`)
console.log(`Último turno (rol=${turns.at(-1).rol}, primeros 80 chars):`)
console.log(`  "${turns.at(-1).contenido.slice(0, 80)}..."`)

// 5. Guardar
fs.mkdirSync(path.dirname(turnsPath), { recursive: true })
fs.writeFileSync(turnsPath, JSON.stringify(turns, null, 2))
fs.writeFileSync(cleanPath, fixed)

console.log()
console.log(`✔ Escrito: ${turnsPath}`)
console.log(`✔ Escrito: ${cleanPath}`)
