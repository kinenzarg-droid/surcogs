// Vista previa al compartir un disco.
//
// Cuando alguien manda un link por WhatsApp o lo pega en Instagram, del
// otro lado se veia un link pelado que decia "SURCOGS — Disco". Los robots
// que arman esas vistas previas no ejecutan JavaScript, asi que no les
// sirve que la pagina se complete sola en el navegador: hay que darles el
// HTML ya hecho.
//
// Esta funcion se mete en el medio de /disco?id=..., busca el disco y le
// pega las etiquetas al <head> antes de mandarlo. Para el que navega no
// cambia nada: la pagina sigue armandose igual.

const RECARGO = 1.15;   // lo mismo que cobra el sitio al comprador

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const plata = (n) => "$" + Math.round(n).toLocaleString("es-AR");

async function traerDisco(env, id) {
  const campos = "artist,title,label,year,format,condition_media,price,status,photos,genre";
  // Clave de servicio porque estamos en el servidor. Pedimos solo columnas
  // que ya son publicas: las mismas que muestra el catalogo.
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/records?id=eq.${encodeURIComponent(id)}&select=${campos}`,
    { headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      } }
  );
  if (!r.ok) return null;
  const filas = await r.json();
  return Array.isArray(filas) && filas.length ? filas[0] : null;
}

function armarEtiquetas(d, url) {
  const titulo = [d.artist, d.title].filter(Boolean).join(" – ") || "Disco";
  const precio = d.price ? plata(d.price * RECARGO) : "";
  const ficha = [
    d.genre,
    [d.label, d.year].filter(Boolean).join(" · "),
    d.format,
    d.condition_media ? "Estado " + d.condition_media : "",
  ].filter(Boolean).join(" · ");

  const estado = d.status === "vendido" ? "Vendido"
    : d.status === "reservado" ? "Reservado"
    : precio ? precio + " · 10% OFF con transferencia" : "";

  const texto = [ficha, estado].filter(Boolean).join("\n");
  const tapa = Array.isArray(d.photos) && d.photos.length ? d.photos[0] : "";

  const m = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="SURCOGS">`,
    `<meta property="og:locale" content="es_AR">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:title" content="${esc(titulo)}">`,
    `<meta property="og:description" content="${esc(texto)}">`,
    `<meta name="description" content="${esc(titulo + " — " + texto.replace(/\n/g, " · "))}">`,
    `<meta name="twitter:card" content="${tapa ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${esc(titulo)}">`,
    `<meta name="twitter:description" content="${esc(texto)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
  ];
  if (tapa) {
    m.push(`<meta property="og:image" content="${esc(tapa)}">`);
    m.push(`<meta property="og:image:alt" content="${esc("Tapa de " + titulo)}">`);
    m.push(`<meta name="twitter:image" content="${esc(tapa)}">`);
  }
  return { html: m.join("\n"), titulo };
}

// Los datos del disco escritos para maquinas. Google los usa para mostrar el
// precio y la disponibilidad en el resultado de busqueda, y los asistentes de
// inteligencia artificial los leen para contestar "donde consigo este disco".
// Sin esto, del otro lado solo hay un parrafo de texto que hay que adivinar.
function datosEstructurados(d, url) {
  const titulo = [d.artist, d.title].filter(Boolean).join(" \u2013 ") || "Disco";
  // El sello viene junto con el numero de catalogo, separados por un punto medio
  const partes = String(d.label || "").split(" \u00b7 ");
  const sello = partes[0] || "";
  const catalogo = partes[1] || "";
  const tapa = Array.isArray(d.photos) && d.photos.length ? d.photos[0] : null;

  const extras = [];
  if (d.format) extras.push({ "@type": "PropertyValue", name: "Formato", value: d.format });
  if (d.condition_media) extras.push({ "@type": "PropertyValue", name: "Estado", value: d.condition_media });
  if (catalogo) extras.push({ "@type": "PropertyValue", name: "Catalogo", value: catalogo });

  const ficha = {
    "@context": "https://schema.org",
    "@type": ["Product", "MusicAlbum"],
    name: titulo,
    url: url,
    material: "Vinyl",
  };
  if (tapa) ficha.image = tapa;
  if (d.artist) ficha.byArtist = { "@type": "MusicGroup", name: d.artist };
  if (sello) ficha.recordLabel = { "@type": "Organization", name: sello };
  if (d.genre) ficha.genre = d.genre;
  if (d.year) ficha.datePublished = String(d.year);
  if (extras.length) ficha.additionalProperty = extras;

  if (d.price) {
    ficha.offers = {
      "@type": "Offer",
      url: url,
      priceCurrency: "ARS",
      // El precio que realmente paga el comprador, no el neto del vendedor.
      // Si publicaramos el neto, el que llega desde Google veria un numero
      // mas bajo que el del checkout y se sentiria estafado.
      price: String(Math.round(d.price * RECARGO)),
      availability: d.status === "disponible"
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      // Goldmine: M es sellado o nunca reproducido; el resto es usado.
      itemCondition: d.condition_media === "M"
        ? "https://schema.org/NewCondition"
        : "https://schema.org/UsedCondition",
      seller: { "@type": "Organization", name: "SURCOGS", url: "https://surcogs.com.ar" },
    };
  }

  // Los "<" se escapan para que un titulo raro no pueda cerrar la etiqueta
  // <script> y meter cualquier cosa en la pagina.
  const json = JSON.stringify(ficha).replace(/</g, "\\u003c");
  return '<script type="application/ld+json">' + json + "\u003c/script>";
}

export async function onRequestGet(context) {
  const { request, env, next } = context;
  const respuesta = await next();   // el disco.html de siempre

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const tipo = respuesta.headers.get("content-type") || "";
  if (!id || !tipo.includes("text/html")) return respuesta;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return respuesta;

  let d = null;
  try { d = await traerDisco(env, id); } catch (e) { d = null; }
  // Si Supabase no contesta, mandamos la pagina tal cual. Una vista previa
  // pobre es mucho mejor que un error.
  if (!d) return respuesta;

  // La direccion limpia, sin lo que se cuelga de los links compartidos. Si
  // no, el mismo disco con un ?t= o un ?utm= pegado atras parece una pagina
  // distinta para los buscadores.
  const limpia = `${url.origin}${url.pathname}?id=${encodeURIComponent(id)}`;
  const { html, titulo } = armarEtiquetas(d, limpia);
  const ficha = datosEstructurados(d, limpia);

  return new HTMLRewriter()
    .on("title", {
      element(el) { el.setInnerContent(titulo + " · SURCOGS"); },
    })
    .on("head", {
      element(el) { el.append("\n" + html + "\n" + ficha + "\n", { html: true }); },
    })
    .transform(respuesta);
}
