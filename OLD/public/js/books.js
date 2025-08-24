/**
 * Aplicación de libros para LecturAPP
 * Gestiona la biblioteca de libros EPUB con Firebase Realtime Database
 */

import { 
  getBooksNamesList, 
  getAutorsNamesList, 
  getAutorsBooks, 
  auth, 
  isUserAuthorized,
  signOut,
  saveReadingProgressToFirebase,
  getReadingHistoryFromFirebase
} from './firebase-config.js';

// Variables globales
let currentUser = null;
let allBooks = [];
let autorsNamesList = [];
let autorsBooks = {};
let currentFilter = null;
let booksInitialized = false;

// Detectar usuario actual
auth.onAuthStateChanged(async (user) => {
  console.log('Estado de auth cambió:', user ? user.email : 'No autenticado');
  
  if (user) {
    // Usuario logueado, verificar autorización
    try {
      const isAuthorized = await isUserAuthorized(user.email);
      if (isAuthorized) {
        currentUser = user;
        
        // Actualizar info del usuario
        const userEmailElement = document.getElementById('user-email');
        if (userEmailElement) {
          userEmailElement.textContent = user.email;
        }
        
        // Inicializar la aplicación de libros
        await initializeBooksApp();
      } else {
        console.log('Usuario no autorizado:', user.email);
        await signOut();
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Error verificando autorización:', error);
      window.location.href = '/';
    }
  } else {
    // Usuario no logueado, redirigir
    window.location.href = '/';
  }
});

/**
 * Inicializar aplicación de libros
 */
const initializeBooksApp = async () => {
  try {
    console.log('📊 Inicializando aplicación de libros');
    
    const [booksNameList, _autorsNameList, _autorsBooks] = await Promise.all([
      getBooksNamesList().catch(() => []),
      getAutorsNamesList().catch(() => []),
      getAutorsBooks().catch(() => ({}))
    ]);

    allBooks = booksNameList;
    autorsNamesList = _autorsNameList;
    autorsBooks = _autorsBooks;

    console.log(`📚 Libros cargados: ${allBooks.length}`);
    console.log(`👨‍💼 Autores cargados: ${autorsNamesList.length}`);

    // Actualizar contadores en la UI
    updateBookCounts();
    
    // Generar navegación alfabética
    generateAlphabetNavigation();
    
    // Mostrar todos los libros inicialmente
    displayBooks(allBooks);
    
    // Cargar historial de lectura
    loadReadingHistory();
    
    booksInitialized = true;
    
  } catch (error) {
    console.error('Error inicializando aplicación de libros:', error);
  }
};

/**
 * Actualizar contadores de libros y autores
 */
const updateBookCounts = () => {
  const numLibrosElement = document.getElementById('num-libros');
  const numAutoresElement = document.getElementById('num-autores');
  const headerNumLibrosElement = document.getElementById('header-num-libros');
  
  if (numLibrosElement) numLibrosElement.textContent = allBooks.length;
  if (numAutoresElement) numAutoresElement.textContent = autorsNamesList.length;
  if (headerNumLibrosElement) headerNumLibrosElement.textContent = allBooks.length;
};

/**
 * Generar navegación alfabética
 */
const generateAlphabetNavigation = () => {
  const alphabetContainer = document.getElementById('alphabet-letters');
  if (!alphabetContainer) return;
  
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  
  alphabetContainer.innerHTML = letters.map(letter => 
    `<button class="alphabet-btn" data-letter="${letter}">${letter}</button>`
  ).join('');
  
  // Event listeners para navegación alfabética
  document.querySelectorAll('.alphabet-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const letter = e.target.dataset.letter;
      filterBooksByLetter(letter);
      
      // Actualizar botón activo
      document.querySelectorAll('.alphabet-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    });
  });
};

/**
 * Filtrar libros por letra
 */
const filterBooksByLetter = (letter) => {
  if (letter === 'all') {
    displayBooks(allBooks);
    currentFilter = null;
  } else {
    const filteredBooks = allBooks.filter(book => 
      book.toUpperCase().startsWith(letter)
    );
    displayBooks(filteredBooks);
    currentFilter = { type: 'letter', value: letter };
  }
};

/**
 * Mostrar libros en la grid
 */
const displayBooks = (books) => {
  const booksContainer = document.getElementById('books');
  const resultsContainer = document.getElementById('num-results');
  
  if (!booksContainer) return;
  
  if (books.length === 0) {
    booksContainer.innerHTML = '<p class="no-results">No se encontraron libros</p>';
    resultsContainer.textContent = 'No hay resultados';
    return;
  }
  
  resultsContainer.textContent = `${books.length} libro${books.length !== 1 ? 's' : ''} encontrado${books.length !== 1 ? 's' : ''}`;
  
  booksContainer.innerHTML = books.map(book => {
    const cleanBookName = book.replace(/_/g, ' ').replace('.epub', '').replace('.pdf', '');
    const cleanBookTitle = book.replace(/[^a-zA-Z0-9-_\s$]/g, "");
    
    return `
      <div class="book-item" data-book="${book}">
        <div class="book-info">
          <h3 class="book-title">${cleanBookName}</h3>
          <div class="book-actions">
            <button class="read-btn" data-book="${book}">📖 Leer</button>
            <button class="info-btn" data-book="${book}">ℹ️ Info</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
};

/**
 * Manejar clicks en libros
 */
const handleBookClick = (e) => {
  const readBtn = e.target.closest('.read-btn');
  const infoBtn = e.target.closest('.info-btn');
  
  if (readBtn) {
    const bookPath = readBtn.dataset.book;
    openBook(bookPath);
  } else if (infoBtn) {
    const bookPath = infoBtn.dataset.book;
    showBookInfo(bookPath);
  }
};

/**
 * Abrir libro para lectura
 */
const openBook = (bookPath, startChapter = 1) => {
  console.log('Abriendo libro:', bookPath, 'Capítulo:', startChapter);
  
  // Construir URL del libro usando Nginx
  const bookUrl = `https://storage.lecturapp.es/LIBROS/${encodeURIComponent(bookPath)}`;
  
  // Solo agregar al historial si es la primera vez (sin sobrescribir progreso)
  // saveToHistory(bookPath); // Comentado: no sobrescribir progreso existente
  
  // Abrir en nueva ventana/pestaña para lectura
  window.open(`/reader?book=${encodeURIComponent(bookUrl)}&title=${encodeURIComponent(bookPath)}&chapter=${startChapter}`, '_blank');
};

/**
 * Mostrar información del libro
 */
const showBookInfo = async (bookPath) => {
  const modal = document.getElementById('book-info-modal');
  if (!modal) return;
  
  // Datos básicos del libro
  const cleanTitle = bookPath.replace(/_/g, ' ').replace('.epub', '').replace('.pdf', '');
  
  document.getElementById('modal-title').textContent = cleanTitle;
  document.getElementById('modal-author').textContent = 'Autor desconocido';
  document.getElementById('modal-published').textContent = 'Desconocida';
  document.getElementById('modal-publisher').textContent = 'Desconocida';
  document.getElementById('modal-pages').textContent = 'Desconocido';
  document.getElementById('modal-language').textContent = 'Desconocido';
  document.getElementById('modal-rating').textContent = 'Sin calificar';
  document.getElementById('modal-description-text').textContent = 'No hay descripción disponible.';
  
  // Placeholder para la portada
  document.getElementById('modal-cover').src = '/images/book-placeholder.svg';
  
  modal.classList.remove('hidden');
};

/**
 * Cerrar modal de información
 */
const closeBookInfoModal = () => {
  const modal = document.getElementById('book-info-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
};

/**
 * Guardar libro en historial de lectura
 */
const saveToHistory = async (bookPath) => {
  if (!currentUser) return;
  
  try {
    const cleanTitle = bookPath.replace(/_/g, ' ').replace('.epub', '').replace('.pdf', '');
    
    await saveReadingProgressToFirebase(
      currentUser.email,
      bookPath,
      cleanTitle,
      'Autor desconocido',
      1, // Capítulo actual
      1  // Total de capítulos
    );
    
    console.log('Libro guardado en historial:', bookPath);
    loadReadingHistory();
  } catch (error) {
    console.error('Error guardando en historial:', error);
  }
};

/**
 * Cargar historial de lectura
 */
const loadReadingHistory = async () => {
  console.log('📚 [Legacy] Cargando historial de lectura...');
  if (!currentUser) {
    console.log('❌ [Legacy] No hay usuario autenticado');
    return;
  }
  
  try {
    const history = await getReadingHistoryFromFirebase(currentUser.email);
    const historyList = document.getElementById('history-list');
    const historyCount = document.getElementById('history-count');
    const historySection = document.getElementById('reading-history');
    
    if (!historyList || !historyCount || !historySection) return;
    
    // history ya es un array desde getReadingHistoryFromFirebase
    const historyArray = history.slice(0, 10);
    historyCount.textContent = historyArray.length;
    
    if (historyArray.length === 0) {
      historySection.style.display = 'none';
      return;
    }
    
    historySection.style.display = 'block';
    
    historyList.innerHTML = historyArray.map((bookData) => {
      const progressText = bookData.progress ? `${bookData.progress}%` : `Cap. ${bookData.currentChapter || 1}`;
      const lastReadDate = bookData.lastRead ? new Date(bookData.lastRead).toLocaleDateString() : '';
      
      return `
        <div class="history-item">
          <div class="history-info">
            <div class="history-title">${bookData.title || bookData.bookPath.replace(/_/g, ' ')}</div>
            <div class="history-author">${bookData.author || 'Autor desconocido'}</div>
            <div class="history-progress">
              <span class="progress-text">${progressText}</span>
              ${lastReadDate ? `<span class="last-read">• ${lastReadDate}</span>` : ''}
            </div>
          </div>
          <button class="continue-btn" data-book="${bookData.bookPath}" data-chapter="${bookData.currentChapter || 1}" title="Continuar leyendo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          </button>
        </div>
      `;
    }).join('');
    
    // Event listeners para continuar leyendo
    // COMENTADO: La página usa el sistema de módulos, no el legacy
    // historyList.querySelectorAll('.continue-btn').forEach(btn => {
    //   btn.addEventListener('click', (e) => {
    //     e.stopPropagation();
    //     const bookPath = btn.dataset.book;
    //     const chapter = parseInt(btn.dataset.chapter) || 1;
    //     openBook(bookPath, chapter);
    //   });
    // });
    
    console.log(`✅ [Legacy] Historial cargado: ${historyArray.length} libros`);
    
  } catch (error) {
    console.error('❌ [Legacy] Error cargando historial:', error);
  }
};

/**
 * Buscar libros
 */
const searchBooks = (query, type = 'title') => {
  if (!query.trim()) {
    displayBooks(allBooks);
    return;
  }
  
  const normalizedQuery = query.toLowerCase();
  let filteredBooks = [];
  
  if (type === 'title') {
    filteredBooks = allBooks.filter(book => 
      book.toLowerCase().includes(normalizedQuery)
    );
  } else if (type === 'author') {
    // Buscar por autor en los datos de autores
    const matchingAuthors = autorsNamesList.filter(author => 
      author.toLowerCase().includes(normalizedQuery)
    );
    
    // Obtener libros de esos autores
    filteredBooks = [];
    matchingAuthors.forEach(author => {
      if (autorsBooks[author]) {
        filteredBooks.push(...autorsBooks[author]);
      }
    });
    
    // Eliminar duplicados
    filteredBooks = [...new Set(filteredBooks)];
  }
  
  displayBooks(filteredBooks);
  currentFilter = { type: 'search', value: query, searchType: type };
};

/**
 * Manejar logout
 */
const handleLogout = async () => {
  try {
    await signOut();
    localStorage.removeItem('lectur-app-auth-state');
    window.location.href = '/';
  } catch (error) {
    console.error('Error en logout:', error);
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
  // Inicializar tema
  initializeTheme();
  
  // Event listeners para búsqueda
  const searchByTitle = document.getElementById('search-by-title');
  const searchByAutor = document.getElementById('search-by-autor');
  const searchForm = document.getElementById('search');
  
  if (searchByTitle) {
    searchByTitle.addEventListener('input', (e) => {
      searchBooks(e.target.value, 'title');
    });
  }
  
  if (searchByAutor) {
    searchByAutor.addEventListener('input', (e) => {
      searchBooks(e.target.value, 'author');
    });
  }
  
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const titleQuery = searchByTitle?.value || '';
      const authorQuery = searchByAutor?.value || '';
      
      if (titleQuery) {
        searchBooks(titleQuery, 'title');
      } else if (authorQuery) {
        searchBooks(authorQuery, 'author');
      }
    });
  }
  
  // Event listeners para libros
  const booksContainer = document.getElementById('books');
  if (booksContainer) {
    booksContainer.addEventListener('click', handleBookClick);
  }
  
  // Event listeners para botones de header
  const backToMenuBtn = document.getElementById('back-to-menu');
  if (backToMenuBtn) {
    backToMenuBtn.addEventListener('click', () => {
      window.location.href = '/';
    });
  }
  
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
  
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = getCurrentTheme();
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      applyTheme(newTheme);
      setStoredTheme(newTheme);
    });
  }
  
  // Event listener para logo clicable
  const clickableLogo = document.querySelector('.clickable-logo');
  if (clickableLogo) {
    clickableLogo.addEventListener('click', () => {
      window.location.href = '/';
    });
  }
  
  // Event listeners para modal
  const modal = document.getElementById('book-info-modal');
  const closeModal = document.getElementById('close-modal');
  
  if (closeModal) {
    closeModal.addEventListener('click', closeBookInfoModal);
  }
  
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'book-info-modal') {
        closeBookInfoModal();
      }
    });
  }
});

// Exportar para debugging
window.booksApp = {
  searchBooks,
  filterBooksByLetter,
  openBook,
  showBookInfo
};