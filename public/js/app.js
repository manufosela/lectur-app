import { 
  getBooksList, getAutorsList, getAutorsBooksList, 
  auth, signInWithGoogle, signOut, isUserAuthorized, 
  saveReadingProgressToFirebase, getReadingHistoryFromFirebase, removeFromHistoryFirebase
} from './firebase-config.js';

const lookBookUrlGOOGLE = "https://www.googleapis.com/books/v1/volumes?q=";

let allBooks = [];
let currentFilter = null;
let currentUser = null;

// Constante para sistema de temas
const THEME_STORAGE_KEY = 'lectur-app-theme';

// Filtros globales para limpiar la consola de errores irrelevantes
(() => {
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  
  console.error = function(...args) {
    const message = String(args[0] || '');
    if (message.includes('chrome-extension') || 
        message.includes('google-analytics') ||
        message.includes('mp/collect') ||
        message.includes('Blocked script execution') ||
        message.includes('sandbox') ||
        message.includes('about:srcdoc') ||
        message.includes('404 (Not Found)') ||
        message.includes('.jpg') ||
        message.includes('.png') ||
        message.includes('.gif') ||
        message.includes('Images/')) {
      return;
    }
    originalError.apply(console, args);
  };
  
  console.warn = function(...args) {
    const message = String(args[0] || '');
    if (message.includes('chrome-extension') || 
        message.includes('google-analytics')) {
      return;
    }
    originalWarn.apply(console, args);
  };
  
  // Suprimir logs específicos de Astro y errores de imágenes EPUB
  console.log = function(...args) {
    const message = String(args[0] || '');
    if (message.includes('Fetch finished loading') ||
        message.includes('Fetch failed loading') ||
        message.includes('XHR finished loading') ||
        message.includes('google-analytics') ||
        message.includes('mp/collect') ||
        message.includes('chrome-extension') ||
        message.includes('logo64x64.png') ||
        message.includes('perf.js') ||
        message.includes('index.js') ||
        message.includes('GET http://localhost:4321/Images/') ||
        message.includes('.jpg') ||
        message.includes('.png') ||
        message.includes('.gif') ||
        message.includes('404 (Not Found)')) {
      return;
    }
    originalLog.apply(console, args);
  };
})();

// Funciones para el historial de lectura
const getReadingHistory = async () => {
  try {
    if (!currentUser) {
      return [];
    }
    
    // USAR SOLO REALTIME DATABASE para historial
    return await getReadingHistoryFromFirebase(currentUser.email);
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    return [];
  }
};

// Sistema de debounce para evitar guardados excesivos
let saveProgressTimer = null;
let pendingSaveData = null;

const saveReadingProgress = (bookPath, bookTitle, author, chapterIndex, totalChapters) => {
  
  try {
    if (!currentUser) {
      console.warn('No hay usuario autenticado para guardar progreso');
      return;
    }
    
    // Guardar datos pendientes
    pendingSaveData = {
      bookPath, 
      bookTitle, 
      author, 
      chapterIndex, 
      totalChapters,
      userEmail: currentUser.email
    };
    
    // Cancelar timer anterior si existe
    if (saveProgressTimer) {
      clearTimeout(saveProgressTimer);
    }
    
    // Programar guardado después de 2 segundos de inactividad
    saveProgressTimer = setTimeout(async () => {
      if (pendingSaveData) {
        console.log('💾 Guardando progreso después de inactividad...');
        
        // Guardar SOLO en Firebase Realtime Database
        saveReadingProgressToFirebase(
          pendingSaveData.userEmail,
          pendingSaveData.bookPath,
          pendingSaveData.bookTitle,
          pendingSaveData.author,
          pendingSaveData.chapterIndex,
          pendingSaveData.totalChapters
        ).catch(error => {
          console.warn('Error guardando progreso en Firebase:', error);
        });
        
        // Actualizar display del historial de forma no bloqueante
        updateHistoryDisplay().catch(error => {
          console.warn('Error actualizando historial:', error);
        });
        
        pendingSaveData = null;
        saveProgressTimer = null;
      }
    }, 2000);
    
  } catch (error) {
    console.error('Error guardando progreso:', error);
  }
};

// Función para forzar guardado inmediato (al cerrar libro, cambiar página, etc.)
const forceProgressSave = async () => {
  if (pendingSaveData && saveProgressTimer) {
    clearTimeout(saveProgressTimer);
    console.log('💾 Forzando guardado inmediato...');
    
    await saveReadingProgressToFirebase(
      pendingSaveData.userEmail,
      pendingSaveData.bookPath,
      pendingSaveData.bookTitle,
      pendingSaveData.author,
      pendingSaveData.chapterIndex,
      pendingSaveData.totalChapters
    ).catch(error => {
      console.warn('Error en guardado forzado:', error);
    });
    
    pendingSaveData = null;
    saveProgressTimer = null;
  }
};

const removeFromHistory = async (bookId) => {
  try {
    if (!currentUser) {
      console.warn('No hay usuario autenticado para eliminar del historial');
      return;
    }
    
    // Eliminar de Firebase
    await removeFromHistoryFirebase(currentUser.email, bookId);
    
    // Actualizar display del historial
    await updateHistoryDisplay();
  } catch (error) {
    console.error('Error eliminando del historial:', error);
  }
};

const updateHistoryDisplay = async () => {
  try {
    const history = await getReadingHistory();
    const historyList = document.getElementById('history-list');
    const historyCount = document.getElementById('history-count');
    
    if (!historyList || !historyCount) return;
    
    historyCount.textContent = history.length;
    
    if (history.length === 0) {
      historyList.innerHTML = '<div class="empty-history">No hay libros en curso</div>';
      return;
    }
    
    historyList.innerHTML = history.map(item => {
      const date = new Date(item.lastRead).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      return `
        <div class="history-item">
          <div class="history-info">
            <div class="history-title">${item.title}</div>
            <div class="history-progress">Capítulo ${item.currentChapter + 1} de ${item.totalChapters} (${item.progress}%)</div>
            <div class="history-date">Última vez: ${date}</div>
          </div>
          <button class="history-btn continue-btn" onclick="continueReading('${item.id}')">
            Continuar
          </button>
          <button class="history-btn delete-btn" onclick="removeFromHistory('${item.id}')">
            ×
          </button>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error actualizando display del historial:', error);
  }
};

const continueReading = async (bookId) => {
  try {
    const history = await getReadingHistory();
    const bookData = history.find(item => item.id === bookId);
    
    if (bookData) {
      // Abrir el libro en el capítulo donde se quedó
      await getBook(bookData.bookPath, bookData.currentChapter);
    }
  } catch (error) {
    console.error('Error continuando lectura:', error);
    alert('Error al abrir el libro. Inténtalo de nuevo.');
  }
};

// Función para migrar datos de localStorage a Firebase
const migrateLocalStorageToFirebase = async () => {
  try {
    if (!currentUser) return;
    
    const localHistory = localStorage.getItem('epub-reading-history');
    if (!localHistory) return;
    
    const historyData = JSON.parse(localHistory);
    if (!Array.isArray(historyData) || historyData.length === 0) return;
    
    console.log('Migrando historial de localStorage a Firebase...', historyData);
    
    // Migrar en paralelo para mayor velocidad
    const migrationPromises = historyData.map(item => 
      saveReadingProgressToFirebase(
        currentUser.email,
        item.bookPath,
        item.title,
        item.author,
        item.currentChapter,
        item.totalChapters
      ).catch(error => {
        console.warn('Error migrando item:', item.bookPath, error);
      })
    );
    
    await Promise.all(migrationPromises);
    
    // Limpiar localStorage después de la migración exitosa
    localStorage.removeItem('epub-reading-history');
    console.log('Migración completada. localStorage limpio.');
    
  } catch (error) {
    console.error('Error migrando datos a Firebase:', error);
  }
};

// Hacer las funciones accesibles globalmente para los onclick
window.continueReading = continueReading;
window.removeFromHistory = removeFromHistory;

// Funciones de autenticación
const showLoginScreen = () => {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('main').style.display = 'none';
};

const hideLoginScreen = () => {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main').style.display = 'flex';
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
      // Inicializar la aplicación principal
      await initializeApp();
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
    showLoginScreen();
    // Limpiar datos
    allBooks = [];
    currentFilter = null;
    document.getElementById('books').innerHTML = '';
    document.getElementById('num-results').innerHTML = '';
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
        await initializeApp();
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
    showLoginScreen();
    loading(false);
  }
});

const loading = (show) => {
  const overlay = document.getElementById('overlay');
  if (show) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
};

let currentChapters = [];
let currentChapterIndex = 0;
let currentBook = null;
let epubImages = {}; // Cache para imágenes del EPUB
let keyPressHandler = null; // Referencia al handler para poder removerlo
let currentBookPath = null; // Para tracking del progreso

const getEpubFile = async (blob, startChapter = 0) => {
  try {
    loading(true);
    
    // Limpiar datos anteriores
    currentChapters = [];
    currentChapterIndex = 0;
    epubImages = {};
    
    // Extraer EPUB con JSZip
    const zip = new JSZip();
    const epubData = await zip.loadAsync(blob);
    
    // Extraer todas las imágenes del EPUB
    await extractEpubImages(epubData);
    
    // Leer el archivo de contenido (container.xml)
    const containerXml = await epubData.file('META-INF/container.xml').async('text');
    const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');
    const opfPath = containerDoc.querySelector('rootfile').getAttribute('full-path');
    
    // Leer el archivo OPF (metadatos y estructura)
    const opfContent = await epubData.file(opfPath).async('text');
    const opfDoc = new DOMParser().parseFromString(opfContent, 'text/xml');
    
    // Obtener información del libro
    const title = opfDoc.querySelector('title')?.textContent || 'Libro sin título';
    const author = opfDoc.querySelector('creator')?.textContent || 'Autor desconocido';
    
    // Obtener orden de capítulos desde el spine
    const spineItems = Array.from(opfDoc.querySelectorAll('spine itemref'));
    const manifest = opfDoc.querySelectorAll('manifest item');
    
    // Crear mapa de IDs a hrefs
    const idToHref = {};
    manifest.forEach(item => {
      idToHref[item.getAttribute('id')] = item.getAttribute('href');
    });
    
    // Cargar capítulos en orden
    const basePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
    
    for (const item of spineItems) {
      const idref = item.getAttribute('idref');
      const href = idToHref[idref];
      if (href && href.endsWith('.xhtml') || href.endsWith('.html')) {
        const chapterPath = basePath + href;
        try {
          const chapterContent = await epubData.file(chapterPath).async('text');
          currentChapters.push({
            title: `Capítulo ${currentChapters.length + 1}`,
            content: chapterContent,
            path: chapterPath
          });
        } catch (e) {
          console.warn('No se pudo cargar el capítulo:', chapterPath);
        }
      }
    }
    
    if (currentChapters.length === 0) {
      throw new Error('No se encontraron capítulos en el EPUB');
    }
    
    // Preparar el contenedor
    const libroDiv = document.getElementById('libro');
    libroDiv.innerHTML = `
      <div class="epub-reader">
        <div class="epub-header">
          <div class="book-info">
            <h2>${title}</h2>
            <p class="book-author">por ${author}</p>
          </div>
          <div class="chapter-info">
            <span id="chapter-counter">${currentChapterIndex + 1} / ${currentChapters.length}</span>
          </div>
        </div>
        <div id="epub-content" class="epub-content"></div>
      </div>
    `;
    
    // Mostrar capítulo inicial (puede ser 0 o el que se guardó en el historial)
    displayChapter(startChapter);
    
    // Configurar navegación
    setupEpubNavigation();
    
    loading(false);
    console.log(`Libro cargado: ${title} con ${currentChapters.length} capítulos`);
    
    // Mostrar botón de cerrar
    const closeBtn = document.getElementById('closeBtn');
    if (closeBtn) closeBtn.style.display = 'block';
    
  } catch (error) {
    loading(false);
    console.error('Error cargando EPUB:', error);
    showEpubError('Error al cargar el libro. Formato EPUB no soportado o corrupto.');
  }
};

const displayChapter = (chapterIndex) => {
  if (chapterIndex < 0 || chapterIndex >= currentChapters.length) return;
  
  currentChapterIndex = chapterIndex;
  const chapter = currentChapters[chapterIndex];
  const contentDiv = document.getElementById('epub-content');
  
  if (contentDiv && chapter) {
    // Procesar contenido HTML y limpiar
    const doc = new DOMParser().parseFromString(chapter.content, 'text/xml');
    const bodyContent = doc.querySelector('body') || doc.documentElement;
    
    // Limpiar y preparar contenido con imágenes procesadas
    let cleanContent = bodyContent.innerHTML || bodyContent.textContent;
    cleanContent = processEpubContent(cleanContent);
    
    contentDiv.innerHTML = cleanContent;
    
    // Actualizar contador
    const counter = document.getElementById('chapter-counter');
    if (counter) {
      counter.textContent = `${chapterIndex + 1} / ${currentChapters.length}`;
    }
    
    // Scroll al inicio del capítulo
    contentDiv.scrollTop = 0;
    
    // Guardar progreso si tenemos la información del libro
    if (currentBookPath && currentChapters.length > 0) {
      const bookTitle = document.querySelector('.book-info h2')?.textContent || 'Libro desconocido';
      const author = document.querySelector('.book-author')?.textContent?.replace('por ', '') || 'Autor desconocido';
      saveReadingProgress(currentBookPath, bookTitle, author, chapterIndex, currentChapters.length);
    }
  }
  
  showNavigationControls();
};

const setupEpubNavigation = () => {
  // Limpiar handler anterior si existe
  if (keyPressHandler) {
    document.removeEventListener('keydown', keyPressHandler);
  }
  
  keyPressHandler = (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      nextChapter();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevChapter();
    } else if (e.key === 'Escape') {
      closeBookReadings();
    }
  };
  
  // Event listener para teclado
  document.addEventListener('keydown', keyPressHandler);
  
  // Event listener para clicks en el contenido
  const contentDiv = document.getElementById('epub-content');
  if (contentDiv) {
    contentDiv.addEventListener('click', (e) => {
      const rect = contentDiv.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      
      if (x < width * 0.3) {
        prevChapter();
      } else if (x > width * 0.7) {
        nextChapter();
      }
    });
  }
};

const nextChapter = () => {
  if (currentChapterIndex < currentChapters.length - 1) {
    displayChapter(currentChapterIndex + 1);
  }
};

const prevChapter = () => {
  if (currentChapterIndex > 0) {
    displayChapter(currentChapterIndex - 1);
  }
};

const extractEpubImages = async (epubData) => {
  // Buscar archivos de imagen en el EPUB
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
  
  for (const [filename, file] of Object.entries(epubData.files)) {
    const isImage = imageExtensions.some(ext => 
      filename.toLowerCase().endsWith(ext)
    );
    
    if (isImage && !file.dir) {
      try {
        const blob = await file.async('blob');
        const dataUrl = await blobToDataUrl(blob);
        // Guardar con diferentes posibles rutas
        const shortName = filename.split('/').pop();
        epubImages[filename] = dataUrl;
        epubImages[shortName] = dataUrl;
        epubImages[filename.replace(/^.*\//, '')] = dataUrl;
      } catch (e) {
        console.warn('No se pudo extraer imagen:', filename);
      }
    }
  }
};

const blobToDataUrl = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const processEpubContent = (htmlContent) => {
  // Limpiar contenido y reemplazar imágenes
  let cleanContent = htmlContent
    .replace(/<script[^>]*>.*?<\/script>/gis, '')
    .replace(/<style[^>]*>.*?<\/style>/gis, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/style\s*=\s*["'][^"']*color\s*:[^;"']*["']/gi, '') // Eliminar estilos de color inline
    .replace(/color\s*:\s*[^;"]*/gi, ''); // Eliminar propiedades de color restantes
  
  // Reemplazar referencias de imágenes
  cleanContent = cleanContent.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, (match, src) => {
    // Buscar la imagen en nuestro cache
    const imageName = src.split('/').pop();
    const possiblePaths = [src, imageName, '../Images/' + imageName, 'Images/' + imageName];
    
    for (const path of possiblePaths) {
      if (epubImages[path]) {
        return match.replace(src, epubImages[path]);
      }
    }
    
    // Si no encontramos la imagen, la ocultamos
    return match.replace(/src="[^"]*"/, 'style="display:none"');
  });
  
  return cleanContent;
};

const showEpubError = (message) => {
  const libroDiv = document.getElementById('libro');
  libroDiv.innerHTML = `
    <div class="epub-error">
      <div class="error-content">
        <h2>Error al cargar el libro</h2>
        <p>${message}</p>
        <button onclick="closeBookReadings()" class="error-btn">Cerrar</button>
      </div>
    </div>
  `;
};

const showNavigationControls = () => {
  // Crear controles si no existen
  if (!document.getElementById('epub-controls')) {
    const controls = document.createElement('div');
    controls.id = 'epub-controls';
    controls.innerHTML = `
      <button id="prev-page" class="nav-btn" title="Página anterior (←)">◀</button>
      <button id="next-page" class="nav-btn" title="Página siguiente (→)">▶</button>
    `;
    controls.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 20px;
      z-index: 10;
      background: rgba(255,255,255,0.8);
      padding: 5px;
      border-radius: 20px;
      display: flex;
      gap: 10px;
      align-items: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(controls);
    
    // Añadir event listeners a los botones
    document.getElementById('prev-page').addEventListener('click', () => {
      prevChapter();
    });
    
    document.getElementById('next-page').addEventListener('click', () => {
      nextChapter();
    });
  }
  
  document.getElementById('epub-controls').style.display = 'flex';
};

const hideNavigationControls = () => {
  const controls = document.getElementById('epub-controls');
  if (controls) {
    controls.style.display = 'none';
  }
};

const getBook = async (bookPath, startChapter = 0) => {
  loading(true);
  currentBookPath = bookPath; // Guardar la ruta del libro actual
  
  // Estrategia híbrida: Intentar S3 primero, luego Firebase Storage
  const s3BucketUrl = 'https://lectur-app-personal.s3.eu-west-1.amazonaws.com';
  const s3Url = `${s3BucketUrl}/${encodeURIComponent(bookPath)}`;
  
  console.log('📚 Buscando libro:', bookPath);
  console.log('🔗 Intentando S3 primero:', s3Url);
  
  // 1. Intentar S3 primero
  fetch(s3Url, {
    method: "GET"
  })
  .then(response => {
    if (response.ok) {
      console.log('✅ Encontrado en S3');
      return response.blob();
    } else {
      console.log('⚠️ No encontrado en S3, intentando Firebase Storage...');
      throw new Error('NotFoundInS3');
    }
  })
  .then(blob => {
    loading(false);
    if (bookPath.endsWith('.epub')) {
      document.getElementById('libro').classList.remove('hidden');
      document.getElementById('main').classList.add('hidden');
      getEpubFile(blob, startChapter);
    } else if (bookPath.endsWith('.pdf')) {
      console.log('ES PDF...');
    }
  })
  .catch(error => {
    if (error.message === 'NotFoundInS3') {
      // 2. Fallback a Firebase Storage usando Cloud Function (método original)
      console.log('🔥 Intentando Firebase Storage con Cloud Function...');
      
      const cloudFunctionUrl = `https://europe-west1-lectur-app.cloudfunctions.net/downloadFile?fileName=${encodeURIComponent(bookPath)}`;
      
      fetch(cloudFunctionUrl, {
        method: "GET"
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Error HTTP ${response.status} en Cloud Function`);
        }
        console.log('✅ Encontrado en Firebase Storage via Cloud Function');
        return response.blob();
      })
      .then(blob => {
        loading(false);
        if (bookPath.endsWith('.epub')) {
          document.getElementById('libro').classList.remove('hidden');
          document.getElementById('main').classList.add('hidden');
          getEpubFile(blob, startChapter);
        } else if (bookPath.endsWith('.pdf')) {
          console.log('ES PDF...');
        }
      })
      .catch(firebaseError => {
        console.error('Error en Firebase Storage:', firebaseError);
        loading(false);
        alert(`❌ Libro no encontrado\n\nEl libro "${bookPath}" no se pudo cargar desde ningún almacenamiento.\n\nError: ${firebaseError.message}`);
      });
    } else {
      console.error('Error descargando de S3:', error);
      loading(false);
      alert(`❌ Error descargando libro\n\n${error.message}`);
    }
  });
};

const getBookInfo = async (bookPath) => {
  return new Promise((resolve, reject) => {
    try {
      loading(true);
      // Clean the book name for better search results
      const cleanBookName = bookPath.replace(/_/g, ' ').replace('.epub', '').replace('.pdf', '');
      fetch(lookBookUrlGOOGLE + encodeURIComponent(cleanBookName))
        .then(response => response.json())
        .then(data => {
          loading(false);
          if (data?.items && data.items.length > 0) {
            const book = data.items[0].volumeInfo;
            const year = book?.publishedDate?.split("-")[0] || "NO_YEAR";
            const bookData = {
              title: book.title || cleanBookName,
              authors: book.authors || ['NO_AUTHOR'],
              year: year || 'NO_YEAR',
              description: book.description || 'No hay descripción disponible',
              pageCount: book.pageCount || '',
              categories: book.categories || ['NO_CATEGORY'],
              averageRating: book.averageRating || '',
              ratingsCount: book.ratingsCount || '',
              language: book.language || '',
              previewLink: book.previewLink || '',
              infoLink: book.infoLink || '',
              canonicalVolumeLink: book.canonicalVolumeLink || '',
            };
            console.log('Información del libro:', bookData);
            resolve(bookData);
          } else {
            // No se encontró el libro en Google Books
            const bookData = {
              title: cleanBookName,
              authors: ['Autor desconocido'],
              year: 'Año desconocido',
              description: 'No se encontró información sobre este libro',
              pageCount: '',
              categories: ['Sin categoría'],
              averageRating: '',
              ratingsCount: '',
              language: '',
              previewLink: '',
              infoLink: '',
              canonicalVolumeLink: '',
            };
            console.log('Libro no encontrado en Google Books, usando datos por defecto:', bookData);
            resolve(bookData);
          }
        })
        .catch(error => {
          console.error('Error obteniendo info del libro:', error);
          loading(false);
          // Devolver datos por defecto en caso de error
          const bookData = {
            title: bookPath.replace(/_/g, ' ').replace('.epub', '').replace('.pdf', ''),
            authors: ['Autor desconocido'],
            year: 'Año desconocido',
            description: 'Error al obtener información del libro',
            pageCount: '',
            categories: ['Sin categoría'],
            averageRating: '',
            ratingsCount: '',
            language: '',
            previewLink: '',
            infoLink: '',
            canonicalVolumeLink: '',
          };
          resolve(bookData);
        });
    } catch (error) {
      console.error('Error inesperado:', error);
      loading(false);
      reject(error);
    }
  });
};

const getStrWithoutAccents = (str) => {
  let withoutAccents = str.replace(/[áäàâã]/gi, "a")
                          .replace(/[ÀÁÂÃÄÅ]/gi, "A")
                          .replace(/[éëèê]/gi, "e")
                          .replace(/[ÉËÈÊ]/gi, "E")
                          .replace(/[íïìî]/gi, "i")
                          .replace(/[ÍÏÌÎ]/gi, "I")
                          .replace(/[óöòôõ]/gi, "o")
                          .replace(/[ÓÖÒÔÕ]/gi, "O")
                          .replace(/[úüùû]/gi, "u")
                          .replace(/[ÚÜÙÛ]/gi, "U")
                          .replace(/[ñ]/gi, "n")
                          .replace(/[Ñ]/gi, "N");
  return withoutAccents;
};

const getCleanFirebaseId = (id) => {
  const cleanId = id.replace(/[^a-zA-Z0-9-_\s$]/g, "");
  return cleanId;
};

const drawBooksList = (booksNameList) => {
  const booksList = document.getElementById("books");
  booksList.innerHTML = "";
  booksNameList.forEach((bookName) => {
    const cleanBookTitle = encodeURIComponent(bookName);
    const bookElement = document.createElement("li");
    bookElement.classList.add("book");
    bookElement.innerHTML = `${bookName.replace(/_/g,' ')} <a href="#${cleanBookTitle}" class="read-link">Leer</a> <a href="#INFO-${cleanBookTitle}" class="info-link">Info</a>`;
    booksList.appendChild(bookElement);
  });
  
  // Actualizar contador de resultados
  document.getElementById("num-results").innerHTML = `${booksNameList.length} libros encontrados`;
};

const filterBooksByLetter = (letter) => {
  // Check if letter is a number
  if (/^[0-9]$/.test(letter)) {
    return allBooks.filter(book => {
      const firstChar = getStrWithoutAccents(book).charAt(0);
      return firstChar === letter;
    });
  }
  
  return allBooks.filter(book => {
    const firstChar = getStrWithoutAccents(book).charAt(0).toUpperCase();
    return firstChar === letter;
  });
};

const handleLetterClick = async (event) => {
  event.preventDefault(); // Prevenir comportamiento por defecto del enlace
  if (!event.target.classList.contains('letter-link')) return;
  
  // Actualizar enlace activo
  document.querySelectorAll('.letter-link').forEach(link => {
    link.classList.remove('active');
  });
  event.target.classList.add('active');
  
  const letter = event.target.dataset.letter;
  currentFilter = letter;
  
  // Actualizar indicador de filtro
  const filterDiv = document.getElementById('current-filter');
  const filterText = document.getElementById('filter-text');
  
  filterDiv.classList.remove('hidden');
  if (/^[0-9]$/.test(letter)) {
    filterText.textContent = `Número ${letter}`;
  } else {
    filterText.textContent = `Letra ${letter}`;
  }
  
  // Mostrar loading
  document.getElementById("num-results").innerHTML = "🔄 Cargando libros...";
  
  // Filtrar y mostrar libros por letra (sistema original)
  const filteredBooks = filterBooksByLetter(letter);
  drawBooksList(filteredBooks);
};

const showBookInfoModal = (bookData) => {
  const modal = document.getElementById('book-info-modal');
  if (!modal) {
    console.error('Modal no encontrado');
    return;
  }
  
  // Mostrar el modal primero para asegurar que los elementos estén disponibles
  modal.classList.remove('hidden');
  
  // Llenar el modal con la información del libro
  const titleEl = document.getElementById('modal-title');
  const authorsEl = document.getElementById('modal-authors');
  const yearEl = document.getElementById('modal-year');
  const pagesEl = document.getElementById('modal-pages');
  const categoriesEl = document.getElementById('modal-categories');
  const languageEl = document.getElementById('modal-language');
  const ratingEl = document.getElementById('modal-rating');
  const descriptionEl = document.getElementById('modal-description-text');
  const infoLink = document.getElementById('modal-info-link');
  
  // Verificar que todos los elementos existen antes de usarlos
  if (titleEl) titleEl.textContent = bookData.title;
  if (authorsEl) authorsEl.textContent = bookData.authors.join(', ');
  if (yearEl) yearEl.textContent = bookData.year;
  if (pagesEl) pagesEl.textContent = bookData.pageCount || 'No disponible';
  if (categoriesEl) categoriesEl.textContent = bookData.categories.join(', ');
  if (languageEl) languageEl.textContent = bookData.language || 'No especificado';
  
  // Calificación
  if (ratingEl) {
    if (bookData.averageRating) {
      ratingEl.textContent = `${bookData.averageRating}/5 (${bookData.ratingsCount} valoraciones)`;
    } else {
      ratingEl.textContent = 'Sin calificaciones';
    }
  }
  
  // Descripción
  if (descriptionEl) {
    descriptionEl.textContent = bookData.description;
  }
  
  // Enlace a Google Books (priorizar infoLink, luego previewLink)
  if (infoLink) {
    if (bookData.infoLink || bookData.previewLink) {
      infoLink.href = bookData.infoLink || bookData.previewLink;
      infoLink.classList.remove('hidden');
    } else {
      infoLink.classList.add('hidden');
    }
  }
};

const closeBookInfoModal = () => {
  const modal = document.getElementById('book-info-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
};

const handleBookClick = async (event) => {
  event.preventDefault();
  if (event.target.classList.contains('read-link')) {
    const bookName = decodeURIComponent(event.target.href.split('#')[1]);
    await getBook(bookName);
  } else if (event.target.classList.contains('info-link')) {
    const bookName = decodeURIComponent(event.target.href.split('#INFO-')[1]);
    const bookData = await getBookInfo(bookName);
    showBookInfoModal(bookData);
  }
};

const closeBookReadings = async () => {
  // Forzar guardado antes de cerrar
  await forceProgressSave();
  
  document.getElementById('libro').classList.add('hidden');
  document.getElementById('main').classList.remove('hidden');
  
  // Limpiar datos del libro
  currentChapters = [];
  currentChapterIndex = 0;
  currentBook = null;
  epubImages = {};
  
  // Ocultar controles de navegación
  hideNavigationControls();
  
  // Limpiar event listeners de teclado
  if (keyPressHandler) {
    document.removeEventListener('keydown', keyPressHandler);
    keyPressHandler = null;
  }
  
  // Ocultar botón de cerrar
  const closeBtn = document.getElementById('closeBtn');
  if (closeBtn) closeBtn.style.display = 'none';
  
  // Limpiar el contenido del div
  document.getElementById('libro').innerHTML = '';
  
  // Colapsar el buscador avanzado
  const searchContainer = document.querySelector('.search-container');
  if (searchContainer && searchContainer.hasAttribute('open')) {
    searchContainer.removeAttribute('open');
  }
  
  // Actualizar historial de lectura para mostrar el libro recién leído
  updateHistoryDisplay();
};

// Guardar progreso al salir de la página
window.addEventListener('beforeunload', async () => {
  if (pendingSaveData) {
    // Forzar guardado final
    await forceProgressSave();
  }
});

const initializeApp = async () => {
  try {
    // No mostrar loading aquí porque ya se maneja en onAuthStateChanged
    
    // USAR REALTIME DATABASE (sistema original que funciona perfectamente)
    console.log('📊 Usando Realtime Database para gestión de libros');
    
    const [booksNameList, _autorsNameList, _autorsBooks] = await Promise.all([
      getBooksList(),
      getAutorsList(),
      getAutorsBooksList()
    ]);
    
    // Guardar datos en variables globales
    allBooks = booksNameList;
    autorsNameList = _autorsNameList;
    autorsBooks = _autorsBooks;
    
    // Actualizar contadores
    document.getElementById("num-libros").textContent = booksNameList.length;
    document.getElementById("header-num-libros").textContent = booksNameList.length.toLocaleString('es-ES');
    document.getElementById("num-autores").textContent = _autorsNameList.length;
    
    // NO mostrar libros inicialmente - solo mostrar cuando se haga clic o búsqueda
    document.getElementById("num-results").innerHTML = "Selecciona una letra o número para ver los libros";
    
    // Migrar datos de localStorage a Firebase si existen
    await migrateLocalStorageToFirebase();
    
    // Inicializar historial de lectura
    await updateHistoryDisplay();
    
    // Actualizar año en el footer
    const yearElement = document.getElementById('current-year');
    if (yearElement) {
      yearElement.textContent = new Date().getFullYear();
    }
    
    // Mostrar email del usuario logueado
    if (currentUser) {
      const userEmailElement = document.getElementById('user-email');
      if (userEmailElement) {
        userEmailElement.textContent = currentUser.email;
      }
    }
    
  } catch (error) {
    console.error('Error inicializando la aplicación:', error);
  }
};

// Variables globales para la búsqueda
let autorsNameList = [];
let autorsBooks = {};

// Función para manejar la búsqueda
const handleSearch = async (event) => {
  const searchValue = event.target.value;
  const searchMode = event.target.id;
  console.log(searchMode, searchValue);
  const cleanSearchValue = getStrWithoutAccents(searchValue).toLowerCase();
  const booksList = document.getElementById("books");
  
  // Si hay búsqueda activa, desactivar filtro alfabético
  if (searchValue.length > 2) {
    document.querySelectorAll('.letter-link').forEach(link => {
      link.classList.remove('active');
    });
    document.getElementById('current-filter').classList.add('hidden');
    currentFilter = null;
  }
  
  booksList.innerHTML = "";

  if (searchMode === "search-by-autor" && searchValue.length > 2) {
    // Búsqueda por autor (sistema original)
    const results = autorsNameList.filter(author => 
      getStrWithoutAccents(author).toLowerCase().includes(cleanSearchValue)
    );
    const booksNameListAutor = results.reduce((acc, _autor) => {
      const autor = getCleanFirebaseId(_autor);
      if (autorsBooks[autor]) {
        return acc.concat(Object.values(autorsBooks[autor]));
      }
      return acc;
    }, []);
    drawBooksList(booksNameListAutor);
  }

  if (searchMode === "search-by-title" && searchValue.length > 2) {
    // Búsqueda por título (sistema original)
    const filteredBooks = allBooks.filter(bookName => {
      const cleanBookTitle = getStrWithoutAccents(bookName).toLowerCase();
      return cleanBookTitle.includes(cleanSearchValue);
    });
    drawBooksList(filteredBooks);
  }
  
  if (searchValue.length <= 2) {
    // Si se borra la búsqueda, volver al filtro actual si existe
    if (currentFilter) {
      const letter = currentFilter;
      const filteredBooks = filterBooksByLetter(letter);
      drawBooksList(filteredBooks);
      document.querySelector(`.letter-link[data-letter="${letter}"]`).classList.add('active');
      
      document.getElementById('current-filter').classList.remove('hidden');
      if (/^[0-9]$/.test(letter)) {
        document.getElementById('filter-text').textContent = `Número ${letter}`;
      } else {
        document.getElementById('filter-text').textContent = `Letra ${letter}`;
      }
    } else {
      // Si no hay filtro activo, limpiar la lista
      document.getElementById("books").innerHTML = "";
      document.getElementById("num-results").innerHTML = "Selecciona una letra o número para ver los libros";
      document.getElementById('current-filter').classList.add('hidden');
    }
  }
};

// Inicializar event listeners cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeEventListeners);
} else {
  initializeEventListeners();
}

function initializeEventListeners() {
  // Event listener para el botón de login
  const googleLoginBtn = document.getElementById('google-login-btn');
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', handleGoogleLogin);
  }
  
  // Event listener para el botón de logout
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
  
  // Event listener para el cambio de tema
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  
  // Event listener para el índice alfabético
  const alphabetIndex = document.getElementById('alphabet-index');
  if (alphabetIndex) {
    alphabetIndex.addEventListener('click', handleLetterClick);
  }
  
  // Event listener para los enlaces de libros
  const booksContainer = document.getElementById('books');
  if (booksContainer) {
    booksContainer.addEventListener('click', handleBookClick);
  }
  
  // Event listener para búsqueda
  const searchByTitle = document.getElementById("search-by-title");
  const searchByAutor = document.getElementById("search-by-autor");
  
  if (searchByTitle) {
    searchByTitle.addEventListener("input", handleSearch);
  }
  
  if (searchByAutor) {
    searchByAutor.addEventListener("input", handleSearch);
  }
  
  // Event listener para cerrar libro
  const closeBtn = document.getElementById("closeBtn");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeBookReadings);
  }
  
  // Event listeners para el modal de información
  const modalCloseBtn = document.querySelector('.modal-close');
  const modal = document.getElementById('book-info-modal');
  
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeBookInfoModal);
  }
  
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'book-info-modal') {
        closeBookInfoModal();
      }
    });
  }
  
  // Inicializar tema
  initializeTheme();
}

// Funciones para el sistema de temas

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    console.warn('Error accediendo localStorage para tema:', error);
    return null;
  }
}

function setStoredTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn('Error guardando tema en localStorage:', error);
  }
}

function applyTheme(theme) {
  const body = document.body;
  const html = document.documentElement;
  
  if (theme === 'dark') {
    html.setAttribute('data-theme', 'dark');
    body.setAttribute('data-theme', 'dark');
  } else {
    html.removeAttribute('data-theme');
    body.removeAttribute('data-theme');
  }
  
  // Actualizar icono del botón
  updateThemeButtonIcon(theme);
}

function updateThemeButtonIcon(theme) {
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  
  if (!themeToggle) return;
  
  if (theme === 'dark') {
    themeToggle.title = 'Cambiar a modo claro';
    if (themeIcon) {
      // En modo oscuro, mostrar icono de sol
      themeIcon.innerHTML = `
        <circle cx="12" cy="12" r="5"></circle>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
      `;
    }
  } else {
    themeToggle.title = 'Cambiar a modo oscuro';
    if (themeIcon) {
      // En modo claro, mostrar icono de luna
      themeIcon.innerHTML = `
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      `;
    }
  }
}

function getCurrentTheme() {
  return document.documentElement.hasAttribute('data-theme') ? 'dark' : 'light';
}

function toggleTheme() {
  const currentTheme = getCurrentTheme();
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  
  applyTheme(newTheme);
  setStoredTheme(newTheme);
  
  console.log(`🎨 Tema cambiado a: ${newTheme}`);
}

function initializeTheme() {
  // Obtener tema guardado o usar preferencia del sistema
  let theme = getStoredTheme();
  
  if (!theme) {
    // Si no hay tema guardado, usar preferencia del sistema
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    } else {
      theme = 'light';
    }
    
    // Guardar la preferencia detectada
    setStoredTheme(theme);
  }
  
  // Aplicar tema
  applyTheme(theme);
  
  // Escuchar cambios en la preferencia del sistema
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (e) => {
      // Solo cambiar si no hay tema personalizado guardado explícitamente por el usuario
      const storedTheme = getStoredTheme();
      if (!storedTheme) {
        const systemTheme = e.matches ? 'dark' : 'light';
        applyTheme(systemTheme);
        setStoredTheme(systemTheme);
      }
    };
    
    // Usar el método apropiado según el soporte del navegador
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else {
      mediaQuery.addListener(handleSystemThemeChange);
    }
  }
}