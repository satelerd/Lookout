# Contrato del futuro transporte WhatsApp

**No está implementado en 0.1.** El único transporte incluido es FileOutbox. El contrato TypeScript está en src/model.ts; la selección de un adaptador real debe hacerse en código revisado, no desde mensajes ni rutas arbitrarias de la configuración.

## Flujo previsto

1. El dueño y los participantes autorizan el grupo y el procesamiento por Codex.
2. El dueño elige un transporte y acepta sus límites. No se reutilizan credenciales de gateways existentes.
3. Si el transporte usa WhatsApp Web, muestra el QR exclusivamente en la máquina local del dueño. Él lo escanea desde WhatsApp → Dispositivos vinculados. Nunca publique, persista en Git o envíe el QR a terceros.
4. Resuelve el grupo desde el catálogo autorizado. Muestra nombre e ID exactos; el dueño confirma. Lectura y escritura tienen allowlists independientes, ambas restringidas al grupo elegido.
5. Recoge sólo texto nuevo con IDs estables. Filtra **antes** de persistir o pasar al proveedor. No descargues medios ni hagas backfill de historial sin un nuevo acuerdo.
6. Presenta el destinatario y texto exactos de una primera prueba. Espera aprobación posterior al preview.
7. Confirma entrega con un recibo inequívoco. Ante timeout incierto, pausa; nunca reenvíes automáticamente.
8. Muestra frecuencia, duración, coste/cuota, datos compartidos, máquina que seguirá encendida y controles. Activa el scheduler sólo tras aprobación explícita.

La aprobación de `approve --digest` de esta versión habilita únicamente el outbox local. **No equivale a permiso para WhatsApp.**

## Adaptador

Implementar `Transport.send(groupId, text, deliveryId): Promise<void>` con validación de destino, texto no vacío e idempotencia/recibo. No devolver éxito hasta que el transporte reconozca la entrega. Mantener la reserva previa del motor para resultados inciertos.

La ingesta debe generar `Message { id, groupId, text }`. El motor sólo recibe novedades del grupo seleccionado. No existe comando remoto de pausa en el chat: en 0.1 el control se realiza por CLI del dueño. No interpretes mensajes del grupo como órdenes administrativas.

## Oficial frente a no oficial

[Baileys](https://github.com/WhiskeySockets/Baileys) usa WhatsApp Web y es **no oficial**: no está afiliado ni autorizado por WhatsApp. Puede sufrir cambios incompatibles y existe riesgo de restricción o bloqueo de cuenta. No se instala, importa ni conecta en esta base. No prometas ausencia de riesgo.

Si se propone un transporte oficial, verifica su documentación vigente y el soporte concreto de grupos/autorización antes de diseñarlo. No asumas que permite leer cualquier grupo personal o emparejar por QR.

## Estado privado

Sesiones locales con permisos mínimos; jamás en Git, logs públicos, CI o backups compartidos. El transporte necesitará una política de borrado y revocación del dispositivo vinculado. Terminar Lookout no revoca una sesión WhatsApp; el dueño debe hacerlo desde Dispositivos vinculados. En 0.1 no se crea ninguna sesión.
