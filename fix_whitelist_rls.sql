-- Ensure RLS is handled for whitelist table
-- If you want to use RLS, these policies allow admins to manage it.

-- 1. Enable RLS (if not already enabled)
ALTER TABLE whitelist ENABLE ROW LEVEL SECURITY;

-- 2. Policy: Everyone can see the whitelist (needed for login/check)
-- Or more restrictive: Only whitelisted users can see the whitelist
CREATE POLICY "Whitelisted users can view whitelist" 
ON whitelist FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM whitelist WHERE email = auth.jwt() ->> 'email'
  )
);

-- 3. Policy: Only admins can insert/update/delete
CREATE POLICY "Admins can manage whitelist" 
ON whitelist FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM whitelist 
    WHERE email = auth.jwt() ->> 'email' 
    AND role = 'admin'
  )
);

-- If you prefer to KEEP IT SIMPLE and RLS is causing issues, you can disable it:
-- ALTER TABLE whitelist DISABLE ROW LEVEL SECURITY;
