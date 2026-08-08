import { Router } from 'express';
import multer from 'multer';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { uploadQueue } from '../jobs/queues';

export const uploadRouter = Router();

const upload = multer({ storage: multer.memoryStorage() });

uploadRouter.post('/', requireAuth, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user!.id;
    const originalFilename = file.originalname;
    const fileExt = originalFilename.split('.').pop()?.toLowerCase() || '';
    
    if (!['csv', 'gpx'].includes(fileExt)) {
      return res.status(400).json({ error: 'Unsupported file type. Only CSV and GPX are allowed.' });
    }

    const fileKey = `${userId}/${Date.now()}_${originalFilename}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('raw-uploads')
      .upload(fileKey, file.buffer, {
        contentType: file.mimetype,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload file to storage' });
    }

    // Insert to raw_uploads table using the admin client because the user might not have
    // an active session in the backend context if we only have the token for RLS. 
    // Actually, we can use standard insert with service key or try to pass token.
    // We will use service key for this background job orchestration.
    const { data: dbData, error: dbError } = await supabase
      .from('raw_uploads')
      .insert({
        user_id: userId,
        file_key: fileKey,
        original_filename: originalFilename,
        file_type: fileExt,
        upload_status: 'pending',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      return res.status(500).json({ error: 'Failed to record upload in database' });
    }

    // Enqueue job
    await uploadQueue.add('processUpload', {
      uploadId: dbData.id,
      userId,
      fileKey,
      fileType: fileExt
    });

    return res.status(202).json({
      message: 'Upload accepted and processing started',
      uploadId: dbData.id
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

uploadRouter.get('/:id/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const { data, error } = await supabase
      .from('raw_uploads')
      .select('upload_status, error_message')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    return res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
