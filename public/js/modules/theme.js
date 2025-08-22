/**
 * Theme Management Module
 * Single Responsibility: Handle theme switching and persistence
 */

export class ThemeService {
  constructor() {
    this.currentTheme = 'light';
    this.init();
  }

  /**
   * Initialize theme service
   */
  init() {
    this.loadStoredTheme();
  }

  /**
   * Get current theme
   */
  getCurrentTheme() {
    return document.documentElement.hasAttribute('data-theme') ? 'dark' : 'light';
  }

  /**
   * Apply theme to document
   */
  applyTheme(theme) {
    const body = document.body;
    const html = document.documentElement;
    
    if (theme === 'dark') {
      html.setAttribute('data-theme', 'dark');
      body.setAttribute('data-theme', 'dark');
    } else {
      html.removeAttribute('data-theme');
      body.removeAttribute('data-theme');
    }
    
    this.currentTheme = theme;
  }

  /**
   * Toggle between light and dark theme
   */
  toggleTheme() {
    const newTheme = this.getCurrentTheme() === 'light' ? 'dark' : 'light';
    this.applyTheme(newTheme);
    this.saveTheme(newTheme);
    return newTheme;
  }

  /**
   * Save theme to localStorage
   */
  saveTheme(theme) {
    try {
      localStorage.setItem('lectur-app-theme', theme);
    } catch (error) {
      console.warn('Error guardando tema en localStorage:', error);
    }
  }

  /**
   * Load theme from localStorage
   */
  loadStoredTheme() {
    try {
      const storedTheme = localStorage.getItem('lectur-app-theme') || 'light';
      this.applyTheme(storedTheme);
    } catch (error) {
      console.warn('Error cargando tema de localStorage:', error);
      this.applyTheme('light');
    }
  }

  /**
   * Set up theme toggle button
   */
  setupThemeToggle(buttonId) {
    const themeToggle = document.getElementById(buttonId);
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        this.toggleTheme();
      });
    }
  }
}

// Create and export singleton instance
export const themeService = new ThemeService();