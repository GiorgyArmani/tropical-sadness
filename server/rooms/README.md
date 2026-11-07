# Salas en vivo (/3d)

Servidor WebSocket chiquito que reparte las posiciones de los avatares entre las personas de una misma
escena. Todo vive en memoria: nada va a la base y, si se reinicia, los navegadores se reconectan solos.
Cada sala admite hasta 8 personas; si se llena, se abre otra igual.

## Desplegar en Dokploy

1. **Create Service → Application**, conectada a este repo (rama `main`).
2. **Build Type:** Dockerfile · **Build Path:** `server/rooms` · **Dockerfile:** `Dockerfile`.
3. **Environment:**
   ```
   PORT=8080
   ALLOWED_ORIGINS=https://tu-dominio.com,https://www.tu-dominio.com
   ```
   Ahí van los dominios exactos de la web, con `https://` y sin `/` al final. Si queda vacío, cualquier
   página podría conectarse: déjalo así solo para probar.
4. **Domains:** un subdominio (ej. `salas.tu-dominio.com`) → puerto **8080**, con HTTPS (Let's Encrypt).
   Traefik ya pasa los WebSocket, no hace falta nada más.
5. Deploy. Comprueba que `https://salas.tu-dominio.com/health` responde `ok`.

## Conectar la web

En el proyecto de la web (Vercel o donde se construya Next), agrega:

```
NEXT_PUBLIC_ROOMS_URL=wss://salas.tu-dominio.com
```

y vuelve a desplegar: Next mete esa variable en el código al construir, así que cambiarla exige un build
nuevo. Sin la variable, /3d funciona igual que antes, solo que sin otras personas.

Para probar en local: `npm install && npm start` aquí, y `NEXT_PUBLIC_ROOMS_URL=ws://localhost:8080` en
`.env.local` de la web.

## Límites (en index.js)

- 8 personas por sala, 500 conexiones en total, 12 por IP.
- Hasta 20 mensajes por segundo por conexión (la web manda unos 5); con más del doble, se corta.
- Mensajes de 1 KB como máximo; nick, color, estilo y posición se validan en el servidor.
- Un ping cada 30 s cierra las conexiones muertas.

## Pruebas

`npm test`: dos personas se ven, una sala llena abre otra, otro dominio no entra y la limpieza de datos.
