const TELEGRAM_API = 'https://api.telegram.org/bot';

export async function sendTelegramSummary(botToken, chatIds, top5, reportMeta) {
  // Support both single chatId (string) and array of chatIds
  const ids = Array.isArray(chatIds) ? chatIds : [chatIds];
  const validIds = ids.filter(id => id && id !== 'TU_CHAT_ID_AQUI');

  if (!botToken || botToken === 'TU_TOKEN_AQUI' || validIds.length === 0) {
    console.log('[Telegram] No configurado. Omitiendo envio.');
    console.log('[Telegram] Configura botToken y chatIds en config.json');
    return false;
  }

  const dateStr = new Date().toLocaleDateString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  let message;

  if (reportMeta.isWeekly) {
    message = `🌊 *RESUMEN SEMANAL del Agua - ${dateStr}*\n`;
    message += `📊 ${reportMeta.totalNews} noticias analizadas esta semana\n\n`;
    message += `⭐ *Noticias Sobresalientes:*\n\n`;
  } else {
    message = `🌊 *Monitoreo del Agua - ${dateStr}*\n`;
    message += `📊 ${reportMeta.totalNews} noticias encontradas\n\n`;
    message += `📌 *Top 5 por Impacto de Negocio:*\n\n`;
  }

  for (let i = 0; i < top5.length; i++) {
    const item = top5[i];
    const title = escapeMarkdown(item.title || item.titulo || '');
    const source = escapeMarkdown(item.source || item.fuente || '');
    const link = item.link || item.enlace || '';
    const contentLines = item.contentLines || [];

    message += `${i + 1}\\. [${title}](${link})\n`;
    message += `   _${source}_\n`;

    if (contentLines.length > 0) {
      message += '\n';
      for (const line of contentLines) {
        message += `> ${escapeMarkdown(line)}\n`;
      }
    }

    message += '\n';
  }

  message += `📁 Reporte completo: \`${reportMeta.fileName}\``;

  let allOk = true;
  for (const chatId of validIds) {
    try {
      const url = `${TELEGRAM_API}${botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      });

      const result = await response.json();

      if (result.ok) {
        console.log(`[Telegram] Mensaje enviado a ${chatId}.`);
      } else {
        console.error(`[Telegram] Error enviando a ${chatId}:`, result.description);
        allOk = false;
      }
    } catch (err) {
      console.error(`[Telegram] Error de conexion a ${chatId}:`, err.message);
      allOk = false;
    }
  }

  return allOk;
}

function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
