// lib/knowledge.ts
// Principios condensados de la Serie de Objetivos y la Serie de Datos.
// Cada fragmento se incluye selectivamente en los prompts de Gemini
// según la función que realiza. No incluir todos los fragmentos en
// cada llamada — usar solo los relevantes para cada análisis.
//
// MAPA DE USO:
//   validar-objetivo          → K_OBJETIVOS_VALIDOS
//   validar propósito         → K_PROPOSITO
//   generar objetivo mayor    → K_PROPOSITO + K_TIPOS_OBJETIVOS
//   analizar secuencia        → K_TIPOS_OBJETIVOS + K_FALLAS_PROGRAMAS
//   validar situación (paso1) → K_SITUACION + K_PORQUE + K_PUNTOS_FUERA
//   resumen ejecutivo         → K_TIPOS_OBJETIVOS + K_FALLAS_PROGRAMAS + K_PROPOSITO + K_PORQUE

// ─────────────────────────────────────────────────────────────────
// FRAGMENTO A — PRINCIPIOS DE OBJETIVOS VÁLIDOS
// Fuente: Serie de Objetivos Nº7, Nº9, Nº11
// Usar en: validar-objetivo
// ─────────────────────────────────────────────────────────────────
export const K_OBJETIVOS_VALIDOS = `
PRINCIPIOS DE OBJETIVOS VÁLIDOS:

1. TODO OBJETIVO DEBE TENER DOINGNESS CONCRETO
   Un objetivo sin doingness no es un objetivo.
   "Mantén relaciones amistosas con el entorno" — no es un objetivo en absoluto.
   El doingness describe una acción ejecutable que produce un resultado
   verificable por otra persona. Al leer el objetivo, el responsable debe
   saber exactamente qué tiene que HACER.

2. UNA SOLA ACCIÓN POR OBJETIVO
   Si cada objetivo requiere más de una acción, es confuso y difícil de ejecutar.
   Dos propósitos independientes = dos objetivos distintos.
   Pasos físicamente inseparables de una misma acción están permitidos.

3. OBJETIVOS TERMINABLES
   Los objetivos deben ser terminables: realizables, acabables, completables.
   Deben tener un punto de finalización claro y verificable.
   Los objetivos que describen estados continuos NO son objetivos válidos:
   "Mantener...", "Supervisar...", "Gestionar..." sin punto de parada definido.

4. CICLO COMENZAR-CAMBIAR-PARAR
   Cada objetivo debe ser un ciclo claro con inicio, desarrollo y fin.
   Sin un punto de parada definido, no es un objetivo válido.
   La secuencia de tiempo debe estar indicada de manera apropiada.

5. FACTIBILIDAD Y CLARIDAD
   El objetivo debe ser ejecutable por la persona asignada con los recursos
   disponibles. Si es demasiado vago, amplio o imposible de ejecutar, no es válido.
   Objetivos tan generales que "invitan a que no haya doingness" son objetivos
   supresivos — dañan la organización.
   Corto y sencillo. Dejar muy claro quién hace qué objetivo.

6. CRITERIOS POR TIPO:
   PRIMARIO: terminable, con responsable claro, orientado a organización/personas/
     comunicaciones. No es un estado de mantenimiento continuo.
   VITAL: declaración de funcionamiento permanente, no tarea ejecutable.
     No requiere doingness ni fecha. Es una regla que aplica a todos.
   CONDICIONAL (dentro de Operativo): describe condición + acción concreta.
     El doingness comienza con "Si..." o describe claramente la condición previa.
   OPERATIVO: acción concreta con dirección y fecha. Una acción por objetivo.
   PRODUCCIÓN: puede ser repetible, expresado como cuota con acción concreta
     y resultado medible. Puede cumplirse múltiples veces.
   MAYOR: aspiración general y amplia del programa. No requiere doingness concreto
     ni resultado medible — es la visión hacia la cual apunta todo el programa.
     Puede describir un estado deseable, un logro aspiracional o un resultado amplio.
     Los resultados medibles corresponden a los Objetivos de Producción, no al Mayor.
     Ejemplos válidos: "Que cada miembro comprenda su rol", "JMT con salud y energía
     óptima", "El equipo operando de forma autónoma".
     Rechazar solo si es completamente vacío o no tiene ninguna relación con la
     situación y el propósito del programa.
`

// ─────────────────────────────────────────────────────────────────
// FRAGMENTO B — TIPOS DE OBJETIVOS Y ESTRUCTURA DEL PROGRAMA
// Fuente: Serie de Objetivos Nº1, Nº2, Nº4, Nº8, Nº11
// Usar en: analizar secuencia, resumen ejecutivo, generar objetivo mayor
// ─────────────────────────────────────────────────────────────────
export const K_TIPOS_OBJETIVOS = `
TIPOS DE OBJETIVOS Y SU FUNCIÓN EN UN PROGRAMA:

OBJETIVO MAYOR: La aspiración general y amplia. El resultado final del programa.
  Puede abarcar un período largo. No es ejecutable directamente — es la visión.
  Ejemplo válido: "JMT pesando 79kg" o "El equipo generando ingresos de forma autónoma".

OBJETIVOS PRIMARIOS: Los de organización, personal y comunicaciones.
  DEBEN MANTENERSE. Son la base estructural del programa.
  Los primeros sobreentendidos son: alguien a cargo, un propósito que valga la
  pena, alguien que asuma responsabilidad, la organización bien planificada,
  la organización funcionando.
  Si se abandonan, todo lo demás falla independientemente de qué otros objetivos
  se hayan establecido.

OBJETIVOS VITALES: Lo que TIENE QUE hacerse para funcionar en lo más mínimo.
  Son principios de funcionamiento permanentes que aplican a todos durante
  todo el programa. No son tareas ejecutables — son reglas de operación.
  Ejemplos: "Si algo se atora, alertar al responsable";
  "No abandonar actividades habituales por ejecutar este programa";
  "Ante cualquier conflicto, la política del grupo tiene prioridad".

OBJETIVOS CONDICIONALES (dentro de Operativos): Acciones de verificación
  previas a la acción principal. "Si X, entonces Y."
  Son básicamente acciones de reunir datos primero, luego actuar basándose
  en objetivos vitales y operativos. Sin ellos, los operativos pueden
  desmoronarse por falta de información previa.

OBJETIVOS OPERATIVOS: Establecen direcciones, acciones e itinerario.
  Normalmente incluyen una FECHA establecida.
  Son el cómo y el cuándo del programa. Pueden ser secuenciales o paralelos.

OBJETIVOS DE PRODUCCIÓN: Establecen cantidades como estadísticas.
  Requieren que los operativos y primarios estén resueltos primero.
  Pueden ser repetibles — se reportan como cumplimientos.
  El primer objetivo del programa debería orientarse hacia producción,
  pero siempre requiere organización primero.

SECUENCIA CORRECTA DE UN PROGRAMA:
  Condicionales (verificación previa) → Primarios/Vitales (base organizativa)
  → Operativos (acciones con fechas) → Producción (resultados medibles).
  Los programas fallan solo porque los tipos de objetivos no se ejecutan,
  se omiten, o no se mantienen en vigor.
  Una serie elaborada de operativos se desmorona cuando no se estableció
  ningún objetivo condicional previo — descubrir si la dirección es correcta
  antes de comprometer recursos.
`

// ─────────────────────────────────────────────────────────────────
// FRAGMENTO C — PROPÓSITO COMO MOTOR DEL PROGRAMA
// Fuente: Serie de Objetivos Nº1, Nº5
// Usar en: validar propósito, generar objetivo mayor
// ─────────────────────────────────────────────────────────────────
export const K_PROPOSITO = `
EL PROPÓSITO COMO MOTOR DEL PROGRAMA:

Todos los paros ocurren a causa de propósitos fallidos.
Detrás de cada paro hay un propósito fallido.
La ley: todo lo que hay que hacer para restaurar la vida y la acción
es reavivar el propósito fallido — los paros volarán de inmediato.

Los propósitos tienen que ejecutarse. Son algo que HACER.
Los objetivos, en esa medida, son propósitos ejecutables.

Un propósito válido y con fuerza:
- Describe por qué el programa tiene que existir (el motor, no el resultado)
- Es real y genuino para las personas que lo van a ejecutar
- Moviliza a quienes lo leen — si al leerlo no sentís que vale la pena,
  no va a ejecutarse
- No es genérico — podría distinguirse del propósito de cualquier otra cosa
- No describe el resultado (eso es el Objetivo Mayor) sino el POR QUÉ

Un propósito débil produce un programa que nadie quiere ejecutar.
La realidad del POR QUÉ debe estar claramente expresada para que el
programa tenga sentido para quien lo recibe y quien lo ejecuta.

La gente cuyos propios propósitos han fallado a menudo no puede
establecer ni terminar objetivos. El remedio es rehabilitar el propósito.
La gente que detiene los objetivos activamente ha fallado de tal manera
que solo puede pensar en términos de paros.

El propósito dice el POR QUÉ.
El Objetivo Mayor dice el QUÉ concreto y verificable al final del programa.
`

// ─────────────────────────────────────────────────────────────────
// FRAGMENTO D — SITUACIÓN: DEFINICIÓN Y CÓMO IDENTIFICARLA
// Fuente: Serie de Datos Nº4, Nº6, Nº11
// Usar en: validar situación (wizard paso 1)
// ─────────────────────────────────────────────────────────────────
export const K_SITUACION = `
QUÉ ES UNA SITUACIÓN Y CÓMO IDENTIFICARLA:

DEFINICIÓN PRECISA:
Una situación es UN ALEJAMIENTO IMPORTANTE DEL ESCENARIO IDEAL.
No es cualquier problema o incomodidad — es una circunstancia amplia,
significativa o potencialmente perjudicial donde el escenario ideal
no existe en esa área.

EL ESCENARIO IDEAL:
Para detectar una situación hay que saber cómo debería ser el escenario.
Sin conocer el escenario ideal, no se pueden ver los puntos fuera.
Una persona que no sabe cómo debería ser el escenario pasará por alto
la mayoría de los problemas reales.

CÓMO ENCONTRAR UNA SITUACIÓN (pasos):
1. Observar el área.
2. Detectar cualquier singularidad o anomalía.
3. Establecer cuál sería el escenario ideal.
4. Contar los puntos fuera visibles.
5. Seguir los puntos fuera y observar más detenidamente.
6. La situación es el alejamiento más importante del escenario ideal.

SECUENCIA CORRECTA DE MANEJO:
  1. Tener información disponible
  2. Observar
  3. Cuando se ve un mal indicador, ponerse alerta
  4. Hacer análisis de datos
  5. Hacer análisis de la situación
  6. Conseguir más información mediante inspección directa
  7. Manejar

SECUENCIA INCORRECTA (que inevitablemente da problemas):
  A. Ver un indicador
  B. Actuar directamente para manejarlo
  Actuar directamente sobre un indicador sin análisis previo es un error grave.

UNA SITUACIÓN VÁLIDA PARA UN PROGRAMA:
  - Describe un alejamiento concreto y observable del escenario ideal
  - Es significativa — justifica la creación de un programa completo
  - Es real para las personas que van a ejecutar el programa
  - No es vaga ("las cosas podrían mejorar") ni trivial
  - Describe el problema, no la solución

Un programa debe manejar situaciones verdaderas: las que reducen
la producción y la prosperidad. Sin situación real, el programa no
tiene razón de existir y probablemente nadie lo ejecutará.
`

// ─────────────────────────────────────────────────────────────────
// FRAGMENTO E — EL PORQUÉ: CÓMO ENCONTRARLO Y VALIDARLO
// Fuente: Serie de Datos Nº13, Nº19, Nº22, Nº23, Nº38
// Usar en: validar situación, resumen ejecutivo
// ─────────────────────────────────────────────────────────────────
export const K_PORQUE = `
EL PORQUÉ REAL Y CÓMO IDENTIFICARLO:

DEFINICIONES CLAVE:
PORQUÉ REAL: la incoherencia básica encontrada que llevará a una
  recuperación de las estadísticas cuando se corrija.
PORQUÉ INCORRECTO: la incoherencia identificada incorrectamente.
  Cuando se aplica NO lleva a recuperación — hace que las cosas empeoren.
MERA EXPLICACIÓN: un "porqué" que no abre la puerta a ninguna acción
  correctiva. No hace nada. El deterioro continúa.

CÓMO RECONOCER EL PORQUÉ CORRECTO:
  Un porqué real ABRE LA PUERTA al manejo. Si no la abre, no es el porqué.
  Cuando se encuentra el verdadero porqué y se corrige, lleva inmediatamente
  a una mejoría observable.
  Cuando se corrige un porqué incorrecto, las cosas empeoran aún más.

EL PORQUÉ ES DIOS (error fundamental):
  Culpar a factores externos que no se pueden controlar es un porqué incorrecto.
  "Las estadísticas bajaron porque llovió esa semana" — mera explicación.
  "No podemos avanzar porque la dirección no nos apoya" — porqué incorrecto
  si la persona no puede controlar a la dirección desde su nivel.
  El porqué tiene que ser algo sobre lo cual PUEDES HACER ALGO desde tu
  nivel de autoridad o iniciativa.

REGLA DEL PORQUÉ:
  El porqué está limitado por lo que puedes controlar.
  NUNCA es otra división, la dirección de más alto nivel, o el mercado.
  Incluso si eso fuera verdad, el porqué tiene que ser algo sobre lo cual
  TÚ PUEDES HACER ALGO AL RESPECTO que llevará a la mejora del escenario.

PARA VALIDAR UN PORQUÉ:
  Preguntarse: "Si corrijo esto, ¿las estadísticas se recuperarán?"
  Si la respuesta es dudosa, probablemente no es el porqué real.
  Los porqués reales son a veces tan obvios que nadie los notó,
  o tan increíbles que cuesta llegar a ellos de otra manera.
`

// ─────────────────────────────────────────────────────────────────
// FRAGMENTO F — PUNTOS FUERA: QUÉ SON Y CÓMO DETECTARLOS
// Fuente: Serie de Datos Nº4, Nº10, Nº29
// Usar en: validar situación, resumen ejecutivo
// ─────────────────────────────────────────────────────────────────
export const K_PUNTOS_FUERA = `
PUNTOS FUERA: INDICADORES DE QUE ALGO ESTÁ MAL

Un punto fuera es cualquier dato que, comparado con el escenario ideal
o con criterios de lógica, resulta ilógico o incongruente.
Donde encuentres puntos fuera, también encontrarás una situación.

TIPOS PRINCIPALES DE PUNTOS FUERA:

1. DATOS OMITIDOS (el más pasado por alto)
   Cualquier cosa que debería estar ahí y no está.
   Una persona omitida, un terminal, una acción, una fecha, un responsable.
   No está ahí para atraer directamente la atención — por eso se pasa por alto.
   En análisis que no llegan a un porqué real, casi siempre hay algo omitido.

2. SECUENCIA ALTERADA
   Eventos, acciones u objetos en orden incorrecto.
   Hacer el paso 2 antes del paso 1 enreda cualquier secuencia de acciones.
   Un programa con los tipos de objetivos en orden incorrecto fallará.

3. OBJETIVO INCORRECTO
   Atacar o corregir lo que no está mal, descuidando lo que sí está mal.
   Esto es uno de los puntos fuera más destructivos — puede destruir
   organizaciones enteras. "Corregir lo que no está mal y descuidar lo
   que no está bien coloca la lápida en cualquier organización".

4. FUENTE INCORRECTA
   Información, órdenes o datos tomados de una fuente incorrecta.
   Genera confusión y errores en cadena.

5. HECHOS CONTRARIOS
   Dos aseveraciones sobre un tema que se contradicen entre sí.
   Una tiene que ser falsa. Señal de que algo está siendo encubierto
   o que la información está siendo distorsionada.

6. TIEMPO AÑADIDO
   Algo que lleva más tiempo del que físicamente debería llevar.
   Indica un problema en la ejecución o un informe falso.

7. DATOS NO PERTINENTES AÑADIDOS
   Datos que no tienen relación con el escenario o la situación.
   A menudo se ponen para encubrir negligencia o para enmascarar
   la situación real.

REGLA FUNDAMENTAL:
  El hombre tiende a responder a lo que está ahí, no a lo que no está.
  Las omisiones son el punto fuera más poderoso y el más invisible.
  En todo análisis que no logre descubrir un porqué, se puede concluir
  con seguridad que el porqué es una omisión.
`

// ─────────────────────────────────────────────────────────────────
// FRAGMENTO G — POR QUÉ FALLAN LOS PROGRAMAS
// Fuente: Serie de Objetivos Nº1, Nº8, Nº9
// Usar en: resumen ejecutivo, analizar secuencia
// ─────────────────────────────────────────────────────────────────
export const K_FALLAS_PROGRAMAS = `
POR QUÉ FALLAN LOS PROGRAMAS:

Las organizaciones no crecen cuando están presentes estos defectos:
1. Un análisis completamente irreal de lo que se necesita hacer.
   Objetivos tan generales que invitan a que no haya doingness.
2. Órdenes cruzadas: subordinados establecen objetivos que se cruzan
   con los objetivos vitales del programa.
3. Incumplimiento del logro de los objetivos vitales.
4. Informes falsos sobre las acciones o datos falsos respecto a los objetivos.
5. Dejar de llevar a término acciones con tesón — no conseguir que se hagan
   total y completamente.
6. Distracciones que conducen a cualquiera de los anteriores.

LA SECUENCIA CORRECTA PARA CUALQUIER PROGRAMA:
1. Ver si hay una situación real.
2. Averiguar su PORQUÉ (la causa raíz que puedes controlar).
3. Redactar el programa general basado en esa situación.
4. Establecer los tipos de objetivos en orden correcto.
5. Asignar responsables claros a cada objetivo.
6. Ejecutar y completar cada objetivo.
7. Informar de la terminación plena.

El desatoramiento de un objetivo atorado descubrirá que:
a. El objetivo fue entregado al responsable inapropiado.
b. No había nadie para llevarlo a cabo.
c. El objetivo simplemente se desatendió.
d. El objetivo no era factible tal como estaba expresado.

Si el programa es nebuloso o los objetivos son muy generales,
poco resulta de ello y puede obstruir la producción en vez de impulsarla.
La claridad y factibilidad de los objetivos determina directamente
las estadísticas de la organización.

EL OBJETIVO INCORRECTO COMO CAUSA DE FALLO:
Atacar o corregir lo que no está mal, descuidando lo que sí está mal,
es uno de los errores más destructivos en la gestión de programas.
Antes de crear un programa, verificar que se está atacando la situación
real y no un síntoma o un objetivo equivocado.
`
