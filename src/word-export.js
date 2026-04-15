import { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle, AlignmentType } from 'docx';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

function safeFileName(s) {
  return String(s || 'articulo')
    .replace(/\s+[-–|]\s+[^-–|]+$/, '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .substring(0, 80)
    .trim();
}

function headerParagraphs(a) {
  const title = String(a.title || '').replace(/\s+[-–|]\s+[^-–|]+$/, '').trim();
  const cls = a.classification || {};
  const opp = a.opportunity || {};
  const dateStr = a.date instanceof Date ? a.date.toISOString().split('T')[0] : '';

  return [
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 32, font: 'Calibri' })],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Nivel de oportunidad: ', bold: true, size: 22, font: 'Calibri' }),
        new TextRun({ text: (opp.nivel || '').toUpperCase(), bold: true, size: 22, font: 'Calibri', color: 'C53030' }),
        new TextRun({ text: `  |  Score: ${opp.score || 0}`, size: 22, font: 'Calibri' }),
        ...(opp.monto ? [new TextRun({ text: `  |  Monto: ${opp.monto}`, size: 22, font: 'Calibri' })] : []),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Tipo: ', bold: true, size: 22, font: 'Calibri' }),
        new TextRun({ text: cls.tipoLabel || '—', size: 22, font: 'Calibri' }),
        ...(cls.subtipo ? [new TextRun({ text: `  |  Subtipo: ${cls.subtipo}`, size: 22, font: 'Calibri' })] : []),
        ...(cls.sector ? [new TextRun({ text: `  |  Sector: ${cls.sector}`, size: 22, font: 'Calibri' })] : []),
        ...(cls.region ? [new TextRun({ text: `  |  Región: ${cls.region}`, size: 22, font: 'Calibri' })] : []),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Fuente: ', bold: true, size: 22, font: 'Calibri' }),
        new TextRun({ text: a.source || '—', size: 22, font: 'Calibri' }),
        new TextRun({ text: '  |  Fecha: ', bold: true, size: 22, font: 'Calibri' }),
        new TextRun({ text: dateStr, size: 22, font: 'Calibri' }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'URL: ', bold: true, size: 20, font: 'Calibri', color: '0077B6' }),
        new TextRun({ text: a.link || '', size: 20, font: 'Calibri', color: '0077B6' }),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '0077B6' } },
      spacing: { after: 300 },
    }),
  ];
}

function sectionHeading(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 26, font: 'Calibri', color: '0A2540' })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 160 },
  });
}

function bodyText(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: 'Calibri' })],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120 },
  });
}

function bullet(text) {
  return new Paragraph({
    children: [new TextRun({ text: '• ' + text, size: 22, font: 'Calibri' })],
    spacing: { after: 80 },
    indent: { left: 400 },
  });
}

function buildDoc(a) {
  const insight = a.insight || {};
  const opp = a.opportunity || {};
  const children = headerParagraphs(a);

  children.push(sectionHeading('Resumen ejecutivo'));
  children.push(bodyText(insight.resumen || a.description || 'Sin resumen disponible.'));

  if (insight.puntosClave?.length) {
    children.push(sectionHeading('Puntos clave'));
    for (const p of insight.puntosClave) children.push(bullet(p));
  }

  children.push(sectionHeading('Implicaciones para RTWG'));
  children.push(bodyText(insight.implicaciones || '—'));

  children.push(sectionHeading('Oportunidad de negocio'));
  children.push(bodyText(insight.oportunidad || '—'));

  children.push(sectionHeading('Recomendación'));
  children.push(bodyText(insight.recomendacion || '—'));

  if (opp.razones?.length) {
    children.push(sectionHeading('Señales detectadas'));
    for (const r of opp.razones) children.push(bullet(r));
  }

  if (a.paragraphs?.length) {
    children.push(sectionHeading('Contenido completo del artículo'));
    for (const p of a.paragraphs) {
      if (p.tag === 'h2' || p.tag === 'h3') {
        children.push(new Paragraph({
          children: [new TextRun({ text: p.text, bold: true, size: 24, font: 'Calibri' })],
          spacing: { before: 200, after: 100 },
        }));
      } else if (p.tag === 'li') {
        children.push(bullet(p.text));
      } else {
        children.push(bodyText(p.text));
      }
    }
  }

  return new Document({ sections: [{ children }] });
}

/**
 * Exports Word documents only for articles with opportunity=ALTO and valid content.
 *
 * @param {Array} articles - processed articles from pipeline
 * @param {string} weekId  - e.g. "2026-S15"
 * @param {string} baseDir - target base dir (uses Semana-<weekId>/)
 * @returns {Array<{rank, titulo, filePath, fileName, id}>}
 */
export async function exportOpportunitiesToWord(articles, weekId, baseDir) {
  const eligible = articles.filter((a) => a.opportunity?.nivel === 'alto' && a.contentValid);

  if (eligible.length === 0) {
    console.log('  [Word] No hay oportunidades ALTAS con contenido válido. No se generan Word.');
    return [];
  }

  const weekFolder = join(baseDir, `Semana-${weekId}`);
  await mkdir(weekFolder, { recursive: true });

  const results = [];
  let rank = 1;
  for (const a of eligible) {
    const fileName = `${String(rank).padStart(2, '0')}. ${safeFileName(a.title)}.docx`;
    const filePath = join(weekFolder, fileName);

    const doc = buildDoc(a);
    const buffer = await Packer.toBuffer(doc);
    await writeFile(filePath, buffer);

    console.log(`  [Word ${rank}] ${fileName} (${a.contentLength} chars)`);
    results.push({ rank, id: a.id, titulo: a.title, filePath, fileName });
    rank++;
  }

  console.log(`  [Word] ${results.length} documentos en: ${weekFolder}`);
  return results;
}
