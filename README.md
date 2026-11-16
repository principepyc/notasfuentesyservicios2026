# OPAC Académico — Fuentes y Servicios de Información (ISFyCD F.E.B.)

Catálogo web de consulta individual de calificaciones finales para **1.º Año de Bibliotecología** — **Instituto Superior de Formación y Capacitación Docente F.E.B. (DIEGEP N.º 6241)** — Ciclo Lectivo 2026.

**Docentes:** Silvia Moriondo · Emiliano Coria

---

## Cómo funciona la privacidad en GitHub Pages

Como los repositorios gratuitos de GitHub Pages son públicos, **ningún nombre, DNI ni nota se guarda en texto plano**:

1. El script [`scripts/build-catalog.mjs`](scripts/build-catalog.mjs) cifra cada ficha de estudiante de forma individual mediante **PBKDF2-SHA256 (150 000 iteraciones)** + **AES-256-GCM** usando la comisión y el DNI como llave.
2. Solo los archivos cifrados (`data/comision-1.js` a `data/comision-6.js`) se suben a GitHub.
3. Cuando un estudiante ingresa a su enlace directo (`#comision1` a `#comision6`) y escribe su DNI, su propio navegador desencripta únicamente su ficha catalográfica.

---

## Enlaces por comisión

Una vez publicado en GitHub Pages (`https://TU-USUARIO.github.io/TU-REPO/`), podés compartir el enlace directo correspondiente a cada grupo:

- Comisión 1: `https://TU-USUARIO.github.io/TU-REPO/#comision1`
- Comisión 2: `https://TU-USUARIO.github.io/TU-REPO/#comision2`
- Comisión 3: `https://TU-USUARIO.github.io/TU-REPO/#comision3`
- Comisión 4: `https://TU-USUARIO.github.io/TU-REPO/#comision4`
- Comisión 5: `https://TU-USUARIO.github.io/TU-REPO/#comision5`
- Comisión 6: `https://TU-USUARIO.github.io/TU-REPO/#comision6`

---

## Cómo cargar los datos reales

1. Creá la carpeta `private-data/` (está excluida en `.gitignore` para no subir listados sin cifrar).
2. Guardá allí:
   - Un archivo por comisión: `comision-1.csv` ... `comision-6.csv` con columnas `nombre,apellido,dni,nota`, **o**
   - Un único archivo `estudiantes.csv` con columnas `comision,nombre,apellido,dni,nota`.
3. Ejecutá:

```sh
node scripts/build-catalog.mjs
```

Esto reemplazará los archivos de demostración en `data/` por los registros reales cifrados y desactivará automáticamente el aviso de modo demostración.

Para regenerar datos ficticios de prueba:

```sh
node scripts/build-catalog.mjs --demo
```

---

## Publicar en GitHub Pages (sin usar consola)

1. Creá un repositorio nuevo en GitHub (por ejemplo `notas-fys-2026`).
2. Subí estos archivos y carpetas (**nunca** subas `private-data/`):
   - `index.html`
   - `.nojekyll`
   - `css/`
   - `js/`
   - `img/`
   - `data/`
3. En el repositorio, entrá a **Settings → Pages**.
4. En **Build and deployment → Source**, elegí **Deploy from a branch**, rama `main` y carpeta `/ (root)`, y presioná **Save**.
5. En 1 o 2 minutos GitHub te mostrará la URL pública lista para compartir con `#comision1` a `#comision6`.

