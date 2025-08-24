# Upload Missing NAS Books Script

## Overview

The `upload-missing-nas-books.js` script is a comprehensive solution for uploading missing EPUB books from your NAS directory to AWS S3 and adding them to Firebase Realtime Database. It's designed to be cost-optimized, resumable, and error-resistant.

## Features

### 🔍 Smart Detection
- **Recursive NAS scanning**: Scans your entire NAS directory structure for EPUB files
- **Cost-optimized checking**: Verifies S3 first before uploading to avoid unnecessary transfers
- **Cross-platform compatibility**: Works on Linux, macOS, and Windows

### ☁️ AWS S3 Integration
- **Duplicate detection**: Checks if files already exist in S3 before uploading
- **Cost-optimized storage**: Uses Standard-IA storage class for reduced costs
- **Metadata enrichment**: Adds book title, author, and upload information as S3 metadata
- **Server-side encryption**: All uploads use AES256 encryption

### 🔥 Firebase Integration
- **Automatic database updates**: Updates `/libros`, `/autores`, and `/librosPorAutor` collections
- **Batch operations**: Efficient batch updates to minimize Firebase operations
- **Duplicate prevention**: Prevents duplicate entries in Firebase

### 📖 EPUB Processing
- **Metadata extraction**: Automatically extracts title and author from EPUB files
- **Fallback handling**: Uses filename patterns when metadata extraction fails
- **Error resilience**: Continues processing even if individual EPUBs are corrupted

### 🚀 Performance & Reliability
- **Batch processing**: Processes files in configurable batches
- **Progress tracking**: Real-time progress reporting with detailed statistics
- **State persistence**: Resumable operations with automatic state saving
- **Error handling**: Graceful error handling with detailed error reporting
- **Cost estimation**: Provides upfront cost estimates before processing

## Installation

1. Ensure you have all dependencies installed:
```bash
cd upload-script
npm install
```

2. Configure your environment variables in `.env`:
```bash
# NAS Configuration
NAS_BOOKS_FOLDER=/path/to/your/nas/books

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=eu-west-1
S3_BUCKET_NAME=lectur-app-storage

# Firebase Configuration
FIREBASE_PROJECT_ID=lectur-app
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@lectur-app.iam.gserviceaccount.com
FIREBASE_DATABASE_URL=https://lectur-app-default-rtdb.europe-west1.firebasedatabase.app
```

## Usage

### Basic Usage
```bash
npm run upload-missing
```

### Automated Usage (no confirmation prompts)
```bash
npm run upload-missing-auto
```

### Direct execution with options
```bash
# With confirmation prompt
node upload-missing-nas-books.js

# Without confirmation prompt
node upload-missing-nas-books.js --auto

# Show help
node upload-missing-nas-books.js --help
```

## How It Works

### Step 1: Directory Scanning
- Recursively scans the configured NAS directory
- Finds all `.epub` files regardless of subdirectory depth
- Collects file metadata (name, size, path)

### Step 2: Existing File Detection
- Queries S3 bucket to get list of existing files
- Queries Firebase Database to get list of registered books
- Creates efficient lookup sets for O(1) duplicate checking

### Step 3: Missing File Identification
- Compares NAS files against S3 and Firebase inventories
- Identifies files missing from either or both services
- Provides detailed statistics on what needs to be processed

### Step 4: Cost Estimation
- Calculates total size of files to be uploaded
- Estimates S3 storage costs based on Standard-IA pricing
- Displays cost breakdown before proceeding

### Step 5: Batch Upload Processing
- Processes files in configurable batches (default: 10 files)
- Extracts EPUB metadata (title, author) for each file
- Uploads to S3 with rich metadata and encryption
- Tracks success/failure for each file

### Step 6: Firebase Database Update
- Batch updates Firebase Realtime Database
- Updates `/libros` array with new filenames
- Updates `/autores` array with new authors
- Updates `/librosPorAutor` mappings for book-author relationships

### Step 7: Progress Reporting
- Generates comprehensive final report
- Includes processing statistics, costs, and timing
- Lists any failed uploads with error details

## Configuration Options

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NAS_BOOKS_FOLDER` | Yes | Path to NAS books directory | `/mnt/nas/books` |
| `S3_BUCKET_NAME` | Yes | AWS S3 bucket name | `lectur-app-storage` |
| `AWS_ACCESS_KEY_ID` | Yes | AWS access key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | Yes | AWS secret key | `...` |
| `AWS_REGION` | No | AWS region (default: eu-west-1) | `eu-west-1` |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID | `lectur-app` |
| `FIREBASE_PRIVATE_KEY` | Yes | Firebase private key | `-----BEGIN...` |
| `FIREBASE_CLIENT_EMAIL` | Yes | Firebase client email | `firebase-adminsdk-...` |
| `FIREBASE_DATABASE_URL` | Yes | Firebase database URL | `https://...` |

### Script Configuration

You can modify these constants in the script:

```javascript
const BATCH_SIZE = 10; // Files to process in parallel
const DB_BATCH_SIZE = 20; // Database batch update size
```

## State Management

The script automatically saves its progress to `upload-missing-state.json`. This allows you to:

- **Resume interrupted operations**: Restart from where you left off
- **Track long-running operations**: Monitor progress across multiple sessions
- **Avoid re-processing**: Skip files that were already successfully processed

### State File Contents

```json
{
  "totalNasFiles": 1500,
  "processed": 750,
  "uploaded": 700,
  "errors": 5,
  "skipped": 45,
  "startTime": "2024-01-15T10:30:00.000Z",
  "lastProcessedFile": "book-title.epub",
  "uploadedFiles": [...],
  "failedFiles": [...]
}
```

## Error Handling

### Graceful Degradation
- Individual file failures don't stop the entire process
- Detailed error logging for troubleshooting
- Automatic retry mechanisms for transient failures

### Signal Handling
- Handles `SIGINT` (Ctrl+C) gracefully
- Handles `SIGTERM` for clean shutdowns
- Always saves state before exiting

### Common Issues and Solutions

#### Permission Errors
```bash
# If you get permission errors accessing NAS
sudo chown -R $USER:$USER /path/to/nas/books
```

#### AWS Credentials
```bash
# Verify AWS credentials
aws s3 ls s3://lectur-app-storage
```

#### Firebase Connection
```bash
# Test Firebase connection
node -e "require('./firebase-manager.js').initializeFirebaseAdmin().database().ref('libros').once('value').then(s => console.log('Firebase OK:', s.numChildren()))"
```

## Cost Optimization

### S3 Storage Classes
- Uses **Standard-IA** (Infrequent Access) by default
- 40% cheaper than Standard storage
- Perfect for book archives that aren't accessed frequently

### Transfer Optimization
- Pre-checks S3 to avoid re-uploading existing files
- Batch processing reduces API overhead
- Efficient metadata queries minimize Firebase operations

### Cost Estimation Formula
```javascript
// S3 Standard-IA pricing (eu-west-1)
const monthlyCost = (totalGB) * 0.0125; // $0.0125 per GB/month
const uploadCost = (totalGB) * 0.01;    // $0.01 per GB uploaded
```

## Monitoring and Logging

### Real-time Progress
```
📦 Lote 3/15 (10 archivos)
[27/150] 📚 El-Quijote-Cervantes.epub
  📖 Extrayendo metadatos...
  ☁️  Subiendo a S3...
  📊 Tamaño: 2.34 MB
  ✅ Subido exitosamente a S3
  🔥 Actualizando Firebase...
  ✅ Éxito (27/27)

📊 Lote completado: 27/150
   ✅ Subidos: 25 | ⏭️  Saltados: 2 | ❌ Errores: 0
```

### Final Report
```
🎉 PROCESO COMPLETADO
==================================================
📊 Estadísticas finales:
   📁 Archivos escaneados: 1500
   📦 Archivos faltantes: 150
   ✅ Subidos exitosamente: 145
   ⏭️  Saltados (ya existían): 3
   ❌ Errores: 2
   💾 Tamaño estimado subido: 290.50 MB
   💰 Coste estimado S3: $0.0036/mes
   ⏰ Duración: 1847 segundos
```

## Integration with Existing Scripts

This script complements the existing upload ecosystem:

- **`sync-new-books.js`**: Similar functionality but different implementation
- **`upload-nas-to-s3.js`**: S3-only upload without Firebase integration
- **`migrate-firebase-to-s3.js`**: Migration from Firebase Storage to S3

Choose the script that best fits your needs:
- Use `upload-missing-nas-books.js` for comprehensive NAS→S3+Firebase sync
- Use `sync-new-books.js` for simpler workflows
- Use `upload-nas-to-s3.js` for S3-only uploads

## Troubleshooting

### Debug Mode
Add debug logging by modifying the script:
```javascript
const DEBUG = true; // Add at top of file
```

### Verbose AWS Logging
```bash
export AWS_SDK_LOAD_CONFIG=1
export AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE=1
```

### Check Dependencies
```bash
node -e "console.log('AWS SDK:', require('aws-sdk').VERSION)"
node -e "console.log('Firebase Admin:', require('firebase-admin').SDK_VERSION)"
```

### Manual State Reset
If you need to start fresh:
```bash
rm upload-missing-state.json
```

## Security Considerations

### Credentials
- Never commit `.env` files to version control
- Use AWS IAM roles with minimal required permissions
- Rotate Firebase service account keys regularly

### S3 Permissions
Minimum required S3 permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:HeadObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::lectur-app-storage",
        "arn:aws:s3:::lectur-app-storage/*"
      ]
    }
  ]
}
```

### Firebase Permissions
Service account needs:
- Firebase Realtime Database Admin
- No additional permissions required

## Support

For issues or questions:
1. Check the console output for specific error messages
2. Verify all environment variables are correctly set
3. Ensure AWS and Firebase credentials have proper permissions
4. Check network connectivity to AWS and Firebase
5. Review the state file for processing history