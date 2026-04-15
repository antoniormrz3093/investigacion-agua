import { normalizeUrl, titleSimilarity, daysBetween, hashString, normalizeTitle } from './text-utils.js';

const SIMILARITY_THRESHOLD = 0.85;
const MAX_DAYS_BETWEEN = 4;

const SOURCE_PRIORITY = [
  (s) => /dof|diario oficial/i.test(s),
  (s) => /conagua|gob\.mx/i.test(s),
  (s) => /reforma|excelsior|universal|jornada|milenio|financiero/i.test(s),
];

function sourceRank(item) {
  const s = `${item.source || ''} ${item.origin || ''}`;
  for (let i = 0; i < SOURCE_PRIORITY.length; i++) {
    if (SOURCE_PRIORITY[i](s)) return i;
  }
  return SOURCE_PRIORITY.length;
}

function pickCanonical(cluster) {
  return [...cluster].sort((a, b) => {
    const rs = sourceRank(a) - sourceRank(b);
    if (rs !== 0) return rs;
    const lenA = (a.description || '').length + (a.title || '').length;
    const lenB = (b.description || '').length + (b.title || '').length;
    return lenB - lenA;
  })[0];
}

/**
 * Deduplicates and clusters news items.
 * Returns the set of canonical items plus cluster metadata.
 *
 * Strategy:
 *  1. Exact URL match -> same cluster.
 *  2. Normalized title similarity >= 0.85 within a 4-day window -> same cluster.
 *  3. Canonical item per cluster = most authoritative source, longest content.
 */
export function deduplicateNews(items) {
  const normalized = items.map((it, idx) => ({
    ...it,
    _idx: idx,
    _urlKey: normalizeUrl(it.link || it.enlace || ''),
    _titleKey: normalizeTitle(it.title || it.titulo || ''),
    _date: it.date instanceof Date ? it.date : (it.fecha ? new Date(it.fecha) : new Date()),
  }));

  const parent = normalized.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const byUrl = new Map();
  for (const it of normalized) {
    if (!it._urlKey) continue;
    if (byUrl.has(it._urlKey)) union(byUrl.get(it._urlKey), it._idx);
    else byUrl.set(it._urlKey, it._idx);
  }

  for (let i = 0; i < normalized.length; i++) {
    const a = normalized[i];
    if (!a._titleKey) continue;
    for (let j = i + 1; j < normalized.length; j++) {
      const b = normalized[j];
      if (!b._titleKey) continue;
      if (find(i) === find(j)) continue;
      if (daysBetween(a._date, b._date) > MAX_DAYS_BETWEEN) continue;
      const sim = titleSimilarity(a._titleKey, b._titleKey);
      if (sim >= SIMILARITY_THRESHOLD) union(i, j);
    }
  }

  const buckets = new Map();
  for (let i = 0; i < normalized.length; i++) {
    const root = find(i);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(normalized[i]);
  }

  const clusters = [];
  const unique = [];
  let duplicatesRemoved = 0;

  for (const [root, members] of buckets) {
    const canonical = pickCanonical(members);
    const clusterId = hashString(`c-${root}-${canonical._titleKey || canonical._urlKey}`);
    const siblings = members.filter((m) => m !== canonical);

    for (const m of members) {
      m.cluster_id = clusterId;
      m.is_duplicate = m !== canonical;
      m.dup_of = m === canonical ? null : (canonical.link || canonical.enlace || null);
    }

    duplicatesRemoved += siblings.length;
    clusters.push({
      id: clusterId,
      canonical,
      members,
      count: members.length,
      sources: [...new Set(members.map((m) => m.source || m.origin).filter(Boolean))],
    });

    const cleaned = { ...canonical };
    delete cleaned._idx;
    delete cleaned._urlKey;
    delete cleaned._titleKey;
    delete cleaned._date;
    cleaned.cluster_id = clusterId;
    cleaned.cluster_size = members.length;
    cleaned.cluster_sources = [...new Set(members.map((m) => m.source || m.origin).filter(Boolean))];
    unique.push(cleaned);
  }

  return {
    unique,
    clusters,
    stats: {
      input: items.length,
      unique: unique.length,
      duplicatesRemoved,
      clustersWithDuplicates: clusters.filter((c) => c.count > 1).length,
    },
  };
}
