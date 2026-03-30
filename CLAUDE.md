# Monitoreo de Noticias del Agua en Mexico

## Descripcion
Sistema automatizado que busca, recopila y presenta noticias relevantes del sector hidrico en Mexico. Genera documentos Word con el contenido completo de los articulos mas relevantes, un dashboard HTML con historial semanal navegable, y envia resumen por Telegram.

## Stack
- **Runtime**: Node.js v24 (ES modules)
- **Dependencias**: `cheerio` (scraping HTML), `rss-parser` (feeds RSS), `docx` (generacion Word)
- **Notificaciones**: Telegram Bot API (fetch nativo, multi-destinatario)
- **Programacion**: Windows Task Scheduler

## Estructura
```
src/
  index.js           # Punto de entrada. Modos: "news" (default) y "weekly"
  sources/
    google-news.js   # Google News RSS (sin API key)
    conagua.js       # Scraping de gob.mx/conagua
    dof.js           # Diario Oficial de la Federacion
  article-fetcher.js # Resuelve URLs de Google News via DuckDuckGo y extrae contenido
  word-export.js     # Genera documentos Word (.docx) con texto completo de articulos
  weekly.js          # Analisis semanal: scoring, categorizacion y generacion de resumenes
  report.js          # Dashboard HTML con sidebar vertical y pestanas semanales
  telegram.js        # Envio de mensajes via Telegram Bot API (multi-destinatario)
launcher-noticias.bat  # Script lanzador para Task Scheduler (noticias)
launcher-semanal.bat   # Script lanzador para Task Scheduler (semanal)
config.json          # Configuracion local (NO versionado, contiene token)
config.example.json  # Template de configuracion
data/                # Noticias acumuladas (NO versionado)
data/weekly-summaries/ # Resumenes semanales persistentes (JSON por semana)
output/              # Dashboards HTML generados (NO versionado)
```

## Ejecucion
```bash
node src/index.js          # Busca noticias y genera dashboard
node src/index.js news     # Igual que arriba (modo explicito)
node src/index.js weekly   # Genera resumen semanal completo (Word + dashboard + Telegram)
```

## Flujo diario (modo news)
1. Busca noticias en Google News RSS, CONAGUA y DOF
2. Deduplica y calcula score de relevancia de negocio
3. Selecciona top 5 por impacto (no por fecha)
4. Obtiene extracto de contenido (7 lineas) para cada top 5
5. Genera dashboard HTML con historial semanal
6. Envia notificacion por Telegram

## Flujo semanal (modo weekly)
1. Carga noticias acumuladas de los ultimos 7 dias
2. Selecciona top 5 por scoring de impacto de negocio
3. Resuelve URLs reales de Google News via DuckDuckGo
4. Descarga contenido completo de cada articulo y genera documento Word (.docx)
5. Los Word se guardan en `C:\...\01 Informacion\Semana-YYYY-SXX\`
6. Genera resumen breve (bullet points) desde el texto completo para el dashboard
7. Actualiza dashboard HTML con nueva pestana semanal
8. Envia resumen por Telegram con bullet points

## Dashboard HTML
- **Sidebar vertical** (navegacion tipo Excel)
  - Pestana "Noticias Recientes": vista diaria con top 5 y todas las noticias por fuente
  - Pestanas semanales acumulativas: una por semana con historial persistente
- **Cada pestana semanal muestra**:
  - Cobertura por categoria (Legislacion, Infraestructura, Crisis, Inversion, Politica, Medio Ambiente)
  - Top 5 noticias con: ranking, categoria, score, bullet points de resumen, extracto expandible
- Responsive: se adapta a movil (sidebar se convierte en tabs horizontales)

## Tareas programadas (Windows Task Scheduler)
- `MonitoreoAguaMexico-Noticias`: cada 3 dias a las 8:00 AM — usa `launcher-noticias.bat`
- `MonitoreoAguaMexico-Semanal`: cada miercoles a las 8:00 AM — usa `launcher-semanal.bat`
- Configuradas con credenciales para ejecutar sin sesion activa (modo Interactivo/En segundo plano)

Los launchers resuelven el problema de rutas con espacios en `schtasks`. Los archivos .bat
reales que usan las tareas viven en `C:\Users\Opus2026\` (fuera del repo) pero son identicos
a los launchers versionados aqui.

Para recrear las tareas en un nuevo entorno:
```
schtasks /create /tn MonitoreoAguaMexico-Noticias /tr C:\Users\Opus2026\monitoreo-agua-noticias.bat /sc daily /mo 3 /st 08:00 /ru USUARIO /rp CONTRASEÑA /f
schtasks /create /tn MonitoreoAguaMexico-Semanal /tr C:\Users\Opus2026\monitoreo-agua-semanal.bat /sc weekly /d WED /st 08:00 /ru USUARIO /rp CONTRASEÑA /f
```

## Configuracion
Copiar `config.example.json` a `config.json` y completar:
- `telegram.botToken`: Token del bot de Telegram (via @BotFather)
- `telegram.chatIds`: Array de IDs de chat destino (soporta multiples destinatarios)
- `telegram.chatId`: (legacy) ID unico, se usa como fallback si chatIds no existe
- `newsDir`: Ruta absoluta donde guardar los JSON de noticias y carpetas semanales de Word
- `keywords`: Terminos de busqueda personalizables

## Notas
- DOF requiere desactivar verificacion TLS temporalmente (certificado SSL del sitio con problemas)
- Google News RSS es la fuente principal (~100 noticias por ejecucion)
- Las URLs de Google News se resuelven a URLs reales via busqueda en DuckDuckGo
- Algunos sitios (Hogan Lovells, etc.) usan JS rendering y no permiten scraping; en esos casos el Word indica que no se pudo extraer contenido
- El scoring de relevancia prioriza: reforma LAN, CONAGUA, obra publica, licitaciones, concesiones
- Cada semana genera su propia carpeta de documentos Word en `newsDir/Semana-YYYY-SXX/`
- Los resumenes semanales no repiten noticias: cada semana analiza solo los ultimos 7 dias
- Para agregar un destinatario de Telegram: el usuario debe enviar /start al bot, obtener su chatId, y agregarlo al array chatIds en config.json
