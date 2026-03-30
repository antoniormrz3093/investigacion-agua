import { readFileSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { fetchGoogleNews } from './sources/google-news.js';
import { fetchConaguaNews } from './sources/conagua.js';
import { fetchDofNews } from './sources/dof.js';
import { generateReport } from './report.js';
import { loadWeeklySummary, generateWeeklySummary, loadAllWeeklySummaries } from './weekly.js';
import { sendTelegramSummary } from './telegram.js';
import { calculateRelevanceScore } from './weekly.js';
import { fetchTopArticlesContent, resolveArticleUrls } from './article-fetcher.js';
import { exportWeeklyArticlesToWord } from './word-export.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

async function main() {
  const mode = process.argv[2] || 'news'; // 'news' or 'weekly'

  console.log('=== Monitoreo de Noticias del Agua en Mexico ===');
  console.log(`Fecha: ${new Date().toLocaleString('es-MX')}`);
  console.log(`Modo: ${mode === 'weekly' ? 'Resumen semanal' : 'Busqueda de noticias'}`);
  console.log('');

  // Load config
  const configPath = resolve(ROOT, 'config.json');
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (err) {
    console.error('Error leyendo config.json:', err.message);
    process.exit(1);
  }

  const outputDir = resolve(ROOT, config.outputDir || './output');
  const dataDir = resolve(ROOT, 'data');
  await mkdir(dataDir, { recursive: true });

  let allNews = [];

  if (mode === 'weekly') {
    const { loadWeeklySummary: loadWS } = await import('./weekly.js');

    // Step 1: Load weekly news and get top 5
    console.log('[1/6] Cargando noticias acumuladas de la semana...');
    const summary = await loadWS(dataDir);
    const top5 = summary.highlights.slice(0, 5);
    console.log(`  Noticias de la semana: ${summary.totalWeeklyNews}`);
    console.log(`  Top 5 seleccionadas por impacto`);

    // Step 2: Resolve Google News URLs
    console.log('\n[2/6] Resolviendo URLs reales de articulos...');
    const resolvedUrls = await resolveArticleUrls(top5);

    // Step 3: Generate Word documents with full article text
    const infoDir = config.newsDir ? resolve(config.newsDir) : resolve(ROOT, 'output', 'articulos');
    const weekId = new Date().getFullYear() + '-S' + String(Math.ceil((Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 86400000) + 1) / 7)).padStart(2, '0');

    console.log('\n[3/6] Generando documentos Word con contenido completo...');
    // Build analysis objects for word export
    const top5ForExport = top5.map((item, idx) => ({
      rank: idx + 1,
      titulo: item.title,
      enlace: item.link,
      fuente: item.source,
      fecha: item.date instanceof Date ? item.date.toISOString().split('T')[0] : '',
      score: item.score,
      categoria: '',
    }));
    const wordResults = await exportWeeklyArticlesToWord(top5ForExport, weekId, resolvedUrls, infoDir);

    // Step 4: Generate structured summary from Word text
    console.log('\n[4/6] Generando resumen estructurado desde texto completo...');
    const weeklySummary = await generateWeeklySummary(dataDir, wordResults);
    console.log(`  Top 5 con resumen: ${weeklySummary.top5Analysis?.length || 0}`);

    // Step 5: Generate dashboard
    console.log('\n[5/6] Generando dashboard con historial semanal...');
    const allWeeklySummaries = await loadAllWeeklySummaries(dataDir);
    console.log(`  Semanas en historial: ${allWeeklySummaries.length}`);
    const reportMeta = await generateReport([], outputDir, null, null, allWeeklySummaries);

    // Step 6: Send Telegram
    console.log('\n[6/6] Enviando resumen semanal por Telegram...');
    const chatIds = config.telegram.chatIds || [config.telegram.chatId];
    const top5ForTelegram = (weeklySummary.top5Analysis || []).map(a => ({
      title: a.titulo,
      link: a.enlace,
      source: a.fuente,
      score: a.score,
      contentLines: a.bulletPoints,
    }));
    await sendTelegramSummary(
      config.telegram.botToken,
      chatIds,
      top5ForTelegram,
      { ...reportMeta, totalNews: weeklySummary.totalNoticias || 0, isWeekly: true },
    );

    console.log('\n=== Resumen semanal completado ===');
    console.log(`Dashboard: ${reportMeta.filePath}`);
    console.log(`Documentos Word: ${infoDir}\\Semana-${weekId}`);
    return;
  }

  // Normal mode: fetch news
  console.log('[1/5] Buscando noticias en todas las fuentes...');
  const [googleNews, conaguaNews, dofNews] = await Promise.all([
    fetchGoogleNews(config.keywords, config.maxNewsPerSource),
    fetchConaguaNews(config.maxNewsPerSource),
    fetchDofNews(config.maxNewsPerSource),
  ]);

  console.log(`  - Google News: ${googleNews.length} noticias`);
  console.log(`  - CONAGUA:     ${conaguaNews.length} noticias`);
  console.log(`  - DOF:         ${dofNews.length} noticias`);

  console.log('\n[2/5] Deduplicando resultados...');
  allNews = deduplicateNews([...googleNews, ...conaguaNews, ...dofNews]);
  console.log(`  Total unico: ${allNews.length} noticias`);

  if (allNews.length === 0) {
    console.log('\nNo se encontraron noticias. Verifica tu conexion a internet.');
    return;
  }

  // Save to data/ for weekly accumulation
  console.log('\n[3/5] Guardando noticias para acumulacion semanal...');
  await saveNewsData(allNews, dataDir);

  // Also save to information folder
  const newsDir = config.newsDir ? resolve(config.newsDir) : null;
  if (newsDir) {
    await saveNewsData(allNews, newsDir);
  }

  // Score news by business relevance
  console.log('\n[4/7] Calculando relevancia de negocio...');
  for (const item of allNews) {
    item.score = calculateRelevanceScore({
      titulo: item.title,
      descripcion: item.description,
      fuente: item.source,
      origen: item.origin,
    });
  }
  allNews.sort((a, b) => b.score - a.score);
  const top5 = allNews.slice(0, 5);
  console.log(`  Top 5 por impacto (scores: ${top5.map(n => n.score).join(', ')})`);

  // Fetch article content for top 5
  console.log('\n[5/7] Obteniendo contenido de articulos top 5...');
  const articleContent = await fetchTopArticlesContent(top5);
  for (const item of top5) {
    const url = item.link || '';
    item.contentLines = articleContent.get(url) || [];
  }
  console.log(`  Articulos con contenido: ${top5.filter(n => n.contentLines.length > 0).length}/5`);

  // Generate dashboard with weekly history
  console.log('\n[6/7] Generando dashboard...');
  const allWeeklySummaries = await loadAllWeeklySummaries(dataDir);
  const reportMeta = await generateReport(allNews, outputDir, null, top5, allWeeklySummaries);

  console.log('\n[7/7] Enviando notificacion por Telegram...');
  const chatIds = config.telegram.chatIds || [config.telegram.chatId];
  await sendTelegramSummary(
    config.telegram.botToken,
    chatIds,
    top5,
    reportMeta,
  );

  console.log('\n=== Proceso completado ===');
  console.log(`Dashboard: ${reportMeta.filePath}`);
  if (newsDir) console.log(`Noticias: ${newsDir}`);
}

async function saveNewsData(newsItems, dir) {
  await mkdir(dir, { recursive: true });

  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `noticias-agua-${dateStr}.json`;
  const filePath = join(dir, fileName);

  const data = {
    fecha: dateStr,
    generado: new Date().toISOString(),
    totalNoticias: newsItems.length,
    noticias: newsItems.map(item => ({
      titulo: item.title,
      fuente: item.source,
      origen: item.origin,
      fecha: item.date instanceof Date ? item.date.toISOString().split('T')[0] : '',
      enlace: item.link,
      descripcion: item.description,
    })),
  };

  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  Guardado: ${filePath}`);
}

function deduplicateNews(items) {
  const seen = new Map();

  for (const item of items) {
    const urlKey = item.link
      ? item.link.replace(/https?:\/\/(www\.)?/, '').replace(/\/$/, '')
      : '';

    if (urlKey && seen.has(urlKey)) continue;

    const titleKey = item.title.toLowerCase().replace(/[^a-záéíóúñü0-9\s]/g, '').trim();
    let isDuplicate = false;

    for (const [, existing] of seen) {
      const existingKey = existing.title.toLowerCase().replace(/[^a-záéíóúñü0-9\s]/g, '').trim();
      if (similarity(titleKey, existingKey) > 0.8) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      const key = urlKey || `title-${titleKey}`;
      seen.set(key, item);
    }
  }

  return Array.from(seen.values());
}

function similarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1;

  let matches = 0;
  const words = shorter.split(/\s+/);
  for (const word of words) {
    if (word.length > 3 && longer.includes(word)) matches++;
  }

  return words.length > 0 ? matches / words.length : 0;
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
