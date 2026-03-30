import { readFileSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { fetchGoogleNews } from './sources/google-news.js';
import { fetchConaguaNews } from './sources/conagua.js';
import { fetchDofNews } from './sources/dof.js';
import { generateReport } from './report.js';
import { loadWeeklySummary } from './weekly.js';
import { sendTelegramSummary } from './telegram.js';
import { calculateRelevanceScore } from './weekly.js';
import { fetchTopArticlesContent } from './article-fetcher.js';

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
    // Weekly mode: generate highlights from accumulated data
    console.log('[1/3] Cargando noticias acumuladas de la semana...');
    const weekly = await loadWeeklySummary(dataDir);
    console.log(`  Noticias de la semana: ${weekly.allNews.length}`);

    console.log('\n[2/3] Generando dashboard con pestana Sobresalientes...');
    const reportMeta = await generateReport([], outputDir, weekly);

    console.log('\n[3/3] Enviando resumen semanal por Telegram...');
    const chatIds = config.telegram.chatIds || [config.telegram.chatId];
    await sendTelegramSummary(
      config.telegram.botToken,
      chatIds,
      weekly.highlights.slice(0, 5),
      { ...reportMeta, totalNews: weekly.allNews.length, isWeekly: true },
    );

    console.log('\n=== Resumen semanal completado ===');
    console.log(`Dashboard: ${reportMeta.filePath}`);
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

  // Generate dashboard with existing weekly data
  console.log('\n[6/7] Generando dashboard...');
  const weekly = await loadWeeklySummary(dataDir);
  const reportMeta = await generateReport(allNews, outputDir, weekly, top5);

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
