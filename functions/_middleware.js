// La vista previa al compartir un link, para TODAS las páginas.
//
// Antes solo la portada y las fichas de disco traían sus etiquetas og:. El
// resto no tenía ninguna, así que WhatsApp agarraba lo único que encontraba
// —el iconito de 192 píxeles— y lo estiraba: se veía cuadrado y pixelado.
//
// Esto corre después de cada página: si ya trae su propia og:image la deja
// como está, y si no, le arma una con el título y la descripción que esa
// página ya tiene, más la imagen de 1200x630 de la marca.
const SITIO = "https://surcogs.com.ar";
const IMAGEN = SITIO + "/compartir.png";

export async function onRequest({ request, next }) {
  const res = await next();

  const tipo = res.headers.get("content-type") || "";
  if (!tipo.includes("text/html")) return res;
  if (res.status !== 200) return res;

  let html;
  try { html = await res.text(); } catch (_) { return res; }

  // La que ya trae su vista previa armada no se toca: las fichas de disco
  // muestran la tapa, que es mucho mejor que el logo.
  if (html.includes('property="og:image"') || !html.includes("</head>")) {
    return new Response(html, res);
  }

  const entre = (re) => { const m = html.match(re); return m ? m[1].trim() : ""; };
  const titulo = entre(/<title>([\s\S]*?)<\/title>/i)
    || "SURCOGS · Vinilos de techno y electrónica en Argentina";
  const desc = entre(/<meta\s+name="description"\s+content="([^"]*)"/i)
    || "Comprá y vendé vinilos de música electrónica entre coleccionistas, en Argentina. "
     + "Escuchá cada disco entero antes de comprarlo. Sin comisiones.";

  const url = new URL(request.url);
  const limpia = SITIO + url.pathname;

  const etiquetas =
    '<meta property="og:type" content="website">' +
    '<meta property="og:site_name" content="SURCOGS">' +
    '<meta property="og:locale" content="es_AR">' +
    `<meta property="og:url" content="${esc(limpia)}">` +
    `<meta property="og:title" content="${esc(titulo)}">` +
    `<meta property="og:description" content="${esc(desc)}">` +
    `<meta property="og:image" content="${IMAGEN}">` +
    '<meta property="og:image:width" content="1200">' +
    '<meta property="og:image:height" content="630">' +
    '<meta property="og:image:type" content="image/png">' +
    '<meta property="og:image:alt" content="SURCOGS · Vinilos de mano en mano">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    `<meta name="twitter:title" content="${esc(titulo)}">` +
    `<meta name="twitter:description" content="${esc(desc)}">` +
    `<meta name="twitter:image" content="${IMAGEN}">`;

  return new Response(html.replace("</head>", etiquetas + "</head>"), res);
}

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
