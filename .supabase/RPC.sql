-- 1. Get total usage
CREATE OR REPLACE FUNCTION get_total_usage()
RETURNS bigint AS $$
DECLARE
    total bigint;
BEGIN
    SELECT COALESCE(SUM(size), 0) INTO total FROM public.share_nodes WHERE type = 'file';
    RETURN total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Check if a node is a descendant of an ancestor
CREATE OR REPLACE FUNCTION is_descendant(child_id uuid, ancestor_id uuid)
RETURNS boolean AS $$
DECLARE
    current_id uuid := child_id;
    max_depth int := 50;
    current_depth int := 0;
BEGIN
    IF child_id = ancestor_id THEN
        RETURN true;
    END IF;

    WHILE current_id IS NOT NULL AND current_depth < max_depth LOOP
        SELECT parent_id INTO current_id FROM public.share_nodes WHERE id = current_id;
        IF current_id = ancestor_id THEN
            RETURN true;
        END IF;
        current_depth := current_depth + 1;
    END LOOP;

    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Get folder size recursively
CREATE OR REPLACE FUNCTION get_folder_size(folder_uuid uuid)
RETURNS bigint AS $$
DECLARE
    total_size bigint;
BEGIN
    WITH RECURSIVE descendants AS (
        SELECT id, size, type, parent_id FROM public.share_nodes WHERE id = folder_uuid
        UNION ALL
        SELECT sn.id, sn.size, sn.type, sn.parent_id
        FROM public.share_nodes sn
        INNER JOIN descendants d ON sn.parent_id = d.id
    )
    SELECT COALESCE(SUM(size), 0) INTO total_size FROM descendants WHERE type = 'file' AND id != folder_uuid;
    
    RETURN total_size;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Get nodes with their calculated sizes (for folder listing)
CREATE OR REPLACE FUNCTION get_nodes_with_sizes(p_parent_id uuid DEFAULT NULL, p_search_query text DEFAULT NULL)
RETURNS TABLE (
    id uuid,
    name text,
    type public.share_node_type,
    parent_id uuid,
    size bigint,
    mime_type text,
    r2_key text,
    created_at timestamptz,
    updated_at timestamptz
) AS $$
BEGIN
    IF p_search_query IS NOT NULL THEN
        RETURN QUERY
        SELECT n.id, n.name, n.type, n.parent_id, 
               CASE WHEN n.type = 'folder' THEN public.get_folder_size(n.id) ELSE n.size END AS size,
               n.mime_type, n.r2_key, n.created_at, n.updated_at
        FROM public.share_nodes n
        WHERE n.name ILIKE '%' || p_search_query || '%'
        ORDER BY n.type DESC, n.name ASC;
    ELSE
        RETURN QUERY
        SELECT n.id, n.name, n.type, n.parent_id, 
               CASE WHEN n.type = 'folder' THEN public.get_folder_size(n.id) ELSE n.size END AS size,
               n.mime_type, n.r2_key, n.created_at, n.updated_at
        FROM public.share_nodes n
        WHERE (p_parent_id IS NULL AND n.parent_id IS NULL) OR (n.parent_id = p_parent_id)
        ORDER BY n.type DESC, n.name ASC;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Get recent nodes with their calculated sizes
CREATE OR REPLACE FUNCTION get_recent_nodes_with_sizes()
RETURNS TABLE (
    id uuid,
    name text,
    type public.share_node_type,
    parent_id uuid,
    size bigint,
    mime_type text,
    r2_key text,
    created_at timestamptz,
    updated_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT n.id, n.name, n.type, n.parent_id, 
           CASE WHEN n.type = 'folder' THEN public.get_folder_size(n.id) ELSE n.size END AS size,
           n.mime_type, n.r2_key, n.created_at, n.updated_at
    FROM public.share_nodes n
    ORDER BY n.updated_at DESC
    LIMIT 30;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Get descendant files with relative paths (for ZIP output)
CREATE OR REPLACE FUNCTION get_descendant_files(folder_uuid uuid)
RETURNS TABLE (
    r2_key text,
    name text,
    rel_path text
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE descendants AS (
        SELECT sn.id, sn.name, sn.type, sn.r2_key, sn.name::text AS path
        FROM public.share_nodes sn
        WHERE sn.parent_id = folder_uuid
        
        UNION ALL
        
        SELECT sn.id, sn.name, sn.type, sn.r2_key, (d.path || '/' || sn.name)::text AS path
        FROM public.share_nodes sn
        INNER JOIN descendants d ON sn.parent_id = d.id
    )
    SELECT d.r2_key, d.name, d.path AS rel_path
    FROM descendants d
    WHERE d.type = 'file' AND d.r2_key IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
