import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { deduplicateNews } from './dedup.js';

/**
 * Loads persisted pipeline snapshots from the last 7 days and returns a merged
 * list of articles (rehydrated from JSON, no raw content).
 */
export async function loadWeekSnapshots(dataDir) {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  let articles = [];
  try {
    const files = await readdir(dataDir);
    const relevant = files
      .filter((f) => /^noticias-agua-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .reverse();

    for (const file of relevant) {
      const m = file.match(/noticias-agua-(\d{4}-\d{2}-\d{2})\.json/);
      if (!m) continue;
      const fileDate = new Date(m[1] + 'T12:00:00');
      if (fileDate < sevenDaysAgo) continue;
      try {
        const data = JSON.parse(await readFile(join(dataDir, file), 'utf-8'));
        if (Array.isArray(data.noticias)) {
          for (const n of data.noticias) {
            articles.push(rehydrate(n));
          }
        }
      } catch { /* skip bad file */ }
    }
  } catch { /* dir missing */ }

  return articles;
}

function rehydrate(n) {
  return {
    id: n.id,
    title: n.titulo,
    description: n.descripcion,
    link: n.enlace,
    originalLink: n.enlace_original,
    source: n.fuente,
    origin: n.origen,
    date: n.fecha ? new Date(n.fecha + 'T12:00:00') : new Date(),
    cluster_id: n.cluster_id,
    cluster_size: n.cluster_size,
    cluster_sources: n.cluster_sources,
    contentLength: n.content_length,
    contentValid: n.content_valid,
    classification: n.clasificacion,
    opportunity: n.oportunidad,
    insight: n.insight ? {
      resumen: n.insight.resumen,
      puntosClave: n.insight.puntos_clave,
      implicaciones: n.insight.implicaciones,
      oportunidad: n.insight.oportunidad,
      recomendacion: n.insight.recomendacion,
      insightLine: n.insight.insight_line,
    } : null,
  };
}

const NIVEL_RANK = { alto: 3, medio: 2, bajo: 1 };

/**
 * Builds a weekly aggregate from persisted snapshots.
 * Cross-day dedup is applied, and articles keep their highest-priority rating.
 */
export async function buildWeeklyAggregate(dataDir) {
  const articles = await loadWeekSnapshots(dataDir);

  const { unique: deduped, stats: dedupStats } = deduplicateNews(articles);

  for (const a of deduped) {
    if (!a.opportunity) a.opportunity = { nivel: 'bajo', score: 0, razones: [], signals: {} };
    if (!a.classification) a.classification = { tipo: 'otro', tipoLabel: 'Otro', tipoIcon: '📰', sector: 'mixto' };
  }

  deduped.sort((a, b) => {
    const r = NIVEL_RANK[b.opportunity.nivel] - NIVEL_RANK[a.opportunity.nivel];
    if (r !== 0) return r;
    return (b.opportunity.score || 0) - (a.opportunity.score || 0);
  });

  const topOportunidades = deduped.filter((a) => a.opportunity.nivel === 'alto').slice(0, 20);
  const medioOportunidades = deduped.filter((a) => a.opportunity.nivel === 'medio').slice(0, 20);

  const stats = {
    weekInput: articles.length,
    total: articles.length,
    unique: dedupStats.unique,
    duplicatesRemoved: dedupStats.duplicatesRemoved,
    contentExtracted: deduped.filter((a) => a.contentLength > 0).length,
    contentValid: deduped.filter((a) => a.contentValid).length,
    byNivel: {
      alto: deduped.filter((a) => a.opportunity.nivel === 'alto').length,
      medio: deduped.filter((a) => a.opportunity.nivel === 'medio').length,
      bajo: deduped.filter((a) => a.opportunity.nivel === 'bajo').length,
    },
  };

  return {
    processed: deduped,
    topOportunidades,
    medioOportunidades,
    stats,
    weekId: getWeekId(),
    period: formatPeriod(),
  };
}

export async function persistWeeklyAggregate(aggregate, dataDir) {
  const summariesDir = join(dataDir, 'weekly-summaries');
  await mkdir(summariesDir, { recursive: true });
  const filePath = join(summariesDir, `semana-${aggregate.weekId}.json`);

  const payload = {
    weekId: aggregate.weekId,
    period: aggregate.period,
    generado: new Date().toISOString(),
    stats: aggregate.stats,
    topOportunidades: aggregate.topOportunidades.map((a) => ({
      id: a.id, titulo: a.title, fuente: a.source, fecha: a.date.toISOString?.().split('T')[0] || '',
      enlace: a.link, clasificacion: a.classification, oportunidad: a.opportunity, insight: a.insight,
    })),
    medioOportunidades: aggregate.medioOportunidades.map((a) => ({
      id: a.id, titulo: a.title, fuente: a.source, fecha: a.date.toISOString?.().split('T')[0] || '',
      enlace: a.link, clasificacion: a.classification, oportunidad: a.opportunity, insight: a.insight,
    })),
  };

  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return filePath;
}

function getWeekId() {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - yearStart) / 86400000) + 1;
  const weekNum = Math.ceil(dayOfYear / 7);
  return `${now.getFullYear()}-S${String(weekNum).padStart(2, '0')}`;
}

function formatPeriod() {
  const now = new Date();
  const prior = new Date(now); prior.setDate(prior.getDate() - 7);
  const a = prior.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
  const b = now.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${a} al ${b}`;
}
