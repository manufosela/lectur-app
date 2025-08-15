# 📚 Upload Books Script

Script automatizado para procesar libros EPUB y subirlos a Firebase + S3.

## Características

- ✅ **Extracción de metadatos**: Lee título y autor de archivos EPUB
- 🔥 **Firebase Integration**: Actualiza base de datos con libros y autores
- ☁️ **AWS S3 Upload**: Sube archivos a S3 con metadatos
- 📊 **Procesamiento por lotes**: Evita sobrecargar servicios
- 🔄 **Deduplicación**: No procesa libros ya subidos
- 📈 **Estadísticas**: Reportes de progreso y costes

## Instalación

```bash
cd upload-script
npm install
```

## Configuración

1. **Copia el archivo de configuración**:
```bash
cp .env.example .env
```

2. **Completa las variables de entorno en `.env`**:

### Firebase Admin SDK
```env
FIREBASE_PROJECT_ID=lectur-app
FIREBASE_PRIVATE_KEY_ID=tu_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\ntu_private_key\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@lectur-app.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=tu_client_id
FIREBASE_DATABASE_URL=https://lectur-app-default-rtdb.europe-west1.firebasedatabase.app
```

### AWS S3
```env
AWS_ACCESS_KEY_ID=tu_access_key
AWS_SECRET_ACCESS_KEY=tu_secret_key
AWS_REGION=eu-west-1
S3_BUCKET_NAME=tu-bucket-name
```

### Configuración local
```env
BOOKS_FOLDER=./libros
PROCESSED_LOG=./processed-books.json
```

## Obtener credenciales

### Firebase Admin SDK
1. Ve a [Firebase Console](https://console.firebase.google.com)
2. Selecciona tu proyecto
3. Ve a **Configuración del proyecto** > **Cuentas de servicio**
4. Haz clic en **Generar nueva clave privada**
5. Descarga el archivo JSON y extrae los valores

### AWS S3
1. Ve a [AWS IAM Console](https://console.aws.amazon.com/iam/)
2. Crea un usuario con permisos S3
3. Genera Access Key y Secret Key
4. Crea un bucket S3 en tu región preferida

## Uso

### 1. Preparar archivos
```bash
mkdir libros
# Copia tus archivos EPUB a la carpeta libros/
```

### 2. Probar extracción de metadatos
```bash
npm run test
```

### 3. Subir libros (modo interactivo)
```bash
npm run upload
```

### 4. Subir libros (modo automático)
```bash
npm run upload -- --auto
```

### 5. Ver estadísticas
```bash
npm run upload -- --stats
```

### 6. Listar archivos en S3
```bash
npm run upload -- --list-s3
```

## Estructura de archivos

```
upload-script/
├── package.json          # Dependencias y scripts
├── .env                  # Variables de entorno (no incluir en git)
├── .env.example          # Ejemplo de configuración
├── upload-books.js       # Script principal
├── test-epub.js          # Script de prueba
├── epub-parser.js        # Extractor de metadatos EPUB
├── firebase-manager.js   # Gestión de Firebase
├── s3-manager.js         # Gestión de S3
├── processed-books.json  # Log de libros procesados
└── libros/               # Carpeta con archivos EPUB
```

## Cómo funciona

1. **Escaneo**: Lee todos los archivos `.epub` en la carpeta
2. **Extracción**: Extrae título y autor del archivo OPF del EPUB
3. **Filtrado**: Omite libros ya procesados (usa `processed-books.json`)
4. **Firebase**: Actualiza listas de libros, autores y relaciones
5. **S3**: Sube archivos con metadatos y encriptación
6. **Log**: Guarda registro de libros procesados

## Estructura en Firebase

```json
{
  "libros": ["libro1.epub", "libro2.epub", ...],
  "autores": ["Autor 1", "Autor 2", ...],
  "librosPorAutor": {
    "Autor_1": {
      "libro_123": "libro1.epub",
      "libro_456": "libro2.epub"
    }
  }
}
```

## Estructura en S3

```
tu-bucket/
├── libro1.epub
├── libro2.epub
└── ...
```

Cada archivo incluye metadatos:
- `title`: Título del libro
- `author`: Autor del libro  
- `uploaded-date`: Fecha de subida

## Costes estimados

Para 1000 libros (~10GB):
- **S3 Storage**: ~$0.23/mes
- **S3 Requests**: ~$0.01
- **Firebase**: Gratis (bajo tier)

## Solución de problemas

### Error: PERMISSION_DENIED
- Verifica que las credenciales de Firebase sean correctas
- Asegúrate de que el usuario tenga permisos de escritura

### Error: Access Denied (S3)
- Verifica las credenciales AWS
- Asegúrate de que el bucket existe y tienes permisos

### Error: EPUB parsing
- Algunos archivos EPUB pueden estar corruptos
- El script usa fallback basado en nombre de archivo

### Memoria insuficiente
- Reduce el tamaño de lote (`batchSize`)
- Procesa archivos en grupos más pequeños

## Ejemplo de salida

```
🚀 INICIANDO PROCESAMIENTO DE LIBROS EPUB
==========================================

📖 PASO 1: ESCANEANDO LIBROS EPUB
================================

📁 Escaneando carpeta: ./libros
📚 Encontrados 15 archivos EPUB
📖 Procesando: El_infinito_en_un_junco.epub
✅ Metadatos extraídos:
   📚 Título: El infinito en un junco
   👤 Autor: Irene Vallejo
   📄 Archivo: El_infinito_en_un_junco.epub

📊 Resumen de filtrado:
   📚 Total encontrados: 15
   ✅ Ya procesados: 0
   🆕 Nuevos por procesar: 15

📊 ESTADÍSTICAS:
   📚 Total de libros: 15
   👥 Autores únicos: 8
   🏆 Top autores:
      1. Isaac Asimov: 4 libros
      2. Irene Vallejo: 2 libros
   💾 Tamaño total: 67.8 MB
   💰 Coste S3 estimado: $0.0015/mes

🔥 PASO 2: ACTUALIZANDO FIREBASE
=================================

🔥 Procesando 15 libros en lotes de 5
📦 Procesando lote 1/3
🔥 Añadiendo a Firebase: El infinito en un junco - Irene Vallejo
   ✅ Libro añadido a lista: El_infinito_en_un_junco.epub
   ✅ Autor añadido: Irene Vallejo
   ✅ Libro vinculado a autor: Irene_Vallejo

☁️  PASO 3: SUBIENDO A S3
========================

☁️  Subiendo 15 libros a S3 en lotes de 3
📦 Subiendo lote 1/5
☁️  Subiendo a S3: El_infinito_en_un_junco.epub
   📊 Tamaño: 4.2 MB
   ✅ Subido exitosamente a S3

🎉 PROCESAMIENTO COMPLETADO
============================
✅ 15 libros nuevos procesados exitosamente
📊 Total en sistema: 15 libros
```

## Comandos útiles

```bash
# Ver ayuda
npm run upload -- --help

# Solo estadísticas
npm run upload -- --stats

# Listar S3
npm run upload -- --list-s3

# Modo automático (sin confirmaciones)
npm run upload -- --auto

# Probar solo extracción
npm run test
```