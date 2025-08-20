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

async function checkBucketPolicy() {
  try {
    console.log('🔍 Verificando política del bucket...');
    
    const policy = await s3.getBucketPolicy({
      Bucket: process.env.S3_BUCKET_NAME
    }).promise();
    
    console.log('✅ Política encontrada:');
    console.log(JSON.stringify(JSON.parse(policy.Policy), null, 2));
    
  } catch (error) {
    console.error('❌ Error obteniendo política:', error.message);
    if (error.code === 'NoSuchBucketPolicy') {
      console.error('🚨 NO HAY POLÍTICA EN EL BUCKET - Este es el problema');
      console.error('💡 La política no se guardó correctamente en AWS Console');
    }
  }
}

async function checkBucketACL() {
  try {
    console.log('\n🔍 Verificando ACL del bucket...');
    
    const acl = await s3.getBucketAcl({
      Bucket: process.env.S3_BUCKET_NAME
    }).promise();
    
    console.log('📋 Grants actuales:');
    acl.Grants.forEach(grant => {
      console.log(`- ${grant.Grantee?.Type}: ${grant.Permission}`);
      if (grant.Grantee?.URI) {
        console.log(`  URI: ${grant.Grantee.URI}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo ACL:', error.message);
  }
}

// Ejecutar
console.log(`🔍 Verificando bucket: ${process.env.S3_BUCKET_NAME}`);
await checkBucketPolicy();
await checkBucketACL();