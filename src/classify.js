import { normalizeText, stripAccents } from './text-utils.js';

const TIPO_RULES = [
  {
    tipo: 'regulacion',
    label: 'Regulación',
    icon: '⚖️',
    patterns: [
      /\breforma\b/, /\bley\s+de\s+aguas\b/, /\bley\s+general\s+de\s+aguas\b/,
      /\bdecreto\b/, /\bnom-\d/, /\bnorma\s+oficial\b/,
      /\bconcesi[oó]n\b/, /\bveda\b/, /\bdisposici[oó]n\s+oficial\b/,
      /\bdof\b/, /\bdiario\s+oficial\b/, /\bconagua\b.*\b(emite|publica|oficializa)\b/,
    ],
  },
  {
    tipo: 'inversion',
    label: 'Inversión',
    icon: '💰',
    patterns: [
      /\$\s?\d/, /\bmillones\s+de\s+pesos\b/, /\bmdp\b/, /\bmdd\b/,
      /\binversi[oó]n\b/, /\bpresupuesto\b/, /\bfinanciamiento\b/,
      /\blicitaci[oó]n\b/, /\bcontrato\s+(adjudicado|otorgado|asignado)?\b/,
      /\badjudicaci[oó]n\b/, /\bapp\b/, /\basociaci[oó]n\s+p[uú]blico\s+privada\b/,
    ],
  },
  {
    tipo: 'infraestructura',
    label: 'Infraestructura',
    icon: '🏗️',
    patterns: [
      /\bplanta\s+(de\s+)?tratamiento\b/, /\bptar\b/, /\bptap\b/,
      /\bpotabilizadora\b/, /\bacueducto\b/, /\bpresa\b/, /\bpozo\b/,
      /\bred\s+(de\s+)?(agua|hidr[aá]ulica|drenaje|alcantarillado)\b/,
      /\bcolector\b/, /\bemisor\b/, /\bdesalinizad/, /\binfraestructura\s+hidr/,
      /\bobra\s+(p[uú]blica|hidr[aá]ulica)\b/, /\brehabilitaci[oó]n\b/,
      /\bampliaci[oó]n\s+de\s+(red|planta)/,
    ],
  },
  {
    tipo: 'sequia',
    label: 'Sequía / Escasez',
    icon: '🔥',
    patterns: [
      /\bsequ[ií]a\b/, /\bescasez\b/, /\bdesabasto\b/, /\bestr[eé]s\s+h[ií]drico\b/,
      /\bracionamiento\b/, /\btandeo\b/, /\bcrisis\s+h[ií]drica\b/,
      /\bemergencia\s+(por\s+)?agua\b/, /\bd[eé]ficit\s+h[ií]drico\b/,
    ],
  },
  {
    tipo: 'industria',
    label: 'Industria',
    icon: '🏭',
    patterns: [
      /\bparque\s+industrial\b/, /\bindustria\b/, /\bmaquiladora\b/,
      /\bcervecer/, /\bautomotriz\b/, /\bmineri[aá]\b/, /\bminer\b/,
      /\bacerer/, /\bpetroqu[ií]mica\b/, /\bgeneradora\b/, /\bplanta\s+armadora\b/,
      /\baguas\s+residuales\s+industriales\b/,
    ],
  },
  {
    tipo: 'ambiente',
    label: 'Medio Ambiente',
    icon: '🌿',
    patterns: [
      /\bcontaminaci[oó]n\b/, /\bderrame\b/, /\bre[uú]so\b/, /\breciclaje\s+de\s+agua\b/,
      /\becosistema\b/, /\bhumedal\b/, /\bcuenca\b/, /\bsustentab/, /\bbiodiversidad\b/,
    ],
  },
];

const SUBTIPO_RULES = [
  { subtipo: 'PTAR', patterns: [/\bptar\b/, /\bplanta\s+de\s+tratamiento\b/, /\btratamiento\s+de\s+aguas?\s+residuales\b/, /\bsaneamiento\b/] },
  { subtipo: 'PTAP', patterns: [/\bptap\b/, /\bpotabilizadora\b/, /\bplanta\s+potabilizadora\b/] },
  { subtipo: 'Red hidráulica', patterns: [/\bred\s+(de\s+)?(agua\s+potable|hidr[aá]ulica)\b/, /\bacueducto\b/, /\bemisor\b/, /\bcolector\b/, /\blinea\s+de\s+conducci[oó]n\b/] },
  { subtipo: 'Drenaje / Alcantarillado', patterns: [/\bdrenaje\b/, /\balcantarillado\b/, /\bdesaz/] },
  { subtipo: 'Reúso', patterns: [/\bre[uú]so\b/, /\bagua\s+tratada\s+(para|en)\b/, /\breciclaje\s+de\s+agua\b/] },
  { subtipo: 'Descargas / Cumplimiento', patterns: [/\bdescargas?\s+(de\s+aguas?\s+)?residuales?\b/, /\bnom-001\b/, /\bnom-002\b/, /\bnom-003\b/, /\bcondiciones\s+particulares\s+de\s+descarga\b/] },
  { subtipo: 'Concesiones / Títulos', patterns: [/\bconcesi[oó]n\b/, /\bt[ií]tulo\s+de\s+agua\b/, /\brepda\b/, /\baprovechamiento\s+de\s+agua\b/] },
  { subtipo: 'Desalinización', patterns: [/\bdesalinizad/, /\bdesaladora\b/] },
  { subtipo: 'Presas / Almacenamiento', patterns: [/\bpresa\b/, /\bacu[ií]fero\b/, /\balmacenamiento\b/] },
];

const SECTOR_RULES = [
  { sector: 'industrial', patterns: [/\bindustri/, /\bparque\s+industrial\b/, /\bmaquiladora\b/, /\bmineri/, /\bcervecer/, /\bautomotriz\b/, /\bplanta\s+armadora\b/, /\baguas\s+residuales\s+industriales\b/, /\busuario\s+industrial\b/] },
  { sector: 'agricola', patterns: [/\bagr[ií]cola\b/, /\briego\b/, /\bdistrito\s+de\s+riego\b/, /\bcampesinos?\b/, /\bproductores?\s+agr/, /\bag[uü]a\s+para\s+riego\b/] },
  { sector: 'municipal', patterns: [/\bmunicip/, /\borganismo\s+operador\b/, /\bagua\s+potable\s+(de\s+la\s+)?ciudad\b/, /\bsiapa\b/, /\bsacmex\b/, /\bcaev\b/, /\bcomapa\b/, /\bcmas\b/, /\bagua\s+y\s+saneamiento\b/] },
];

const ESTADOS_MEX = [
  'aguascalientes', 'baja california', 'baja california sur', 'campeche',
  'chiapas', 'chihuahua', 'ciudad de mexico', 'cdmx', 'coahuila',
  'colima', 'durango', 'estado de mexico', 'edomex', 'guanajuato',
  'guerrero', 'hidalgo', 'jalisco', 'michoacan', 'morelos', 'nayarit',
  'nuevo leon', 'oaxaca', 'puebla', 'queretaro', 'quintana roo',
  'san luis potosi', 'sinaloa', 'sonora', 'tabasco', 'tamaulipas',
  'tlaxcala', 'veracruz', 'yucatan', 'zacatecas',
];

const CIUDADES_INDUSTRIALES = [
  'monterrey', 'saltillo', 'ramos arizpe', 'torreon', 'gomez palacio',
  'guadalajara', 'zapopan', 'el salto', 'tijuana', 'mexicali', 'ensenada',
  'ciudad juarez', 'chihuahua', 'delicias', 'hermosillo', 'cajeme',
  'obregon', 'queretaro', 'san juan del rio', 'el marques', 'aguascalientes',
  'leon', 'celaya', 'irapuato', 'silao', 'salamanca', 'apodaca', 'escobedo',
  'puebla', 'tlaxcala', 'toluca', 'lerma', 'atlacomulco', 'cuautitlan',
  'merida', 'cancun', 'playa del carmen', 'veracruz', 'coatzacoalcos',
  'tampico', 'altamira', 'reynosa', 'nuevo laredo', 'matamoros',
  'cuautla', 'cuernavaca', 'pachuca', 'tula', 'tepeji',
];

const ACTORES = [
  { key: 'CONAGUA', patterns: [/\bconagua\b/, /\bcomisi[oó]n\s+nacional\s+del\s+agua\b/] },
  { key: 'SEMARNAT', patterns: [/\bsemarnat\b/] },
  { key: 'DOF', patterns: [/\bdof\b/, /\bdiario\s+oficial\s+de\s+la\s+federaci[oó]n\b/] },
  { key: 'Presidencia', patterns: [/\bpresidencia\b/, /\bclaudia\s+sheinbaum\b/, /\bpresident[ae]\b.*\b(sheinbaum|l[oó]pez\s+obrador)/] },
  { key: 'Congreso / Senado', patterns: [/\bsenado\b/, /\bc[aá]mara\s+de\s+diputados\b/, /\bcongreso\b/] },
  { key: 'SIAPA', patterns: [/\bsiapa\b/] },
  { key: 'SACMEX', patterns: [/\bsacmex\b/] },
  { key: 'Agua y Drenaje Monterrey', patterns: [/\bagua\s+y\s+drenaje\s+de\s+monterrey\b/, /\bayd\s+monterrey\b/] },
  { key: 'BANOBRAS', patterns: [/\bbanobras\b/] },
  { key: 'FONADIN', patterns: [/\bfonadin\b/] },
];

function matchFirst(text, rules, fieldLabel = 'label', fallback = null) {
  for (const rule of rules) {
    for (const pat of rule.patterns) {
      if (pat.test(text)) return rule;
    }
  }
  return fallback;
}

function detectRegion(text) {
  for (const ciudad of CIUDADES_INDUSTRIALES) {
    const re = new RegExp(`\\b${ciudad}\\b`, 'i');
    if (re.test(text)) {
      return capitalize(ciudad);
    }
  }
  for (const estado of ESTADOS_MEX) {
    const re = new RegExp(`\\b${estado}\\b`, 'i');
    if (re.test(text)) {
      return capitalize(estado);
    }
  }
  return null;
}

function capitalize(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function detectActor(text) {
  for (const actor of ACTORES) {
    for (const pat of actor.patterns) {
      if (pat.test(text)) return actor.key;
    }
  }
  return null;
}

/**
 * Classifies an article into RTWG-relevant taxonomy.
 *
 * @param {{title, description, content, source}} article
 * @returns {{ tipo, tipoLabel, tipoIcon, subtipo, sector, region, actor }}
 */
export function classify(article) {
  const text = stripAccents(`${article.title || ''} ${article.description || ''} ${article.content || ''}`).toLowerCase();

  const tipoMatch = matchFirst(text, TIPO_RULES) || {
    tipo: 'otro', label: 'Otro', icon: '📰',
  };

  const subtipoMatch = matchFirst(text, SUBTIPO_RULES);
  const sectorMatch = matchFirst(text, SECTOR_RULES);

  const region = detectRegion(text);
  const actor = detectActor(text);

  let sector = sectorMatch?.sector || null;
  if (!sector) {
    if (/\bobra\s+p[uú]blica\b|\bmunicip/.test(text)) sector = 'municipal';
    else if (/\bindustri/.test(text)) sector = 'industrial';
  }

  return {
    tipo: tipoMatch.tipo,
    tipoLabel: tipoMatch.label,
    tipoIcon: tipoMatch.icon,
    subtipo: subtipoMatch?.subtipo || null,
    sector: sector || 'mixto',
    region,
    actor,
  };
}
