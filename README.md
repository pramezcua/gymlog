# GymLog · Bitácora de entrenamiento

PWA *mobile-first* y en modo oscuro para registrar entrenamientos de gimnasio. Funciona sin conexión (IndexedDB), cada usuario tiene su cuenta con los datos sincronizados entre dispositivos (Supabase, opcional) y se aloja gratis en GitHub Pages.

**App:** https://pramezcua.github.io/gymlog/

## Funciones

- **Registro de sesión en vivo:** peso y repeticiones con botones −/+, RPE con un toque (el RIR se autocompleta como 10 − RPE y se puede editar), series de calentamiento, kg/lb, rendimiento de la sesión anterior y vídeo o notas técnicas de cada ejercicio.
- **Descansos:** descanso global de la sesión y descanso específico por ejercicio. El temporizador arranca solo al completar una serie (vibra al terminar) y se guarda el descanso real que tomaste entre series.
- **Rutinas:** plantillas editables con series, rango de repeticiones, RPE objetivo, descanso y notas. Puedes añadir, quitar o reordenar ejercicios durante la sesión sin modificar la plantilla.
- **Biblioteca de ejercicios:** grupo muscular, notas técnicas y multimedia (enlaces de YouTube/Vimeo, .mp4/.gif o archivos subidos al dispositivo).
- **Calendario:** vista mensual y semanal para programar rutinas. Puedes arrastrar los días planificados (mantén pulsado en el móvil). Las sesiones completadas muestran el RPE medio y el volumen.
- **Historial y progreso:** 1RM estimado (Epley) por ejercicio, en gráfica y en tabla.
- **Copias de seguridad:** exportar e importar en JSON (combinando o reemplazando los datos).

## Cuentas y sincronización (Supabase)

Si `src/config.ts` tiene vacíos la URL y la clave, la app funciona en **modo local**: sin cuentas y con los datos solo en el dispositivo. Para activar las cuentas:

1. Crea un proyecto gratuito en https://supabase.com.
2. En **SQL Editor**, pega y ejecuta `supabase/schema.sql`.
3. En **Authentication → URL Configuration**, pon `https://pramezcua.github.io/gymlog/` como *Site URL* y añádela también a *Redirect URLs*.
4. En **Project Settings → API**, copia la *Project URL* y la clave *anon / publishable* en `src/config.ts`. Nunca uses la clave `service_role`.
5. Ejecuta `npm run deploy`.

**Cómo funciona:**
- Cada dispositivo guarda una copia local por usuario (`gymlog-<userId>`) y la app sigue funcionando sin conexión.
- Cada cambio se sincroniza a los pocos segundos con la tabla `records`, y también al volver la conexión, al abrir la app y cada minuto.
- Los conflictos se resuelven por *last-write-wins* (gana el cambio más reciente) y los borrados se propagan a los demás dispositivos.
- *Row Level Security* garantiza que cada usuario solo accede a sus filas.
- Al cerrar sesión se borra la copia local del dispositivo.
- Los vídeos subidos como archivo no se sincronizan; usa enlaces.

## Stack

Vite · React · TypeScript · Tailwind CSS v4 · Dexie (IndexedDB) · Supabase (Auth + Postgres) · React Router (`HashRouter`) · @dnd-kit · vite-plugin-pwa.

## Desarrollo local

```bash
npm install
npm run dev       # http://localhost:5173/gymlog/
npm run build     # genera dist/
```

## Despliegue

Pages sirve la rama `gh-pages`. Para publicar una nueva versión:

```bash
npm run deploy    # compila y sube dist/ a la rama gh-pages
```

Para desplegar automáticamente con GitHub Actions en cada push:

1. Da a `gh` el permiso `workflow`: `gh auth refresh -h github.com -s workflow`.
2. Mueve `docs/deploy-workflow.yml` a `.github/workflows/deploy.yml` y haz push.
3. En Settings → Pages → Source, elige *GitHub Actions*.

Si cambias el nombre del repositorio, actualiza `base` en `vite.config.ts` y las rutas `/gymlog/` de `index.html`.

## Estructura de datos

| Tabla | Contenido |
|---|---|
| `exercises` | catálogo: nombre, músculo, multimedia, notas |
| `routines` | plantillas, con sus ejercicios (`items`) embebidos |
| `sessions` | fecha, duración, descanso global, volumen y RPE medio |
| `sessionExercises` | copia editable de cada ejercicio dentro de una sesión (descanso específico) |
| `sets` | reps, peso, RPE, RIR, tipo de serie y descanso real |
| `calendar` | planificación por día (`planned` / `done` / `skipped`) |
| `media` | vídeos o GIF subidos (Blob, solo en este dispositivo) |

> Los datos solo existen en el navegador donde los creas. Exporta una copia JSON con regularidad.
