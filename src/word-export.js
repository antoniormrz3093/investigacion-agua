import { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle, AlignmentType } from 'docx';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import * as cheerio from 'cheerio';

/**
 * Fetches full article text from a URL (all paragraphs, not just 7 lines).
 */
async function fetchFullArticleText(url) {
  if (!url) return { paragraphs: [], rawText: '' };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    });

    clearTimeout(timer);
    if (!response.ok) return { paragraphs: [], rawText: '' };

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove non-content elements
    $('script, style, nav, footer, header, aside, iframe, noscript, .ad, .ads, .sidebar, .menu, .navigation, .social-share, .related-articles').remove();

    // Try to find article content
    let container = null;
    for (const selector of ['article', '[role="main"]', 'main', '.content', '.entry-content', '.post-content', '.article-body', '.field--name-body']) {
      const el = $(selector).first();
      if (el.length && el.text().trim().length > 200) {
        container = el;
        break;
      }
    }
    if (!container) container = $('body');

    // Extract paragraphs preserving structure
    const paragraphs = [];
    container.find('p, h1, h2, h3, h4, li').each((_, el) => {
      const tag = $(el).prop('tagName')?.toLowerCase() || 'p';
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length > 15) {
        paragraphs.push({ tag, text });
      }
    });

    // If no paragraphs found, fall back to raw text split
    if (paragraphs.length === 0) {
      const rawLines = container.text()
        .split(/\n+/)
        .map(l => l.replace(/\s+/g, ' ').trim())
        .filter(l => l.length > 20);
      for (const line of rawLines) {
        paragraphs.push({ tag: 'p', text: line });
      }
    }

    const rawText = paragraphs.map(p => p.text).join('\n\n');
    return { paragraphs, rawText };
  } catch {
    return { paragraphs: [], rawText: '' };
  }
}

/**
 * Creates a Word document with the full article content.
 */
function createArticleDoc(article, paragraphs, weekId) {
  const title = (article.titulo || '').replace(/ - [^-]+$/, '').trim();
  const source = article.fuente || '';
  const date = article.fecha || '';
  const url = article.enlace || '';
  const score = article.score || 0;
  const category = article.categoria || '';

  const children = [
    // Title
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 32, font: 'Calibri' })],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }),

    // Metadata
    new Paragraph({
      children: [
        new TextRun({ text: 'Fuente: ', bold: true, size: 22, font: 'Calibri' }),
        new TextRun({ text: source, size: 22, font: 'Calibri' }),
        new TextRun({ text: '  |  Fecha: ', bold: true, size: 22, font: 'Calibri' }),
        new TextRun({ text: date, size: 22, font: 'Calibri' }),
        new TextRun({ text: '  |  Categoria: ', bold: true, size: 22, font: 'Calibri' }),
        new TextRun({ text: category, size: 22, font: 'Calibri' }),
      ],
      spacing: { after: 100 },
    }),

    new Paragraph({
      children: [
        new TextRun({ text: 'Score de relevancia: ', bold: true, size: 22, font: 'Calibri' }),
        new TextRun({ text: String(score), size: 22, font: 'Calibri' }),
        new TextRun({ text: '  |  Semana: ', bold: true, size: 22, font: 'Calibri' }),
        new TextRun({ text: weekId, size: 22, font: 'Calibri' }),
      ],
      spacing: { after: 100 },
    }),

    new Paragraph({
      children: [
        new TextRun({ text: 'URL: ', bold: true, size: 20, font: 'Calibri', color: '0077B6' }),
        new TextRun({ text: url, size: 20, font: 'Calibri', color: '0077B6' }),
      ],
      spacing: { after: 200 },
    }),

    // Separator
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '0077B6' } },
      spacing: { after: 300 },
    }),

    // Article content heading
    new Paragraph({
      children: [new TextRun({ text: 'Contenido del Articulo', bold: true, size: 26, font: 'Calibri' })],
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 200 },
    }),
  ];

  // Add article paragraphs
  if (paragraphs.length > 0) {
    for (const p of paragraphs) {
      if (p.tag === 'h1' || p.tag === 'h2') {
        children.push(new Paragraph({
          children: [new TextRun({ text: p.text, bold: true, size: 24, font: 'Calibri' })],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        }));
      } else if (p.tag === 'h3' || p.tag === 'h4') {
        children.push(new Paragraph({
          children: [new TextRun({ text: p.text, bold: true, size: 22, font: 'Calibri' })],
          spacing: { before: 150, after: 80 },
        }));
      } else if (p.tag === 'li') {
        children.push(new Paragraph({
          children: [new TextRun({ text: '• ' + p.text, size: 22, font: 'Calibri' })],
          spacing: { after: 60 },
          indent: { left: 400 },
        }));
      } else {
        children.push(new Paragraph({
          children: [new TextRun({ text: p.text, size: 22, font: 'Calibri' })],
          spacing: { after: 120 },
          alignment: AlignmentType.JUSTIFIED,
        }));
      }
    }
  } else {
    children.push(new Paragraph({
      children: [new TextRun({
        text: 'No se pudo extraer el contenido de este articulo. El sitio web puede requerir JavaScript o bloquear el acceso automatizado.',
        italics: true, size: 22, font: 'Calibri', color: '999999',
      })],
    }));
  }

  return new Document({
    sections: [{ children }],
  });
}

/**
 * Generates Word documents for each top 5 article and saves them
 * in the information folder organized by week.
 */
export async function exportWeeklyArticlesToWord(top5Analysis, weekId, resolvedUrls, baseDir) {
  const weekFolder = join(baseDir, `Semana-${weekId}`);
  await mkdir(weekFolder, { recursive: true });

  const results = [];

  for (const article of top5Analysis) {
    const resolvedUrl = resolvedUrls.get(article.enlace) || article.enlace || '';
    const safeTitle = (article.titulo || 'articulo')
      .replace(/ - [^-]+$/, '')
      .replace(/[<>:"/\\|?*]/g, '')
      .substring(0, 80)
      .trim();
    const fileName = `${article.rank}. ${safeTitle}.docx`;
    const filePath = join(weekFolder, fileName);

    console.log(`    [${article.rank}/5] Descargando: ${article.fuente}...`);
    const { paragraphs, rawText } = await fetchFullArticleText(resolvedUrl);

    const doc = createArticleDoc(article, paragraphs, weekId);
    const buffer = await Packer.toBuffer(doc);
    await writeFile(filePath, buffer);

    results.push({
      rank: article.rank,
      filePath,
      fileName,
      paragraphCount: paragraphs.length,
      rawText,
    });

    console.log(`         Guardado: ${fileName} (${paragraphs.length} parrafos)`);
  }

  console.log(`  Documentos guardados en: ${weekFolder}`);
  return results;
}
