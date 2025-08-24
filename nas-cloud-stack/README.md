# NAS Cloud Stack - MinIO + Traefik

Stack completo para crear tu propia nube privada con MinIO (compatible S3) y Traefik como reverse proxy con SSL automático.

## 🚀 Instalación Rápida

### 1. Preparación
```bash
# En tu miniPC Ubuntu
cd /home/usuario
git clone o copiar los archivos del stack
cd nas-cloud-stack

# Hacer ejecutable el script
chmod +x setup.sh
```

### 2. Configuración
Edita el archivo `.env` con tus datos:
```bash
nano .env
```

Cambia:
- `TU_DOMINIO.dyndns.org` → tu dominio real de DynDNS
- `/ruta/completa/a/tu/nas` → ruta real donde están tus archivos
- `LecturApp2024!` → contraseña segura para MinIO

### 3. Ejecutar instalación
```bash
./setup.sh
```

### 4. Configurar router
Configura port forwarding:
- Puerto 80 → IP_miniPC:80
- Puerto 443 → IP_miniPC:443

### 5. Levantar servicios
```bash
docker-compose up -d
```

## 🌐 URLs disponibles

Una vez configurado tendrás:

| Servicio | URL | Descripción |
|----------|-----|-------------|
| **MinIO API** | `https://storage.tu-dominio.dyndns.org` | API compatible S3 para tu app |
| **MinIO Console** | `https://minio.tu-dominio.dyndns.org` | Panel de administración |
| **Portainer** | `https://docker.tu-dominio.dyndns.org` | Gestión de containers |
| **Traefik** | `https://traefik.tu-dominio.dyndns.org` | Dashboard del proxy |

## 📁 Estructura de buckets

El sistema creará automáticamente:
- `libros/` → Archivos EPUB
- `comics/` → Archivos CBZ/CBR  
- `audiolibros/` → Archivos MP3/M4A

## 🔧 Comandos útiles

```bash
# Ver logs
docker-compose logs -f

# Reiniciar servicios
docker-compose restart

# Parar todo
docker-compose down

# Actualizar imágenes
docker-compose pull && docker-compose up -d

# Ver estado
docker-compose ps
```

## 🔒 Seguridad

- SSL automático con Let's Encrypt
- Certificados se renuevan automáticamente
- Acceso básico protegido con usuario/contraseña
- CORS configurado solo para tu dominio de la app

## 📱 Integración con la app

Una vez funcionando, cambia en tu código:

```javascript
// Antes (S3)
const s3Url = `https://lectur-app-personal.s3.eu-west-1.amazonaws.com/${path}`;

// Después (MinIO local)
const minioUrl = `https://storage.tu-dominio.dyndns.org/libros/${path}`;
```

## 🚨 Troubleshooting

### Certificados SSL no se generan
1. Verifica que tu dominio apunte a tu IP pública
2. Comprueba que los puertos 80/443 estén abiertos
3. Revisa logs: `docker-compose logs traefik`

### MinIO no arranca
1. Verifica permisos en la ruta del NAS
2. Comprueba que la ruta existe
3. Revisa logs: `docker-compose logs minio`

### No puedo acceder desde fuera
1. Verifica port forwarding del router
2. Comprueba que DynDNS esté actualizado
3. Prueba acceso local primero

## 💡 Tips

- **Backup**: Los datos están en tu NAS, haz backup regular
- **Monitoreo**: Usa Portainer para ver estado de containers
- **Actualizaciones**: Ejecuta `docker-compose pull` periódicamente
- **Logs**: Siempre revisa logs si algo no funciona

## 🔄 Migración desde S3

Una vez tengas esto funcionando:
1. Copia tus archivos del NAS a los buckets correspondientes
2. Actualiza las URLs en tu aplicación
3. Prueba que todo funciona
4. ¡Ahorra dinero cancelando S3! 💰