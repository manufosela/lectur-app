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

const corsConfiguration = {
  CORSRules: [
    {
      AllowedHeaders: ['*'],
      AllowedMethods: ['GET', 'HEAD'],
      AllowedOrigins: [
        'http://localhost:4321',
        'http://localhost:5000', 
        'https://lectur-app.web.app',
        'https://lectur-app.firebaseapp.com',
        '*'  // Permitir todos los orígenes para pruebas
      ],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3000
    }
  ]
};

async function configureCORS() {
  try {
    console.log('🔧 Configurando CORS para el bucket S3...');
    
    await s3.putBucketCors({
      Bucket: process.env.S3_BUCKET_NAME,
      CORSConfiguration: corsConfiguration
    }).promise();
    
    console.log('✅ CORS configurado exitosamente');
    
    // Verificar la configuración
    const currentCors = await s3.getBucketCors({
      Bucket: process.env.S3_BUCKET_NAME
    }).promise();
    
    console.log('\n📋 Configuración CORS actual:');
    console.log(JSON.stringify(currentCors.CORSRules, null, 2));
    
  } catch (error) {
    console.error('❌ Error configurando CORS:', error.message);
    if (error.code === 'NoSuchBucket') {
      console.error('El bucket no existe');
    } else if (error.code === 'AccessDenied') {
      console.error('No tienes permisos para modificar CORS del bucket');
    }
  }
}

// Ejecutar
configureCORS();