// Discogs no manda cabeceras CORS. Sin eso el navegador marca el canvas como
// "contaminado" y no deja exportarlo, asi que la placa no se podria descargar.
// Este proxy vuelve a servir la tapa desde nuestro dominio y el problema se va.

// Sin esta lista cualquiera podria usar surcogs.com.ar para servir la imagen
// que se le antoje, y el reclamo llegaria a nuestro dominio.
const PERMITIDOS = [/^i\.discogs\.com$/, /^img\.discogs\.com$/, /\.supabase\.co$/];

export async function onRequestGet({ request }) {
  const u = new URL(request.url).searchParams.get("u");
  if (!u) return new Response("Falta la dirección de la imagen", { status: 400 });

  let destino;
  try {
    destino = new URL(u);
  } catch {
    return new Response("Esa dirección no es válida", { status: 400 });
  }

  if (destino.protocol !== "https:" || !PERMITIDOS.some((re) => re.test(destino.hostname))) {
    return new Response("Ese origen no está permitido", { status: 403 });
  }

  const cache = caches.default;
  const clave = new Request(destino.toString(), { method: "GET" });
  const guardada = await cache.match(clave);
  if (guardada) return guardada;

  const r = await fetch(destino.toString(), {
    headers: { "User-Agent": "SURCOGS/1.0 (+https://surcogs.com.ar)" },
  });
  if (!r.ok) return new Response("No se pudo traer la tapa", { status: 502 });

  const tipo = r.headers.get("content-type") || "";
  if (!tipo.startsWith("image/")) return new Response("Eso no es una imagen", { status: 415 });

  const salida = new Response(r.body, {
    status: 200,
    headers: {
      "Content-Type": tipo,
      // Un mes: las tapas no cambian nunca y asi no le pegamos a Discogs de gusto.
      "Cache-Control": "public, max-age=2592000",
      "Access-Control-Allow-Origin": "*",
    },
  });

  await cache.put(clave, salida.clone());
  return salida;
}
