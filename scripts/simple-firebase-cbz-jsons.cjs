#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_DIR = '/home/manu/servidorix/COMICS';
const OUTPUT_DIR = '/home/manu/ws_firebase/lectur-app-astro';

// Clean Firebase key (replace problematic characters)
function cleanFirebaseKey(key) {
    return key.replace(/[.#$/\[\]]/g, '|').replace(/\s+/g, '_');
}

// Extract title from filename
function extractTitle(filename) {
    return filename
        .replace(/\.(cbz|cbr)$/i, '')
        .replace(/^\d+\s*[-._]\s*/, '') // Remove leading numbers
        .replace(/_/g, ' ')
        .trim();
}

function generateFirebaseJSONs() {
    console.log('🔍 Buscando todos los archivos CBZ...');
    
    // Get all CBZ files using find command
    const findOutput = execSync(`find "${BASE_DIR}" -name "*.cbz" -type f`, { encoding: 'utf8' });
    const allCbzFiles = findOutput.trim().split('\n').filter(line => line.length > 0);
    
    console.log(`📊 Total cómics CBZ encontrados: ${allCbzFiles.length}`);
    
    // Convert absolute paths to relative paths
    const comicsList = allCbzFiles.map(fullPath => {
        const relativePath = path.relative(BASE_DIR, fullPath);
        return relativePath;
    });
    
    // 1. Generate /comics_cbz (simple array)
    comicsList.sort();
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'firebase_comics_cbz_complete.json'),
        JSON.stringify(comicsList, null, 2)
    );
    console.log(`✅ firebase_comics_cbz_complete.json: ${comicsList.length} cómics`);
    
    // 2. Build folder structure
    const folderStructure = {};
    const comicsByFolder = {};
    const comicsMetadata = {};
    
    comicsList.forEach((comicPath, index) => {
        const pathParts = comicPath.split('/');
        const filename = pathParts[pathParts.length - 1];
        const folderPath = pathParts.slice(0, -1).join('/');
        
        // Build folder structure
        if (folderPath) {
            const folderParts = pathParts.slice(0, -1);
            let currentLevel = folderStructure;
            
            for (let i = 0; i < folderParts.length; i++) {
                const folderName = folderParts[i];
                if (!currentLevel.folders) {
                    currentLevel.folders = {};
                    currentLevel.comics = 0;
                }
                if (!currentLevel.folders[folderName]) {
                    currentLevel.folders[folderName] = {
                        folders: {},
                        comics: 0
                    };
                }
                currentLevel = currentLevel.folders[folderName];
            }
            currentLevel.comics = (currentLevel.comics || 0) + 1;
        }
        
        // Build comicsByFolder
        if (folderPath) {
            const folderKey = cleanFirebaseKey(folderPath);
            if (!comicsByFolder[folderKey]) {
                comicsByFolder[folderKey] = {};
            }
            const comicKey = cleanFirebaseKey(`comic_${index}_${filename}`);
            comicsByFolder[folderKey][comicKey] = comicPath;
        }
        
        // Build comicsMetadata
        const metadataKey = cleanFirebaseKey(comicPath);
        comicsMetadata[metadataKey] = {
            filename: filename,
            title: extractTitle(filename),
            path: comicPath,
            folder: folderPath || '',
            format: 'cbz',
            url: `https://storage.lecturapp.es/COMICS/${encodeURIComponent(comicPath)}`
        };
    });
    
    // 3. Generate /comicsStructure_cbz
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'firebase_comicsStructure_cbz_complete.json'),
        JSON.stringify(folderStructure, null, 2)
    );
    console.log('✅ firebase_comicsStructure_cbz_complete.json generado');
    
    // 4. Generate /comicsByFolder_cbz
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'firebase_comicsByFolder_cbz_complete.json'),
        JSON.stringify(comicsByFolder, null, 2)
    );
    console.log(`✅ firebase_comicsByFolder_cbz_complete.json: ${Object.keys(comicsByFolder).length} carpetas`);
    
    // 5. Generate /comicsMetadata_cbz
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'firebase_comicsMetadata_cbz_complete.json'),
        JSON.stringify(comicsMetadata, null, 2)
    );
    console.log(`✅ firebase_comicsMetadata_cbz_complete.json: ${Object.keys(comicsMetadata).length} cómics`);
    
    console.log('\n🎉 Todos los JSONs de Firebase generados exitosamente');
    console.log('\nArchivos creados:');
    console.log('- firebase_comics_cbz_complete.json');
    console.log('- firebase_comicsStructure_cbz_complete.json');
    console.log('- firebase_comicsByFolder_cbz_complete.json');
    console.log('- firebase_comicsMetadata_cbz_complete.json');
    
    console.log(`\n📊 Resumen:`);
    console.log(`   Total cómics: ${comicsList.length}`);
    console.log(`   Total carpetas: ${Object.keys(comicsByFolder).length}`);
}

// Run
generateFirebaseJSONs();