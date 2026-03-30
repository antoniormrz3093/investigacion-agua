import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function generateReport(newsItems, outputDir, weekly = null, scoredTop5 = null) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const fileName = `reporte-agua-${dateStr}.html`;

  await mkdir(outputDir, { recursive: true });

  // Group current news by origin
  const grouped = {};
  for (const item of newsItems) {
    const key = item.origin || 'Otros';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => b.date - a.date);
  }

  // Use scored top5 if provided, otherwise fallback to date-sorted
  const top5 = scoredTop5 || [...newsItems]
    .sort((a, b) => b.date - a.date)
    .slice(0, 5);

  const html = buildHtml(dateStr, now, top5, grouped, newsItems.length, weekly);
  const filePath = join(outputDir, fileName);
  await writeFile(filePath, html, 'utf-8');

  console.log(`[Reporte] Guardado en: ${filePath}`);
  return { filePath, fileName, top5, totalNews: newsItems.length };
}

function buildHtml(dateStr, now, top5, grouped, total, weekly) {
  const formatDate = (d) => {
    if (!(d instanceof Date) || isNaN(d.getTime())) return 'Sin fecha';
    return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const newsCardHtml = (item) => {
    const title = item.title || item.titulo || '';
    const link = item.link || item.enlace || '';
    const source = item.source || item.fuente || '';
    const desc = item.description || item.descripcion || '';
    const date = item.date instanceof Date ? item.date : new Date(item.fecha || Date.now());
    const contentLines = item.contentLines || [];

    const contentHtml = contentLines.length > 0
      ? `<div class="article-excerpt">${contentLines.map(line => `<p>${esc(line)}</p>`).join('\n')}</div>`
      : `<p>${esc(desc.substring(0, 250))}</p>`;

    return `
    <div class="news-card">
      <div class="news-meta">
        <span class="news-source">${esc(source)}</span>
        <span class="news-date">${formatDate(date)}</span>
        ${item.score ? `<span class="relevance-badge">Relevancia: ${item.score}</span>` : ''}
      </div>
      <h3><a href="${esc(link)}" target="_blank">${esc(title)}</a></h3>
      ${contentHtml}
    </div>`;
  };

  const groupSections = Object.entries(grouped).map(([origin, items]) => `
    <section class="source-section">
      <h2>${esc(origin)} <span class="count">(${items.length})</span></h2>
      ${items.map(newsCardHtml).join('\n')}
    </section>`).join('\n');

  // Weekly highlights tab content
  const hasWeekly = weekly && (weekly.highlights?.length > 0 || weekly.summaryPoints?.length > 0);

  const weeklyContent = hasWeekly ? `
    <div class="weekly-period">Periodo: ${esc(weekly.period)} | ${weekly.totalWeeklyNews} noticias analizadas</div>

    ${weekly.summaryPoints?.length > 0 ? `
    <div class="summary-section">
      <h3>Resumen de la Semana por Temas</h3>
      <ul class="summary-list">
        ${weekly.summaryPoints.map(p => `
          <li>
            <div class="topic-header">
              <span class="topic-name">${esc(p.category)}</span>
              <span class="topic-count">${p.count} noticias</span>
            </div>
            <div class="topic-headlines">
              ${p.topHeadlines.map(h => `<div class="headline-item">${esc(h)}</div>`).join('')}
            </div>
          </li>`).join('')}
      </ul>
    </div>` : ''}

    ${weekly.highlights?.length > 0 ? `
    <div class="highlights-section">
      <h3>Top 10 Noticias Sobresalientes</h3>
      ${weekly.highlights.map(newsCardHtml).join('\n')}
    </div>` : ''}
  ` : `
    <div class="empty-weekly">
      <p>El resumen semanal se genera cada miercoles a las 8:00 AM.</p>
      <p>Se acumulan noticias durante la semana para generar los puntos sobresalientes.</p>
    </div>`;

  const hasNews = total > 0;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monitoreo de Noticias del Agua - ${dateStr}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #f0f4f8;
      color: #1a202c;
      line-height: 1.6;
      padding: 20px;
    }
    .container { max-width: 960px; margin: 0 auto; }

    /* Header */
    header {
      background: linear-gradient(135deg, #0077b6, #00b4d8);
      color: white;
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 24px;
    }
    header h1 { font-size: 1.8em; margin-bottom: 8px; }
    header .subtitle { opacity: 0.9; font-size: 0.95em; }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 24px;
      background: white;
      border-radius: 10px;
      padding: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .tab {
      flex: 1;
      padding: 14px 20px;
      text-align: center;
      cursor: pointer;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.95em;
      transition: all 0.2s;
      border: none;
      background: transparent;
      color: #718096;
    }
    .tab:hover { background: #f7fafc; color: #2d3748; }
    .tab.active {
      background: #0077b6;
      color: white;
      box-shadow: 0 2px 8px rgba(0,119,182,0.3);
    }
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* Stats */
    .stats {
      display: flex;
      gap: 16px;
      margin: 20px 0;
    }
    .stat-box {
      background: white;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      flex: 1;
      text-align: center;
    }
    .stat-box .number { font-size: 2em; font-weight: 700; color: #0077b6; }
    .stat-box .label { font-size: 0.85em; color: #718096; }

    /* News cards */
    .top-section, .source-section, .summary-section, .highlights-section {
      background: white;
      padding: 24px;
      border-radius: 12px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .top-section { border-left: 4px solid #0077b6; }
    .top-section h2, .summary-section h3, .highlights-section h3 {
      color: #0077b6;
      margin-bottom: 16px;
      font-size: 1.3em;
    }
    .source-section h2 {
      color: #2d3748;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 10px;
      margin-bottom: 16px;
    }
    .count { color: #a0aec0; font-weight: 400; font-size: 0.8em; }
    .news-card {
      padding: 14px 0;
      border-bottom: 1px solid #edf2f7;
    }
    .news-card:last-child { border-bottom: none; }
    .news-meta {
      display: flex;
      gap: 12px;
      margin-bottom: 6px;
      font-size: 0.8em;
      align-items: center;
    }
    .news-source {
      background: #ebf8ff;
      color: #0077b6;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }
    .news-date { color: #a0aec0; }
    .relevance-badge {
      background: #f0fff4;
      color: #276749;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }
    .news-card h3 { font-size: 1em; margin-bottom: 4px; }
    .news-card h3 a { color: #2d3748; text-decoration: none; }
    .news-card h3 a:hover { color: #0077b6; text-decoration: underline; }
    .news-card p { color: #718096; font-size: 0.9em; }
    .article-excerpt {
      background: #f7fafc;
      border-left: 3px solid #0077b6;
      padding: 10px 14px;
      margin-top: 8px;
      border-radius: 0 6px 6px 0;
    }
    .article-excerpt p {
      margin-bottom: 4px;
      font-size: 0.88em;
      line-height: 1.5;
    }
    .article-excerpt p:last-child { margin-bottom: 0; }

    /* Weekly / Sobresalientes */
    .weekly-period {
      background: #fefcbf;
      color: #744210;
      padding: 12px 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      font-weight: 500;
      font-size: 0.95em;
    }
    .summary-section { border-left: 4px solid #d69e2e; }
    .summary-list { list-style: none; padding: 0; }
    .summary-list li {
      padding: 16px 0;
      border-bottom: 1px solid #edf2f7;
    }
    .summary-list li:last-child { border-bottom: none; }
    .topic-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .topic-name {
      font-weight: 700;
      color: #2d3748;
      font-size: 1.05em;
    }
    .topic-count {
      background: #ebf8ff;
      color: #0077b6;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 0.8em;
      font-weight: 600;
    }
    .topic-headlines { padding-left: 12px; }
    .headline-item {
      color: #4a5568;
      font-size: 0.9em;
      padding: 4px 0;
      padding-left: 12px;
      border-left: 2px solid #e2e8f0;
      margin-bottom: 4px;
    }
    .highlights-section { border-left: 4px solid #e53e3e; }
    .highlights-section h3 { color: #e53e3e; }
    .empty-weekly {
      background: white;
      padding: 40px;
      border-radius: 12px;
      text-align: center;
      color: #a0aec0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .empty-weekly p { margin-bottom: 8px; }

    footer {
      text-align: center;
      color: #a0aec0;
      font-size: 0.8em;
      margin-top: 30px;
      padding: 20px;
    }

    @media (max-width: 600px) {
      body { padding: 10px; }
      header { padding: 20px; }
      header h1 { font-size: 1.3em; }
      .stats { flex-direction: column; }
      .tabs { flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Monitoreo de Noticias del Agua en Mexico</h1>
      <div class="subtitle">Reporte generado el ${formatDate(now)}</div>
    </header>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab active" onclick="switchTab('noticias')">Noticias Recientes</button>
      <button class="tab" onclick="switchTab('sobresalientes')">Sobresalientes (Semanal)</button>
    </div>

    <!-- Tab 1: Noticias Recientes -->
    <div id="tab-noticias" class="tab-content active">
      ${hasNews ? `
      <div class="stats">
        <div class="stat-box">
          <div class="number">${total}</div>
          <div class="label">Noticias encontradas</div>
        </div>
        <div class="stat-box">
          <div class="number">${Object.keys(grouped).length}</div>
          <div class="label">Fuentes consultadas</div>
        </div>
      </div>

      <div class="top-section">
        <h2>Noticias Destacadas</h2>
        ${top5.map(newsCardHtml).join('\n')}
      </div>

      ${groupSections}
      ` : `
      <div class="empty-weekly">
        <p>No hay noticias nuevas en esta ejecucion.</p>
        <p>Las noticias se actualizan cada 3 dias.</p>
      </div>
      `}
    </div>

    <!-- Tab 2: Sobresalientes -->
    <div id="tab-sobresalientes" class="tab-content">
      ${weeklyContent}
    </div>

    <footer>
      Generado automaticamente por Monitoreo Agua Mexico &bull; ${dateStr}
    </footer>
  </div>

  <script>
    function switchTab(tabName) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
      document.getElementById('tab-' + tabName).classList.add('active');
      event.target.classList.add('active');
    }
  </script>
</body>
</html>`;
}

function esc(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
