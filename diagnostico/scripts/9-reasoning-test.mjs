// Test sintético de razonamiento integrado en Opus 4.7 a ~80k tokens.
// Complementa el needle-in-haystack (recall) midiendo si el modelo puede:
//   - Reconciliar múltiples versiones cambiantes coherentemente (Q-A)
//   - Detectar inconsistencias propias entre piezas separadas del plan (Q-B)
//
// Inflo el historial real (74 turnos, ~65k tokens IDEAL) con 8 turnos sintéticos
// que continúan el Paso 2 (causa raíz, consecuencias, recursos faltantes,
// resistencias) e introducen 3 decision-changes adicionales.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// .env.local loader
const envPath = path.resolve(ROOT, '..', '.env.local')
const envText = fs.readFileSync(envPath, 'utf8')
const env = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
const MODEL = 'claude-opus-4-7'

// ============================================================================
// Reconstruyo el system prompt completo (mismo que 4-token-curve.mjs)
// ============================================================================
const knowledgeSrc = fs.readFileSync(
  path.resolve(ROOT, '..', 'lib', 'knowledge-pe.ts'),
  'utf8'
)

function extractConst(name) {
  const re = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\`([\\s\\S]*?)\``)
  const m = knowledgeSrc.match(re)
  if (!m) throw new Error(`No encontrado: ${name}`)
  return m[1]
}

const K_PE_DEFINICION = extractConst('K_PE_DEFINICION')
const K_PE_PROPOSITO = extractConst('K_PE_PROPOSITO')
const K_PE_SITUACION = extractConst('K_PE_SITUACION')
const K_PE_ESTRATEGIA_VS_TACTICA = extractConst('K_PE_ESTRATEGIA_VS_TACTICA')
const K_PE_FALLAS = extractConst('K_PE_FALLAS')
const K_PE_CUESTIONARIO = extractConst('K_PE_CUESTIONARIO')

const HEADER = `Sos un consultor senior especializado en planificación estratégica. Tu trabajo es guiar a un ejecutivo a construir un plan estratégico de calidad mediante una entrevista conversacional.

## Tu rol y tono

- Sos directo, firme y exigente. No elogiás gratuitamente ni te conformás con respuestas vagas
- Cuestionás supuestos. Repreguntás antes de avanzar si la respuesta no cumple los criterios
- Hablás en español rioplatense neutro: "vos", nunca "tú" ni "usted" ni "vosotros"
- No usás emojis ni formatos decorativos. Solo texto plano conversacional
- No sos un encuestador amable — sos alguien que genuinamente quiere que el plan quede bien

## Doctrina: qué es un plan estratégico

`

const SECTION_HEADERS = {
  proposito: '\n\n## Criterios de propósito bien formulado\n\n',
  situacion: '\n\n## Criterios de situación bien formulada\n\n',
  estrategia: '\n\n## Diferencia entre estrategia y táctica\n\n',
  fallas: '\n\n## Patrones de falla que tenés que prevenir\n\n',
  cuestionario: '\n\n## Cuestionario que debés seguir (Pasos 0, 1 y 2)\n\n',
  reglas: `

## Reglas del wizard

- Los gates de avance entre sub-bloques y pasos los evaluás vos. No avanzás si los criterios no están cumplidos
- Si el usuario da una respuesta pobre, repreguntás antes de avanzar
- Los ejemplos en el cuestionario son material de referencia para desatascar al usuario. No los mostrás siempre — solo cuando el usuario se traba o responde genérico
- Las preguntas del cuestionario son la guía de qué averiguar. Las reformulás naturalmente según el contexto

`,
}

const PANEL_CONTRATO = `
## Contrato de PANEL_UPDATE

Al final de CADA respuesta tuya, sin excepción, emití exactamente este bloque con los datos actualizados:

<!--PANEL_UPDATE-->
{
  "paso_actual": <número: 0, 1 o 2>,
  "sub_bloque_actual": "<string: '0', '1.A', '1.B', '1.C', '1.D', '1.E', '2.A', '2.B', '2.C', '2.D', '2.E', '2.F', '2.G'>",
  "proposito": {
    "escena": "<string, vacío si aún no se declaró>",
    "metricas": [],
    "fuera": [],
    "horizonte": "<string>",
    "estabilidad": "<string>",
    "alineacion_sr": "<'Verde'|'Amarillo'|'Rojo', solo si el plan es Jr>"
  },
  "situacion": {
    "desvio_principal": "<string>",
    "desvio_cuantificado": "<string>",
    "desvios_secundarios": [],
    "causa_raiz": "<string>",
    "consecuencia_6m": "<string>",
    "consecuencia_12m": "<string>",
    "recursos_actuales": "<string>",
    "recursos_faltantes": "<string>",
    "intentos_previos": "<string>",
    "resistencias": []
  },
  "datos_faltantes": []
}
<!--/PANEL_UPDATE-->

Reglas:
- Campos sin datos van como string vacío "" o array vacío [], NUNCA null
- El bloque va siempre al final, después de tu respuesta conversacional
- Para plan Sr: omitir el campo "alineacion_sr" del objeto proposito
- Actualizá los campos con todo lo que el usuario ya declaró en la conversación, no solo el turno actual
`

const ESTADO_ACTUAL_MOCK = `
## Estado actual del plan en construcción

Área: Grupo Terravinci
Tipo: Plan Sr

### Propósito construido hasta ahora
Escena ideal: Transformar a Terravinci en la organización líder e indiscutida de hacer dueños en Argentina. Capaz de generar más de 1.000 dueños por mes de manera sostenida hacia fin de 2026 (acumulado anual ~6.000), con confianza del público como activo central, en posición segura frente a reactivación del crédito tradicional, y con plataforma operativa, financiera, de banco de tierras y de marca lista para penetrar el resto de Argentina desde 2027 a volumen 2x. Refundar el Grupo: 250→1.000+ personas, 3→multi-empresa con nueva División Hacedora de Dueños, máquina 100→1.000+ dueños/mes. PAI graduado y escalado a 3-5 sucursales con 500-1.000 ventas PAI/mes.
Métricas: 7 (Volumen/Organización/Confianza/Solidez financiera/Expansión geográfica/Banco de tierras/PAI graduado)
Fuera de scope: 8 ítems (clase media-alta y high-end, modelos constructivos, productos para inversores, perfil empresarial JMT, constructoras propias, asociar desarrolladoras chicas, M&A, NO comprar tierras 2028 en 2026)
Horizonte: 2026
Estabilidad: estable

### Situación construida hasta ahora
Desvío principal: Cobertura geográfica multi-macrozona insuficiente (1 macrozona con stock real → 6 macrozonas, 100 → 200/mes/macrozona)
Desvíos secundarios:
  #1 PR/Marca masiva (JMT 1.5M→100M views, Más Dueños awareness 50%+ Q3, 90%+ fin año, blitz US$3-5M)
  #2 PAI graduado (1 piloto Liniers → 3-5 sucursales)
  #3 Infraestructura legal/fiscal para capturar liquidez de mercado de capitales (cambió de "liquidez para tierras 2027-2028")
Causa raíz: (en discusión)
`

function buildSystemPrompt() {
  return [
    HEADER,
    K_PE_DEFINICION,
    SECTION_HEADERS.proposito,
    K_PE_PROPOSITO,
    SECTION_HEADERS.situacion,
    K_PE_SITUACION,
    SECTION_HEADERS.estrategia,
    K_PE_ESTRATEGIA_VS_TACTICA,
    SECTION_HEADERS.fallas,
    K_PE_FALLAS,
    SECTION_HEADERS.cuestionario,
    K_PE_CUESTIONARIO,
    SECTION_HEADERS.reglas,
    ESTADO_ACTUAL_MOCK,
    '\n',
    PANEL_CONTRATO,
  ].join('')
}

const fullSystem = buildSystemPrompt()

// ============================================================================
// Cargo turnos reales y agrego turnos sintéticos
// ============================================================================
const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'output', 'turns-md.json'), 'utf8'))

// Para inflar a ~80k, necesito ~15k tokens adicionales. ~65k chars adicionales.
// 8 turnos sintéticos largos (continuación del Paso 2) que introducen 3 decision-changes:
//
// DECISION-CHANGE 1: Causa raíz cambia mid-discussion
//   - Primero declara: "ausencia de gobernanza estratégica multi-empresa coordinada"
//   - Después de pushback del modelo: cambia a "falta de un mecanismo de gestión de tierras industrializado"
//
// DECISION-CHANGE 2: Resistencia mencionada y luego reemplazada
//   - Primero menciona: "resistencia del CFO Charly al ritmo de inversión en tierras"
//   - Después la retira y dice: "no, en realidad Charly está totalmente alineado, la resistencia
//     real va a ser de los dueños de tierras del banco de suelos que no van a querer dar opciones
//     a 6 meses al volumen que necesitamos"
//
// DECISION-CHANGE 3: Recursos faltantes — agrega y luego retira un puesto
//   - Primero declara que falta: "Director de Expansión Territorial"
//   - Después: "lo pensé mejor, esa función la va a absorber el COO de Spazios — Randy ya lo tiene
//     identificado. Lo que sí falta es un Head of Land Acquisition reportando a Randy."

const sinteticos = [
  // Turno 74 (user) — entra causa raíz
  {
    index: 74,
    rol: 'user',
    contenido: 'Te respondo lo de liquidez para que cerremos #3 y avanzamos. 1) Necesito tener disponibles unos US$ 80M durante 2026 destinados a banco de tierras 2027-2028, asumiendo precio promedio US$ 4M por tierra y unas 20 tierras del land bank. 2) Hoy disponibles propios + endeudamiento accesible: aprox US$ 25M. 3) La brecha de US$ 55M tiene que venir de securitización orgánica de la nueva División Hacedora de Dueños (estimado US$ 30-40M durante 2026 capturando flujos futuros de cobranza), más deuda bancaria estructurada (US$ 15-20M con bancos con los que ya operamos), y un fondeo puente de inversores propios para cubrir gaps de timing. Como dije antes, mercado de capitales no, queda para 2027 una vez lista la infraestructura legal. Ahora vamos a causa raíz. Si tengo que señalar UNA causa que explica los tres desvíos secundarios + el principal, sería esta: hay una ausencia de gobernanza estratégica multi-empresa coordinada. Cada empresa del Grupo (Spazios, Divoi, Más Dueños) tiene su propio CEO o referente, su propio P&L, sus propias prioridades, y los gerentes funcionales (anteproyecto, comercial, marketing, finanzas) responden a la lógica de cada empresa, no a una visión integrada del Grupo. Por eso pasa que Spazios compra tierras, Divoi financia, Más Dueños vende, pero no hay quien orqueste la cadencia ni quien arbitre cuando hay conflicto de prioridades. Esa es la causa raíz: falta una capa de gobierno transversal que opere en clave Grupo, no en clave empresa.',
  },
  // Turno 75 (model) — pushback fuerte sobre causa raíz
  {
    index: 75,
    rol: 'model',
    contenido: 'Para. Te marco lo que veo, porque tu causa raíz no me cierra del todo y es importante que la resolvamos bien antes de avanzar a consecuencias y recursos. Lo que decís — "falta de gobernanza estratégica multi-empresa coordinada" — es real, te lo creo, pero suena más a un síntoma estructural del momento que a la causa raíz que explica los desvíos. Te pregunto desde otro ángulo: si mañana pusieras un Chief of Staff o un comité de gobierno transversal con autoridad real para arbitrar entre Spazios/Divoi/Más Dueños, ¿se desbloquearían los 4 desvíos? Yo te digo que no. Ejemplo: la cobertura multi-macrozona (desvío principal) no se resuelve por gobernanza — se resuelve por velocidad y volumen de adquisición de tierras + apertura de sucursales + contratación de asesores. Puede haber gobernanza perfecta y aun así no tener tierras. La gobernanza acelera coordinación, pero no resuelve el cuello de botella físico/operativo. Mi hipótesis alternativa: la causa raíz es que el Grupo nunca operó a la escala/velocidad de adquisición de tierras que el plan exige. Hoy el proceso de adquisición es artesanal — depende de oportunidades que aparecen, de relaciones personales del Fundador y de Randy, de revisión caso por caso. Para 2026 (rampa vertical 1→6 macrozonas) y para 2027-2028 (land bank de 20 tierras) necesitás un proceso industrializado de identificación, due diligence, negociación y opción de tierras. Eso hoy no existe. ¿Cuál te cierra más? La de gobernanza, la mía sobre adquisición de tierras industrializada, o tenés una tercera? Necesito que te convenzas vos mismo, no que aceptes la mía por inercia.',
  },
  // Turno 76 (user) — DECISION-CHANGE 1: cambia causa raíz
  {
    index: 76,
    rol: 'user',
    contenido: 'Tu hipótesis me cierra mucho más. Te lo compro completo: la causa raíz es la falta de un mecanismo industrializado de gestión de tierras. Es la que explica de verdad los 4 desvíos: la cobertura multi-macrozona no avanza porque no tenemos pipeline sistemático de tierras, el banco de tierras 2027-2028 no se puede armar porque tampoco hay pipeline, el PAI no escala porque depende de sucursales que dependen del flujo de proyectos vendibles que dependen de tierras, e incluso el desvío de PR/Marca masiva está limitado porque no podés hacer blitz publicitario sin proyectos reales en cartera para vender. Reformulo: "El Grupo opera la adquisición de tierras como un proceso artesanal — basado en oportunidades emergentes, relaciones personales y revisión caso por caso — sin un mecanismo industrializado de identificación de zonas target, prospección activa, evaluación financiera estandarizada, negociación con plazos predecibles, ni gestión de un pipeline de oportunidades. Para sostener la rampa 2026 (de 1 a 6 macrozonas) y armar el land bank 2027-2028 (20 tierras), este proceso tiene que pasar de artesanal a industrial." Lo de gobernanza multi-empresa lo dejamos para más adelante, no es prioritario para 2026 y se va a resolver naturalmente cuando armemos la nueva División Hacedora de Dueños y la operatoria empiece a forzar coordinación.',
  },
  // Turno 77 (model) — confirma cambio + pasa a consecuencias
  {
    index: 77,
    rol: 'model',
    contenido: 'Cerrado. Causa raíz reformulada y sólida — explica los 4 desvíos con un mecanismo único, accionable y dentro de tu control. La de gobernanza multi-empresa la marco como observación contextual del momento del Grupo, no como causa raíz, y va a resolverse aguas abajo. Vamos a consecuencias de inacción. Si no hacés nada y 2026 pasa sin este plan ejecutándose: a) Describime el escenario a 6 meses (mediados de 2026). Concreto: ¿qué cliente se pierde, qué número rompe, qué decisión te fuerza el board, qué oportunidad se cierra? b) Describime el escenario a 12 meses (fin de 2026). Mismo nivel de concreción. Y dato importante: estas consecuencias tienen que ser fuertes. Si la consecuencia a 12 meses es "el Grupo crece menos de lo planeado pero sobrevive", entonces no necesitás un plan estratégico — alcanza con tácticas. Las consecuencias justifican la inversión organizacional brutal que estás por hacer. Si son suaves, el plan se debilita.',
  },
  // Turno 78 (user) — consecuencias + arranca recursos
  {
    index: 78,
    rol: 'user',
    contenido: 'Consecuencias 6 meses (junio-julio 2026): a) Llegamos al blitz publicitario Q3 (US$ 3-5M de inversión) con solo 2 macrozonas operativas en lugar de 4-5. La consecuencia es que quemamos US$ 2-3M en leads que no se pueden atender porque no tenemos sucursales con asesores activos en las macrozonas donde el ad funcionó. JMT pierde credibilidad porque la gente lo escucha decir "podés ser dueño" pero cuando van a la sucursal no encuentran proyectos en su macrozona. La marca personal de JMT se erosiona, y eso es muy difícil de recuperar. b) Adicionalmente, el churn de PAI no validado por el PM hace que escalemos a una segunda sucursal sobre supuestos, y si el churn real resulta ser 70%+ (en lugar del 50% proxy), perdemos US$ 1-1.5M en costos hundidos de la segunda sucursal y reseteamos credibilidad interna del modelo PAI. c) Randy y yo dedicamos 60-70% de nuestro tiempo apagando incendios de adquisición de tierras (negociando caso a caso con dueños) en lugar de armar la nueva División Hacedora de Dueños. Consecuencias 12 meses (fin 2026): a) Cerramos el año con 400-600 dueños/mes en lugar de 1.000+. La métrica principal del propósito se incumple por 50%. Los socios y el board pierden confianza, y aparece presión para vender porciones del Grupo. b) Sin land bank 2027-2028 armado, 2027 arranca sin posibilidad de seguir creciendo — entramos en estancamiento estructural y el competidor que entre fuerte (algún player con capital chino o un consorcio bancario español) nos toma la posición de mercado para 2028-2029. c) La nueva División Hacedora de Dueños no se constituye, no hay securitización orgánica, no hay infraestructura legal lista para 2027, y entonces cuando el mercado de capitales se reactive (probable con Milei reelecto), no podemos capturar liquidez. Otros players sí, y la ventana de oportunidad se cierra. Recursos actuales: tengo el equipo ejecutivo (CEO Randy, CFO Charly, Director Comercial Nico), 250 personas, ISO 9001-14001, 100+ procesos estándar, 7 divisiones funcionales, 21 departamentos con gerentes, caja propia US$ 25M aprox, relaciones con bancos para US$ 15-20M de deuda estructurada, JMT como activo de marca, capacidad demostrada de hacer 1.200 dueños/año. Recursos faltantes: 1) Director de Expansión Territorial — un puesto nuevo, senior, que reporte directamente a Randy, dedicado exclusivamente a industrializar el proceso de adquisición de tierras (identificar zonas target, prospección activa, due diligence estandarizada, negociación con plazos predecibles). 2) Product Manager para PAI — ya en proceso de contratación, validar churn como objetivo principal. 3) Líder fundador de la nueva División Hacedora de Dueños — pieza clave, todavía no identificado, probablemente externo. 4) Un legal/fiscal especializado en estructuras de securitización y mercado de capitales (puede ser firma externa, no necesariamente in-house). 5) Sistema de CRM/pipeline para oportunidades de tierras (no tenemos hoy, todo se trackea en planillas).',
  },
  // Turno 79 (model) — cuestiona resistencias
  {
    index: 79,
    rol: 'model',
    contenido: 'Las consecuencias están bien construidas — fuertes, concretas, conectadas con métricas específicas, y muestran que la inacción te cuesta el plan completo. Bien. Recursos también están claros y son un mapa real, no una lista de deseos. Avanzo. Antes de cerrar la situación necesitamos hablar de intentos previos y de resistencias. Empiezo por intentos previos, rápido: ¿hubo algún intento previo de industrializar la adquisición de tierras o sigue siendo un terreno virgen para el Grupo? Si hubo intentos parciales — un sistema de tracking que se intentó armar, una persona que tuvo el rol y no funcionó, un proceso documentado que quedó archivado — es importante saberlo, porque entender por qué falló antes es clave para que esta vez no falle igual. Y después, lo más crítico: resistencias. ¿Quién o qué dentro del Grupo se va a oponer a la industrialización del proceso de tierras? Te empujo de entrada, porque "no hay resistencias" no existe — siempre hay alguien que se beneficia con que las cosas sigan como están. Pensá: ¿qué áreas o personas hoy tienen control informal sobre las decisiones de adquisición de tierras y pueden percibir un proceso industrializado como pérdida de autonomía o de poder de decisión? ¿Cómo va a reaccionar Charly al ritmo de inversión en tierras que esto requiere — los US$ 80M durante 2026 son una orden de magnitud distinta a la de los últimos años, ya validó eso? ¿Alguna empresa del Grupo (Spazios particularmente, que es la principal compradora hoy) puede ver esto como una pérdida de control sobre su pipeline de proyectos? Y resistencias externas: ¿los dueños de tierras con los que hoy operás van a aceptar la cadencia y los términos que un proceso industrializado va a exigir, o están acostumbrados a otra forma de negociar?',
  },
  // Turno 80 (user) — DECISION-CHANGES 2 y 3
  {
    index: 80,
    rol: 'user',
    contenido: 'Intentos previos: hubo dos intentos parciales que vale la pena nombrar. Primero, en 2024 contratamos a un analista de inversiones para hacer screening sistemático de tierras, pero le dimos cero autoridad y reportaba a un gerente intermedio del área comercial. Duró 8 meses, generó 3 reportes que nadie usó, y se fue. La causa de fracaso fue clara: posición sin peso jerárquico, sin presupuesto y sin acceso al fundador para escalar oportunidades. Segundo, en 2025 intentamos armar un comité de tierras semanal con Randy, Charly y yo. Al mes y medio dejó de juntarse porque siempre había algo más urgente y porque las decisiones se tomaban igual entre Randy y yo en pasillo. Los dos aprendizajes: el rol necesita autoridad jerárquica real reportando a CEO o Fundador, y el proceso necesita ser obligatorio (entrar al pipeline o no entrar al deal) no opcional. Resistencias: te paso lo que veo, ordenado por riesgo. Primero: la resistencia más grande va a venir del CFO Charly. El ritmo de inversión que requiere esto (US$ 80M durante 2026, vs. ~US$ 30M/año hace dos años) lo va a poner muy nervioso. Charly es históricamente prudente con la caja y con razón — gracias a esa prudencia el Grupo sobrevivió a la crisis 2018-2020 sin asistencia externa. Va a pedir validar cada operación y va a frenar la velocidad. Segundo: Randy en Spazios — Spazios hoy compra el 80% de las tierras y Randy tiene relaciones personales con los principales dueños de tierras de CABA. Industrializar va a significar que esas relaciones se traduzcan en un sistema, lo cual él puede vivir como pérdida de su capital relacional o de su valor único en la mesa. Tercero: el equipo legal interno (Pamela y Jorge) son resistentes a estructuras nuevas y van a poner trabas a la securitización orgánica argumentando "riesgo regulatorio". Cuarto: los dueños de tierras del segmento "pueblo" (150k+ m²) son típicamente herederos de campos viejos, sin asesores, y manejan tiempos lentos — un proceso industrializado con plazos predecibles puede chocar con su forma de negociar. ESPERÁ. Releyendo lo que te escribí, me retracto de lo de Charly. Hablé con él anteayer y está totalmente alineado con la magnitud de inversión 2026, ya hicimos juntos el modelo financiero. La resistencia real con la inversión en tierras NO va a ser interna sino externa: va a venir de los dueños de tierras del banco de suelos que no van a querer dar opciones a 6 meses al volumen que necesitamos (20 tierras de land bank en escala condominio y pueblo). Eso es una restricción de mercado dura. También me corrijo en lo de recursos faltantes: lo pensé mejor y el "Director de Expansión Territorial" como puesto separado no tiene sentido — esa función la va a absorber el COO de Spazios, que ya tenemos identificado y es alguien con peso jerárquico real. Lo que sí falta y es el puesto crítico es un Head of Land Acquisition reportando a Randy/COO Spazios, exclusivamente dedicado al pipeline industrializado de tierras. Esa es la pieza nueva, no el Director Territorial.',
  },
  // Turno 81 (model) — cierre de Paso 2 y prepara Paso 3
  {
    index: 81,
    rol: 'model',
    contenido: 'Excelente. Tomo todo, te dejo el cuadro de situación cerrado y arrancamos a procesar los recursos faltantes ajustados antes de pasar al Paso 3 (estrategia). Cuadro de situación final: Desvío principal: cobertura geográfica multi-macrozona insuficiente (1→6, 100→200/mes/macrozona). Desvíos secundarios: PR/Marca masiva, PAI graduado y escalado, infraestructura legal/fiscal para captura de liquidez 2027+. Causa raíz: proceso de adquisición de tierras artesanal vs. industrializado. Consecuencias 6m: blitz Q3 quema US$ 2-3M en leads no atendibles, JMT erosiona credibilidad, churn PAI no validado lleva a escalamiento sobre supuestos. Consecuencias 12m: 400-600 dueños/mes (50% miss del propósito), pérdida de confianza de socios/board, sin land bank 2027 entramos en estancamiento, oportunidad de mercado de capitales 2027 se cierra. Recursos actuales: equipo ejecutivo, ISO, 100+ procesos estándar, US$ 25M caja, US$ 15-20M deuda accesible, JMT, capacidad de 1.200 dueños/año. Recursos faltantes ajustados: Head of Land Acquisition reportando a Randy (NO Director de Expansión Territorial, retirado), Product Manager PAI (en proceso), Líder fundador División Hacedora de Dueños, Legal/fiscal especializado en securitización (puede ser externo), CRM/pipeline para oportunidades de tierras. Intentos previos: analista 2024 (sin autoridad ni peso, falló por nivel jerárquico), comité de tierras 2025 (falló por falta de obligatoriedad). Aprendizajes a aplicar: rol con autoridad real reporta a CEO/Fundador, proceso obligatorio (entrar al pipeline o no hay deal), no opcional. Resistencias: dueños de tierras (segmento pueblo, tiempos lentos / mercado de suelos en general, opciones a 6 meses al volumen requerido), Randy/Spazios (relaciones personales como capital, riesgo de "pérdida de valor único"), legal interno (Pamela/Jorge, resistentes a estructuras nuevas). Charly: alineado, no es resistencia. Está completo el Paso 2. Vamos al Paso 3 — estrategia: ¿cuál es tu apuesta estratégica central para resolver el desvío principal y la causa raíz? No me digas tácticas todavía, decime LA jugada.',
  },
]

// Inflo el array de turnos
const inflated = md.concat(sinteticos)

// Verifico tokens del historial inflado
console.log('='.repeat(78))
console.log('SETUP: midiendo tokens del historial inflado')
console.log('='.repeat(78))

const messagesBase = inflated.map(t => ({
  role: t.rol === 'model' ? 'assistant' : 'user',
  content: t.contenido,
}))

// Aseguro que el último sea assistant (turno 81 model). Si no, hay bug.
if (messagesBase.at(-1).role !== 'assistant') {
  throw new Error('Último turno debe ser assistant')
}

// ============================================================================
// Pregunta Q-A: versiones del propósito
// ============================================================================
const Q_A = `Pausa antes de seguir con estrategia. Necesito un chequeo de coherencia conmigo mismo, mirando todo lo que hablamos hasta acá. Listame TODAS las versiones intermedias del propósito que pasaron por esta entrevista, en orden cronológico. Por cada versión: 1) qué decía (en una o dos frases), 2) qué cambió respecto de la versión anterior, y 3) por qué cambió (qué intervención mía o qué pushback tuyo lo movió). Necesito el rastro completo desde la primera versión hasta la final. No me hagas un resumen ejecutivo — quiero ver el historial.`

// ============================================================================
// Pregunta Q-B: inconsistencias en propósito final + 7 métricas + foco
// ============================================================================
const Q_B = `Otro chequeo antes de seguir. Mirá el propósito final, las 7 métricas finales, y los 8 ítems del foco (lo que dejamos afuera). ¿Hay inconsistencias o tensiones no resueltas entre estas tres piezas? Quiero el listado completo de toda contradicción, redundancia, o tensión que detectes — incluso las menores. Y por cada una, proponeme cómo resolverla: editar el propósito, ajustar la métrica, modificar el foco, o aceptar la tensión y documentarla.`

const messagesQ_A = [...messagesBase, { role: 'user', content: Q_A }]
const messagesQ_B = [...messagesBase, { role: 'user', content: Q_B }]

// Mido tokens
const tokensQ_A = await client.messages.countTokens({
  model: MODEL,
  system: fullSystem,
  messages: messagesQ_A,
})
const tokensQ_B = await client.messages.countTokens({
  model: MODEL,
  system: fullSystem,
  messages: messagesQ_B,
})

console.log()
console.log(`Turnos totales (74 reales + 8 sintéticos): ${inflated.length}`)
console.log(`Q-A input tokens: ${tokensQ_A.input_tokens}`)
console.log(`Q-B input tokens: ${tokensQ_B.input_tokens}`)
console.log()

// ============================================================================
// Llamadas reales
// ============================================================================
console.log('='.repeat(78))
console.log('LLAMADA Q-A — versiones del propósito en orden cronológico')
console.log('='.repeat(78))
const t0a = Date.now()
const respQ_A = await client.messages.create({
  model: MODEL,
  max_tokens: 4000,
  system: fullSystem,
  messages: messagesQ_A,
})
const dtQ_A = Date.now() - t0a
const textQ_A = respQ_A.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
console.log(`Latencia: ${(dtQ_A / 1000).toFixed(1)}s`)
console.log(`Output tokens: ${respQ_A.usage.output_tokens}`)
console.log(`Texto completo (${textQ_A.length} chars):`)
console.log('-'.repeat(78))
console.log(textQ_A)
console.log('-'.repeat(78))

console.log()
console.log('='.repeat(78))
console.log('LLAMADA Q-B — inconsistencias propósito + métricas + foco')
console.log('='.repeat(78))
const t0b = Date.now()
const respQ_B = await client.messages.create({
  model: MODEL,
  max_tokens: 4000,
  system: fullSystem,
  messages: messagesQ_B,
})
const dtQ_B = Date.now() - t0b
const textQ_B = respQ_B.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
console.log(`Latencia: ${(dtQ_B / 1000).toFixed(1)}s`)
console.log(`Output tokens: ${respQ_B.usage.output_tokens}`)
console.log(`Texto completo (${textQ_B.length} chars):`)
console.log('-'.repeat(78))
console.log(textQ_B)
console.log('-'.repeat(78))

// ============================================================================
// Guardo todo
// ============================================================================
const out = {
  model: MODEL,
  setup: {
    turnos_reales: md.length,
    turnos_sinteticos: sinteticos.length,
    turnos_totales: inflated.length,
    system_prompt_chars: fullSystem.length,
    decision_changes_inyectados: [
      'C1: Causa raíz cambia de "gobernanza estratégica multi-empresa coordinada" a "proceso de adquisición de tierras artesanal vs industrializado"',
      'C2: Resistencia del CFO Charly mencionada en turno 80 y luego retractada en el mismo turno; reemplazada por dueños de tierras (mercado externo)',
      'C3: Recurso faltante "Director de Expansión Territorial" mencionado en turno 78 y luego retirado en turno 80; reemplazado por "Head of Land Acquisition reportando a Randy/COO Spazios"',
    ],
  },
  Q_A: {
    pregunta: Q_A,
    input_tokens: tokensQ_A.input_tokens,
    output_tokens: respQ_A.usage.output_tokens,
    latency_ms: dtQ_A,
    respuesta: textQ_A,
  },
  Q_B: {
    pregunta: Q_B,
    input_tokens: tokensQ_B.input_tokens,
    output_tokens: respQ_B.usage.output_tokens,
    latency_ms: dtQ_B,
    respuesta: textQ_B,
  },
  costo_estimado_usd: {
    // Opus 4.7 pricing (igual que Opus 4 para cálculo de orden de magnitud):
    // input: $15/M, output: $75/M
    input_cost: ((tokensQ_A.input_tokens + tokensQ_B.input_tokens) * 15) / 1_000_000,
    output_cost: ((respQ_A.usage.output_tokens + respQ_B.usage.output_tokens) * 75) / 1_000_000,
    get total() { return this.input_cost + this.output_cost },
  },
  sinteticos_usados: sinteticos,
}

fs.writeFileSync(
  path.join(ROOT, 'output', 'reasoning-test.json'),
  JSON.stringify(out, null, 2)
)

console.log()
console.log('='.repeat(78))
console.log('RESUMEN')
console.log('='.repeat(78))
console.log(`Turnos: ${inflated.length} (${md.length} reales + ${sinteticos.length} sintéticos)`)
console.log(`Q-A: ${tokensQ_A.input_tokens} in / ${respQ_A.usage.output_tokens} out`)
console.log(`Q-B: ${tokensQ_B.input_tokens} in / ${respQ_B.usage.output_tokens} out`)
console.log(`Costo estimado: US$ ${out.costo_estimado_usd.total.toFixed(2)} (in: $${out.costo_estimado_usd.input_cost.toFixed(2)}, out: $${out.costo_estimado_usd.output_cost.toFixed(2)})`)
console.log()
console.log('Guardado: diagnostico/output/reasoning-test.json')
