/**
 * Main Application Module
 */

import { themeService } from './modules/theme.js';
import { uiService } from './modules/ui.js';
import { contentService } from './modules/content.js';
import { navigationService } from './modules/navigation.js';

class LecturApp {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    console.log('Inicializando LecturAPP');

    try {
      this.setupEventListeners();
      await this.initializeServices();
      this.initialized = true;
      console.log('LecturAPP inicializada correctamente');
    } catch (error) {
      console.error('Error inicializando LecturAPP:', error);
    }
  }

  async initializeServices() {
    themeService.init();
    navigationService.setupNavigation();
    uiService.setupClickableLogos();
  }

  setupEventListeners() {
    // Enter button on welcome screen
    const enterBtn = document.getElementById('enter-btn');
    if (enterBtn) {
      enterBtn.addEventListener('click', () => this.enterLibrary());
    }

    // Theme toggle button
    themeService.setupThemeToggle('menu-theme-toggle');
  }

  enterLibrary() {
    const welcomeScreen = document.getElementById('welcome-screen');
    const categoryMenu = document.getElementById('category-menu');

    welcomeScreen.style.display = 'none';
    categoryMenu.style.display = 'flex';

    this.updateCategoryCounts();
  }

  /**
   * Update category counts in the UI
   */
  async updateCategoryCounts() {
    try {
      await this.loadStaticStats();

      await contentService.loadAllContent();
      const counts = contentService.getContentCounts();

      uiService.setText('books-count', counts.books.toLocaleString('es-ES'));
      uiService.setText('audiobooks-count', counts.audiobooks.toLocaleString('es-ES'));
      uiService.setText('comics-count', counts.comics.toLocaleString('es-ES'));

      console.log(`Contadores: ${counts.books} libros, ${counts.audiobooks} audiolibros, ${counts.comics} comics`);
    } catch (error) {
      console.error('Error actualizando contadores:', error);
    }
  }

  /**
   * Load static stats from pre-generated JSON on NAS
   */
  async loadStaticStats() {
    try {
      const { downloadProtectedFile } = await import('./modules/protected-download.js');
      const blob = await downloadProtectedFile('stats/_stats_summary.json');
      const text = await blob.text();
      const data = JSON.parse(text);
      const stats = data.totals || {};

      if (stats.books > 0) {
        uiService.setText('books-count', stats.books.toLocaleString('es-ES'));
      }
      if (stats.audiobooks > 0) {
        uiService.setText('audiobooks-count', stats.audiobooks.toLocaleString('es-ES'));
      }
      if (stats.comics > 0) {
        uiService.setText('comics-count', stats.comics.toLocaleString('es-ES'));
      }
    } catch (error) {
      console.log('Stats no disponibles, esperando catalogos...');
    }
  }
}

const app = new LecturApp();

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});

window.lecturApp = {
  app,
  themeService,
  uiService,
  contentService,
  navigationService
};
