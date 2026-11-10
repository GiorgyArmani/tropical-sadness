<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Reglas del proyecto (tropical-sadness)

### Idioma
- Todo texto visible del sitio (UI, pistas, chat, metadata) va en español neutro venezolano con "tú": "espera", "intenta", "acércate". Nunca voseo ("esperá", "probá", "vos").
- Para moverse se dice "scrollea o usa la rueda del mouse para moverte".
- Las respuestas al usuario, en el mismo registro.

### Git
- Nunca hagas commit, push, ramas ni reset sin permiso explícito en ese mismo mensaje.
- "Guarda el progreso" significa dejar los archivos en disco, no hacer commit.

### Código
- Estilo: sin punto y coma, líneas de unas 160 columnas, comentarios en español. No hay config de Prettier: no corras `prettier --write`.
- Cambios mínimos: toca solo lo que pide la tarea.

### Servidor y navegador
- El usuario corre su propio `npm run dev` en :3000. Úsalo; no levantes otro servidor sin preguntar. Si levantas uno, mátalo por PID (todo el árbol) al terminar.
- Para revisar en el navegador usa Playwright: una sola pestaña, escenas una tras otra, y cierra con `about:blank`. Abrir muchas páginas tumba el navegador.
- Borra `.playwright-mcp/` al terminar: sus logs dentro del repo hacen que `next dev` recompile sin parar.
- Desactiva la caché en las pruebas: `globals.css` puede volver con 304 y verse el CSS viejo.

### /3d (motor ASCII en `components/ascii3d`)
- Primero el móvil: todo cambio del motor se diseña para Android/iPhone. Los extras visuales empiezan apagados en teléfonos (flag `phone`) y los activa el ajuste automático de calidad.
- Mide en Playwright con un contexto móvil (412x915, touch) y CPU throttle 4x.
- Nada de figuras SDF grandes dentro del `map()` de una escena: dispara el tiempo de compilación del shader. Los avatares van en su propio pase.
- Luz: oscuro pero siempre legible, focos de luz concentrados, color casi blanco (no amarillo).
- Sustos esporádicos, separados por minutos. Efectos de sonido limpios, picos cerca de 0.5, sin saturar. Para que se oigan, baja la radio con `DUCK_EVENT` en vez de subir los efectos.

### Audio
- El navegador solo deja sonar audio si arranca dentro de un gesto (toque, click, tecla). Por eso encender el sistema conecta la radio en el mismo toque, silenciada hasta que termina el arranque (`power.ts`, `BOOTED_EVENT`).
- En iPhone el volumen no se cambia desde código: para callar, usa `muted`.
