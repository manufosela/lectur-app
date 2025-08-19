import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Inicializa AWS S3
 */
export function initializeS3() {
  try {
    AWS.config.update({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'eu-west-1'
    });
    
    const s3 = new AWS.S3();
    console.log('☁️  AWS S3 inicializado correctamente');
    return s3;
  } catch (error) {
    console.error('❌ Error inicializando S3:', error.message);
    throw error;
  }
}

/**
 * Verifica si un archivo ya existe en S3
 * @param {AWS.S3} s3 
 * @param {string} bucketName 
 * @param {string} key 
 * @returns {Promise<boolean>}
 */
async function fileExistsInS3(s3, bucketName, key) {
  try {
    await s3.headObject({
      Bucket: bucketName,
      Key: key
    }).promise();
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Sube un archivo EPUB a S3
 * @param {string} filePath - Ruta local del archivo
 * @param {string} fileName - Nombre del archivo
 * @param {Object} metadata - Metadatos del libro
 * @returns {Promise<boolean>}
 */
export async function uploadToS3(filePath, fileName, metadata) {
  return uploadBookToS3(filePath, metadata);
}

/**
 * Sube un archivo EPUB a S3
 * @param {string} filePath - Ruta local del archivo
 * @param {Object} metadata - Metadatos del libro
 * @returns {Promise<boolean>}
 */
export async function uploadBookToS3(filePath, metadata) {
  try {
    const s3 = initializeS3();
    const bucketName = process.env.S3_BUCKET_NAME;
    const filename = path.basename(filePath);
    
    console.log(`☁️  Subiendo a S3: ${filename}`);
    
    // Verificar si ya existe
    const exists = await fileExistsInS3(s3, bucketName, filename);
    if (exists) {
      console.log(`   ⚠️  Archivo ya existe en S3: ${filename}`);
      return true;
    }
    
    // Leer archivo
    const fileContent = fs.readFileSync(filePath);
    const fileSize = fs.statSync(filePath).size;
    
    console.log(`   📊 Tamaño: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    
    // Parámetros de subida
    const uploadParams = {
      Bucket: bucketName,
      Key: filename,
      Body: fileContent,
      ContentType: 'application/epub+zip',
      Metadata: {
        'title': metadata.title || 'Título desconocido',
        'author': metadata.author || 'Autor desconocido',
        'uploaded-date': new Date().toISOString()
      },
      ServerSideEncryption: 'AES256',
      StorageClass: 'STANDARD_IA' // Clase de almacenamiento más económica
    };
    
    // Subir archivo
    const result = await s3.upload(uploadParams).promise();
    
    console.log(`   ✅ Subido exitosamente a S3`);
    console.log(`   🔗 URL: ${result.Location}`);
    
    return true;
    
  } catch (error) {
    console.error(`❌ Error subiendo ${path.basename(filePath)} a S3:`, error.message);
    return false;
  }
}

/**
 * Sube múltiples libros a S3 en lotes
 * @param {Array} booksMetadata - Array de metadatos con rutas de archivos
 * @param {number} batchSize - Tamaño del lote
 */
export async function uploadBooksToS3Batch(booksMetadata, batchSize = 3) {
  console.log(`☁️  Subiendo ${booksMetadata.length} libros a S3 en lotes de ${batchSize}`);
  
  let processed = 0;
  let successful = 0;
  let failed = 0;
  let totalSize = 0;
  
  for (let i = 0; i < booksMetadata.length; i += batchSize) {
    const batch = booksMetadata.slice(i, i + batchSize);
    
    console.log(`\n📦 Subiendo lote ${Math.floor(i / batchSize) + 1}/${Math.ceil(booksMetadata.length / batchSize)}`);
    
    const promises = batch.map(async (book) => {
      const fileSize = fs.statSync(book.filePath).size;
      const success = await uploadBookToS3(book.filePath, book);
      processed++;
      if (success) {
        successful++;
        totalSize += fileSize;
      } else {
        failed++;
      }
      return success;
    });
    
    await Promise.all(promises);
    
    console.log(`📊 Progreso S3: ${processed}/${booksMetadata.length} (✅ ${successful} | ❌ ${failed})`);
    console.log(`💾 Tamaño total subido: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    
    // Pausa entre lotes para no sobrecargar
    if (i + batchSize < booksMetadata.length) {
      console.log('⏸️  Pausa entre lotes...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log(`\n🎉 Subida a S3 completada:`);
  console.log(`   ✅ Exitosos: ${successful}`);
  console.log(`   ❌ Fallidos: ${failed}`);
  console.log(`   📊 Total: ${processed}`);
  console.log(`   💾 Tamaño total: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   💰 Coste estimado: $${(totalSize / 1024 / 1024 / 1024 * 0.023).toFixed(4)}/mes`);
}

/**
 * Lista archivos en el bucket S3
 * @returns {Promise<Array>}
 */
export async function listS3Files() {
  try {
    const s3 = initializeS3();
    const bucketName = process.env.S3_BUCKET_NAME;
    
    const params = {
      Bucket: bucketName,
      MaxKeys: 1000
    };
    
    const result = await s3.listObjectsV2(params).promise();
    
    console.log(`📋 Archivos en S3 (${bucketName}): ${result.Contents.length}`);
    
    return result.Contents.map(obj => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified
    }));
    
  } catch (error) {
    console.error('❌ Error listando archivos S3:', error.message);
    return [];
  }
}