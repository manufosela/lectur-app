/**
 * Main Application Module - Refactored with SOLID principles
 * Applies Dependency Inversion and Single Responsibility principles
 */

import { authService } from './modules/auth.js';
import { themeService } from './modules/theme.js';
import { uiService } from './modules/ui.js';
import { contentService } from './modules/content.js';
import { navigationService } from './modules/navigation.js';

class LecturApp {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize the application
   */
  async init() {
    if (this.initialized) return;

    console.log('🚀 Inicializando LecturAPP');

    try {
      // Setup event listeners first
      this.setupEventListeners();

      // Setup authentication callback BEFORE initializing auth service
      // This ensures the callback is registered before Firebase fires auth state
      this.setupAuthentication();

      // Initialize core services (this triggers auth.onAuthStateChanged)
      await this.initializeServices();

      this.initialized = true;
      console.log('✅ LecturAPP inicializada correctamente');

    } catch (error) {
      console.error('❌ Error inicializando LecturAPP:', error);
    }
  }

  /**
   * Initialize all services
   */
  async initializeServices() {
    // Initialize theme service
    themeService.init();
    
    // Initialize authentication service
    authService.init();
    
    // Initialize navigation service
    navigationService.setupNavigation();
    
    // Setup UI components
    uiService.setupClickableLogos();
  }

  /**
   * Setup authentication handling
   */
  setupAuthentication() {
    // Listen for auth state changes
    authService.onAuthStateChange(async (user) => {
      if (user) {
        await this.handleAuthenticatedUser(user);
      } else {
        this.handleUnauthenticatedUser();
      }
    });
  }

  /**
   * Handle authenticated user
   */
  async handleAuthenticatedUser(user) {
    console.log('👤 handleAuthenticatedUser called for:', user?.email);
    try {
      uiService.hideLoginScreen();
      uiService.hideLoginError();

      // Update user info in UI
      uiService.setText('menu-user-email', user.email);

      // Load and update content counts
      console.log('📊 Calling updateCategoryCounts...');
      await this.updateCategoryCounts();
      console.log('✅ updateCategoryCounts completed');

    } catch (error) {
      console.error('❌ Error handling authenticated user:', error);
      uiService.showLoginError();
    }
  }

  /**
   * Handle unauthenticated user
   */
  handleUnauthenticatedUser() {
    uiService.showLoginScreen();
  }

  /**
   * Update category counts in the UI
   * First loads static stats (fast), then updates from NAS catalogs (accurate)
   */
  async updateCategoryCounts() {
    try {
      // 1. Cargar stats estáticos primero (instantáneo)
      await this.loadStaticStats();

      // 2. Luego actualizar desde los catálogos del NAS (más lento pero preciso)
      await contentService.loadAllContent();
      const counts = contentService.getContentCounts();

      uiService.setText('books-count', counts.books.toLocaleString('es-ES'));
      uiService.setText('audiobooks-count', counts.audiobooks.toLocaleString('es-ES'));
      uiService.setText('comics-count', counts.comics.toLocaleString('es-ES'));

      console.log(`📊 Contadores actualizados desde NAS: ${counts.books} libros, ${counts.audiobooks} audiolibros, ${counts.comics} cómics`);
    } catch (error) {
      console.error('Error actualizando contadores:', error);
    }
  }

  /**
   * Load static stats from pre-generated JSON on NAS
   */
  async loadStaticStats() {
    try {
      // Importar downloadProtectedFile para acceder al NAS
      const { downloadProtectedFile } = await import('./modules/protected-download.js');
      const blob = await downloadProtectedFile('stats/_stats_summary.json');
      const text = await blob.text();
      const data = JSON.parse(text);
      const stats = data.totals || {};

      // Solo mostrar si hay datos válidos (> 0)
      if (stats.books > 0) {
        uiService.setText('books-count', stats.books.toLocaleString('es-ES'));
      }
      if (stats.audiobooks > 0) {
        uiService.setText('audiobooks-count', stats.audiobooks.toLocaleString('es-ES'));
      }
      if (stats.comics > 0) {
        uiService.setText('comics-count', stats.comics.toLocaleString('es-ES'));
      }
      if (stats.books > 0 || stats.audiobooks > 0 || stats.comics > 0) {
        console.log(`📊 Stats del NAS cargados: ${stats.books} libros, ${stats.audiobooks} audiolibros, ${stats.comics} cómics`);
      }
    } catch (error) {
      // Si no existe el archivo o falla, los catálogos los cargarán
      console.log('Stats del NAS no disponibles, esperando catálogos...');
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Google login button
    const googleLoginBtn = document.getElementById('google-login-btn');
    if (googleLoginBtn) {
      googleLoginBtn.addEventListener('click', this.handleGoogleLogin.bind(this));
    }

    // Menu logout button
    const menuLogoutBtn = document.getElementById('menu-logout-btn');
    if (menuLogoutBtn) {
      menuLogoutBtn.addEventListener('click', this.handleLogout.bind(this));
    }

    // Theme toggle button
    themeService.setupThemeToggle('menu-theme-toggle');
  }

  /**
   * Handle Google login
   */
  async handleGoogleLogin() {
    try {
      uiService.showLoading();
      uiService.hideLoginError();
      
      await authService.signInWithGoogle();
      
    } catch (error) {
      console.error('Error en login:', error);
      uiService.showLoginError();
    } finally {
      uiService.hideLoading();
    }
  }

  /**
   * Handle logout
   */
  async handleLogout() {
    try {
      await authService.signOut();
      console.log('Usuario deslogueado');
    } catch (error) {
      console.error('Error en logout:', error);
    }
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    return authService.getCurrentUser();
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return authService.isAuthenticated();
  }
}

// Create application instance
const app = new LecturApp();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});

// Export for debugging
window.lecturApp = {
  app,
  authService,
  themeService,
  uiService,
  contentService,
  navigationService
};