// Helper one-shot: identificar el turno exacto del Airtable donde se cierra
// el Bloque 0+1 del piloto del Plan Sr de Terravinci. NO usa el filtro
// inseguro paso_actual ≤ 1 — busca por contenido.
//
// Salida: lista de turnos que matchean keywords de cierre + paso reportado +
// preview del contenido para identificar visualmente el corte.

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getEntrevistaPE, getTurnosPE } from '@/lib/airtable'

const PLAN_ID = 'recFMWxoE5gTQQrf7'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const entrevista = await getEntrevistaPE(PLAN_ID)
  if (!entrevista) throw new Error('entrevista no encontrada')

  const turnos = await getTurnosPE(entrevista.id)
  console.log(`Total turnos en Airtable: ${turnos.length}`)
  console.log(`Distribución por paso:`)
  const porPaso = new Map<number, number>()
  for (const t of turnos) porPaso.set(t.paso, (porPaso.get(t.paso) ?? 0) + 1)
  for (const [p, n] of [...porPaso.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  paso ${p}: ${n} turnos`)
  }

  // Heurísticas: buscar turnos cerca del cierre del Paso 1.
  // Patterns: "Paso 1" + "cerrado/completo/cierre", "avancemos al Paso 2",
  // "iniciamos Paso 2", "Paso 2 - Situación", etc.
  const keywords = [
    /paso\s*1.{0,20}(cerrado|completo|cierre|terminado|listo|cerramos)/i,
    /avancemos.{0,20}paso\s*2/i,
    /pasamos.{0,20}paso\s*2/i,
    /iniciamos.{0,20}paso\s*2/i,
    /paso\s*2.{0,40}(situaci[oó]n|empieza|arrancamos|comenzamos)/i,
    /cerrado\s+oficialmente/i,
    /paso\s*1\s*[-—]\s*completo/i,
    /paso\s*1\s*completo/i,
  ]

  console.log('\nTurnos que matchean keywords de cierre del Paso 1:')
  console.log('═'.repeat(72))
  turnos.forEach((t, i) => {
    const idx = i + 1
    const matched = keywords.some(re => re.test(t.contenido))
    if (matched) {
      const preview = t.contenido.replace(/\s+/g, ' ').slice(0, 200)
      console.log(`\n[Turno ${idx}, paso=${t.paso}, rol=${t.rol}]`)
      console.log(`  ${preview}${t.contenido.length > 200 ? '...' : ''}`)
    }
  })

  // También listar turnos donde paso_actual transiciona (debería estar cerca)
  console.log('\n\nTransiciones de paso_actual:')
  console.log('═'.repeat(72))
  let pasoPrev = -1
  turnos.forEach((t, i) => {
    if (t.paso !== pasoPrev) {
      const preview = t.contenido.replace(/\s+/g, ' ').slice(0, 150)
      console.log(`\n[Turno ${i + 1}, paso=${t.paso}, rol=${t.rol}] ← transicionó de paso=${pasoPrev}`)
      console.log(`  ${preview}${t.contenido.length > 150 ? '...' : ''}`)
      pasoPrev = t.paso
    }
  })
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
