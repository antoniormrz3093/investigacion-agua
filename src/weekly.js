import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { fetchTopArticlesContent } from './article-fetcher.js';

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
  { name: 'Legislación y Regulación', icon: '⚖️', keywords: ['reforma', 'ley', 'decreto', 'norma', 'regulación', 'concesi', 'DOF'] },
  { name: 'Infraestructura y Obra Pública', icon: '🏗️', keywords: ['obra', 'infraestructura', 'planta', 'presa', 'acueducto', 'licitaci', 'construcción'] },
  { name: 'Crisis y Emergencias', icon: '🚨', keywords: ['sequía', 'escasez', 'crisis', 'emergencia', 'inundaci', 'contaminación'] },
  { name: 'Inversión y Negocios', icon: '💰', keywords: ['inversión', 'contrato', 'presupuesto', 'empresa', 'licitaci', 'millones'] },
  { name: 'Política y Gobierno', icon: '🏛️', keywords: ['CONAGUA', 'gobierno', 'secretaría', 'presidente', 'senado', 'cámara'] },
  { name: 'Medio Ambiente y Sustentabilidad', icon: '🌿', keywords: ['sustentab', 'medio ambiente', 'ecología', 'reúso', 'reciclaje', 'humedal'] },
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

/**
 * Generates a full structured weekly summary:
 * - Fetches content for top 5
 * - Generates bullet points per article
 * - Categorizes each article
 * - Saves to persistent storage
 */
export async function generateWeeklySummary(dataDir) {
  const summary = await loadWeeklySummary(dataDir);

  if (summary.highlights.length === 0) {
    return { ...summary, top5Analysis: [], weekId: getWeekId() };
  }

  // Take top 5 highlights
  const top5 = summary.highlights.slice(0, 5);

  // Fetch article content
  console.log('  Obteniendo contenido de articulos top 5 semanal...');
  const contentMap = await fetchTopArticlesContent(top5);

  // Build structured analysis for each
  const top5Analysis = top5.map((item, idx) => {
    const url = item.link || '';
    const contentLines = contentMap.get(url) || [];
    const category = classifyArticle(item);
    const bulletPoints = generateBulletPoints(item, contentLines);

    return {
      rank: idx + 1,
      titulo: item.title,
      enlace: item.link,
      fuente: item.source,
      fecha: item.date instanceof Date ? item.date.toISOString().split('T')[0] : '',
      score: item.score,
      categoria: category.name,
      categoriaIcon: category.icon,
      contentLines,
      bulletPoints,
    };
  });

  const weekId = getWeekId();
  const now = new Date();

  const result = {
    weekId,
    period: summary.period,
    generado: now.toISOString(),
    totalNoticias: summary.totalWeeklyNews,
    top5Analysis,
    categorias: summary.summaryPoints,
  };

  // Save to persistent storage
  const summariesDir = join(dataDir, 'weekly-summaries');
  await mkdir(summariesDir, { recursive: true });
  const filePath = join(summariesDir, `semana-${weekId}.json`);
  await writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`  Resumen semanal guardado: ${filePath}`);

  return result;
}

/**
 * Loads all saved weekly summaries for the dashboard history.
 */
export async function loadAllWeeklySummaries(dataDir) {
  const summariesDir = join(dataDir, 'weekly-summaries');
  const summaries = [];

  try {
    const files = await readdir(summariesDir);
    const weekFiles = files
      .filter(f => f.startsWith('semana-') && f.endsWith('.json'))
      .sort()
      .reverse();

    for (const file of weekFiles) {
      try {
        const content = await readFile(join(summariesDir, file), 'utf-8');
        summaries.push(JSON.parse(content));
      } catch {
        // Skip corrupted files
      }
    }
  } catch {
    // No summaries yet
  }

  return summaries;
}

export function calculateRelevanceScore(item) {
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

/**
 * Classifies an article into the best-matching topic category.
 */
function classifyArticle(item) {
  const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
  let bestCategory = { name: 'General', icon: '📰' };
  let bestScore = 0;

  for (const cat of TOPIC_CATEGORIES) {
    let catScore = 0;
    for (const kw of cat.keywords) {
      if (text.includes(kw.toLowerCase())) catScore++;
    }
    if (catScore > bestScore) {
      bestScore = catScore;
      bestCategory = cat;
    }
  }

  return bestCategory;
}

/**
 * Generates 3-5 bullet points summarizing an article from its content lines.
 * Uses keyword extraction to pick the most relevant sentences.
 */
function generateBulletPoints(item, contentLines) {
  const title = (item.title || '').toLowerCase();
  const allText = contentLines.length > 0
    ? contentLines.join(' ')
    : (item.description || '');

  if (!allText || allText.length < 20) {
    return [`Noticia de ${item.source || 'fuente desconocida'}: ${item.title || ''}`];
  }

  // Split into sentences
  const sentences = allText
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 300);

  if (sentences.length === 0) {
    return contentLines.length > 0
      ? contentLines.slice(0, 3)
      : [allText.substring(0, 200)];
  }

  // Score each sentence by keyword relevance
  const scored = sentences.map(sentence => {
    const lower = sentence.toLowerCase();
    let score = 0;

    for (const kw of HIGH_RELEVANCE_KEYWORDS) {
      if (lower.includes(kw.toLowerCase())) score += 2;
    }

    // Boost sentences that relate to the title
    const titleWords = title.split(/\s+/).filter(w => w.length > 4);
    for (const tw of titleWords) {
      if (lower.includes(tw)) score += 1;
    }

    // Slight boost for sentences with numbers (dates, amounts, stats)
    if (/\d+/.test(sentence)) score += 1;

    // Slight penalty for very short sentences
    if (sentence.length < 40) score -= 1;

    return { sentence, score };
  });

  // Sort by score, take top 3-5
  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, 4).map(s => s.sentence);

  // If we got fewer than 2, pad with first content lines
  if (selected.length < 2 && contentLines.length > 0) {
    for (const line of contentLines) {
      if (selected.length >= 3) break;
      if (!selected.includes(line)) selected.push(line);
    }
  }

  return selected;
}

function generateSummaryPoints(scoredNews) {
  const points = [];

  for (const category of TOPIC_CATEGORIES) {
    const related = scoredNews.filter(item => {
      const text = `${item.titulo || ''} ${item.descripcion || ''}`.toLowerCase();
      return category.keywords.some(kw => text.includes(kw.toLowerCase()));
    });

    if (related.length === 0) continue;

    const topTitles = related
      .slice(0, 3)
      .map(n => n.titulo || '')
      .filter(t => t.length > 0);

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
      icon: category.icon,
      count: related.length,
      summary: point,
      topHeadlines: topTitles,
    });
  }

  points.sort((a, b) => b.count - a.count);
  return points;
}

function getWeekId() {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - yearStart) / 86400000) + 1;
  const weekNum = Math.ceil(dayOfYear / 7);
  return `${now.getFullYear()}-S${String(weekNum).padStart(2, '0')}`;
}
