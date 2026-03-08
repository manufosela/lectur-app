// TODO: All content fetching must go exclusively through downloadProtectedFile()
/**
 * Lector de cómics CBZ para LecturAPP
 * Optimizado para archivos CBZ (ZIP) - mejor rendimiento y compatibilidad
 *
 * Usa catalog-loader para obtener la estructura real del NAS (_aquitengolalista.json)
 * Firebase solo se usa para historial de lectura
 */

import {
  auth,
  saveComicProgressToFirebase,
  getComicHistoryFromFirebase
} from './firebase-config.js';

import { themeService } from './modules/theme.js';
import { uiService } from './modules/ui.js';
import { contentService } from './modules/content.js';
import { downloadProtectedFile } from './modules/protected-download.js';
import { findNodeByRelpath, getFilesByExtension } from './modules/catalog-loader.js';

// Variables globales
let currentComic = null;
let currentPages = [];
let currentPageIndex = 0;
let currentZoom = 1;
let currentFolder = null;
let currentPath = []; // Para navegación de breadcrumbs
let currentUser = null;
let comicsStructure = {}; // Estructura jerárquica construida desde el catálogo

// Detectar usuario actual
auth.onAuthStateChanged((user) => {
  currentUser = user;
  if (user) {
    document.getElementById('user-email').textContent = user.email;
    loadComics();
  } else {
    window.location.href = '/';
  }
});

/**
 * Cargar estructura de cómics desde el catálogo del NAS
 */
async function loadComics() {
  try {
    showLoader(true);

    // Initialize theme service
    themeService.init();

    // Setup UI components
    uiService.setupClickableLogos();
    uiService.setupBackButton('back-to-menu');

    // Cargar solo el catálogo de cómics (no todos los catálogos)
    await contentService.loadContentType('comics');

    // Obtener catálogo de cómics
    const comicsCatalog = contentService.getCatalog('comics');
    const counts = contentService.getContentCounts();

    // Actualizar contador
    const comicsCount = document.getElementById('header-num-comics');
    if (comicsCount) {
      comicsCount.textContent = counts.comics;
      console.log(`📚 Catálogo cargado: ${counts.comics} cómics`);
    }

    // Debug: ver qué devuelve getCatalog
    console.log('📂 comicsCatalog keys:', comicsCatalog ? Object.keys(comicsCatalog) : 'null');
    console.log('📂 comicsCatalog.items?', comicsCatalog?.items?.length || 'no items');

    // Construir estructura de carpetas desde el catálogo y guardar en variable global
    comicsStructure = buildFolderStructureFromCatalog(comicsCatalog);

    console.log('📂 comicsStructure:', Object.keys(comicsStructure.folders).length, 'carpetas');

    // Mostrar vista de carpetas principales
    displayFolderView(comicsStructure);

    showLoader(false);
  } catch (error) {
    console.error('Error cargando cómics:', error);
    showLoader(false);
  }
}

/**
 * Construir estructura de carpetas desde el catálogo del NAS
 * Convierte la estructura del catálogo a la estructura jerárquica esperada
 */
function buildFolderStructureFromCatalog(catalog) {
  if (!catalog || !catalog.items) {
    console.warn('⚠️ Catálogo vacío o sin items');
    return { folders: {}, comics: [] };
  }

  console.log('📂 Procesando catálogo con', catalog.items.length, 'items en raíz');
  // Debug: mostrar estructura completa de primeros items
  console.log('📂 Primeros 3 items (full):', JSON.stringify(catalog.items.slice(0, 3), null, 2));

  const structure = { folders: {}, comics: [] };

  function processItems(items, targetStructure, depth = 0) {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (item.type === 'dir') {
        // Es una carpeta
        targetStructure.folders[item.name] = { folders: {}, comics: [] };
        if (item.items && item.items.length > 0) {
          processItems(item.items, targetStructure.folders[item.name], depth + 1);
        }
      } else if (item.type === 'file') {
        // Es un archivo de cómic
        const ext = (item.ext || item.name?.split('.').pop() || '').toLowerCase().replace('.', '');
        if (ext === 'cbz' || ext === 'cbr') {
          targetStructure.comics.push(item.name);
        }
      }
    }
  }

  processItems(catalog.items, structure);

  console.log('📂 Estructura construida:', Object.keys(structure.folders).length, 'carpetas,', structure.comics.length, 'comics en raíz');

  return structure;
}

/**
 * Mostrar vista de carpetas principales
 */
function displayFolderView(structure, currentFolderName = null) {
  const grid = document.getElementById('comics-grid');
  if (!grid) return;
  
  let html = '';
  
  // Breadcrumb navigation
  if (currentPath.length > 0) {
    html += `
      <div class="breadcrumb" style="grid-column: 1/-1; margin-bottom: 1rem;">
        <button class="breadcrumb-btn" onclick="navigateToRoot()">🏠 Inicio</button>
        ${currentPath.map((path, index) => 
          `<span> / </span><button class="breadcrumb-btn" onclick="navigateToPath(${index})">${path}</button>`
        ).join('')}
        ${currentFolderName ? `<span> / </span><span class="current-folder">${currentFolderName}</span>` : ''}
      </div>
    `;
  }
  
  // Mostrar carpetas
  if (structure && structure.folders && Object.keys(structure.folders).length > 0) {
    Object.entries(structure.folders).forEach(([folderName, folderData]) => {
      const comicsCount = countComicsInFolder(folderData);
      html += `
        <div class="folder-card" data-folder="${folderName}">
          <div class="folder-icon">📁</div>
          <div class="folder-info">
            <div class="folder-title">${folderName}</div>
            <div class="folder-count">${comicsCount} cómics</div>
          </div>
        </div>
      `;
    });
  }
  
  // Mostrar cómics del nivel actual
  if (structure && structure.comics && structure.comics.length > 0) {
    structure.comics.forEach(comicData => {
      // Manejar tanto objetos (datos antiguos) como strings (datos nuevos)
      let comicFilename, fullPath;
      
      if (typeof comicData === 'string') {
        // Datos nuevos: strings simples
        comicFilename = comicData;
        fullPath = currentPath.length > 0 
          ? `${currentPath.join('/')}/${comicFilename}`
          : comicFilename;
      } else if (typeof comicData === 'object' && comicData.filename) {
        // Datos antiguos: objetos con propiedades
        comicFilename = comicData.filename;
        fullPath = comicData.path || comicFilename;
      } else {
        console.error('Formato de cómic desconocido:', comicData);
        return;
      }
      
      const title = extractTitle(comicFilename);
      
      html += `
        <div class="comic-card" data-path="${fullPath}">
          <img 
            class="comic-cover" 
            src="/images/comic-placeholder.svg" 
            alt="${title}"
            loading="lazy"
          />
          <div class="comic-info">
            <div class="comic-title">${title}</div>
            <div class="comic-series">${currentFolderName || 'Serie desconocida'}</div>
          </div>
        </div>
      `;
    });
  }
  
  if (html === '') {
    html = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
        <h2>No hay cómics disponibles</h2>
        <p>Los cómics aparecerán aquí cuando se añadan a la biblioteca</p>
      </div>
    `;
  }
  
  grid.innerHTML = html;
  
  // Añadir event listeners
  document.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => openFolder(card.dataset.folder));
  });
  
  document.querySelectorAll('.comic-card').forEach(card => {
    card.addEventListener('click', () => openComic(card.dataset.path));
  });
}

/**
 * Contar cómics en una carpeta recursivamente
 */
function countComicsInFolder(folderData) {
  let count = 0;
  
  if (folderData.comics) {
    count += folderData.comics.length;
  }
  
  if (folderData.folders) {
    Object.values(folderData.folders).forEach(subFolder => {
      count += countComicsInFolder(subFolder);
    });
  }
  
  return count;
}

/**
 * Abrir una carpeta
 */
async function openFolder(folderName) {
  try {
    showLoader(true);
    
    // Navegar en la estructura
    let targetStructure = comicsStructure;
    for (const pathPart of currentPath) {
      if (targetStructure && targetStructure.folders) {
        targetStructure = targetStructure.folders[pathPart];
      } else {
        throw new Error('Estructura de carpetas no encontrada');
      }
    }
    
    if (targetStructure && targetStructure.folders && targetStructure.folders[folderName]) {
      currentPath.push(folderName);
      currentFolder = folderName;
      displayFolderView(targetStructure.folders[folderName], folderName);
    }
    
    showLoader(false);
  } catch (error) {
    console.error('Error abriendo carpeta:', error);
    showLoader(false);
  }
}

/**
 * Navegar a la raíz
 */
function navigateToRoot() {
  currentPath = [];
  currentFolder = null;
  displayFolderView(comicsStructure);
}

/**
 * Navegar a una ruta específica en el breadcrumb
 */
function navigateToPath(pathIndex) {
  currentPath = currentPath.slice(0, pathIndex + 1);
  
  let targetStructure = comicsStructure;
  for (const pathPart of currentPath) {
    if (targetStructure && targetStructure.folders) {
      targetStructure = targetStructure.folders[pathPart];
    } else {
      console.error('Estructura de carpetas no encontrada en navegación');
      return;
    }
  }
  
  const folderName = currentPath[currentPath.length - 1];
  displayFolderView(targetStructure, folderName);
}

/**
 * Mostrar cómics en la galería (función original para compatibilidad)
 */
function displayComics(comics) {
  const grid = document.getElementById('comics-grid');
  if (!grid) return;
  
  if (comics.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
        <h2>No hay cómics disponibles</h2>
        <p>Los cómics aparecerán aquí cuando se añadan a la biblioteca</p>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = comics.map(comic => `
    <div class="comic-card" data-path="${comic.path || comic}">
      <img 
        class="comic-cover" 
        src="${comic.cover || '/images/comic-placeholder.svg'}" 
        alt="${comic.title || comic}"
        loading="lazy"
      />
      <div class="comic-info">
        <div class="comic-title">${comic.title || extractTitle(comic)}</div>
        <div class="comic-series">${comic.series || 'Serie desconocida'}</div>
      </div>
    </div>
  `).join('');
  
  // Añadir event listeners a las tarjetas
  document.querySelectorAll('.comic-card').forEach(card => {
    card.addEventListener('click', () => openComic(card.dataset.path));
  });
}

/**
 * Extraer título del nombre del archivo
 */
function extractTitle(filename) {
  // Verificar que filename sea una string
  if (typeof filename !== 'string') {
    console.error('extractTitle: filename no es string:', filename);
    return 'Título desconocido';
  }
  
  return filename
    .replace(/\.(cbz|cbr|cb7|cbt)$/i, '')
    .replace(/[_-]/g, ' ')
    .trim();
}

/**
 * Abrir un cómic
 * @param {string} comicPath - Path del cómic (puede ser formato legacy o relpath directo)
 */
async function openComic(comicPath) {
  try {
    showLoader(true);

    // Resolver el relpath real usando el catálogo
    const relpath = await getComicUrl(comicPath);
    const isCbz = relpath.toLowerCase().endsWith('.cbz');
    const isCbr = relpath.toLowerCase().endsWith('.cbr');

    if (!isCbz && !isCbr) {
      throw new Error('Formato no soportado. Solo CBZ/CBR.');
    }

    // Guardar el relpath resuelto como cómic actual (antes de descargar)
    currentComic = relpath;

    const comicFile = await fetchComic(relpath);

    if (isCbz) {
      await extractCBZ(comicFile);
    } else if (isCbr) {
      // TODO: Implementar soporte protegido para CBR con CBReader o conversión previa
      await extractCBZ(comicFile); // Fallback provisional
    }

    // Mostrar el visor
    showViewer(true);

    // Cargar historial de lectura si existe (usando relpath como ID)
    let startPage = 0;
    if (currentUser) {
      try {
        const historyArray = await getComicHistoryFromFirebase(currentUser.email);
        // Usar relpath como identificador único del cómic
        const comicId = btoa(relpath);
        const savedComic = historyArray.find(item => item.id === comicId);
        if (savedComic && savedComic.currentPage > 0) {
          startPage = savedComic.currentPage;
          console.log(`📖 Retomando lectura desde página ${startPage + 1}`);
        }
      } catch (error) {
        console.warn('Error cargando historial:', error);
      }
    }

    // Cargar la página guardada o la primera
    loadPage(startPage);

    showLoader(false);
  } catch (error) {
    console.error('Error abriendo cómic:', error);
    showErrorToast('Error al abrir el cómic: ' + error.message);
    showLoader(false);
  }
}

/**
 * Resolver el relpath real de un cómic usando el catálogo como fuente de verdad.
 * Si el catálogo no está disponible, usa la conversión legacy.
 *
 * @param {string} comicPath - Path del cómic (puede tener formato legacy con | o _)
 * @returns {string} relpath real del archivo en el NAS
 */
async function getComicUrl(comicPath) {
  // 1. Convertir formato legacy (FANTASTIC_FOUR|Carpeta|Archivo.cbz) a path
  // NO convertir a minúsculas - las rutas en el servidor mantienen su case original
  const pathParts = comicPath.replace(/\|/g, '/').split('/');
  const fixedParts = pathParts.map((part, index) => {
    if (index === 0) return part; // Mantener primera carpeta (FANTASTIC_FOUR)
    return part.replace(/_/g, ' '); // Convertir guiones bajos a espacios en subcarpetas
  });
  const cleanPath = fixedParts.join('/');

  // 2. Obtener catálogo del contentService
  const comicsCatalog = contentService.getCatalog('comics');

  if (comicsCatalog) {
    // Buscar por nombre de archivo (último segmento) - comparación case-insensitive
    const filename = pathParts[pathParts.length - 1];
    const allComics = getFilesByExtension(comicsCatalog, ['.cbz', '.cbr']);

    const matchByName = allComics.find(node => {
      const nodeName = node.name || node.relpath.split('/').pop();
      // Comparar ignorando diferencias de _ vs espacio y case
      const normalizedNodeName = nodeName.replace(/_/g, ' ').toLowerCase();
      const normalizedSearch = filename.replace(/_/g, ' ').toLowerCase();
      return normalizedNodeName === normalizedSearch;
    });

    if (matchByName) {
      // Usar fullRelpath que incluye la sección (comics/)
      const fullPath = matchByName.fullRelpath || `comics/${matchByName.relpath}`;
      console.log('📂 Catálogo: encontrado por nombre:', fullPath);
      return fullPath;
    }

    // Intentar búsqueda por relpath completo
    const directNode = findNodeByRelpath(comicsCatalog, cleanPath);
    if (directNode && directNode.type === 'file') {
      const fullPath = directNode.fullRelpath || `comics/${directNode.relpath}`;
      console.log('📂 Catálogo: encontrado por relpath:', fullPath);
      return fullPath;
    }

    console.warn('⚠️ Catálogo: no se encontró el cómic, usando path tentativo:', cleanPath);
  }

  // 3. Fallback: devolver path con prefijo comics/
  const tentativeRelpath = cleanPath.toLowerCase().startsWith('comics/') ? cleanPath : `comics/${cleanPath}`;
  return tentativeRelpath;
}

/**
 * Obtener archivo del cómic
 */
async function fetchComic(relpath) {
  console.log('📚 Descargando cómic vía downloadProtectedFile:', relpath);
  return await downloadProtectedFile(relpath);
}

/**
 * Extraer páginas de un archivo CBZ (ZIP)
 */
async function extractCBZ(blob) {
  const zip = new JSZip();
  const content = await zip.loadAsync(blob);
  
  currentPages = [];
  const imageFiles = [];
  
  // Filtrar solo archivos de imagen
  content.forEach((relativePath, file) => {
    if (!file.dir && /\.(jpg|jpeg|png|gif|webp)$/i.test(relativePath)) {
      imageFiles.push({ path: relativePath, file: file });
    }
  });
  
  // Ordenar por nombre
  imageFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  
  // Convertir a URLs
  for (const item of imageFiles) {
    const imageBlob = await item.file.async('blob');
    const imageUrl = URL.createObjectURL(imageBlob);
    currentPages.push({
      url: imageUrl,
      name: item.path
    });
  }
  
  console.log(`Cargadas ${currentPages.length} páginas del CBZ`);
}

/**
 * NOTA: Funciones CBR eliminadas
 * 
 * La aplicación ahora solo soporta archivos CBZ (ZIP) para mejor rendimiento
 * y compatibilidad. Los archivos CBR han sido convertidos a CBZ.
 * 
 * Funciones eliminadas:
 * - extractCBR()
 * - extractCBRFallback() 
 * - Módulo cbr-extractor.js
 * - Cloud Function extractCBR
 * 
 * Beneficios de CBZ-only:
 * ✅ Mejor rendimiento (JSZip nativo)
 * ✅ Sin dependencias WASM/Cloud Functions
 * ✅ 100% compatible con navegadores
 * ✅ Experiencia de usuario más fluida
 */

/**
 * Cargar página específica
 */
function loadPage(index) {
  if (index < 0 || index >= currentPages.length) return;
  
  currentPageIndex = index;
  
  const pageImg = document.getElementById('comic-page');
  const pageInfo = document.getElementById('page-info');
  
  if (pageImg && currentPages[index]) {
    pageImg.src = currentPages[index].url;
    pageImg.style.transform = `scale(${currentZoom})`;
  }
  
  if (pageInfo) {
    pageInfo.textContent = `Página ${index + 1} de ${currentPages.length}`;
  }
  
  // Guardar progreso de lectura
  saveProgress();
  
  // Actualizar botones de navegación
  updateNavButtons();
  
  // Actualizar miniaturas si están visibles
  updateThumbnails();
}

/**
 * Navegación entre páginas
 */
function nextPage() {
  if (currentPageIndex < currentPages.length - 1) {
    loadPage(currentPageIndex + 1);
  }
}

function prevPage() {
  if (currentPageIndex > 0) {
    loadPage(currentPageIndex - 1);
  }
}

/**
 * Control de zoom
 */
function zoomIn() {
  currentZoom = Math.min(currentZoom + 0.25, 3);
  applyZoom();
}

function zoomOut() {
  currentZoom = Math.max(currentZoom - 0.25, 0.5);
  applyZoom();
}

function resetZoom() {
  currentZoom = 1;
  applyZoom();
}

function applyZoom() {
  const pageImg = document.getElementById('comic-page');
  if (pageImg) {
    pageImg.style.transform = `scale(${currentZoom})`;
  }
  
  const zoomBtn = document.getElementById('zoom-reset');
  if (zoomBtn) {
    zoomBtn.textContent = `${Math.round(currentZoom * 100)}%`;
  }
}

/**
 * Pantalla completa
 */
function toggleFullscreen() {
  const viewer = document.getElementById('comic-viewer');
  
  if (!document.fullscreenElement) {
    viewer.requestFullscreen().catch(err => {
      console.error('Error al entrar en pantalla completa:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

/**
 * Actualizar botones de navegación
 */
function updateNavButtons() {
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');
  
  if (prevBtn) {
    prevBtn.style.display = currentPageIndex > 0 ? 'block' : 'none';
  }
  
  if (nextBtn) {
    nextBtn.style.display = currentPageIndex < currentPages.length - 1 ? 'block' : 'none';
  }
}

/**
 * Actualizar miniaturas
 */
function updateThumbnails() {
  const container = document.getElementById('thumbnails');
  if (!container || container.classList.contains('hidden')) return;
  
  container.innerHTML = currentPages.map((page, index) => `
    <img 
      class="thumbnail ${index === currentPageIndex ? 'active' : ''}"
      src="${page.url}"
      data-index="${index}"
      alt="Página ${index + 1}"
    />
  `).join('');
  
  // Añadir event listeners
  container.querySelectorAll('.thumbnail').forEach(thumb => {
    thumb.addEventListener('click', (e) => {
      loadPage(parseInt(e.target.dataset.index));
    });
  });
}

/**
 * Guardar progreso de lectura
 */
async function saveProgress() {
  if (!currentUser || !currentComic) return;
  
  try {
    await saveComicProgressToFirebase(
      currentUser.email,
      currentComic,
      currentPageIndex,
      currentPages.length
    );
  } catch (error) {
    console.error('Error guardando progreso:', error);
  }
}

/**
 * Mostrar/ocultar visor
 */
function showViewer(show) {
  const viewer = document.getElementById('comic-viewer');
  if (viewer) {
    viewer.classList.toggle('hidden', !show);
  }
}

/**
 * Mostrar/ocultar loader
 */
function showLoader(show) {
  const overlay = document.getElementById('comic-overlay');
  if (overlay) {
    overlay.classList.toggle('hidden', !show);
  }
}

/**
 * Cerrar visor
 */
function closeViewer() {
  // Limpiar URLs de objetos para liberar memoria
  currentPages.forEach(page => {
    if (page.url.startsWith('blob:')) {
      URL.revokeObjectURL(page.url);
    }
  });
  
  currentPages = [];
  currentPageIndex = 0;
  currentZoom = 1;
  currentComic = null;
  
  showViewer(false);
}

/**
 * Búsqueda de cómics en la estructura jerárquica
 */
function searchComics(query) {
  if (!query.trim()) {
    let targetStructure = comicsStructure;
    for (const pathPart of currentPath) {
      if (targetStructure && targetStructure.folders) {
        targetStructure = targetStructure.folders[pathPart];
      }
    }
    const folderName = currentPath[currentPath.length - 1] || null;
    displayFolderView(targetStructure, folderName);
    return;
  }

  const normalizedQuery = query.toLowerCase();
  const results = { folders: {}, comics: [] };

  function searchInStructure(structure) {
    if (structure.folders) {
      Object.entries(structure.folders).forEach(([name, data]) => {
        if (name.toLowerCase().includes(normalizedQuery)) {
          results.folders[name] = data;
        }
        searchInStructure(data);
      });
    }
    if (structure.comics) {
      structure.comics.forEach(comic => {
        const comicName = typeof comic === 'string' ? comic : comic.filename;
        if (comicName.toLowerCase().includes(normalizedQuery)) {
          results.comics.push(comic);
        }
      });
    }
  }

  searchInStructure(comicsStructure);
  displayFolderView(results, `Resultados: "${query}"`);
}

/**
 * Mostrar mensaje de error tipo toast
 */
function showErrorToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;top:1rem;left:50%;transform:translateX(-50%);background:#dc3545;color:white;padding:1rem 2rem;border-radius:8px;z-index:3000;font-size:0.9rem;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-width:90vw;text-align:center;';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Navegación
  document.getElementById('next-page')?.addEventListener('click', nextPage);
  document.getElementById('prev-page')?.addEventListener('click', prevPage);
  
  // Zoom
  document.getElementById('zoom-in')?.addEventListener('click', zoomIn);
  document.getElementById('zoom-out')?.addEventListener('click', zoomOut);
  document.getElementById('zoom-reset')?.addEventListener('click', resetZoom);
  
  // Pantalla completa
  document.getElementById('fullscreen')?.addEventListener('click', toggleFullscreen);
  
  // Cerrar visor
  document.getElementById('close-viewer')?.addEventListener('click', closeViewer);
  
  // Búsqueda
  document.getElementById('search-comics')?.addEventListener('input', (e) => {
    searchComics(e.target.value);
  });
  
  // Theme toggle
  themeService.setupThemeToggle('theme-toggle');
  
  // Event listener para logo clicable - volver al inicio
  const clickableLogo = document.querySelector('.clickable-logo');
  if (clickableLogo) {
    clickableLogo.addEventListener('click', () => {
      window.location.href = '/';
    });
  }
  
  // Volver al menú
  document.getElementById('back-to-menu')?.addEventListener('click', () => {
    window.location.href = '/';
  });
  
  // Atajos de teclado
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('comic-viewer')?.classList.contains('hidden')) return;
    
    switch(e.key) {
      case 'ArrowLeft':
        prevPage();
        break;
      case 'ArrowRight':
        nextPage();
        break;
      case 'Escape':
        closeViewer();
        break;
      case '+':
      case '=':
        zoomIn();
        break;
      case '-':
      case '_':
        zoomOut();
        break;
      case '0':
        resetZoom();
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
    }
  });
  
  // Gestos táctiles para móviles
  let touchStartX = 0;
  const viewer = document.getElementById('page-container');
  
  viewer?.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  });
  
  viewer?.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        nextPage(); // Swipe izquierda
      } else {
        prevPage(); // Swipe derecha
      }
    }
  });
});

// Exportar funciones para debugging
window.comicReader = {
  openComic,
  nextPage,
  prevPage,
  zoomIn,
  zoomOut,
  resetZoom,
  closeViewer,
  openFolder,
  navigateToRoot,
  navigateToPath
};

// Hacer funciones globalmente accesibles para el HTML
window.openFolder = openFolder;
window.navigateToRoot = navigateToRoot;
window.navigateToPath = navigateToPath;
