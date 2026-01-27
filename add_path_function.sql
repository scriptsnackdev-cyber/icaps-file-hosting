-- Function to get folder path (breadcrumbs) as a JSON array
CREATE OR REPLACE FUNCTION get_folder_path(folder_id uuid)
RETURNS TABLE (id uuid, name text) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE folder_path AS (
    SELECT sn.id, sn.name, sn.parent_id
    FROM storage_nodes sn
    WHERE sn.id = folder_id
    
    UNION ALL
    
    SELECT sn.id, sn.name, sn.parent_id
    FROM storage_nodes sn
    JOIN folder_path fp ON sn.id = fp.parent_id
  )
  SELECT fp.id, fp.name FROM folder_path fp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
