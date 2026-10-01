import { Router } from 'express';
import multer from 'multer';

import { pool } from '../db/pool';
import { ingestFile } from '../ingest/ingest';
import { INGEST_RULES } from '../ingest/rules';
import type { UploadReport } from '../types';

export const uploadsRouter = Router();

// In memory: the biggest file we accept is 10MB, and keeping it off disk means
// there is no temporary file to clean up or leak.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: INGEST_RULES.maxUploadBytes, files: 1 },
});

uploadsRouter.post('/uploads', (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      // Phrased for Summer, not for a developer reading a stack trace.
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `That file is bigger than ${Math.round(INGEST_RULES.maxUploadBytes / 1024 / 1024)}MB. ` +
            `If it covers several months, try splitting it by week.`
          : `That file could not be read (${err.code}).`;
      res.status(400).json({ error: message });
      return;
    }
    if (err) {
      next(err);
      return;
    }

    void (async () => {
      try {
        if (!req.file) {
          res.status(400).json({
            error: 'No file was attached. Pick the file the branch manager emailed you.',
          });
          return;
        }

        const content = req.file.buffer.toString('utf8');
        if (content.trim() === '') {
          res.status(400).json({ error: 'That file is empty.' });
          return;
        }

        const report = await ingestFile(req.file.originalname, content);
        res.json(report);
      } catch (error) {
        next(error);
      }
    })();
  });
});

/** Upload history, so Summer can see what she has already sent. */
uploadsRouter.get('/uploads', async (_req, res) => {
  const result = await pool.query<{
    id: number;
    filename: string;
    uploaded_at: Date;
    rows_total: number;
    rows_accepted: number;
    rows_rejected: number;
    rows_duplicate: number;
    report: UploadReport;
  }>(
    `select id, filename, uploaded_at, rows_total, rows_accepted,
            rows_rejected, rows_duplicate, report
       from uploads
      order by uploaded_at desc
      limit 20`,
  );

  res.json(
    result.rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      uploadedAt: row.uploaded_at.toISOString(),
      rowsTotal: row.rows_total,
      rowsAccepted: row.rows_accepted,
      rowsRejected: row.rows_rejected,
      rowsDuplicate: row.rows_duplicate,
      warnings: row.report?.warnings ?? [],
    })),
  );
});
