/**
 * Books Module
 * Single Responsibility: Handle books-specific functionality
 * Open/Closed Principle: Extensible for new book features
 */

import { contentService } from './content.js';
import { uiService } from './ui.js';
import { authService } from './auth.js';
import { navigationService } from './navigation.js';
import { storageService } from './storage.js';

export class BooksService {
  constructor() {
    this.currentFilter = null;
    this.booksInitialized = false;
  }

  /**
   * Initialize books interface
   */
  async init() {
    if (this.booksInitialized) return;
    
    console.log('📚 Inicializando interfaz de libros');
    
    // Show loader during initialization
    uiService.showLoading();
    
    try {
      // Only load book counts, NOT all books
      await contentService.loadAllContent();
      
      // Update UI counts
      this.updateBookCounts();
      this.generateAlphabetNavigation();
      
      // Show initial message, NO books loaded
      this.showInitialMessage();
      
      // Load user reading history only if authenticated
      const user = authService.getCurrentUser();
      if (user) {
        await this.loadReadingHistory();
      }
      
      this.booksInitialized = true;
      console.log('✅ Interfaz de libros completamente inicializada');
      
    } catch (error) {
      console.error('Error inicializando libros:', error);
    } finally {
      // Hide loader when everything is ready
      uiService.hideLoading();
    }
  }

  /**
   * Show initial message instead of loading all books
   */
  showInitialMessage() {
    const booksContainer = document.getElementById('books');
    const resultsContainer = document.getElementById('num-results');
    
    if (booksContainer) {
      booksContainer.innerHTML = '';
    }
    
    if (resultsContainer) {
      resultsContainer.textContent = '';
    }
  }

  /**
   * Update book counts in UI
   */
  updateBookCounts() {
    const counts = contentService.getContentCounts();
    
    uiService.setText('num-libros', counts.books);
    uiService.setText('num-autores', counts.authors);
    uiService.setText('header-num-libros', counts.books);
  }

  /**
   * Setup alphabet navigation (letters already in HTML)
   */
  generateAlphabetNavigation() {
    // Setup event listeners for existing letters in HTML
    const letterLinks = document.querySelectorAll('.letter-link');
    letterLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const letter = e.target.dataset.letter;
        this.filterBooksByLetter(letter);
        
        // Update active state
        letterLinks.forEach(l => l.classList.remove('active'));
        e.target.classList.add('active');
      });
    });
  }

  /**
   * Disable alphabet navigation during filtering
   */
  disableAlphabetNavigation() {
    const letterLinks = document.querySelectorAll('.letter-link');
    letterLinks.forEach(link => {
      link.style.pointerEvents = 'none';
      link.style.opacity = '0.5';
    });
  }

  /**
   * Enable alphabet navigation after filtering
   */
  enableAlphabetNavigation() {
    const letterLinks = document.querySelectorAll('.letter-link');
    letterLinks.forEach(link => {
      link.style.pointerEvents = 'auto';
      link.style.opacity = '1';
    });
  }

  /**
   * Filter books by letter
   */
  filterBooksByLetter(letter) {
    console.log(`🔍 Iniciando filtro por letra: ${letter}`);
    
    // Check if books interface is ready
    if (!this.booksInitialized) {
      console.warn('⚠️ Interfaz de libros no está lista aún');
      return;
    }
    
    // Mostrar loader inmediatamente y deshabilitar navegación
    uiService.showLoading();
    this.disableAlphabetNavigation();
    
    // Forzar actualización del DOM antes de continuar
    setTimeout(() => {
      try {
        console.log(`📚 Filtrando libros por letra ${letter}`);
        const startTime = performance.now();
        
        // Filtrar desde libros ya cargados en memoria
        const filteredBooks = contentService.filterByLetter(letter, 'books');
        
        const endTime = performance.now();
        console.log(`⚡ Filtrado completado en ${endTime - startTime} ms - ${filteredBooks.length} libros encontrados`);
        
        this.displayBooks(filteredBooks);
        this.currentFilter = { type: 'letter', value: letter };
        
      } catch (error) {
        console.error('❌ Error filtrando libros:', error);
      } finally {
        // Ocultar loader y rehabilitar navegación
        uiService.hideLoading();
        this.enableAlphabetNavigation();
      }
    }, 100); // Delay mínimo para que se vea el loader
  }

  /**
   * Search books by title
   */
  searchByTitle(query) {
    const filteredBooks = contentService.searchByTitle(query, 'books');
    this.displayBooks(filteredBooks);
    this.currentFilter = { type: 'search', value: query, searchType: 'title' };
  }

  /**
   * Search books by author
   */
  searchByAuthor(query) {
    const filteredBooks = contentService.searchByAuthor(query);
    this.displayBooks(filteredBooks);
    this.currentFilter = { type: 'search', value: query, searchType: 'author' };
  }

  /**
   * Display books in table format
   */
  displayBooks(books) {
    const booksContainer = document.getElementById('books');
    const resultsContainer = document.getElementById('num-results');
    
    if (!booksContainer) return;
    
    if (books.length === 0) {
      booksContainer.innerHTML = '<p class="no-results">No se encontraron libros</p>';
      if (resultsContainer) resultsContainer.textContent = 'No hay resultados';
      return;
    }
    
    if (resultsContainer) {
      resultsContainer.textContent = uiService.formatCount(books.length, 'libro encontrado', 'libros encontrados');
    }
    
    // Create table structure
    const tableHTML = `
      <table class="books-table">
        <thead>
          <tr>
            <th>Título</th>
            <th>Autor</th>
            <th>Formato</th>
            <th>Leer</th>
            <th>Info</th>
          </tr>
        </thead>
        <tbody>
          ${books.map(book => this.createBookRow(book)).join('')}
        </tbody>
      </table>
    `;
    
    booksContainer.innerHTML = tableHTML;
  }

  /**
   * Create book table row HTML
   */
  createBookRow(book) {
    const cleanTitle = this.extractCleanTitle(book);
    const author = this.extractAuthorFromFilename(book);
    const extension = book.split('.').pop().toUpperCase();
    
    return `
      <tr class="book-row" data-book="${book}">
        <td class="book-title clickable-title" data-book="${book}" title="Clic para leer">${cleanTitle}</td>
        <td class="book-author">${author}</td>
        <td class="book-format">
          <span class="format-badge format-${extension.toLowerCase()}">${extension}</span>
        </td>
        <td class="book-action">
          <button class="read-btn" data-book="${book}" title="Leer libro">📖 Leer</button>
        </td>
        <td class="book-action">
          <button class="info-btn" data-book="${book}" title="Ver información">ℹ️ Info</button>
        </td>
      </tr>
    `;
  }

  /**
   * Extract author from filename (enhanced heuristic)
   * Handles formats: TITULO_LIBRO-AUTOR_LIBRO.epub and TITULO_LIBRO-AUTOR_LIBRO-Otros.epub
   */
  extractAuthorFromFilename(filename) {
    console.log('🔍 Extrayendo autor de:', filename);
    
    // Remove extension first
    const withoutExt = filename.replace(/\.(epub|pdf)$/i, '');
    console.log('📄 Sin extensión:', withoutExt);
    
    // Pattern: "Title-Author" or "Title-Author-Otros"
    if (withoutExt.includes('-')) {
      const parts = withoutExt.split('-');
      console.log('📚 Partes encontradas:', parts);
      
      if (parts.length >= 2) {
        let authorPart = parts[parts.length - 1].replace(/_/g, ' ').trim();
        
        // Check if last part is "Otros"
        if (authorPart.toLowerCase() === 'otros' && parts.length >= 3) {
          // If last part is "Otros", combine author with "y otros"
          const actualAuthor = parts[parts.length - 2].replace(/_/g, ' ').trim();
          authorPart = `${actualAuthor} y otros`;
          console.log('🔄 Detectado "Otros", combinando:', authorPart);
        }
        
        console.log('👤 Autor extraído:', authorPart);
        return authorPart;
      }
    }
    
    // If no pattern found, return "Autor desconocido"
    console.log('❌ No se pudo extraer autor');
    return 'Autor desconocido';
  }

  /**
   * Extract clean title from filename (removing author part)
   * Handles formats: TITULO_LIBRO-AUTOR_LIBRO.epub and TITULO_LIBRO-AUTOR_LIBRO-Otros.epub
   */
  extractCleanTitle(filename) {
    console.log('🔍 Extrayendo título de:', filename);
    
    // Remove extension first
    const withoutExt = filename.replace(/\.(epub|pdf)$/i, '');
    console.log('📄 Sin extensión:', withoutExt);
    
    // Pattern: "Title-Author" or "Title-Author-Otros"
    if (withoutExt.includes('-')) {
      const parts = withoutExt.split('-');
      console.log('📚 Partes encontradas:', parts);
      
      if (parts.length >= 2) {
        let titlePartsCount = parts.length - 1; // By default, exclude last part (author)
        
        // Check if last part is "Otros"
        const lastPart = parts[parts.length - 1].replace(/_/g, ' ').trim();
        if (lastPart.toLowerCase() === 'otros' && parts.length >= 3) {
          // If last part is "Otros", exclude both "Otros" and the actual author
          titlePartsCount = parts.length - 2;
          console.log('🔄 Detectado "Otros", excluyendo 2 partes del final');
        }
        
        // Title is everything before the author part(s), convert _ to spaces
        const titleParts = parts.slice(0, titlePartsCount);
        const title = titleParts.join('-').replace(/_/g, ' ').trim();
        console.log('📖 Título extraído:', title);
        return title;
      }
    }
    
    // If no pattern found, return the whole cleaned name (convert _ to spaces)
    const cleanTitle = withoutExt.replace(/_/g, ' ').trim();
    console.log('📖 Título completo (sin guiones):', cleanTitle);
    return cleanTitle;
  }

  /**
   * Handle book click events
   */
  async handleBookClick(event) {
    try {
      const readBtn = event.target.closest('.read-btn');
      const infoBtn = event.target.closest('.info-btn');
      const titleCell = event.target.closest('.clickable-title');
      
      if (readBtn) {
        const bookPath = readBtn.dataset.book;
        await this.openBook(bookPath);
      } else if (infoBtn) {
        const bookPath = infoBtn.dataset.book;
        this.showBookInfo(bookPath);
      } else if (titleCell) {
        const bookPath = titleCell.dataset.book;
        await this.openBook(bookPath);
      }
    } catch (error) {
      console.error('❌ Error abriendo libro:', error);
    }
  }

  /**
   * Open book for reading
   */
  async openBook(bookPath, startChapter = 1) {
    try {
      const objectPath = `LIBROS/${bookPath}`;
      const bookUrl = await storageService.getSignedUrl(objectPath, 'book');
      
      // No sobrescribir progreso existente
      // this.saveToHistory(bookPath); // Comentado: el progreso se guarda al navegar
      
      // Open in reader
      const cleanTitle = uiService.cleanTitle(bookPath);
      const currentUser = authService.getCurrentUser();
      navigationService.openReader(bookUrl, cleanTitle, currentUser?.email, bookPath, startChapter);
    } catch (error) {
      console.error('❌ Error en openBook:', error);
      console.error('📍 Error stack:', error.stack);
    }
  }

  /**
   * Show book information modal
   */
  async showBookInfo(bookPath) {
    const cleanTitle = this.extractCleanTitle(bookPath);
    const author = this.extractAuthorFromFilename(bookPath);
    
    // Show modal with loading state
    uiService.setText('modal-title', cleanTitle);
    uiService.setText('modal-author', 'Cargando...');
    uiService.setText('modal-published', 'Cargando...');
    uiService.setText('modal-publisher', 'Cargando...');
    uiService.setText('modal-pages', 'Cargando...');
    uiService.setText('modal-language', 'Cargando...');
    uiService.setText('modal-rating', 'Cargando...');
    uiService.setText('modal-description-text', 'Cargando información del libro...');
    
    // Set placeholder cover
    const coverImg = document.getElementById('modal-cover');
    if (coverImg) {
      coverImg.src = '/images/book-placeholder.svg';
    }
    
    uiService.showModal('book-info-modal');
    
    // Fetch book info from Google Books API
    try {
      const bookInfo = await this.fetchBookInfoFromGoogle(cleanTitle);
      
      // Update modal with fetched information
      uiService.setText('modal-author', bookInfo.authors.join(', '));
      uiService.setText('modal-published', bookInfo.year);
      uiService.setText('modal-publisher', bookInfo.publisher || 'Desconocida');
      uiService.setText('modal-pages', bookInfo.pageCount ? `${bookInfo.pageCount} páginas` : 'Desconocido');
      uiService.setText('modal-language', bookInfo.language || 'Desconocido');
      uiService.setText('modal-rating', bookInfo.averageRating ? `${bookInfo.averageRating}/5 (${bookInfo.ratingsCount} valoraciones)` : 'Sin calificar');
      uiService.setText('modal-description-text', bookInfo.description);
      
      // Update cover if available
      if (coverImg && bookInfo.imageLinks && bookInfo.imageLinks.thumbnail) {
        coverImg.src = bookInfo.imageLinks.thumbnail.replace('http:', 'https:');
      }
      
    } catch (error) {
      console.error('Error fetching book info:', error);
      
      // Fallback to basic info
      uiService.setText('modal-author', author);
      uiService.setText('modal-published', 'Desconocida');
      uiService.setText('modal-publisher', 'Desconocida');
      uiService.setText('modal-pages', 'Desconocido');
      uiService.setText('modal-language', 'Desconocido');
      uiService.setText('modal-rating', 'Sin calificar');
      uiService.setText('modal-description-text', 'No se pudo obtener información adicional sobre este libro.');
    }
  }

  /**
   * Fetch book information from Google Books API
   */
  async fetchBookInfoFromGoogle(title) {
    const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes?q=';
    
    const response = await fetch(`${GOOGLE_BOOKS_API}${encodeURIComponent(title)}`);
    const data = await response.json();
    
    if (data?.items && data.items.length > 0) {
      const book = data.items[0].volumeInfo;
      return {
        title: book.title || title,
        authors: book.authors || ['Autor desconocido'],
        year: book.publishedDate ? book.publishedDate.split('-')[0] : 'Desconocida',
        description: book.description || 'No hay descripción disponible.',
        pageCount: book.pageCount || null,
        categories: book.categories || [],
        averageRating: book.averageRating || null,
        ratingsCount: book.ratingsCount || null,
        language: book.language || null,
        publisher: book.publisher || null,
        imageLinks: book.imageLinks || null,
        previewLink: book.previewLink || null,
        infoLink: book.infoLink || null
      };
    } else {
      // Return fallback data if no results found
      return {
        title: title,
        authors: ['Autor desconocido'],
        year: 'Desconocida',
        description: 'No se encontró información sobre este libro en Google Books.',
        pageCount: null,
        categories: [],
        averageRating: null,
        ratingsCount: null,
        language: null,
        publisher: null,
        imageLinks: null,
        previewLink: null,
        infoLink: null
      };
    }
  }

  /**
   * Close book info modal
   */
  closeBookInfoModal() {
    uiService.hideModal('book-info-modal');
  }

  /**
   * Close reader modal
   */
  closeReaderModal() {
    uiService.hideModal('epub-reader-modal');
    
    // Clear the viewer content to stop any ongoing loading
    const epubViewer = document.getElementById('epub-viewer');
    if (epubViewer) {
      epubViewer.innerHTML = `
        <div id="epub-loading" class="epub-loading">
          <div class="loader"></div>
          <p>Cargando libro...</p>
        </div>
      `;
    }
    
    // Reload reading history to show updated progress
    this.loadReadingHistory();
  }

  /**
   * Save book to reading history
   */
  async saveToHistory(bookPath) {
    const user = authService.getCurrentUser();
    if (!user) return;
    
    try {
      const cleanTitle = this.extractCleanTitle(bookPath);
      const author = this.extractAuthorFromFilename(bookPath);
      
      await contentService.saveProgress(
        user.email,
        bookPath,
        cleanTitle,
        author,
        1, // Current chapter
        1, // Total chapters
        'book'
      );
      
      console.log('Libro guardado en historial:', bookPath);
      await this.loadReadingHistory();
    } catch (error) {
      console.error('Error guardando en historial:', error);
    }
  }

  /**
   * Load reading history
   */
  async loadReadingHistory() {
    const user = authService.getCurrentUser();
    if (!user) return;
    
    try {
      const history = await contentService.getHistory(user.email);
      this.displayReadingHistory(history);
      console.log(`📚 Historial cargado: ${history.length} libros`);
    } catch (error) {
      console.error('❌ Error cargando historial:', error);
    }
  }

  /**
   * Display reading history
   */
  displayReadingHistory(history) {
    const historyList = document.getElementById('history-list');
    const historyCount = document.getElementById('history-count');
    const historySection = document.getElementById('reading-history');
    
    if (!historyList || !historyCount || !historySection) return;
    
    // Check if history is an array or object and handle accordingly
    let historyArray;
    if (Array.isArray(history)) {
      // If it's an array from Firebase, filter out invalid entries
      historyArray = history.filter(item => item && item.bookPath && typeof item.bookPath === 'string');
    } else {
      // If it's an object (old format), convert to array
      historyArray = Object.entries(history).map(([bookId, bookData]) => bookData);
    }
    
    // Limit to 10 items
    historyArray = historyArray.slice(0, 10);
    historyCount.textContent = historyArray.length;
    
    if (historyArray.length === 0) {
      historySection.style.display = 'none';
      return;
    }
    
    historySection.style.display = 'block';
    
    historyList.innerHTML = historyArray.map(bookData => {
      // Validate bookData has required fields
      if (!bookData.bookPath || typeof bookData.bookPath !== 'string') {
        console.warn('Invalid book data in history:', bookData);
        return ''; // Skip invalid entries
      }
      
      return `
        <div class="history-item">
          <div class="history-info">
            <div class="history-title">${bookData.title ? decodeURIComponent(bookData.title) : uiService.cleanTitle(bookData.bookPath)}</div>
            <div class="history-author">${bookData.author ? decodeURIComponent(bookData.author) : 'Autor desconocido'}</div>
            <div class="history-progress">
              ${bookData.progress ? `${bookData.progress}%` : `Capítulo ${bookData.currentChapter || 1}`}
              ${bookData.lastRead ? ` • ${new Date(bookData.lastRead).toLocaleDateString()}` : ''}
            </div>
          </div>
          <div class="history-actions">
            <button class="continue-btn" data-book="${bookData.bookPath}" data-chapter="${bookData.currentChapter || 1}" title="Continuar leyendo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5,3 19,12 5,21"/>
              </svg>
            </button>
            <button class="remove-btn" data-book="${bookData.bookPath}" title="Eliminar del historial">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3,6 5,6 21,6"></polyline>
                <path d="m19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).filter(html => html !== '').join(''); // Remove empty entries
    
    // Setup continue reading buttons
    historyList.querySelectorAll('.continue-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const bookPath = btn.dataset.book;
        const chapter = parseInt(btn.dataset.chapter) || 1;
        await this.openBook(bookPath, chapter);
      });
    });

    // Setup remove buttons
    historyList.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const bookPath = btn.dataset.book;
        this.removeFromHistory(bookPath);
      });
    });
  }

  /**
   * Remove book from reading history
   */
  async removeFromHistory(bookPath) {
    const user = authService.getCurrentUser();
    if (!user) return;

    try {
      console.log('🗑️ Eliminando del historial:', bookPath);
      console.log('👤 Usuario:', user.email);
      
      // Import the remove function from firebase-config
      const { removeFromHistoryFirebase } = await import('../firebase-config.js');
      
      // Encode bookPath to match the ID used when saving
      const bookId = btoa(bookPath);
      const result = await removeFromHistoryFirebase(user.email, bookId);
      console.log('📡 Resultado de eliminación:', result);
      console.log('✅ Libro eliminado del historial Firebase:', bookPath);
      
      // Immediately update UI by removing the item
      console.log('🔄 Actualizando UI inmediatamente...');
      this.removeBookFromHistoryUI(bookPath);
      
      // Also reload from Firebase to ensure consistency
      setTimeout(async () => {
        console.log('🔄 Recargando desde Firebase para verificar...');
        await this.loadReadingHistory();
        console.log('✅ Historial verificado desde Firebase');
      }, 1000);
      
    } catch (error) {
      console.error('❌ Error eliminando del historial:', error);
      console.error('❌ Detalles del error:', error.message, error.stack);
    }
  }

  /**
   * Remove book from history UI immediately (optimistic update)
   */
  removeBookFromHistoryUI(bookPath) {
    const historyList = document.getElementById('history-list');
    const historyCount = document.getElementById('history-count');
    const historySection = document.getElementById('reading-history');
    
    if (!historyList) return;
    
    // Find and remove the history item
    const historyItems = historyList.querySelectorAll('.history-item');
    let itemFound = false;
    
    historyItems.forEach(item => {
      const continueBtn = item.querySelector('.continue-btn');
      const removeBtn = item.querySelector('.remove-btn');
      
      if (continueBtn && continueBtn.dataset.book === bookPath) {
        console.log('🗑️ Eliminando item de UI:', bookPath);
        item.remove();
        itemFound = true;
      }
    });
    
    if (itemFound) {
      // Update count
      const remainingItems = historyList.querySelectorAll('.history-item').length;
      if (historyCount) {
        historyCount.textContent = remainingItems;
      }
      
      // Hide section if no items left
      if (remainingItems === 0 && historySection) {
        historySection.style.display = 'none';
      }
      
      console.log('✅ UI actualizada, elementos restantes:', remainingItems);
    } else {
      console.warn('⚠️ No se encontró el elemento en UI:', bookPath);
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Search inputs
    const searchByTitle = document.getElementById('search-by-title');
    const searchByAutor = document.getElementById('search-by-autor');
    
    if (searchByTitle) {
      searchByTitle.addEventListener('input', (e) => {
        this.searchByTitle(e.target.value);
      });
    }
    
    if (searchByAutor) {
      searchByAutor.addEventListener('input', (e) => {
        this.searchByAuthor(e.target.value);
      });
    }
    
    // Books container clicks
    const booksContainer = document.getElementById('books');
    if (booksContainer) {
      booksContainer.addEventListener('click', this.handleBookClick.bind(this));
    }
    
    // Modal close
    const closeModal = document.getElementById('close-modal');
    if (closeModal) {
      closeModal.addEventListener('click', this.closeBookInfoModal.bind(this));
    }
    
    const modal = document.getElementById('book-info-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target.id === 'book-info-modal') {
          this.closeBookInfoModal();
        }
      });
    }

    // Reader modal close
    const closeReader = document.getElementById('close-reader');
    if (closeReader) {
      closeReader.addEventListener('click', this.closeReaderModal.bind(this));
    }

    const readerModal = document.getElementById('epub-reader-modal');
    if (readerModal) {
      readerModal.addEventListener('click', (e) => {
        if (e.target.id === 'epub-reader-modal') {
          this.closeReaderModal();
        }
      });
    }
  }
}

// Create and export singleton instance
export const booksService = new BooksService();
