#!/usr/bin/env node

import AWS from 'aws-sdk';
import dotenv from 'dotenv';

dotenv.config();

// Configurar AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

async function findBook() {
  console.log('🔍 Buscando el libro problemático en S3...');
  
  try {
    let continuationToken = null;
    let found = false;
    const searchTerms = ['50_cosas', '50 cosas', 'universo', 'joanne', 'baker'];
    const allMatches = [];
    
    do {
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        MaxKeys: 1000
      };
      
      if (continuationToken) {
        params.ContinuationToken = continuationToken;
      }
      
      console.log('📄 Buscando...');
      const data = await s3.listObjectsV2(params).promise();
      
      // Buscar coincidencias
      data.Contents.forEach(object => {
        const filename = object.Key.toLowerCase();
        
        // Buscar coincidencias con los términos
        if (searchTerms.some(term => filename.includes(term))) {
          allMatches.push({
            key: object.Key,
            size: object.Size,
            lastModified: object.LastModified
          });
        }
      });
      
      continuationToken = data.NextContinuationToken;
      
    } while (continuationToken);
    
    console.log(`\n📊 Encontradas ${allMatches.length} coincidencias:`);
    
    if (allMatches.length === 0) {
      console.log('❌ No se encontró el libro en S3');
      console.log('💡 Esto significa que no se migró correctamente');
      return;
    }
    
    allMatches.forEach((match, index) => {
      console.log(`\n${index + 1}. ${match.key}`);
      console.log(`   Tamaño: ${(match.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Modificado: ${match.lastModified}`);
      
      // Probar URL de acceso
      const url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodeURIComponent(match.key)}`;
      console.log(`   URL: ${url}`);
    });
    
    // Buscar el más probable
    const exactMatch = allMatches.find(m => 
      m.key.toLowerCase().includes('50') &&
      m.key.toLowerCase().includes('cosas') &&
      m.key.toLowerCase().includes('universo') &&
      (m.key.toLowerCase().includes('joanne') || m.key.toLowerCase().includes('baker'))
    );
    
    if (exactMatch) {
      console.log(`\n🎯 Coincidencia más probable: ${exactMatch.key}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

findBook();