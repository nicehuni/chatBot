-- Run on a development project as postgres. All fixtures are rolled back.
begin;
insert into auth.users(id, email) values
  ('e743a107-02fa-43ca-8c88-333333333331', 'rag-test-a@example.invalid'),
  ('e743a107-02fa-43ca-8c88-333333333332', 'rag-test-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','e743a107-02fa-43ca-8c88-333333333331',true);
select public.begin_chat_turn('e743a107-02fa-43ca-8c88-333333333333','e743a107-02fa-43ca-8c88-333333333334','테스트 질문');
do $$ begin
  if (select count(*) from public.chat_rooms where id = 'e743a107-02fa-43ca-8c88-333333333333') <> 1 then raise exception 'Owner cannot read room'; end if;
  begin
    perform public.begin_chat_turn('e743a107-02fa-43ca-8c88-333333333333','e743a107-02fa-43ca-8c88-333333333335','동시 질문');
    raise exception 'Concurrent request allowed';
  exception when lock_not_available then null;
  end;
end $$;
update public.chat_turns set answer = '테스트 답변', status = 'completed' where id = 'e743a107-02fa-43ca-8c88-333333333334';
select public.begin_chat_turn('e743a107-02fa-43ca-8c88-333333333333','e743a107-02fa-43ca-8c88-333333333334','테스트 질문');
do $$ begin
  if (select count(*) from public.chat_turns where room_id = 'e743a107-02fa-43ca-8c88-333333333333') <> 1 then raise exception 'Retry duplicated message'; end if;
end $$;
select set_config('request.jwt.claim.sub','e743a107-02fa-43ca-8c88-333333333332',true);
do $$ begin
  if exists (select 1 from public.chat_rooms where id = 'e743a107-02fa-43ca-8c88-333333333333') then raise exception 'Other user can read room'; end if;
  if exists (select 1 from public.chat_turns where id = 'e743a107-02fa-43ca-8c88-333333333334') then raise exception 'Other user can read turn'; end if;
  update public.chat_turns set answer = 'hijacked' where id = 'e743a107-02fa-43ca-8c88-333333333334';
  if found then raise exception 'Other user can update answer'; end if;
  begin
    perform public.begin_chat_turn('e743a107-02fa-43ca-8c88-333333333333','e743a107-02fa-43ca-8c88-333333333336','다른 사용자 질문');
    raise exception 'Other user can append turn';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.document_chunks(document_id,chunk_index,page,content,embedding)
      select document_id,999999,page,'poisoned',embedding from public.document_chunks limit 1;
    raise exception 'User can write knowledge base';
  exception when insufficient_privilege then null;
  end;
end $$;
set local role anon;
do $$ begin
  begin
    perform 1 from public.document_pages;
    raise exception 'Anonymous document access allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
