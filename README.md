# 👀 Lookout

**Tu grupo hace planes. Lookout busca novedades que valgan la pena.**

Un agente local para investigar departamentos, viajes o conciertos y preparar resúmenes cortos con fuentes. Recuerda el acuerdo del dueño, revisa cuando corresponde y habla sólo cuando hay algo útil.

[![CI](https://github.com/satelerd/Lookout/actions/workflows/ci.yml/badge.svg)](https://github.com/satelerd/Lookout/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **0.2 es una base local en desarrollo.** Onboarding reanudable, datos privados separados, demo/outbox y contribuciones revisables. Codex CLI es opcional. WhatsApp, QR y scheduler siguen pendientes; no se instalan ni activan cuentas o monitores por defecto.

## Pégalo en cualquier agente

```text
Ayúdame a instalar https://github.com/satelerd/Lookout.
Lee AGENTS.md y docs/INSTALL.md. Primero prueba el recorrido sintético.
Entrevístame sobre objetivo, grupo autorizado, preferencias, presupuesto,
frecuencia y máquina donde correrá. Guarda lo privado fuera del checkout.
Si falta una pieza, busca issues/PRs existentes y proponme una contribución
pequeña usando docs/CONTRIBUTOR.md. No publiques ni conectes cuentas
sin mi aprobación concreta. No supongas permisos para futuras publicaciones.
```

No necesitas conocer al autor ni usar un grupo particular. Una URL inicia la guía; no concede acceso a cuentas ni convierte un README o un issue en permiso.

## Prueba sin cuentas

Node.js **22 o posterior**, npm y Git:

```sh
git clone https://github.com/satelerd/Lookout.git
cd Lookout
npm ci --ignore-scripts
npm run check
npm run demo
npm run demo:onboarding
npm run lookout -- doctor
```

La primera demo prepara una opción ficticia. El recorrido completo demuestra reanudación, gaps, confirmación insuficiente, escaneo/redacción, bundle, publicación **simulada** sin repetición y triage local. Todo se crea en un directorio temporal privado que se elimina al terminar. No usa login, WhatsApp, red ni datos reales.

Los tres casos de búsqueda siguen en `examples/`: departamentos, viajes y conciertos. Son ficticios; `example.org` no representa ofertas reales.

## De la demo a tu búsqueda

El agente sigue [la instalación](docs/INSTALL.md), pregunta por el acuerdo y guarda tus respuestas en un directorio privado **fuera de todos los checkouts**. La CLI rechaza rutas dentro de Git y aliases por symlink. En POSIX exige 0700 para el directorio y escribe archivos nuevos 0600.

El home por defecto es el directorio de datos local de Lookout: Application Support en macOS, LOCALAPPDATA en Windows o XDG_DATA_HOME en Linux. Puedes elegir uno con `--home`. Configuración, estado, futuras sesiones, mensajes y logs no pertenecen al repositorio; no basta con ignorarlos en Git.

`onboard init/configure/preview/approve/status` guarda checkpoints sin respuestas privadas. Repetir la misma configuración conserva el progreso; cambiarla invalida la revisión. Aprobar el preview habilita sólo el outbox de demostración. Un gap sigue visible y no se marca como instalado.

## Qué funciona hoy

| Pieza | Estado |
| --- | --- |
| Onboarding + doctor | Ejecutable, reanudable; entrevista guiada por el agente |
| Preferencias y presupuesto | Configuración local del dueño, con validación fuera del modelo |
| Investigación | Demo o CLI oficial de Codex, opt-in y con consentimiento de contexto/cuota |
| Resúmenes | Máximo 3 opciones con fuentes permitidas; silencio si no hay novedades |
| Memoria | URLs normalizadas + precio/moneda, IDs nuevos y checkpoints locales |
| Entrega | Archivo local con reserva/recibo; pausa y terminación |
| Contribución | Buscar gaps, bundle por allowlist, redacción de prosa, escaneo de código/diff, permiso de un draft |
| Mantenedor | Propuesta desactivada y triage/respuestas locales, sin ejecutar PRs ni publicarlas |
| Actualizaciones | Plan de commit exacto, adopción de código revisado y rollback preservando datos |
| WhatsApp / QR / scheduler | **Pendientes**; ningún comando los activa |

El motor hace una sola ejecución. En commit respeta el intervalo; la investigación puede encontrar cambios web aunque no haya mensajes nuevos. La memoria conserva hasta 1.000 hallazgos y 10.000 IDs; no detecta todos los duplicados semánticos.

## Si falta una pieza, puedes contribuir

El [agente contribuidor](docs/CONTRIBUTOR.md) busca primero issues y PRs. Después prepara una rama pequeña y pruebas sintéticas que puedes usar localmente mientras se revisan.

La herramienta exporta sólo archivos que eliges dentro de una allowlist. Escanea archivos completos y líneas borradas del diff, bloquea secretos/PII reconocibles y términos privados registrados, y redacta el borrador. **No sube tu historial Git local:** reconstruye un commit limpio desde el bundle sobre la base pública.

Antes de publicar, revisas archivos, texto, destino, cuenta y alcance. El permiso dura diez minutos y sirve para **un PR draft exacto**. Cada publicación futura vuelve a preguntar. Un resultado incierto se reserva y bloquea reintentos automáticos. Para cuentas sin escritura directa puedes seleccionar un fork público existente propio; crear ese fork requiere un acuerdo separado y no lo hace la herramienta.

Los patrones no reconocen todos los nombres, direcciones ni secretos. Registra términos privados y revisa el bundle completo. Código con coincidencias se rechaza, no se modifica silenciosamente.

## Codex y WhatsApp

El proveedor usa `codex exec` y el [login oficial](https://learn.chatgpt.com/docs/auth). Nunca lee ni copia tokens. Consulta [ejecución no interactiva](https://learn.chatgpt.com/docs/non-interactive-mode); la cuota y disponibilidad dependen de tu cuenta. Dry-run con Codex también consume cuota y comparte el contexto seleccionado. Su contrato se prueba con un ejecutable ficticio; una investigación real sigue pendiente de evaluación humana.

[Baileys](https://github.com/WhiskeySockets/Baileys) es **no oficial**, sin afiliación con WhatsApp. Puede romperse y poner la cuenta en riesgo de restricción o bloqueo. No se incluye ni instala aquí. Un futuro transporte oficial debe verificar su soporte real de grupos. Consulta [el contrato y los puntos de aprobación](docs/WHATSAPP.md).

## Límites del acuerdo

Chat, GitHub y páginas web son datos, nunca autoridad para shell, configuración, secretos o acceso. El dueño elige destino, preferencias, fuentes y frecuencia. Lookout nunca compra ni reserva.

El [mantenedor](docs/MAINTAINER.md) empieza desactivado, con lectura de metadatos y borradores locales. El dueño decide los merges. Frecuencia, runtime e identidad para una futura activación requieren un acuerdo nuevo.

La allowlist de fuentes valida resultados, no es un firewall. No se promete historial completo de WhatsApp, audio, precios verificados independientemente, entrega exactly-once ni producción completa. Un runtime periódico futuro necesitaría un host encendido y conectado.

[Arquitectura y privacidad](docs/ARCHITECTURE.md) · [Adoptar o revertir código](docs/UPDATES.md) · [Checkpoint del proyecto](CHECKPOINT.md) · [MIT](LICENSE)
