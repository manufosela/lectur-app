const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');

const VALID_TYPES = ['book', 'audiobook', 'comic'];

function createHistoryRouter(pool) {
  const router = Router();

  // All history routes require auth
  router.use(requireAuth);

  // GET /api/history?type=comic - list reading history (optionally filtered by type)
  router.get('/', async (req, res) => {
    const { type } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    let query = `
      SELECT id, content_path, content_type, title, progress, current_position, total, last_read
      FROM reading_history
      WHERE user_id = $1`;
    const params = [req.user.userId];

    if (type && VALID_TYPES.includes(type)) {
      query += ` AND content_type = $${params.length + 1}`;
      params.push(type);
    }

    query += ` ORDER BY last_read DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json({ items: result.rows, limit, offset });
  });

  // POST /api/history - save/update reading progress
  router.post('/', async (req, res) => {
    const { content_path, content_type, title, progress, current_position, total } = req.body;

    if (!content_path || !content_type || !title) {
      return res.status(400).json({ error: 'content_path, content_type y title requeridos' });
    }
    if (!VALID_TYPES.includes(content_type)) {
      return res.status(400).json({ error: `content_type inválido. Usar: ${VALID_TYPES.join(', ')}` });
    }

    const result = await pool.query(
      `INSERT INTO reading_history (user_id, content_path, content_type, title, progress, current_position, total, last_read, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (user_id, content_path)
       DO UPDATE SET progress = $5, current_position = $6, total = $7, title = $4, last_read = NOW(), updated_at = NOW()
       RETURNING *`,
      [req.user.userId, content_path, content_type, title, progress || 0, current_position || null, total || null]
    );

    res.json(result.rows[0]);
  });

  // DELETE /api/history/:id - remove history item
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM reading_history WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    res.json({ deleted: true });
  });

  return router;
}

module.exports = { createHistoryRouter };
