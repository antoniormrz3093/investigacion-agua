import * as cheerio from 'cheerio';

/**
 * Checks if a URL is a Google News redirect (can't be fetched directly).
 */
function isGoogleNewsUrl(url) {
  return url.includes('news.google.com/rss/articles') || url.includes('news.google.com/articles');
}

/**
 * Splits a description string into lines suitable for display.
 */
function descriptionToLines(description) {
  if (!description) return [];
  // Split long description into ~80 char lines on word boundaries
  const words = description.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > 80 && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 7);
}

/**
 * Fetches article content from a URL and extracts the first 7 meaningful lines.
 */
export async function fetchArticleContent(url, timeoutMs = 5000) {
  if (!url || isGoogleNewsUrl(url)) return [];

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
    for (const selector of ['article', '[role="main"]', 'main', '.content', '.entry-content', '.post-content', '.article-body', 'body']) {
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
 * Falls back to description for Google News articles.
 * Returns a Map of URL -> string[] (lines).
 */
export async function fetchTopArticlesContent(articles) {
  const results = new Map();

  const fetches = articles.map(async (item) => {
    const url = item.link || item.enlace || '';
    if (!url) return;

    // Try fetching the real article content
    let lines = await fetchArticleContent(url);

    // Fallback: use description from RSS/scraping
    if (lines.length === 0) {
      const desc = item.description || item.descripcion || '';
      lines = descriptionToLines(desc);
    }

    results.set(url, lines);
  });

  await Promise.all(fetches);
  return results;
}
