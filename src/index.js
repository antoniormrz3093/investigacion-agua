import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { runPipeline, savePipelineSnapshot } from './pipeline.js';
import { generateReport } from './report.js';
import { sendTelegramSummary } from './telegram.js';
import { exportOpportunitiesToWord } from './word-export.js';
import { buildWeeklyAggregate, persistWeeklyAggregate } from './weekly.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadConfig() {
  const configPath = resolve(ROOT, 'config.json');
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (err) {
    console.error('Error leyendo config.json:', err.message);
    process.exit(1);
  }
}

function getWeekId() {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - yearStart) / 86400000) + 1;
  const weekNum = Math.ceil(dayOfYear / 7);
  return `${now.getFullYear()}-S${String(weekNum).padStart(2, '0')}`;
}

async function main() {
  const mode = process.argv[2] || 'news';
  console.log('=== Radar Hídrico RTWG ===');
  console.log(`Fecha: ${new Date().toLocaleString('es-MX')}`);
  console.log(`Modo: ${mode}`);
  console.log('');

  const config = loadConfig();
  const outputDir = resolve(ROOT, config.outputDir || './output');
  const dataDir = resolve(ROOT, 'data');

  if (mode === 'weekly') {
    await runWeekly({ config, outputDir, dataDir });
  } else {
    await runNews({ config, outputDir, dataDir });
  }
}

async function runNews({ config, outputDir, dataDir }) {
  const result = await runPipeline({ config });

  console.log('\n[Persistencia] Guardando snapshot con trazabilidad...');
  const snapshotPath = await savePipelineSnapshot(result, dataDir);
  if (config.newsDir) await savePipelineSnapshot(result, resolve(config.newsDir));
  console.log(`  Snapshot: ${snapshotPath}`);

  console.log('\n[Dashboard] Generando...');
  const reportMeta = await generateReport(result, outputDir);
  console.log(`  Dashboard: ${reportMeta.filePath}`);

  console.log('\n[Telegram] Enviando top oportunidades...');
  const chatIds = config.telegram.chatIds || [config.telegram.chatId];
  await sendTelegramSummary(config.telegram.botToken, chatIds, result, {
    fileName: reportMeta.fileName,
    isWeekly: false,
  });

  console.log('\n=== Listo ===');
}

async function runWeekly({ config, outputDir, dataDir }) {
  console.log('[1/4] Ejecutando pipeline fresco (para incluir hoy)...');
  const todayResult = await runPipeline({ config });
  await savePipelineSnapshot(todayResult, dataDir);
  if (config.newsDir) await savePipelineSnapshot(todayResult, resolve(config.newsDir));

  console.log('\n[2/4] Agregando últimos 7 días (cross-day dedup)...');
  const weekly = await buildWeeklyAggregate(dataDir);
  console.log(`  Semana ${weekly.weekId} — ${weekly.stats.unique} únicas de ${weekly.stats.total} ingestadas (${weekly.stats.duplicatesRemoved} duplicados).`);
  console.log(`  ALTO: ${weekly.stats.byNivel.alto}  MEDIO: ${weekly.stats.byNivel.medio}  BAJO: ${weekly.stats.byNivel.bajo}`);

  console.log('\n[3/4] Generando Word SOLO para oportunidades ALTAS con contenido válido...');
  const weekId = getWeekId();
  const infoDir = config.newsDir ? resolve(config.newsDir) : resolve(outputDir, 'articulos');
  const altasConContenido = todayResult.processed.filter((a) => a.opportunity.nivel === 'alto' && a.contentValid);
  const wordResults = await exportOpportunitiesToWord(altasConContenido, weekId, infoDir);

  console.log('\n[4/4] Dashboard + Telegram...');
  const reportMeta = await generateReport(weekly, outputDir);
  await persistWeeklyAggregate(weekly, dataDir);

  const chatIds = config.telegram.chatIds || [config.telegram.chatId];
  await sendTelegramSummary(config.telegram.botToken, chatIds, weekly, {
    fileName: reportMeta.fileName,
    isWeekly: true,
  });

  console.log('\n=== Resumen semanal listo ===');
  console.log(`Dashboard: ${reportMeta.filePath}`);
  console.log(`Word (ALTAS): ${wordResults.length} documento(s)`);
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
