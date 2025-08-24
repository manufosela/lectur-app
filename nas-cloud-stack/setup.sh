#!/bin/bash

# Script de instalación para NAS Cloud Stack
# Ejecutar en el miniPC Ubuntu

set -e

echo "🚀 Configurando NAS Cloud Stack..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para imprimir mensajes
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Verificar si está ejecutándose como root
if [[ $EUID -eq 0 ]]; then
   print_error "No ejecutes este script como root"
   exit 1
fi

# Actualizar sistema
print_info "Actualizando sistema..."
sudo apt update && sudo apt upgrade -y

# Instalar Docker si no está instalado
if ! command -v docker &> /dev/null; then
    print_info "Instalando Docker..."
    
    # Instalar dependencias
    sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release
    
    # Añadir clave GPG de Docker
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Añadir repositorio
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Instalar Docker
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io
    
    # Añadir usuario al grupo docker
    sudo usermod -aG docker $USER
    
    print_status "Docker instalado correctamente"
else
    print_status "Docker ya está instalado"
fi

# Instalar Docker Compose si no está instalado
if ! command -v docker-compose &> /dev/null; then
    print_info "Instalando Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    print_status "Docker Compose instalado correctamente"
else
    print_status "Docker Compose ya está instalado"
fi

# Crear directorios necesarios
print_info "Creando directorios..."
mkdir -p ./letsencrypt
sudo chown -R $USER:$USER ./letsencrypt
chmod 600 ./letsencrypt

# Configurar variables de entorno
print_warning "IMPORTANTE: Debes editar el archivo .env antes de continuar"
print_info "Edita los siguientes valores en .env:"
echo "  - DOMAIN: Tu dominio de DynDNS"
echo "  - NAS_PATH: Ruta completa a tu NAS"
echo "  - MINIO_ROOT_PASSWORD: Contraseña segura para MinIO"

# Verificar si el archivo .env existe y mostrar contenido
if [ -f ".env" ]; then
    print_info "Contenido actual de .env:"
    cat .env
else
    print_error "Archivo .env no encontrado"
    exit 1
fi

echo ""
read -p "¿Has configurado correctamente el archivo .env? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Configura el archivo .env y ejecuta el script de nuevo"
    exit 1
fi

# Editar docker-compose.yml con los valores del .env
print_info "Configurando docker-compose.yml..."

# Leer variables del .env
source .env

# Reemplazar placeholders en docker-compose.yml
sed -i "s/TU_DOMINIO.dyndns.org/$DOMAIN/g" docker-compose.yml
sed -i "s|RUTA_TU_NAS|$NAS_PATH|g" docker-compose.yml

print_status "Configuración completada"

# Verificar que el puerto 80 y 443 estén libres
print_info "Verificando puertos..."
if sudo netstat -tlnp | grep :80 > /dev/null; then
    print_warning "Puerto 80 está en uso. Verifica que no haya otro servidor web ejecutándose"
fi

if sudo netstat -tlnp | grep :443 > /dev/null; then
    print_warning "Puerto 443 está en uso. Verifica que no haya otro servidor web ejecutándose"
fi

# Configurar firewall (si ufw está activo)
if sudo ufw status | grep -q "Status: active"; then
    print_info "Configurando firewall..."
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    print_status "Puertos 80 y 443 abiertos en firewall"
fi

print_status "Configuración inicial completada!"
echo ""
print_info "Próximos pasos:"
echo "1. Configura port forwarding en tu router:"
echo "   - Puerto 80 → ${HOSTNAME}:80"
echo "   - Puerto 443 → ${HOSTNAME}:443"
echo "2. Verifica que tu dominio DynDNS apunte a tu IP pública"
echo "3. Ejecuta: docker-compose up -d"
echo "4. Espera unos minutos para que se generen los certificados SSL"
echo ""
print_info "URLs que estarán disponibles:"
echo "  - https://storage.$DOMAIN (MinIO API - compatible S3)"
echo "  - https://minio.$DOMAIN (MinIO Console)"
echo "  - https://docker.$DOMAIN (Portainer)"
echo "  - https://traefik.$DOMAIN (Traefik Dashboard)"

print_status "¡Listo para levantar el stack!"