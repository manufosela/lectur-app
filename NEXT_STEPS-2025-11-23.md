# Próximos pasos (2025-11-23)

- Montar el microservicio `/sign` en el miniPC: validar ID Token de Firebase con claves públicas, devolver `{ "url": "<presigned>" }` y habilitar CORS para los orígenes de la app.
- Configurar Nginx (o reverse proxy) hacia MinIO en el miniPC, sirviendo HTTPS en `storage.lecturapp.es` (o el host que uses) y exponiendo solo el puerto 443 vía Tailscale Funnel.
- Preparar MinIO con buckets/carpeta `COMICS/`, `LIBROS/`, `AUDIOLIBROS/` y permisos de solo lectura pública mediante URLs firmadas; revisar rutas/nombres según los JSON existentes.
- Ajustar `window.LECTURAPP_STORAGE_BASE_URL` si el dominio no es `https://storage.lecturapp.es`; en caso contrario no se requiere cambio en código.
- Probar flujo completo: login Firebase, POST `/sign` con un cómic/libro/audiolibro y descarga mediante la URL firmada; verificar expiración (~5 min) y CORS en navegador.
