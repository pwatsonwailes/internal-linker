/*
  # URL Analysis Schema

  1. New Tables
    - `urls`
      - Stores unique URLs and their content
      - `id` (uuid, primary key)
      - `url` (text, unique)
      - `title` (text)
      - `body` (text)
      - `preprocessed_data` (jsonb) - Stores preprocessed tokens and vectors
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `similarity_results`
      - Stores similarity analysis results between URLs
      - `id` (uuid, primary key)
      - `source_url_id` (uuid, references urls)
      - `target_url_id` (uuid, references urls)
      - `similarity_score` (float)
      - `suggested_anchor` (text)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to read/write their data
*/

-- Create URLs table
CREATE TABLE IF NOT EXISTS urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text UNIQUE NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  preprocessed_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create similarity results table
CREATE TABLE IF NOT EXISTS similarity_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url_id uuid REFERENCES urls(id) ON DELETE CASCADE,
  target_url_id uuid REFERENCES urls(id) ON DELETE CASCADE,
  similarity_score float NOT NULL,
  suggested_anchor text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(source_url_id, target_url_id)
);

-- Enable RLS
ALTER TABLE urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE similarity_results ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow read access to URLs"
  ON urls FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow insert access to URLs"
  ON urls FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow read access to similarity results"
  ON similarity_results FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow insert access to similarity results"
  ON similarity_results FOR INSERT TO authenticated
  WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_urls_updated_at
  BEFORE UPDATE ON urls
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();