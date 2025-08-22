/**
 * Authentication Module
 * Single Responsibility: Handle all authentication-related operations
 */

import { auth, isUserAuthorized, signInWithGoogle, signOut } from '../firebase-config.js';

export class AuthService {
  constructor() {
    this.currentUser = null;
    this.authStateCallbacks = [];
  }

  /**
   * Initialize authentication listener
   */
  init() {
    auth.onAuthStateChanged(async (user) => {
      console.log('Estado de auth cambió:', user ? user.email : 'No autenticado');
      
      if (user) {
        await this.handleUserLogin(user);
      } else {
        this.handleUserLogout();
      }
      
      // Notify all callbacks about auth state change
      this.notifyAuthStateChange(this.currentUser);
    });
  }

  /**
   * Handle user login process
   */
  async handleUserLogin(user) {
    try {
      const isAuthorized = await isUserAuthorized(user.email);
      if (isAuthorized) {
        this.currentUser = user;
        this.saveAuthState();
        console.log('Usuario autorizado:', user.email);
      } else {
        console.log('Usuario no autorizado:', user.email);
        await this.signOut();
        throw new Error('Usuario no autorizado');
      }
    } catch (error) {
      console.error('Error verificando autorización:', error);
      throw error;
    }
  }

  /**
   * Handle user logout process
   */
  handleUserLogout() {
    this.currentUser = null;
    this.clearAuthState();
    console.log('Usuario deslogueado');
  }

  /**
   * Sign in with Google
   */
  async signInWithGoogle() {
    try {
      const result = await signInWithGoogle();
      return result.user;
    } catch (error) {
      console.error('Error en login:', error);
      throw error;
    }
  }

  /**
   * Sign out current user
   */
  async signOut() {
    try {
      await signOut();
    } catch (error) {
      console.error('Error en logout:', error);
      throw error;
    }
  }

  /**
   * Check if user is currently authenticated
   */
  isAuthenticated() {
    return this.currentUser !== null;
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Save authentication state to localStorage
   */
  saveAuthState() {
    try {
      localStorage.setItem('lectur-app-auth-state', 'authenticated');
    } catch (error) {
      console.warn('Error guardando estado de auth en localStorage:', error);
    }
  }

  /**
   * Clear authentication state from localStorage
   */
  clearAuthState() {
    try {
      localStorage.removeItem('lectur-app-auth-state');
    } catch (error) {
      console.warn('Error limpiando estado de auth en localStorage:', error);
    }
  }

  /**
   * Check if user was previously authenticated (from localStorage)
   */
  isPreviouslyAuthenticated() {
    try {
      return localStorage.getItem('lectur-app-auth-state') === 'authenticated';
    } catch (error) {
      console.warn('Error accediendo a localStorage:', error);
      return false;
    }
  }

  /**
   * Add callback for auth state changes
   */
  onAuthStateChange(callback) {
    this.authStateCallbacks.push(callback);
  }

  /**
   * Notify all callbacks about auth state change
   */
  notifyAuthStateChange(user) {
    this.authStateCallbacks.forEach(callback => {
      try {
        callback(user);
      } catch (error) {
        console.error('Error en callback de auth state:', error);
      }
    });
  }
}

// Create and export singleton instance
export const authService = new AuthService();