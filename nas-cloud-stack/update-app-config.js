#!/usr/bin/env node

/**
 * Script para actualizar las URLs de S3 a MinIO local
 * Ejecutar cuando tengas MinIO funcionando
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const MINIO_DOMAIN = process.env.MINIO_DOMAIN || 'storage.tu-dominio.dyndns.org';
const APP_PATH = path.join(__dirname, '..');

console.log('🔄 Actualizando configuración de la app para usar MinIO local...');

// Archivos a modificar
const filesToUpdate = [
  'public/js/app.js',
  'public/js/audiobook-player.js', 
  'public/js/comic-reader.js'
];

// Función para actualizar URLs en un archivo
function updateFileUrls(filePath) {
  const fullPath = path.join(APP_PATH, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️  Archivo no encontrado: ${filePath}`);
    return;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let updated = false;
  
  // Reemplazar URLs de S3 por MinIO
  const replacements = [
    // S3 URLs específicas
    {
      pattern: /https:\/\/lectur-app-personal\.s3\.eu-west-1\.amazonaws\.com/g,
      replacement: `https://${MINIO_DOMAIN}`
    },
    // URLs genéricas de S3 (por si hay otras)
    {
      pattern: /https:\/\/[^.]+\.s3\.[^.]+\.amazonaws\.com/g,
      replacement: `https://${MINIO_DOMAIN}`
    }
  ];
  
  replacements.forEach(({ pattern, replacement }) => {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
      updated = true;
    }
  });
  
  // Actualizar lógica de buckets si es necesario
  // Para MinIO, los buckets van en el path: domain.com/bucket/file
  const bucketUpdates = [
    {
      // Cambiar la estructura de URLs para incluir buckets
      pattern: /const s3Url = `https:\/\/([^/]+)\/\$\{encodeURIComponent\(([^}]+)\)\}`/g,
      replacement: `const minioUrl = \`https://$1/libros/\${encodeURIComponent($2)}\``
    },
    {
      // Para cómics
      pattern: /const s3Url = `https:\/\/([^/]+)\/\$\{encodeURIComponent\(([^}]+)\)\}`;[\s\n]*\/\/ Para comics/g,
      replacement: `const minioUrl = \`https://$1/comics/\${encodeURIComponent($2)}\`;`
    },
    {
      // Para audiolibros
      pattern: /const s3Url = `https:\/\/([^/]+)\/\$\{encodeURIComponent\(([^}]+)\)\}`;[\s\n]*\/\/ Para audiolibros/g,
      replacement: `const minioUrl = \`https://$1/audiolibros/\${encodeURIComponent($2)}\`;`
    }
  ];
  
  bucketUpdates.forEach(({ pattern, replacement }) => {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
      updated = true;
    }
  });
  
  if (updated) {
    // Crear backup
    fs.writeFileSync(`${fullPath}.backup`, fs.readFileSync(fullPath));
    
    // Escribir archivo actualizado
    fs.writeFileSync(fullPath, content);
    console.log(`✅ Actualizado: ${filePath}`);
  } else {
    console.log(`ℹ️  Sin cambios: ${filePath}`);
  }
}

// Función para crear nuevo archivo de configuración híbrida
function createHybridConfig() {
  const configPath = path.join(APP_PATH, 'public/js/storage-config.js');
  
  const hybridConfig = `/**
 * Configuración de almacenamiento híbrido
 * MinIO local + S3 como fallback
 */

const STORAGE_CONFIG = {
  // MinIO local (primario)
  minio: {
    domain: '${MINIO_DOMAIN}',
    buckets: {
      books: 'libros',
      comics: 'comics',
      audiobooks: 'audiolibros'
    }
  },
  
  // S3 como fallback
  s3: {
    domain: 'lectur-app-personal.s3.eu-west-1.amazonaws.com',
    buckets: {
      books: '',  // Sin bucket, archivos directos
      comics: '',
      audiobooks: ''
    }
  }
};

/**
 * Obtener URL de archivo con fallback automático
 * @param {string} filePath - Ruta del archivo
 * @param {'books'|'comics'|'audiobooks'} type - Tipo de contenido
 * @returns {Promise<string>} URL del archivo
 */
export const getFileUrl = async (filePath, type = 'books') => {
  const minioUrl = \`https://\${STORAGE_CONFIG.minio.domain}/\${STORAGE_CONFIG.minio.buckets[type]}/\${encodeURIComponent(filePath)}\`;
  
  try {
    // Intentar MinIO primero
    const response = await fetch(minioUrl, { method: 'HEAD' });
    if (response.ok) {
      return minioUrl;
    }
  } catch (error) {
    console.log('MinIO no disponible, usando S3 fallback...');
  }
  
  // Fallback a S3
  const s3Url = \`https://\${STORAGE_CONFIG.s3.domain}/\${encodeURIComponent(filePath)}\`;
  return s3Url;
};

/**
 * Obtener URL de archivo directamente desde MinIO (sin fallback)
 * @param {string} filePath - Ruta del archivo  
 * @param {'books'|'comics'|'audiobooks'} type - Tipo de contenido
 * @returns {string} URL del archivo
 */
export const getMinIOUrl = (filePath, type = 'books') => {
  return \`https://\${STORAGE_CONFIG.minio.domain}/\${STORAGE_CONFIG.minio.buckets[type]}/\${encodeURIComponent(filePath)}\`;
};

/**
 * Obtener URL de archivo directamente desde S3 (sin fallback)
 * @param {string} filePath - Ruta del archivo
 * @returns {string} URL del archivo  
 */
export const getS3Url = (filePath) => {
  return \`https://\${STORAGE_CONFIG.s3.domain}/\${encodeURIComponent(filePath)}\`;
};

export default STORAGE_CONFIG;
`;

  fs.writeFileSync(configPath, hybridConfig);
  console.log('✅ Creado: public/js/storage-config.js');
}

// Ejecutar actualizaciones
console.log(`🎯 MinIO Domain: ${MINIO_DOMAIN}`);
console.log(`📁 App Path: ${APP_PATH}`);

filesToUpdate.forEach(updateFileUrls);
createHybridConfig();

console.log('');
console.log('✅ Actualización completada!');
console.log('');
console.log('📝 Próximos pasos:');
console.log('1. Verifica que MinIO esté funcionando');
console.log('2. Copia tus archivos a los buckets correctos en MinIO');
console.log('3. Prueba la aplicación');
console.log('4. Si todo funciona, considera desactivar S3 para ahorrar costos');
console.log('');
console.log('🔄 Para revertir cambios, usa los archivos .backup creados');