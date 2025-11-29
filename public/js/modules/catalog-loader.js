/**
 * Catalog Loader Module
 * Carga y consulta el catálogo generado en el NAS (_aquitengolalista.json).
 *
 * Estructura del catálogo (generada por script Python en NAS):
 * {
 *   "generated_at": "2025-11-29T...",
 *   "folder": "/media/raid5/COMICS",
 *   "count": 1933,
 *   "items": [
 *     { "name": "archivo.cbz", "type": "file", "relpath": "archivo.cbz", "size_bytes": 12345, "ext": ".cbz" },
 *     { "name": "subcarpeta", "type": "dir", "relpath": "subcarpeta", "items": [...] }
 *   ]
 * }
 *
 * NOTA: relpath en el JSON NO incluye el prefijo de sección (comics/, libros/, etc.)
 * El código añade el prefijo automáticamente al resolver rutas.
 */

import { getProtectedUrl, downloadProtectedFile } from './protected-download.js';

/**
 * Carga el catálogo JSON para una carpeta base del NAS.
 *
 * @param {string} basePath - Carpeta base: 'comics', 'libros', 'audiolibros'
 * @returns {Promise<object>} Objeto JS parseado del catálogo
 * @throws {Error} Si no se puede cargar o parsear el catálogo
 */
export async function loadCatalog(basePath) {
  // Normalizar (quitar slashes)
  const cleanBase = basePath.replace(/^\/+|\/+$/g, '');
  const relpath = `${cleanBase}/_aquitengolalista.json`;

  try {
    // Usar downloadProtectedFile para consistencia con el resto del sistema
    const blob = await downloadProtectedFile(relpath);
    const text = await blob.text();
    const catalog = JSON.parse(text);

    // Guardar la sección base para uso posterior
    catalog._section = cleanBase;

    const itemCount = catalog.count || (catalog.items ? catalog.items.length : 0);
    console.log(`📂 Catálogo cargado: ${cleanBase} (${itemCount} items)`);
    return catalog;
  } catch (error) {
    console.error(`❌ Error cargando catálogo ${relpath}:`, error);
    throw new Error(`No se pudo cargar el catálogo de ${cleanBase}: ${error.message}`);
  }
}

/**
 * Busca un nodo en el catálogo por su relpath.
 * El relpath puede incluir o no el prefijo de sección (comics/, libros/, etc.)
 *
 * @param {object} catalog - Catálogo cargado (objeto raíz)
 * @param {string} relpath - Ruta relativa a buscar
 * @returns {object|null} Nodo encontrado o null si no existe
 */
export function findNodeByRelpath(catalog, relpath) {
  if (!catalog || !relpath) return null;

  const section = catalog._section || '';
  // Normalizar: quitar slashes y quitar prefijo de sección si existe
  let normalizedSearch = relpath.replace(/^\/+|\/+$/g, '');
  if (section && normalizedSearch.toLowerCase().startsWith(section.toLowerCase() + '/')) {
    normalizedSearch = normalizedSearch.substring(section.length + 1);
  }

  // Buscar en items (estructura plana o recursiva)
  const items = catalog.items || [];

  function searchItems(itemList) {
    for (const item of itemList) {
      const itemRelpath = (item.relpath || '').replace(/^\/+|\/+$/g, '');

      // Comparar case-insensitive
      if (itemRelpath.toLowerCase() === normalizedSearch.toLowerCase()) {
        return item;
      }

      // Si es directorio, buscar en sus items
      if (item.type === 'dir' && Array.isArray(item.items)) {
        const found = searchItems(item.items);
        if (found) return found;
      }
    }
    return null;
  }

  return searchItems(items);
}

/**
 * Obtiene todos los archivos de un tipo específico del catálogo.
 *
 * @param {object} catalog - Catálogo cargado
 * @param {string|string[]} extensions - Extensión o array de extensiones (e.g., '.cbz', ['.cbz', '.cbr'])
 * @returns {object[]} Array de nodos de tipo file que coinciden
 */
export function getFilesByExtension(catalog, extensions) {
  const extArray = Array.isArray(extensions) ? extensions : [extensions];
  const normalizedExts = extArray.map(ext => ext.toLowerCase().replace(/^\./, ''));
  const results = [];
  const section = catalog._section || '';

  function collectFiles(items) {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (item.type === 'file') {
        // Usar ext del item si existe, si no extraer del nombre
        const fileExt = (item.ext || '').toLowerCase().replace(/^\./, '') ||
                        (item.name || '').split('.').pop()?.toLowerCase() || '';
        if (normalizedExts.includes(fileExt)) {
          // Añadir sección al relpath si no la tiene
          const fullRelpath = item.relpath.startsWith(section + '/') ?
            item.relpath : `${section}/${item.relpath}`;
          results.push({ ...item, fullRelpath });
        }
      }

      // Buscar en subdirectorios
      if (item.type === 'dir' && Array.isArray(item.items)) {
        collectFiles(item.items);
      }
    }
  }

  collectFiles(catalog.items || []);
  return results;
}

/**
 * Obtiene todos los directorios del catálogo.
 *
 * @param {object} catalog - Catálogo cargado
 * @param {number} maxDepth - Profundidad máxima (0 = solo raíz, -1 = sin límite)
 * @returns {object[]} Array de nodos de tipo dir
 */
export function getDirectories(catalog, maxDepth = -1) {
  const results = [];
  const section = catalog._section || '';

  function collectDirs(items, depth) {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (item.type === 'dir') {
        const fullRelpath = item.relpath.startsWith(section + '/') ?
          item.relpath : `${section}/${item.relpath}`;
        results.push({ ...item, fullRelpath });

        if (maxDepth === -1 || depth < maxDepth) {
          if (Array.isArray(item.items)) {
            collectDirs(item.items, depth + 1);
          }
        }
      }
    }
  }

  collectDirs(catalog.items || [], 0);
  return results;
}
