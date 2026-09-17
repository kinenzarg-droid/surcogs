// Lo que la portada le cuenta al buscador antes de que corra el JavaScript.
//
// El catalogo lo dibuja el navegador, asi que un buscador que entra y no
// ejecuta JavaScript veia una pagina de 822 caracteres que decia "No hay
// discos que coincidan". Google la indexo asi: como una pagina vacia.
//
// Aca va el parrafo que explica que es SURCOGS y el enlace al indice completo.
// La lista entera vive en /discos: un liston de 229 renglones abajo de la
// portada quedaba feo y le tapaba el catalogo de verdad al que llega.

export async function onRequestGet({ request, env, next }) {
  const respuesta = await next();
  const tipo = respuesta.headers.get("content-type") || "";
  if (!tipo.includes("text/html")) return respuesta;

  // Solo la portada limpia. Con filtros en la direccion la pagina muestra otra
  // cosa y este texto no corresponde.
  const url = new URL(request.url);
  if (url.search) return respuesta;

  // Cuantos hay en venta. Es solo para el texto: si falla, no decimos el numero.
  let cuantos = 0;
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const r = await fetch(
        `${env.SUPABASE_URL}/rest/v1/records?select=id&status=eq.disponible`,
        { headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            Prefer: "count=exact",
            Range: "0-0",
          } }
      );
      const rango = r.headers.get("content-range") || "";
      const n = parseInt(rango.split("/")[1], 10);
      if (Number.isFinite(n)) cuantos = n;
    } catch (e) { cuantos = 0; }
  }

  const texto =
    '<section id="que-es">' +
    "<h2>Vinilos de techno, de mano en mano</h2>" +
    "<p>SURCOGS es un mercado entre coleccionistas para comprar y vender vinilos " +
    "de m\u00fasica electr\u00f3nica en Argentina. Cada disco se puede escuchar " +
    "entero antes de comprarlo. El vendedor cobra el precio que puso y la plata " +
    "queda protegida hasta que el comprador confirma que lo recibi\u00f3.</p>" +
    '<p><a href="/discos">' +
    (cuantos ? `Ver los ${cuantos} vinilos en venta` : "Ver todo el cat\u00e1logo en una sola p\u00e1gina") +
    " \u2192</a></p>" +
    "</section>";

  // Quienes somos, para el buscador y para los asistentes.
  const quienes = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: "SURCOGS",
    url: "https://surcogs.com.ar",
    description: "Mercado entre coleccionistas para comprar y vender vinilos de " +
      "musica electronica en Argentina, con audio de cada tema.",
    areaServed: { "@type": "Country", name: "Argentina" },
    currenciesAccepted: "ARS",
    sameAs: ["https://www.instagram.com/surcogs"],
  };
  const ld = '<script type="application/ld+json">' +
    JSON.stringify(quienes).replace(/</g, "\\u003c") + "\u003c/script>";

  const estilo = "<style>" +
    "#que-es{max-width:1100px;margin:40px auto 0;padding:24px 20px 6px;" +
    "border-top:1px solid var(--line,#e0dbd3)}" +
    "#que-es h2{font-size:16px;margin:0 0 8px}" +
    "#que-es p{color:var(--dim,#6b6560);font-size:14px;line-height:1.65;" +
    "margin:0 0 10px;max-width:68ch}" +
    "#que-es a{color:var(--acc,#ff5500);text-decoration:none;font-weight:600}" +
    "#que-es a:hover{text-decoration:underline}" +
    "</style>";

  return new HTMLRewriter()
    .on("head", { element(el) { el.append(ld + estilo, { html: true }); } })
    // Al final del <main>. El <footer> no sirve de ancla: no esta en el HTML,
    // lo dibuja el JavaScript despues.
    .on("main", { element(el) { el.append(texto, { html: true }); } })
    .transform(respuesta);
}
