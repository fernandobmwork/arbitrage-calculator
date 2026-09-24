import * as Tesseract from 'tesseract.js';
import { parseTicketLocally, type LocalParsedTicket } from './localTicketOCR';

function yellowMask(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const maxSide = 3200;
      const scale = Math.min(2, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const r = pixels.data[i];
        const g = pixels.data[i + 1];
        const b = pixels.data[i + 2];
        const isYellow = r > 130 && g > 80 && g < 240 && b < 165 && r > g * 0.9;
        const value = isYellow ? 255 : 0;
        pixels.data[i] = value;
        pixels.data[i + 1] = value;
        pixels.data[i + 2] = value;
        pixels.data[i + 3] = 255;
      }
      ctx.putImageData(pixels, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

function extractOdds(text: string): number[] {
  const matches = text.match(/\b\d{1,2}[.,]\d{1,3}\b/g) ?? [];
  const values = matches
    .map((value) => Number(value.replace(',', '.')))
    .filter((value) => Number.isFinite(value) && value >= 1.01 && value <= 30);
  return [...new Set(values)];
}

export async function parseTicketLocallyEnhanced(dataUrl: string): Promise<LocalParsedTicket> {
  const parsed = await parseTicketLocally(dataUrl);

  if (parsed.source !== 'supermonitor' || parsed.rows.length < 3) return parsed;

  const worker = await Tesseract.createWorker('eng', 1);
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
      tessedit_char_whitelist: '0123456789.,',
      user_defined_dpi: '300',
    });

    const masked = await yellowMask(dataUrl);
    const result = await worker.recognize(masked, {}, { text: true });
    const odds = extractOdds(result.data.text ?? '');

    if (odds.length >= 3) {
      const nextRows = parsed.rows.map((row, index) => ({
        ...row,
        odd: row.odd ?? odds[index] ?? null,
      }));
      return {
        ...parsed,
        rows: nextRows,
        notes: [...parsed.notes, 'Odds conferidas por uma segunda leitura numérica do destaque amarelo.'],
      };
    }

    return parsed;
  } finally {
    await worker.terminate();
  }
}
