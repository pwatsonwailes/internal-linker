/*
  # Add URL caching tables

  1. New Tables
    - `target_url_lists`
      - `id` (uuid, primary key)
      - `urls` (text[], list of target URLs)
      - `hash` (text, unique hash of sorted URLs)
      - `created_at` (timestamp)
    
    - `source_url_processing_status`
      - `id` (uuid, primary key)
      - `source_url` (text, reference to source URL)
      - `target_list_id` (uuid, reference to target_url_lists)
      - `processed` (boolean)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for public access (matching existing tables)

  3. Indexes
    - Hash index on target_url_lists
    - Composite index on source_url_processing_status
*/

-- Create target_url_lists table
CREATE TABLE IF NOT EXISTS target_url_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  urls text[] NOT NULL,
  hash text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create source_url_processing_status table
CREATE TABLE IF NOT EXISTS source_url_processing_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL REFERENCES urls(url) ON DELETE CASCADE,
  target_list_id uuid NOT NULL REFERENCES target_url_lists(id) ON DELETE CASCADE,
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(source_url, target_list_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS target_url_lists_hash_idx ON target_url_lists(hash);
CREATE INDEX IF NOT EXISTS source_url_processing_status_composite_idx 
  ON source_url_processing_status(source_url, target_list_id);

-- Enable RLS
ALTER TABLE target_url_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_url_processing_status ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Allow public read access to target_url_lists"
  ON target_url_lists FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow public insert access to target_url_lists"
  ON target_url_lists FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow public read access to source_url_processing_status"
  ON source_url_processing_status FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow public insert access to source_url_processing_status"
  ON source_url_processing_status FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow public update access to source_url_processing_status"
  ON source_url_processing_status FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_source_url_processing_status_updated_at
  BEFORE UPDATE ON source_url_processing_status
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();