import { useState, useCallback, useRef, useEffect } from 'react';
import { Calculator, Save, Search, Loader2, Globe, Database, X, Calendar } from 'lucide-react';
import {
  type CalculatorState,
  type RowState,
  type CalcResults,
  compute,
  sanitizeDecimal,
  createDefaultState,
} from '@/lib/calc';
import { supabase, type Match } from '@/lib/supabase';

type SearchResult = {
  id: string | null;
  home_team: string;
  away_team: string;
  league: string;
  match_date: string | null;
  home_odd: number;
  draw_odd: number;
  away_odd: number;
  status: string;
  source?: string;
};

type Props = {
  state: CalculatorState;
  setState: (s: CalculatorState) => void;
  selectedMatch: Match | null;
  setSelectedMatch: (m: Match | null) => void;
  onBetSaved: () => void;
};

export default function ArbitrageCalculator({ state, setState, selectedMatch, setSelectedMatch, onBetSaved }: Props) {
  const [saveMsg, setSaveMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const results: CalcResults = compute(state);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchWarning, setSearchWarning] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const n = state.numOutcomes;

  const updateRow = useCallback(
    (idx: number, patch: Partial<RowState>) => {
      const newRows = [...state.rows];
      newRows[idx] = { ...newRows[idx], ...patch };
      setState({ ...state, rows: newRows });
    },
    [state, setState]
  );

  const updateRowIsLay = (idx: number, val: boolean) => {
    const newRowIsLay = [...state.rowIsLay];
    newRowIsLay[idx] = val;
    const newIsManual = [...state.isManual];
    newIsManual[idx] = false;
    setState({ ...state, rowIsLay: newRowIsLay, isManual: newIsManual });
  };

  const onCChange = (idx: number) => {
    const newRows = state.rows.map((r, i) => ({ ...r, c: i === idx ? !r.c : false }));
    const newIsManual = [...state.isManual];
    newIsManual[idx] = false;
    setState({ ...state, rows: newRows, isManual: newIsManual });
  };

  const toggleFeature = (feature: keyof CalculatorState) => {
    setState({ ...state, [feature]: !state[feature] } as CalculatorState);
  };

  const onStakeManualEdit = (idx: number) => {
    const newIsManual = [...state.isManual];
    newIsManual[idx] = true;
    setState({ ...state, isManual: newIsManual });
  };

  const onStakeLayEdit = (idx: number) => {
    const odd = parseFloat(state.rows[idx].odd.replace(',', '.')) || 0;
    const stakeLay = parseFloat(state.rows[idx].stakeLay.replace(',', '.')) || 0;
    const liability = (stakeLay * (odd - 1)).toFixed(2);
    updateRow(idx, { liability });
    onStakeManualEdit(idx);
  };

  const onLiabilityEdit = (idx: number) => {
    const odd = parseFloat(state.rows[idx].odd.replace(',', '.')) || 0;
    const liability = parseFloat(state.rows[idx].liability.replace(',', '.')) || 0;
    const stakeLay = (odd > 1 ? liability / (odd - 1) : 0).toFixed(2);
    updateRow(idx, { stakeLay });
    onStakeManualEdit(idx);
  };

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchError('');
      setSearchWarning('');
      setSearched(false);
      setShowResults(false);
      return;
    }

    setSearching(true);
    setSearchError('');
    setSearchWarning('');
    searchTimer.current = setTimeout(async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        const res = await fetch(
          `${supabaseUrl}/functions/v1/search-matches?team=${encodeURIComponent(searchQuery.trim())}`,
          {
            headers: {
              Authorization: `Bearer ${anonKey}`,
              'Content-Type': 'application/json',
            },
          }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.error) setSearchError(String(json.error));
        if (json.warning) setSearchWarning(String(json.warning));
        if (json.matches && Array.isArray(json.matches)) {
          setSearchResults(json.matches as SearchResult[]);
          setShowResults(true);
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
        setSearchWarning('');
        setSearchError('Não foi possível consultar os jogos agora.');
      } finally {
        setSearching(false);
        setSearched(true);
      }
    }, 500);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery]);

  const loadMatchOdds = () => {
    if (!selectedMatch) return;
    const newRows = state.rows.map((r, i) => {
      const nr = { ...r };
      if (i === 0 && selectedMatch.home_odd) nr.odd = String(selectedMatch.home_odd);
      if (i === 1 && selectedMatch.draw_odd) nr.odd = String(selectedMatch.draw_odd);
      if (i === 2 && selectedMatch.away_odd) nr.odd = String(selectedMatch.away_odd);
      return nr;
    });
    setState({ ...state, rows: newRows, numOutcomes: 3 });
  };

  const importAndSelect = async (result: SearchResult) => {
    if (result.id) {
      const { data } = await supabase.from('matches').select('*').eq('id', result.id).maybeSingle();
      if (data) {
        setSelectedMatch(data as Match);
        setSearchQuery('');
        setShowResults(false);
        return;
      }
    }

    const { data, error } = await supabase
      .from('matches')
      .insert({
        home_team: result.home_team,
        away_team: result.away_team,
        league: result.league,
        match_date: result.match_date,
        home_odd: result.home_odd,
        draw_odd: result.draw_odd,
        away_odd: result.away_odd,
        status: 'upcoming',
      })
      .select()
      .maybeSingle();

    if (!error && data) {
      setSelectedMatch(data as Match);
      setSearchQuery('');
      setShowResults(false);
    }
  };

  const saveBet = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const description = selectedMatch
        ? `${selectedMatch.home_team} vs ${selectedMatch.away_team}`
        : 'Aposta manual';
      const bookmakers: Record<string, string> = {};
      for (let i = 0; i < n; i++) {
        const bm = state.rows[i].bookmaker || `Linha ${i + 1}`;
        bookmakers[`row${i + 1}`] = bm;
      }
      const { error } = await supabase.from('bets').insert({
        match_id: selectedMatch?.id ?? null,
        description,
        total_stake: results.totalStake,
        profit: results.minProfit,
        profit_percent: results.profitPercent,
        status: 'pending',
        bookmakers,
        calculator_state: state as unknown as Record<string, unknown>,
      });
      if (error) throw error;
      setSaveMsg('Aposta salva com sucesso!');
      onBetSaved();
    } catch {
      setSaveMsg('Erro ao salvar aposta.');
    } finally {
      setSaving(false);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  const resetCalc = () => {
    setState(createDefaultState());
    setSelectedMatch(null);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Data não definida';
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const labelSpan = 3 + (state.boostFeatureEnabled ? 1 : 0);
  const profitColor = results.profitPercent < 0 ? '#c0392b' : results.profitPercent > 0 ? '#2c7a2c' : '#222';

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-normal text-[18px] sm:text-[22px] leading-tight m-0 flex items-center gap-2">
          <Calculator size={20} className="text-gray-600" />
          Calculadora de Arbitragem
        </h2>
        <div className="text-[18px] sm:text-[20px] font-bold" style={{ color: profitColor }}>
          {results.profitPercent.toFixed(2)}%
        </div>
      </div>

      {/* Game search bar */}
      <div className="mb-3 relative">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar time..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searching && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
            )}
          </div>
          {selectedMatch && (
            <button
              onClick={() => {
                setSelectedMatch(null);
                setSearchQuery('');
              }}
              className="px-2.5 py-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors flex items-center gap-1 text-xs font-medium"
              title="Remover jogo selecionado"
            >
              <X size={14} />
              Limpar
            </button>
          )}
        </div>

        {/* Search results dropdown */}
        {showResults && searchQuery.trim() && (
          <div className="absolute z-40 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
            {searching && (
              <div className="p-3 text-sm text-gray-400 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Buscando jogos...
              </div>
            )}

            {!searching && searched && searchResults.length === 0 && (
              <div className={`p-3 text-sm ${searchError ? 'text-red-600' : 'text-gray-400'}`}>
                {searchError || `Nenhum jogo encontrado para "${searchQuery}".`}
              </div>
            )}

            {!searching && searchWarning && (
              <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
                {searchWarning}
              </div>
            )}

            {!searching && searchResults.length > 0 && (
              <div className="py-1">
                {searchResults.map((result, idx) => {
                  const isDbMatch = !!result.id;
                  return (
                    <div
                      key={result.id || idx}
                      className="flex items-center justify-between px-2.5 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0"
                      onClick={() => importAndSelect(result)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`p-0.5 rounded ${isDbMatch ? 'bg-green-50' : 'bg-blue-50'} flex-shrink-0`}>
                          {isDbMatch ? <Database size={12} className="text-green-600" /> : <Globe size={12} className="text-blue-600" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">
                            {result.home_team} <span className="text-gray-400 mx-0.5">vs</span> {result.away_team}
                          </div>
                          <div className="text-[10px] text-gray-500 flex items-center gap-1">
                            <Calendar size={9} />
                            {formatDate(result.match_date)}
                            {result.league && <span className="truncate">— {result.league}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 text-[10px] flex-shrink-0 ml-1">
                        {result.home_odd > 0 && (
                          <span className="px-1.5 py-0.5 bg-gray-100 rounded font-semibold">{result.home_odd.toFixed(2)}</span>
                        )}
                        {result.draw_odd > 0 && (
                          <span className="px-1.5 py-0.5 bg-gray-100 rounded font-semibold">{result.draw_odd.toFixed(2)}</span>
                        )}
                        {result.away_odd > 0 && (
                          <span className="px-1.5 py-0.5 bg-gray-100 rounded font-semibold">{result.away_odd.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected match indicator */}
      {selectedMatch && (
        <div className="mb-2.5 p-2.5 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-between gap-2">
          <span className="text-xs text-blue-800 min-w-0 truncate">
            <strong>{selectedMatch.home_team} vs {selectedMatch.away_team}</strong>
            {selectedMatch.league ? ` — ${selectedMatch.league}` : ''}
          </span>
          <button
            onClick={loadMatchOdds}
            className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex-shrink-0"
          >
            Carregar odds
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="my-2 text-sm sm:text-base flex items-center gap-2">
        <span>Linhas:</span>
        <select
          value={state.numOutcomes}
          onChange={(e) => setState({ ...state, numOutcomes: parseInt(e.target.value) })}
          className="px-1.5 py-1 border border-gray-300 rounded text-sm sm:text-base font-sans"
        >
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
          <option value={5}>5</option>
        </select>
      </div>

      {/* Table — scrollable on mobile */}
      <div className="table-scroll">
        <table className="border-collapse w-full sm:w-auto sm:min-w-[600px]">
          <thead>
            <tr>
              <th></th>
              <th>Chance</th>
              {state.boostFeatureEnabled && <th>Imp.</th>}
              <th>Com.</th>
              <th>Odd Eff</th>
              <th>Aposta</th>
              <th>Casa</th>
              {state.freebetFeatureEnabled && <th>FB</th>}
              {state.cashbackFeatureEnabled && (
                <>
                  <th>CB%</th>
                  <th>Tipo</th>
                  <th>Máx</th>
                </>
              )}
              <th>Trav</th>
              <th>Lucro</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, i) => {
              const row = state.rows[i];
              const isLay = state.rowIsLay[i];
              const pColor = results.profits[i] < 0 ? '#c0392b' : results.profits[i] > 0 ? '#2c7a2c' : '#222';

              return (
                <tr key={i} className="border-b border-gray-100">
                  <td
                    className="cursor-pointer text-gray-500 text-left pl-1.5 select-none"
                    onClick={() => updateRowIsLay(i, !isLay)}
                  >
                    {isLay ? '−' : '+'} {i + 1}
                  </td>
                  <td>
                    <input
                      type="text"
                      className="decimal"
                      inputMode="decimal"
                      value={row.odd}
                      onChange={(e) => updateRow(i, { odd: sanitizeDecimal(e.target.value) })}
                    />
                    {state.extraBetFeatureEnabled && (
                      <input
                        type="text"
                        className="decimal small"
                        inputMode="decimal"
                        placeholder="Odd 2"
                        value={row.oddAdd}
                        onChange={(e) => updateRow(i, { oddAdd: sanitizeDecimal(e.target.value) })}
                      />
                    )}
                    {isLay && <div className="lay-label">Contra</div>}
                  </td>
                  {state.boostFeatureEnabled && (
                    <td>
                      <div className="boost-cell">
                        <input
                          type="checkbox"
                          checked={row.boostActive}
                          onChange={(e) => updateRow(i, { boostActive: e.target.checked })}
                        />
                        <input
                          type="text"
                          className="decimal"
                          inputMode="decimal"
                          placeholder="0"
                          value={row.boostVal}
                          disabled={!row.boostActive}
                          onChange={(e) => updateRow(i, { boostVal: sanitizeDecimal(e.target.value) })}
                          style={row.boostActive ? {} : { background: '#f2f2f2', color: '#aaa' }}
                        />
                      </div>
                    </td>
                  )}
                  <td>
                    <div className="comm-input-cell">
                      <input
                        type="text"
                        className="decimal"
                        inputMode="decimal"
                        value={row.comm}
                        onChange={(e) => updateRow(i, { comm: sanitizeDecimal(e.target.value) })}
                      />
                      %
                    </div>
                  </td>
                  <td className="eff-odd-cell">{results.effOdds[i].toFixed(3)}</td>
                  <td>
                    {isLay ? (
                      <>
                        <div className="lay-field">
                          <input
                            type="text"
                            className="decimal"
                            inputMode="decimal"
                            value={row.liability}
                            onChange={(e) => {
                              updateRow(i, { liability: sanitizeDecimal(e.target.value) });
                            }}
                            onBlur={() => onLiabilityEdit(i)}
                          />
                          <div className="lay-label">Resp.</div>
                        </div>
                        <div className="lay-field">
                          <input
                            type="text"
                            className="decimal"
                            inputMode="decimal"
                            value={row.stakeLay}
                            onChange={(e) => {
                              updateRow(i, { stakeLay: sanitizeDecimal(e.target.value) });
                            }}
                            onBlur={() => onStakeLayEdit(i)}
                          />
                          <div className="lay-label">A favor</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <input
                          type="text"
                          className="decimal"
                          inputMode="decimal"
                          value={row.stake}
                          onChange={(e) => {
                            updateRow(i, { stake: sanitizeDecimal(e.target.value) });
                            onStakeManualEdit(i);
                          }}
                        />
                        {state.extraBetFeatureEnabled && (
                          <input
                            type="text"
                            className="decimal small"
                            inputMode="decimal"
                            placeholder="Aposta 2"
                            value={row.stakeAdd}
                            onChange={(e) => updateRow(i, { stakeAdd: sanitizeDecimal(e.target.value) })}
                          />
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      placeholder="Casa"
                      value={row.bookmaker}
                      onChange={(e) => updateRow(i, { bookmaker: e.target.value })}
                      className="px-1.5 py-1 border border-gray-300 rounded text-xs w-16 text-center"
                    />
                  </td>
                  {state.freebetFeatureEnabled && (
                    <td>
                      <input
                        type="checkbox"
                        checked={row.fb}
                        onChange={(e) => updateRow(i, { fb: e.target.checked })}
                      />
                    </td>
                  )}
                  {state.cashbackFeatureEnabled && (
                    <>
                      <td className="cb-cell">
                        <input
                          type="text"
                          className="decimal"
                          inputMode="decimal"
                          value={row.cbPct}
                          onChange={(e) => updateRow(i, { cbPct: sanitizeDecimal(e.target.value) })}
                        />
                        %
                      </td>
                      <td className="cb-cell">
                        <select
                          value={row.cbTipo}
                          onChange={(e) => updateRow(i, { cbTipo: e.target.value as RowState['cbTipo'] })}
                        >
                          <option value="real">Real</option>
                          <option value="freebet">Freebet</option>
                          <option value="deposito">Dep.</option>
                        </select>
                      </td>
                      <td className="cb-cell">
                        <input
                          type="text"
                          className="decimal"
                          inputMode="decimal"
                          placeholder="Sem"
                          value={row.cbMax}
                          disabled={row.cbTipo !== 'freebet'}
                          onChange={(e) => updateRow(i, { cbMax: sanitizeDecimal(e.target.value) })}
                          style={row.cbTipo !== 'freebet' ? { background: '#f2f2f2', color: '#aaa' } : {}}
                        />
                      </td>
                    </>
                  )}
                  <td>
                    <input
                      type="checkbox"
                      checked={row.c}
                      onChange={() => onCChange(i)}
                    />
                  </td>
                  <td style={{ color: pColor }}>{results.profits[i].toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td></td>
              <td colSpan={labelSpan}>Total:</td>
              <td>
                <input
                  type="text"
                  className="decimal"
                  inputMode="decimal"
                  value={state.totalStake}
                  onChange={(e) => setState({ ...state, totalStake: sanitizeDecimal(e.target.value) })}
                />
              </td>
              {state.freebetFeatureEnabled && <td></td>}
              {state.cashbackFeatureEnabled && <td></td>}
              {state.cashbackFeatureEnabled && <td></td>}
              {state.cashbackFeatureEnabled && <td></td>}
              <td></td>
              <td>
                <input type="checkbox" disabled checked={results.totalStake > 0 && !state.rows.some((r, i) => i < n && r.c)} />
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Features Panel */}
      <div className="features-panel mt-4">
        <div className="features-title">
          Func.
        </div>
        <div
          className={`feature-chip ${state.boostFeatureEnabled ? 'active' : ''}`}
          onClick={() => toggleFeature('boostFeatureEnabled')}
        >
          <span className="check">{state.boostFeatureEnabled ? '✓' : ''}</span> Impulso
        </div>
        <div
          className={`feature-chip ${state.freebetFeatureEnabled ? 'active' : ''}`}
          onClick={() => toggleFeature('freebetFeatureEnabled')}
        >
          <span className="check">{state.freebetFeatureEnabled ? '✓' : ''}</span> Freebet
        </div>
        {state.freebetFeatureEnabled && (
          <div className="stat-box">
            Extração FB (%)
            <div className="stat-value">{results.fbConversion.toFixed(2)}%</div>
          </div>
        )}
        <div
          className={`feature-chip ${state.cashbackFeatureEnabled ? 'active' : ''}`}
          onClick={() => toggleFeature('cashbackFeatureEnabled')}
        >
          <span className="check">{state.cashbackFeatureEnabled ? '✓' : ''}</span> Cashback
        </div>
        {state.cashbackFeatureEnabled && (
          <div className="stat-box">
            Conv. FB (%)
            <input
              type="text"
              className="decimal"
              inputMode="decimal"
              value={state.cbConversion}
              onChange={(e) => setState({ ...state, cbConversion: sanitizeDecimal(e.target.value) })}
            />
          </div>
        )}
        <div
          className={`feature-chip ${state.extraBetFeatureEnabled ? 'active' : ''}`}
          onClick={() => toggleFeature('extraBetFeatureEnabled')}
        >
          <span className="check">{state.extraBetFeatureEnabled ? '✓' : ''}</span> Apost. Adic.
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex items-center gap-2.5 flex-wrap">
        <button
          onClick={saveBet}
          disabled={saving || results.totalStake === 0}
          className="px-4 py-2 bg-[#2c7a2c] text-white rounded-lg font-semibold hover:bg-[#246924] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
        >
          <Save size={16} />
          {saving ? 'Salvando...' : 'Salvar Aposta'}
        </button>
        <button
          onClick={resetCalc}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors text-sm"
        >
          Limpar
        </button>
        {saveMsg && (
          <span className={`text-sm font-medium ${saveMsg.includes('sucesso') ? 'text-green-600' : 'text-red-600'}`}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}
