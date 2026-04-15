const STOPWORDS_ES = new Set([
  'a', 'al', 'algo', 'algun', 'alguna', 'algunas', 'alguno', 'algunos', 'ante',
  'aqui', 'asi', 'aun', 'bajo', 'bien', 'cada', 'como', 'con', 'contra', 'cual',
  'cuales', 'cuando', 'cuanto', 'de', 'del', 'desde', 'donde', 'dos', 'el', 'ella',
  'ellas', 'ello', 'ellos', 'en', 'entre', 'era', 'eran', 'eres', 'es', 'esa',
  'esas', 'ese', 'eso', 'esos', 'esta', 'estan', 'estar', 'estas', 'este', 'esto',
  'estos', 'fue', 'fueron', 'ha', 'habia', 'hace', 'han', 'hasta', 'hay', 'la',
  'las', 'le', 'les', 'lo', 'los', 'mas', 'me', 'mi', 'mis', 'mucho', 'muy',
  'nada', 'ni', 'no', 'nos', 'nosotros', 'o', 'otra', 'otras', 'otro', 'otros',
  'para', 'pero', 'poco', 'por', 'porque', 'pues', 'que', 'se', 'segun', 'ser',
  'si', 'sido', 'siempre', 'sin', 'sino', 'sobre', 'solo', 'son', 'su', 'sus',
  'tal', 'tambien', 'tan', 'tanto', 'te', 'tener', 'ti', 'tiene', 'todo', 'todos',
  'tras', 'tu', 'tus', 'un', 'una', 'unas', 'uno', 'unos', 'y', 'ya', 'yo',
  'the', 'of', 'in', 'on', 'for', 'to', 'and', 'or',
]);

export function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeText(s) {
  return stripAccents(String(s || ''))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function removeSourceSuffix(title) {
  return String(title || '').replace(/\s+[-–|]\s+[^-–|]+$/, '').trim();
}

export function normalizeTitle(title) {
  const cleaned = removeSourceSuffix(title);
  return normalizeText(cleaned);
}

export function tokens(s, { minLen = 3, keepStopwords = false } = {}) {
  const norm = typeof s === 'string' ? s : normalizeText(s);
  return norm.split(/\s+/).filter((w) => {
    if (w.length < minLen) return false;
    if (!keepStopwords && STOPWORDS_ES.has(w)) return false;
    return true;
  });
}

export function shingles(s, n = 3) {
  const toks = tokens(s);
  if (toks.length < n) return new Set(toks);
  const grams = new Set();
  for (let i = 0; i <= toks.length - n; i++) {
    grams.add(toks.slice(i, i + n).join(' '));
  }
  return grams;
}

export function jaccard(aSet, bSet) {
  if (!aSet.size && !bSet.size) return 1;
  if (!aSet.size || !bSet.size) return 0;
  let inter = 0;
  const [small, big] = aSet.size <= bSet.size ? [aSet, bSet] : [bSet, aSet];
  for (const x of small) if (big.has(x)) inter++;
  const union = aSet.size + bSet.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function titleSimilarity(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = new Set(tokens(na));
  const tb = new Set(tokens(nb));
  const tokenJ = jaccard(ta, tb);

  const sa = shingles(na, 3);
  const sb = shingles(nb, 3);
  const shingleJ = jaccard(sa, sb);

  return 0.55 * tokenJ + 0.45 * shingleJ;
}

export function normalizeUrl(url) {
  if (!url) return '';
  return String(url)
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/[#?].*$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

export function hashString(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function daysBetween(a, b) {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  if (isNaN(da) || isNaN(db)) return Infinity;
  return Math.abs(da - db) / 86400000;
}
