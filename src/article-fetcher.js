import * as cheerio from 'cheerio';
import { stripAccents } from './text-utils.js';

const MIN_USEFUL_CHARS = 800;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function isGoogleNewsUrl(url) {
  return /news\.google\.com\/(rss\/)?articles/.test(url || '');
}

async function resolveGoogleNewsUrl(title, source) {
  if (!title) return null;
  const cleanTitle = String(title).replace(/\s+[-–|]\s+[^-–|]+$/, '').trim();
  const query = encodeURIComponent(cleanTitle + ' ' + (source || ''));
  const searchUrl = 'https://html.duckduckgo.com/html/?q=' + query;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(searchUrl, { signal: controller.signal, headers: { 'User-Agent': UA } });
    clearTimeout(timer);
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);
    const firstHref = $('.result__a').first().attr('href') || '';
    const urlMatch = firstHref.match(/uddg=([^&]+)/);
    const resolvedUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : firstHref;
    if (!resolvedUrl || isGoogleNewsUrl(resolvedUrl) || resolvedUrl.includes('google.com')) return null;
    return resolvedUrl;
  } catch {
    return null;
  }
}

function isNoiseLine(text) {
  const t = stripAccents(text).toLowerCase();
  if (t.length < 25) return true;
  const noise = [
    'cookie', 'suscri', 'newsletter', 'copyright', 'politica de privacidad',
    'iniciar sesion', 'registrate', 'todos los derechos',
    'siguenos', 'compartir', 'ver tambien', 'lee tambien', 'te puede interesar',
    'aviso legal', 'mapa del sitio', 'redes sociales', 'whatsapp', 'facebook',
    'twitter', 'instagram', 'publicidad', 'comentario',
  ];
  return noise.some((n) => t.includes(n));
}

function extractParagraphs($) {
  $('script, style, nav, footer, header, aside, iframe, noscript, form, .ad, .ads, .advert, .sidebar, .menu, .navigation, .social-share, .related-articles, .newsletter, .comments, .comment').remove();

  const selectors = [
    'article',
    '[role="main"] article',
    '[role="main"]',
    'main article',
    'main',
    '.entry-content',
    '.post-content',
    '.article-body',
    '.article__body',
    '.content__article-body',
    '.field--name-body',
    '.news-body',
    '#article-body',
  ];

  let container = null;
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 400) { container = el; break; }
  }
  if (!container) container = $('body');

  const paragraphs = [];
  container.find('p, h2, h3, h4, li, blockquote').each((_, el) => {
    const tag = $(el).prop('tagName')?.toLowerCase() || 'p';
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text || text.length < 20) return;
    if (isNoiseLine(text)) return;
    paragraphs.push({ tag, text });
  });

  return paragraphs;
}

/**
 * Fetches article content and returns a structured result with quality flags.
 * @returns {{ realUrl: string|null, paragraphs: Array, content: string,
 *            contentLength: number, contentValid: boolean, excludedReason: string|null }}
 */
export async function extractArticle(item, { timeoutMs = 12000 } = {}) {
  const originalUrl = item.link || item.enlace || '';
  if (!originalUrl) {
    return blankResult('sin_url');
  }

  let realUrl = originalUrl;
  if (isGoogleNewsUrl(originalUrl)) {
    const resolved = await resolveGoogleNewsUrl(item.title || item.titulo || '', item.source || item.fuente || '');
    if (resolved) {
      realUrl = resolved;
    } else {
      return blankResult('no_resuelto_google_news');
    }
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(realUrl, { signal: controller.signal, headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
    clearTimeout(timer);
    if (!res.ok) return blankResult(`http_${res.status}`, realUrl);

    const html = await res.text();
    const $ = cheerio.load(html);
    const paragraphs = extractParagraphs($);
    const content = paragraphs.map((p) => p.text).join('\n\n');
    const contentLength = content.length;
    const contentValid = contentLength >= MIN_USEFUL_CHARS;

    return {
      realUrl,
      paragraphs,
      content,
      contentLength,
      contentValid,
      excludedReason: contentValid ? null : `contenido_insuficiente_${contentLength}`,
    };
  } catch (err) {
    return blankResult(`error_${(err.name || 'network').toLowerCase()}`, realUrl);
  }
}

function blankResult(reason, realUrl = null) {
  return {
    realUrl,
    paragraphs: [],
    content: '',
    contentLength: 0,
    contentValid: false,
    excludedReason: reason,
  };
}

/**
 * Batch-extract articles. Concurrency-limited to avoid hammering sources.
 */
export async function extractArticles(items, { concurrency = 4 } = {}) {
  const results = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      const item = items[i];
      try {
        results.set(item, await extractArticle(item));
      } catch (err) {
        results.set(item, blankResult(`worker_${err.name || 'error'}`));
      }
    }
  }

  const pool = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(pool);
  return results;
}

// --- Backwards-compat exports (used by callers that still rely on old shape) ---

export async function fetchArticleContent(url) {
  const result = await extractArticle({ link: url });
  return result.paragraphs.map((p) => p.text).slice(0, 7);
}

export async function fetchTopArticlesContent(articles) {
  const map = await extractArticles(articles);
  const out = new Map();
  for (const a of articles) {
    const r = map.get(a);
    out.set(a.link || a.enlace || '', r ? r.paragraphs.map((p) => p.text).slice(0, 7) : []);
  }
  return out;
}

export async function resolveArticleUrls(articles) {
  const map = await extractArticles(articles);
  const out = new Map();
  for (const a of articles) {
    const r = map.get(a);
    if (r?.realUrl) out.set(a.link || a.enlace || '', r.realUrl);
  }
  return out;
}
