// Todo lo que sabe armar la ficha de un disco para los buscadores.
//
// Vive aparte porque lo usan tres rutas: la direccion nueva con nombre, y las
// dos viejas que redirigen. Si estuviera copiado en cada una, el dia que
// cambie el precio o una etiqueta habria que acordarse de tocar las tres.
// Los archivos que empiezan con guion bajo no son rutas: son para compartir.

export const RECARGO = 1.15;   // lo mismo que cobra el sitio al comprador

export const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

export const plata = (n) => "$" + Math.round(n).toLocaleString("es-AR");

export const CAMPOS =
  "id,id_corto,artist,title,label,year,format,condition_media,price,status,photos,genre";

// La parte legible de la direccion. No se guarda en ningun lado: se arma cada
// vez. Lo que identifica al disco son los 8 caracteres del final.
export function parteLegible(d) {
  const crudo = [d.artist, d.title].filter(Boolean).join(" ");
  const limpio = crudo
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // saca los acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "");
  return limpio || "disco";
}

export function urlDeFicha(origen, d) {
  return `${origen}/disco/${parteLegible(d)}-${d.id_corto}`;
}

export async function buscarPorIdCorto(env, idCorto) {
  return pedir(env, `id_corto=eq.${encodeURIComponent(idCorto)}`);
}

export async function buscarPorId(env, id) {
  return pedir(env, `id=eq.${encodeURIComponent(id)}`);
}

async function pedir(env, filtro) {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/records?${filtro}&select=${CAMPOS}&limit=1`,
    { headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      } }
  );
  if (!r.ok) return null;
  const filas = await r.json();
  return Array.isArray(filas) && filas.length ? filas[0] : null;
}

export function armarEtiquetas(d, url) {
  const titulo = [d.artist, d.title].filter(Boolean).join(" \u2013 ") || "Disco";
  const precio = d.price ? plata(d.price * RECARGO) : "";
  const ficha = [
    d.genre,
    [d.label, d.year].filter(Boolean).join(" \u00b7 "),
    d.format,
    d.condition_media ? "Estado " + d.condition_media : "",
  ].filter(Boolean).join(" \u00b7 ");

  const estado = d.status === "vendido" ? "Vendido"
    : d.status === "reservado" ? "Reservado"
    : precio ? precio + " \u00b7 10% OFF con transferencia" : "";

  const texto = [ficha, estado].filter(Boolean).join("\n");
  const tapa = Array.isArray(d.photos) && d.photos.length ? d.photos[0] : "";

  const m = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="SURCOGS">`,
    `<meta property="og:locale" content="es_AR">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:title" content="${esc(titulo)}">`,
    `<meta property="og:description" content="${esc(texto)}">`,
    `<meta name="description" content="${esc(titulo + " \u2014 " + texto.replace(/\n/g, " \u00b7 "))}">`,
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
// precio y la disponibilidad en el resultado, y los asistentes de inteligencia
// artificial los leen para contestar "donde consigo este disco".
export function datosEstructurados(d, url) {
  const titulo = [d.artist, d.title].filter(Boolean).join(" \u2013 ") || "Disco";
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
      // El precio que realmente paga el comprador, no el neto del vendedor. Si
      // publicaramos el neto, el que llega desde Google veria un numero mas
      // bajo que el del checkout y se sentiria estafado.
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
