/**
 * Storage Service
 * Firmas de URLs contra el microservicio /sign usando Firebase ID Token
 */

import { auth } from '../firebase-config.js';

const DEFAULT_STORAGE_BASE_URL = 'https://storage.lecturapp.es';

const resolveBaseUrl = () => {
  if (typeof window !== 'undefined' && window.LECTURAPP_STORAGE_BASE_URL) {
    return window.LECTURAPP_STORAGE_BASE_URL;
  }
  return DEFAULT_STORAGE_BASE_URL;
};

const STORAGE_BASE_URL = resolveBaseUrl().replace(/\/+$/, '');
const SIGN_ENDPOINT = `${STORAGE_BASE_URL}/sign`;

class StorageService {
  async getIdToken() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Usuario no autenticado');
    }
    return user.getIdToken();
  }

  getBaseUrl() {
    return STORAGE_BASE_URL;
  }

  /**
   * Solicita una URL firmada para un path dado
   */
  async getSignedUrl(objectPath, contentType = 'generic') {
    if (!objectPath) {
      throw new Error('Ruta de archivo requerida para firmar');
    }

    const idToken = await this.getIdToken();
    const response = await fetch(SIGN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        path: objectPath,
        contentType
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`No se pudo firmar ${objectPath}: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
    }

    const data = await response.json();
    if (!data?.url) {
      throw new Error('Respuesta inválida del servicio de firma');
    }

    return data.url;
  }
}

export const storageService = new StorageService();
