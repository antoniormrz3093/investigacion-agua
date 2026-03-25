import RSSParser from 'rss-parser';

const RSS_BASE = 'https://news.google.com/rss/search';

export async function fetchGoogleNews(keywords, maxPerQuery = 15) {
  const parser = new RSSParser();
  const allItems = [];
  const seenUrls = new Set();

  for (const query of keywords) {
    const url = `${RSS_BASE}?q=${encodeURIComponent(query)}&hl=es-419&gl=MX&ceid=MX:es-419`;

    try {
      const feed = await parser.parseURL(url);

      for (const item of (feed.items || []).slice(0, maxPerQuery)) {
        const link = item.link || '';
        if (seenUrls.has(link)) continue;
        seenUrls.add(link);

        allItems.push({
          title: cleanHtml(item.title || ''),
          link,
          date: item.pubDate ? new Date(item.pubDate) : new Date(),
          source: extractSource(item.title || ''),
          description: cleanHtml(item.contentSnippet || item.content || ''),
          origin: 'Google News',
        });
      }
    } catch (err) {
      console.error(`[Google News] Error buscando "${query}":`, err.message);
    }
  }

  return allItems;
}

function extractSource(title) {
  // Google News titles end with " - Source Name"
  const match = title.match(/ - ([^-]+)$/);
  return match ? match[1].trim() : 'Desconocido';
}

function cleanHtml(text) {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
