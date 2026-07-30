// SURCOGS — módulo compartido
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.SURCOGS_CONFIG;
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const GRADOS = ["M", "NM", "VG+", "VG", "G+", "G"];

export const fmtPrecio = (n) => "$" + Number(n).toLocaleString("es-AR");

// El precio guardado (records.price) es lo que RECIBE el vendedor.
// El comprador ve el precio con comisiones incluidas.
export const TASA_MP = 0.0761;       // estimado Checkout Pro liberación inmediata (6,29% + IVA)
export const TASA_SURCOGS = 0.15;
export const precioComprador = (neto) =>
  Math.round(Number(neto) / (1 - TASA_MP - TASA_SURCOGS));

export async function getUser() {
  const { data } = await sb.auth.getUser();
  return data.user || null;
}

export async function getPerfil(userId) {
  const { data } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
}

// Header compartido
export async function renderHeader(activo) {
  const user = await getUser();
  const el = document.getElementById("header");
  el.innerHTML = `
    <header class="site-header">
      <a class="logo" href="/">SUR<span>COGS</span></a>
      <nav>
        <a href="/" class="${activo === "catalogo" ? "on" : ""}">Catálogo</a>
        <a href="/publicar.html" class="${activo === "publicar" ? "on" : ""}">Vender</a>
        <a href="/cuenta.html" class="${activo === "cuenta" ? "on" : ""}">${user ? "Mi cuenta" : "Ingresar"}</a>
      </nav>
    </header>`;
}

export function youtubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function fotoPrincipal(rec) {
  return rec.photos && rec.photos.length
    ? rec.photos[0]
    : "data:image/svg+xml," + encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect width='400' height='400' fill='#1a1a1a'/><circle cx='200' cy='200' r='140' fill='#111' stroke='#333' stroke-width='2'/><circle cx='200' cy='200' r='45' fill='#222'/><circle cx='200' cy='200' r='6' fill='#0a0a0a'/></svg>`);
}

export function toast(msg, err = false) {
  let t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
