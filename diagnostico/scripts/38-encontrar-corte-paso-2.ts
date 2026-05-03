// Helper one-shot: identificar el turno exacto del Airtable donde se cierra
// el Paso 2 del piloto del Plan Sr de Terravinci. Mismo método que el script
// 31 (Paso 1) pero buscando la transición paso_actual: 2 → 3 (cierre de Paso 2)
// y otros indicadores.
//
// Devuelve: cortes posibles del cierre del Paso 2 + recomendación.

import { getEntrevistaPE, getTurnosPE } from '@/lib/airtable'

const PLAN_ID = 'recFMWxoE5gTQQrf7'  // Plan Sr de Terravinci

async function main() {
  const entrevista = await getEntrevistaPE(PLAN_ID)
  if (!entrevista) throw new Error('entrevista no encontrada')

  const turnos = await getTurnosPE(entrevista.id)
  console.log(`Total turnos en Airtable: ${turnos.length}`)
  const porPaso = new Map<number, number>()
  for (const t of turnos) porPaso.set(t.paso, (porPaso.get(t.paso) ?? 0) + 1)
  console.log('Distribución por paso:')
  for (const [p, n] of [...porPaso.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  paso ${p}: ${n} turnos`)
  }

  // Transiciones de paso_actual — el cierre conceptual del Paso 2 está donde
  // empieza el Paso 3 (transición 2 → 3). Y el cierre conceptual del Paso 1
  // está donde empieza el Paso 2.
  console.log('\nTransiciones de paso_actual:')
  console.log('═'.repeat(72))
  let pasoPrev = -1
  const transiciones: Array<{ idx: number; desde: number; hasta: number; preview: string }> = []
  turnos.forEach((t, i) => {
    if (t.paso !== pasoPrev) {
      const idx = i + 1
      const preview = t.contenido.replace(/\s+/g, ' ').slice(0, 150)
      console.log(`\n[Turno ${idx}, paso=${t.paso}, rol=${t.rol}] ← venía de paso=${pasoPrev}`)
      console.log(`  ${preview}${t.contenido.length > 150 ? '...' : ''}`)
      if (pasoPrev >= 0) transiciones.push({ idx, desde: pasoPrev, hasta: t.paso, preview })
      pasoPrev = t.paso
    }
  })

  // Heurísticas adicionales: keywords del cierre del Paso 2.
  const keywords = [
    /paso\s*2.{0,30}(cerrado|completo|cierre|terminado|listo|cerramos|completado)/i,
    /situaci[oó]n\s+(cerrada|completa|completada)/i,
    /avancemos.{0,20}paso\s*3/i,
    /pasamos.{0,20}paso\s*3/i,
    /iniciamos.{0,20}paso\s*3/i,
    /paso\s*3.{0,40}(estrategia|plan|t[aá]ctica)/i,
  ]
  console.log('\n\nTurnos que matchean keywords de cierre del Paso 2:')
  console.log('═'.repeat(72))
  turnos.forEach((t, i) => {
    const idx = i + 1
    if (keywords.some(re => re.test(t.contenido))) {
      const preview = t.contenido.replace(/\s+/g, ' ').slice(0, 200)
      console.log(`\n[Turno ${idx}, paso=${t.paso}, rol=${t.rol}]`)
      console.log(`  ${preview}${t.contenido.length > 200 ? '...' : ''}`)
    }
  })

  // ─── Recomendación ──────────────────────────────────────────────────────
  console.log('\n\n' + '═'.repeat(72))
  console.log('RECOMENDACIÓN DE CORTE')
  console.log('═'.repeat(72))
  // El corte del Paso 2 es el último turno con paso=2 antes de transicionar
  // a paso=3 (si la transición existe), o el último turno con paso=2 si no
  // hay paso=3.
  const trans2_3 = transiciones.find(tr => tr.desde === 2 && tr.hasta === 3)
  if (trans2_3) {
    console.log(`Transición paso_actual 2 → 3 detectada en turno ${trans2_3.idx}.`)
    console.log(`Cierre conceptual del Paso 2 = turno ${trans2_3.idx - 1} (último con paso=2).`)
    console.log(`Corte recomendado para audit Bloque 0-2: turnos 1..${trans2_3.idx - 1}.`)
  } else {
    // No hay transición a paso 3; el cierre es el último turno con paso=2.
    let lastPaso2 = -1
    turnos.forEach((t, i) => { if (t.paso === 2) lastPaso2 = i + 1 })
    if (lastPaso2 > 0) {
      console.log(`No hay transición a paso 3. Último turno con paso=2: ${lastPaso2}.`)
      console.log(`Corte recomendado para audit Bloque 0-2: turnos 1..${lastPaso2}.`)
    } else {
      console.log('No se encontraron turnos con paso=2. ¿La entrevista no llegó al Paso 2?')
    }
  }

  console.log('\nNOTA: el filtro paso_actual NO es 100% confiable (lag, transiciones bouncy).')
  console.log('Verificá los keywords arriba para ajustar el corte si hace falta.')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
