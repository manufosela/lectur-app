#!/usr/bin/env node

/**
 * Script para subir solo los archivos CBZ a Firebase como comics_cbz
 */

import { promises as fs } from 'fs';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, push } from 'firebase/database';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config();

// Configuración de Firebase
const firebaseConfig = {
  apiKey: process.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.PUBLIC_FIREBASE_APP_ID
};

class CBZFirebaseUploader {
  constructor() {
    this.app = initializeApp(firebaseConfig);
    this.database = getDatabase(this.app);
    this.stats = {
      totalSeries: 0,
      totalIssues: 0,
      cbzOnly: 0,
      skipped: 0
    };
  }

  /**
   * Cargar y filtrar JSON para solo CBZ
   */
  async loadAndFilterCBZ(jsonFile) {
    console.log(`📖 Cargando ${jsonFile}...`);
    
    const jsonContent = await fs.readFile(jsonFile, 'utf8');
    const data = JSON.parse(jsonContent);
    
    console.log(`📊 JSON original: ${data.comics.length} series, ${data.metadata.stats.totalIssues} issues`);
    
    // Filtrar solo CBZ
    const cbzOnlyComics = [];
    
    for (const series of data.comics) {
      const cbzIssues = series.issues.filter(issue => issue.format === 'cbz');
      
      if (cbzIssues.length > 0) {
        cbzOnlyComics.push({
          title: series.title,
          issues: cbzIssues
        });
        this.stats.cbzOnly += cbzIssues.length;
      } else {
        this.stats.skipped++;
      }
    }
    
    this.stats.totalSeries = cbzOnlyComics.length;
    this.stats.totalIssues = this.stats.cbzOnly;
    
    console.log(`✅ CBZ filtrados: ${this.stats.totalSeries} series, ${this.stats.totalIssues} issues`);
    console.log(`⏭️  Series sin CBZ omitidas: ${this.stats.skipped}`);
    
    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        baseUrl: data.metadata.baseUrl,
        stats: this.stats,
        source: 'CBZ-only filtered from complete comics catalog'
      },
      comics: cbzOnlyComics
    };
  }

  /**
   * Crear estructura plana para Firebase
   */
  createFirebaseStructures(cbzData) {
    const structures = {
      comics_cbz: [], // Lista plana de archivos CBZ
      comicsByFolder_cbz: {}, // Organizados por carpeta
      comicsMetadata_cbz: {}, // Metadata por archivo
      comicsStructure_cbz: {} // Estructura de directorios
    };

    const folderMap = new Map();
    
    for (const series of cbzData.comics) {
      for (const issue of series.issues) {
        // Lista plana
        structures.comics_cbz.push(issue.filename);
        
        // Por carpeta
        const folderPath = issue.path.split('/').slice(0, -1).join('/');
        if (!folderMap.has(folderPath)) {
          folderMap.set(folderPath, []);
        }
        folderMap.get(folderPath).push(issue.filename);
        
        // Metadata
        structures.comicsMetadata_cbz[issue.filename] = {
          title: issue.title,
          series: series.title,
          number: issue.number,
          url: issue.url,
          path: issue.path,
          format: 'cbz'
        };
      }
    }
    
    // Convertir folders a objeto
    structures.comicsByFolder_cbz = Object.fromEntries(folderMap);
    
    // Estructura de directorios (simplificada)
    const dirStructure = {};
    for (const [folder, files] of folderMap) {
      const parts = folder.split('/');
      let current = dirStructure;
      
      for (const part of parts) {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
    }
    structures.comicsStructure_cbz = dirStructure;
    
    return structures;
  }

  /**
   * Subir a Firebase
   */
  async uploadToFirebase(structures) {
    console.log('🚀 Subiendo a Firebase...');
    
    try {
      // Subir cada estructura
      for (const [key, data] of Object.entries(structures)) {
        console.log(`📤 Subiendo ${key}... (${JSON.stringify(data).length} bytes)`);
        
        const dbRef = ref(this.database, key);
        await set(dbRef, data);
        
        console.log(`✅ ${key} subido exitosamente`);
      }
      
      console.log('🎉 ¡Todas las estructuras subidas correctamente!');
      
    } catch (error) {
      console.error('❌ Error subiendo a Firebase:', error);
      throw error;
    }
  }

  /**
   * Proceso principal
   */
  async process(jsonFile) {
    try {
      // 1. Filtrar CBZ del JSON
      console.log('🎯 Paso 1: Filtrando archivos CBZ...');
      const cbzData = await this.loadAndFilterCBZ(jsonFile);
      
      // 2. Crear estructuras Firebase
      console.log('🏗️  Paso 2: Creando estructuras Firebase...');
      const structures = this.createFirebaseStructures(cbzData);
      
      // 3. Mostrar resumen
      console.log('\n📊 Resumen de estructuras:');
      console.log(`   comics_cbz: ${structures.comics_cbz.length} archivos`);
      console.log(`   comicsByFolder_cbz: ${Object.keys(structures.comicsByFolder_cbz).length} carpetas`);
      console.log(`   comicsMetadata_cbz: ${Object.keys(structures.comicsMetadata_cbz).length} metadata entries`);
      
      // 4. Confirmar subida
      console.log('\\n✅ SEGURO: Solo añade nuevas estructuras CBZ, NO modifica datos existentes');
      console.log('Creará: comics_cbz, comicsByFolder_cbz, comicsMetadata_cbz, comicsStructure_cbz');
      
      // 5. Subir a Firebase
      console.log('\\n🚀 Paso 3: Subiendo a Firebase...');
      await this.uploadToFirebase(structures);
      
      // 6. Estadísticas finales
      console.log('\\n📊 Estadísticas finales:');
      console.log(`   ✅ Series CBZ: ${this.stats.totalSeries}`);
      console.log(`   ✅ Issues CBZ: ${this.stats.totalIssues}`);
      console.log(`   ⏭️  Series omitidas (sin CBZ): ${this.stats.skipped}`);
      
      console.log('\\n🎉 ¡Proceso completado exitosamente!');
      
    } catch (error) {
      console.error('💥 Error en el proceso:', error);
      throw error;
    }
  }
}

// Función principal
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    console.log(`
📚 Uploader de CBZ a Firebase para LecturAPP

Uso: node scripts/upload-cbz-to-firebase.js <comics-json-file>

Este script:
• Filtra solo archivos CBZ del JSON completo
• Crea estructuras Firebase optimizadas
• Sube comics_cbz, comicsByFolder_cbz, etc.
• Mantiene compatibilidad con estructura existente

Ejemplo:
  node scripts/upload-cbz-to-firebase.js comics-complete.json
`);
    process.exit(0);
  }
  
  const jsonFile = args[0];
  
  try {
    const uploader = new CBZFirebaseUploader();
    await uploader.process(jsonFile);
    
  } catch (error) {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  }
}

// Ejecutar
main().catch(error => {
  console.error('💥 Error crítico:', error);
  process.exit(1);
});