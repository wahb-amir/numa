-- =============================================================================
-- Migration 002: Create raw-uploads Storage Bucket + RLS Policies
-- =============================================================================
-- This migration creates the Supabase storage bucket used for direct frontend
-- uploads of CSV/GPX activity files, and sets Row Level Security policies so
-- that each user can only access files under their own user-id folder.
-- =============================================================================

-- Insert the bucket record (idempotent via ON CONFLICT DO NOTHING)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'raw-uploads',
  'raw-uploads',
  false,                          -- private bucket; objects are not publicly accessible
  52428800,                       -- 50 MB per file
  ARRAY[
    'text/csv',
    'application/gpx+xml',
    'application/xml',
    'text/xml',
    'text/plain'                  -- some tools export GPX with this MIME type
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS is already enabled on storage.objects by default (Supabase managed)

-- -----------------------------------------------------------------------------
-- Policy: Allow authenticated users to upload (INSERT) files into their own
-- folder.  The folder name must be their auth.uid().
-- Path convention:  raw-uploads/<user_id>/<timestamp>_<filename>
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can upload to their own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'raw-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- -----------------------------------------------------------------------------
-- Policy: Allow authenticated users to read their own files.
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can read their own uploads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'raw-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- -----------------------------------------------------------------------------
-- Policy: Allow authenticated users to delete their own files.
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can delete their own uploads"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'raw-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
