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
      // Initialize core services
      await this.initializeServices();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Setup authentication
      this.setupAuthentication();
      
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
    try {
      uiService.hideLoginScreen();
      uiService.hideLoginError();
      
      // Update user info in UI
      uiService.setText('menu-user-email', user.email);
      
      // Load and update content counts
      await this.updateCategoryCounts();
      
    } catch (error) {
      console.error('Error handling authenticated user:', error);
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
   */
  async updateCategoryCounts() {
    try {
      await contentService.loadAllContent();
      const counts = contentService.getContentCounts();

      uiService.setText('books-count', counts.books);
      uiService.setText('audiobooks-count', counts.audiobooks);
      uiService.setText('comics-count', counts.comics);

      console.log(`📊 Contadores actualizados: ${counts.books} libros, ${counts.audiobooks} audiolibros, ${counts.comics} cómics`);
    } catch (error) {
      console.error('Error actualizando contadores:', error);
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