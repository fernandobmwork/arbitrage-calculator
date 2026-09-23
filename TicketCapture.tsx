import { useEffect, useRef, useState } from 'react';
import { ClipboardPaste, ImagePlus, Loader2, Save, ScanSearch, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
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

const emptyTicket: ParsedTicket = {
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
};

function num(value: string): number | null {
  if (!value.trim()) return null;
  const normalized = value.replace(/R\$\s?/gi, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function TicketCapture({ onSaved }: { onSaved: () => void }) {
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedTicket>(emptyTicket);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Selecione uma imagem PNG, JPG, WEBP ou similar.');
      return;
    }
    setError('');
    setMessage('');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      const file = imageItem?.getAsFile();
      if (file) {
        event.preventDefault();
        readFile(file);
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
      setParsed({ ...emptyTicket, ...data.ticket });
      setMessage('Bilhete lido. Confira os campos antes de salvar.');
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Não foi possível analisar a imagem.';
      setError(`${text} Verifique se a função parse-ticket está publicada no Supabase e se a chave da IA foi configurada.`);
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

  const saveTicket = async () => {
    if (!parsed.event.trim() || parsed.rows.length === 0) {
      setError('Informe o evento e tenha pelo menos uma linha reconhecida antes de salvar.');
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
      const calculatorState = {
        source: 'ticket-capture',
        parser: parsed.source,
        event: parsed.event,
        league: parsed.league,
        date: parsed.date,
        rows: parsed.rows,
        confidence: parsed.confidence,
        notes: parsed.notes,
      };
      const totalStake = parsed.totalStake ?? parsed.rows.reduce((sum, row) => sum + (row.freebet ? 0 : row.stake ?? 0), 0);
      const profit = parsed.totalProfit ?? Math.min(...parsed.rows.map((row) => row.profit ?? 0));
      const profitPercent = parsed.profitPercent ?? (totalStake > 0 ? (profit / totalStake) * 100 : 0);

      const { error: insertError } = await supabase.from('bets').insert({
        match_id: null,
        description: parsed.event,
        total_stake: totalStake,
        profit,
        profit_percent: profitPercent,
        status: 'pending',
        bookmakers,
        calculator_state: calculatorState,
      });
      if (insertError) throw insertError;
      setMessage('Operação capturada e adicionada às suas operações.');
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
    setParsed(emptyTicket);
    setError('');
    setMessage('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2"><ScanSearch size={21} /> Capturar bilhete</h2>
          <p className="text-sm text-gray-500 mt-1">Cole ou envie um print de qualquer uma das suas calculadoras. A IA identifica o layout automaticamente.</p>
        </div>
        <button onClick={clear} className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 flex items-center gap-2 text-sm"><Trash2 size={15} /> Limpar</button>
      </div>

      <div
        className="border-2 border-dashed border-gray-300 rounded-2xl p-5 bg-gray-50 min-h-[230px] flex flex-col items-center justify-center text-center cursor-pointer hover:border-blue-400 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
        {image ? (
          <img src={image} alt="Print do bilhete" className="max-h-[420px] max-w-full object-contain rounded-xl shadow-sm" onClick={(e) => e.stopPropagation()} />
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
        <button onClick={parseTicket} disabled={processing} className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
          {processing ? <><Loader2 size={18} className="animate-spin" /> Analisando print...</> : <><ScanSearch size={18} /> Identificar operação com IA</>}
        </button>
      )}

      {message && <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2"><CheckCircle2 size={17} /> {message}</div>}
      {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" /> {error}</div>}

      {parsed.rows.length > 0 && (
        <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
          <div className="p-4 border-b bg-gray-50">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <label className="text-xs font-medium text-gray-500">Evento<input value={parsed.event} onChange={(e) => updateTicket({ event: e.target.value })} className="mt-1 w-full border rounded-lg px-2.5 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-gray-500">Campeonato<input value={parsed.league} onChange={(e) => updateTicket({ league: e.target.value })} className="mt-1 w-full border rounded-lg px-2.5 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-gray-500">Data/hora<input value={parsed.date} onChange={(e) => updateTicket({ date: e.target.value })} className="mt-1 w-full border rounded-lg px-2.5 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-gray-500">Lucro total<input value={parsed.totalProfit ?? ''} onChange={(e) => updateTicket({ totalProfit: num(e.target.value) })} className="mt-1 w-full border rounded-lg px-2.5 py-2 text-sm" /></label>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-600">
              <span>Total apostado: <strong>R$ {(parsed.totalStake ?? 0).toFixed(2)}</strong></span>
              <span>Lucro %: <strong>{(parsed.profitPercent ?? 0).toFixed(2)}%</strong></span>
              <span>Fonte: <strong>{parsed.source}</strong></span>
              {parsed.confidence != null && <span>Confiança: <strong>{Math.round(parsed.confidence * 100)}%</strong></span>}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[850px]">
              <thead><tr className="border-b text-left text-xs text-gray-500"><th className="p-3">Resultado</th><th>Casa</th><th>Odd</th><th>Aposta</th><th>Lucro</th><th>Freebet</th><th>Tipo</th></tr></thead>
              <tbody>
                {parsed.rows.map((row, index) => (
                  <tr key={index} className="border-b last:border-0">
                    <td className="p-2"><input value={row.outcome} onChange={(e) => updateRow(index, { outcome: e.target.value })} className="w-full border rounded-lg px-2 py-1.5" /></td>
                    <td><input value={row.bookmaker} onChange={(e) => updateRow(index, { bookmaker: e.target.value })} className="w-full border rounded-lg px-2 py-1.5" /></td>
                    <td><input value={row.odd ?? ''} onChange={(e) => updateRow(index, { odd: num(e.target.value) })} className="w-24 border rounded-lg px-2 py-1.5" /></td>
                    <td><input value={row.stake ?? ''} onChange={(e) => updateRow(index, { stake: num(e.target.value) })} className="w-28 border rounded-lg px-2 py-1.5" /></td>
                    <td><input value={row.profit ?? ''} onChange={(e) => updateRow(index, { profit: num(e.target.value) })} className="w-28 border rounded-lg px-2 py-1.5" /></td>
                    <td><input type="checkbox" checked={row.freebet} onChange={(e) => updateRow(index, { freebet: e.target.checked })} className="w-5 h-5" /></td>
                    <td><select value={row.mode} onChange={(e) => updateRow(index, { mode: e.target.value as TicketRow['mode'] })} className="border rounded-lg px-2 py-1.5"><option value="back">Back</option><option value="lay">Lay</option><option value="unknown">Desconhecido</option></select></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {parsed.notes.length > 0 && <div className="p-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-800">{parsed.notes.map((note, i) => <div key={i}>• {note}</div>)}</div>}
          <div className="p-4 flex justify-end">
            <button onClick={saveTicket} disabled={saving} className="px-5 py-2.5 rounded-xl bg-green-600 text-white font-semibold flex items-center gap-2 disabled:opacity-60"><Save size={17} /> {saving ? 'Salvando...' : 'Adicionar às minhas operações'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
