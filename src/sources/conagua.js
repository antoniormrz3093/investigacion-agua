import * as cheerio from 'cheerio';

// gob.mx search API for CONAGUA content
const CONAGUA_SEARCH_URL = 'https://www.gob.mx/busca';
const CONAGUA_MAIN_URL = 'https://www.gob.mx/conagua';

export async function fetchConaguaNews(maxItems = 15) {
  const items = [];
  const seenUrls = new Set();

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language': 'es-MX,es;q=0.9',
  };

  // Strategy 1: gob.mx search for CONAGUA water content
  const searchQueries = ['agua', 'reforma aguas', 'infraestructura hidraulica'];
  for (const q of searchQueries) {
    try {
      const params = new URLSearchParams({
        utf8: '✓',
        site: 'conagua',
        q,
      });

      const response = await fetch(`${CONAGUA_SEARCH_URL}?${params}`, { headers });

      if (!response.ok) continue;

      const html = await response.text();
      const $ = cheerio.load(html);

      // gob.mx search results
      const selectors = [
        '.search-result', '.results-list li', '.article-body',
        '.list-article-items .article-body', 'article', '.resultado',
      ];

      let results = $([]);
      for (const sel of selectors) {
        results = $(sel);
        if (results.length > 0) break;
      }

      // If none of the specific selectors work, try all links with relevant paths
      if (results.length === 0) {
        $('a[href*="/conagua/"]').each((i, el) => {
          if (items.length >= maxItems) return false;

          const $a = $(el);
          let link = $a.attr('href') || '';
          const title = $a.text().trim();

          if (!title || title.length < 15) return;
          if (!link.startsWith('http')) link = `https://www.gob.mx${link}`;
          if (seenUrls.has(link)) return;
          seenUrls.add(link);

          items.push({
            title,
            link,
            date: new Date(),
            source: 'CONAGUA',
            description: title,
            origin: 'CONAGUA',
          });
        });
        continue;
      }

      results.each((i, el) => {
        if (items.length >= maxItems) return false;

        const $el = $(el);
        const titleEl = $el.find('h2 a, h3 a, .title a, a').first();
        const title = titleEl.text().trim();
        let link = titleEl.attr('href') || '';

        if (!title || title.length < 10) return;
        if (link && !link.startsWith('http')) link = `https://www.gob.mx${link}`;
        if (seenUrls.has(link)) return;
        if (link) seenUrls.add(link);

        const dateText = $el.find('.date, time, .article-date').first().text().trim();
        const description = $el.find('p, .description, .summary').first().text().trim();

        items.push({
          title,
          link,
          date: parseSpanishDate(dateText),
          source: 'CONAGUA',
          description: description || title,
          origin: 'CONAGUA',
        });
      });
    } catch (err) {
      console.error(`[CONAGUA] Error buscando "${q}":`, err.message);
    }
  }

  // Strategy 2: Scrape main CONAGUA page for recent content
  if (items.length === 0) {
    try {
      const response = await fetch(CONAGUA_MAIN_URL, { headers });
      if (response.ok) {
        const html = await response.text();
        const $ = cheerio.load(html);

        $('a').each((i, el) => {
          if (items.length >= maxItems) return false;

          const $a = $(el);
          let link = $a.attr('href') || '';
          const title = $a.text().trim();

          // Filter for relevant content links
          if (!title || title.length < 20) return;
          if (!link.includes('/conagua/') && !link.includes('agua')) return;
          if (!link.startsWith('http')) link = `https://www.gob.mx${link}`;
          if (seenUrls.has(link)) return;
          seenUrls.add(link);

          items.push({
            title,
            link,
            date: new Date(),
            source: 'CONAGUA',
            description: title,
            origin: 'CONAGUA',
          });
        });
      }
    } catch (err) {
      console.error('[CONAGUA] Error en pagina principal:', err.message);
    }
  }

  return items;
}

function parseSpanishDate(text) {
  if (!text) return new Date();

  const d = new Date(text);
  if (!isNaN(d.getTime())) return d;

  const months = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  };

  const match = text.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
  if (match) {
    const month = months[match[2].toLowerCase()];
    if (month !== undefined) {
      return new Date(parseInt(match[3]), month, parseInt(match[1]));
    }
  }

  return new Date();
}
