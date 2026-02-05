-- Update get_folder_nodes to support pagination
CREATE OR REPLACE FUNCTION get_folder_nodes(
  p_project_id uuid,
  p_parent_id uuid,
  p_limit int DEFAULT 1000,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  size bigint,
  owner_id uuid,
  owner_email text,
  parent_id uuid,
  project_id uuid,
  status text,
  is_trashed boolean,
  version int,
  created_at timestamptz,
  updated_at timestamptz,
  trashed_at timestamptz,
  sharing_scope text,
  full_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH latest_nodes AS (
    SELECT DISTINCT ON (sn.name)
      sn.*
    FROM storage_nodes sn
    WHERE sn.project_id = p_project_id
      AND sn.parent_id IS NOT DISTINCT FROM p_parent_id
      AND (sn.status = 'ACTIVE' OR sn.status IS NULL)
    ORDER BY sn.name, sn.version DESC
  ),
  counted_nodes AS (
    SELECT *, COUNT(*) OVER() as total_count
    FROM latest_nodes
  )
  SELECT 
    cn.id, cn.name, cn.type, cn.size, cn.owner_id, cn.owner_email, 
    cn.parent_id, cn.project_id, cn.status, cn.is_trashed, cn.version, 
    cn.created_at, cn.updated_at, cn.trashed_at, cn.sharing_scope,
    cn.total_count
  FROM counted_nodes cn
  ORDER BY
    CASE WHEN cn.type = 'FOLDER' THEN 0 ELSE 1 END,
    cn.name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
