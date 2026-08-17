// SURCOGS — módulo compartido
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.SURCOGS_CONFIG;
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const GRADOS = ["M", "NM", "VG+", "VG", "G+", "G"];

// Zonas y localidades para perfiles y discos
export const ZONAS = {
  "CABA": ["Agronomía", "Almagro", "Balvanera", "Barracas", "Belgrano", "Boedo", "Caballito",
    "Chacarita", "Coghlan", "Colegiales", "Constitución", "Flores", "Floresta", "La Boca",
    "La Paternal", "Liniers", "Mataderos", "Monte Castro", "Monserrat", "Nueva Pompeya", "Núñez",
    "Palermo", "Parque Avellaneda", "Parque Chacabuco", "Parque Chas", "Parque Patricios",
    "Puerto Madero", "Recoleta", "Retiro", "Saavedra", "San Cristóbal", "San Nicolás", "San Telmo",
    "Vélez Sársfield", "Versalles", "Villa Crespo", "Villa del Parque", "Villa Devoto",
    "Villa General Mitre", "Villa Lugano", "Villa Luro", "Villa Ortúzar", "Villa Pueyrredón",
    "Villa Real", "Villa Riachuelo", "Villa Santa Rita", "Villa Soldati", "Villa Urquiza"],
  "GBA Norte": ["Vicente López", "Olivos", "Florida", "Munro", "Villa Martelli", "San Isidro",
    "Martínez", "Acassuso", "Beccar", "Boulogne", "Villa Adelina", "San Fernando", "Victoria",
    "Tigre", "Don Torcuato", "Pacheco", "Benavídez", "Nordelta", "Escobar", "Garín", "Maquinista Savio",
    "Pilar", "Del Viso", "San Martín", "Villa Ballester", "San Andrés", "José León Suárez",
    "San Miguel", "Bella Vista", "Muñiz", "José C. Paz", "Malvinas Argentinas", "Los Polvorines",
    "Grand Bourg", "Campana", "Zárate"],
  "GBA Oeste": ["La Matanza", "San Justo", "Ramos Mejía", "Lomas del Mirador", "Villa Luzuriaga",
    "Isidro Casanova", "González Catán", "Laferrere", "Morón", "Castelar", "Haedo", "El Palomar",
    "Hurlingham", "Villa Tesei", "William Morris", "Ituzaingó", "Parque Leloir", "Merlo",
    "San Antonio de Padua", "Libertad", "Moreno", "Paso del Rey", "Francisco Álvarez",
    "Tres de Febrero", "Caseros", "Ciudadela", "Santos Lugares", "Sáenz Peña", "Villa Bosch",
    "General Rodríguez", "Marcos Paz", "Luján", "General Las Heras"],
  "GBA Sur": ["Avellaneda", "Sarandí", "Wilde", "Gerli", "Piñeyro", "Lanús", "Remedios de Escalada",
    "Monte Chingolo", "Valentín Alsina", "Lomas de Zamora", "Banfield", "Temperley", "Turdera",
    "Llavallol", "Quilmes", "Bernal", "Don Bosco", "Ezpeleta", "San Francisco Solano", "Berazategui",
    "Ranelagh", "Hudson", "Florencio Varela", "Almirante Brown", "Adrogué", "Burzaco", "Glew",
    "Longchamps", "Rafael Calzada", "Claypole", "Esteban Echeverría", "Monte Grande", "Ezeiza",
    "Canning", "San Vicente", "Guernica", "Cañuelas"],
  "La Plata y alrededores": ["La Plata", "City Bell", "Gonnet", "Villa Elisa", "Tolosa", "Ringuelet",
    "Los Hornos", "Berisso", "Ensenada", "Brandsen", "Magdalena"],
  "Interior del país": ["Córdoba", "Rosario", "Santa Fe", "Mendoza", "San Miguel de Tucumán",
    "Mar del Plata", "Bahía Blanca", "Tandil", "Salta", "San Salvador de Jujuy", "Neuquén",
    "Cipolletti", "Bariloche", "Paraná", "Corrientes", "Resistencia", "Posadas", "Formosa",
    "Santiago del Estero", "Catamarca", "La Rioja", "San Juan", "San Luis", "Santa Rosa",
    "Rawson", "Comodoro Rivadavia", "Río Gallegos", "Ushuaia"],
};

// Zona (select) → localidad (input con autocompletado). Si no está en la lista, se puede escribir igual.
export function zonaSelector(selZona, inpLoc, zonaVal = "", locVal = "") {
  selZona.innerHTML = `<option value="">Elegí tu zona…</option>` +
    Object.keys(ZONAS).map(z => `<option ${z === zonaVal ? "selected" : ""}>${z}</option>`).join("");

  // datalist para autocompletar mientras escribe
  const dlId = "dl-" + (inpLoc.id || Math.random().toString(36).slice(2));
  let dl = document.getElementById(dlId);
  if (!dl) { dl = document.createElement("datalist"); dl.id = dlId; inpLoc.after(dl); }
  inpLoc.setAttribute("list", dlId);
  inpLoc.setAttribute("autocomplete", "off");
  inpLoc.placeholder = "Escribí tu localidad o barrio…";

  const llenar = (loc) => {
    const locs = ZONAS[selZona.value] || [];
    dl.innerHTML = locs.map(l => `<option value="${l}">`).join("");
    inpLoc.value = loc || "";
    inpLoc.disabled = !selZona.value;
  };
  selZona.onchange = () => llenar("");
  llenar(locVal);
}
export const ADMIN_ID = window.SURCOGS_CONFIG.ADMIN_ID || null;

export const fmtPrecio = (n) => "$" + Number(n).toLocaleString("es-AR");

// El precio guardado (records.price) es lo que RECIBE el vendedor.
// El comprador ve el precio con comisiones incluidas.
// Debe coincidir con functions/api/create-preference.js
// El vendedor cobra su precio intacto. El comprador paga ese precio + 15%,
// que cubre la comisión de Mercado Pago y el servicio de SURCOGS.
export const RECARGO = 0.15;
export const DTO_TRANSFER = 0.10;    // descuento por pagar con transferencia
export const precioComprador = (neto) =>
  Math.round(Number(neto) * (1 + RECARGO));
export const precioTransferencia = (neto) =>
  Math.round(precioComprador(neto) * (1 - DTO_TRANSFER));

export async function getUser() {
  const { data } = await sb.auth.getUser();
  return data.user || null;
}

export async function getPerfil(userId) {
  const { data } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
}

// Header compartido — estilo SoundCloud
export async function renderHeader(activo) {
  const user = await getUser();
  let avatarInner = "";
  if (user) {
    const perfil = await getPerfil(user.id);
    const iniciales = (perfil?.name || "")
      .trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "YO";
    avatarInner = perfil?.avatar_url
      ? `<img src="${perfil.avatar_url}" alt="Mi foto">`
      : iniciales;
  }
  const el = document.getElementById("header");
  el.innerHTML = `
    <div class="hwh-banner">
      <a href="/"><span class="hwh-word">SURC</span><svg class="vinilo-o" viewBox="0 0 40 40" aria-hidden="true"><g class="vo-gira"><circle cx="20" cy="20" r="18" fill="#000" stroke="#ff5500" stroke-width="4.5"/><circle cx="20" cy="20" r="9.5" fill="#ff5500"/><text class="vo-txt" x="20" y="22.2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="7" font-weight="700" fill="#000">SCS</text><circle cx="20" cy="20" r="1.2" fill="#000"/><path d="M20 2.8 L20 6.5" stroke="#fff" stroke-width="1.5"/></g></svg><span class="hwh-word">GS</span></a>
    </div>
    <header class="hwh-bar">
      <a class="hwh-brand-m" href="/">SURC<svg class="vinilo-o" viewBox="0 0 40 40" aria-hidden="true"><g class="vo-gira"><circle cx="20" cy="20" r="18" fill="#000" stroke="#ff5500" stroke-width="4.5"/><circle cx="20" cy="20" r="9.5" fill="#ff5500"/><text class="vo-txt" x="20" y="22.2" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="7" font-weight="700" fill="#000">SCS</text><circle cx="20" cy="20" r="1.2" fill="#000"/><path d="M20 2.8 L20 6.5" stroke="#fff" stroke-width="1.5"/></g></svg>GS</a>
      <nav class="hwh-tabs">
        <a href="/" class="${activo === "catalogo" ? "on" : ""}">Catálogo</a>
      </nav>
      <div class="search">
        <input id="hdr-q" type="search" placeholder="Buscar artista, disco o sello" autocomplete="off">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
        <div class="search-dd" id="hdr-dd"></div>
      </div>
      <a class="btn-cta" href="/publicar.html">Vender gratis</a>
      <div class="hdr-links">
        ${user ? `
          <div class="avatar-wrap">
            <button class="avatar" id="avatar-btn" title="Menú">${avatarInner}</button>
            <div class="avatar-menu" id="avatar-menu">
              <a href="/cuenta.html">Mi cuenta</a>
              <a href="/cuenta.html#compras">Compras</a>
              <a href="/cuenta.html#ventas">Ventas</a>
              <a href="#" class="salir" id="btn-salir">Salir</a>
            </div>
          </div>` : `
          <a class="btn-ing" href="/cuenta.html">Ingresar</a>
          <a class="btn-reg" href="/cuenta.html?registro=1">Registrarse</a>`}
      </div>
    </header>
    <div class="tira" aria-label="10% de descuento pagando por transferencia">
      <div class="tira-in">
        <span>10% de descuento pagando por transferencia&nbsp;&nbsp;·&nbsp;&nbsp;Tu plata protegida: el vendedor cobra cuando confirmás que recibiste el disco&nbsp;&nbsp;·&nbsp;&nbsp;Publicar es gratis&nbsp;&nbsp;·&nbsp;&nbsp;</span>
        <span>10% de descuento pagando por transferencia&nbsp;&nbsp;·&nbsp;&nbsp;Tu plata protegida: el vendedor cobra cuando confirmás que recibiste el disco&nbsp;&nbsp;·&nbsp;&nbsp;Publicar es gratis&nbsp;&nbsp;·&nbsp;&nbsp;</span>
      </div>
    </div>`;

  // Menú del avatar
  if (user) {
    const menu = document.getElementById("avatar-menu");
    document.getElementById("avatar-btn").onclick = (e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === "block" ? "none" : "block";
    };
    document.addEventListener("click", () => { menu.style.display = "none"; });
    document.getElementById("btn-salir").onclick = async (e) => {
      e.preventDefault();
      await sb.auth.signOut();
      location.href = "/";
    };
  }

  // Búsqueda global: Enter → catálogo con el término
  const q = document.getElementById("hdr-q");
  const dd = document.getElementById("hdr-dd");
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && q.value.trim()) {
      location.href = "/?q=" + encodeURIComponent(q.value.trim());
    }
    if (e.key === "Escape") dd.style.display = "none";
  });

  // Autocompletado con miniaturas mientras tipeás
  let ddTimer;
  q.addEventListener("input", () => {
    clearTimeout(ddTimer);
    const term = q.value.trim().replace(/[,()]/g, " ");
    if (term.length < 2) { dd.style.display = "none"; return; }
    ddTimer = setTimeout(async () => {
      const { data } = await sb.from("records")
        .select("id, artist, title, label, photos, status")
        .or(`artist.ilike.%${term}%,title.ilike.%${term}%,label.ilike.%${term}%`)
        .neq("status", "vendido")
        .limit(6);
      if (!data || !data.length) {
        dd.innerHTML = `<div class="sd-empty">Sin resultados para "${term.replace(/</g, "&lt;")}"</div>`;
        dd.style.display = "block";
        return;
      }
      dd.innerHTML = data.map(r => `
        <a href="/disco.html?id=${r.id}">
          <img src="${fotoPrincipal(r)}" alt="">
          <div>
            <div class="sd-t">${r.title.replace(/</g, "&lt;")}</div>
            <div class="sd-a">${r.artist.replace(/</g, "&lt;")}${r.label ? " · " + r.label.replace(/</g, "&lt;") : ""}</div>
          </div>
        </a>`).join("");
      dd.style.display = "block";
    }, 250);
  });

  // Cerrar el desplegable al hacer clic afuera
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) dd.style.display = "none";
  });
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

// Reputación: promedio de estrellas de un vendedor, estilo "★★★★★ 100.0%, 79 valoraciones"
export async function reputacionHTML(sellerId) {
  const { data } = await sb.from("ratings").select("stars").eq("seller_id", sellerId);
  if (!data || !data.length) return `<span class="hint">Vendedor nuevo, sin valoraciones todavía</span>`;
  const avg = data.reduce((a, r) => a + r.stars, 0) / data.length;
  const full = Math.round(avg);
  return `<span class="stars">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>
    <b>${((avg / 5) * 100).toFixed(1)}%</b>, ${data.length} valoraci${data.length === 1 ? "ón" : "ones"}`;
}

export function toast(msg, err = false) {
  let t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
