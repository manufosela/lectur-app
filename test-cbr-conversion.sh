#!/bin/bash

cd ~/servidorix/COMICS

# Archivo de prueba
CBR_FILE="SPIDERMAN/Amazing Spiderman/08 Amazing Spider-Man Vol.3 #29.cbr"
CBZ_FILE="${CBR_FILE%.cbr}.cbz"

echo "🔧 Probando conversión de CBR a CBZ"
echo "📁 Archivo: $CBR_FILE"

# Verificar si ya existe el CBZ
if [ -f "$CBZ_FILE" ]; then
    echo "⚠️ El archivo CBZ ya existe: $CBZ_FILE"
    exit 0
fi

# Crear directorio temporal
TEMP_DIR=$(mktemp -d)
echo "📁 Directorio temporal: $TEMP_DIR"

# Extraer CBR
echo "📦 Extrayendo CBR..."
unrar x -y "$CBR_FILE" "$TEMP_DIR/" 2>&1 | tail -10

# Verificar extracción
if [ $? -ne 0 ]; then
    echo "❌ Error extrayendo CBR"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Contar archivos extraídos
FILE_COUNT=$(find "$TEMP_DIR" -type f | wc -l)
echo "📊 Archivos extraídos: $FILE_COUNT"

# Mostrar primeros archivos
echo "📋 Primeros archivos:"
find "$TEMP_DIR" -type f | head -5

# Crear CBZ
echo "📦 Creando CBZ..."
cd "$TEMP_DIR"
zip -r -q "$HOME/servidorix/COMICS/$CBZ_FILE" * 2>&1

if [ $? -eq 0 ]; then
    echo "✅ CBZ creado exitosamente: $CBZ_FILE"
    ls -lh "$HOME/servidorix/COMICS/$CBZ_FILE"
else
    echo "❌ Error creando CBZ"
fi

# Limpiar
cd /
rm -rf "$TEMP_DIR"

echo "🔍 Verificando CBZ creado:"
file "$HOME/servidorix/COMICS/$CBZ_FILE"