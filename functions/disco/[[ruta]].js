// La ficha de un disco en su direccion con nombre:
//   /disco/the-vision-spectral-nomad-69cbbc8a
//
// Lo que identifica al disco son los 8 caracteres del final. El resto es para
// que la persona y el buscador entiendan de que se trata antes de entrar. Si
// el vendedor corrige el titulo, la parte legible cambia pero la direccion
// vieja sigue funcionando, y mandamos a la nueva.

import { buscarPorIdCorto, urlDeFicha, armarEtiquetas, datosEstructurados, esc }
  from "../_ficha.js";

const ID_CORTO = /-([0-9a-f]{8})$/i;

function noExiste() {
  return new Response(
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>Ese disco no esta \u00b7 SURCOGS</title>" +
    '<meta name="robots" content="noindex">' +
    '<style>body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;' +
    "background:#f4f2ee;color:#16130f;display:grid;place-items:center;" +
    "min-height:100vh;margin:0;text-align:center;padding:24px}" +
    "a{color:#ff5500}</style></head><body><div>" +
    "<h1>Ese disco ya no est\u00e1</h1>" +
    "<p>Puede que se haya vendido o que el vendedor lo haya sacado.</p>" +
    '<p><a href="/">Ver el cat\u00e1logo</a></p>' +
    "</div></body></html>",
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const ruta = url.pathname.replace(/^\/disco\//, "").replace(/\/+$/, "");
  const m = ruta.match(ID_CORTO);
  if (!m) return noExiste();

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return noExiste();

  let d = null;
  try { d = await buscarPorIdCorto(env, m[1].toLowerCase()); } catch (e) { d = null; }
  if (!d) return noExiste();

  // La direccion buena para este disco, hoy
  const buena = urlDeFicha(url.origin, d);
  if (`${url.origin}${url.pathname}` !== buena) {
    // Llego por una direccion vieja o mal escrita: lo mandamos a la de verdad,
    // y le avisamos al buscador que la mudanza es definitiva.
    return Response.redirect(buena + url.search, 301);
  }

  // El HTML de la ficha, pedido directo a los archivos del sitio. No pasa por
  // las funciones, asi que no se llama a si misma.
  const pagina = await env.ASSETS.fetch(new URL("/disco.html", url.origin));
  if (!pagina.ok) return noExiste();

  const { html, titulo } = armarEtiquetas(d, buena);
  const ld = datosEstructurados(d, buena);
  // La pagina lee el id de aca, porque en esta direccion no viene un ?id=
  const puente = '<script>window.__disco={id:"' + esc(d.id) + '"}\u003c/script>';

  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(titulo + " \u00b7 SURCOGS"); } })
    .on("head", { element(el) { el.append("\n" + html + "\n" + ld + puente + "\n", { html: true }); } })
    .transform(new Response(pagina.body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    }));
}
