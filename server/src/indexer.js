/**
 * NAS Indexer - Scans NAS directories and populates catalog_items in PostgreSQL.
 * Reads _aquitengolalista.json catalog files from each content directory.
 *
 * Usage: node src/indexer.js
 * Requires DATABASE_URL and NAS_MOUNT_PATH env vars.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const NAS_PATH = process.env.NAS_MOUNT_PATH;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL no configurada');
  process.exit(1);
}
if (!NAS_PATH) {
  console.error('ERROR: NAS_MOUNT_PATH no configurada');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

// Content type mapping by directory name
const CONTENT_DIRS = {
  LIBROS: { type: 'book', extensions: ['.epub', '.pdf'] },
  AUDIOLIBROS: { type: 'audiobook', extensions: ['.mp3', '.m4a', '.m4b'] },
  COMICS: { type: 'comic', extensions: ['.cbz', '.cbr'] },
};

/**
 * Parse a _aquitengolalista.json catalog and flatten into rows.
 */
function flattenCatalog(items, contentType, sectionPrefix, parentPath) {
  const rows = [];

  for (const item of items) {
    const relpath = `${sectionPrefix}/${item.relpath}`;

    if (item.type === 'dir') {
      rows.push({
        type: 'folder',
        name: item.clean_name || item.name,
        path: relpath,
        parent_path: parentPath,
        extension: null,
        size_bytes: null,
      });

      if (item.children && item.children.length > 0) {
        rows.push(...flattenCatalog(item.children, contentType, sectionPrefix, relpath));
      }
    } else if (item.type === 'file') {
      rows.push({
        type: contentType,
        name: item.clean_name || item.name,
        path: relpath,
        parent_path: parentPath,
        extension: item.ext || null,
        size_bytes: item.size_bytes || null,
      });
    }
  }

  return rows;
}

/**
 * Load catalog JSON from NAS directory.
 */
function loadCatalogJson(dirPath) {
  const catalogFile = path.join(dirPath, '_aquitengolalista.json');
  if (!fs.existsSync(catalogFile)) {
    return null;
  }
  const raw = fs.readFileSync(catalogFile, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Main indexation process.
 */
async function indexNAS() {
  const client = await pool.connect();
  const startTime = Date.now();
  let totalInserted = 0;
  let totalDeleted = 0;

  try {
    await client.query('BEGIN');

    const allRows = [];

    for (const [dirName, config] of Object.entries(CONTENT_DIRS)) {
      const dirPath = path.join(NAS_PATH, dirName);
      const sectionPrefix = dirName.toLowerCase();

      console.log(`Escaneando ${dirName}...`);

      const catalog = loadCatalogJson(dirPath);
      if (!catalog) {
        console.warn(`  WARN: No se encontró _aquitengolalista.json en ${dirPath}`);
        continue;
      }

      // Add root folder
      allRows.push({
        type: 'folder',
        name: dirName,
        path: sectionPrefix,
        parent_path: null,
        extension: null,
        size_bytes: null,
      });

      const items = flattenCatalog(catalog.items, config.type, sectionPrefix, sectionPrefix);
      allRows.push(...items);

      const fileCount = items.filter(r => r.type !== 'folder').length;
      const folderCount = items.filter(r => r.type === 'folder').length;
      console.log(`  ${fileCount} archivos, ${folderCount} carpetas`);
    }

    // Delete all existing catalog items and re-insert (full sync)
    const deleteResult = await client.query('DELETE FROM catalog_items');
    totalDeleted = deleteResult.rowCount;

    // Batch insert
    for (const row of allRows) {
      await client.query(
        `INSERT INTO catalog_items (type, name, path, parent_path, extension, size_bytes, indexed_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [row.type, row.name, row.path, row.parent_path, row.extension, row.size_bytes]
      );
      totalInserted++;
    }

    await client.query('COMMIT');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nIndexación completada en ${elapsed}s`);
    console.log(`  Eliminados: ${totalDeleted}`);
    console.log(`  Insertados: ${totalInserted}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERROR durante indexación:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

indexNAS();
