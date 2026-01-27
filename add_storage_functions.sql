-- Function to safely increment project storage usage
CREATE OR REPLACE FUNCTION increment_project_storage(p_id uuid, amount bigint)
RETURNS void AS $$
BEGIN
  UPDATE projects
  SET current_storage_bytes = current_storage_bytes + amount
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely decrement project storage usage
CREATE OR REPLACE FUNCTION decrement_project_storage(p_id uuid, amount bigint)
RETURNS void AS $$
BEGIN
  UPDATE projects
  SET current_storage_bytes = GREATEST(0, current_storage_bytes - amount)
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
