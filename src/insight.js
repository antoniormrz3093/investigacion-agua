import { stripAccents } from './text-utils.js';

const NOISE_PATTERNS = [
  /cookie/i, /suscri/i, /newsletter/i, /copyright/i, /pol[ií]tica\s+de\s+privacidad/i,
  /iniciar\s+sesi[oó]n/i, /reg[ií]strate/i, /compartir/i, /comentario/i,
  /ver\s+tambi[eé]n/i, /lee\s+tambi[eé]n/i, /te\s+puede\s+interesar/i, /publicidad/i,
  /todos\s+los\s+derechos/i, /aviso\s+legal/i, /mapa\s+del\s+sitio/i,
  /redes\s+sociales/i, /whatsapp/i, /facebook/i, /twitter/i, /instagram/i,
];

const RELEVANCE_KEYWORDS = [
  'agua', 'hidrico', 'hidrica', 'hidraulica', 'hidraulico',
  'ptar', 'ptap', 'planta', 'tratamiento', 'saneamiento', 'potable',
  'red', 'acueducto', 'presa', 'pozo', 'desalinizadora',
  'reuso', 'residuales', 'descarga', 'alcantarillado', 'drenaje',
  'conagua', 'ley', 'reforma', 'decreto', 'concesion', 'licitacion',
  'contrato', 'inversion', 'presupuesto', 'millones', 'obra',
  'sequia', 'escasez', 'desabasto', 'industria', 'industrial',
  'municipal', 'organismo', 'operador',
];

const ACTIONABLE_KEYWORDS = [
  'plazo', 'obligacion', 'requisito', 'sancion', 'multa',
  'vigencia', 'publicacion', 'adjudicacion', 'fecha', 'anuncio',
  'inauguracion', 'arranque', 'inicio', 'inversion',
];

function sentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && s.length <= 400);
}

function scoreSentence(sentence) {
  const norm = stripAccents(sentence).toLowerCase();
  if (NOISE_PATTERNS.some((p) => p.test(norm))) return -Infinity;
  let s = 0;
  for (const kw of RELEVANCE_KEYWORDS) if (norm.includes(kw)) s += 2;
  for (const kw of ACTIONABLE_KEYWORDS) if (norm.includes(kw)) s += 3;
  if (/\$\s?\d|\bmdp\b|\bmillones\b/i.test(sentence)) s += 3;
  if (/\d{4}/.test(sentence)) s += 1;
  if (/\b(plazo|vigencia|fecha)\b/i.test(sentence)) s += 2;
  if (sentence.length < 60) s -= 1;
  return s;
}

function pickTopSentences(text, n) {
  const all = sentences(text);
  const scored = all
    .map((s) => ({ s, v: scoreSentence(s) }))
    .filter((x) => x.v > 0);
  scored.sort((a, b) => b.v - a.v);
  const chosen = scored.slice(0, n).map((x) => x.s);
  if (chosen.length < n) {
    for (const sentence of all) {
      if (chosen.length >= n) break;
      if (!chosen.includes(sentence)) chosen.push(sentence);
    }
  }
  return chosen;
}

function buildResumen(article, content) {
  const topSentences = pickTopSentences(content, 6);
  if (topSentences.length === 0) {
    return article.description ? article.description.slice(0, 400) : null;
  }
  return topSentences.join(' ');
}

function buildPuntosClave(content) {
  return pickTopSentences(content, 4).map((s) => s.length > 220 ? s.slice(0, 217) + '...' : s);
}

function buildImplicaciones(classification, opportunity) {
  const parts = [];
  const { tipo, subtipo, sector, region } = classification;
  const { signals, monto, nivel } = opportunity;

  if (signals.regulation) {
    parts.push('Genera obligación de cumplimiento para usuarios (industriales / municipales) y abre ventana para inversión forzada en infraestructura.');
  }
  if (signals.investment) {
    parts.push(`Hay flujo de capital comprometido${monto ? ` (${monto})` : ''}; potencial licitación o contrato derivado.`);
  }
  if (signals.build && signals.waterInfra) {
    parts.push('Obra hídrica en proceso: oportunidad directa de ingeniería, construcción o subcontratación.');
  }
  if (signals.drought && (sector === 'industrial' || signals.industrialStress)) {
    parts.push('Estrés hídrico en zona industrial: demanda de PTAR, reúso, pozos propios y eficiencia.');
  }
  if (!parts.length) {
    if (nivel === 'bajo') parts.push('Información de contexto sectorial; no se detecta oportunidad accionable inmediata.');
    else parts.push('Señal de mercado relevante que conviene monitorear.');
  }

  if (region) parts.push(`Impacto geográfico: ${region}${sector && sector !== 'mixto' ? ` (sector ${sector})` : ''}.`);
  if (subtipo) parts.push(`Relevante para línea de negocio: ${subtipo}.`);
  else if (tipo !== 'otro') parts.push(`Relevante para categoría: ${tipo}.`);

  return parts.join(' ');
}

function buildOportunidad(classification, opportunity) {
  const { nivel, signals, monto } = opportunity;
  const { subtipo, sector, region, actor } = classification;

  if (nivel === 'bajo') {
    return 'No hay oportunidad directa. Mantener en radar informativo.';
  }

  const lineas = [];
  if (signals.investment || signals.build) {
    const obra = subtipo || 'infraestructura hídrica';
    const where = region ? ` en ${region}` : '';
    lineas.push(`Perseguir participación en ${obra}${where}${monto ? ` (monto referido: ${monto})` : ''}.`);
  }
  if (signals.regulation) {
    lineas.push('Ofrecer servicios de cumplimiento regulatorio (diagnóstico, adecuación de PTAR, reúso, descargas NOM).');
  }
  if (signals.drought && (sector === 'industrial' || signals.industrialStress)) {
    lineas.push('Promover soluciones de eficiencia y reúso a usuarios industriales afectados por escasez.');
  }
  if (actor) lineas.push(`Actor clave a contactar o monitorear: ${actor}.`);

  if (!lineas.length) lineas.push('Señal de mercado con potencial; confirmar con investigación dirigida.');
  return lineas.join(' ');
}

function buildRecomendacion(classification, opportunity) {
  const { nivel } = opportunity;
  const { tipo, subtipo, region } = classification;

  if (nivel === 'alto') {
    return `Asignar responsable esta semana. Validar alcance, presupuesto y calendario. Preparar acercamiento comercial/técnico${region ? ` en ${region}` : ''}${subtipo ? ` (${subtipo})` : ''}.`;
  }
  if (nivel === 'medio') {
    return `Monitorear evolución en las próximas 2-4 semanas. Si se confirma inversión/licitación, escalar a oportunidad ALTA.`;
  }
  return `Registrar en radar sectorial (${tipo}). Sin acción inmediata requerida.`;
}

/**
 * Generates the full insight payload for a news item.
 * Returns null fields if there is no usable content.
 */
export function generateInsight(article, classification, opportunity) {
  const content = article.content || article.description || '';
  const hasContent = !!article.content && article.contentValid;

  const resumen = hasContent ? buildResumen(article, content) : null;
  const puntosClave = hasContent ? buildPuntosClave(content) : [];
  const implicaciones = buildImplicaciones(classification, opportunity);
  const oportunidad = buildOportunidad(classification, opportunity);
  const recomendacion = buildRecomendacion(classification, opportunity);

  const insightLine = buildInsightLine(classification, opportunity);

  return {
    resumen,
    puntosClave,
    implicaciones,
    oportunidad,
    recomendacion,
    insightLine,
  };
}

/**
 * One-line insight (for Telegram and dashboard cards).
 */
function buildInsightLine(classification, opportunity) {
  const { tipoLabel, subtipo, region } = classification;
  const { nivel, monto, signals } = opportunity;

  const pieces = [];
  if (signals.investment && monto) pieces.push(`Inversión ${monto}`);
  else if (signals.investment) pieces.push('Inversión anunciada');
  if (signals.build) pieces.push('licitación / obra');
  if (signals.regulation) pieces.push('nueva regulación');
  if (signals.drought) pieces.push('estrés hídrico');

  const head = pieces.length ? pieces.join(' + ') : tipoLabel;
  const tail = [subtipo, region].filter(Boolean).join(' · ');
  const nivelTag = nivel.toUpperCase();

  return tail ? `${head} — ${tail} [${nivelTag}]` : `${head} [${nivelTag}]`;
}
