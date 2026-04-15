# Radar de Oportunidades Hidricas - RTWG

## Descripcion
Sistema automatizado que transforma noticias del sector hidrico mexicano en oportunidades de negocio concretas para RTWG (constructora enfocada en PTAR, redes hidraulicas, reuso, infraestructura urbana y cumplimiento regulatorio).

Deja de ser un agregador de noticias: cada articulo se deduplica, clasifica, evalua por nivel de oportunidad y se convierte en un insight accionable.

## Stack
- **Runtime**: Node.js v24 (ES modules)
- **Dependencias**: `cheerio` (scraping HTML), `rss-parser` (feeds RSS), `docx` (generacion Word)
- **Notificaciones**: Telegram Bot API (MarkdownV2, multi-destinatario)
- **Programacion**: Windows Task Scheduler

## Arquitectura

```
src/
  index.js           # Delgado: rutea modos news / weekly
  pipeline.js        # Orquestador de 7 pasos (fetch -> ... -> insight)

  sources/
    google-news.js   # Google News RSS (sin API key)
    conagua.js       # Scraping de gob.mx/conagua
    dof.js           # Diario Oficial de la Federacion

  text-utils.js      # Normalizacion, stopwords, n-gramas, Jaccard, hash
  dedup.js           # Union-find sobre URL + titulo Jaccard >= 0.85 + ventana 4 dias
  article-fetcher.js # Extraccion con validacion de calidad (>= 800 chars utiles)
  classify.js        # Taxonomia RTWG: tipo / subtipo / sector / region / actor
  opportunity.js     # Heuristicas deterministas -> nivel alto | medio | bajo
  insight.js         # Resumen, puntos clave, implicaciones, oportunidad, recomendacion

  report.js          # Dashboard HTML orientado a oportunidades
  telegram.js        # [TIPO-NIVEL] + insight breve + link, filtrado sin duplicados
  word-export.js     # Word SOLO si nivel=ALTO + contenido valido
  weekly.js          # Agregado cross-day desde snapshots persistidos

config.json          # Configuracion local (NO versionado, contiene token)
config.example.json  # Template de configuracion
data/                # Snapshots diarios (NO versionado)
data/weekly-summaries/  # Resumenes semanales persistidos
data/_archive/       # Snapshots pre-refactor (schema viejo)
output/              # Dashboards HTML generados (NO versionado)
```

## Ejecucion
```bash
node src/index.js          # Modo news (default)
node src/index.js news     # Pipeline fresco + dashboard + Telegram
node src/index.js weekly   # Pipeline fresco + agregado 7 dias + Word ALTO + dashboard + Telegram
```

## Pipeline (src/pipeline.js)

Cada articulo atraviesa 7 etapas con trazabilidad:

1. **Fetch** - Google News RSS + CONAGUA + DOF en paralelo
2. **Deduplicacion robusta** - URL normalizada + titulo (tokens + shingles Jaccard) >= 0.85 en ventana de 4 dias. Canonico = fuente mas autoritativa (DOF > CONAGUA > medio establecido) + contenido mas largo
3. **Clasificacion preliminar** (titulo + descripcion) - para priorizar
4. **Pre-evaluacion** -> top N para extraccion cara (default 20, configurable via `config.extractLimit`)
5. **Extraccion de contenido** - concurrencia 5, timeout 12s, limpieza de navegacion/ads/cookies, validacion `>= 800 chars utiles`
6. **Clasificacion final + evaluacion + insight** con contenido completo
7. **Ordenamiento** por nivel (alto > medio > bajo) + score

## Taxonomia RTWG (src/classify.js)

- **tipo**: regulacion | inversion | infraestructura | sequia | industria | ambiente | otro
- **subtipo**: PTAR | PTAP | Red hidraulica | Drenaje/Alcantarillado | Reuso | Descargas/Cumplimiento | Concesiones | Desalinizacion | Presas
- **sector**: industrial | municipal | agricola | mixto
- **region**: estado o ciudad industrial detectada
- **actor**: CONAGUA | SEMARNAT | DOF | Presidencia | Congreso | SIAPA | SACMEX | Agua y Drenaje MTY | BANOBRAS | FONADIN

## Evaluacion de oportunidad (src/opportunity.js)

Heuristicas deterministas con score numerico. Senales:

- `investment` (monto detectado) + infra hidrica -> +40
- `build` (licitacion / obra) + infra hidrica -> +35
- `regulation` (reforma / decreto / NOM) -> +25
- `drought` + zona industrial -> +30
- Subtipo core RTWG (PTAR/PTAP/Red/Reuso) -> +10

Umbrales: **ALTO** >= 55 · **MEDIO** >= 25 · **BAJO** < 25

## Trazabilidad (data/noticias-agua-YYYY-MM-DD.json)

Cada noticia persiste:
- `cluster_id`, `cluster_size`, `cluster_sources`
- `content_extraido`, `content_length`, `content_valid`, `excluded_reason`
- `clasificacion` completa
- `oportunidad`: `nivel`, `score`, `monto`, `signals`, `razones`
- `insight`: `resumen`, `puntos_clave`, `implicaciones`, `oportunidad`, `recomendacion`, `insight_line`

## Dashboard (src/report.js)

- Header con periodo + conteo por fuente
- 7 stat boxes: ingestadas, unicas, duplicados, contenido valido/extraido, ALTO, MEDIO, BAJO
- **Top Oportunidades ALTAS** con card expandible (insight + implicaciones + oportunidad + recomendacion + senales)
- **Oportunidades MEDIAS** con mismo formato
- Distribucion por tipo / region / sector (tiles con top 5 por grupo)
- Sin listados redundantes: cada noticia aparece una vez

## Telegram (src/telegram.js)

Formato por articulo:
```
[N]. [emoji] [TIPO - NIVEL]
**Titulo**
fuente | fecha (si cluster > 1: + N fuentes)
insight breve
Abrir (link)
```

Maximo 10 articulos, priorizando ALTOs sobre MEDIOs. Composicion por bloques: si un bloque no cabe en 4000 chars, se corta limpio y se agrega "+N mas en el dashboard".

## Word (src/word-export.js)

Solo genera `.docx` para articulos con `nivel === 'alto' && content_valid`. Estructura:

1. Cabecera: titulo, nivel, score, monto, tipo/subtipo/sector/region, fuente, fecha, URL
2. Resumen ejecutivo
3. Puntos clave (bullets)
4. Implicaciones para RTWG
5. Oportunidad de negocio
6. Recomendacion (accion concreta con horizonte)
7. Senales detectadas
8. Contenido completo del articulo

Destino: `config.newsDir/Semana-YYYY-SXX/NN. titulo.docx`

## Tareas programadas (Windows Task Scheduler)

- `MonitoreoAguaMexico-Noticias`: cada 3 dias a las 8:00 AM -> `launcher-noticias.bat`
- `MonitoreoAguaMexico-Semanal`: cada miercoles a las 8:00 AM -> `launcher-semanal.bat`

Recrear en un nuevo entorno:
```
schtasks /create /tn MonitoreoAguaMexico-Noticias /tr C:\Users\Opus2026\monitoreo-agua-noticias.bat /sc daily /mo 3 /st 08:00 /ru USUARIO /rp CONTRASENA /f
schtasks /create /tn MonitoreoAguaMexico-Semanal /tr C:\Users\Opus2026\monitoreo-agua-semanal.bat /sc weekly /d WED /st 08:00 /ru USUARIO /rp CONTRASENA /f
```

## Configuracion

Copiar `config.example.json` a `config.json` y completar:
- `telegram.botToken` - via @BotFather
- `telegram.chatIds` - array multi-destinatario (soporta multiples IDs)
- `newsDir` - ruta absoluta para snapshots + carpetas semanales de Word
- `keywords` - terminos de busqueda Google News
- `extractLimit` (opcional, default 20) - cuantas noticias pasan a extraccion cara
- `maxNewsPerSource` - limite por fuente

## Notas tecnicas

- DOF requiere desactivar verificacion TLS (certificado con problemas)
- URLs de Google News se resuelven via DuckDuckGo HTML search (no API key)
- Sitios con JS rendering (Hogan Lovells, etc.) devuelven content_valid=false -> excluidos de Word
- Extraccion con concurrencia limitada (5) para no ser rate-limited
- Cross-day dedup: los snapshots diarios se fusionan para el agregado semanal; la misma noticia en dias distintos colapsa en un solo cluster
- El dashboard prioriza utilidad de negocio sobre volumen: 5 oportunidades claras > 50 noticias sin valor
