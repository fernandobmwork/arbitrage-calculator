import { useEffect, useState } from 'react';
import { Calculator, LayoutDashboard, ImagePlus } from 'lucide-react';
import ArbitrageCalculator from './ArbitrageCalculator';
import Dashboard from './Dashboard';
import CaptureTicket from './CaptureTicket';
import { type CalculatorState, createDefaultState } from './calc';
import { supabase, type Match } from './supabase';

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
    { id: 'capture', label: 'Capturar bilhete', icon: ImagePlus },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ];

  return (
    <div className="min-h-screen bg-white text-[#222]">
      <nav className="bg-[#1c1c1e] text-white px-3 sm:px-6 py-3 flex items-center gap-2 sm:gap-6 sticky top-0 z-50 overflow-x-auto">
        <span className="font-semibold text-lg flex items-center gap-2 whitespace-nowrap">
          <Calculator size={20} />
          Arbitragem Pro
        </span>
        <div className="flex gap-1 ml-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                  tab === t.id ? 'bg-[#2c2c2e] text-white' : 'text-gray-400 hover:text-white hover:bg-[#2c2c2e]/50'
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="p-5 max-w-[1300px] mx-auto text-[16px]">
        {tab === 'calculator' && (
          <ArbitrageCalculator
            state={calcState}
            setState={setCalcState}
            selectedMatch={selectedMatch}
            setSelectedMatch={setSelectedMatch}
            onBetSaved={triggerRefresh}
          />
        )}
        {tab === 'capture' && <CaptureTicket onSaved={triggerRefresh} />}
        {tab === 'dashboard' && <Dashboard refreshKey={refreshKey} />}
      </div>
    </div>
  );
}
