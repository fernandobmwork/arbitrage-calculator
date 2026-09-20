import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Trophy, Clock, CheckCircle, XCircle, RefreshCw, Building2 } from 'lucide-react';
import { supabase, type Bet } from '@/lib/supabase';

type Props = {
  refreshKey: number;
};

export default function Dashboard({ refreshKey }: Props) {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoSyncing, setAutoSyncing] = useState(false);

  const fetchBets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bets')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setBets(data as Bet[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBets();
  }, [fetchBets, refreshKey]);

  const updateStatus = async (id: string, status: Bet['status'], winningOutcome?: string, bookmakerGreen?: string) => {
    const update: Record<string, unknown> = { status };
    if (winningOutcome !== undefined) update.winning_outcome = winningOutcome;
    if (bookmakerGreen !== undefined) update.bookmaker_green = bookmakerGreen;
    const { error } = await supabase.from('bets').update(update).eq('id', id);
    if (!error) fetchBets();
  };

  const deleteBet = async (id: string) => {
    const { error } = await supabase.from('bets').delete().eq('id', id);
    if (!error) fetchBets();
  };

  const syncResults = useCallback(async () => {
    if (autoSyncing) return;
    setAutoSyncing(true);
    try {
      await supabase.functions.invoke('update-results');
      await fetchBets();
    } catch {
      // Keep the last known state if the sync is temporarily unavailable.
    } finally {
      setAutoSyncing(false);
    }
  }, [autoSyncing, fetchBets]);

  useEffect(() => {
    const interval = window.setInterval(() => void syncResults(), 60_000);
    const channel = supabase
      .channel('dashboard-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, () => void fetchBets())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => void fetchBets())
      .subscribe();

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [syncResults, fetchBets]);

  const totalStaked = bets.reduce((s, b) => s + Number(b.total_stake), 0);
  const totalProfit = bets
    .filter((b) => b.status === 'won')
    .reduce((s, b) => s + Number(b.profit), 0);
  const totalLost = bets
    .filter((b) => b.status === 'lost')
    .reduce((s, b) => s + Number(b.total_stake), 0);
  const pendingCount = bets.filter((b) => b.status === 'pending').length;
  const wonCount = bets.filter((b) => b.status === 'won').length;
  const lostCount = bets.filter((b) => b.status === 'lost').length;
  const netResult = totalProfit - totalLost;
  const roi = totalStaked > 0 ? (netResult / totalStaked) * 100 : 0;

  const stats = [
    {
      label: 'Total Apostado',
      value: `R$ ${totalStaked.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Lucro Líquido',
      value: `R$ ${netResult.toFixed(2)}`,
      icon: netResult >= 0 ? TrendingUp : TrendingDown,
      color: netResult >= 0 ? 'text-green-600' : 'text-red-600',
      bg: netResult >= 0 ? 'bg-green-50' : 'bg-red-50',
    },
    {
      label: 'ROI',
      value: `${roi.toFixed(2)}%`,
      icon: TrendingUp,
      color: roi >= 0 ? 'text-green-600' : 'text-red-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Apostas Ganhas',
      value: `${wonCount}`,
      icon: Trophy,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-[18px] sm:text-[22px] font-normal flex items-center gap-2">
          <TrendingUp size={20} className="text-gray-600" />
          Dashboard
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          Atualização automática ativa
        </div>
      </div>


      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 mb-5">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className={`${stat.bg} rounded-xl p-3 sm:p-5 border border-gray-100`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs sm:text-sm text-gray-500 font-medium">{stat.label}</span>
                <Icon size={16} className={stat.color} />
              </div>
              <div className={`text-lg sm:text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            </div>
          );
        })}
      </div>

      {/* Summary bar */}
      <div className="flex gap-4 sm:gap-6 mb-4 text-xs sm:text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-gray-400" />
          <span className="text-gray-600">{pendingCount} pendentes</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle size={16} className="text-green-500" />
          <span className="text-gray-600">{wonCount} ganhas</span>
        </div>
        <div className="flex items-center gap-2">
          <XCircle size={16} className="text-red-500" />
          <span className="text-gray-600">{lostCount} perdidas</span>
        </div>
      </div>

      {/* Bets Table */}
      <div className="table-scroll">
        <table className="w-full border-collapse min-w-[700px]">
          <thead>
            <tr>
              <th className="text-left">Descrição</th>
              <th>Stake</th>
              <th>Lucro</th>
              <th>ROI</th>
              <th>Green</th>
              <th>Casa</th>
              <th>Status</th>
              <th>Data</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-400">
                  Carregando apostas...
                </td>
              </tr>
            )}
            {!loading && bets.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-400">
                  Nenhuma aposta registrada ainda. Use a calculadora e clique em "Salvar Aposta".
                </td>
              </tr>
            )}
            {!loading &&
              bets.map((bet) => {
                const profit = Number(bet.profit);
                const stake = Number(bet.total_stake);
                const pct = Number(bet.profit_percent);
                const profitColor = profit < 0 ? '#c0392b' : profit > 0 ? '#2c7a2c' : '#222';
                const date = new Date(bet.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <tr key={bet.id} className="border-b border-gray-100">
                    <td className="text-left py-2 text-xs sm:text-sm">{bet.description}</td>
                    <td className="text-center text-xs sm:text-sm">R$ {stake.toFixed(2)}</td>
                    <td className="text-center text-xs sm:text-sm" style={{ color: profitColor }}>
                      R$ {profit.toFixed(2)}
                    </td>
                    <td className="text-center text-xs sm:text-sm" style={{ color: profitColor }}>
                      {pct.toFixed(2)}%
                    </td>
                    <td className="text-center">
                      {bet.winning_outcome ? (
                        <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded">
                          {bet.winning_outcome}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="text-center">
                      {bet.bookmaker_green ? (
                        <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded flex items-center gap-1 w-fit mx-auto">
                          <Building2 size={10} />
                          {bet.bookmaker_green}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="text-center">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          bet.status === 'won'
                            ? 'bg-green-100 text-green-700'
                            : bet.status === 'lost'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {bet.status === 'won' ? 'Ganha' : bet.status === 'lost' ? 'Perdida' : 'Pendente'}
                      </span>
                    </td>
                    <td className="text-center text-sm text-gray-500">{date}</td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {bet.status === 'pending' && (
                          <>
                            <button
                              onClick={() => updateStatus(bet.id, 'won', 'Manual', '')}
                              className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                              title="Marcar como ganha"
                            >
                              Ganhou
                            </button>
                            <button
                              onClick={() => updateStatus(bet.id, 'lost')}
                              className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                              title="Marcar como perdida"
                            >
                              Perdeu
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => deleteBet(bet.id)}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-500 rounded hover:bg-gray-200 transition-colors"
                          title="Excluir"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
