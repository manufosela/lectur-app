import AWS from 'aws-sdk';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Verificando configuración AWS:');
console.log('   Access Key:', process.env.AWS_ACCESS_KEY_ID?.substring(0,10) + '...');
console.log('   Secret Key:', process.env.AWS_SECRET_ACCESS_KEY ? '✅ Configurada' : '❌ NO configurada');
console.log('   Region:', process.env.AWS_REGION);
console.log('   Bucket:', process.env.S3_BUCKET_NAME);

// Configurar AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'eu-west-1'
});

const s3 = new AWS.S3();

// Probar listado simple
async function testS3() {
  try {
    console.log('\n📋 Probando conexión S3...');
    const result = await s3.listObjectsV2({
      Bucket: process.env.S3_BUCKET_NAME,
      MaxKeys: 5
    }).promise();
    
    console.log('✅ Conexión exitosa!');
    console.log(`   Archivos en bucket: ${result.Contents?.length || 0}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'SignatureDoesNotMatch') {
      console.log('\n⚠️  Posibles causas:');
      console.log('   1. La Secret Key tiene espacios o saltos de línea');
      console.log('   2. La región no coincide con el bucket');
      console.log('   3. Las credenciales han expirado');
    }
  }
}

testS3();