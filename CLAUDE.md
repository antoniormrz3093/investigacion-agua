# Monitoreo de Noticias del Agua en Mexico

## Descripcion
Sistema automatizado que busca, recopila y presenta noticias relevantes del sector hidrico en Mexico. Genera un dashboard HTML con dos pestanas (Noticias Recientes y Sobresalientes Semanal) y envia resumen por Telegram.

## Stack
- **Runtime**: Node.js v24 (ES modules)
- **Dependencias**: `cheerio` (scraping HTML), `rss-parser` (feeds RSS)
- **Notificaciones**: Telegram Bot API (fetch nativo)
- **Programacion**: Windows Task Scheduler

## Estructura
```
src/
  index.js           # Punto de entrada. Modos: "news" (default) y "weekly"
  sources/
    google-news.js   # Google News RSS (sin API key)
    conagua.js       # Scraping de gob.mx/conagua
    dof.js           # Diario Oficial de la Federacion
  report.js          # Generador de dashboard HTML con tabs
  weekly.js          # Analisis semanal: scoring por relevancia y resumen por temas
  telegram.js        # Envio de mensajes via Telegram Bot API (multi-destinatario)
  article-fetcher.js # Extrae primeras 7 lineas de contenido de articulos
launcher-noticias.bat  # Script lanzador para Task Scheduler (noticias)
launcher-semanal.bat   # Script lanzador para Task Scheduler (semanal)
config.json          # Configuracion local (NO versionado, contiene token)
config.example.json  # Template de configuracion
data/                # Noticias acumuladas para resumen semanal (NO versionado)
output/              # Dashboards HTML generados (NO versionado)
```

## Ejecucion
```bash
node src/index.js          # Busca noticias y genera dashboard
node src/index.js news     # Igual que arriba (modo explicito)
node src/index.js weekly   # Genera resumen semanal de sobresalientes
```

## Tareas programadas (Windows Task Scheduler)
- `MonitoreoAguaMexico-Noticias`: cada 3 dias a las 8:00 AM — usa `launcher-noticias.bat`
- `MonitoreoAguaMexico-Semanal`: cada miercoles a las 8:00 AM — usa `launcher-semanal.bat`

Los launchers resuelven el problema de rutas con espacios en `schtasks`. Los archivos .bat
reales que usan las tareas viven en `C:\Users\Opus2026\` (fuera del repo) pero son identicos
a los launchers versionados aqui.

Para recrear las tareas en un nuevo entorno (requiere estar logueado como el usuario destino):
```
schtasks /create /tn MonitoreoAguaMexico-Noticias /tr C:\Users\Opus2026\monitoreo-agua-noticias.bat /sc daily /mo 3 /st 08:00 /ru USUARIO /rp CONTRASEÑA /f
schtasks /create /tn MonitoreoAguaMexico-Semanal /tr C:\Users\Opus2026\monitoreo-agua-semanal.bat /sc weekly /d WED /st 08:00 /ru USUARIO /rp CONTRASEÑA /f
```

## Configuracion
Copiar `config.example.json` a `config.json` y completar:
- `telegram.botToken`: Token del bot de Telegram (via @BotFather)
- `telegram.chatIds`: Array de IDs de chat destino (soporta multiples destinatarios)
- `telegram.chatId`: (legacy) ID unico, se usa como fallback si chatIds no existe
- `newsDir`: Ruta absoluta donde guardar los JSON de noticias
- `keywords`: Terminos de busqueda personalizables

## Notas
- DOF requiere desactivar verificacion TLS temporalmente (certificado SSL del sitio con problemas)
- Google News RSS es la fuente principal (~100 noticias por ejecucion)
- El scoring de relevancia en weekly.js prioriza: reforma LAN, CONAGUA, obra publica, licitaciones
- El top 5 diario se ordena por scoring de impacto de negocio (no por fecha)
- Para cada noticia del top 5 se obtienen las primeras 7 lineas de contenido del articulo
- Para agregar un destinatario de Telegram: el usuario debe enviar /start al bot, obtener su chatId, y agregarlo al array chatIds en config.json
