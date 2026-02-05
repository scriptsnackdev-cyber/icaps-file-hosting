-- Extension for faster text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index for fast search
CREATE INDEX IF NOT EXISTS idx_storage_nodes_name_trgm ON storage_nodes USING gin (name gin_trgm_ops);

-- Index for performance optimization on drive queries
CREATE INDEX IF NOT EXISTS idx_storage_nodes_query 
ON storage_nodes (project_id, parent_id, status, name, version DESC);

-- Function to get folder contents efficiently with server-side filtering
CREATE OR REPLACE FUNCTION get_folder_nodes(
  p_project_id uuid,
  p_parent_id uuid
)
RETURNS SETOF storage_nodes
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH latest_nodes AS (
    SELECT DISTINCT ON (name) *
    FROM storage_nodes
    WHERE project_id = p_project_id
      AND parent_id IS NOT DISTINCT FROM p_parent_id
      AND (status = 'ACTIVE' OR status IS NULL)
    ORDER BY name, version DESC
  )
  SELECT * FROM latest_nodes
  ORDER BY
    CASE WHEN type = 'FOLDER' THEN 0 ELSE 1 END,
    name ASC;
END;
$$;

-- Function to resolve multiple node paths in one go (preventing N+1)
-- Returns JSON array of names for a given node_id
CREATE OR REPLACE FUNCTION resolve_node_path(p_node_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_path text[] := '{}';
  v_current_parent_id uuid;
  v_current_name text;
BEGIN
  SELECT parent_id INTO v_current_parent_id FROM storage_nodes WHERE id = p_node_id;
  
  WHILE v_current_parent_id IS NOT NULL LOOP
    SELECT name, parent_id INTO v_current_name, v_current_parent_id 
    FROM storage_nodes 
    WHERE id = v_current_parent_id;
    
    EXIT WHEN v_current_name IS NULL;
    v_path := v_current_name || v_path;
  END LOOP;
  
  RETURN v_path;
END;
$$;
