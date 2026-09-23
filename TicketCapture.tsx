import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  ImagePlus,
  Loader2,
  Plus,
  Save,
  ScanSearch,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '@/supabase';

type TicketRow = {
  outcome: string;
  bookmaker: string;
  odd: number | null;
  stake: number | null;
  profit: number | null;
  freebet: boolean;
  mode: 'back' | 'lay' | 'unknown';
};

type ParsedTicket = {
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

const emptyTicket = (): ParsedTicket => ({
  source: 'unknown',
  event: '',
  league: '',
  date: '',
  totalStake: null,
  totalProfit: null,
  profitPercent: null,
  rows: [],
  confidence: null,
  notes: [],
});

function num(value: string): number | null {
  if (!value.trim()) return null;
  const normalized = value
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `R$ ${value.toFixed(2)}`;
}

function normalizeRows(rows: unknown): TicketRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .map((row) => ({
      outcome: String(row.outcome ?? ''),
      bookmaker: String(row.bookmaker ?? ''),
      odd: typeof row.odd === 'number' && Number.isFinite(row.odd) ? row.odd : null,
      stake: typeof row.stake === 'number' && Number.isFinite(row.stake) ? row.stake : null,
      profit: typeof row.profit === 'number' && Number.isFinite(row.profit) ? row.profit : null,
      freebet: Boolean(row.freebet),
      mode: row.mode === 'back' || row.mode === 'lay' ? row.mode : 'unknown',
    }));
}

function normalizeTicket(raw: unknown): ParsedTicket {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const source = value.source === 'supermonitor' || value.source === 'suregoat' || value.source === 'other'
    ? value.source
    : 'unknown';

  return {
    source,
    event: String(value.event ?? ''),
    league: String(value.league ?? ''),
    date: String(value.date ?? ''),
    totalStake: typeof value.totalStake === 'number' && Number.isFinite(value.totalStake) ? value.totalStake : null,
    totalProfit: typeof value.totalProfit === 'number' && Number.isFinite(value.totalProfit) ? value.totalProfit : null,
    profitPercent: typeof value.profitPercent === 'number' && Number.isFinite(value.profitPercent) ? value.profitPercent : null,
    rows: normalizeRows(value.rows),
    confidence: typeof value.confidence === 'number' && Number.isFinite(value.confidence) ? value.confidence : null,
    notes: Array.isArray(value.notes) ? value.notes.map(String) : [],
  };
}

function imageToOptimizedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.onload = () => {
      const source = String(reader.result);
      const image = new Image();
      image.onerror = () => resolve(source);
      image.onload = () => {
        const maxSide = 2200;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) return resolve(source);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      image.src = source;
    };
    reader.readAsDataURL(file);
  });
}

export default function TicketCapture({ onSaved }: { onSaved: () => void }) {
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedTicket>(emptyTicket());
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const readFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Selecione uma imagem PNG, JPG, WEBP ou similar.');
      return;
    }
    setError('');
    setMessage('');
    setFileName(file.name);
    try {
      setImage(await imageToOptimizedDataUrl(file));
      setParsed(emptyTicket());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível preparar a imagem.');
    }
  };

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      const file = imageItem?.getAsFile();
      if (file) {
        event.preventDefault();
        void readFile(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const parseTicket = async () => {
    if (!image) return;
    setProcessing(true);
    setError('');
    setMessage('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('parse-ticket', {
        body: { image },
      });
      if (invokeError) throw invokeError;
      if (!data?.ticket) throw new Error(data?.error || 'A IA não retornou uma operação válida.');
      const next = normalizeTicket(data.ticket);
      if (!next.event && next.rows.length === 0) {
        throw new Error('Não consegui identificar uma operação neste print.');
      }
      setParsed(next);
      setMessage('Bilhete lido. Confira os campos antes de salvar.');
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Não foi possível analisar a imagem.';
      setError(`${text} Verifique se a função parse-ticket está publicada e se a chave da IA está configurada no Supabase.`);
    } finally {
      setProcessing(false);
    }
  };

  const updateTicket = (patch: Partial<ParsedTicket>) => setParsed((current) => ({ ...current, ...patch }));

  const updateRow = (index: number, patch: Partial<TicketRow>) => {
    setParsed((current) => ({
      ...current,
      rows: current.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  };

  const addRow = () => {
    setParsed((current) => ({
      ...current,
      rows: [...current.rows, { outcome: '', bookmaker: '', odd: null, stake: null, profit: null, freebet: false, mode: 'unknown' }],
    }));
  };

  const removeRow = (index: number) => {
    setParsed((current) => ({ ...current, rows: current.rows.filter((_, i) => i !== index) }));
  };

  const recalculateTotals = () => {
    const cashStake = parsed.rows.reduce((sum, row) => sum + (row.freebet ? 0 : row.stake ?? 0), 0);
    const displayedStake = parsed.rows.reduce((sum, row) => sum + (row.stake ?? 0), 0);
    const profits = parsed.rows.map((row) => row.profit).filter((value): value is number => value != null && Number.isFinite(value));
    const guaranteedProfit = profits.length === parsed.rows.length && profits.length > 0 ? Math.min(...profits) : null;
    setParsed((current) => ({
      ...current,
      totalStake: current.source === 'supermonitor' && current.totalStake != null ? current.totalStake : displayedStake || cashStake || current.totalStake,
      totalProfit: guaranteedProfit ?? current.totalProfit,
      profitPercent: guaranteedProfit != null && displayedStake > 0 ? (guaranteedProfit / displayedStake) * 100 : current.profitPercent,
    }));
  };

  const saveTicket = async () => {
    if (!parsed.event.trim() || parsed.rows.length === 0) {
      setError('Informe o evento e tenha pelo menos uma linha reconhecida antes de salvar.');
      return;
    }
    if (parsed.rows.some((row) => !row.bookmaker.trim() || row.odd == null || row.stake == null)) {
      setError('Preencha casa, odd e valor de todas as linhas antes de salvar.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const bookmakers: Record<string, unknown> = {};
      parsed.rows.forEach((row, index) => {
        bookmakers[`row${index + 1}`] = row.bookmaker;
      });

      const cashStake = parsed.rows.reduce((sum, row) => sum + (row.freebet ? 0 : row.stake ?? 0), 0);
      const displayedStake = parsed.totalStake ?? parsed.rows.reduce((sum, row) => sum + (row.stake ?? 0), 0);
      const freebetAmount = parsed.rows.reduce((sum, row) => sum + (row.freebet ? row.stake ?? 0 : 0), 0);
      const profits = parsed.rows.map((row) => row.profit).filter((value): value is number => value != null && Number.isFinite(value));
      const profit = parsed.totalProfit ?? (profits.length === parsed.rows.length && profits.length ? Math.min(...profits) : 0);
      const profitPercent = parsed.profitPercent ?? (displayedStake > 0 ? (profit / displayedStake) * 100 : 0);

      let matchId: string | null = null;
      const eventParts = parsed.event.split(/\s+x\s+/i).map((part) => part.trim()).filter(Boolean);
      if (eventParts.length >= 2) {
        const { data: matches } = await supabase
          .from('matches')
          .select('id, home_team, away_team, league, match_date')
          .ilike('home_team', eventParts[0])
          .ilike('away_team', eventParts[1])
          .limit(1);
        matchId = matches?.[0]?.id ?? null;
      }

      const calculatorState = {
        source: 'ticket-capture',
        parser: parsed.source,
        event: parsed.event,
        league: parsed.league,
        date: parsed.date,
        rows: parsed.rows,
        totalStake: displayedStake,
        cashStake,
        freebetAmount,
        totalProfit: profit,
        profitPercent,
        confidence: parsed.confidence,
        notes: parsed.notes,
        capturedAt: new Date().toISOString(),
      };

      const { error: insertError } = await supabase.from('bets').insert({
        match_id: matchId,
        description: parsed.event,
        total_stake: displayedStake,
        profit,
        profit_percent: profitPercent,
        status: 'pending',
        bookmakers,
        calculator_state: calculatorState,
      });
      if (insertError) throw insertError;

      setMessage(matchId
        ? 'Operação capturada, adicionada às suas operações e vinculada ao jogo para acompanhamento de resultado.'
        : 'Operação capturada e adicionada às suas operações.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar a operação.');
    } finally {
      setSaving(false);
    }
  };

  const clear = () => {
    setImage(null);
    setFileName('');
    setParsed(emptyTicket());
    setError('');
    setMessage('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const freebetAmount = parsed.rows.reduce((sum, row) => sum + (row.freebet ? row.stake ?? 0 : 0), 0);
  const cashStake = parsed.rows.reduce((sum, row) => sum + (row.freebet ? 0 : row.stake ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><ScanSearch size={21} /> Capturar bilhete</h2>
          <p className="text-sm text-gray-500 mt-1">Cole ou envie um print. A IA identifica automaticamente Super Monitor, SureGoat e outros layouts.</p>
        </div>
        <button onClick={clear} className="self-start px-3 py-2 rounded-lg bg-gray-100 text-gray-700 flex items-center gap-2 text-sm"><Trash2 size={15} /> Limpar</button>
      </div>

      <div
        className="border-2 border-dashed border-gray-300 rounded-2xl p-5 bg-gray-50 min-h-[230px] flex flex-col items-center justify-center text-center cursor-pointer hover:border-blue-400 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])} />
        {image ? (
          <div className="relative w-full flex justify-center">
            <img src={image} alt="Print do bilhete" className="max-h-[420px] max-w-full object-contain rounded-xl shadow-sm" onClick={(e) => e.stopPropagation()} />
            <button type="button" onClick={(e) => { e.stopPropagation(); clear(); }} className="absolute top-2 right-2 p-2 rounded-full bg-black/70 text-white" aria-label="Remover imagem"><X size={16} /></button>
          </div>
        ) : (
          <>
            <ImagePlus size={38} className="text-gray-400 mb-3" />
            <strong className="text-gray-700">Cole o print aqui</strong>
            <span className="text-sm text-gray-500 mt-1">ou toque para selecionar uma imagem</span>
            <span className="text-xs text-gray-400 mt-3 flex items-center gap-1"><ClipboardPaste size={13} /> Também aceita Ctrl/Cmd + V</span>
          </>
        )}
      </div>

      {fileName && <div className="text-xs text-gray-500">Arquivo: {fileName}</div>}

      {image && (
        <button onClick={() => void parseTicket()} disabled={processing} className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
          {processing ? <><Loader2 size={18} className="animate-spin" /> Analisando print...</> : <><ScanSearch size={18} /> Identificar operação com IA</>}
        </button>
      )}

      {message && <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2"><CheckCircle2 size={17} /> {message}</div>}
      {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" /> {error}</div>}

      {parsed.rows.length > 0 && (
        <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
          <div className="p-4 border-b bg-gray-50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div>
                <h3 className="font-semibold text-gray-800">Conferência da operação</h3>
                <p className="text-xs text-gray-500 mt-0.5">Nada é salvo antes de você confirmar.</p>
              </div>
              <button onClick={recalculateTotals} className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700">Recalcular totais</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-xs font-medium text-gray-500">Evento<input value={parsed.event} onChange={(e) => updateTicket({ event: e.target.value })} className="mt-1 w-full border rounded-lg px-2.5 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-gray-500">Campeonato<input value={parsed.league} onChange={(e) => updateTicket({ league: e.target.value })} className="mt-1 w-full border rounded-lg px-2.5 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-gray-500">Data/hora<input value={parsed.date} onChange={(e) => updateTicket({ date: e.target.value })} className="mt-1 w-full border rounded-lg px-2.5 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-gray-500">Fonte<input value={parsed.source} readOnly className="mt-1 w-full border rounded-lg px-2.5 py-2 text-sm bg-gray-100" /></label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              <label className="rounded-xl bg-white border p-3 text-xs text-gray-500">Total apostado<input value={parsed.totalStake ?? ''} onChange={(e) => updateTicket({ totalStake: num(e.target.value) })} className="mt-1 w-full border-0 p-0 text-base font-semibold text-gray-800 outline-none" /></label>
              <label className="rounded-xl bg-white border p-3 text-xs text-gray-500">Lucro total<input value={parsed.totalProfit ?? ''} onChange={(e) => updateTicket({ totalProfit: num(e.target.value) })} className="mt-1 w-full border-0 p-0 text-base font-semibold text-green-700 outline-none" /></label>
              <label className="rounded-xl bg-white border p-3 text-xs text-gray-500">Lucro %<input value={parsed.profitPercent ?? ''} onChange={(e) => updateTicket({ profitPercent: num(e.target.value) })} className="mt-1 w-full border-0 p-0 text-base font-semibold text-blue-700 outline-none" /></label>
              <div className="rounded-xl bg-white border p-3 text-xs text-gray-500">Freebet<strong className="mt-1 block text-base text-orange-600">{money(freebetAmount)}</strong></div>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
              <span>Dinheiro próprio: <strong>{money(cashStake)}</strong></span>
              {parsed.confidence != null && <span>Confiança da IA: <strong>{Math.round(parsed.confidence * 100)}%</strong></span>}
              <span>Linhas: <strong>{parsed.rows.length}</strong></span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead><tr className="border-b text-left text-xs text-gray-500"><th className="p-3">Resultado</th><th>Casa</th><th>Odd</th><th>Valor</th><th>Lucro</th><th>Freebet</th><th>Tipo</th><th></th></tr></thead>
              <tbody>
                {parsed.rows.map((row, index) => (
                  <tr key={index} className="border-b last:border-0">
                    <td className="p-2"><input value={row.outcome} onChange={(e) => updateRow(index, { outcome: e.target.value })} className="w-full border rounded-lg px-2 py-1.5" /></td>
                    <td><input value={row.bookmaker} onChange={(e) => updateRow(index, { bookmaker: e.target.value })} className="w-full border rounded-lg px-2 py-1.5" /></td>
                    <td><input value={row.odd ?? ''} onChange={(e) => updateRow(index, { odd: num(e.target.value) })} className="w-24 border rounded-lg px-2 py-1.5" /></td>
                    <td><input value={row.stake ?? ''} onChange={(e) => updateRow(index, { stake: num(e.target.value) })} className="w-28 border rounded-lg px-2 py-1.5" /></td>
                    <td><input value={row.profit ?? ''} onChange={(e) => updateRow(index, { profit: num(e.target.value) })} className="w-28 border rounded-lg px-2 py-1.5" placeholder="não exibido" /></td>
                    <td><label className="flex items-center justify-center gap-2"><input type="checkbox" checked={row.freebet} onChange={(e) => updateRow(index, { freebet: e.target.checked })} className="w-5 h-5" /><span className="text-xs">Sim</span></label></td>
                    <td><select value={row.mode} onChange={(e) => updateRow(index, { mode: e.target.value as TicketRow['mode'] })} className="border rounded-lg px-2 py-1.5"><option value="back">Back</option><option value="lay">Lay</option><option value="unknown">Desconhecido</option></select></td>
                    <td><button onClick={() => removeRow(index)} className="p-2 text-gray-400 hover:text-red-600" title="Remover linha"><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 border-t bg-gray-50">
            <button onClick={addRow} className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-700 flex items-center gap-2"><Plus size={15} /> Adicionar linha</button>
          </div>

          {parsed.notes.length > 0 && <div className="p-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-800">{parsed.notes.map((note, i) => <div key={i}>• {note}</div>)}</div>}
          <div className="p-4 flex justify-end">
            <button onClick={() => void saveTicket()} disabled={saving} className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-green-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"><Save size={17} /> {saving ? 'Salvando...' : 'Adicionar às minhas operações'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
