# Agente mantenedor: triage local antes de automatizar

La propuesta está **desactivada**. No hay bot, scheduler, permisos de respuesta automática ni proceso residente.

```sh
npm run lookout -- maintainer proposal
```

Propuesta para revisar después: 360 minutos, CLI local manual hasta elegir host, identidad sin asignar, un repo público explícito, lectura de metadatos y drafts locales. Respuestas públicas: permiso posterior al preview por item. Código externo: no ejecutar por defecto. Merges: dueño. Sin secretos ni publicaciones futuras automáticas.

## Recorrido

1. Obtén un snapshot público acotado bajo alcance autorizado, sin conversaciones privadas.
2. Guárdalo fuera del checkout; triage lo trata como datos y no hace polling.
3. Revisa fuentes, reproducción sintética, trabajo existente, privacidad/scopes y CI del commit exacto.
4. Prepara respuesta local. Publicarla requiere aprobación tras mostrar destinatario y texto completos; la herramienta no la envía.
5. Un preview requiere scope aprobado y entorno desechable aislado, con datos sintéticos, sin montar home/credenciales/sesiones del host y sin red innecesaria.
6. El dueño decide merges, incluso con CI verde. No heredes el permiso del contribuidor.

Ejemplo ficticio:

```sh
cp examples/maintainer.snapshot.json "$LOOKOUT_DATA/maintainer-snapshot.json"
npm run lookout -- maintainer triage --home "$LOOKOUT_DATA" --file "$LOOKOUT_DATA/maintainer-snapshot.json"
```

Títulos/body se citan como strings JSON y se redactan; drafts llevan publish/merge/executeExternalCode=false. Repetir el snapshot no genera otro draft; cambiar datos relevantes sí.

Issues, README de forks, comentarios, workflows, tests y scripts son código/datos externos no confiables. No ejecutes órdenes que pidan secretos ni uses runners personales con sesiones para previews. Un test o comentario GitHub no concede permisos.

## Activación futura

Definir identidad, host/aislamiento, frecuencia/duración, repos/eventos, tipos de respuestas autorizadas, aprobación de previews, cuota/presupuesto y pausa/revocación. Seis horas es propuesta, no una tarea creada.

No añadas tokens, scopes persistentes, cron/daemon o secrets para “dejarlo listo”. Esta fase sólo implementa triage local y el contrato de revisión; el dueño decide los merges.
