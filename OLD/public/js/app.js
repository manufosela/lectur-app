/**
 * Aplicación principal simplificada para LecturAPP
 * Solo maneja login y menú de categorías
 */

import { 
  getBooksNamesList, 
  getAudiobooksList,
  getComicsList,
  auth, 
  isUserAuthorized,
  signInWithGoogle,
  signOut
} from './firebase-config.js';

// Variables globales
let currentUser = null;

// Funciones de autenticación
const showLoginScreen = () => {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('category-menu').style.display = 'none';
};

const hideLoginScreen = () => {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('category-menu').style.display = 'flex';
};

const showLoginError = () => {
  document.getElementById('login-error').classList.remove('hidden');
};

const hideLoginError = () => {
  document.getElementById('login-error').classList.add('hidden');
};

const handleGoogleLogin = async () => {
  try {
    loading(true);
    hideLoginError();
    
    const result = await signInWithGoogle();
    const user = result.user;
    
    // Verificar si el usuario está autorizado
    const isAuthorized = await isUserAuthorized(user.email);
    
    if (isAuthorized) {
      currentUser = user;
      console.log('Usuario autorizado:', user.email);
      hideLoginScreen();
      
      // Guardar estado de autenticación
      try {
        localStorage.setItem('lectur-app-auth-state', 'authenticated');
      } catch (error) {
        console.warn('Error guardando estado de auth en localStorage:', error);
      }
      
      // Mostrar menú de categorías
      showCategoryMenu();
      
      // Actualizar info del usuario
      const menuUserEmail = document.getElementById('menu-user-email');
      if (menuUserEmail) {
        menuUserEmail.textContent = user.email;
      }
      
      // Actualizar contadores
      await updateCategoryCounts();
    } else {
      console.log('Usuario no autorizado:', user.email);
      showLoginError();
      await signOut();
    }
    
    loading(false);
  } catch (error) {
    console.error('Error en login:', error);
    showLoginError();
    loading(false);
  }
};

const handleLogout = async () => {
  try {
    await signOut();
    currentUser = null;
    
    // Limpiar estado de autenticación de localStorage
    try {
      localStorage.removeItem('lectur-app-auth-state');
    } catch (error) {
      console.warn('Error limpiando estado de auth en localStorage:', error);
    }
    
    showLoginScreen();
    console.log('Usuario deslogueado');
  } catch (error) {
    console.error('Error en logout:', error);
  }
};

// Escuchar cambios en el estado de autenticación
auth.onAuthStateChanged(async (user) => {
  console.log('Estado de auth cambió:', user ? user.email : 'No autenticado');
  
  if (user) {
    // Usuario logueado, verificar autorización
    loading(true);
    try {
      const isAuthorized = await isUserAuthorized(user.email);
      if (isAuthorized) {
        currentUser = user;
        hideLoginScreen();
        
        // Guardar estado de autenticación en localStorage
        try {
          localStorage.setItem('lectur-app-auth-state', 'authenticated');
        } catch (error) {
          console.warn('Error guardando estado de auth en localStorage:', error);
        }
        
        // Mostrar menú de categorías
        showCategoryMenu();
        
        // Actualizar info del usuario en el menú
        const menuUserEmail = document.getElementById('menu-user-email');
        if (menuUserEmail) {
          menuUserEmail.textContent = user.email;
        }
        
        // Actualizar contadores en el menú
        await updateCategoryCounts();
      } else {
        console.log('Usuario no autorizado:', user.email);
        showLoginError();
        await signOut();
      }
    } catch (error) {
      console.error('Error verificando autorización:', error);
      showLoginError();
    }
    loading(false);
  } else {
    // Usuario no logueado
    currentUser = null;
    
    // Limpiar estado de autenticación de localStorage
    try {
      localStorage.removeItem('lectur-app-auth-state');
    } catch (error) {
      console.warn('Error limpiando estado de auth en localStorage:', error);
    }
    
    showLoginScreen();
    hideCategoryMenu();
    loading(false);
  }
});

const loading = (show) => {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  
  if (show) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
};

// Funciones para manejo del menú de categorías
const showCategoryMenu = () => {
  const categoryMenu = document.getElementById('category-menu');
  const loginScreen = document.getElementById('login-screen');
  
  categoryMenu.style.display = 'flex';
  loginScreen.style.display = 'none';
};

const hideCategoryMenu = () => {
  const categoryMenu = document.getElementById('category-menu');
  categoryMenu.style.display = 'none';
};

/**
 * Actualizar contadores de categorías
 */
const updateCategoryCounts = async () => {
  try {
    const [booksCount, audiobooksCount, comicsCount] = await Promise.all([
      getBooksNamesList().then(books => books.length).catch(() => 0),
      getAudiobooksList().then(audiobooks => audiobooks.length).catch(() => 0),
      getComicsList().then(comics => comics.length).catch(() => 0)
    ]);

    // Actualizar contadores en la UI
    const booksCountElement = document.getElementById('books-count');
    const audiobooksCountElement = document.getElementById('audiobooks-count');
    const comicsCountElement = document.getElementById('comics-count');

    if (booksCountElement) booksCountElement.textContent = booksCount;
    if (audiobooksCountElement) audiobooksCountElement.textContent = audiobooksCount;
    if (comicsCountElement) comicsCountElement.textContent = comicsCount;

    console.log(`📊 Contadores actualizados: ${booksCount} libros, ${audiobooksCount} audiolibros, ${comicsCount} cómics`);
  } catch (error) {
    console.error('Error actualizando contadores:', error);
  }
};

/**
 * Funciones del sistema de temas
 */
const getCurrentTheme = () => {
  return document.documentElement.hasAttribute('data-theme') ? 'dark' : 'light';
};

const applyTheme = (theme) => {
  const body = document.body;
  const html = document.documentElement;
  
  if (theme === 'dark') {
    html.setAttribute('data-theme', 'dark');
    body.setAttribute('data-theme', 'dark');
  } else {
    html.removeAttribute('data-theme');
    body.removeAttribute('data-theme');
  }
};

const setStoredTheme = (theme) => {
  try {
    localStorage.setItem('lectur-app-theme', theme);
  } catch (error) {
    console.warn('Error guardando tema en localStorage:', error);
  }
};

const initializeTheme = () => {
  try {
    const storedTheme = localStorage.getItem('lectur-app-theme') || 'light';
    applyTheme(storedTheme);
  } catch (error) {
    console.warn('Error cargando tema de localStorage:', error);
    applyTheme('light');
  }
};

// Event listeners cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Inicializando LecturAPP');
  
  // Inicializar tema
  initializeTheme();
  
  // Event listener para login con Google
  const googleLoginBtn = document.getElementById('google-login-btn');
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', handleGoogleLogin);
  }
  
  // Event listeners para navegación de categorías
  const categoryCards = document.querySelectorAll('.category-card');
  categoryCards.forEach(card => {
    card.addEventListener('click', async () => {
      const category = card.dataset.category;
      
      if (category === 'books' && !card.disabled) {
        window.location.href = '/books';
      } else if (category === 'comics' && !card.disabled) {
        window.location.href = '/comics';
      } else if (category === 'audiobooks' && !card.disabled) {
        window.location.href = '/audiobooks';
      } else if (card.disabled) {
        console.log(`Categoría ${category} próximamente`);
      }
    });
  });
  
  // Event listener para logout del menú
  const menuLogoutBtn = document.getElementById('menu-logout-btn');
  if (menuLogoutBtn) {
    menuLogoutBtn.addEventListener('click', handleLogout);
  }
  
  // Event listener para cambio de tema
  const menuThemeToggle = document.getElementById('menu-theme-toggle');
  if (menuThemeToggle) {
    menuThemeToggle.addEventListener('click', () => {
      const currentTheme = getCurrentTheme();
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      applyTheme(newTheme);
      setStoredTheme(newTheme);
    });
  }
  
  // Event listeners para logos clicables - volver al inicio
  const clickableLogos = document.querySelectorAll('.clickable-logo');
  clickableLogos.forEach(logo => {
    logo.addEventListener('click', () => {
      // Si estamos en audiolibros o cómics, volver a la página principal
      if (window.location.pathname.includes('audiobooks') || window.location.pathname.includes('comics') || window.location.pathname.includes('books')) {
        window.location.href = '/';
      } else {
        // Si estamos en la página principal, mostrar menú de categorías
        showCategoryMenu();
      }
    });
  });
  
  console.log('✅ LecturAPP inicializada correctamente');
});

// Exportar funciones para debugging
window.lecturApp = {
  showLoginScreen,
  hideLoginScreen,
  showCategoryMenu,
  hideCategoryMenu,
  handleLogout,
  updateCategoryCounts
};