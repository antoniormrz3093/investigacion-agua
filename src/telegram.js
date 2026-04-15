const TELEGRAM_API = 'https://api.telegram.org/bot';
const MAX_LENGTH = 4000;

function escMd(t) {
  if (!t) return '';
  return String(t).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function escMdUrl(u) {
  if (!u) return '';
  return String(u).replace(/[)\\]/g, '\\$&');
}

function nivelTag(nivel) {
  return nivel === 'alto' ? 'ALTO' : nivel === 'medio' ? 'MEDIO' : 'BAJO';
}

function nivelEmoji(nivel) {
  return nivel === 'alto' ? '🔴' : nivel === 'medio' ? '🟠' : '⚪';
}

function formatArticle(a, idx) {
  const tipo = (a.classification?.tipoLabel || 'Noticia').toUpperCase();
  const nivel = a.opportunity?.nivel || 'bajo';
  const tag = `${nivelEmoji(nivel)} \\[${escMd(tipo)} \\- ${nivelTag(nivel)}\\]`;

  const title = escMd(a.title || '');
  const source = escMd(a.source || '');
  const date = a.date instanceof Date ? a.date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '';
  const link = a.link || '';
  const insight = escMd(a.insight?.insightLine || a.insight?.implicaciones || '');

  const cluster = a.cluster_size > 1 ? ` \\· ${a.cluster_size} fuentes` : '';

  let block = `*${idx}\\.* ${tag}\n`;
  block += `*${title}*\n`;
  block += `_${source} \\| ${escMd(date)}${cluster}_\n`;
  if (insight) block += `📌 ${insight}\n`;
  if (link) block += `🔗 [Abrir](${escMdUrl(link)})\n`;
  return block + '\n';
}

export async function sendTelegramSummary(botToken, chatIds, result, reportMeta = {}) {
  const ids = (Array.isArray(chatIds) ? chatIds : [chatIds]).filter((id) => id && id !== 'TU_CHAT_ID_AQUI');

  if (!botToken || botToken === 'TU_TOKEN_AQUI' || ids.length === 0) {
    console.log('[Telegram] No configurado. Omitiendo envio.');
    return false;
  }

  const { processed = [], topOportunidades = [], medioOportunidades = [], stats = {} } = result;
  const altas = topOportunidades;
  const medias = medioOportunidades;

  const maxPerNivel = reportMeta.isWeekly ? 8 : 6;
  const enviados = [
    ...altas.slice(0, maxPerNivel),
    ...medias.slice(0, Math.max(0, Math.min(medias.length, 10 - Math.min(altas.length, maxPerNivel)))),
  ].slice(0, 10);

  const dateStr = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  let message;
  if (reportMeta.isWeekly) {
    message = `🌊 *Radar Hídrico RTWG — Semanal ${escMd(dateStr)}*\n\n`;
  } else {
    message = `🌊 *Radar Hídrico RTWG — ${escMd(dateStr)}*\n\n`;
  }

  message += `📊 ${stats.total || 0} ingestadas \\| ${stats.unique || 0} únicas \\| ${stats.duplicatesRemoved || 0} duplicados removidos\n`;
  message += `🔴 ${altas.length} ALTAS \\| 🟠 ${medias.length} MEDIAS \\| ${processed.length - altas.length - medias.length} informativas\n\n`;

  const footer = reportMeta.fileName ? `\n📁 Dashboard: \`${escMd(reportMeta.fileName)}\`` : '';
  const FOOTER_SAFETY = footer.length + 40;

  if (enviados.length === 0) {
    message += '_No se detectaron oportunidades altas ni medias en este corte. Revisar dashboard para contexto sectorial\\._';
  } else {
    message += `*Top ${enviados.length} oportunidades:*\n\n`;
    let included = 0;
    for (let i = 0; i < enviados.length; i++) {
      const block = formatArticle(enviados[i], i + 1);
      if (message.length + block.length + FOOTER_SAFETY > MAX_LENGTH) break;
      message += block;
      included++;
    }
    if (included < enviados.length) {
      message += `_\\+ ${enviados.length - included} más en el dashboard_\n`;
    }
  }

  message += footer;

  let allOk = true;
  for (const chatId of ids) {
    try {
      const res = await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        console.log(`[Telegram] Enviado a ${chatId}.`);
      } else {
        console.error(`[Telegram] Error en ${chatId}:`, data.description);
        allOk = false;
      }
    } catch (err) {
      console.error(`[Telegram] Error de red (${chatId}):`, err.message);
      allOk = false;
    }
  }
  return allOk;
}
