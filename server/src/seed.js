/**
 * Seed script - Creates initial admin user.
 *
 * Usage: node src/seed.js <email> <name> <password>
 * Requires DATABASE_URL env var.
 */

const crypto = require('crypto');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL no configurada');
  process.exit(1);
}

const [email, name, password] = process.argv.slice(2);
if (!email || !name || !password) {
  console.error('Uso: node src/seed.js <email> <name> <password>');
  process.exit(1);
}

async function hashPassword(pwd) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(pwd, salt, 64, (err, derived) => {
      if (err) return reject(err);
      resolve(`${salt}:${derived.toString('hex')}`);
    });
  });
}

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const hash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = $2, password_hash = $3
       RETURNING id, email, name`,
      [email, name, hash]
    );

    console.log('Usuario creado/actualizado:', result.rows[0]);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
