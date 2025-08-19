# 🔧 Configurar S3 para acceso público

La aplicación ya está actualizada para usar S3, pero necesitas configurar el bucket en AWS Console.

## ⚠️ IMPORTANTE: Hazlo desde la consola de AWS

El usuario IAM actual no tiene permisos para cambiar CORS y políticas del bucket. Necesitas hacerlo con tu cuenta principal de AWS.

## 📝 Pasos a seguir en AWS Console:

### 1. Ir a tu bucket S3
1. Ve a: https://s3.console.aws.amazon.com/s3/buckets/lectur-app-personal
2. Inicia sesión con tu cuenta principal de AWS (no el usuario IAM)

### 2. Configurar CORS
1. Click en la pestaña **"Permissions"** (Permisos)
2. Scroll hasta **"Cross-origin resource sharing (CORS)"**
3. Click en **"Edit"**
4. Pega este JSON:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:4321",
      "http://localhost:5000",
      "https://lectur-app.web.app",
      "https://lectur-app.firebaseapp.com",
      "*"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

5. Click **"Save changes"**

### 3. Configurar Política del Bucket (Acceso Público)
1. En la misma pestaña **"Permissions"**
2. Busca **"Bucket policy"**
3. Click en **"Edit"**
4. Pega este JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::lectur-app-personal/*"
    }
  ]
}
```

5. Click **"Save changes"**

### 4. Desbloquear Acceso Público
1. En **"Permissions"** → **"Block public access"**
2. Click en **"Edit"**
3. **DESMARCA** estas opciones:
   - ❌ Block public access to buckets and objects granted through new public bucket or access point policies
   - ❌ Block public and cross-account access to buckets and objects through any public bucket or access point policies
4. Deja marcadas las otras dos opciones
5. Click **"Save changes"**
6. Escribe `confirm` cuando te lo pida

## ✅ Verificación

Una vez configurado, prueba acceder a un libro directamente desde el navegador:

```
https://lectur-app-personal.s3.eu-west-1.amazonaws.com/1004-Ben%20Lerner.epub
```

Si puedes descargar el archivo, ¡todo está listo!

## 🚀 La app ya está actualizada

El archivo `public/js/app.js` ya está modificado para usar S3:
- Línea 637: URL del bucket S3
- Línea 640-644: Fetch con CORS habilitado

## 🔒 Seguridad

Esta configuración permite lectura pública de TODOS los archivos en el bucket. Si en el futuro necesitas más seguridad, considera:
- Usar CloudFront para distribuir contenido
- Implementar URLs pre-firmadas
- Restringir orígenes CORS a dominios específicos

## 💰 Costes

Con acceso público directo desde S3:
- **Transferencia**: $0.09 por GB después de 1GB gratis al mes
- **Requests**: $0.0004 por 1000 solicitudes GET

Para 1000 usuarios descargando 10 libros de 5MB cada uno al mes:
- Transferencia: 50GB × $0.09 = $4.50/mes
- Requests: 10,000 × $0.0004 = $0.004/mes
- **Total: ~$4.50/mes**