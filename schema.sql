-- Same schema the app creates on its own at first use (src/lib/db.ts).
-- Only needed if you'd rather set the database up by hand.
create table if not exists users (
  id serial primary key,
  email text unique not null,
  password_hash text not null,
  is_admin boolean not null default false,
  -- null = unlimited access; a past timestamp = trial/subscription lapsed
  access_until timestamptz,
  created_at timestamptz not null default now()
);
