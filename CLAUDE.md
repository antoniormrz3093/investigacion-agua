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
  telegram.js        # Envio de mensajes via Telegram Bot API
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
- `MonitoreoAguaMexico-Noticias`: cada 3 dias a las 8:00 AM
- `MonitoreoAguaMexico-Semanal`: cada miercoles a las 8:00 AM

## Configuracion
Copiar `config.example.json` a `config.json` y completar:
- `telegram.botToken`: Token del bot de Telegram (via @BotFather)
- `telegram.chatId`: ID del chat destino
- `newsDir`: Ruta absoluta donde guardar los JSON de noticias
- `keywords`: Terminos de busqueda personalizables

## Notas
- DOF requiere desactivar verificacion TLS temporalmente (certificado SSL del sitio con problemas)
- Google News RSS es la fuente principal (~100 noticias por ejecucion)
- El scoring de relevancia en weekly.js prioriza: reforma LAN, CONAGUA, obra publica, licitaciones
