# Beauty Tech Retail Experience

**Versión 38.** Web estática en GitHub Pages conectada a Supabase para gestionar y reproducir vídeos por sección.

## Conectar la web publicada a Supabase

GitHub Pages publica la interfaz, pero no aloja una base de datos. Para la biblioteca online se usa Supabase: Postgres guarda el índice de los vídeos y Supabase Storage guarda los archivos. Este repositorio incluye el esquema y las políticas en [`supabase/setup.sql`](./supabase/setup.sql).

1. Crea un proyecto en Supabase.
2. En **SQL Editor**, pega y ejecuta el contenido de `supabase/setup.sql`. Si ya habías configurado Supabase, vuelve a ejecutar el script para crear el catálogo compartido de secciones. Crea o actualiza las tablas `video_sections` y `videos`, añade las secciones iniciales y la sección especial `global` para el vídeo de espera, activa Row Level Security, añade sus políticas y crea el bucket público `beauty-videos` con límite de 50 MB.
3. En **Authentication → Providers → Email**, desactiva el registro público. En **Authentication → Users**, crea la cuenta de la encargada. En SQL Editor, sustituye el correo de este comando por el de esa cuenta y ejecútalo para concederle permisos de administración:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"beauty_admin": true}'::jsonb
   where email = lower('correo-de-la-encargada@example.com');
   ```

   La encargada debe cerrar e iniciar sesión después de asignar el rol. No publiques su contraseña.
4. En la configuración/API del proyecto, copia la **Project URL** y la clave pública **anon** o **publishable** en `js/supabase-config.js`, en `SUPABASE_URL` y `SUPABASE_ANON_KEY`. Esa clave pública se entrega al navegador; **no** pongas nunca la clave `service_role` o una secret key en este repositorio.
5. Guarda los cambios y súbelos a GitHub para que Pages publique la nueva versión. Abre `https://sushiotter.github.io/beauty-tech-demo/`, entra a **Administración → Vídeos por sección**, inicia sesión con la cuenta creada y selecciona **Vídeo de espera · todas las secciones** para subir el vídeo de fondo. Para cambiarlo, elimina el actual y sube otro. Prueba con un vídeo MP4, WebM u Ogg de menos de 50 MB.
6. Para comprobar la tablet, abre la misma URL de Pages en un segundo dispositivo, selecciona la sección a la que subiste el vídeo y pulsa **Iniciar experiencia**. Si la cámara tiene permiso, el vídeo empieza al detectar presencia; si no, prueba el botón para mostrar contenido sin cámara.

La URL y la clave anon son públicas por diseño: la seguridad depende de las políticas de `setup.sql` y de mantener desactivado el registro público. Los vídeos están en un bucket **público** para que las tablets puedan reproducirlos sin iniciar sesión; cualquiera que tenga la URL de un vídeo puede verlo. No subas contenido privado. Los vídeos ocupan cuota de almacenamiento y transferencia del plan de Supabase.

## Uso de la biblioteca

- Incluye cinco secciones iniciales: aparatología, maquillaje, tratamientos capilares, novedades y color de pelo. Desde **Vídeos por sección**, la encargada puede añadir secciones compartidas; aparecen en las tablets conectadas en un máximo de 30 segundos y pueden seleccionarse al iniciar la experiencia. También puede eliminar secciones añadidas y sus vídeos; las cinco iniciales y el único vídeo de espera global están protegidos.
- La encargada puede subir y eliminar vídeos después de autenticarse con su cuenta de Supabase. Las tablets usan el vídeo de espera global mientras no detectan presencia y reproducen los vídeos de la sección seleccionada al detectar a alguien.
- Si una sección no tiene vídeos pero sí hay vídeo de espera global, la tablet lo reproduce y mantiene activa la detección; al detectar presencia, avisa que faltan vídeos para esa sección. Si no hay ninguno de los dos, no activa la cámara. Cuando hay vídeos de sección, los reproduce al detectar presencia y vuelve al vídeo global tras 15 segundos sin detección.
- La aplicación limita los archivos a 50 MB para que la prueba sea compatible con los límites habituales del plan gratuito. El plan de Supabase también puede imponer límites de tamaño, almacenamiento y transferencia.

## Cámara y privacidad

- El detector incluido solo localiza un rostro para determinar presencia. No estima edad, no identifica a la persona y no analiza rasgos. Los fotogramas se procesan en el navegador de la tablet y no se almacenan ni se envían al servidor.
- La cámara solicita permiso al iniciar la experiencia. GitHub Pages ya sirve HTTPS, requisito habitual para usar la cámara desde una tablet.
- Para reducir la espera de la primera detección, el modelo local se carga y prepara al abrir la aplicación; esto no activa la cámara. En modo tablet, el vídeo comienza con la primera detección facial válida.
- Antes de usarlo con clientes reales, revisa permisos de cámara, señalización visible, privacidad, seguridad y obligaciones legales con la responsable correspondiente.

## Contenido de demostración y licencias

Se han retirado los vídeos incluidos como demostración. Las imágenes de póster restantes solo se usan en las vistas de administración; no se reproducen en las tablets. Los vídeos que se suban deben contar con permiso de uso. Las licencias de dependencias y recursos gráficos están documentadas en `CREDITS.md`.

## Recursos y licencias

| Recurso | Versión | Licencia | Descarga y copia incluida | Alternativas evaluadas / elección |
|---|---|---|---|---|
| `@vladmandic/face-api` (detección local de presencia) | 1.7.15 | MIT; copia de `LICENSE` junto a la biblioteca | Paquete oficial del autor en [npm 1.7.15](https://www.npmjs.com/package/@vladmandic/face-api/v/1.7.15); `vendor/face-api/face-api.js` | El modo tablet carga únicamente TinyFaceDetector para detectar presencia; no invoca estimación de edad ni identidad. |
| TensorFlow.js (incluido en el bundle del navegador) | 4.22.0 | Apache-2.0; copia local | Código incluido en el bundle oficial anterior; [licencia del repositorio oficial `tensorflow/tfjs`](https://github.com/tensorflow/tfjs/blob/tfjs-v4.22.0/LICENSE); `vendor/face-api/TENSORFLOW-LICENSE` | Se mantiene local, junto con el bundle de inferencia; no se carga desde CDN. |
| TinyFaceDetector (pesos) | Incluidos en 1.7.15 | MIT, distribuidos dentro del paquete anterior | Manifiestos y pesos del mismo paquete npm; `models/face-api/` | El paquete también incluye pesos AgeGenderNet de una versión anterior del prototipo; el modo tablet actual no los carga ni los usa. |
| Textos de recomendación de muestra | 25 | Textos originales del proyecto | `js/products.js` y `data/contenido.json`; sin descarga externa | Se mantienen para vistas de demostración anteriores; el modo tablet reproduce los vídeos de la sección y no usa datos de edad. |
| Inter | 5.3.0 | SIL OFL 1.1; licencia incluida | Paquete oficial `@fontsource/inter` en npm; `assets/fonts/inter-latin-*.woff2` | Fuente local, sin solicitudes a Google Fonts ni a un CDN. |
| Cormorant Garamond | 5.3.0 | SIL OFL 1.1; licencia incluida | Paquete oficial `@fontsource/cormorant-garamond` en npm; `assets/fonts/cormorant-garamond-latin-*.woff2` | Fuente local para titulares; no depende del sistema. |
| `sharp` (herramienta de generación opcional) | 0.35.5 | Apache-2.0 | Paquete oficial npm; solo lo usa `tools/generate-demo-videos.mjs` | Rasteriza las ilustraciones propias; no es necesario para ejecutar la demo. |
| `ffmpeg-static` / FFmpeg (herramienta de generación opcional) | 5.3.0 / 6.1.1 | GPL-3.0-or-later | Paquete oficial npm; binario local solo para generar los MP4 | Codifica los vídeos H.264; no se distribuye ni se invoca durante la experiencia. |
| Ilustraciones en reposo e iconos | CSS y SVG del proyecto | Originales del proyecto | `css/experience.css` y `assets/icons/`; sin descarga externa | Decoración visual; las tablets reproducen exclusivamente los vídeos subidos a Supabase. |

La licencia MIT del paquete está en `vendor/face-api/LICENSE`; la licencia Apache-2.0 del componente TensorFlow.js incluido está en `vendor/face-api/TENSORFLOW-LICENSE`. No quedan vídeos de muestra en el proyecto.

## Diagnóstico y pruebas

- Si la cámara no inicia, comprueba el permiso del navegador y que haya una cámara conectada. Las tablets requieren HTTPS de confianza para la detección; **Mostrar contenido sin cámara** permite reproducir sin detección.
- Si no carga el modelo local, comprueba que `vendor/face-api/` y `models/face-api/` estén incluidos en la carpeta.
- Los modelos de presencia se cargan localmente, sin CDN. Los vídeos publicados se sirven desde el bucket Storage de Supabase.
- Para abrir una copia local puedes ejecutar `INICIAR-DEMO.bat`, pero la base de datos y el almacenamiento siguen estando en Supabase; también hay que completar `js/supabase-config.js`.
- **Pruebas automatizadas:** `node --test tests\\age-content.test.js` conserva tres pruebas de contenido legado. Las pruebas `tests/test_server_api.py` corresponden al servidor local anterior.
