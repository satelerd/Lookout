# Adopción y rollback preservando datos privados

Config, perfil, runtime, futuras sesiones/chats/logs y bundles están fuera del checkout. Este código no cambia sus schemas ni ejecuta migraciones.

Revisa release/PR, commit exacto, diff, dependencias y CI. Conserva cambios locales en su rama y pausa el runtime. Si hay .lookout de 0.1 dentro de Git, doctor lo señala y el planner rechaza la adopción: acuerda backup/migración privados con el dueño, sin copiar sesiones ajenas ni eliminar nada automáticamente.

No hay fetch, instalación de dependencias ni scripts candidatos automáticos:

```sh
git fetch origin main
npm run lookout -- update plan --home "$LOOKOUT_DATA" --to IMMUTABLE_COMMIT_SHA
```

Exige checkout limpio, destino disponible, paths permitidos y scan del diff. Rechaza symlinks, submodules, Git attributes y filtros configurados; esos casos requieren revisión manual, no quitar controles. El plan guarda from/to/inventario/fingerprint, no respuestas ni sesiones.

Tras revisión humana, con el digest exacto:

```sh
npm run lookout -- update adopt --home "$LOOKOUT_DATA" --digest UPDATE_DIGEST --confirm "adopt-code:UPDATE_DIGEST"
```

Cambia código con git switch --detach y hooks deshabilitados sólo para esa invocación. No guarda permisos Git ni corre npm. Reserva/recibo y HEAD permiten comprobar resultado incierto antes de repetir.

Rollback también requiere revisión y aprobación:

```sh
npm run lookout -- update rollback --home "$LOOKOUT_DATA" --digest UPDATE_DIGEST --confirm "rollback-code:UPDATE_DIGEST"
```

Sólo vuelve al código previo; conserva datos privados actuales, no restaura una copia vieja ni revive terminaciones. Repetir sobre el destino exacto no modifica nada. HEAD/datos inesperados bloquean adopción. El dueño elige después una rama desde detached HEAD.

Una actualización no autoriza nuevas conexiones/permisos. Instalación/checks de código externo necesitan revisión y aislamiento apropiados. Tests usan Git temporal y datos ficticios sin cuenta real.
