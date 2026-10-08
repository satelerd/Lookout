# 👀 Lookout

**Tu grupo hace planes. Lookout busca novedades que valgan la pena.**

Un agente local para investigar departamentos, viajes o conciertos y preparar resúmenes cortos con fuentes. La idea es simple: recordar lo que acordaron, revisar cada cierto tiempo y hablar sólo cuando haya algo útil.

[![CI](https://github.com/satelerd/Lookout/actions/workflows/ci.yml/badge.svg)](https://github.com/satelerd/Lookout/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Versión 0.1: prototipo local.** Ya puedes probar el ciclo, aprobación, presupuesto, deduplicación, pausa y salida local. Incluye un proveedor opcional de investigación con Codex CLI. **Todavía no conecta WhatsApp, muestra QR ni instala tareas periódicas.** La demo usa exclusivamente datos ficticios.

## Pégalo en Codex

Comparte esta URL con un amigo y pídele que la pegue en Codex:

```text
Ayúdame a instalar https://github.com/satelerd/Lookout.
Lee AGENTS.md y docs/INSTALL.md. Primero ejecuta la demo sin conectar cuentas.
Después ayúdame a elegir grupo, objetivo, preferencias, presupuesto,
fuentes y frecuencia. Muéstrame exactamente qué falta para WhatsApp.
No actives envíos ni tareas periódicas sin mi aprobación.
```

Codex sigue una guía ejecutable con puntos de control. Los pasos que todavía no existen se declaran como pendientes; el agente no debe inventarlos.

## Pruébalo en dos minutos

Necesitas **Node.js 22 o posterior**, npm y Git. La demo no necesita cuentas, API keys ni WhatsApp.

```sh
git clone https://github.com/satelerd/Lookout.git
cd Lookout
npm ci --ignore-scripts
npm run check
npm run demo
```

Verás un JSON de modo `dry-run` con una opción marcada **DEMO**, presupuesto y enlace a `example.org`. Ese enlace es sintético: no hay una oferta real. No escribe estado ni envía mensajes.

Otros casos:

```sh
npm run lookout -- run --config examples/travel.json --messages examples/travel.messages.json
npm run lookout -- run --config examples/concerts.json --messages examples/concerts.messages.json
```

## Lo que ya hace

| Paso                  | Implementado                                                               |
| --------------------- | -------------------------------------------------------------------------- |
| Leer novedades        | Archivos JSON autorizados; filtra un grupo exacto y IDs nuevos             |
| Mantener preferencias | Configuración local del dueño; ningún mensaje puede cambiarla              |
| Investigar            | Demo determinista o `codex exec` con búsqueda web, opt-in                  |
| Elegir novedades      | Presupuesto y moneda exactos; fuentes HTTPS permitidas; máximo 3 opciones  |
| Evitar repetición     | URL normalizada + precio + moneda; conserva historial local                |
| Preparar resumen      | Texto corto con enlace directo por opción; silencio si no hay novedades    |
| Entregar              | Outbox local con recibo; contrato intercambiable para un futuro transporte |
| Controlar             | Aprobación de configuración, frecuencia mínima, pausa y terminación        |

La deduplicación no entiende todos los duplicados semánticos: otro URL puede representar la misma oferta. Un cambio de precio sí cuenta como novedad. Se guardan hasta 1.000 hallazgos y 10.000 IDs; la memoria es finita.

## Investigación con tu cuenta de Codex

Instala la [CLI oficial](https://learn.chatgpt.com/docs/codex-cli), ejecuta `codex login` y completa el flujo de ChatGPT tú mismo. Lookout llama a `codex exec`; nunca lee, copia ni exporta tokens. No exige una API key.

```sh
codex login status
npm run lookout -- run --config .lookout/search.local.json --provider codex --dry-run
```

Crea primero ese archivo privado desde un ejemplo y reemplaza `example.org` por fuentes reales elegidas por ti. **Esta llamada sí usa tu cuota y envía al proveedor el objetivo, preferencias, mensajes seleccionados y hallazgos recientes**, aunque sea dry-run. Empieza sin mensajes reales y revisa cada fuente.

El adaptador usa una carpeta temporal, sandbox de sólo lectura, shell/apps/plugins deshabilitados y configuración personal ignorada. Requiere una CLI reciente que acepte esas opciones; no quites controles para salvar una incompatibilidad. El contrato se prueba con un ejecutable ficticio. No se ha certificado una investigación real ni la exactitud de sus resultados.

Consulta [autenticación oficial](https://learn.chatgpt.com/docs/auth) y [ejecución no interactiva](https://learn.chatgpt.com/docs/non-interactive-mode). La disponibilidad y cuota dependen de tu cuenta; la suscripción no es capacidad ilimitada. No hay reintentos automáticos ante cuota o login fallidos.

## Probar memoria y aprobación sin WhatsApp

```sh
npm run lookout -- status --config examples/apartments.json
# Revisa grupo, objetivo, preferencias, presupuesto, fuentes y frecuencia.
# Copia el configDigest mostrado y aprueba sólo si estás de acuerdo:
npm run lookout -- approve --config examples/apartments.json --digest DIGEST_REVISADO
npm run lookout -- run --config examples/apartments.json --messages examples/apartments.messages.json --commit
npm run lookout -- pause --config examples/apartments.json
npm run lookout -- terminate --config examples/apartments.json
```

`--commit` guarda estado y un archivo en `.lookout/outbox/`. **No envía a WhatsApp**. Un cambio de configuración invalida la aprobación. `terminate` es permanente para ese directorio de estado; no se puede reactivar con `pause` ni `approve`.

`run` hace una sola ejecución. En modo commit respeta la frecuencia; dry-run permite previsualizar inmediatamente y no consume el historial. No se instala un daemon ni cron. Para una futura ejecución periódica, el host tendrá que seguir encendido, conectado y con sesión válida.

## WhatsApp: lo que falta y lo que debes saber

El flujo deseado es: consentimiento del grupo → conexión elegida → QR local si corresponde → un grupo permitido → prueba exacta → aprobación → frecuencia. En esta versión, el QR y el envío real están **pendientes de implementar**. La [guía del transporte](docs/WHATSAPP.md) define el contrato y los puntos de aprobación.

[Baileys](https://github.com/WhiskeySockets/Baileys) es una librería **no oficial**, sin afiliación con WhatsApp. Usarla puede romperse y poner en riesgo la cuenta, incluida una restricción o bloqueo. No se incluye ni instala aquí. Un transporte oficial debe comprobar qué acceso a grupos permite realmente; no suponemos que tenga paridad con WhatsApp Web.

## Límites que elegimos

- El chat y las páginas web son datos, nunca autoridad para shell, permisos, configuración o instalación.
- Sólo el dueño cambia preferencias, presupuesto, fuentes, destino y frecuencia.
- Nunca compra, reserva ni contacta vendedores. El grupo decide.
- Los secretos, sesiones, mensajes privados y estado quedan fuera del repositorio. Los ejemplos son sintéticos.
- La allowlist de fuentes valida resultados; **no es un firewall de navegación**. El sandbox de Codex tampoco sustituye el consentimiento ni garantiza que el modelo ignore toda inyección.
- No hay captura completa de historial, audios, multimedia, verificación independiente de precios ni garantía de entrega de WhatsApp.

Lee [arquitectura y privacidad](docs/ARCHITECTURE.md), [instalación](docs/INSTALL.md) y [contribución](CONTRIBUTING.md). Proyecto nuevo, pequeño y abierto: la siguiente mejora útil es un transporte de prueba revisable, antes de conectar un grupo real.

## Licencia

MIT. Puedes usarlo, adaptarlo y compartirlo con tus amigos.
