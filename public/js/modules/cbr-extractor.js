// ES6 module for extracting .cbr in the browser using node-unrar-js (WASM)

/**
 * Natural sort for page-like filenames (e.g., 1.jpg, 2.jpg, 10.jpg).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
const naturalCompare = (a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/**
 * Guess MIME type from filename.
 * @param {string} filename
 * @returns {string}
 */
const getMimeByName = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'bmp') return 'image/bmp';
  return 'application/octet-stream';
};

/**
 * Load CBR and return sorted image blobs as object URLs.
 * @param {string} cbrUrl - URL pública del .cbr (CORS habilitado).
 * @param {Function} fetchImpl - Dependency injection for fetch (default: window.fetch).
 * @param {string} password - Optional RAR password.
 * @returns {Promise<Array<{name:string,url:string,size:number}>>}
 */
export const loadCbrImages = async (cbrUrl, fetchImpl = fetch, password) => {
  try {
    console.log('🗜️ Loading CBR with WASM extractor:', cbrUrl);
    
    // Try multiple import strategies
    let createExtractorFromData;
    
    try {
      console.log('🔍 Trying CDN import...');
      // Try jsDelivr first
      const unrarModule = await import('https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/esm/js/unrar.js');
      console.log('📦 CDN module loaded:', unrarModule);
      console.log('📦 Available exports:', Object.keys(unrarModule));
      createExtractorFromData = unrarModule.createExtractorFromData || unrarModule.default?.createExtractorFromData;
    } catch (cdnError) {
      console.warn('⚠️ CDN import failed:', cdnError.message);
      
      try {
        console.log('🔍 Trying unpkg import...');
        // Try unpkg as fallback
        const unrarModule = await import('https://unpkg.com/node-unrar-js@2.0.2/esm');
        console.log('📦 Unpkg module loaded:', unrarModule);
        console.log('📦 Available exports:', Object.keys(unrarModule));
        createExtractorFromData = unrarModule.createExtractorFromData || unrarModule.default?.createExtractorFromData;
      } catch (unpkgError) {
        console.warn('⚠️ Unpkg import failed:', unpkgError.message);
        throw new Error('Failed to load WASM module from any CDN');
      }
    }
    
    if (!createExtractorFromData) {
      throw new Error('createExtractorFromData not found in loaded module');
    }
    
    console.log('📡 Downloading CBR file...');
    // Fetch CBR
    const cbrRes = await fetchImpl(cbrUrl, { mode: 'cors' });
    if (!cbrRes.ok) throw new Error(`No se pudo descargar el CBR: ${cbrRes.status}`);
    const cbrBuf = await cbrRes.arrayBuffer();
    console.log(`📦 CBR downloaded: ${cbrBuf.byteLength} bytes`);

    console.log('🔧 Creating WASM extractor...');
    // Create extractor from in-memory data (WASM)
    const extractor = await createExtractorFromData({
      data: cbrBuf,
      ...(password ? { password } : {}),
    });

    console.log('📂 Extracting files...');
    // Extract only files that are not directories; filter to images
    const extracted = extractor.extract({ files: (fh) => !fh.flags.directory });
    const { files } = extracted;
    
    console.log(`📋 Found ${files.length} files in CBR`);
    
    const images = [];
    for (const file of files) {
      const name = file.fileHeader.name;
      console.log(`📄 Processing file: ${name}`);
      
      if (!/\.(jpe?g|png|webp|gif|bmp)$/i.test(name)) {
        console.log(`⏭️ Skipping non-image: ${name}`);
        continue;
      }
      
      const blob = new Blob([file.extraction], { type: getMimeByName(name) });
      const url = URL.createObjectURL(blob);
      images.push({ 
        name, 
        url, 
        size: file.extraction.byteLength 
      });
      console.log(`✅ Added image: ${name} (${file.extraction.byteLength} bytes)`);
    }
    
    // Sort naturally by filename
    images.sort((a, b) => naturalCompare(a.name, b.name));
    console.log(`🎯 Extracted ${images.length} images from CBR`);
    return images;
    
  } catch (error) {
    console.error('❌ CBR extraction failed:', error);
    throw new Error(`Failed to extract CBR: ${error.message}`);
  }
};