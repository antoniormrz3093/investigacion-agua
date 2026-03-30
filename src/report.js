import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function generateReport(newsItems, outputDir, weekly = null, scoredTop5 = null, allWeeklySummaries = []) {
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

  const html = buildHtml(dateStr, now, top5, grouped, newsItems.length, allWeeklySummaries);
  const filePath = join(outputDir, fileName);
  await writeFile(filePath, html, 'utf-8');

  console.log(`[Reporte] Guardado en: ${filePath}`);
  return { filePath, fileName, top5, totalNews: newsItems.length };
}

function buildHtml(dateStr, now, top5, grouped, total, allWeeklySummaries) {
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
      : desc ? `<p>${esc(desc.substring(0, 250))}</p>` : '';

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

  const hasNews = total > 0;

  // --- Build weekly tabs for sidebar ---
  const weeklyTabsHtml = allWeeklySummaries.map((ws, idx) => `
    <button class="sidebar-tab${idx === 0 ? ' active' : ''}" onclick="switchWeek('week-${idx}', this)">
      <span class="tab-week-id">${esc(ws.weekId)}</span>
      <span class="tab-period">${esc(ws.period)}</span>
      <span class="tab-count">${ws.totalNoticias} noticias</span>
    </button>`).join('\n');

  // --- Build weekly content panels ---
  const weeklyPanelsHtml = allWeeklySummaries.map((ws, idx) => {
    const top5Html = (ws.top5Analysis || []).map(article => `
      <div class="weekly-article">
        <div class="weekly-article-header">
          <span class="article-rank">#${article.rank}</span>
          <span class="article-category">${esc(article.categoriaIcon || '📰')} ${esc(article.categoria)}</span>
          <span class="relevance-badge">Score: ${article.score}</span>
        </div>
        <h3><a href="${esc(article.enlace)}" target="_blank">${esc(article.titulo)}</a></h3>
        <div class="article-source-date">
          <span class="news-source">${esc(article.fuente)}</span>
          <span class="news-date">${esc(article.fecha)}</span>
        </div>
        <div class="bullet-points">
          <ul>
            ${(article.bulletPoints || []).map(bp => `<li>${esc(bp)}</li>`).join('\n')}
          </ul>
        </div>
        ${(article.contentLines || []).length > 0 ? `
        <details class="content-details">
          <summary>Ver extracto completo</summary>
          <div class="article-excerpt">
            ${article.contentLines.map(line => `<p>${esc(line)}</p>`).join('\n')}
          </div>
        </details>` : ''}
      </div>`).join('\n');

    const categoriasHtml = (ws.categorias || []).map(cat => `
      <div class="cat-row">
        <span class="cat-icon">${esc(cat.icon || '📰')}</span>
        <span class="cat-name">${esc(cat.category)}</span>
        <span class="cat-count">${cat.count}</span>
      </div>`).join('\n');

    return `
    <div id="week-${idx}" class="week-panel${idx === 0 ? ' active' : ''}">
      <div class="week-header">
        <h2>Resumen Semanal: ${esc(ws.weekId)}</h2>
        <div class="weekly-period">${esc(ws.period)} &mdash; ${ws.totalNoticias} noticias analizadas</div>
      </div>

      ${categoriasHtml ? `
      <div class="categories-overview">
        <h3>Cobertura por Categoria</h3>
        <div class="cat-grid">
          ${categoriasHtml}
        </div>
      </div>` : ''}

      <div class="top5-section">
        <h3>Top 5 Noticias de Mayor Impacto</h3>
        ${top5Html || '<p class="empty-msg">No hay analisis disponible para esta semana.</p>'}
      </div>
    </div>`;
  }).join('\n');

  const hasWeeklySummaries = allWeeklySummaries.length > 0;

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
    }

    /* Layout: sidebar + main */
    .app-layout {
      display: flex;
      min-height: 100vh;
    }

    /* Sidebar */
    .sidebar {
      width: 260px;
      background: #1a365d;
      color: white;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      position: sticky;
      top: 0;
      height: 100vh;
    }
    .sidebar-header {
      padding: 20px 16px;
      background: linear-gradient(135deg, #0077b6, #00b4d8);
      text-align: center;
    }
    .sidebar-header h1 {
      font-size: 1.1em;
      margin-bottom: 4px;
    }
    .sidebar-header .subtitle {
      font-size: 0.75em;
      opacity: 0.85;
    }

    .sidebar-section-title {
      padding: 12px 16px 6px;
      font-size: 0.7em;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #a0aec0;
      font-weight: 600;
    }

    .sidebar-tab {
      display: flex;
      flex-direction: column;
      text-align: left;
      width: 100%;
      padding: 10px 16px;
      border: none;
      background: transparent;
      color: #cbd5e0;
      cursor: pointer;
      transition: all 0.15s;
      border-left: 3px solid transparent;
      font-family: inherit;
    }
    .sidebar-tab:hover {
      background: rgba(255,255,255,0.08);
      color: white;
    }
    .sidebar-tab.active {
      background: rgba(255,255,255,0.12);
      color: white;
      border-left-color: #00b4d8;
    }
    .tab-week-id {
      font-weight: 700;
      font-size: 0.9em;
    }
    .tab-period {
      font-size: 0.72em;
      opacity: 0.75;
      margin-top: 1px;
    }
    .tab-count {
      font-size: 0.68em;
      opacity: 0.6;
      margin-top: 1px;
    }

    .sidebar-main-tab {
      display: block;
      width: 100%;
      padding: 14px 16px;
      border: none;
      background: transparent;
      color: #cbd5e0;
      cursor: pointer;
      text-align: left;
      font-weight: 600;
      font-size: 0.92em;
      transition: all 0.15s;
      border-left: 3px solid transparent;
      font-family: inherit;
    }
    .sidebar-main-tab:hover {
      background: rgba(255,255,255,0.08);
      color: white;
    }
    .sidebar-main-tab.active {
      background: rgba(255,255,255,0.12);
      color: white;
      border-left-color: #00b4d8;
    }

    /* Main content */
    .main-content {
      flex: 1;
      padding: 24px 32px;
      max-width: 900px;
      overflow-y: auto;
    }

    .main-panel { display: none; }
    .main-panel.active { display: block; }

    /* Stats */
    .stats {
      display: flex;
      gap: 16px;
      margin: 0 0 20px;
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
    .top-section, .source-section {
      background: white;
      padding: 24px;
      border-radius: 12px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .top-section { border-left: 4px solid #0077b6; }
    .top-section h2 {
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
      font-size: 0.8em;
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
      color: #4a5568;
    }
    .article-excerpt p:last-child { margin-bottom: 0; }
    .empty-weekly, .empty-msg {
      background: white;
      padding: 40px;
      border-radius: 12px;
      text-align: center;
      color: #a0aec0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    /* === Weekly summary styles === */
    .week-panel { display: none; }
    .week-panel.active { display: block; }

    .week-header {
      margin-bottom: 20px;
    }
    .week-header h2 {
      color: #1a365d;
      font-size: 1.5em;
      margin-bottom: 6px;
    }
    .weekly-period {
      background: #fefcbf;
      color: #744210;
      padding: 10px 16px;
      border-radius: 8px;
      font-weight: 500;
      font-size: 0.9em;
    }

    /* Categories overview */
    .categories-overview {
      background: white;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .categories-overview h3 {
      color: #2d3748;
      font-size: 1.1em;
      margin-bottom: 12px;
    }
    .cat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 8px;
    }
    .cat-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #f7fafc;
      border-radius: 8px;
    }
    .cat-icon { font-size: 1.2em; }
    .cat-name { flex: 1; font-size: 0.85em; font-weight: 500; color: #2d3748; }
    .cat-count {
      background: #0077b6;
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.75em;
      font-weight: 700;
    }

    /* Top 5 weekly analysis */
    .top5-section {
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-left: 4px solid #e53e3e;
    }
    .top5-section h3 {
      color: #e53e3e;
      font-size: 1.2em;
      margin-bottom: 16px;
    }

    .weekly-article {
      padding: 16px 0;
      border-bottom: 1px solid #edf2f7;
    }
    .weekly-article:last-child { border-bottom: none; }

    .weekly-article-header {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 8px;
    }
    .article-rank {
      background: #e53e3e;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.8em;
      flex-shrink: 0;
    }
    .article-category {
      background: #edf2f7;
      color: #2d3748;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 0.78em;
      font-weight: 500;
    }

    .article-source-date {
      display: flex;
      gap: 10px;
      margin-bottom: 8px;
      font-size: 0.8em;
      align-items: center;
    }

    .weekly-article h3 { font-size: 1.05em; margin-bottom: 6px; }
    .weekly-article h3 a { color: #1a365d; text-decoration: none; }
    .weekly-article h3 a:hover { color: #0077b6; text-decoration: underline; }

    .bullet-points {
      background: #f7fafc;
      border-left: 3px solid #e53e3e;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      margin: 8px 0;
    }
    .bullet-points ul {
      list-style: none;
      padding: 0;
    }
    .bullet-points li {
      position: relative;
      padding: 4px 0 4px 18px;
      font-size: 0.88em;
      color: #4a5568;
      line-height: 1.5;
    }
    .bullet-points li::before {
      content: "\\25B8";
      position: absolute;
      left: 0;
      color: #e53e3e;
      font-weight: 700;
    }

    .content-details {
      margin-top: 8px;
    }
    .content-details summary {
      cursor: pointer;
      color: #0077b6;
      font-size: 0.82em;
      font-weight: 500;
    }
    .content-details summary:hover { text-decoration: underline; }

    footer {
      text-align: center;
      color: #a0aec0;
      font-size: 0.8em;
      margin-top: 30px;
      padding: 20px;
    }

    @media (max-width: 768px) {
      .app-layout { flex-direction: column; }
      .sidebar {
        width: 100%;
        height: auto;
        position: relative;
        flex-direction: row;
        flex-wrap: wrap;
      }
      .sidebar-header { width: 100%; }
      .sidebar-section-title { width: 100%; }
      .sidebar-tab, .sidebar-main-tab {
        width: auto;
        flex: 1;
        min-width: 120px;
        text-align: center;
        border-left: none;
        border-bottom: 3px solid transparent;
      }
      .sidebar-tab.active, .sidebar-main-tab.active {
        border-left: none;
        border-bottom-color: #00b4d8;
      }
      .main-content { padding: 16px; }
      .stats { flex-direction: column; }
      .cat-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="app-layout">
    <!-- Sidebar -->
    <nav class="sidebar">
      <div class="sidebar-header">
        <h1>Monitoreo del Agua</h1>
        <div class="subtitle">${formatDate(now)}</div>
      </div>

      <div class="sidebar-section-title">Vista actual</div>
      <button class="sidebar-main-tab active" onclick="switchMainView('noticias', this)">
        Noticias Recientes
      </button>

      ${hasWeeklySummaries ? `
      <div class="sidebar-section-title">Historial semanal</div>
      ${weeklyTabsHtml}
      ` : ''}
    </nav>

    <!-- Main content -->
    <div class="main-content">

      <!-- Panel: Noticias Recientes -->
      <div id="panel-noticias" class="main-panel active">
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
          <h2>Top 5 por Impacto de Negocio</h2>
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

      <!-- Panels: Weekly summaries -->
      ${weeklyPanelsHtml}

      <footer>
        Generado automaticamente por Monitoreo Agua Mexico &bull; ${dateStr}
      </footer>
    </div>
  </div>

  <script>
    function switchMainView(view, btn) {
      // Deactivate all panels and tabs
      document.querySelectorAll('.main-panel, .week-panel').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.sidebar-main-tab, .sidebar-tab').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + view).classList.add('active');
    }

    function switchWeek(weekId, btn) {
      // Deactivate all panels and tabs
      document.querySelectorAll('.main-panel, .week-panel').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.sidebar-main-tab, .sidebar-tab').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(weekId).classList.add('active');
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
