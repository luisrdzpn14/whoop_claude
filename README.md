# WHOOP + Claude — guía de instalación

Conecta tus datos de WHOOP a Claude para poder preguntarle cosas en lenguaje
normal, y genera un dashboard de tu carga de entrenamiento contra tu
recuperación.

Probado en **Windows 11** con Node 24 y Claude Code. Funciona igual en Mac y
Linux, saltándote los avisos marcados como *"solo Windows"*.

---

## Qué vas a poder hacer

Cuando termines, podrás escribirle a Claude cosas como:

- *"¿Cómo viene mi recovery esta semana?"*
- *"¿Cuánto he dormido los últimos 14 días?"*
- *"¿Mi HRV está bajando?"*
- *"Compara mi strain con mi recuperación del último mes"*
- *"¿Debería entrenar fuerte hoy?"*

Y con los scripts de este repo, generar un dashboard como este:

```
node scripts/fetch-data.js 90      # baja 90 días de tus datos
node scripts/aggregate.js          # los agrega por semana
node scripts/build-dashboard.js    # genera output/dashboard.html
```

> **Ojo con los pasos:** la API pública de WHOOP **no da pasos**. WHOOP mide
> carga cardiovascular (*strain*), no es un podómetro. Si necesitas pasos,
> tendrás que sacarlos de otro sitio.

---

## Antes de empezar

Necesitas tres cosas:

| | |
|---|---|
| **Node.js 20 o superior** | Comprueba con `node --version` |
| **Cuenta de WHOOP** | La normal, la que usas en la app |
| **Claude Code** | O Claude Desktop, Cursor, o cualquier cliente MCP |

Tiempo total: unos **15 minutos**.

---

## Paso 1 · Crea tu app en WHOOP

Entra en **https://developer.whoop.com/** e inicia sesión con tu cuenta WHOOP.
Busca **Create App** y rellena:

**Name** — lo que quieras, por ejemplo `Claude MCP`.

**Redirect URI** — exactamente esto, con `127.0.0.1`, no con `localhost`:

```
http://127.0.0.1:3000/callback
```

**Scopes** — marca estos siete. El último es el importante:

```
read:recovery   read:cycles   read:workout   read:sleep
read:profile    read:body_measurement        offline
```

> ⚠️ **`offline` es obligatorio.** Sin él WHOOP no emite *refresh token* y
> tendrás que volver a autorizar cada hora. Es el error más molesto de todos.

**Privacy Policy** — WHOOP exige una URL pública aquí y no te deja guardar sin
ella. Para una app personal tienes dos salidas:

1. Crea un **Gist público** en https://gist.github.com con un texto de dos
   párrafos diciendo que la app es de uso personal y que los datos no salen de
   tu equipo. Pega la URL del gist.
2. O apunta a la política del propio conector:
   `https://github.com/davidmosiah/whoop-mcp/blob/main/docs/privacy.md`

Guarda. WHOOP te dará un **Client ID** y un **Client Secret**.

> 🔑 **El Secret se muestra una sola vez.** Cópialo a tu gestor de contraseñas
> antes de cerrar esa pantalla. Si lo pierdes, tendrás que regenerarlo.

---

## Paso 2 · Configura el conector

Abre una terminal.

**Solo Windows:** usa `npx.cmd` en lugar de `npx` en todos los comandos. El
`npx` pelado es un script de PowerShell y tu política de ejecución lo bloquea
con un error de `UnauthorizedAccess`. `npx.cmd` es un `.bat` y pasa sin
problema — no hace falta que bajes ninguna defensa del sistema.

```bash
npx.cmd -y whoop-mcp-unofficial@0.6.5 setup --client claude
```

Te va a preguntar, en este orden:

| Pregunta | Qué poner |
|---|---|
| `WHOOP Client ID:` | pégalo |
| `WHOOP Client Secret:` | pégalo — **se ve como asteriscos**, es normal |
| `WHOOP Redirect URI [...]:` | Enter (acepta el valor por defecto) |
| `Privacy mode [structured]:` | Enter |

Se guarda todo en `~/.whoop-mcp/config.json`. El Secret nunca aparece en tu
historial de comandos.

---

## Paso 3 · Autoriza tu cuenta

**Solo Windows — usa siempre `--no-open`:**

```bash
npx.cmd -y whoop-mcp-unofficial@0.6.5 auth --no-open
```

En Mac o Linux puedes omitir el `--no-open` y se abrirá el navegador solo.

> 🐛 **Por qué `--no-open` en Windows:** el conector abre el navegador con
> `cmd /c start <url>` sin escapar la URL. En `cmd`, el carácter `&` separa
> comandos, así que la URL se **corta en el primer `&`** y solo llega el
> `client_id`. WHOOP responde entonces
> `error=unsupported_response_type` porque le falta el `response_type`.
> Con `--no-open` la URL se imprime en pantalla y la copias tú, sin que
> `cmd` la toque. Está reportado en [BUG-REPORT.md](BUG-REPORT.md).

El comando imprime algo así:

```
Open this URL manually:
  https://api.prod.whoop.com/oauth/oauth2/auth?client_id=...&redirect_uri=...

Waiting for callback...
```

Ahora:

1. **No cierres la terminal** — tiene que seguir viva esperando la respuesta.
2. Selecciona la URL **entera**, desde `https://` hasta el final. Ocupará
   varias líneas: asegúrate de no dejarte ningún trozo.
3. Pégala en la barra de direcciones de tu navegador y pulsa Enter.
4. Inicia sesión en WHOOP y dale a autorizar.

La pestaña redirigirá sola y verás **"WHOOP connected"**. Tienes 5 minutos
antes de que el comando expire; si se te pasa, vuelve a lanzarlo y usa la
**URL nueva** (cada intento genera un `state` y un PKCE distintos).

### Comprueba que todo quedó bien

```bash
npx.cmd -y whoop-mcp-unofficial@0.6.5 doctor
```

Debe salir **`Status: READY ✓`** y, muy importante, el *refresh token* **no**
debe aparecer como `missing`. Si aparece, te faltó el scope `offline` del
Paso 1: añádelo en la app de WHOOP y repite el Paso 3.

---

## Paso 4 · Conéctalo a Claude Code

```bash
claude mcp add whoop --scope user -- npx.cmd -y whoop-mcp-unofficial@0.6.5
```

En Mac o Linux, `npx` en vez de `npx.cmd`.

Dos detalles que importan:

- **`npx.cmd`**, no `npx`. El fragmento de configuración que genera el propio
  `setup` usa `npx` a secas y en Windows falla al lanzarse.
- **Fija la versión** (`@0.6.5`). Sin fijarla, el paquete se actualizaría solo
  a versiones que no has revisado, y este maneja tus datos de salud y tus
  credenciales OAuth.

Verifica:

```bash
claude mcp list
```

Debe decir `whoop: ... - ✔ Connected`.

**Reinicia Claude Code** para que cargue las herramientas nuevas.

---

## Paso 5 · Pruébalo

Escríbele a Claude:

> ¿Cómo viene mi recovery esta semana?

Si responde con tus datos reales, ya está.

---

## Extra · El dashboard

Con la conexión funcionando:

```bash
node scripts/fetch-data.js 90      # 90 días (cámbialo si quieres)
node scripts/aggregate.js
node scripts/build-dashboard.js
```

Abre `output/dashboard.html` en el navegador. Incluye:

- **Semana a semana**: strain y recovery en paneles apilados. Comparten eje X
  pero no escala — superponerlos con dos ejes Y daría una lectura falsa.
- **Tira diaria**: cada día coloreado por su banda de recuperación.
- **Tu peor día**: el recovery más bajo del periodo con los días de alrededor,
  para distinguir carga acumulada de un problema de salud.
- **Dispersión con desfase**: strain del día `N` contra recovery del día
  `N+1`, con recta de ajuste. Es la prueba visual de si el entrenamiento te
  está pasando factura.
- **Tablas completas** de deportes y semanas.

`aggregate.js` imprime además las correlaciones. Como referencia: `|r| < 0.3`
significa relación débil o inexistente.

---

## Problemas frecuentes

**`npx : No se puede cargar el archivo ... npx.ps1`**
Usa `npx.cmd` en vez de `npx`.

**`error=unsupported_response_type` al autorizar**
Te faltó el `--no-open`. Ver Paso 3.

**`doctor` dice `Refresh token: missing`**
Falta el scope `offline` en tu app de WHOOP. Añádelo y repite el Paso 3.

**`whoop_daily_summary` devuelve `Invalid time value`**
Bug del paquete: no aplica el valor por defecto del parámetro `days`. Pídeselo
a Claude con un periodo concreto ("resumen de los últimos 14 días") o pasa
`days` explícito si lo llamas desde la terminal.

**Claude dice que no está conectado**
Las herramientas MCP se cargan bajo demanda. Pídele directamente un dato
("dame mi recovery de hoy") en vez de preguntarle si está conectado.

---

## 🔒 Seguridad — léelo antes de subir nada a GitHub

Este repo trae un `.gitignore` que ya excluye lo peligroso. **No lo quites.**

**Nunca subas:**

- `ID.txt`, `.env`, o cualquier archivo con tu **Client Secret**. Con él,
  cualquiera puede suplantar tu aplicación.
- `~/.whoop-mcp/config.json` y `~/.whoop-mcp/tokens.json`.
- La carpeta `data/` y `output/dashboard.html`. Contienen **tus datos de
  salud**: recovery, HRV, frecuencia cardíaca en reposo, sueño y
  entrenamientos, día a día.

**Antes del primer `git push`**, comprueba qué vas a subir:

```bash
git status --porcelain
```

Si ves algún archivo de la lista de arriba, **para** y revisa tu `.gitignore`.
Una vez que algo entra en el historial de git, borrarlo del working tree no lo
elimina: sigue ahí y hay que reescribir el historial.

**Nota sobre Windows:** el conector escribe los tokens con permisos `0600`,
pero eso es POSIX y en Windows no aplica igual — la protección real viene de
los permisos NTFS de tu carpeta de usuario. `doctor` informa
`secure_permissions: true` de todos modos, lo cual promete más de lo que
cumple en esta plataforma.

**Si filtras el Secret:** entra en `developer.whoop.com` y regenéralo. El
antiguo queda invalidado al instante.

---

## Qué hay en este repo

```
README.md                     esta guía
BUG-REPORT.md                 3 bugs del conector, listos para reportar
.gitignore                    protege secretos y datos de salud
scripts/
  fetch-data.js               descarga tus datos a data/
  aggregate.js                agrega por semana + correlaciones
  build-dashboard.js          genera output/dashboard.html
```

---

## Créditos

El conector MCP es **[whoop-mcp-unofficial](https://github.com/davidmosiah/whoop-mcp)**
de David Mosiah (licencia MIT). No es un producto oficial de WHOOP.

Se eligió tras comparar nueve implementaciones. Es la única mantenida
activamente que se queda dentro de la API oficial: usa OAuth 2.0 con PKCE, los
tokens no salen de tu equipo, y no tiene telemetría — el único destino de red
del código es `api.prod.whoop.com`.

> Existe otra implementación con más funciones que usa la **API privada de iOS
> de WHOOP** y pide tu **email y contraseña**. Va contra los términos de
> servicio de WHOOP —su propio autor lo advierte— y arriesga tu cuenta.
> Evítala.

Lo de este repo (guía, scripts y dashboard) es lo que salió de instalarlo y
arreglar lo que fallaba por el camino. Úsalo como quieras.

**Nada de esto es consejo médico.** Son datos de rendimiento y recuperación.
Para cualquier cosa de salud, un profesional.
