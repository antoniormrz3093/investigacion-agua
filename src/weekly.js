import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

// Keywords that signal high-relevance news for the water sector business
const HIGH_RELEVANCE_KEYWORDS = [
  'reforma', 'ley de aguas', 'ley aguas nacionales', 'decreto',
  'concesi', 'licitaci', 'obra pública', 'infraestructura',
  'tratamiento', 'planta tratadora', 'saneamiento',
  'CONAGUA', 'contrato', 'inversión', 'presupuesto',
  'emergencia', 'sequía', 'escasez', 'crisis hídrica',
  'contaminación', 'derecho humano al agua',
  'acuífero', 'presa', 'desalinización', 'reúso',
];

// Topic categories for grouping the weekly summary
const TOPIC_CATEGORIES = [
  { name: 'Legislación y Regulación', keywords: ['reforma', 'ley', 'decreto', 'norma', 'regulación', 'concesi', 'DOF'] },
  { name: 'Infraestructura y Obra Pública', keywords: ['obra', 'infraestructura', 'planta', 'presa', 'acueducto', 'licitaci', 'construcción'] },
  { name: 'Crisis y Emergencias', keywords: ['sequía', 'escasez', 'crisis', 'emergencia', 'inundaci', 'contaminación'] },
  { name: 'Inversión y Negocios', keywords: ['inversión', 'contrato', 'presupuesto', 'empresa', 'licitaci', 'millones'] },
  { name: 'Política y Gobierno', keywords: ['CONAGUA', 'gobierno', 'secretaría', 'presidente', 'senado', 'cámara'] },
  { name: 'Medio Ambiente y Sustentabilidad', keywords: ['sustentab', 'medio ambiente', 'ecología', 'reúso', 'reciclaje', 'humedal'] },
];

export async function loadWeeklySummary(dataDir) {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Read all news JSON files from the past 7 days
  let allNews = [];
  try {
    const files = await readdir(dataDir);
    const newsFiles = files
      .filter(f => f.startsWith('noticias-agua-') && f.endsWith('.json'))
      .sort()
      .reverse();

    for (const file of newsFiles) {
      // Extract date from filename
      const dateMatch = file.match(/noticias-agua-(\d{4}-\d{2}-\d{2})\.json/);
      if (!dateMatch) continue;

      const fileDate = new Date(dateMatch[1] + 'T12:00:00');
      if (fileDate < sevenDaysAgo) continue;

      try {
        const content = await readFile(join(dataDir, file), 'utf-8');
        const data = JSON.parse(content);
        if (data.noticias) {
          allNews.push(...data.noticias);
        }
      } catch {
        // Skip corrupted files
      }
    }
  } catch {
    // data dir might not exist yet
  }

  // Deduplicate by URL
  const seen = new Set();
  allNews = allNews.filter(item => {
    const key = item.enlace || item.titulo;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Score and rank news by relevance
  const scored = allNews.map(item => ({
    ...item,
    score: calculateRelevanceScore(item),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Top highlights (most relevant)
  const highlights = scored
    .filter(item => item.score > 0)
    .slice(0, 10)
    .map(item => ({
      title: item.titulo,
      link: item.enlace,
      source: item.fuente,
      date: item.fecha ? new Date(item.fecha) : new Date(),
      description: item.descripcion,
      origin: item.origen,
      score: item.score,
    }));

  // Generate topic-based summary points
  const summaryPoints = generateSummaryPoints(scored);

  // Period info
  const periodStart = sevenDaysAgo.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
  const periodEnd = now.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  return {
    allNews,
    highlights,
    summaryPoints,
    period: `${periodStart} al ${periodEnd}`,
    totalWeeklyNews: allNews.length,
  };
}

function calculateRelevanceScore(item) {
  let score = 0;
  const text = `${item.titulo || ''} ${item.descripcion || ''}`.toLowerCase();

  for (const keyword of HIGH_RELEVANCE_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      score += 2;
    }
  }

  // Bonus for official sources
  const source = (item.fuente || item.origen || '').toLowerCase();
  if (source.includes('conagua') || source.includes('dof')) score += 3;
  if (source.includes('oficial') || source.includes('gobierno')) score += 2;

  // Bonus for reform-related content (core business interest)
  if (text.includes('reforma') && text.includes('agua')) score += 5;
  if (text.includes('ley de aguas nacionales')) score += 5;
  if (text.includes('obra pública') || text.includes('licitación')) score += 3;

  return score;
}

function generateSummaryPoints(scoredNews) {
  const points = [];

  for (const category of TOPIC_CATEGORIES) {
    const related = scoredNews.filter(item => {
      const text = `${item.titulo || ''} ${item.descripcion || ''}`.toLowerCase();
      return category.keywords.some(kw => text.includes(kw.toLowerCase()));
    });

    if (related.length === 0) continue;

    // Get the most relevant news titles for this category
    const topTitles = related
      .slice(0, 3)
      .map(n => n.titulo || '')
      .filter(t => t.length > 0);

    // Build a summary sentence for this category
    let point = `**${category.name}** (${related.length} noticias): `;

    if (topTitles.length === 1) {
      point += topTitles[0];
    } else if (topTitles.length > 1) {
      point += `Destaca: "${topTitles[0]}". `;
      if (related.length > 1) {
        point += `Tambien se reporta sobre: "${topTitles[1]}"`;
      }
    }

    points.push({
      category: category.name,
      count: related.length,
      summary: point,
      topHeadlines: topTitles,
    });
  }

  // Sort by number of related news (most covered topics first)
  points.sort((a, b) => b.count - a.count);

  return points;
}
