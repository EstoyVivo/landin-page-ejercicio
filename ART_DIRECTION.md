# MISELTUM — Dirección de Arte
### Landing "Núcleo de Inteligencia" — Documento de diseño previo a implementación

> Este documento fija las decisiones de diseño y arquitectura antes de escribir código.
> La imagen de referencia se usa únicamente como guía de atmósfera (oscuridad, cerebro de luz, tono editorial). La composición, el layout y el sistema de interacción son originales y no replican esa referencia.

---

## 0. Decisiones de stack (para que la arquitectura tenga sentido)

| Área | Decisión | Por qué |
|---|---|---|
| Bundler | **Vite + TypeScript** | Cero framework overhead, HMR rápido, control total del canvas |
| Render 3D | **Three.js** (WebGL, `BufferGeometry` + `Points` + `LineSegments` custom) | Necesitamos miles de partículas y control fino de shaders; ni SVG ni Canvas 2D escalan a esto con buen rendimiento |
| Shaders | **GLSL custom** (`ShaderMaterial`) para partículas y pulsos | Animar miles de partículas en la CPU (JS) no sostiene 60 FPS; el trabajo debe vivir en el GPU |
| Scroll / secuencias | **GSAP + ScrollTrigger** | Es la única pieza de "animación compleja" permitida por el propio brief; todo lo demás es CSS/WebGL |
| UI (no-3D) | **HTML + CSS puro** (custom properties), sin React | La página es mayormente estática en su DOM; no se justifica un framework de UI. Menos JS de arranque = mejor performance del canvas |
| Tipografía | **Inter Variable** (self-hosted, `font-variation-settings` para pesos) | Permite pesos intermedios reales para los títulos gigantes |

No se usa ningún framework CSS ni librería de componentes. Todo el Glass UI, el sistema de grid y los botones se construyen desde cero.

---

## 1. Narrativa visual

**La premisa:** el usuario no "visita una página", **entra al núcleo de un sistema pensante**. La marca no vende software, diseña inteligencia aplicada al negocio del cliente.

Esto se traduce en reglas concretas:

- El cerebro **no es una imagen decorativa en el hero**: es el entorno. Vive detrás de *toda* la página, no solo en la primera sección. Al hacer scroll no "se sale de vista y aparece contenido nuevo"; el mismo organismo cambia de estado (cámara, foco, iluminación) mientras el contenido flota sobre él.
- El texto se comporta como **información suspendida sobre un sistema activo**, no como el contenido principal acompañado de un gráfico. Jerárquicamente, el cerebro pesa visualmente más que cualquier bloque de texto en el 70% del scroll.
- Todo transmite **procesamiento en tiempo real**: pulsos, partículas viajando, luz que se propaga. Nunca un estado "congelado". Si en cualquier momento se toma un screenshot, debe leerse como un frame de algo vivo, no como una ilustración estática.
- Tono: **clínico, silencioso, preciso** — no "futurista neón". La luz es información, no decoración. Se usa con moderación (glow sutil, nunca saturado).

**Lo que se evita explícitamente:** layout imagen-derecha/texto-izquierda, cards con iconos flotando sin contexto, gradientes de marca genéricos, cualquier cosa que se sienta "plantilla SaaS".

---

## 2. Arquitectura de composición (editorial, no convencional)

Grid base: **12 columnas, márgenes de 8vw en desktop**, pero el contenido rara vez ocupa el grid completo — el espacio negativo es un elemento de diseño, no un descuido.

Principio de composición: **anclaje asimétrico**. Cada sección ancla su bloque de texto a un punto distinto del grid (a veces columna 1–4, a veces 8–12, a veces centrado en una franja angosta), de modo que el cerebro de fondo nunca queda "tapado" de la misma forma dos veces y el ojo recorre la página en diagonal, no en columnas repetidas.

Secuencia de secciones (contenido original, no clona el layout de la referencia):

1. **Hero** — label superior mínimo + título editorial partido en 3 líneas + una sola línea de cuerpo + un link con flecha (no botón sólido). Sin navbar tradicional: navegación reducida a 4 palabras + 1 CTA con borde, alineada arriba, transparente sobre el cerebro.
2. **Marquee de confianza** — logos en una franja angosta, baja opacidad, cruzando horizontalmente muy lento (loop infinito, no carrusel con flechas).
3. **Proceso (01–04)** — no son cards; son 4 bloques tipográficos alineados sobre una línea horizontal delgada que conecta con las conexiones del cerebro (metáfora: cada etapa "enciende" un nodo).
4. **Soluciones** — grid asimétrico de 6 paneles Glass de distinto tamaño (no todos iguales), flotando a distintas alturas (parallax scroll).
5. **Impacto / métricas** — panel Glass grande dividido en 2: mini-visualizaciones de datos (generadas en Canvas, línea de datos animada) a la izquierda, texto + stats a la derecha, pero desplazado hacia el borde, no centrado.
6. **Stack tecnológico** — cinta de texto en movimiento continuo (misma técnica que el marquee de logos, tipografía en vez de logos).
7. **CTA final** — título editorial enorme partido en 3 líneas, el cerebro se acerca de nuevo a cámara (cierre narrativo: "vuelve al núcleo").
8. **Footer** — mínimo, mono-línea, mismo tratamiento que el nav.

Regla de oro: **ninguna sección repite la misma disposición texto/visual que la anterior.**

---

## 3. Comportamiento del cerebro digital

### 3.1 Estructura de datos
- ~180–260 nodos generados proceduralmente en una envolvente elipsoidal deformada con simplex noise (silueta orgánica, no una esfera perfecta).
- Conexiones: cada nodo se une a sus 3–6 vecinos más cercanos por distancia (triangulación aproximada), con un límite de conexiones totales (~450–600) para controlar el costo de shader.
- Todo vive en dos `BufferGeometry`: uno de `LineSegments` (conexiones) y uno de `Points` (nodos + partículas viajeras), para minimizar draw calls.

### 3.2 Respiración
- Los nodos oscilan en posición con **simplex noise 3D en función del tiempo** (amplitud pequeña, ~1–2% del tamaño del cerebro), con offsets de fase distintos por nodo para que no se mueva "en bloque".
- Escala global del cerebro con un ease senoidal muy lento (periodo ~8–12s), imperceptible como "animación" pero perceptible como "presencia".

### 3.3 Partículas viajeras
- Partículas (300–600 activas) recorren curvas Catmull-Rom entre pares de nodos conectados, con velocidad y curva de easing ligeramente aleatorias por partícula.
- Al llegar a un nodo destino, ese nodo emite un pulso (ver 3.4) y la partícula se reasigna a una nueva conexión aleatoria adyacente — flujo continuo, nunca se "acaban".
- Color de partícula interpolado entre `#4D7CFF` y `#8B5CF6` según posición en el trayecto (da sensación de energía direccional).

### 3.4 Pulsos
- Disparo aleatorio (Poisson, ~1 nodo cada 400–900ms) de un pulso de brillo en un nodo, que se propaga a sus vecinos inmediatos con un breve delay (~120ms), atenuándose. Simula una "descarga" que se propaga 1–2 saltos y se apaga.
- Las conexiones por las que pasa un pulso o una partícula incrementan temporalmente su opacidad/emisión (shader con atributo de "heat" por vértice, con decaimiento exponencial por frame).

### 3.5 Reacción al mouse
- **No hay seguimiento directo.** El puntero alimenta un target de rotación de cámara (o del grupo del cerebro) con `lerp` de baja velocidad (factor ~0.03–0.05 por frame) → sensación de profundidad, nunca de "arrastre".
- Las partículas dentro de un radio del cursor (proyectado a espacio 3D en el plano del cerebro) reciben una fuerza de repulsión/atracción muy sutil sobre su curva, luego vuelven a su trayectoria original — un campo de influencia, no un imán.
- Los paneles Glass leen la misma posición normalizada del mouse y aplican un `translate` de 2–6px máximo (parallax de UI, capa separada del parallax del cerebro para dar sensación de profundidad en 2 planos).

### 3.6 Integración con scroll
- Un único canvas fijo (`position: fixed`, detrás de todo el contenido) persiste durante todo el scroll. **No se destruye ni reinicia entre secciones.**
- `ScrollTrigger` expone un `progress` global (0–1) que controla, por tramos definidos por sección:
  - posición/rotación de la cámara (dolly sutil, nunca corte brusco),
  - qué subconjunto de conexiones está "activo" (algunas se apagan/encienden con fade, nunca pop),
  - la temperatura de color de la iluminación ambiental (más azul en hero → un poco más violeta en impacto → vuelve a azul en CTA final, vía `lerp` de color en el shader/ambient light),
  - intensidad de bloom/post-proceso.
- Todos los cambios se interpolan (`gsap.to` sobre un objeto proxy que el render loop lee), nunca se asignan directo — así nunca hay saltos.

### 3.7 Rendimiento / degradación
- Un único `requestAnimationFrame` loop; el cerebro **pausa su actualización** (no el render, la simulación) cuando `document.hidden` o cuando el canvas está fuera del viewport visual relevante (usamos esto poco ya que es de fondo, pero sí se reduce el trabajo de post-proceso fuera del hero).
- Detección de capacidad simple al boot (dpr, `navigator.hardwareConcurrency`, prueba de frame budget) → perfil **alto** (bloom + 600 partículas) vs **medio** (sin bloom, 300 partículas) vs **reducido** (partículas estáticas con brillo pulsante vía shader, sin post-proceso).
- `prefers-reduced-motion`: se detiene el movimiento de cámara y el parallax de mouse; el cerebro conserva únicamente pulsos y partículas a velocidad reducida (nunca 100% estático, para no romper la identidad visual, pero sin movimiento que pueda incomodar).

---

## 4. Sistema de movimiento (fuera del cerebro)

| Elemento | Comportamiento |
|---|---|
| Texto de títulos | Reveal línea por línea (`clip-path` + `translateY`, no fade simple), stagger ~80ms, ease `expo.out`, disparado por `ScrollTrigger` una sola vez por sección |
| Palabras clave | Un `<span>` con transición de `text-shadow`/opacidad de 0 → brillo sutil, con un pequeño delay respecto al resto de la línea |
| Texto secundario | Aparece 150–200ms después del título, fade + 8px de desplazamiento vertical |
| Cards Glass | Entran con blur decreciente (18px → 0) + opacidad + `translateY(24px)→0`, **nunca desde los lados** |
| Hover de card | `translateY(-4px)`, aumento de `border-color` a estado luminoso, incremento leve de blur de fondo — transición 300–400ms `ease-out`, sin overshoot/rebote |
| Botones | Borde con gradiente animado que "recorre" el perímetro (`conic-gradient` rotando en `::before`); fondo con radial-gradient centrado que aumenta opacidad en hover; ícono de flecha con `translateX(4px)` en hover |
| Fondo | Capa adicional (detrás del cerebro, delante del `#05070A` base): micro-partículas muy tenues + grid casi invisible (`opacity: 0.03`) + 2 "nebulosas" (radial-gradients grandes, blur extremo) con drift muy lento (`translate` de recorrido amplio, duración 40–60s, loop) |

Reglas transversales: **todas las transiciones usan `transform`/`opacity`/`filter`** (evitar animar `width`, `top/left`, `box-shadow` directamente — se usan pseudo-elementos o `filter: drop-shadow` cuando se necesita sombra animada). Ninguna animación de entrada dura menos de 500ms ni usa easings con rebote (`back`, `elastic` quedan prohibidos en este proyecto).

---

## 5. Lenguaje Glass UI

Token base (`--glass-*` en CSS):

```
--glass-bg: rgba(14, 19, 32, 0.55);       /* sobre #0E1320 */
--glass-bg-hover: rgba(14, 19, 32, 0.68);
--glass-border: rgba(255, 255, 255, 0.08);
--glass-border-hover: rgba(77, 124, 255, 0.35);
--glass-blur: 40px;
--glass-blur-hover: 48px;
--glass-shadow: 0 20px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06);
```

- `backdrop-filter: blur(var(--glass-blur)) saturate(140%)` — el `saturate` es lo que evita que el glass se vea "lavado" sobre el azul/violeta del fondo.
- Reflejo superior: `inset 0 1px 0 rgba(255,255,255,0.06)` (un solo px, nunca un gradiente grande — así se evita el efecto "genérico glassmorphism 2021").
- Refracción sutil: borde de 1px con gradiente diagonal muy leve (`linear-gradient(135deg, rgba(255,255,255,.14), rgba(255,255,255,0) 40%)`) aplicado solo al `border-image` o a un pseudo-elemento de 1px, no al fondo completo.
- Ningún panel usa gradiente de color de marca en el fondo — el color vive en bordes, glow y acentos tipográficos, nunca como relleno.
- Esquinas: radio consistente 20px paneles grandes / 14px paneles pequeños — nunca `border-radius: 50%` en paneles rectangulares ni mezcla de radios en la misma jerarquía.

---

## 6. Paleta de iluminación

| Token | Valor | Uso |
|---|---|---|
| `--bg-void` | `#05070A` | Fondo absoluto, detrás de todo |
| `--bg-panel` | `#0E1320` | Base de paneles Glass, franjas de sección |
| `--accent-blue` | `#4D7CFF` | Conexiones "frías", nodos en reposo, focos primarios, links |
| `--accent-violet` | `#8B5CF6` | Pulsos, partículas en destino, acentos de CTA, hover de bordes |
| `--fg` | `#FFFFFF` | Tipografía, a distintas opacidades (100/70/45%) |

Reglas de iluminación:
- El cerebro usa **azul como estado de reposo** y **violeta como estado de actividad** (pulso/partícula llegando) — el degradado entre ambos *es* el lenguaje de "pensamiento" del sistema. Nunca se usan ambos colores al 100% de saturación simultáneamente en la misma zona — siempre uno domina y el otro acentúa.
- Ninguna superficie usa negro puro (`#000`) — el negro real es `--bg-void`, todo lo demás sube desde ahí para mantener profundidad tonal.
- El blanco nunca se usa al 100% de opacidad salvo en títulos principales; cuerpo de texto en 70%, labels/mono en 45–55%.
- Glow: siempre vía `filter: drop-shadow()` o material emissive en Three (nunca `box-shadow` de gran radio en múltiples capas — mata el performance en móvil).
- Contraste: todo texto funcional (nav, CTA, labels) se valida contra el fondo más claro que puede tener detrás (paneles Glass en su estado hover) para mantener legibilidad ≥ WCAG AA sobre `--bg-panel`.

---

## 7. Jerarquía tipográfica

Familia única: **Inter** (variable), sin fuente secundaria — el peso hace el trabajo de jerarquía, no una segunda tipografía.

| Nivel | Tamaño (desktop / mobile) | Peso | Tracking | Uso |
|---|---|---|---|---|
| Display (Hero/CTA) | `clamp(3.5rem, 8vw, 7.5rem)` | 600 | -0.02em | Títulos de 3 líneas, hero y CTA final |
| H2 sección | `clamp(2rem, 4vw, 3.25rem)` | 600 | -0.01em | Encabezado de cada sección |
| Body grande | `1.25rem` / `1.05rem` | 400 | 0 | Subtítulos/lead |
| Body | `1rem` | 400 | 0 | Texto de cards |
| Label / eyebrow | `0.75rem` | 500 | 0.18em, uppercase | "SOFTWARE A MEDIDA", nav, números 01–04 |
| Mono/data | `0.875rem` (fuente mono del sistema, ej. `ui-monospace`) | 500 | 0.05em | Métricas, stack tecnológico, coordenadas decorativas |

Reglas: line-height 1.0–1.05 en Display (para que se sienta "compacto y pesado", no aireado), 1.5 en body. Los números de proceso (01/02/03/04) usan la variante mono para reforzar la sensación "sistema", contrastando con el peso humanista de Inter en los títulos.

---

## 8. Arquitectura de componentes

```
/src
  /brain
    scene.ts          → setup de Three.js (renderer, cámara, post-proceso)
    network.ts        → generación procedural de nodos/conexiones (data only)
    materials.ts       → ShaderMaterial de nodos, líneas y partículas (GLSL)
    particles.ts       → sistema de partículas viajeras sobre curvas
    pulses.ts          → sistema de propagación de pulsos
    interaction.ts     → mapeo mouse → target de cámara / campo de fuerza
    scrollBinding.ts   → expone hooks para que scroll-controller anime la cámara/luz
  /background
    fieldParticles.ts  → capa de partículas de fondo (detrás del cerebro)
    grid.ts            → grid/nebulosas CSS o canvas 2D liviano
  /ui
    glass.css          → tokens y clases .glass-panel, .glass-panel--hover
    buttons.css        → botón con borde animado
    typography.css     → escala tipográfica y utilidades de reveal
    nav.ts             → navegación mínima + estado scroll (compacta al hacer scroll)
  /sections
    hero.ts
    trustMarquee.ts
    process.ts
    solutions.ts
    impact.ts
    techMarquee.ts
    cta.ts
    footer.ts
  /core
    scrollController.ts → único ScrollTrigger timeline maestro, expone progress global
    textReveal.ts        → utilidad reusable de reveal línea por línea
    perfProfile.ts        → detección de capacidad + prefers-reduced-motion
    mouse.ts              → posición normalizada de mouse compartida (store simple)
  main.ts                 → orquesta boot: perfil de performance → brain.scene → sections → scrollController
index.html
styles/tokens.css          → variables de color/espaciado/blur globales
```

**Comunicación entre capas:** no hay un framework de estado; se usa un store mínimo basado en un `EventTarget`/objeto reactivo simple (`core/store.ts`) que expone `scrollProgress`, `mouseNormalized` y `activeSection`. Tanto `brain/scrollBinding.ts` como `ui/nav.ts` y las secciones lo consumen — una sola fuente de verdad, cero acoplamiento directo entre DOM y WebGL.

**Por qué un solo canvas y no uno por sección:** crear/destruir contextos WebGL por sección generaría *pops* de inicialización (exactamente lo que el brief prohíbe) y multiplicaría el costo de GPU. Un canvas persistente con estados interpolados es más barato y es el único enfoque compatible con "el cerebro genera la atmósfera completa del sitio".

---

## 9. Checklist de calidad antes de dar por buena la implementación

- [ ] 60 FPS sostenidos en gama media (perfil "medio") con DevTools performance throttling 4x
- [ ] `prefers-reduced-motion` respetado sin que la página se sienta "rota" o vacía
- [ ] Ninguna animación de entrada usa easing con rebote
- [ ] Ningún layout de sección repite texto-izq/visual-der de forma consecutiva
- [ ] Contraste AA verificado en todos los estados de texto sobre glass
- [ ] El canvas no se reinicializa entre secciones (verificar en el loop, no solo visualmente)
- [ ] Fallback razonable si WebGL no está disponible (mensaje + fondo estático con gradiente, nunca pantalla rota)

---

## 10. Próximos pasos

1. Scaffold del proyecto (Vite + TS), tokens CSS, tipografía self-hosted.
2. `brain/` — geometría procedural + shaders de nodos/líneas (sin partículas aún) para validar la silueta y la respiración.
3. Sistema de partículas + pulsos sobre esa base.
4. Interacción de mouse (parallax de cámara + campo de partículas).
5. Layout HTML/CSS de todas las secciones con Glass UI, sin scroll-binding todavía (contenido estático).
6. `scrollController` + integración cámara/luz + reveals de texto/cards.
7. Perfil de performance + reduced motion + pulido final.

Quedo a la espera de tu confirmación sobre este documento (o ajustes puntuales) antes de iniciar el paso 1.
