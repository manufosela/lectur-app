/**
 * UI Management Module
 * Single Responsibility: Handle UI state and common UI operations
 */

export class UIService {
  /**
   * Show loading overlay
   */
  showLoading() {
    console.log('🔄 Mostrando loader...');
    const overlay = document.getElementById('overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.style.display = 'flex';
      console.log('✅ Loader mostrado');
    } else {
      console.error('❌ No se encontró el elemento overlay');
    }
  }

  /**
   * Hide loading overlay
   */
  hideLoading() {
    console.log('🔄 Ocultando loader...');
    const overlay = document.getElementById('overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.style.display = 'none';
      console.log('✅ Loader ocultado');
    }
  }

  /**
   * Show element by ID
   */
  showElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.style.display = 'flex';
    }
  }

  /**
   * Hide element by ID
   */
  hideElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.style.display = 'none';
    }
  }

  /**
   * Add CSS class to element
   */
  addClass(elementId, className) {
    const element = document.getElementById(elementId);
    if (element) {
      element.classList.add(className);
    }
  }

  /**
   * Remove CSS class from element
   */
  removeClass(elementId, className) {
    const element = document.getElementById(elementId);
    if (element) {
      element.classList.remove(className);
    }
  }

  /**
   * Set text content of element
   */
  setText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = text;
    }
  }

  /**
   * Set HTML content of element
   */
  setHTML(elementId, html) {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = html;
    }
  }

  /**
   * Show login screen
   */
  showLoginScreen() {
    this.showElement('login-screen');
    this.hideElement('category-menu');
  }

  /**
   * Hide login screen and show category menu
   */
  hideLoginScreen() {
    this.hideElement('login-screen');
    this.showElement('category-menu');
  }

  /**
   * Show login error message
   */
  showLoginError() {
    this.removeClass('login-error', 'hidden');
  }

  /**
   * Hide login error message
   */
  hideLoginError() {
    this.addClass('login-error', 'hidden');
  }

  /**
   * Set up clickable logos
   */
  setupClickableLogos() {
    const clickableLogos = document.querySelectorAll('.clickable-logo');
    clickableLogos.forEach(logo => {
      logo.addEventListener('click', () => {
        // If we're in a subpage, go back to main page
        if (window.location.pathname !== '/') {
          window.location.href = '/';
        }
      });
    });
  }

  /**
   * Set up back button functionality
   */
  setupBackButton(buttonId) {
    const backButton = document.getElementById(buttonId);
    if (backButton) {
      backButton.addEventListener('click', () => {
        window.location.href = '/';
      });
    }
  }

  /**
   * Clean title for display (remove underscores, extensions)
   */
  cleanTitle(title) {
    return title
      .replace(/_/g, ' ')
      .replace(/\.(epub|mp3|cbz|cbr|pdf)$/i, '');
  }

  /**
   * Format count with proper pluralization
   */
  formatCount(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  /**
   * Create element with classes and content
   */
  createElement(tag, classes = [], content = '') {
    const element = document.createElement(tag);
    if (classes.length > 0) {
      element.classList.add(...classes);
    }
    if (content) {
      element.innerHTML = content;
    }
    return element;
  }

  /**
   * Show modal
   */
  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  /**
   * Hide modal
   */
  hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
    }
  }
}

// Create and export singleton instance
export const uiService = new UIService();