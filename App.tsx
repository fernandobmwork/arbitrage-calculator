import { useEffect, useState } from 'react';
import { Calculator, LayoutDashboard, ScanSearch } from 'lucide-react';
import ArbitrageCalculator from '@/components/ArbitrageCalculator';
import Dashboard from '@/components/Dashboard';
import TicketCapture from '@/TicketCapture';
import { type CalculatorState, createDefaultState } from '@/lib/calc';
import { supabase, type Match } from '@/lib/supabase';

type Tab = 'calculator' | 'capture' | 'dashboard';

export default function App() {
  const [tab, setTab] = useState<Tab>('calculator');
  const [calcState, setCalcState] = useState<CalculatorState>(createDefaultState());
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    const invokeSync = async () => {
      try {
        await supabase.functions.invoke('update-results');
        setRefreshKey((k) => k + 1);
      } catch {
        // Keep the current data if the automatic sync is temporarily unavailable.
      }
    };

    void invokeSync();
    const timer = window.setInterval(() => void invokeSync(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const tabs: { id: Tab; label: string; icon: typeof Calculator }[] = [
    { id: 'calculator', label: 'Calculadora', icon: Calculator },
    { id: 'capture', label: 'Capturar', icon: ScanSearch },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ];

  const renderTabButton = (t: (typeof tabs)[number], mobile = false) => {
    const Icon = t.icon;
    const active = tab === t.id;

    return (
      <button
        key={t.id}
        onClick={() => setTab(t.id)}
        aria-current={active ? 'page' : undefined}
        className={mobile
          ? `flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors ${active ? 'text-white' : 'text-gray-400'}`
          : `px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${active ? 'bg-[#2c2c2e] text-white' : 'text-gray-400 hover:text-white hover:bg-[#2c2c2e]/50'}`}
      >
        <Icon size={mobile ? 20 : 16} />
        <span>{t.label}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-white text-[#222] pb-20 md:pb-0">
      <nav className="sticky top-0 z-50 hidden bg-[#1c1c1e] px-6 py-3 text-white md:flex md:items-center md:gap-6">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <Calculator size={20} />
          Arbitragem Pro
        </span>
        <div className="ml-auto flex gap-1">
          {tabs.map((t) => renderTabButton(t))}
        </div>
      </nav>

      <div className="mx-auto max-w-[1300px] p-4 text-[16px] sm:p-5">
        {tab === 'calculator' && (
          <ArbitrageCalculator
            state={calcState}
            setState={setCalcState}
            selectedMatch={selectedMatch}
            setSelectedMatch={setSelectedMatch}
            onBetSaved={triggerRefresh}
          />
        )}
        {tab === 'capture' && <TicketCapture onSaved={triggerRefresh} />}
        {tab === 'dashboard' && <Dashboard refreshKey={refreshKey} />}
      </div>

      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#1c1c1e] text-white shadow-[0_-4px_16px_rgba(0,0,0,0.18)] md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex h-16 max-w-md items-stretch px-2">
          {tabs.map((t) => renderTabButton(t, true))}
        </div>
      </nav>
    </div>
  );
}
