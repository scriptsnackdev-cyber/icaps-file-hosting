-- ============================================================
-- RPC: get_project_usages
-- Returns total file size (bytes) per project.
-- Only sums rows of type = 'file' (skips folder placeholder rows).
-- ============================================================
create or replace function get_project_usages(p_project_ids uuid[])
returns table (project_id uuid, total_bytes bigint)
language sql
stable
security definer
as $$
  select
    n.project_id,
    coalesce(sum(n.size), 0)::bigint as total_bytes
  from share_nodes n
  where
    n.type = 'file'
    and n.project_id = any(p_project_ids)
  group by n.project_id;
$$;
