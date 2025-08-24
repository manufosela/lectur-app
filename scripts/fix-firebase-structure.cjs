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

// Natural sort for comic numbers
function naturalSort(a, b) {
    const aMatch = a.match(/(\d+)/);
    const bMatch = b.match(/(\d+)/);
    if (aMatch && bMatch) {
        const aNum = parseInt(aMatch[1]);
        const bNum = parseInt(bMatch[1]);
        if (aNum !== bNum) return aNum - bNum;
    }
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function generateCorrectStructure() {
    console.log('🔍 Generando estructura corregida...');
    
    // Get all CBZ files using find command
    const findOutput = execSync(`find "${BASE_DIR}" -name "*.cbz" -type f`, { encoding: 'utf8' });
    const allCbzFiles = findOutput.trim().split('\n').filter(line => line.length > 0);
    
    console.log(`📊 Total cómics CBZ encontrados: ${allCbzFiles.length}`);
    
    // Convert absolute paths to relative paths
    const comicsList = allCbzFiles.map(fullPath => {
        const relativePath = path.relative(BASE_DIR, fullPath);
        return relativePath;
    });
    
    // Build correct folder structure with comics as arrays
    const folderStructure = {
        folders: {}
    };
    const comicsByFolder = {};
    const comicsMetadata = {};
    
    // Group comics by folder
    const comicsByFolderPath = {};
    
    comicsList.forEach((comicPath, index) => {
        const pathParts = comicPath.split('/');
        const filename = pathParts[pathParts.length - 1];
        const folderPath = pathParts.slice(0, -1).join('/');
        
        if (folderPath) {
            if (!comicsByFolderPath[folderPath]) {
                comicsByFolderPath[folderPath] = [];
            }
            comicsByFolderPath[folderPath].push(filename);
        }
        
        // Build comicsByFolder for Firebase
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
    
    // Build nested folder structure with comics as arrays
    for (const [folderPath, comicsInFolder] of Object.entries(comicsByFolderPath)) {
        const pathParts = folderPath.split('/');
        let currentLevel = folderStructure;
        
        // Navigate/create the nested structure
        for (let i = 0; i < pathParts.length; i++) {
            const folderName = pathParts[i];
            const cleanFolderName = folderName.replace(/\s+/g, '_'); // Replace spaces with underscores
            
            if (!currentLevel.folders) {
                currentLevel.folders = {};
            }
            
            if (!currentLevel.folders[cleanFolderName]) {
                currentLevel.folders[cleanFolderName] = {
                    folders: {},
                    comics: []
                };
            }
            
            currentLevel = currentLevel.folders[cleanFolderName];
        }
        
        // Add comics to the final level (sorted)
        currentLevel.comics = comicsInFolder.sort(naturalSort);
    }
    
    // 1. Generate corrected /comicsStructure_cbz
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'firebase_comicsStructure_cbz_fixed.json'),
        JSON.stringify(folderStructure, null, 2)
    );
    console.log('✅ firebase_comicsStructure_cbz_fixed.json generado con arrays de cómics');
    
    // Also regenerate the other files for consistency
    // 2. Generate /comics_cbz (simple array)
    comicsList.sort();
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'firebase_comics_cbz_fixed.json'),
        JSON.stringify(comicsList, null, 2)
    );
    console.log(`✅ firebase_comics_cbz_fixed.json: ${comicsList.length} cómics`);
    
    // 3. Generate /comicsByFolder_cbz
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'firebase_comicsByFolder_cbz_fixed.json'),
        JSON.stringify(comicsByFolder, null, 2)
    );
    console.log(`✅ firebase_comicsByFolder_cbz_fixed.json: ${Object.keys(comicsByFolder).length} carpetas`);
    
    // 4. Generate /comicsMetadata_cbz
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'firebase_comicsMetadata_cbz_fixed.json'),
        JSON.stringify(comicsMetadata, null, 2)
    );
    console.log(`✅ firebase_comicsMetadata_cbz_fixed.json: ${Object.keys(comicsMetadata).length} cómics`);
    
    console.log('\n🎉 Estructura corregida generada exitosamente');
    console.log('\nArchivos corregidos:');
    console.log('- firebase_comics_cbz_fixed.json');
    console.log('- firebase_comicsStructure_cbz_fixed.json (CON ARRAYS DE CÓMICS)');
    console.log('- firebase_comicsByFolder_cbz_fixed.json');
    console.log('- firebase_comicsMetadata_cbz_fixed.json');
}

// Run
generateCorrectStructure();