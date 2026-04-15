import { stripAccents } from './text-utils.js';

const INVESTMENT_SIGNAL = [
  /\$\s?\d+[\d,.]*\s*(mdp|mdd|millones|mil\s+millones|billones)?/i,
  /\b\d{2,}[\d,.]*\s*(mdp|mdd|millones\s+de\s+pesos|millones\s+de\s+d[oó]lares)\b/i,
  /\binversi[oó]n\s+(de|por)\s+\$?\d/i,
  /\bpresupuesto\s+de\s+\$?\d/i,
];

const BUILD_SIGNAL = [
  /\blicitaci[oó]n\s+(p[uú]blica|nacional|internacional)?/i,
  /\bconvocatoria\s+(a\s+)?licitaci/i,
  /\badjudicaci[oó]n\b/i,
  /\bcontrato\s+(adjudicado|otorgado|asignado|firmado)/i,
  /\bobra\s+(p[uú]blica|hidr[aá]ulica)\b/i,
  /\bconstrucci[oó]n\s+de\s+(planta|ptar|ptap|acueducto|red|presa)/i,
  /\brehabilitaci[oó]n\s+de\s+(red|planta|presa|acueducto)/i,
  /\bampliaci[oó]n\s+de\s+(red|planta|cobertura)/i,
];

const REGULATION_SIGNAL = [
  /\breforma\s+(a\s+la\s+)?ley\s+(general\s+)?de\s+aguas\b/i,
  /\bley\s+general\s+de\s+aguas\b/i,
  /\bnueva\s+ley\s+de\s+aguas\b/i,
  /\bdecreto\s+(que|presidencial|por\s+el\s+que)/i,
  /\bnom-\d+-conagua/i, /\bnom-\d+-semarnat/i,
  /\bdisposici[oó]n\s+(oficial|normativa)/i,
  /\bveda\s+(de\s+agua|levantada|decretada)/i,
  /\bnuevas\s+obligaciones\b/i,
  /\bplazo\s+(para\s+cumplir|de\s+cumplimiento)/i,
];

const INDUSTRIAL_STRESS = [
  /\bindustri/i, /\bparque\s+industrial\b/i, /\bmaquiladora\b/i,
  /\bnearshoring\b/i, /\bcervecer/i, /\bautomotriz\b/i, /\bmineri/i,
];
const DROUGHT_SIGNAL = [
  /\bsequ[ií]a\b/i, /\bescasez\b/i, /\bdesabasto\b/i, /\bestr[eé]s\s+h[ií]drico\b/i,
  /\bracionamiento\b/i, /\btandeo\b/i, /\bcrisis\s+h[ií]drica\b/i,
];

function anyMatch(text, patterns) {
  return patterns.some((p) => p.test(text));
}

function extractMoney(text) {
  const m = text.match(/\$\s?([\d,.]+)\s*(mdp|mdd|millones\s+de\s+pesos|millones\s+de\s+d[oó]lares|millones|mil\s+millones|billones)?/i)
    || text.match(/\b([\d,.]+)\s*(mdp|mdd|millones\s+de\s+pesos|millones\s+de\s+d[oó]lares)\b/i);
  if (!m) return null;
  return m[0].trim();
}

/**
 * Evaluates opportunity level using deterministic heuristics.
 * Returns { nivel, score, signals, monto, razones }.
 *
 * Rules (simplified):
 *  ALTO  -> inversión anunciada con monto + infraestructura hídrica
 *        -> licitación / contrato adjudicado en infra hídrica
 *        -> reforma / decreto con obligaciones nuevas
 *        -> sequía en ciudad industrial
 *  MEDIO -> regulación sin monto / obra en etapa temprana / industria con presión
 *  BAJO  -> informativo, opinión, sin señales accionables
 */
export function evaluateOpportunity(article, classification) {
  const rawText = `${article.title || ''} ${article.description || ''} ${article.content || ''}`;
  const text = stripAccents(rawText).toLowerCase();
  const { tipo, subtipo, sector, region } = classification;

  const hasInvestment = anyMatch(rawText, INVESTMENT_SIGNAL);
  const hasBuild = anyMatch(rawText, BUILD_SIGNAL);
  const hasRegulation = anyMatch(rawText, REGULATION_SIGNAL);
  const hasIndustrialStress = anyMatch(rawText, INDUSTRIAL_STRESS);
  const hasDrought = anyMatch(rawText, DROUGHT_SIGNAL);

  const isWaterInfra = tipo === 'infraestructura'
    || ['PTAR', 'PTAP', 'Red hidráulica', 'Drenaje / Alcantarillado', 'Reúso', 'Desalinización', 'Presas / Almacenamiento'].includes(subtipo);

  const monto = extractMoney(rawText);

  let score = 0;
  const razones = [];

  if (hasInvestment && (isWaterInfra || /\bagua\b/.test(text))) {
    score += 40;
    razones.push(`Inversión anunciada${monto ? ` (${monto})` : ''} en infraestructura hídrica`);
  } else if (hasInvestment) {
    score += 20;
    razones.push(`Monto mencionado${monto ? ` (${monto})` : ''} en contexto hídrico`);
  }

  if (hasBuild && isWaterInfra) {
    score += 35;
    razones.push('Licitación / obra hidráulica en proceso');
  } else if (hasBuild) {
    score += 15;
    razones.push('Licitación / contrato detectado');
  }

  if (hasRegulation) {
    score += 25;
    razones.push('Cambio regulatorio que puede generar obligación de inversión');
  }

  if (hasDrought && (hasIndustrialStress || sector === 'industrial')) {
    score += 30;
    razones.push('Estrés hídrico en zona industrial');
  } else if (hasDrought) {
    score += 10;
    razones.push('Sequía o escasez reportada');
  }

  if (tipo === 'industria' && (isWaterInfra || hasRegulation)) {
    score += 10;
    razones.push('Presión sobre usuarios industriales');
  }

  if (subtipo === 'PTAR' || subtipo === 'PTAP' || subtipo === 'Red hidráulica' || subtipo === 'Reúso') {
    score += 10;
    razones.push(`Subtipo core RTWG: ${subtipo}`);
  }

  if (region) {
    score += 5;
    razones.push(`Región identificada: ${region}`);
  }

  if (tipo === 'otro' && !hasInvestment && !hasBuild && !hasRegulation && !hasDrought) {
    score -= 20;
  }

  let nivel;
  if (score >= 55) nivel = 'alto';
  else if (score >= 25) nivel = 'medio';
  else nivel = 'bajo';

  return {
    nivel,
    score,
    monto,
    signals: {
      investment: hasInvestment,
      build: hasBuild,
      regulation: hasRegulation,
      industrialStress: hasIndustrialStress,
      drought: hasDrought,
      waterInfra: isWaterInfra,
    },
    razones,
  };
}
