const { Router } = require('express');

const VALID_TYPES = ['book', 'audiobook', 'comic'];
const TYPE_PREFIXES = { book: 'libros', audiobook: 'audiolibros', comic: 'comics' };

function createCatalogRouter(pool) {
  const router = Router();

  // GET /api/catalog/search?q=texto&type=comic - search by name with pg_trgm
  router.get('/search', async (req, res) => {
    const { q, type } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Parámetro q requerido (mínimo 2 caracteres)' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;

    let query = `
      SELECT id, type, name, path, extension, size_bytes,
             similarity(name, $1) AS score
      FROM catalog_items
      WHERE (name % $1 OR name ILIKE $2) AND type != 'folder'`;
    const params = [q.trim(), `%${q.trim()}%`];

    if (type && VALID_TYPES.includes(type)) {
      query += ` AND type = $${params.length + 1}`;
      params.push(type);
    }

    query += ` ORDER BY score DESC, name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      query: q.trim(),
      items: result.rows,
      limit,
      offset,
    });
  });

  // GET /api/catalog/browse/* - browse folder contents by path
  router.get('/browse/*', async (req, res) => {
    const folderPath = req.params[0];
    if (!folderPath) {
      return res.status(400).json({ error: 'Ruta requerida' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(
      `SELECT id, type, name, path, extension, size_bytes
       FROM catalog_items
       WHERE parent_path = $1
       ORDER BY type = 'folder' DESC, name ASC
       LIMIT $2 OFFSET $3`,
      [folderPath, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM catalog_items WHERE parent_path = $1`,
      [folderPath]
    );

    res.json({
      folder: folderPath,
      items: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
    });
  });

  // GET /api/catalog/:type/count - count items by type
  router.get('/:type/count', async (req, res) => {
    const { type } = req.params;
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `Tipo inválido. Usar: ${VALID_TYPES.join(', ')}` });
    }

    const result = await pool.query(
      `SELECT COUNT(*) FROM catalog_items WHERE type = $1`,
      [type]
    );

    res.json({ type, count: parseInt(result.rows[0].count) });
  });

  // GET /api/catalog/:type - list root items by type
  router.get('/:type', async (req, res) => {
    const { type } = req.params;
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `Tipo inválido. Usar: ${VALID_TYPES.join(', ')}` });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const prefix = TYPE_PREFIXES[type];

    const result = await pool.query(
      `SELECT id, type, name, path, extension, size_bytes
       FROM catalog_items
       WHERE parent_path = $1
       ORDER BY type = 'folder' DESC, name ASC
       LIMIT $2 OFFSET $3`,
      [prefix, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM catalog_items WHERE parent_path = $1`,
      [prefix]
    );

    res.json({
      items: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
    });
  });

  return router;
}

module.exports = { createCatalogRouter };
