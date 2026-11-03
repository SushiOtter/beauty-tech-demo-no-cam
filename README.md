# Beauty Tech Retail Experience

Web estática en GitHub Pages conectada a Supabase para gestionar y reproducir vídeos por sección. La experiencia funciona sin cámara ni detección: al iniciar una sección, sus vídeos pasan en orden y se repiten en bucle.

## Conectar la web publicada a Supabase

GitHub Pages publica la interfaz, pero no aloja una base de datos. Para la biblioteca online se usa Supabase: Postgres guarda el índice de los vídeos y Supabase Storage guarda los archivos. Este repositorio incluye el esquema y las políticas en [`supabase/setup.sql`](./supabase/setup.sql).

1. Crea un proyecto en Supabase.
2. En **SQL Editor**, pega y ejecuta el contenido de `supabase/setup.sql`. Si ya habías configurado Supabase, vuelve a ejecutar el script para crear el catálogo compartido de secciones. Crea o actualiza las tablas `video_sections` y `videos`, añade las secciones iniciales y la sección especial `global` para un vídeo común de respaldo, activa Row Level Security, añade sus políticas y crea el bucket público `beauty-videos` con límite de 50 MB.
3. En **Authentication → Providers → Email**, desactiva el registro público. En **Authentication → Users**, crea la cuenta de la encargada. En SQL Editor, sustituye el correo de este comando por el de esa cuenta y ejecútalo para concederle permisos de administración:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"beauty_admin": true}'::jsonb
   where email = lower('correo-de-la-encargada@example.com');
   ```

   La encargada debe cerrar e iniciar sesión después de asignar el rol. No publiques su contraseña.
4. En la configuración/API del proyecto, copia la **Project URL** y la clave pública **anon** o **publishable** en `js/supabase-config.js`, en `SUPABASE_URL` y `SUPABASE_ANON_KEY`. Esa clave pública se entrega al navegador; **no** pongas nunca la clave `service_role` o una secret key en este repositorio.
5. Guarda los cambios y súbelos a GitHub para que Pages publique la nueva versión. Abre `https://sushiotter.github.io/beauty-tech-demo/`, entra a **Administración → Vídeos por sección**, inicia sesión con la cuenta creada y sube uno o varios vídeos a cada sección. Opcionalmente, sube un vídeo común de respaldo para las secciones sin contenido. Prueba con MP4, WebM u Ogg de menos de 50 MB por vídeo.
6. Para comprobar la tablet, abre la misma URL de Pages en un segundo dispositivo, selecciona una sección y pulsa **Reproducir vídeos**. Los vídeos empezarán de inmediato, en orden y en bucle; no se solicita acceso a la cámara.

La URL y la clave anon son públicas por diseño: la seguridad depende de las políticas de `setup.sql` y de mantener desactivado el registro público. Los vídeos están en un bucket **público** para que las tablets puedan reproducirlos sin iniciar sesión; cualquiera que tenga la URL de un vídeo puede verlo. No subas contenido privado. Los vídeos ocupan cuota de almacenamiento y transferencia del plan de Supabase.

## Uso de la biblioteca

- Incluye cinco secciones iniciales: aparatología, maquillaje, tratamientos capilares, novedades y color de pelo. Desde **Vídeos por sección**, la encargada puede añadir secciones compartidas; aparecen en las tablets conectadas en un máximo de 30 segundos y pueden seleccionarse al iniciar la experiencia. También puede eliminar secciones añadidas y sus vídeos; las cinco iniciales y el vídeo común de respaldo están protegidos.
- La encargada puede subir y eliminar vídeos después de autenticarse con su cuenta de Supabase. La tablet reproduce todos los vídeos de la sección seleccionada en el orden de la biblioteca y vuelve al primero al terminar.
- Si una sección no tiene vídeos, se reproduce el vídeo común de respaldo si está disponible. Si no hay ninguno, la pantalla indica que hay que subir vídeos a esa sección.
- La aplicación limita los archivos a 50 MB para que la prueba sea compatible con los límites habituales del plan gratuito. El plan de Supabase también puede imponer límites de tamaño, almacenamiento y transferencia.

## Reproducción sin detección

- La experiencia de tablet reproduce directamente la lista de vídeos de la sección elegida, sin solicitar permisos ni acceder a la cámara.
- La reproducción avanza al terminar cada vídeo; al llegar al final de la lista, vuelve a empezar.
- El vídeo común de respaldo solo se utiliza cuando la sección seleccionada no tiene vídeos propios.

## Contenido de demostración y licencias

Se han retirado los vídeos incluidos como demostración. Las imágenes de póster restantes solo se usan en las vistas de administración; no se reproducen en las tablets. Los vídeos que se suban deben contar con permiso de uso. Las licencias de dependencias y recursos gráficos están documentadas en `CREDITS.md`.

## Recursos y licencias

| Recurso | Versión | Licencia | Descarga y copia incluida | Alternativas evaluadas / elección |
|---|---|---|---|---|
| Recursos heredados de detección facial | — | Licencias incluidas con los recursos | `vendor/face-api/` y `models/face-api/` | Se conservan en el repositorio de origen, pero no se cargan ni se usan en la experiencia actual. |
| Textos de recomendación de muestra | 25 | Textos originales del proyecto | `js/products.js` y `data/contenido.json`; sin descarga externa | Se mantienen para vistas de demostración anteriores; el modo tablet reproduce los vídeos de la sección y no usa datos de edad. |
| Inter | 5.3.0 | SIL OFL 1.1; licencia incluida | Paquete oficial `@fontsource/inter` en npm; `assets/fonts/inter-latin-*.woff2` | Fuente local, sin solicitudes a Google Fonts ni a un CDN. |
| Cormorant Garamond | 5.3.0 | SIL OFL 1.1; licencia incluida | Paquete oficial `@fontsource/cormorant-garamond` en npm; `assets/fonts/cormorant-garamond-latin-*.woff2` | Fuente local para titulares; no depende del sistema. |
| `sharp` (herramienta de generación opcional) | 0.35.5 | Apache-2.0 | Paquete oficial npm; solo lo usa `tools/generate-demo-videos.mjs` | Rasteriza las ilustraciones propias; no es necesario para ejecutar la demo. |
| `ffmpeg-static` / FFmpeg (herramienta de generación opcional) | 5.3.0 / 6.1.1 | GPL-3.0-or-later | Paquete oficial npm; binario local solo para generar los MP4 | Codifica los vídeos H.264; no se distribuye ni se invoca durante la experiencia. |
| Ilustraciones en reposo e iconos | CSS y SVG del proyecto | Originales del proyecto | `css/experience.css` y `assets/icons/`; sin descarga externa | Decoración visual; las tablets reproducen exclusivamente los vídeos subidos a Supabase. |

La licencia MIT del paquete está en `vendor/face-api/LICENSE`; la licencia Apache-2.0 del componente TensorFlow.js incluido está en `vendor/face-api/TENSORFLOW-LICENSE`. No quedan vídeos de muestra en el proyecto.

## Diagnóstico y pruebas

- Si no aparecen vídeos, comprueba la conexión de Supabase y que la sección tenga archivos subidos; el vídeo común solo se utiliza como respaldo.
- Los vídeos publicados se sirven desde el bucket Storage de Supabase.
- Para abrir una copia local puedes ejecutar `INICIAR-DEMO.bat`, pero la base de datos y el almacenamiento siguen estando en Supabase; también hay que completar `js/supabase-config.js`.
- **Pruebas automatizadas:** `node --test tests\\video-sections.test.js` valida la gestión de secciones y vídeos. `tests\\age-content.test.js` cubre contenido editorial legado.
