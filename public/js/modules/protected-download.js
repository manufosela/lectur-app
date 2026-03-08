/**
 * Helper para descargas protegidas con ID Token de Firebase.
 * Construye URL absoluta y realiza fetch con Authorization: Bearer <token>.
 */

import { auth } from '../firebase-config.js';

// URL base del servidor de almacenamiento Nginx
// Se lee de la config generada desde .env (PUBLIC_STORAGE_BASE_URL)
import { storageBaseUrl } from '../firebase-config.js';

if (!storageBaseUrl) {
  throw new Error('PUBLIC_STORAGE_BASE_URL no configurada en .env. No se puede acceder al storage.');
}
const BASE = storageBaseUrl;

/**
 * Devuelve la URL absoluta protegida (sin llamar a backend).
 */
export function getProtectedUrl(relpath) {
  const cleanPath = relpath?.replace(/^\/+/, '') || '';
  return `${BASE}/${cleanPath}`;
}

/**
 * Descarga un recurso protegido usando ID Token de Firebase.
 * Lanza UNAUTHORIZED en caso de 401.
 */
export async function downloadProtectedFile(relpath) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }

  const token = await user.getIdToken();
  const url = getProtectedUrl(relpath);

  const response = await fetch(url, {
    method: 'GET',
    mode: 'cors',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    throw new Error('UNAUTHORIZED');
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return await response.blob();
}
