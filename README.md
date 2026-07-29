# SURCOGS MVP — Marketplace P2P de vinilos techno

Registro gratis, publicación de discos con precio propio, catálogo público y pago online con Mercado Pago. La comisión (0% los primeros 30 días del vendedor, después 15%) se descuenta automáticamente del pago: el vendedor nunca pone plata de su bolsillo. Conectar Mercado Pago es requisito para publicar: el registro es libre, pero antes de subir el primer disco la plataforma pide vincular la cuenta de MP (una vez, un minuto). Así toda venta se cierra online, con protección de MP y comisión automática.

## Estructura

```
public/                  → sitio (catálogo, disco, publicar, cuenta)
netlify/functions/       → pagos: OAuth de MP, checkout con split, webhook
supabase-schema.sql      → base de datos (ejecutar en Supabase)
netlify.toml             → configuración de deploy
```

## Puesta en marcha (45 min aprox.)

### 1. Supabase (base de datos + usuarios + fotos) — gratis

1. Crear cuenta en https://supabase.com → New project (región South America).
2. En **SQL Editor**, pegar todo `supabase-schema.sql` y ejecutar (Run).
3. En **Authentication → Providers → Email**: desactivar "Confirm email" si querés registro instantáneo (recomendado para el lanzamiento).
4. En **Settings → API**, copiar:
   - `Project URL`
   - `anon public key`
   - `service_role key` (¡secreta, nunca va en el frontend!)
5. Pegar URL y anon key en `public/js/config.js`.

### 2. Mercado Pago (pagos con split) 

1. Entrar a https://www.mercadopago.com.ar/developers → Crear aplicación.
   - Tipo: **Pagos online → CheckoutPro**, y activar el modo **Marketplace**.
2. En la configuración de la app, agregar como Redirect URL:
   `https://TU-SITIO.netlify.app/.netlify/functions/mp-oauth-callback`
3. Copiar `Client ID` y `Client Secret` (los de producción cuando salgas en vivo; los de prueba para testear).

### 3. Netlify (hosting + funciones) — gratis

1. Subir esta carpeta a un repo de GitHub y en https://app.netlify.com → Add new site → Import from Git. (Detecta `netlify.toml` solo.)
2. En **Site settings → Environment variables**, cargar:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key de Supabase |
| `MP_CLIENT_ID` | Client ID de la app de MP |
| `MP_CLIENT_SECRET` | Client Secret de la app de MP |
| `SITE_URL` | `https://TU-SITIO.netlify.app` (sin barra final) |

3. Deploy. Listo.

### 4. Prueba de punta a punta

1. Crear una cuenta y completar perfil.
2. Ir a "Vender": la plataforma pide conectar Mercado Pago (usar cuenta de prueba de MP para testear) y después habilita el formulario para publicar el disco con foto y precio.
3. En ventana de incógnito, abrir el disco y comprarlo con otra cuenta de prueba.
4. Verificar: pago aprobado → disco pasa a "vendido" → la venta aparece en el panel del vendedor con la comisión calculada.

## Cómo funciona la comisión

- `create-preference.mjs` calcula la comisión al momento de la compra: si el vendedor se registró hace menos de 30 días → `marketplace_fee = 0`; si no → 15% del precio, redondeado.
- El pago va a la cuenta de Mercado Pago **del vendedor**; MP transfiere la comisión a la cuenta de SURCOGS automáticamente (split). No hay que facturar ni perseguir a nadie.
- El webhook confirma el pago consultando a MP (no confía solo en la notificación) y marca el disco como vendido.

## Preguntas y comentarios

Cada disco tiene su sección de preguntas y respuestas (estilo Mercado Libre). Cualquier usuario registrado puede preguntar; el vendedor responde en el mismo hilo (aparece con etiqueta "Vendedor"). Un trigger en la base de datos enmascara automáticamente emails, teléfonos, links y usuarios de redes antes de guardar cada comentario — se aplica en el servidor, no se puede esquivar desde el navegador. Así la negociación queda dentro de SURCOGS y nadie puentea la comisión.

## Seguridad

- Los tokens de MP de los vendedores viven en la tabla `mp_tokens`, sin políticas RLS → invisibles desde el navegador; solo las funciones del servidor los leen.
- Las órdenes solo se crean/actualizan desde el servidor.
- El OAuth usa un `state` aleatorio guardado en DB (anti-CSRF).

## Pendientes conocidos (post-lanzamiento)

- Renovación de tokens de MP (duran ~6 meses; hay `refresh_token` guardado para implementarlo).
- Notificación por email al vendedor cuando le compran (hoy lo ve en su panel; el comprador además puede escribirle por WhatsApp).
- Reputación de vendedores y resolución de disputas.
- Mediar el envío (hoy la entrega se coordina entre las partes).
