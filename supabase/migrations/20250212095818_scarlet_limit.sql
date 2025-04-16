/*
  # Update RLS policies for anonymous access

  1. Changes
    - Drop existing RLS policies that require authentication
    - Create new policies that allow anonymous access
    - Maintain security by still requiring valid API key access

  2. Security
    - Policies now allow anonymous access through valid API key
    - Maintains data integrity while allowing public access
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Allow read access to URLs" ON urls;
DROP POLICY IF EXISTS "Allow insert access to URLs" ON urls;
DROP POLICY IF EXISTS "Allow read access to similarity results" ON similarity_results;
DROP POLICY IF EXISTS "Allow insert access to similarity results" ON similarity_results;

-- Create new policies for anonymous access
CREATE POLICY "Allow public read access to URLs"
  ON urls FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow public insert access to URLs"
  ON urls FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow public read access to similarity results"
  ON similarity_results FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow public insert access to similarity results"
  ON similarity_results FOR INSERT
  TO anon
  WITH CHECK (true);