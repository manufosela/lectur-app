/**
 * Navigation Module
 * Single Responsibility: Handle navigation between pages and sections
 */

import { saveReadingProgressToFirebase } from '../firebase-config.js';

export class NavigationService {
  constructor() {
    this.currentPage = this.getCurrentPage();
  }

  /**
   * Get current page from URL
   */
  getCurrentPage() {
    const path = window.location.pathname;
    if (path === '/') return 'home';
    if (path.includes('/books')) return 'books';
    if (path.includes('/audiobooks')) return 'audiobooks';
    if (path.includes('/comics')) return 'comics';
    return 'unknown';
  }

  /**
   * Navigate to home page
   */
  goToHome() {
    window.location.href = '/';
  }

  /**
   * Navigate to books page
   */
  goToBooks() {
    window.location.href = '/books';
  }

  /**
   * Navigate to audiobooks page
   */
  goToAudiobooks() {
    window.location.href = '/audiobooks';
  }

  /**
   * Navigate to comics page
   */
  goToComics() {
    window.location.href = '/comics';
  }

  /**
   * Open EPUB reader in modal
   */
  openReader(contentUrl, title, userEmail = null, bookPath = null, startChapter = 1) {
    // Import UI service and open modal
    import('./ui.js').then(({ uiService }) => {
      this.openEpubModal(contentUrl, title, userEmail, bookPath, startChapter);
    });
  }

  /**
   * Open EPUB reader modal
   */
  openEpubModal(contentUrl, title, userEmail = null, bookPath = null, startChapter = 1) {
    const modal = document.getElementById('epub-reader-modal');
    const readerTitle = document.getElementById('reader-title');
    const epubViewer = document.getElementById('epub-viewer');
    const epubLoading = document.getElementById('epub-loading');
    
    if (!modal || !readerTitle || !epubViewer) {
      console.error('Modal elements not found');
      return;
    }

    // Set title using clean title extraction
    const cleanTitle = this.extractCleanTitle(title);
    readerTitle.textContent = cleanTitle;
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Show loading
    epubLoading.style.display = 'block';
    
    // Load EPUB
    this.loadEpub(contentUrl, epubViewer, epubLoading, userEmail, bookPath, startChapter);
  }

  /**
   * Load EPUB content using JSZip
   */
   async loadEpub(contentUrl, viewer, loading, userEmail = null, bookPath = null, startChapter = 1) {
    try {
      console.log('🔄 Cargando EPUB:', contentUrl);
      
      // Extract book path from URL if not provided
      const extractedPath = contentUrl.split('/').pop();
      const finalBookPath = bookPath || extractedPath;
      console.log('📁 Ruta del libro:', finalBookPath);
      
      // Use Cloud Function to download EPUB (handles CORS)
      const cloudFunctionUrl = `https://europe-west1-lectur-app.cloudfunctions.net/downloadFile?fileName=${encodeURIComponent(finalBookPath)}`;
      console.log('☁️ Usando Cloud Function:', cloudFunctionUrl);
      
      const response = await fetch(cloudFunctionUrl, {
        method: "GET",
        headers: {
          'Accept': 'application/octet-stream, application/epub+zip, */*'
        }
      });
      
      console.log('📡 Response status:', response.status);
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error response body:', errorText);
        throw new Error(`Error HTTP ${response.status} en Cloud Function: ${errorText}`);
      }
      
      const blob = await response.blob();
      console.log('📦 EPUB descargado vía Cloud Function, procesando...');
      
      // Process EPUB with JSZip
      const zip = new JSZip();
      const epubData = await zip.loadAsync(blob);
      
      // Extract images
      const epubImages = {};
      await this.extractEpubImages(epubData, epubImages);
      
      // Read container.xml
      const containerXml = await epubData.file('META-INF/container.xml').async('text');
      const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');
      const opfPath = containerDoc.querySelector('rootfile').getAttribute('full-path');
      
      // Read OPF file
      const opfContent = await epubData.file(opfPath).async('text');
      const opfDoc = new DOMParser().parseFromString(opfContent, 'text/xml');
      
      // Get book info - use filename extraction for author
      const epubTitle = opfDoc.querySelector('title')?.textContent || 'Libro sin título';
      const epubAuthor = opfDoc.querySelector('creator')?.textContent || 'Autor desconocido';
      
      // Extract title and author from filename (more reliable)
      const filename = contentUrl.split('/').pop();
      const cleanTitle = this.extractCleanTitle(filename);
      const filenameAuthor = this.extractAuthorFromFilename(filename);
      
      // Use filename extraction if available, fallback to EPUB metadata
      const title = cleanTitle || epubTitle;
      const author = filenameAuthor !== 'Autor desconocido' ? filenameAuthor : epubAuthor;
      
      // Get chapter order from spine
      const spineItems = Array.from(opfDoc.querySelectorAll('spine itemref'));
      const manifest = opfDoc.querySelectorAll('manifest item');
      
      // Create ID to href map
      const idToHref = {};
      manifest.forEach(item => {
        idToHref[item.getAttribute('id')] = item.getAttribute('href');
      });
      
      // Load chapters
      const basePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
      const chapters = [];
      
      for (const spineItem of spineItems) {
        const idref = spineItem.getAttribute('idref');
        const href = idToHref[idref];
        if (href) {
          const chapterPath = basePath + href;
          try {
            const chapterContent = await epubData.file(chapterPath).async('text');
            chapters.push({
              title: `Capítulo ${chapters.length + 1}`,
              content: this.processEpubContent(chapterContent, epubImages)
            });
          } catch (e) {
            console.warn('No se pudo cargar capítulo:', chapterPath);
          }
        }
      }
      
      console.log(`📚 EPUB procesado: ${chapters.length} capítulos`);
      
      // Hide loading and display reader with proper chapter
      loading.style.display = 'none';
      this.displayEpubReader(viewer, chapters, title, author, userEmail, finalBookPath, startChapter);
      
      // Save to history if it's a new book
      if (userEmail && finalBookPath) {
        this.saveInitialProgress(userEmail, finalBookPath, title, chapters.length);
      }
      
    } catch (error) {
      console.error('❌ Error cargando EPUB:', error);
      loading.innerHTML = '<p>Error al cargar el libro: ' + error.message + '</p>';
    }
  }

  /**
   * Extract images from EPUB
   */
  async extractEpubImages(epubData, epubImages) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
    
    for (const [filename, file] of Object.entries(epubData.files)) {
      const isImage = imageExtensions.some(ext => 
        filename.toLowerCase().endsWith(ext)
      );
      
      if (isImage && !file.dir) {
        try {
          const blob = await file.async('blob');
          const dataUrl = await this.blobToDataUrl(blob);
          const shortName = filename.split('/').pop();
          epubImages[filename] = dataUrl;
          epubImages[shortName] = dataUrl;
          epubImages[filename.replace(/^.*\//, '')] = dataUrl;
        } catch (e) {
          console.warn('No se pudo extraer imagen:', filename);
        }
      }
    }
  }

  /**
   * Convert blob to data URL
   */
  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Process EPUB content
   */
  processEpubContent(htmlContent, epubImages) {
    let cleanContent = htmlContent
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/style\s*=\s*["'][^"']*color\s*:[^;"']*["']/gi, '')
      .replace(/color\s*:\s*[^;"]*/gi, '');
    
    // Replace image references
    cleanContent = cleanContent.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, (match, src) => {
      const imageName = src.split('/').pop();
      const possiblePaths = [src, imageName, '../Images/' + imageName, 'Images/' + imageName];
      
      for (const path of possiblePaths) {
        if (epubImages[path]) {
          return match.replace(src, epubImages[path]);
        }
      }
      
      return match.replace(/src="[^"]*"/, 'style="display:none"');
    });
    
    return cleanContent;
  }

  /**
   * Display EPUB reader interface
   */
  displayEpubReader(viewer, chapters, title, author, userEmail = null, bookPath = null, startChapter = 1) {
    this.currentChapters = chapters;
    this.currentChapterIndex = Math.max(0, Math.min(startChapter - 1, chapters.length - 1));
    this.currentUserEmail = userEmail;
    this.currentBookPath = bookPath;
    
    viewer.innerHTML = `
      <div class="epub-reader">
        <div class="epub-header">
          <div class="epub-navigation">
            <button id="epub-prev" class="epub-nav-btn" ${chapters.length <= 1 ? 'disabled' : ''}>‹ Anterior</button>
            <span id="epub-page-info">${this.currentChapterIndex + 1} / ${chapters.length}</span>
            <button id="epub-next" class="epub-nav-btn" ${chapters.length <= 1 ? 'disabled' : ''}>Siguiente ›</button>
          </div>
        </div>
        <div id="epub-content" class="epub-content">
          ${chapters[this.currentChapterIndex]?.content || '<p>No hay contenido disponible</p>'}
        </div>
      </div>
    `;
    
    // Setup navigation
    this.setupEpubNavigation(viewer, this.currentUserEmail, this.currentBookPath, title);
    
    // Save initial reading progress for current chapter
    if (this.currentUserEmail && this.currentBookPath && title) {
      this.saveReadingProgress(this.currentUserEmail, this.currentBookPath, title, this.currentChapterIndex + 1, chapters.length);
    }
  }

  /**
   * Extract author from filename (same logic as books.js)
   */
  extractAuthorFromFilename(filename) {
    // Decode URL-encoded characters first
    const decoded = decodeURIComponent(filename);
    
    // Remove extension
    const withoutExt = decoded.replace(/\.(epub|pdf)$/i, '');
    
    // Pattern: "Title-Author-Category" or "Title-Author"
    if (withoutExt.includes('-')) {
      const parts = withoutExt.split('-');
      
      if (parts.length >= 2) {
        // For "Zac_y_Mia-A_J_Betts- Otros", we want "A_J_Betts"
        // Skip the last part if it's generic (like " Otros")
        let authorIndex = parts.length - 1;
        if (parts[authorIndex].trim().toLowerCase().includes('otros')) {
          authorIndex = parts.length - 2;
        }
        
        if (authorIndex >= 1) {
          const author = parts[authorIndex].replace(/_/g, ' ').trim();
          return author;
        }
      }
    }
    
    // If no pattern found, return "Autor desconocido"
    return 'Autor desconocido';
  }

  /**
   * Extract clean title from filename (same logic as books.js)
   */
  extractCleanTitle(filename) {
    // Decode URL-encoded characters first
    const decoded = decodeURIComponent(filename);
    
    // Remove extension
    const withoutExt = decoded.replace(/\.(epub|pdf)$/i, '');
    
    // Pattern: "Title-Author-Category" (take title and author, skip category)
    if (withoutExt.includes('-')) {
      const parts = withoutExt.split('-');
      
      if (parts.length >= 2) {
        // Skip last part if it's generic (like "Otros")
        let titleParts;
        if (parts[parts.length - 1].trim().toLowerCase().includes('otros')) {
          // Skip both author and category, take only title
          titleParts = parts.slice(0, -2);
        } else {
          // Take title and author, skip category if exists
          titleParts = parts.slice(0, -1);
        }
        
        if (titleParts.length > 0) {
          const title = titleParts.join('-').replace(/_/g, ' ').trim();
          return title;
        }
      }
    }
    
    // If no pattern found, return the whole cleaned name (convert _ to spaces)
    const cleanTitle = withoutExt.replace(/_/g, ' ').trim();
    return cleanTitle;
  }

  /**
   * Setup EPUB navigation
   */
  setupEpubNavigation(viewer, userEmail = null, bookPath = null, bookTitle = null) {
    const prevBtn = viewer.querySelector('#epub-prev');
    const nextBtn = viewer.querySelector('#epub-next');
    const pageInfo = viewer.querySelector('#epub-page-info');
    const content = viewer.querySelector('#epub-content');
    
    const updateChapter = (index) => {
      if (index >= 0 && index < this.currentChapters.length) {
        this.currentChapterIndex = index;
        
        // Sanitizar el contenido HTML del EPUB
        let chapterContent = this.currentChapters[index].content;
        
        // Remover referencias a archivos CSS externos que pueden no existir
        chapterContent = chapterContent.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '');
        
        // Remover referencias a imágenes que pueden no existir
        chapterContent = chapterContent.replace(/<img[^>]*src=["'](?!data:|https?:|\/\/)[^"']*["'][^>]*>/gi, '');
        
        content.innerHTML = chapterContent;
        pageInfo.textContent = `${index + 1} / ${this.currentChapters.length}`;
        
        prevBtn.disabled = index === 0;
        nextBtn.disabled = index === this.currentChapters.length - 1;
        
        content.scrollTop = 0;
        
        // Guardar progreso de lectura si tenemos los datos del usuario y libro
        if (userEmail && bookPath && bookTitle) {
          this.saveReadingProgress(userEmail, bookPath, bookTitle, index + 1, this.currentChapters.length);
        }
      }
    };
    
    prevBtn.addEventListener('click', () => {
      if (this.currentChapterIndex > 0) {
        updateChapter(this.currentChapterIndex - 1);
      }
    });
    
    nextBtn.addEventListener('click', () => {
      if (this.currentChapterIndex < this.currentChapters.length - 1) {
        updateChapter(this.currentChapterIndex + 1);
      }
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (viewer.closest('.modal').classList.contains('hidden')) return;
      
      if (e.key === 'ArrowLeft' && this.currentChapterIndex > 0) {
        updateChapter(this.currentChapterIndex - 1);
      } else if (e.key === 'ArrowRight' && this.currentChapterIndex < this.currentChapters.length - 1) {
        updateChapter(this.currentChapterIndex + 1);
      }
    });
  }

  /**
   * Save reading progress to Firebase
   */
  async saveReadingProgress(userEmail, bookPath, bookTitle, currentChapter, totalChapters) {
    try {
      await saveReadingProgressToFirebase(
        userEmail,
        bookPath,
        bookTitle,
        'Autor desconocido', // TODO: Extraer autor real del EPUB
        currentChapter,
        totalChapters
      );
      console.log(`📖 Progreso guardado: ${bookTitle} - Cap. ${currentChapter}/${totalChapters}`);
    } catch (error) {
      console.error('❌ Error guardando progreso:', error);
    }
  }

  /**
   * Save initial reading progress if book not in history
   */
  async saveInitialProgress(userEmail, bookPath, bookTitle, totalChapters) {
    if (!userEmail || !bookPath) return;
    
    try {
      // Import Firebase functions
      const { getReadingHistoryFromFirebase, saveReadingProgressToFirebase } = 
        await import('../firebase-config.js');
      
      // Check if book already exists in history
      const history = await getReadingHistoryFromFirebase(userEmail);
      const bookExists = history.some(book => book.bookPath === bookPath);
      
      if (!bookExists) {
        // Only save if book doesn't exist in history
        await saveReadingProgressToFirebase(
          userEmail,
          bookPath,
          bookTitle,
          'Autor desconocido',
          1, // Start at chapter 1
          totalChapters
        );
        console.log(`📚 Libro añadido al historial: ${bookTitle}`);
      }
    } catch (error) {
      console.error('❌ Error guardando progreso inicial:', error);
    }
  }

  /**
   * Setup category navigation
   */
  setupCategoryNavigation() {
    const categoryCards = document.querySelectorAll('.category-card');
    categoryCards.forEach(card => {
      card.addEventListener('click', () => {
        const category = card.dataset.category;
        
        if (!card.disabled) {
          switch (category) {
            case 'books':
              this.goToBooks();
              break;
            case 'audiobooks':
              this.goToAudiobooks();
              break;
            case 'comics':
              this.goToComics();
              break;
            default:
              console.log(`Categoría ${category} no disponible`);
          }
        }
      });
    });
  }

  /**
   * Setup back button navigation
   */
  setupBackButton(buttonId) {
    const backButton = document.getElementById(buttonId);
    if (backButton) {
      backButton.addEventListener('click', () => {
        this.goToHome();
      });
    }
  }

  /**
   * Setup logo click navigation
   */
  setupLogoNavigation() {
    const logos = document.querySelectorAll('.clickable-logo');
    logos.forEach(logo => {
      logo.addEventListener('click', () => {
        this.goToHome();
      });
    });
  }

  /**
   * Check if we're on a specific page
   */
  isOnPage(pageName) {
    return this.currentPage === pageName;
  }

  /**
   * Get page title based on current page
   */
  getPageTitle() {
    switch (this.currentPage) {
      case 'home':
        return 'LecturAPP';
      case 'books':
        return 'LecturAPP - Libros';
      case 'audiobooks':
        return 'LecturAPP - Audiolibros';
      case 'comics':
        return 'LecturAPP - Cómics';
      default:
        return 'LecturAPP';
    }
  }

  /**
   * Setup all navigation elements
   */
  setupNavigation() {
    this.setupCategoryNavigation();
    this.setupLogoNavigation();
    
    // Setup back buttons if they exist
    this.setupBackButton('back-to-menu');
    this.setupBackButton('back-btn');
  }
}

// Create and export singleton instance
export const navigationService = new NavigationService();