#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

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

function scanDirectory(dir, basePath = '') {
    if (!fs.existsSync(dir)) {
        return { folders: [], comics: [] };
    }
    
    const items = fs.readdirSync(dir, { withFileTypes: true });
    const folders = [];
    const comics = [];
    
    for (const item of items) {
        if (item.isDirectory()) {
            const subDir = path.join(dir, item.name);
            const subPath = basePath ? `${basePath}/${item.name}` : item.name;
            const subResult = scanDirectory(subDir, subPath);
            
            if (subResult.comics.length > 0 || subResult.folders.length > 0) {
                folders.push({
                    name: item.name,
                    path: subPath,
                    comics: subResult.comics.length,
                    folders: subResult.folders.length
                });
            }
        } else if (item.isFile() && item.name.toLowerCase().endsWith('.cbz')) {
            const filePath = basePath ? `${basePath}/${item.name}` : item.name;
            comics.push({
                filename: item.name,
                path: filePath,
                title: extractTitle(item.name)
            });
        }
    }
    
    // Sort folders and comics
    folders.sort((a, b) => a.name.localeCompare(b.name));
    comics.sort((a, b) => naturalSort(a.filename, b.filename));
    
    return { folders, comics };
}

function generateFirebaseJSONs() {
    console.log('🔍 Escaneando directorio de cómics...');
    const result = scanDirectory(BASE_DIR);
    
    // Count total comics recursively
    function countComics(node) {
        let total = node.comics.length;
        for (const folder of node.folders) {
            const subResult = scanDirectory(path.join(BASE_DIR, folder.path));
            total += countComics(subResult);
        }
        return total;
    }
    
    const totalComics = countComics(result);
    console.log(`📊 Total cómics CBZ encontrados: ${totalComics}`);
    
    // 1. Generate /comics_cbz (simple array)
    const comicsList = [];
    function collectAllComics(node, basePath = '') {
        for (const comic of node.comics) {
            comicsList.push(comic.path);
        }
        for (const folder of node.folders) {
            const subResult = scanDirectory(path.join(BASE_DIR, folder.path));
            collectAllComics(subResult, folder.path);
        }
    }
    collectAllComics(result);
    
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'firebase_comics_cbz_complete.json'),
        JSON.stringify(comicsList.sort(), null, 2)
    );
    console.log(`✅ firebase_comics_cbz_complete.json: ${comicsList.length} cómics`);
    
    // 2. Generate /comicsStructure_cbz
    function buildStructure(node) {
        const structure = {
            folders: {},
            comics: node.comics.length
        };
        
        for (const folder of node.folders) {
            const subResult = scanDirectory(path.join(BASE_DIR, folder.path));
            structure.folders[folder.name] = buildStructure(subResult);
        }
        
        return structure;
    }
    
    const structure = buildStructure(result);
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'firebase_comicsStructure_cbz_complete.json'),
        JSON.stringify(structure, null, 2)
    );
    console.log('✅ firebase_comicsStructure_cbz_complete.json generado');
    
    // 3. Generate /comicsByFolder_cbz
    const comicsByFolder = {};
    function buildComicsByFolder(node, folderPath = '') {
        if (node.comics.length > 0) {
            const cleanKey = folderPath ? cleanFirebaseKey(folderPath) : 'root';
            comicsByFolder[cleanKey] = {};
            node.comics.forEach((comic, index) => {
                const comicKey = cleanFirebaseKey(`comic_${index}_${comic.filename}`);
                comicsByFolder[cleanKey][comicKey] = comic.path;
            });
        }
        
        for (const folder of node.folders) {
            const subResult = scanDirectory(path.join(BASE_DIR, folder.path));
            buildComicsByFolder(subResult, folder.path);
        }
    }
    
    buildComicsByFolder(result);
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'firebase_comicsByFolder_cbz_complete.json'),
        JSON.stringify(comicsByFolder, null, 2)
    );
    console.log(`✅ firebase_comicsByFolder_cbz_complete.json: ${Object.keys(comicsByFolder).length} carpetas`);
    
    // 4. Generate /comicsMetadata_cbz
    const comicsMetadata = {};
    comicsList.forEach(comicPath => {
        const cleanKey = cleanFirebaseKey(comicPath);
        const filename = path.basename(comicPath);
        const folder = path.dirname(comicPath);
        
        comicsMetadata[cleanKey] = {
            filename: filename,
            title: extractTitle(filename),
            path: comicPath,
            folder: folder,
            format: 'cbz',
            url: `https://storage.lecturapp.es/COMICS/${encodeURIComponent(comicPath)}`
        };
    });
    
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
}

// Run
generateFirebaseJSONs();