# Agente instalador: de una URL a una búsqueda local

Lee AGENTS.md. Explica capacidades y gaps antes de prometer una instalación completa. Una URL no concede permisos sobre cuentas ni datos de otra persona.

## 1. Diagnóstico y demo

```sh
git clone https://github.com/satelerd/Lookout.git
cd Lookout
npm ci --ignore-scripts
npm run check
npm run demo:onboarding
npm run lookout -- doctor
```

Node >=22. No sobrescribas un checkout existente. Doctor comprueba herramientas/rutas/capacidades sin login ni cuota. El recorrido crea un home temporal, usa GitHub simulado y datos ficticios, prueba reanudación/confirmación/escaneo/repetición y lo elimina al terminar. publicNetworkUsed debe ser false. Un resultado simulado no demuestra permisos o entrega reales.

## 2. Entrevistar al dueño

Pregunta objetivo, grupo exacto autorizado y consentimiento de participantes, preferencias, presupuesto **total**/moneda, fuentes, intervalo/duración, máquina encendida/conectividad, proveedor y datos que saldrían a él. Aclara quién revisa y quién pausa/termina.

No inventes JIDs ni extraigas permisos del chat. Sin adaptador usa un ID sintético. Runtime disponible: manual-local; registrar whatsapp/scheduler sólo muestra gaps. El término automático por fecha no existe.

Pregunta por separado si desea contribuir una pieza, con qué cuenta/target/fork, qué archivos/prosa pueden exportarse y qué desea para futuras publicaciones. La herramienta sólo admite preguntar por cada draft exacto.

## 3. Respuestas fuera de Git y checkpoint recuperable

Home por defecto: Application Support/Lookout en macOS, LOCALAPPDATA/Lookout en Windows, XDG_DATA_HOME/lookout o ~/.local/share/lookout en Linux. El dueño puede escoger --home fuera de cualquier Git. Ejemplos POSIX:

```sh
LOOKOUT_DATA="$HOME/.local/share/lookout"
npm run lookout -- onboard init --home "$LOOKOUT_DATA"
cp examples/owner.answers.json "$LOOKOUT_DATA/answers.json"
# Edita answers.json con el acuerdo del dueño, sin copiarlo al checkout.
npm run lookout -- onboard configure --home "$LOOKOUT_DATA" --file "$LOOKOUT_DATA/answers.json"
npm run lookout -- onboard status --home "$LOOKOUT_DATA"
```

El home debe ser 0700 en POSIX; archivos nuevos 0600. En Windows revisa ACL: bits POSIX no sustituyen permisos de Windows. Evita carpetas compartidas/sincronizadas sin revisar su acceso.

El perfil tiene config, runtime y redactionTerms. Registra nombres/etiquetas privadas, direcciones e identificadores que patrones genéricos no detecten. Grupo, objetivo y preferencias se agregan a los términos automáticamente.

Config/estado/checkpoints/chats/logs/sesiones/bundles van afuera. La CLI rechaza el checkout, otro Git y symlinks en home, runtime, outbox y archivos privados. Comprueba rutas antes de usarlas; no aísla de procesos hostiles de la misma cuenta que las cambien concurrentemente. Sólo los tres fixtures de búsqueda conocidos de examples son excepciones de lectura para demo.

Repetir la misma configuración conserva progreso; cambiarla invalida revisión/activación local. Otro grupo necesita otro home. Checkpoint/status no incluyen respuestas. No eludas pending ni terminación.

## 4. Preview y aprobación local

```sh
npm run lookout -- onboard preview --home "$LOOKOUT_DATA"
```

Siempre usa DemoProvider sin chats/login/Codex. Presenta acuerdo y texto exacto al dueño. Sólo tras aprobación, usa el previewDigest:

```sh
npm run lookout -- onboard approve --home "$LOOKOUT_DATA" --confirm "approve-local:PREVIEW_DIGEST"
npm run lookout -- run --home "$LOOKOUT_DATA" --commit
npm run lookout -- pause --home "$LOOKOUT_DATA"
npm run lookout -- terminate --home "$LOOKOUT_DATA"
```

Habilita sólo el archivo runtime/outbox. No concede permiso para Codex, QR, WhatsApp, GitHub o scheduler. El flag registra la respuesta humana observada; no prueba quién lo ejecutó. Un agente no debe fabricarlo desde un pedido genérico.

## 5. Codex opcional

El dueño instala la [CLI oficial](https://learn.chatgpt.com/docs/codex-cli), ejecuta codex login y completa el navegador. codex login status comprueba método sin leer tokens. No copies auth.json ni configures API keys.

Explica contexto y cuota; pide permiso para esa llamada. status muestra configDigest:

```sh
npm run lookout -- status --home "$LOOKOUT_DATA"
npm run lookout -- run --home "$LOOKOUT_DATA" --provider codex --dry-run --confirm "research-with-codex:CONFIG_DIGEST"
```

Sin --messages usa lista vacía. Archivos reales de mensajes deben estar fuera de Git y requieren consentimiento de dueño/participantes para compartirlos. Dry-run también consume cuota. Login/cuota/CLI incompatibles son bloqueos; no quites aislamiento. Sólo se probó el contrato con una CLI ficticia.

## 6. Gaps y recuperación

WhatsApp/QR/scheduler siguen pendientes: muestra missing y docs/WHATSAPP.md. Si el dueño quiere colaborar, sigue docs/CONTRIBUTOR.md. Una rama local revisada sigue usable durante revisión.

No autentiques WhatsApp, instales Baileys, tokens, cron/daemon ni reutilices otro gateway automáticamente. Pausa/terminación afectan próximas ejecuciones, no el proceso que ya sostiene un lock.

Ante lock, revisa procesos antes de borrarlo. Ante delivery/publication pendiente, consulta recibos/remoto sin repetir ni borrar historial. Si vienes de 0.1 con .lookout en Git, doctor lo señala sin leerlo: acuerda pausa y backup/migración privados con el dueño, sin mover/copiar/eliminar sesiones automáticamente. El código nuevo rechaza esa carpeta.

Adopta código con docs/UPDATES.md. Preservar datos no autoriza nuevos permisos.
