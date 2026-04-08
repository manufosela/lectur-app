const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3001;

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const { requireAuth } = require('./middleware/auth');
const { createAuthRouter } = require('./routes/auth');
const { createCatalogRouter } = require('./routes/catalog');
const { createFilesRouter } = require('./routes/files');
const { createHistoryRouter } = require('./routes/history');

const { router: authRouter } = createAuthRouter(pool);
app.use('/api/auth', authRouter);
app.use('/api/catalog', requireAuth, createCatalogRouter(pool));
app.use('/api/files', requireAuth, createFilesRouter(process.env.NAS_MOUNT_PATH));
app.use('/api/history', createHistoryRouter(pool));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time');
    res.json({
      status: 'ok',
      timestamp: result.rows[0].time,
      uptime: process.uptime(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      message: 'Database connection failed',
      error: err.message,
    });
  }
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`LecturAPP API running on port ${port}`);
});

module.exports = { app, pool };
