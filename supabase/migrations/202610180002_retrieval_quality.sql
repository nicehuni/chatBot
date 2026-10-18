create or replace function public.match_documents(query_embedding extensions.vector(1024), match_count integer default 6, match_threshold float default 0.3)
returns table (id bigint, document_name text, page integer, content text, similarity float)
language sql stable security invoker set search_path = '' as $$
  select c.id, d.name, c.page, c.content, 1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.document_chunks c join public.documents d on d.id = c.document_id
  where d.active and 1 - (c.embedding operator(extensions.<=>) query_embedding) >= match_threshold
    -- Dotted table-of-contents leaders otherwise outrank the actual body text.
    and length(regexp_replace(c.content, '[·.[:space:]]', '', 'g')) > length(c.content) * 0.55
  order by c.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 12);
$$;
