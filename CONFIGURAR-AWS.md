# 🚀 Configurar AWS para LecturAPP

Guía completa en español para configurar AWS S3 e IAM para el script de subida de libros.

## 1. Cambiar región a Europa

1. **En la esquina superior derecha** verás algo como: `Ohio (us-east-2) ▼`
2. **Haz clic** en esa zona
3. **Selecciona**: `Europa (Irlanda) eu-west-1`
4. La página se recargará en la nueva región

---

## 2. Crear bucket S3

### 📂 Paso a paso:

1. **Ve a S3**: https://s3.console.aws.amazon.com/
2. **Botón**: `Crear bucket`

### ⚙️ Configuración del bucket:

**📝 Configuración general:**
- **Nombre del bucket**: `lectur-app-books-[tu-nombre]` 
  - (debe ser único globalmente, añade tu nombre/números)
- **Región de AWS**: `Europa (Irlanda) eu-west-1`

**🔒 Configuración de objetos:**
- **ACL (listas de control de acceso)**: `ACL deshabilitadas (recomendado)`
- **Bloquear acceso público**: ✅ **Mantener todas marcadas** (seguridad)

**📚 Versionado de bucket:**
- **Versionado**: `Deshabilitar`

**🔐 Cifrado predeterminado:**
- **Tipo de cifrado**: `Cifrado del lado del servidor con claves administradas por Amazon S3 (SSE-S3)`

**🏷️ Etiquetas:**
- Opcional, puedes dejarlo vacío

3. **Botón**: `Crear bucket`

---

## 3. Crear usuario IAM

### 👤 Ir a IAM:
1. **Ve a IAM**: https://console.aws.amazon.com/iam/
2. **En el menú izquierdo**: `Personas` (Users)
3. **Botón**: `Crear persona`

### 📝 Paso 1: Especificar detalles de persona

**Nombre de persona:**
```
lectur-app-uploader
```

**❌ NO MARCAR**: `Proporcione acceso de usuario a la consola de administración de AWS`
- Este checkbox debe estar **SIN MARCAR**
- Tu script no necesita acceso web, solo API

**Continuar**: `Siguiente`

### 🔑 Paso 2: Establecer permisos

**Opciones de permisos:**
- ✅ Selecciona: `Adjuntar políticas directamente`

**Crear política personalizada:**
1. **Botón**: `Crear política`
2. Se abre nueva pestaña, en el **Editor JSON** pega:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListBucket",
                "s3:GetBucketLocation"
            ],
            "Resource": [
                "arn:aws:s3:::lectur-app-books-TU-NOMBRE",
                "arn:aws:s3:::lectur-app-books-TU-NOMBRE/*"
            ]
        }
    ]
}
```

**⚠️ IMPORTANTE**: Reemplaza `lectur-app-books-TU-NOMBRE` por el nombre exacto de tu bucket

3. **Botón**: `Siguiente`
4. **Nombre de política**: `LecturApp-S3-Access`
5. **Descripción**: `Permisos para subir libros a S3`
6. **Botón**: `Crear política`
7. **Vuelve** a la pestaña anterior
8. **🔄 Actualiza** la lista de políticas
9. **Busca** y **selecciona**: `LecturApp-S3-Access`

**Continuar**: `Siguiente`

### 📋 Paso 3: Revisar y crear

- **Revisa** la configuración
- **Botón**: `Crear persona`

### 🔐 Paso 4: Obtener credenciales

**📥 ¡MUY IMPORTANTE!** 
En la página de éxito verás:

```
Clave de acceso: AKIA...
Clave de acceso secreta: [Mostrar] ← Haz clic aquí
```

**💾 GUARDA ESTAS CREDENCIALES:**
1. **Copia la "Clave de acceso"** 
2. **Haz clic en "Mostrar"** para ver la clave secreta
3. **Copia la "Clave de acceso secreta"**

**⚠️ ADVERTENCIA**: No podrás ver la clave secreta otra vez. Si la pierdes, tendrás que crear nuevas credenciales.

---

## 4. Configurar el script

1. **Ve a**: `upload-script/`
2. **Copia el archivo de configuración**:
   ```bash
   cp .env.example .env
   ```

3. **Edita** `.env` con tus datos:
   ```env
   # AWS S3
   AWS_ACCESS_KEY_ID=AKIA... # ← Tu clave de acceso
   AWS_SECRET_ACCESS_KEY=abc123... # ← Tu clave secreta
   AWS_REGION=eu-west-1
   S3_BUCKET_NAME=lectur-app-books-tu-nombre # ← Nombre exacto de tu bucket
   ```

---

## 5. Probar configuración

```bash
cd upload-script
npm install
npm run upload -- --list-s3
```

**✅ Si todo está bien**: Verás una lista vacía (bucket recién creado)
**❌ Si hay error**: Revisa las credenciales y nombre del bucket

---

## 🆘 Solución de problemas

### Error: "Bucket does not exist"
- ✅ Verifica que el nombre del bucket en `.env` sea exactamente igual al creado
- ✅ Asegúrate de estar en la región correcta (eu-west-1)

### Error: "Access Denied" 
- ✅ Verifica las credenciales AWS en `.env`
- ✅ Asegúrate de que la política tenga el nombre correcto del bucket

### Error: "Invalid credentials"
- ✅ Regenera las credenciales en IAM > Personas > tu-usuario > Claves de acceso

### El script no encuentra el bucket
- ✅ El nombre del bucket debe ser único globalmente
- ✅ Si ya existe, prueba con: `lectur-app-books-2024-tu-nombre`

---

## 📊 Costes estimados

Para 1000 libros (~10GB):
- **Almacenamiento S3**: ~$0.23/mes
- **Transferencia**: ~$0.01 (subida gratuita)
- **Requests**: Mínimo

**Total mensual**: < $0.25 (25 céntimos)

---

## 🎯 Próximos pasos

Una vez configurado AWS:
1. **Instalar dependencias**: `npm install`
2. **Probar extracción**: `npm run test`
3. **Subir libros**: `npm run upload`