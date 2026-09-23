import { useCallback, useRef, useState } from 'react';
import { Clipboard, ImagePlus, Loader2, RefreshCw, Save, Upload, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from './supabase';

type CaptureRow = {
  result: string;
  bookmaker: string;
  bet_type: string;
  odd: number | null;
  odd_real: number | null;
  commission_percent: number | null;
  stake: number | null;
  profit: number | null;
  freebet: boolean | null;
  distribution: boolean | null;
  fixed: boolean | null;
  notes: string | null;
};

type CaptureData = {
  source: string;
  source_layout: string | null;
  event: string | null;
  competition: string | null;
  match_date: string | null;
  total_stake: number | null;
  total_profit: number | null;
  profit_percent: number | null;
  conversion_percent: number | null;
  rows: CaptureRow[];
  confidence: number | null;
  warnings: string[];
};

type Props = { onSaved: () => void };

function money(value: number | null) {
  if (value == null || Number.isNaN(value)) return '—';
  return `R$ ${value.toFixed(2)}`;
}

function num(value: number | null, digits = 2) {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function CaptureTicket({ onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<CaptureData | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const analyze = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Selecione ou cole uma imagem.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 12 MB.');
      return;
    }
    setError('');
    setSaved(false);
    setData(null);
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setImageUrl(dataUrl);
      const { data: result, error: fnError } = await supabase.functions.invoke('capture-ticket', {
        body: { image: dataUrl },
      });
      if (fnError) throw fnError;
      if (!result?.data) throw new Error(result?.error || 'Não foi possível interpretar o bilhete.');
      setData(result.data as CaptureData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao analisar o bilhete.');
    } finally {
      setBusy(false);
    }
  }, []);

  const onFile = async (file?: File) => {
    if (file) await analyze(file);
  };

  const onPaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith('image/'));
    if (!imageItem) return;
    event.preventDefault();
    const file = imageItem.getAsFile();
    if (file) await analyze(file);
  };

  const pasteFromClipboard = async () => {
    setError('');
    try {
      if (!navigator.clipboard?.read) throw new Error('Seu navegador não permite leitura direta da área de transferência. Copie o print e use Colar aqui.');
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          await analyze(new File([blob], 'bilhete.png', { type }));
          return;
        }
      }
      throw new Error('Não encontrei uma imagem na área de transferência.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível colar a imagem.');
    }
  };

  const saveCapture = async () => {
    if (!data) return;
    setSaving(true);
    setError('');
    try {
      const bookmakers: Record<string, string> = {};
      data.rows.forEach((row, index) => {
        bookmakers[`row${index + 1}`] = row.bookmaker || `Linha ${index + 1}`;
      });

      const calculatorState = {
        source: data.source,
        source_layout: data.source_layout,
        event: data.event,
        competition: data.competition,
        match_date: data.match_date,
        total_stake: data.total_stake,
        total_profit: data.total_profit,
        profit_percent: data.profit_percent,
        conversion_percent: data.conversion_percent,
        rows: data.rows,
        capture_confidence: data.confidence,
        capture_warnings: data.warnings,
        imported_from_screenshot: true,
      };

      const { error: dbError } = await supabase.from('bets').insert({
        description: data.event || 'Bilhete capturado',
        total_stake: data.total_stake ?? 0,
        profit: data.total_profit ?? 0,
        profit_percent: data.profit_percent ?? 0,
        status: 'pending',
        bookmakers,
        calculator_state: calculatorState,
        capture_source: data.source || null,
        capture_confidence: data.confidence,
      });
      if (dbError) throw dbError;
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar a operação.');
    } finally {
      setSaving(false);
    }
  };

  const clear = () => {
    setImageUrl('');
    setData(null);
    setError('');
    setSaved(false);
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold flex items-center gap-2"><ImagePlus size={22} /> Capturar bilhete</h2>
          <p className="text-sm text-gray-500 mt-1">Cole ou envie um print de qualquer uma das calculadoras suportadas.</p>
        </div>
        {data && <button onClick={clear} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200" title="Limpar"><X size={18} /></button>}
      </div>

      <div
        onPaste={onPaste}
        tabIndex={0}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files?.[0]); }}
        className="border-2 border-dashed border-blue-200 rounded-2xl bg-blue-50/40 p-5 sm:p-8 text-center outline-none focus:ring-2 focus:ring-blue-500"
      >
        {imageUrl ? (
          <img src={imageUrl} alt="Print do bilhete" className="max-h-[420px] mx-auto rounded-xl shadow-sm object-contain" />
        ) : (
          <div className="py-8">
            <ImagePlus size={44} className="mx-auto text-blue-500 mb-3" />
            <div className="font-semibold text-lg">Cole o print aqui</div>
            <div className="text-sm text-gray-500 mt-1">Ctrl+V no computador ou Colar no iPhone/iPad. Também pode arrastar ou escolher uma imagem.</div>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-2 mt-5">
          <button onClick={() => inputRef.current?.click()} className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium flex items-center gap-2 hover:bg-blue-700">
            <Upload size={17} /> Escolher imagem
          </button>
          <button onClick={() => void pasteFromClipboard()} className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl font-medium flex items-center gap-2 hover:bg-gray-50">
            <Clipboard size={17} /> Colar print
          </button>
          {imageUrl && <button onClick={() => void analyze(new File([new Blob()], 'retry.png'))} className="hidden" />}
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>

      {busy && (
        <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200 flex items-center gap-3">
          <Loader2 className="animate-spin text-blue-600" size={20} />
          <div><div className="font-medium">Analisando o bilhete...</div><div className="text-xs text-gray-500">Identificando layout, evento, casas, odds, valores, freebets e lucro.</div></div>
        </div>
      )}

      {error && <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      {data && !busy && (
        <div className="mt-5 space-y-4">
          <div className="p-4 rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-400">Fonte identificada</div>
                <div className="text-lg font-semibold">{data.source || 'Não identificada'}</div>
                {data.source_layout && <div className="text-xs text-gray-500">Layout: {data.source_layout}</div>}
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400">Confiança</div>
                <div className="font-semibold">{data.confidence == null ? '—' : `${Math.round(data.confidence * 100)}%`}</div>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              <Field label="Evento" value={data.event || '—'} />
              <Field label="Competição" value={data.competition || '—'} />
              <Field label="Data/hora" value={data.match_date || '—'} />
              <Field label="Total apostado" value={money(data.total_stake)} />
              <Field label="Lucro total" value={money(data.total_profit)} strong />
              <Field label="Lucro %" value={data.profit_percent == null ? '—' : `${num(data.profit_percent)}%`} strong />
              <Field label="Conversão" value={data.conversion_percent == null ? '—' : `${num(data.conversion_percent)}%`} />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 font-semibold">Operações identificadas</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-sm">
                <thead><tr className="text-gray-500 border-b">
                  <th className="text-left p-3">Resultado</th><th className="text-left p-3">Casa</th><th className="text-left p-3">Tipo</th><th className="p-3">Odd</th><th className="p-3">Odd real</th><th className="p-3">Comissão</th><th className="p-3">Valor</th><th className="p-3">Lucro</th><th className="p-3">Freebet</th><th className="p-3">Dist.</th><th className="p-3">Fixo</th>
                </tr></thead>
                <tbody>{data.rows.map((row, i) => <tr key={i} className="border-b last:border-0">
                  <td className="p-3 font-medium">{row.result || '—'}</td>
                  <td className="p-3">{row.bookmaker || '—'}</td>
                  <td className="p-3">{row.bet_type || '—'}</td>
                  <td className="p-3 text-center">{num(row.odd, 3)}</td>
                  <td className="p-3 text-center">{num(row.odd_real, 3)}</td>
                  <td className="p-3 text-center">{row.commission_percent == null ? '—' : `${num(row.commission_percent)}%`}</td>
                  <td className="p-3 text-center">{money(row.stake)}</td>
                  <td className="p-3 text-center font-semibold text-green-700">{money(row.profit)}</td>
                  <td className="p-3 text-center">{row.freebet === true ? '✓' : row.freebet === false ? '—' : '?'}</td>
                  <td className="p-3 text-center">{row.distribution === true ? '✓' : row.distribution === false ? '—' : '?'}</td>
                  <td className="p-3 text-center">{row.fixed === true ? '✓' : row.fixed === false ? '—' : '?'}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>

          {data.warnings?.length > 0 && <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex gap-2"><AlertTriangle size={18} className="shrink-0" /><div><div className="font-semibold">Confira estes pontos</div><ul className="list-disc ml-4 mt-1">{data.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div></div>}

          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => imageUrl && void analyze(new File([], 'bilhete.png', { type: 'image/png' }))} className="hidden"><RefreshCw size={17} /> Reanalisar</button>
            <button disabled={saving || saved} onClick={() => void saveCapture()} className="px-5 py-2.5 bg-green-600 text-white rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50">
              {saved ? <CheckCircle2 size={18} /> : <Save size={18} />}{saved ? 'Operação adicionada' : saving ? 'Salvando...' : 'Adicionar operação'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="rounded-xl bg-gray-50 border border-gray-100 p-3"><div className="text-xs text-gray-400 mb-1">{label}</div><div className={strong ? 'font-bold text-green-700' : 'font-medium'}>{value}</div></div>;
}
