const { Router } = require('express');
const path = require('path');
const fs = require('fs');

const CONTENT_TYPES = {
  '.epub': 'application/epub+zip',
  '.pdf': 'application/pdf',
  '.cbz': 'application/zip',
  '.cbr': 'application/x-rar-compressed',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
};

const TYPE_DIRS = { book: 'LIBROS', audiobook: 'AUDIOLIBROS', comic: 'COMICS' };
const VALID_TYPES = Object.keys(TYPE_DIRS);

function createFilesRouter(nasPath) {
  const router = Router();

  // GET /api/files/:type/* - stream file from NAS
  router.get('/:type/*', (req, res) => {
    const { type } = req.params;
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `Tipo inválido. Usar: ${VALID_TYPES.join(', ')}` });
    }

    const relpath = req.params[0];
    if (!relpath) {
      return res.status(400).json({ error: 'Ruta de archivo requerida' });
    }

    // Path traversal protection
    const resolved = path.resolve(nasPath, TYPE_DIRS[type], relpath);
    const allowedBase = path.resolve(nasPath, TYPE_DIRS[type]);
    if (!resolved.startsWith(allowedBase + path.sep) && resolved !== allowedBase) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'La ruta no es un archivo' });
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    // Range request support (for audio seeking)
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });

      fs.createReadStream(resolved, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      });

      fs.createReadStream(resolved).pipe(res);
    }
  });

  return router;
}

module.exports = { createFilesRouter };
