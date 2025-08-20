#!/bin/bash

echo "⚠️  LIMPIEZA DE EMERGENCIA - CREDENCIALES EXPUESTAS"
echo "===================================================="
echo ""
echo "Este script eliminará firebase-config.js del historial de Git"
echo "IMPORTANTE: Esto reescribirá la historia de Git"
echo ""
echo "Presiona Ctrl+C para cancelar o Enter para continuar..."
read

# Hacer backup primero
echo "📦 Creando backup del repositorio..."
cp -r .git .git.backup.$(date +%Y%m%d_%H%M%S)

# Eliminar firebase-config.js de TODA la historia
echo "🔥 Eliminando firebase-config.js de toda la historia de Git..."
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch public/js/firebase-config.js' \
  --prune-empty --tag-name-filter cat -- --all

# Limpiar referencias
echo "🧹 Limpiando referencias..."
rm -rf .git/refs/original/
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo ""
echo "✅ Limpieza local completada"
echo ""
echo "⚠️  SIGUIENTE PASO CRÍTICO:"
echo "   Debes hacer force push a todas las ramas:"
echo ""
echo "   git push origin --force --all"
echo "   git push origin --force --tags"
echo ""
echo "⚠️  TAMBIÉN DEBES:"
echo "   1. Regenerar la API Key en Firebase Console"
echo "   2. Actualizar tu .env local con la nueva key"
echo "   3. Verificar que firebase-config.js esté en .gitignore"
echo ""