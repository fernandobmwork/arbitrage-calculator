import * as Tesseract from 'tesseract.js';

type OCRWord = {
  text: string;
  confidence: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

type TicketRow = {
  outcome: string;
  bookmaker: string;
  odd: number | null;
  stake: number | null;
  profit: number | null;
  freebet: boolean;
  mode: 'back' | 'lay' | 'unknown';
};

export type LocalParsedTicket = {
  source: 'unknown' | 'supermonitor' | 'suregoat' | 'other';
  event: string;
  league: string;
  date: string;
  totalStake: number | null;
  totalProfit: number | null;
  profitPercent: number | null;
  rows: TicketRow[];
  confidence: number | null;
  notes: string[];
};

const BOOKMAKERS = [
  'bet365', 'betano', 'sportingbet', 'novibet', 'betfairso', 'betfair',
  'brasilbetso', 'brasilbet', 'betvip', 'betbra', 'bet7k', 'pixbet',
  'estrelabet', 'betmgm', 'betway', 'rivalo', 'kto', 'superbet',
  'stake', '1xbet', '22bet', 'betsson', 'parimatch', 'galera.bet',
];

function cleanText(value: string) {
  return value.replace(/[|]/g, 'I').replace(/\s+/g, ' ').trim();
}

function norm(value: string) {
  return cleanText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function numberFromText(value: string): number | null {
  const raw = value.replace(/R\$|%/gi, '').replace(/\s/g, '').trim();
  if (!raw) return null;
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  let normalized = raw;
  if (hasComma && hasDot) {
    normalized = raw.lastIndexOf(',') > raw.lastIndexOf('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  } else if (hasComma) {
    normalized = raw.replace(',', '.');
  }
  normalized = normalized.replace(/[^0-9.-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function extractWordsFromTsv(tsv: string): OCRWord[] {
  const lines = tsv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split('\t');
  const index = (name: string) => header.indexOf(name);
  const iLeft = index('left');
  const iTop = index('top');
  const iWidth = index('width');
  const iHeight = index('height');
  const iConf = index('conf');
  const iText = index('text');
  if ([iLeft, iTop, iWidth, iHeight, iConf, iText].some((i) => i < 0)) return [];

  return lines.slice(1).map((line) => {
    const p = line.split('\t');
    return {
      text: cleanText(p[iText] ?? ''),
      confidence: Number(p[iConf] ?? 0),
      left: Number(p[iLeft] ?? 0),
      top: Number(p[iTop] ?? 0),
      width: Number(p[iWidth] ?? 0),
      height: Number(p[iHeight] ?? 0),
    };
  }).filter((w) => w.text && Number.isFinite(w.left) && Number.isFinite(w.top));
}

function groupLines(words: OCRWord[]) {
  const sorted = [...words].sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: { top: number; words: OCRWord[] }[] = [];
  for (const word of sorted) {
    const center = word.top + word.height / 2;
    const line = lines.find((candidate) => Math.abs(center - candidate.top) <= Math.max(10, word.height * 0.65));
    if (line) {
      line.words.push(word);
      line.top = line.words.reduce((sum, item) => sum + item.top + item.height / 2, 0) / line.words.length;
    } else {
      lines.push({ top: center, words: [word] });
    }
  }
  return lines.sort((a, b) => a.top - b.top).map((line) => ({
    top: line.top,
    text: line.words.sort((a, b) => a.left - b.left).map((w) => w.text).join(' '),
    words: line.words.sort((a, b) => a.left - b.left),
  }));
}

function findBookmaker(lineText: string): string | null {
  const n = norm(lineText).replace(/[^a-z0-9. ]/g, '');
  return BOOKMAKERS.find((bookmaker) => n.includes(norm(bookmaker).replace(/[^a-z0-9. ]/g, ''))) ?? null;
}

function parseOddCandidates(text: string): number[] {
  const matches = text.match(/\b\d{1,2}[.,]\d{1,3}\b/g) ?? [];
  return matches.map(numberFromText).filter((n): n is number => n != null && n >= 1.01 && n <= 1000);
}

function parseMoneyCandidates(text: string): number[] {
  const matches = text.match(/R\$\s*[0-9][0-9.,]*/gi) ?? [];
  return matches.map(numberFromText).filter((n): n is number => n != null && n >= 0);
}

function extractDate(text: string) {
  const m = text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b(?:[^\n]{0,30})?/);
  return m ? cleanText(m[0]) : '';
}

function detectFreebetByColor(dataUrl: string): Promise<{ minY: number; maxY: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return resolve(null);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let minY = height;
      let maxY = -1;
      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 3) {
          const i = (y * width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (r > 170 && g > 65 && g < 190 && b < 110 && r > g * 1.35) {
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
      resolve(maxY >= minY ? { minY, maxY } : null);
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

function chooseEvent(lines: ReturnType<typeof groupLines>) {
  const candidates = lines.filter((line) => /\s+x\s+/i.test(line.text));
  if (!candidates.length) return '';
  return candidates.sort((a, b) => b.text.length - a.text.length)[0].text.replace(/[↗→➜]+/g, '').trim();
}

function chooseLeague(lines: ReturnType<typeof groupLines>, event: string) {
  const idx = lines.findIndex((line) => norm(line.text) === norm(event));
  const nearby = idx >= 0 ? lines.slice(idx + 1, idx + 3) : lines;
  const candidate = nearby.find((line) => /\b(brasil|serie|premier|league|liga|champions|copa)\b/i.test(line.text));
  return candidate?.text ?? '';
}

function parseSuperMonitor(lines: ReturnType<typeof groupLines>, words: OCRWord[], freebetBand: { minY: number; maxY: number } | null): LocalParsedTicket {
  const event = chooseEvent(lines);
  const league = chooseLeague(lines, event);
  const header = lines.find((line) => /investir/i.test(line.text));
  const totalStake = header ? parseMoneyCandidates(header.text)[0] ?? null : null;
  const date = header ? extractDate(header.text) : '';
  const profitLine = lines.find((line) => /\blucro\b/i.test(line.text) && /R\$/i.test(line.text));
  const totalProfit = profitLine ? parseMoneyCandidates(profitLine.text).at(-1) ?? null : null;
  const percentLine = lines.find((line) => /convers[aã]o/i.test(line.text));
  const conversion = percentLine ? (percentLine.text.match(/\d+[.,]\d+\s*%/)?.[0] ?? '') : '';
  const profitPercentLine = lines.find((line) => /lucro\s*%/i.test(line.text));
  const profitPercent = profitPercentLine ? (profitPercentLine.text.match(/\d+[.,]\d+\s*%/)?.[0] ? numberFromText(profitPercentLine.text.match(/\d+[.,]\d+/)?.[0] ?? '') : null) : null;

  const outcomeLabels = ['Casa', 'Empate', 'Fora'];
  const bookmakerWords = words.filter((word) => findBookmaker(word.text));
  const rows: TicketRow[] = [];

  for (let i = 0; i < outcomeLabels.length; i++) {
    const outcome = outcomeLabels[i];
    const label = lines.find((line) => norm(line.text) === norm(outcome));
    const nextLabelTop = i < 2
      ? lines.find((line) => norm(line.text) === norm(outcomeLabels[i + 1]))?.top ?? Number.POSITIVE_INFINITY
      : Number.POSITIVE_INFINITY;
    const bandTop = label?.top ?? (header ? header.top + 60 + i * 100 : i * 100);
    const bandBottom = nextLabelTop;
    const inBand = bookmakerWords.filter((word) => word.top >= bandTop - 35 && word.top < bandBottom - 5);
    const bookmaker = inBand.map((w) => findBookmaker(w.text)).find(Boolean) ?? null;
    const bookmakerWord = inBand.find((w) => findBookmaker(w.text));
    const candidateLines = lines.filter((line) => line.top >= bandTop - 20 && line.top < bandBottom - 5);
    const allText = candidateLines.map((line) => line.text).join(' ');
    const odds = parseOddCandidates(allText).filter((odd) => odd < 100);
    const money = parseMoneyCandidates(allText);
    const odd = odds.find((value) => value >= 1.01 && value <= 100) ?? null;
    const stake = money.at(-1) ?? null;
    const centerY = bookmakerWord ? bookmakerWord.top + bookmakerWord.height / 2 : bandTop;
    const freebet = !!freebetBand && centerY >= freebetBand.minY - 25 && centerY <= freebetBand.maxY + 25;
    rows.push({ outcome, bookmaker: bookmaker ?? '', odd, stake, profit: null, freebet, mode: 'back' });
  }

  const notes: string[] = [];
  if (!rows.some((r) => r.bookmaker)) notes.push('Nenhuma casa de aposta foi reconhecida com segurança.');
  if (conversion) notes.push(`Conversão detectada: ${conversion} (não usada como lucro %).`);
  const confidenceValues = rows.flatMap((row) => {
    const bw = bookmakerWords.find((w) => findBookmaker(w.text) === row.bookmaker);
    return bw ? [bw.confidence / 100] : [];
  });
  const confidence = confidenceValues.length ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length : null;

  return {
    source: 'supermonitor', event, league, date, totalStake, totalProfit, profitPercent,
    rows, confidence, notes,
  };
}

function parseGeneric(lines: ReturnType<typeof groupLines>): LocalParsedTicket {
  const text = lines.map((line) => line.text).join('\n');
  const event = chooseEvent(lines);
  const header = lines.find((line) => /total\s+apostado|investir/i.test(line.text));
  const totalStake = header ? parseMoneyCandidates(header.text)[0] ?? null : null;
  const date = extractDate(text);
  const profitPercentMatch = text.match(/(?:lucro(?:\s+total)?\s*%)[^\d]*(\d+[.,]\d+)/i);
  const totalProfitMatch = text.match(/lucro(?!\s*%)[^\d]*(?:R\$\s*)?(\d+[.,]\d{2})/i);
  const bookmakers = lines.map((line) => findBookmaker(line.text)).filter((x): x is string => !!x);
  const rows: TicketRow[] = bookmakers.slice(0, 10).map((bookmaker, index) => {
    const line = lines.find((l) => findBookmaker(l.text) === bookmaker) ?? lines[index];
    const all = lines.filter((l) => Math.abs(l.top - line.top) < 80).map((l) => l.text).join(' ');
    return {
      outcome: index === 0 ? 'Casa' : index === 1 ? 'Empate' : index === 2 ? 'Fora' : '',
      bookmaker,
      odd: parseOddCandidates(all)[0] ?? null,
      stake: parseMoneyCandidates(all).at(-1) ?? null,
      profit: null,
      freebet: /freebet|🎁/i.test(all),
      mode: /\blay\b/i.test(all) ? 'lay' : 'back',
    };
  });
  return {
    source: /suregoat|calculadora goat/i.test(text) ? 'suregoat' : /super monitor/i.test(text) ? 'supermonitor' : 'other',
    event,
    league: chooseLeague(lines, event),
    date,
    totalStake,
    totalProfit: totalProfitMatch ? numberFromText(totalProfitMatch[1]) : null,
    profitPercent: profitPercentMatch ? numberFromText(profitPercentMatch[1]) : null,
    rows,
    confidence: rows.length ? 0.55 : null,
    notes: ['OCR local gratuito: confira os campos antes de salvar.'],
  };
}

async function dataUrlWithScale(dataUrl: string, scale: number, grayscale = false): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const maxSide = 3200;
      const factor = Math.min(scale, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * factor));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (grayscale) {
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < pixels.data.length; i += 4) {
          const v = Math.round(pixels.data[i] * 0.299 + pixels.data[i + 1] * 0.587 + pixels.data[i + 2] * 0.114);
          pixels.data[i] = v;
          pixels.data[i + 1] = v;
          pixels.data[i + 2] = v;
        }
        ctx.putImageData(pixels, 0, 0);
      }
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

export async function parseTicketLocally(dataUrl: string): Promise<LocalParsedTicket> {
  const worker = await Tesseract.createWorker('por+eng', 1);
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '11',
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });

    const original = await dataUrlWithScale(dataUrl, 1.5, false);
    const result = await worker.recognize(original, {}, { tsv: true });
    const words = extractWordsFromTsv(result.data.tsv ?? '');
    const lines = groupLines(words);
    const freebetBand = await detectFreebetByColor(dataUrl);

    const rawText = lines.map((line) => line.text).join('\n');
    const looksLikeSuperMonitor = /investir/i.test(rawText) && /casa/i.test(rawText) && /empate/i.test(rawText) && /fora/i.test(rawText);
    const parsed = looksLikeSuperMonitor ? parseSuperMonitor(lines, words, freebetBand) : parseGeneric(lines);

    if (!parsed.event && parsed.rows.length === 0) {
      const gray = await dataUrlWithScale(dataUrl, 2, true);
      const retry = await worker.recognize(gray, {}, { tsv: true });
      const retryWords = extractWordsFromTsv(retry.data.tsv ?? '');
      const retryLines = groupLines(retryWords);
      const retryText = retryLines.map((line) => line.text).join('\n');
      const retryLooksSuper = /investir/i.test(retryText) && /casa/i.test(retryText) && /empate/i.test(retryText) && /fora/i.test(retryText);
      return retryLooksSuper ? parseSuperMonitor(retryLines, retryWords, freebetBand) : parseGeneric(retryLines);
    }

    return parsed;
  } finally {
    await worker.terminate();
  }
}
