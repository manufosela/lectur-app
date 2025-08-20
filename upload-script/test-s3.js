#!/usr/bin/env node

import AWS from 'aws-sdk';
import dotenv from 'dotenv';

dotenv.config();

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

console.log('🔍 Probando credenciales AWS S3...');

s3.listObjects({ Bucket: process.env.S3_BUCKET_NAME, MaxKeys: 5 }, (err, data) => {
  if (err) {
    console.error('❌ Error:', err.message);
  } else {
    console.log('✅ Credenciales funcionan. Primeros 5 objetos:');
    data.Contents?.forEach((obj, i) => {
      console.log(`${i + 1}. ${obj.Key}`);
    });
  }
  process.exit(0);
});
