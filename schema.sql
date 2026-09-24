-- Pulsar95 Database Schema
create extension if not exists "uuid-ossp";

create table profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  avatar_color text default '#000080',
  created_at timestamp default now()
);

create table rooms (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  owner_id uuid references profiles(id) on delete cascade,
  created_at timestamp default now()
);

create table channels (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid references rooms(id) on delete cascade,
  name text not null,
  created_at timestamp default now()
);

create table messages (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid references channels(id) on delete cascade,
  author_id uuid references profiles(id) on delete cascade,
  content text not null,
  created_at timestamp default now()
);

create table room_members (
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (room_id, user_id)
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, avatar_color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_color', '#000080')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table profiles      enable row level security;
alter table rooms         enable row level security;
alter table channels      enable row level security;
alter table messages      enable row level security;
alter table room_members  enable row level security;

create policy "Profiles are viewable by all"
  on profiles for select using (true);

create policy "Users update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Rooms viewable by all"
  on rooms for select using (true);

create policy "Authenticated users create rooms"
  on rooms for insert with check (auth.uid() = owner_id);

create policy "Owners delete their rooms"
  on rooms for delete using (auth.uid() = owner_id);

create policy "Channels viewable by all"
  on channels for select using (true);

create policy "Authenticated users create channels"
  on channels for insert with check (auth.role() = 'authenticated');

create policy "Messages viewable by all"
  on messages for select using (true);

create policy "Users insert own messages"
  on messages for insert with check (auth.uid() = author_id);

create policy "Users delete own messages"
  on messages for delete using (auth.uid() = author_id);

create policy "Users edit own messages"
  on messages for update using (auth.uid() = author_id);

create policy "Members viewable by all"
  on room_members for select using (true);

create policy "Users join rooms"
  on room_members for insert with check (auth.uid() = user_id);

alter publication supabase_realtime add table messages;