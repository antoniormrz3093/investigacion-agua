import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const NIVEL_STYLE = {
  alto: { label: 'ALTO', color: '#e53e3e', bg: '#fff5f5', icon: '🔴' },
  medio: { label: 'MEDIO', color: '#dd6b20', bg: '#fffaf0', icon: '🟠' },
  bajo: { label: 'BAJO', color: '#718096', bg: '#f7fafc', icon: '⚪' },
};

function esc(t) {
  if (t == null) return '';
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
}

function groupBy(list, getKey) {
  const map = new Map();
  for (const item of list) {
    const k = getKey(item) || 'Sin clasificar';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

function oppCardHtml(a) {
  const nivel = a.opportunity.nivel;
  const style = NIVEL_STYLE[nivel];
  const cls = a.classification;
  const insight = a.insight || {};
  const fuentes = a.cluster_size > 1 ? ` · ${a.cluster_size} fuentes` : '';
  const excerpt = insight.puntosClave?.length
    ? `<ul class="bullets">${insight.puntosClave.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
    : (a.description ? `<p class="desc">${esc(a.description.slice(0, 240))}</p>` : '');

  return `
  <article class="opp-card" data-nivel="${nivel}" data-tipo="${esc(cls.tipo)}" data-region="${esc(cls.region || '')}">
    <div class="opp-head">
      <span class="badge nivel" style="background:${style.bg};color:${style.color};border:1px solid ${style.color}">${style.icon} ${style.label}</span>
      <span class="badge tipo">${esc(cls.tipoIcon || '📰')} ${esc(cls.tipoLabel)}</span>
      ${cls.subtipo ? `<span class="badge sub">${esc(cls.subtipo)}</span>` : ''}
      ${cls.region ? `<span class="badge region">📍 ${esc(cls.region)}</span>` : ''}
      ${cls.sector && cls.sector !== 'mixto' ? `<span class="badge sector">${esc(cls.sector)}</span>` : ''}
      ${a.opportunity.monto ? `<span class="badge monto">💵 ${esc(a.opportunity.monto)}</span>` : ''}
    </div>
    <h3><a href="${esc(a.link)}" target="_blank" rel="noopener">${esc(a.title)}</a></h3>
    <div class="meta">
      <span class="source">${esc(a.source)}</span>
      <span class="date">${formatDate(a.date)}</span>${fuentes ? `<span class="sources-count">${fuentes}</span>` : ''}
      <span class="score">score ${a.opportunity.score}</span>
    </div>
    <div class="insight-line">${esc(insight.insightLine || '')}</div>
    ${excerpt}
    <details class="detail">
      <summary>Implicaciones y oportunidad</summary>
      <div class="detail-body">
        <p><strong>Implicaciones:</strong> ${esc(insight.implicaciones || '—')}</p>
        <p><strong>Oportunidad RTWG:</strong> ${esc(insight.oportunidad || '—')}</p>
        <p><strong>Recomendación:</strong> ${esc(insight.recomendacion || '—')}</p>
        ${a.opportunity.razones?.length ? `<p class="razones"><strong>Señales detectadas:</strong> ${a.opportunity.razones.map(esc).join(' · ')}</p>` : ''}
      </div>
    </details>
  </article>`;
}

function groupSectionHtml(title, groups, emptyMsg = 'Sin datos') {
  if (!groups.length) return `<div class="empty">${esc(emptyMsg)}</div>`;
  return groups.map(([key, items]) => `
    <div class="group">
      <div class="group-head">
        <span class="group-name">${esc(key)}</span>
        <span class="group-count">${items.length}</span>
      </div>
      <div class="group-items">
        ${items.slice(0, 5).map((a) => `
          <a class="group-item" href="${esc(a.link)}" target="_blank" rel="noopener" title="${esc(a.title)}">
            <span class="gi-title">${esc(a.title)}</span>
            <span class="gi-meta">${esc(a.source)} · ${formatDate(a.date)}</span>
          </a>`).join('')}
        ${items.length > 5 ? `<div class="more">+${items.length - 5} más</div>` : ''}
      </div>
    </div>`).join('');
}

function buildHtml({ dateStr, now, processed, topOpps, medioOpps, stats }) {
  const total = processed.length;
  const alto = processed.filter((a) => a.opportunity.nivel === 'alto');
  const medio = processed.filter((a) => a.opportunity.nivel === 'medio');
  const bajo = processed.filter((a) => a.opportunity.nivel === 'bajo');

  const byTipo = groupBy(processed.filter((a) => a.opportunity.nivel !== 'bajo'), (a) => `${a.classification.tipoIcon} ${a.classification.tipoLabel}`);
  const byRegion = groupBy(processed.filter((a) => a.classification.region && a.opportunity.nivel !== 'bajo'), (a) => a.classification.region);
  const bySector = groupBy(processed.filter((a) => a.classification.sector && a.classification.sector !== 'mixto' && a.opportunity.nivel !== 'bajo'), (a) => a.classification.sector);

  const topHtml = topOpps.map(oppCardHtml).join('');
  const medioHtml = medioOpps.map(oppCardHtml).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Radar de Oportunidades Hídricas RTWG — ${dateStr}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',system-ui,-apple-system,sans-serif; background:#f0f4f8; color:#1a202c; line-height:1.5; }
  header.top { background:linear-gradient(135deg,#0a2540,#0077b6); color:white; padding:24px 32px; }
  header.top h1 { font-size:1.4em; margin-bottom:4px; }
  header.top .subtitle { opacity:0.85; font-size:0.9em; }

  main { max-width:1200px; margin:0 auto; padding:24px 16px; }

  .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-bottom:24px; }
  .stat { background:white; padding:14px 18px; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.08); }
  .stat .n { font-size:1.8em; font-weight:700; color:#0a2540; }
  .stat .l { font-size:0.8em; color:#718096; text-transform:uppercase; letter-spacing:0.5px; }
  .stat.alto .n { color:#e53e3e; }
  .stat.medio .n { color:#dd6b20; }
  .stat.bajo .n { color:#718096; }

  section { background:white; border-radius:12px; padding:20px 24px; margin-bottom:24px; box-shadow:0 1px 3px rgba(0,0,0,0.08); }
  section h2 { color:#0a2540; font-size:1.15em; margin-bottom:14px; padding-bottom:8px; border-bottom:2px solid #edf2f7; display:flex; align-items:center; gap:10px; }
  section h2 .count { color:#a0aec0; font-weight:400; font-size:0.8em; }
  section.top { border-left:4px solid #e53e3e; }
  section.mid { border-left:4px solid #dd6b20; }

  .opp-card { padding:16px 0; border-bottom:1px solid #edf2f7; }
  .opp-card:last-child { border-bottom:none; }
  .opp-head { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
  .badge { font-size:0.72em; padding:3px 9px; border-radius:12px; font-weight:600; background:#edf2f7; color:#2d3748; }
  .badge.nivel { font-weight:700; }
  .badge.tipo { background:#ebf8ff; color:#0077b6; }
  .badge.sub { background:#faf5ff; color:#6b46c1; }
  .badge.region { background:#f0fff4; color:#276749; }
  .badge.sector { background:#fffaf0; color:#9c4221; text-transform:capitalize; }
  .badge.monto { background:#fefcbf; color:#744210; }

  .opp-card h3 { font-size:1.03em; margin:6px 0; line-height:1.35; }
  .opp-card h3 a { color:#1a365d; text-decoration:none; }
  .opp-card h3 a:hover { color:#0077b6; text-decoration:underline; }
  .meta { display:flex; flex-wrap:wrap; gap:10px; font-size:0.78em; color:#718096; margin-bottom:8px; }
  .meta .source { background:#edf2f7; color:#2d3748; padding:1px 8px; border-radius:4px; font-weight:600; }
  .meta .score { color:#9c4221; }
  .insight-line { font-size:0.88em; color:#2d3748; font-weight:500; padding:8px 12px; background:#f7fafc; border-left:3px solid #0077b6; border-radius:0 6px 6px 0; margin:6px 0; }
  .bullets { list-style:none; padding:8px 0 0 0; }
  .bullets li { position:relative; padding:3px 0 3px 18px; font-size:0.85em; color:#4a5568; line-height:1.45; }
  .bullets li::before { content:"▸"; position:absolute; left:0; color:#e53e3e; font-weight:700; }
  .desc { font-size:0.87em; color:#4a5568; margin-top:6px; }

  details.detail { margin-top:8px; }
  details.detail > summary { cursor:pointer; color:#0077b6; font-size:0.82em; font-weight:500; padding:4px 0; }
  details.detail > summary:hover { text-decoration:underline; }
  .detail-body { background:#f7fafc; padding:12px 14px; border-radius:6px; margin-top:6px; font-size:0.85em; color:#2d3748; }
  .detail-body p { margin-bottom:6px; }
  .detail-body p:last-child { margin-bottom:0; }
  .razones { color:#718096; font-size:0.95em; font-style:italic; }

  .groups-wrap { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; }
  .group { background:#f7fafc; border-radius:8px; padding:12px 14px; border-left:3px solid #0077b6; }
  .group-head { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px; }
  .group-name { font-weight:600; font-size:0.9em; color:#2d3748; }
  .group-count { background:#0077b6; color:white; padding:1px 8px; border-radius:10px; font-size:0.72em; font-weight:700; }
  .group-item { display:block; padding:5px 0; font-size:0.82em; color:#4a5568; text-decoration:none; border-bottom:1px dashed #e2e8f0; }
  .group-item:last-child { border-bottom:none; }
  .group-item:hover .gi-title { color:#0077b6; }
  .gi-title { display:block; line-height:1.35; }
  .gi-meta { display:block; font-size:0.88em; color:#a0aec0; margin-top:2px; }
  .more { font-size:0.78em; color:#a0aec0; padding-top:4px; font-style:italic; }

  .filter-bar { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
  .filter-btn { background:#edf2f7; border:1px solid transparent; border-radius:20px; padding:4px 12px; font-size:0.78em; font-weight:500; color:#4a5568; cursor:pointer; font-family:inherit; }
  .filter-btn:hover { background:#e2e8f0; }
  .filter-btn.active { background:#0077b6; color:white; border-color:#0077b6; }

  .empty { padding:14px; text-align:center; color:#a0aec0; font-size:0.88em; }

  footer { text-align:center; color:#a0aec0; font-size:0.8em; padding:20px; }

  @media (max-width:640px) {
    header.top { padding:16px 18px; }
    main { padding:16px 10px; }
    section { padding:14px; }
  }
</style>
</head>
<body>
<header class="top">
  <h1>Radar de Oportunidades Hídricas · RTWG</h1>
  <div class="subtitle">${formatDate(now)} · ${stats.fetched ? `${stats.fetched.googleNews || 0} Google News · ${stats.fetched.conagua || 0} CONAGUA · ${stats.fetched.dof || 0} DOF` : ''}</div>
</header>

<main>

  <div class="stats-grid">
    <div class="stat"><div class="n">${stats.total}</div><div class="l">Noticias ingestadas</div></div>
    <div class="stat"><div class="n">${stats.unique}</div><div class="l">Únicas (post-dedup)</div></div>
    <div class="stat"><div class="n">${stats.duplicatesRemoved}</div><div class="l">Duplicados removidos</div></div>
    <div class="stat"><div class="n">${stats.contentValid}/${stats.contentExtracted}</div><div class="l">Contenido válido / extraído</div></div>
    <div class="stat alto"><div class="n">${alto.length}</div><div class="l">Oportunidad ALTA</div></div>
    <div class="stat medio"><div class="n">${medio.length}</div><div class="l">Oportunidad MEDIA</div></div>
    <div class="stat bajo"><div class="n">${bajo.length}</div><div class="l">Informativo / Bajo</div></div>
  </div>

  <section class="top">
    <h2>🎯 Top Oportunidades ALTAS <span class="count">(${topOpps.length})</span></h2>
    ${topOpps.length ? topHtml : '<div class="empty">No hay oportunidades ALTAS en este corte. Ver medias y radar de contexto abajo.</div>'}
  </section>

  <section class="mid">
    <h2>🟠 Oportunidades MEDIAS <span class="count">(${medioOpps.length})</span></h2>
    ${medioOpps.length ? medioHtml : '<div class="empty">Sin oportunidades medias en este corte.</div>'}
  </section>

  <section>
    <h2>📂 Distribución por tipo</h2>
    <div class="groups-wrap">${groupSectionHtml('tipo', byTipo, 'Sin clasificación.')}</div>
  </section>

  <section>
    <h2>📍 Distribución por región</h2>
    <div class="groups-wrap">${groupSectionHtml('region', byRegion, 'Sin región detectada en noticias relevantes.')}</div>
  </section>

  <section>
    <h2>🏭 Distribución por sector</h2>
    <div class="groups-wrap">${groupSectionHtml('sector', bySector, 'Sin sector dominante en noticias relevantes.')}</div>
  </section>

  <footer>Radar Hídrico RTWG · generado ${dateStr} · ${total} noticias procesadas</footer>
</main>
</body>
</html>`;
}

/**
 * Generates the opportunity-oriented dashboard.
 * @param {object} result - pipeline output
 * @param {string} outputDir
 */
export async function generateReport(result, outputDir) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const fileName = `reporte-agua-${dateStr}.html`;
  await mkdir(outputDir, { recursive: true });

  const html = buildHtml({
    dateStr,
    now,
    processed: result.processed,
    topOpps: result.topOportunidades,
    medioOpps: result.medioOportunidades,
    stats: result.stats,
  });

  const filePath = join(outputDir, fileName);
  await writeFile(filePath, html, 'utf-8');

  return { filePath, fileName };
}
