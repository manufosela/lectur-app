/**
 * Books Page Application - Refactored with SOLID principles
 * Applies Dependency Injection and Single Responsibility principles
 */

import { authService } from './modules/auth.js';
import { themeService } from './modules/theme.js';
import { uiService } from './modules/ui.js';
import { navigationService } from './modules/navigation.js';
import { booksService } from './modules/books.js';

class BooksApp {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize books application
   */
  async init() {
    if (this.initialized) return;
    
    console.log('📚 Inicializando aplicación de libros');
    
    try {
      // Initialize services
      await this.initializeServices();
      
      // Setup authentication
      this.setupAuthentication();
      
      // Setup event listeners
      this.setupEventListeners();
      
      this.initialized = true;
      console.log('✅ Aplicación de libros inicializada');
      
    } catch (error) {
      console.error('❌ Error inicializando aplicación de libros:', error);
    }
  }

  /**
   * Initialize all services
   */
  async initializeServices() {
    // Initialize theme
    themeService.init();
    
    // Initialize authentication
    authService.init();
    
    // Setup navigation
    navigationService.setupNavigation();
    
    // Setup UI components
    uiService.setupClickableLogos();
    uiService.setupBackButton('back-to-menu');
  }

  /**
   * Setup authentication
   */
  setupAuthentication() {
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
      console.log('👤 Usuario autenticado:', user.email);
      
      // Update user info
      uiService.setText('user-email', user.email);
      
      // Initialize books interface
      await booksService.init();
      
      // Load reading history now that user is authenticated
      console.log('📚 Cargando historial después de autenticación...');
      await booksService.loadReadingHistory();
      
    } catch (error) {
      console.error('Error handling authenticated user:', error);
      navigationService.goToHome();
    }
  }

  /**
   * Handle unauthenticated user
   */
  handleUnauthenticatedUser() {
    // Redirect to home if not authenticated
    navigationService.goToHome();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', this.handleLogout.bind(this));
    }

    // Theme toggle
    themeService.setupThemeToggle('theme-toggle');
    
    // Books-specific event listeners
    booksService.setupEventListeners();
  }

  /**
   * Handle logout
   */
  async handleLogout() {
    try {
      await authService.signOut();
      navigationService.goToHome();
    } catch (error) {
      console.error('Error en logout:', error);
    }
  }
}

// Create application instance
const booksApp = new BooksApp();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Set current year in footer
  const currentYearElement = document.getElementById('current-year');
  if (currentYearElement) {
    currentYearElement.textContent = new Date().getFullYear();
  }
  
  booksApp.init();
});

// Export for debugging
window.booksApp = {
  app: booksApp,
  authService,
  themeService,
  uiService,
  navigationService,
  booksService
};