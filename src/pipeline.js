import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

import { fetchGoogleNews } from './sources/google-news.js';
import { fetchConaguaNews } from './sources/conagua.js';
import { fetchDofNews } from './sources/dof.js';
import { deduplicateNews } from './dedup.js';
import { extractArticles } from './article-fetcher.js';
import { classify } from './classify.js';
import { evaluateOpportunity } from './opportunity.js';
import { generateInsight } from './insight.js';
import { hashString } from './text-utils.js';

const NIVEL_RANK = { alto: 3, medio: 2, bajo: 1 };

function normalizeIngest(item) {
  const title = item.title || item.titulo || '';
  const link = item.link || item.enlace || '';
  const source = item.source || item.fuente || '';
  const date = item.date instanceof Date ? item.date : (item.fecha ? new Date(item.fecha) : new Date());
  return {
    id: hashString(`${title}|${link}`),
    title,
    description: item.description || item.descripcion || '',
    link,
    originalLink: link,
    source,
    origin: item.origin || item.origen || source,
    date,
    fetchedAt: new Date(),
  };
}

/**
 * Main pipeline: fetch -> clean -> dedup -> extract -> validate -> classify
 *                -> evaluate -> insight.
 *
 * Returns { processed, stats, excluded }.
 *   processed: array of fully enriched articles (unique only)
 *   stats: totals per stage
 *   excluded: items dropped during extraction (kept in JSON log for traceability)
 */
export async function runPipeline({ config, log = console }) {
  const stats = { fetched: {}, total: 0, unique: 0, duplicatesRemoved: 0,
    contentExtracted: 0, contentValid: 0, byNivel: { alto: 0, medio: 0, bajo: 0 } };

  log.log('[1/7] Fetch de fuentes...');
  const [googleNews, conaguaNews, dofNews] = await Promise.all([
    fetchGoogleNews(config.keywords, config.maxNewsPerSource).catch(() => []),
    fetchConaguaNews(config.maxNewsPerSource).catch(() => []),
    fetchDofNews(config.maxNewsPerSource).catch(() => []),
  ]);
  stats.fetched = { googleNews: googleNews.length, conagua: conaguaNews.length, dof: dofNews.length };
  log.log(`      Google News: ${googleNews.length}  CONAGUA: ${conaguaNews.length}  DOF: ${dofNews.length}`);

  const raw = [...googleNews, ...conaguaNews, ...dofNews].map(normalizeIngest);
  stats.total = raw.length;

  log.log('[2/7] Deduplicación robusta...');
  const { unique, clusters, stats: dedupStats } = deduplicateNews(raw);
  stats.unique = dedupStats.unique;
  stats.duplicatesRemoved = dedupStats.duplicatesRemoved;
  log.log(`      ${dedupStats.input} -> ${dedupStats.unique} únicas (${dedupStats.duplicatesRemoved} duplicados, ${dedupStats.clustersWithDuplicates} clusters)`);

  log.log('[3/7] Clasificación preliminar (título + descripción)...');
  for (const art of unique) {
    art.classification = classify({ title: art.title, description: art.description, content: '' });
  }

  log.log('[4/7] Pre-evaluación para priorizar extracción de contenido...');
  const preOpp = unique.map((art) => ({
    art,
    opp: evaluateOpportunity({ title: art.title, description: art.description }, art.classification),
  }));
  preOpp.sort((a, b) => b.opp.score - a.opp.score);

  const extractLimit = config.extractLimit ?? 20;
  const toExtract = preOpp.slice(0, extractLimit).map((x) => x.art);
  const skipExtract = preOpp.slice(extractLimit).map((x) => x.art);
  log.log(`      Extraer contenido para top ${toExtract.length} de ${unique.length}`);

  log.log('[5/7] Extracción de contenido con validación de calidad (>= 800 chars útiles)...');
  const extractMap = await extractArticles(toExtract, { concurrency: 5 });

  for (const art of toExtract) {
    const r = extractMap.get(art) || { paragraphs: [], content: '', contentLength: 0, contentValid: false, excludedReason: 'no_extract_result' };
    art.link = r.realUrl || art.link;
    art.content = r.content;
    art.paragraphs = r.paragraphs;
    art.contentLength = r.contentLength;
    art.contentValid = r.contentValid;
    art.excludedReason = r.excludedReason;
    if (r.contentLength > 0) stats.contentExtracted++;
    if (r.contentValid) stats.contentValid++;
  }
  for (const art of skipExtract) {
    art.content = '';
    art.paragraphs = [];
    art.contentLength = 0;
    art.contentValid = false;
    art.excludedReason = 'no_priorizado';
  }

  log.log('[6/7] Clasificación final + evaluación de oportunidad con contenido completo...');
  for (const art of unique) {
    art.classification = classify({ title: art.title, description: art.description, content: art.content || '' });
    art.opportunity = evaluateOpportunity({ title: art.title, description: art.description, content: art.content || '' }, art.classification);
    art.insight = generateInsight(art, art.classification, art.opportunity);
    stats.byNivel[art.opportunity.nivel]++;
  }

  log.log('[7/7] Ordenando por nivel de oportunidad + score...');
  unique.sort((a, b) => {
    const r = NIVEL_RANK[b.opportunity.nivel] - NIVEL_RANK[a.opportunity.nivel];
    if (r !== 0) return r;
    return b.opportunity.score - a.opportunity.score;
  });

  log.log(`      ALTO: ${stats.byNivel.alto}  MEDIO: ${stats.byNivel.medio}  BAJO: ${stats.byNivel.bajo}`);

  const topOportunidades = unique.filter((a) => a.opportunity.nivel === 'alto').slice(0, 15);
  const medioOportunidades = unique.filter((a) => a.opportunity.nivel === 'medio').slice(0, 15);

  return {
    processed: unique,
    topOportunidades,
    medioOportunidades,
    clusters,
    stats,
  };
}

/**
 * Persists the pipeline output as a traceable JSON snapshot.
 */
export async function savePipelineSnapshot(result, dataDir) {
  await mkdir(dataDir, { recursive: true });
  const dateStr = new Date().toISOString().split('T')[0];
  const filePath = join(dataDir, `noticias-agua-${dateStr}.json`);

  const payload = {
    fecha: dateStr,
    generado: new Date().toISOString(),
    stats: result.stats,
    noticias: result.processed.map(serializeArticle),
    excluded: result.processed.filter((a) => a.excludedReason && !a.contentValid).map((a) => ({
      id: a.id,
      titulo: a.title,
      enlace: a.link,
      razon: a.excludedReason,
      longitud: a.contentLength,
    })),
  };

  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return filePath;
}

export function serializeArticle(a) {
  return {
    id: a.id,
    titulo: a.title,
    fuente: a.source,
    origen: a.origin,
    fecha: a.date instanceof Date ? a.date.toISOString().split('T')[0] : String(a.date || ''),
    enlace: a.link,
    enlace_original: a.originalLink,
    descripcion: a.description,

    cluster_id: a.cluster_id,
    cluster_size: a.cluster_size,
    cluster_sources: a.cluster_sources,

    content_extraido: !!a.content,
    content_length: a.contentLength || 0,
    content_valid: !!a.contentValid,
    excluded_reason: a.excludedReason,

    clasificacion: a.classification,
    oportunidad: a.opportunity,
    insight: a.insight ? {
      resumen: a.insight.resumen,
      puntos_clave: a.insight.puntosClave,
      implicaciones: a.insight.implicaciones,
      oportunidad: a.insight.oportunidad,
      recomendacion: a.insight.recomendacion,
      insight_line: a.insight.insightLine,
    } : null,
  };
}
