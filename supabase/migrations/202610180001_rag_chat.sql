create extension if not exists vector with schema extensions;

create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_rooms_owner_updated on public.chat_rooms(user_id, updated_at desc);

create table public.chat_turns (
  id uuid primary key,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 4000),
  answer text,
  sources jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index chat_turns_room_created on public.chat_turns(room_id, created_at);

alter table public.chat_rooms enable row level security;
alter table public.chat_turns enable row level security;
create policy "Own rooms" on public.chat_rooms for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own turns" on public.chat_turns for all to authenticated
  using (exists (select 1 from public.chat_rooms r where r.id = room_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from public.chat_rooms r where r.id = room_id and r.user_id = (select auth.uid())));
revoke all on public.chat_rooms, public.chat_turns from anon;
grant select, insert, update, delete on public.chat_rooms, public.chat_turns to authenticated;

-- A room lock prevents concurrent answers from mixing conversation context.
-- Retrying the same request id does not duplicate a saved question.
create function public.begin_chat_turn(p_room_id uuid, p_turn_id uuid, p_question text)
returns public.chat_turns language plpgsql security invoker set search_path = '' as $$
declare result public.chat_turns;
begin
  if auth.uid() is null then raise exception 'Login required' using errcode = '42501'; end if;
  insert into public.chat_rooms(id, title) values (p_room_id, left(p_question, 60)) on conflict (id) do nothing;
  perform 1 from public.chat_rooms where id = p_room_id and user_id = auth.uid() for update;
  if not found then raise exception 'Room not found' using errcode = '42501'; end if;
  select * into result from public.chat_turns where id = p_turn_id;
  if found then
    if result.room_id <> p_room_id or result.question <> p_question then
      raise exception 'Request id conflict' using errcode = '22023';
    end if;
    if result.status = 'completed' then return result; end if;
  end if;
  if exists (select 1 from public.chat_turns where room_id = p_room_id and status = 'pending'
    and started_at > now() - interval '2 minutes') then
    raise exception 'An answer is already being generated' using errcode = '55P03';
  end if;
  update public.chat_turns set status = 'failed', error_message = '답변 시간이 초과되었습니다. 다시 시도해 주세요.'
    where room_id = p_room_id and status = 'pending';
  insert into public.chat_turns(id, room_id, question) values (p_turn_id, p_room_id, p_question)
    on conflict (id) do update set status = 'pending', error_message = null, started_at = now()
    returning * into result;
  update public.chat_rooms set updated_at = now() where id = p_room_id;
  return result;
end;
$$;
revoke all on function public.begin_chat_turn(uuid, uuid, text) from public, anon;
grant execute on function public.begin_chat_turn(uuid, uuid, text) to authenticated;

create table public.documents (
  id uuid primary key,
  name text not null,
  source_path text not null,
  content_hash text not null,
  embedding_model text not null default 'solar-embedding-2-passage',
  page_count integer not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique(source_path, content_hash)
);
create unique index documents_one_active_version on public.documents(source_path) where active;
create table public.document_pages (
  document_id uuid not null references public.documents(id) on delete cascade,
  page integer not null,
  content text not null,
  primary key(document_id, page)
);
create table public.document_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null,
  page integer not null,
  content text not null,
  embedding extensions.vector(1024) not null,
  unique(document_id, chunk_index)
);
create index document_chunks_embedding on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);
alter table public.documents enable row level security;
alter table public.document_pages enable row level security;
alter table public.document_chunks enable row level security;
create policy "Read published documents" on public.documents for select to authenticated using (active);
create policy "Read published pages" on public.document_pages for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and d.active));
create policy "Read published chunks" on public.document_chunks for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and d.active));
revoke all on public.documents, public.document_pages, public.document_chunks from anon, authenticated;
grant select on public.documents, public.document_pages, public.document_chunks to authenticated;
grant all on public.documents, public.document_pages, public.document_chunks to service_role;
grant usage, select on sequence public.document_chunks_id_seq to service_role;

create function public.match_documents(query_embedding extensions.vector(1024), match_count integer default 6, match_threshold float default 0.3)
returns table (id bigint, document_name text, page integer, content text, similarity float)
language sql stable security invoker set search_path = '' as $$
  select c.id, d.name, c.page, c.content, 1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.document_chunks c join public.documents d on d.id = c.document_id
  where d.active and 1 - (c.embedding operator(extensions.<=>) query_embedding) >= match_threshold
  order by c.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 12);
$$;
revoke all on function public.match_documents(extensions.vector, integer, float) from public, anon;
grant execute on function public.match_documents(extensions.vector, integer, float) to authenticated, service_role;

-- Activate only complete imports; readers keep seeing the previous version during ingestion.
create function public.activate_document(p_id uuid, p_chunk_count integer)
returns void language plpgsql security invoker set search_path = '' as $$
declare doc public.documents;
begin
  select * into strict doc from public.documents where id = p_id for update;
  perform pg_advisory_xact_lock(hashtext(doc.source_path));
  if (select count(*) from public.document_chunks where document_id = p_id) <> p_chunk_count
    or (select count(*) from public.document_pages where document_id = p_id) <> doc.page_count then
    raise exception 'Incomplete document import';
  end if;
  update public.documents set active = false where source_path = doc.source_path and active and id <> p_id;
  update public.documents set active = true where id = p_id;
end;
$$;
revoke all on function public.activate_document(uuid, integer) from public, anon, authenticated;
grant execute on function public.activate_document(uuid, integer) to service_role;
