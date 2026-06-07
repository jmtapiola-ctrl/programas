import { expandirCodigosMov, buildMovNombres } from '../../lib/expandir-codigos-mov'
let pass = 0, fail = 0
function check(n: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✓ ${n}`) }
  else { fail++; console.error(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`) }
}
const N = { 'M-1': 'Definir estructura', 'M-9': 'Transición de Spazios' }
check('1 expande simple', expandirCodigosMov('M-9 debe protegerse', N) === 'M-9 (Transición de Spazios) debe protegerse')
check('2 múltiples', expandirCodigosMov('M-1 precede a M-9', N) === 'M-1 (Definir estructura) precede a M-9 (Transición de Spazios)')
check('3 desconocido sin tocar', expandirCodigosMov('M-5 no está', N) === 'M-5 no está')
check('4 no doble-expande', expandirCodigosMov('M-9 (Transición de Spazios)', N) === 'M-9 (Transición de Spazios)')
check('5 mapa vacío no toca', expandirCodigosMov('M-9 algo', {}) === 'M-9 algo')
check('6 no toca substrings', expandirCodigosMov('XM-9 y M-90', N) === 'XM-9 y M-90', expandirCodigosMov('XM-9 y M-90', N))
check('7 buildMovNombres omite vacíos', JSON.stringify(buildMovNombres([{id:'M-1',nombre:'A'},{id:'M-2',nombre:'  '},{id:'M-3'}])) === JSON.stringify({'M-1':'A'}))
check('8 texto vacío', expandirCodigosMov('', N) === '')
console.log(`\n${pass}/${pass + fail} checks verde.`)
process.exit(fail === 0 ? 0 : 1)
