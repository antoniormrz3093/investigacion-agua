import * as cheerio from 'cheerio';

const DOF_SEARCH_URL = 'https://dof.gob.mx/busqueda_detalle.php';

const WATER_QUERIES = [
  'aguas nacionales',
  'CONAGUA',
  'recursos hídricos',
  'concesiones agua',
];

export async function fetchDofNews(maxItems = 15) {
  const allItems = [];
  const seenUrls = new Set();

  for (const query of WATER_QUERIES) {
    try {
      const params = new URLSearchParams({
        busqueda: query,
        tipo: 'T',
      });

      // DOF site has SSL certificate issues; use NODE_TLS_REJECT_UNAUTHORIZED
      // only for this specific request scope
      const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

      let response;
      try {
        response = await fetch(`${DOF_SEARCH_URL}?${params}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'es-MX,es;q=0.9',
          },
        });
      } finally {
        // Restore TLS setting
        if (prevTls === undefined) {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        } else {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
        }
      }

      if (!response.ok) {
        console.error(`[DOF] HTTP ${response.status} for "${query}"`);
        continue;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // DOF search results - try multiple selectors
      const selectors = [
        'table.Tabla_Busqueda tr',
        '.resultado-busqueda',
        'table tr:has(a)',
        '.contenido a',
        'table tr',
      ];

      let results = $([]);
      for (const sel of selectors) {
        results = $(sel);
        if (results.length > 0) break;
      }

      // Fallback: find all links that look like DOF articles
      if (results.length === 0) {
        $('a[href*="nota_detalle"], a[href*="index_111"]').each((i, el) => {
          if (allItems.length >= maxItems) return false;

          const $a = $(el);
          const title = $a.text().trim();
          let link = $a.attr('href') || '';

          if (!title || title.length < 10) return;
          if (!link.startsWith('http')) link = `https://dof.gob.mx/${link}`;
          if (seenUrls.has(link)) return;
          seenUrls.add(link);

          allItems.push({
            title: title.substring(0, 300),
            link,
            date: new Date(),
            source: 'DOF',
            description: title,
            origin: 'Diario Oficial de la Federación',
          });
        });
        continue;
      }

      results.each((i, el) => {
        if (allItems.length >= maxItems) return false;

        const $el = $(el);
        const linkEl = $el.find('a').first();
        const title = linkEl.text().trim() || $el.text().trim();

        if (!title || title.length < 10) return;

        let link = linkEl.attr('href') || '';
        if (link && !link.startsWith('http')) {
          link = `https://dof.gob.mx/${link}`;
        }

        if (seenUrls.has(link)) return;
        if (link) seenUrls.add(link);

        const dateText = $el.find('td:nth-child(2), .fecha').text().trim();

        allItems.push({
          title: title.substring(0, 300),
          link,
          date: parseDofDate(dateText),
          source: 'DOF',
          description: title,
          origin: 'Diario Oficial de la Federación',
        });
      });
    } catch (err) {
      console.error(`[DOF] Error buscando "${query}":`, err.message);
    }
  }

  return allItems;
}

function parseDofDate(text) {
  if (!text) return new Date();
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
  }
  const d = new Date(text);
  return isNaN(d.getTime()) ? new Date() : d;
}
