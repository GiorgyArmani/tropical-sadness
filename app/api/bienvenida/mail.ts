// El correo de bienvenida: una ventana de tropi.OS con el logo, el avatar de quien llega y el botón para
// entrar a la web. Es HTML de correo: tablas y estilos en cada etiqueta, lo único que respetan todos los
// programas de correo. Los colores y el bisel son los de la interfaz (--os-* en app/globals.css); la letra de
// mapa de bits la cargan solo algunos (Apple Mail), el resto cae en una monoespaciada.
// Las imágenes van adjuntas al correo (cid:), así se ven sin que el programa tenga que bajar nada.

export const CID = { logo: "logo@tropi", icon: "icono@tropi", avatar: "avatar@tropi" }

const FONT = "font-family:'DotGothic16','MS Gothic','Courier New',monospace;font-size:16px;line-height:1.35"
const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"'
// El bisel de Windows 95 hecho con bordes: salido (luz arriba y a la izquierda) y hundido (al revés)
const RAISED = "border:2px solid;border-color:#ffffff #17122b #17122b #ffffff"
const SUNKEN = "border:2px solid;border-color:#827d99 #ffffff #ffffff #827d99"

// nick llega ya limpio (solo letras, números y _ . -); site es la dirección de la web, sin barra final
export const welcomeMail = (nick: string, site: string) => ({
  subject: "bienvenida a Tropical Sadness 革命",
  text:
    `hola, ${nick}.\n\n` +
    "tu avatar ya quedó guardado en tu cuenta de Tropical Sadness: así te ven los demás en las salas.\n" +
    "entra con tu email y tu contraseña en cualquier dispositivo y lo tendrás contigo.\n\n" +
    `${site}/\n`,
  html: `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap" rel="stylesheet">
<title>bienvenida a Tropical Sadness</title>
</head>
<body style="margin:0;padding:0;background:#07060f">
<table ${TABLE} width="100%" bgcolor="#07060f" style="background:#07060f">
<tr><td align="center" style="padding:24px 10px">

<table ${TABLE} width="420" bgcolor="#c9c5d6" style="width:100%;max-width:420px;background:#c9c5d6;${RAISED}">
<tr><td style="padding:3px">
<table ${TABLE} width="100%">

<tr><td bgcolor="#8a2bb0" style="background:#8a2bb0;background-image:linear-gradient(90deg,#2a1670,#8a2bb0 55%,#e8479f)">
<table ${TABLE} width="100%"><tr>
<td width="24" style="padding:4px 0 4px 6px"><img src="cid:${CID.icon}" width="16" height="16" alt="" style="display:block;border:0"></td>
<td style="padding:3px 6px;${FONT};color:#ffffff;font-weight:bold">bienvenida</td>
<td width="24" align="right" style="padding:4px 5px 4px 0">
<table ${TABLE} bgcolor="#c9c5d6" style="background:#c9c5d6;border:1px solid;border-color:#ffffff #17122b #17122b #ffffff"><tr>
<td width="14" height="12" align="center" style="font-family:'Courier New',monospace;font-size:11px;line-height:12px;font-weight:bold;color:#14101f">x</td>
</tr></table>
</td>
</tr></table>
</td></tr>

<tr><td height="3" style="height:3px;font-size:0;line-height:0">&nbsp;</td></tr>

<tr><td align="center" bgcolor="#0b0717" style="background:#0b0717;padding:26px 12px;${SUNKEN}">
<img src="cid:${CID.logo}" width="170" alt="Tropical Sadness 革命" style="display:block;border:0;width:170px;height:auto">
</td></tr>

<tr><td style="padding:16px 12px 12px;${FONT};color:#14101f">
<p style="margin:0 0 10px">hola, <b>${nick}</b>.</p>
<p style="margin:0">tu avatar ya quedó guardado en tu cuenta. así te ven los demás en las salas:</p>
</td></tr>

<tr><td align="center" style="padding:0 12px">
<table ${TABLE} bgcolor="#000000" style="width:100%;max-width:304px;background:#000000;${SUNKEN}"><tr>
<td><img src="cid:${CID.avatar}" width="300" alt="tu avatar, dibujado en letras" style="display:block;border:0;width:100%;max-width:300px;height:auto"></td>
</tr></table>
</td></tr>

<tr><td align="center" style="padding:14px 12px 20px;${FONT};color:#14101f">
<p style="margin:0 0 16px;text-align:left">entra con tu email y tu contraseña en cualquier dispositivo y lo tendrás contigo.</p>
<a href="${site}/" style="display:inline-block;padding:7px 22px;background:#ffd600;color:#000000;text-decoration:none;${FONT};border:2px solid;border-color:#fffbe0 #000000 #000000 #fffbe0">entrar a tropi.OS</a>
</td></tr>

</table>
</td></tr>
</table>

<p style="margin:16px 0 0;${FONT};font-size:12px;color:#827d99">recibes este correo porque confirmaste tu email en Tropical Sadness.</p>

</td></tr>
</table>
</body>
</html>
`,
})
