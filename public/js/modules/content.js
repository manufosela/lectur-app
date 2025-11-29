/**
 * Content Management Module
 * Single Responsibility: Handle content loading from NAS catalogs.
 *
 * IMPORTANT: Content catalogs are loaded from NAS JSONs, NOT Firebase.
 * Firebase is ONLY used for reading history/progress.
 */

import { loadCatalog, getFilesByExtension } from './catalog-loader.js';
import {
  saveReadingProgressToFirebase,
  getReadingHistoryFromFirebase
} from '../firebase-config.js';

export class ContentService {
  constructor() {
    // Catálogos cargados del NAS
    this.booksCatalog = null;
    this.audiobooksCatalog = null;
    this.comicsCatalog = null;

    // Listas de archivos extraídas de los catálogos
    this.books = [];
    this.audiobooks = [];
    this.comics = [];
  }

  /**
   * Load a specific content type from NAS catalog
   * @param {string} type - 'books', 'audiobooks', or 'comics'
   */
  async loadContentType(type) {
    const catalogMap = {
      books: { path: 'libros', extensions: ['.epub', '.pdf'], prop: 'booksCatalog', list: 'books' },
      audiobooks: { path: 'audiolibros', extensions: ['.mp3', '.m4a', '.m4b'], prop: 'audiobooksCatalog', list: 'audiobooks' },
      comics: { path: 'comics', extensions: ['.cbz', '.cbr'], prop: 'comicsCatalog', list: 'comics' }
    };

    const config = catalogMap[type];
    if (!config) {
      console.warn(`❌ Tipo de contenido desconocido: ${type}`);
      return [];
    }

    // Si ya está cargado, devolver directamente
    if (this[config.prop]) {
      return this[config.list];
    }

    console.log(`📥 Cargando catálogo de ${type}...`);
    try {
      const catalog = await loadCatalog(config.path);
      this[config.prop] = catalog;
      this[config.list] = getFilesByExtension(catalog, config.extensions);
      console.log(`✅ ${type} cargados: ${this[config.list].length}`);
      return this[config.list];
    } catch (error) {
      console.warn(`❌ Error loading ${type} catalog:`, error.message);
      return [];
    }
  }

  /**
   * Load all content from NAS catalogs
   */
  async loadAllContent() {
    console.log('📥 Cargando catálogos desde NAS...');
    try {
      // Cargar solo los catálogos que no estén ya cargados
      const promises = [];

      if (!this.booksCatalog) {
        promises.push(this.loadContentType('books'));
      }
      if (!this.audiobooksCatalog) {
        promises.push(this.loadContentType('audiobooks'));
      }
      if (!this.comicsCatalog) {
        promises.push(this.loadContentType('comics'));
      }

      if (promises.length > 0) {
        await Promise.all(promises);
      }

      console.log(`📥 Catálogos cargados: ${this.books.length} libros, ${this.audiobooks.length} audiolibros, ${this.comics.length} cómics`);

      return {
        books: this.books,
        audiobooks: this.audiobooks,
        comics: this.comics
      };
    } catch (error) {
      console.error('Error loading catalogs:', error);
      throw error;
    }
  }

  /**
   * Get books list
   */
  getBooks() {
    return this.books;
  }

  /**
   * Get audiobooks list
   */
  getAudiobooks() {
    return this.audiobooks;
  }

  /**
   * Get comics list
   */
  getComics() {
    return this.comics;
  }

  /**
   * Get catalog by type
   */
  getCatalog(type) {
    switch (type) {
      case 'books':
        return this.booksCatalog;
      case 'audiobooks':
        return this.audiobooksCatalog;
      case 'comics':
        return this.comicsCatalog;
      default:
        return null;
    }
  }

  /**
   * Search content by title
   */
  searchByTitle(query, contentType = 'books') {
    const content = this.getContentByType(contentType);
    if (!query.trim()) {
      return content;
    }

    const normalizedQuery = query.toLowerCase();
    return content.filter(item => {
      const name = item.name || item.clean_name || '';
      return name.toLowerCase().includes(normalizedQuery);
    });
  }

  /**
   * Filter content by first letter
   */
  filterByLetter(letter, contentType = 'books') {
    const content = this.getContentByType(contentType);
    if (letter === 'all') {
      return content;
    }

    return content.filter(item => {
      const name = item.clean_name || item.name || '';
      return name.toUpperCase().startsWith(letter.toUpperCase());
    });
  }

  /**
   * Get content by type
   */
  getContentByType(type) {
    switch (type) {
      case 'books':
        return this.books;
      case 'audiobooks':
        return this.audiobooks;
      case 'comics':
        return this.comics;
      default:
        return this.books;
    }
  }

  /**
   * Get content counts
   */
  getContentCounts() {
    return {
      books: this.books.length,
      audiobooks: this.audiobooks.length,
      comics: this.comics.length
    };
  }

  /**
   * Save reading progress to Firebase
   */
  async saveProgress(userEmail, contentPath, title, author, currentChapter, totalChapters, contentType = 'book', additionalData = {}) {
    try {
      await saveReadingProgressToFirebase(
        userEmail,
        contentPath,
        title,
        author,
        currentChapter,
        totalChapters,
        contentType,
        additionalData
      );
      console.log('Progress saved:', contentPath);
    } catch (error) {
      console.error('Error saving progress:', error);
      throw error;
    }
  }

  /**
   * Get reading history from Firebase
   */
  async getHistory(userEmail) {
    try {
      const history = await getReadingHistoryFromFirebase(userEmail);
      return history;
    } catch (error) {
      console.error('Error loading history:', error);
      throw error;
    }
  }
}

// Create and export singleton instance
export const contentService = new ContentService();
