import * as cheerio from 'cheerio';

/**
 * Checks if a URL is a Google News redirect (can't be fetched directly).
 */
function isGoogleNewsUrl(url) {
  return url.includes('news.google.com/rss/articles') || url.includes('news.google.com/articles');
}

/**
 * Resolves a Google News redirect URL to the real article URL
 * by searching DuckDuckGo for the article title + source.
 */
async function resolveGoogleNewsUrl(title, source) {
  if (!title) return null;

  // Clean title: remove " - SourceName" suffix that Google News adds
  const cleanTitle = title.replace(/ - [^-]+$/, '').trim();
  const query = encodeURIComponent(cleanTitle + ' ' + (source || ''));
  const searchUrl = 'https://html.duckduckgo.com/html/?q=' + query;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(searchUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    clearTimeout(timer);
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Get the first result URL
    const firstHref = $('.result__a').first().attr('href') || '';
    const urlMatch = firstHref.match(/uddg=([^&]+)/);
    const resolvedUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : firstHref;

    // Skip if it's still a Google News URL or empty
    if (!resolvedUrl || isGoogleNewsUrl(resolvedUrl) || resolvedUrl.includes('google.com')) {
      return null;
    }

    return resolvedUrl;
  } catch {
    return null;
  }
}

/**
 * Fetches article content from a URL and extracts the first 7 meaningful lines.
 */
export async function fetchArticleContent(url, timeoutMs = 8000) {
  if (!url) return [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    });

    clearTimeout(timer);

    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove non-content elements
    $('script, style, nav, footer, header, aside, iframe, noscript, .ad, .ads, .sidebar, .menu, .navigation').remove();

    // Try to find article content in order of specificity
    let text = '';
    for (const selector of ['article', '[role="main"]', 'main', '.content', '.entry-content', '.post-content', '.article-body', '.field--name-body', 'body']) {
      const el = $(selector).first();
      if (el.length) {
        text = el.text();
        if (text.trim().length > 100) break;
      }
    }

    if (!text) return [];

    // Clean and split into meaningful lines
    const lines = text
      .split(/\n+/)
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(line => line.length > 30);

    return lines.slice(0, 7);
  } catch {
    return [];
  }
}

/**
 * Fetches content for multiple articles (top 5).
 * Resolves Google News URLs via DuckDuckGo, then fetches real content.
 * Returns a Map of original URL -> { lines: string[], realUrl: string|null }.
 */
export async function fetchTopArticlesContent(articles) {
  const results = new Map();

  const fetches = articles.map(async (item) => {
    const url = item.link || item.enlace || '';
    if (!url) return;

    let realUrl = url;
    let lines = [];

    // Resolve Google News URLs to real article URLs
    if (isGoogleNewsUrl(url)) {
      const title = item.title || item.titulo || '';
      const source = item.source || item.fuente || '';
      const resolved = await resolveGoogleNewsUrl(title, source);
      if (resolved) {
        realUrl = resolved;
        console.log(`    Resuelto: ${source} -> ${resolved.substring(0, 80)}...`);
      }
    }

    // Fetch actual article content
    lines = await fetchArticleContent(realUrl);

    results.set(url, lines);
  });

  await Promise.all(fetches);
  return results;
}
