import { Router } from 'express';
import multer from 'multer';

import { isLegacyExcelFilename, isSpreadsheetFilename } from '../ingest/spreadsheet';
import { INGEST_RULES } from '../ingest/rules';
import { ingestUpload, listUploadHistory } from '../services/uploads';
import { asyncHandler } from './asyncHandler';

export const uploadsRouter = Router();

// In memory: the biggest file we accept is 10MB, and keeping it off disk means
// there is no temporary file to clean up or leak.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: INGEST_RULES.maxUploadBytes, files: 1 },
});

const single = upload.single('file');

/**
 * Multer is callback-style, so it is awaited here rather than nesting the whole
 * handler inside its callback. A size or field error becomes a sentence Summer
 * can act on; anything else is a real failure and goes to the error middleware.
 */
uploadsRouter.post(
  '/uploads',
  asyncHandler(async (req, res) => {
    try {
      await new Promise<void>((resolve, reject) => {
        single(req, res, (err: unknown) => (err ? reject(err) : resolve()));
      });
    } catch (err) {
      if (err instanceof multer.MulterError) {
        // Phrased for Summer, not for a developer reading a stack trace.
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? `That file is bigger than ${Math.round(
                INGEST_RULES.maxUploadBytes / 1024 / 1024,
              )}MB. If it covers several months, try splitting it by week.`
            : `That file could not be read (${err.code}).`;
        res.status(400).json({ error: message });
        return;
      }
      throw err;
    }

    if (!req.file) {
      res.status(400).json({
        error: 'No file was attached. Pick the file the branch manager emailed you.',
      });
      return;
    }

    const filename = req.file.originalname || 'upload.csv';
    // Excel workbooks are zip files. Decoding them as UTF-8 turns the sheet
    // into noise; the parser needs the raw bytes.
    const content =
      isSpreadsheetFilename(filename) || isLegacyExcelFilename(filename)
        ? req.file.buffer
        : req.file.buffer.toString('utf8');
    if (typeof content === 'string' ? content.trim() === '' : content.length === 0) {
      res.status(400).json({ error: 'That file is empty.' });
      return;
    }

    // Sent by the upload screen when a file turned out to be a raw logger
    // export: she types (or taps) the logger, branch and fridge, and the same
    // file comes back labelled. A column in the file always wins over these.
    const report = await ingestUpload(filename, content, {
      loggerCode: field(req.body, 'logger'),
      branchName: field(req.body, 'branch'),
      fridgeName: field(req.body, 'fridge'),
    });
    res.json(report);
  }),
);

/** Upload history, so Summer can see what she has already sent. */
uploadsRouter.get(
  '/uploads',
  asyncHandler(async (_req, res) => {
    res.json(await listUploadHistory());
  }),
);

/** Multipart text fields arrive as strings, or as arrays if sent twice. */
function field(body: unknown, name: string): string | null {
  if (!body || typeof body !== 'object') return null;
  const value = (body as Record<string, unknown>)[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
