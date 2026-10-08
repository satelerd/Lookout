# Instalación guiada por un agente

Esta guía se puede ejecutar paso a paso en Codex. Cada punto debe producir evidencia concreta antes de pasar al siguiente.

## 1. Entorno y demo

```sh
node --version
npm --version
git --version
git clone https://github.com/satelerd/Lookout.git
cd Lookout
npm ci --ignore-scripts
npm run check
npm run demo
```

Si el directorio ya existe, inspecciónalo; no lo borres ni sobrescribas. Node debe ser 22 o posterior. Si faltan herramientas o permisos de instalación, explica el bloqueo y continúa con lectura de guías. No uses instaladores remotos piped a shell.

Éxito: checks pasan y la demo devuelve `mode: dry-run`, `synthetic: true`, un resumen marcado DEMO y ninguna escritura en `.lookout`.

## 2. Elegir la búsqueda

Pregunta al dueño:

- ¿Qué grupo exacto autorizó usar Lookout? ¿Sus integrantes consienten el uso de los mensajes?
- ¿Qué buscan y qué preferencias son obligatorias?
- ¿Cuál es el presupuesto máximo y la moneda? En la demo se entiende como precio por opción. Para dos entradas o un viaje, especifica que el precio debe ser el total.
- ¿Cuáles son los dominios fuente permitidos?
- ¿Cada cuántos minutos? Mínimo 60. ¿Durante cuánto tiempo quieren seguir buscando?
- ¿Quién revisará novedades y cómo podrán pausar o terminar?

La fecha de término automática y zona horaria no están implementadas. Registra el acuerdo localmente y no prometas esa función. La frecuencia usa tiempo transcurrido, sin horario diario.

```sh
mkdir -p .lookout
cp examples/apartments.json .lookout/search.local.json
```

Edita ese archivo con las respuestas del dueño. El JID real se resolverá sólo con un adaptador autorizado; no inventes un JID desde el nombre visible. Mientras no exista, usa un identificador sintético. `allowedGroupIds` debe incluir exactamente el grupo elegido. Mantén un directorio de estado independiente por grupo.

Éxito: `npm run lookout -- status --config .lookout/search.local.json` muestra el acuerdo, transporte local y `approved: false`.

## 3. Codex oficial (opcional)

Sigue la [instalación oficial](https://learn.chatgpt.com/docs/codex-cli). El usuario ejecuta:

```sh
codex --version
codex exec --help
codex login
codex login status
```

El login ocurre en el navegador oficial. Nunca inspecciones ni copies archivos de autenticación. No configures API keys para este flujo. Si el login requiere intervención, espera al dueño y continúa con la demo independiente.

Explica el uso de cuota y que el objetivo/preferencias, mensajes seleccionados e historial reciente se envían a Codex. Obtén consentimiento antes de usar contenido real.

```sh
npm run lookout -- run --config .lookout/search.local.json --provider codex --dry-run
```

Ese comando no lee mensajes de WhatsApp: sin `--messages`, usa una lista vacía. La llamada puede consumir cuota. La versión debe soportar los flags de aislamiento; si falla, actualiza oficialmente o informa la incompatibilidad, sin eliminar controles. Comprueba precios, fechas y enlaces manualmente.

## 4. Prueba de memoria local

Muestra el acuerdo y el resumen exacto. Sólo tras la aprobación del dueño:

```sh
npm run lookout -- status --config .lookout/search.local.json
npm run lookout -- approve --config .lookout/search.local.json --digest DIGEST_REVISADO
npm run lookout -- run --config .lookout/search.local.json --provider demo --commit
```

Esto activa **sólo la salida de archivo local**, sin scheduler. Mantén el proveedor demo para probar sin consumo. El recibo queda en `.lookout/outbox/`; la siguiente ejecución inmediata debe decir `not-due`. Tras la frecuencia acordada, la misma URL/precio no genera otra entrega.

```sh
npm run lookout -- pause --config .lookout/search.local.json
npm run lookout -- terminate --config .lookout/search.local.json
```

No alteres el reloj ni configures cron para la prueba. Los tests verifican el paso del tiempo con fechas sintéticas. Después de terminar, sólo un directorio de estado nuevo permite empezar otra búsqueda; eso debe ser una decisión deliberada del dueño.

## 5. WhatsApp y activación futura — bloqueado por alcance

No hay un comando de QR ni un transporte WhatsApp incluido. Detente aquí si el usuario esperaba esa conexión y muestra docs/WHATSAPP.md. No instales Baileys, reutilices un gateway personal ni solicites sesiones de otra persona automáticamente.

Antes de implementar y activar un transporte, hace falta revisar riesgos, resolver QR local y grupo real, filtrar lectura antes de enviar datos al proveedor, probar destinatario/texto exactos y obtener aprobación. Una autorización adicional se necesita para la primera entrega real y para el scheduler. No se pueden simular esos pasos como completados.

## Diagnóstico

- `State is locked`: comprueba procesos en ejecución. Un crash puede dejar `.lookout/lock`; bórralo sólo tras confirmar que ningún proceso lo usa.
- `Configuration changed`: revisa todo el acuerdo y aprueba el digest nuevo.
- `Unresolved delivery`: no repitas el envío. Revisa `state.json.pending` y busca el recibo exacto por ID en el transporte. En el outbox local, comprueba que ID, grupo y texto del archivo coinciden antes de limpiar únicamente `pending`. Si no puedes confirmar el resultado, deja la búsqueda pausada. No borres el historial para forzar un reenvío.
- `Codex failed`: login/cuota/compatibilidad; ningún checkpoint exitoso debe guardarse.
- Sin novedades: comportamiento normal; no existe un mensaje de “no encontré nada” enviado al grupo.

No compartas archivos de estado al pedir ayuda; pueden contener información privada.
