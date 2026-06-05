import { getEntrevistaPE, getTurnosPE } from '@/lib/airtable'

async function main() {
  const PLAN_ID = 'recFMWxoE5gTQQrf7'
  const ent = await getEntrevistaPE(PLAN_ID)
  if (!ent) throw new Error('Entrevista no encontrada')
  const turnos = await getTurnosPE(ent.id!)

  // El turno modelo con timestamp 2026-05-11T22:18:21.391Z
  const candidato = turnos.find(t =>
    t.rol === 'model' &&
    (t as any).timestamp === '2026-05-11T22:18:21.391Z'
  )
  if (!candidato) { console.log('No encontrado'); return }

  const contenido = candidato.contenido ?? ''
  const puMatch = contenido.match(/<!--\s*PANEL_UPDATE\s*-->([\s\S]*?)<!--\s*\/PANEL_UPDATE\s*-->/)

  if (!puMatch) {
    console.log('═══ NO HAY BLOQUE PANEL_UPDATE EN ESTE TURNO ═══')
    console.log('Eso confirmaría que el modelo verbalizó la corrección pero omitió el bloque.')
    console.log('\nContenido completo del turno:')
    console.log(contenido)
    return
  }

  const panelRaw = puMatch[1].trim()
  const prosa = contenido.replace(puMatch[0], '').trim()

  console.log('═'.repeat(72))
  console.log('PROSA (lo que vio el usuario)')
  console.log('═'.repeat(72))
  console.log(prosa)

  console.log('\n' + '═'.repeat(72))
  console.log('PANEL_UPDATE RAW')
  console.log('═'.repeat(72))
  console.log(panelRaw)

  console.log('\n' + '═'.repeat(72))
  console.log('ANÁLISIS')
  console.log('═'.repeat(72))
  try {
    const parsed = JSON.parse(panelRaw)
    console.log(`Keys: ${Object.keys(parsed).join(', ')}`)
    console.log(`paso_actual=${parsed.paso_actual}, sub_bloque_actual=${parsed.sub_bloque_actual}`)
    console.log(`proposito emitido?: ${parsed.proposito !== undefined ? 'SÍ' : '❌ NO'}`)
    console.log(`situacion emitida?: ${parsed.situacion !== undefined ? 'SÍ' : 'NO (OK si omitido por regla)'}`)
    if (parsed.cambio_retroactivo) {
      console.log(`\ncambio_retroactivo:`)
      console.log(JSON.stringify(parsed.cambio_retroactivo, null, 2))
    }
    if (parsed.proposito?.metricas) {
      console.log(`\nproposito.metricas (${parsed.proposito.metricas.length}):`)
      for (const m of parsed.proposito.metricas) {
        console.log(`  - ${m.metrica}: obj="${m.valor_objetivo}" hoy="${m.valor_actual}"`)
      }
    }
  } catch (e: any) {
    console.log(`NO PARSEA: ${e.message}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
