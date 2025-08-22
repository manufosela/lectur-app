/**
 * Lector de cómics CBZ/CBR para LecturAPP
 * Soporta archivos CBZ (ZIP) y CBR (RAR)
 */

import { 
  getComicsList,
  getComicsStructure,
  getComicsByFolder,
  getComicMetadata,
  auth, 
  saveComicProgressToFirebase, 
  getComicHistoryFromFirebase 
} from './firebase-config.js';

// Variables globales
let currentComic = null;
let currentPages = [];
let currentPageIndex = 0;
let currentZoom = 1;
let comicsList = [];
let comicsStructure = {};
let currentFolder = null;
let currentPath = []; // Para navegación de breadcrumbs
let currentUser = null;

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
 * Cargar estructura de cómics desde Firebase
 */
async function loadComics() {
  try {
    showLoader(true);
    
    // Obtener lista completa y estructura de cómics
    comicsList = await getComicsList().catch(() => []);
    comicsStructure = await getComicsStructure().catch(() => {});
    
    // Actualizar contador total
    const comicsCount = document.getElementById('header-num-comics');
    if (comicsCount) {
      comicsCount.textContent = comicsList.length;
    }
    
    // Mostrar vista de carpetas principales
    displayFolderView(comicsStructure);
    
    showLoader(false);
  } catch (error) {
    console.error('Error cargando cómics:', error);
    showLoader(false);
  }
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
    structure.comics.forEach(comic => {
      html += `
        <div class="comic-card" data-path="${comic.path}">
          <img 
            class="comic-cover" 
            src="/images/comic-placeholder.svg" 
            alt="${comic.title}"
            loading="lazy"
          />
          <div class="comic-info">
            <div class="comic-title">${comic.title}</div>
            <div class="comic-series">${comic.series}</div>
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
  return filename
    .replace(/\.(cbz|cbr|cb7|cbt)$/i, '')
    .replace(/[_-]/g, ' ')
    .trim();
}

/**
 * Abrir un cómic
 */
async function openComic(comicPath) {
  try {
    showLoader(true);
    
    // Obtener el archivo del cómic
    const comicFile = await fetchComic(comicPath);
    
    // Extraer páginas según el formato
    if (comicPath.toLowerCase().endsWith('.cbz')) {
      await extractCBZ(comicFile);
    } else if (comicPath.toLowerCase().endsWith('.cbr')) {
      await extractCBR(comicFile);
    } else {
      throw new Error('Formato no soportado');
    }
    
    // Mostrar el visor
    showViewer(true);
    
    // Cargar primera página
    loadPage(0);
    
    // Guardar progreso
    saveProgress();
    
    showLoader(false);
  } catch (error) {
    console.error('Error abriendo cómic:', error);
    alert('Error al abrir el cómic: ' + error.message);
    showLoader(false);
  }
}

/**
 * Obtener archivo del cómic desde Nginx (con proxy en desarrollo)
 */
async function fetchComic(comicPath) {
  console.log('📚 Obteniendo cómic:', comicPath);
  
  // En desarrollo usa proxy, en producción usa URL directa
  const isDevelopment = window.location.hostname === 'localhost';
  const baseUrl = isDevelopment 
    ? '/storage/COMICS' 
    : 'https://storage.lecturapp.es/COMICS';
  
  const comicUrl = `${baseUrl}/${encodeURIComponent(comicPath)}`;
  console.log('📚 URL del cómic:', comicUrl);
  
  const response = await fetch(comicUrl);
  if (!response.ok) {
    throw new Error(`No se pudo obtener el cómic: ${response.status} ${response.statusText}`);
  }
  
  return await response.blob();
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
 * Extraer páginas de un archivo CBR (RAR)
 * Nota: Necesitaremos una librería adicional para RAR
 */
async function extractCBR(blob) {
  // Para CBR necesitamos una librería como unrar.js
  // Por ahora mostraremos un mensaje
  throw new Error('Soporte para CBR próximamente. Por favor, convierte el archivo a CBZ.');
  
  // TODO: Implementar cuando tengamos la librería RAR
  // const unrar = new Unrar(blob);
  // const files = unrar.getEntries();
  // etc...
}

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
  
  // Actualizar botones de navegación
  updateNavButtons();
  
  // Actualizar miniaturas si están visibles
  updateThumbnails();
  
  // Guardar progreso
  saveProgress();
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
 * Búsqueda de cómics
 */
function searchComics(query) {
  const filtered = comicsList.filter(comic => {
    const title = (comic.title || comic).toLowerCase();
    return title.includes(query.toLowerCase());
  });
  
  displayComics(filtered);
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