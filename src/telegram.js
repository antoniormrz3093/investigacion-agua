const TELEGRAM_API = 'https://api.telegram.org/bot';

export async function sendTelegramSummary(botToken, chatId, top5, reportMeta) {
  if (!botToken || botToken === 'TU_TOKEN_AQUI' || !chatId || chatId === 'TU_CHAT_ID_AQUI') {
    console.log('[Telegram] No configurado. Omitiendo envio.');
    console.log('[Telegram] Configura botToken y chatId en config.json');
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
    message += `📌 *Top 5 Noticias:*\n\n`;
  }

  for (let i = 0; i < top5.length; i++) {
    const item = top5[i];
    const title = escapeMarkdown(item.title || item.titulo || '');
    const source = escapeMarkdown(item.source || item.fuente || '');
    const link = item.link || item.enlace || '';
    message += `${i + 1}\\. [${title}](${link})\n`;
    message += `   _${source}_\n\n`;
  }

  message += `📁 Reporte completo: \`${reportMeta.fileName}\``;

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
      console.log('[Telegram] Mensaje enviado exitosamente.');
      return true;
    } else {
      console.error('[Telegram] Error:', result.description);
      return false;
    }
  } catch (err) {
    console.error('[Telegram] Error de conexion:', err.message);
    return false;
  }
}

function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
