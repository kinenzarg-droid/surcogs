-- SURCOGS MVP — esquema de Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → pegar todo → Run

-- ============ PERFILES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  name text not null,
  whatsapp text,          -- ej: 5491123456789
  zona text,              -- barrio / localidad
  mp_connected boolean not null default false
);

alter table public.profiles enable row level security;

create policy "perfiles visibles para todos" on public.profiles
  for select using (true);
create policy "cada uno crea su perfil" on public.profiles
  for insert with check (auth.uid() = id);
create policy "cada uno edita su perfil" on public.profiles
  for update using (auth.uid() = id);

-- ============ DISCOS ============
create table public.records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  artist text not null,
  title text not null,
  label text,
  year int,
  format text not null default '12"',
  price int not null check (price > 0),        -- en pesos argentinos
  condition_media text not null,               -- Goldmine: M, NM, VG+, VG, G+, G
  condition_sleeve text not null,
  zona text,
  audio_url text,                              -- link YouTube de referencia
  photos text[] not null default '{}',         -- URLs de Supabase Storage
  status text not null default 'disponible'
    check (status in ('disponible','reservado','vendido')),
  description text
);

alter table public.records enable row level security;

create policy "discos visibles para todos" on public.records
  for select using (true);
create policy "vendedor publica sus discos" on public.records
  for insert with check (auth.uid() = seller_id);
create policy "vendedor edita sus discos" on public.records
  for update using (auth.uid() = seller_id);
create policy "vendedor borra sus discos" on public.records
  for delete using (auth.uid() = seller_id);

-- ============ ÓRDENES ============
-- Se crean/actualizan solo desde las funciones del servidor (service role).
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  record_id uuid not null references public.records(id),
  seller_id uuid not null references public.profiles(id),
  buyer_email text,
  amount int not null,
  fee int not null,                            -- comisión SURCOGS en pesos
  status text not null default 'pendiente'
    check (status in ('pendiente','pagada','cancelada')),
  mp_payment_id text
);

alter table public.orders enable row level security;

create policy "vendedor ve sus ventas" on public.orders
  for select using (auth.uid() = seller_id);
-- Sin policies de insert/update: solo el service role escribe acá.

-- ============ TOKENS DE MERCADO PAGO ============
-- Nunca accesible desde el cliente. Solo service role.
create table public.mp_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  mp_user_id text,
  updated_at timestamptz not null default now()
);
alter table public.mp_tokens enable row level security;
-- Sin policies: invisible para clientes.

-- Estados temporales del OAuth de MP (anti-CSRF)
create table public.mp_oauth_states (
  state text primary key,
  user_id uuid not null,
  next text,                -- a dónde volver después de conectar
  created_at timestamptz not null default now()
);
alter table public.mp_oauth_states enable row level security;
-- Sin policies: solo service role.

-- ============ COMENTARIOS (preguntas y respuestas) ============
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  record_id uuid not null references public.records(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500)
);

alter table public.comments enable row level security;

create policy "comentarios visibles para todos" on public.comments
  for select using (true);
create policy "usuarios logueados comentan" on public.comments
  for insert with check (auth.uid() = user_id);
create policy "cada uno borra sus comentarios" on public.comments
  for delete using (auth.uid() = user_id);

-- Filtro anti datos personales (como Mercado Libre):
-- enmascara emails, teléfonos y links ANTES de guardar. Se aplica en la DB,
-- así no se puede esquivar desde el navegador.
create or replace function public.strip_datos_personales()
returns trigger language plpgsql as $$
begin
  -- emails
  new.body := regexp_replace(new.body,
    '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}', '■■■', 'g');
  -- links (http, www, wa.me, t.me)
  new.body := regexp_replace(new.body,
    '(https?://\S+|www\.\S+|wa\.me/\S+|t\.me/\S+)', '■■■', 'gi');
  -- teléfonos: 8 o más dígitos seguidos (admite espacios, guiones y puntos en el medio)
  new.body := regexp_replace(new.body,
    '\+?\d([\s\-\.\(\)]?\d){7,}', '■■■', 'g');
  -- redes: @usuario precedido de instagram/ig/telegram
  new.body := regexp_replace(new.body,
    '(instagram|insta|ig|telegram)\s*:?\s*@?\S+', '■■■', 'gi');
  return new;
end $$;

create trigger comments_strip_pii
  before insert on public.comments
  for each row execute function public.strip_datos_personales();

-- ============ STORAGE ============
-- Bucket público para fotos de discos
insert into storage.buckets (id, name, public) values ('records', 'records', true);

create policy "fotos visibles para todos" on storage.objects
  for select using (bucket_id = 'records');
create policy "usuarios logueados suben fotos" on storage.objects
  for insert with check (bucket_id = 'records' and auth.role() = 'authenticated');
create policy "cada uno borra sus fotos" on storage.objects
  for delete using (bucket_id = 'records' and auth.uid() = owner);
