-- Explicitly reduce auth-dependent RPC exposure. No data or unrelated schemas are modified.
begin;
do $$ declare signature text; begin foreach signature in array array['public.lit_create_evaluation_session(integer)','public.lit_complete_evaluation_item(uuid,integer)','public.lit_evaluate_my_achievements()','public.lit_replace_my_profile_details(jsonb,jsonb,bigint[],bigint[],bigint[],bigint[])'] loop execute 'revoke all on function '||signature||' from public, anon';execute 'grant execute on function '||signature||' to authenticated';end loop;end $$;
commit;
