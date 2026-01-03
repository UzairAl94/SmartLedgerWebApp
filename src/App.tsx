import { useState } from 'react';
import MobileLayout from './components/layout/MobileLayout';
import Dashboard from './screens/Dashboard';
import Accounts from './screens/Accounts';
import Transactions from './screens/Transactions';
import Analytics from './screens/Analytics';
import Settings from './screens/Settings';
import Categories from './screens/Categories';
import BottomSheet from './components/ui/BottomSheet';
import TransactionForm from './components/transactions/TransactionForm';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('Home');
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [voiceResult, setVoiceResult] = useState<string | null>(null);

  const handleVoiceResult = (text: string) => {
    setVoiceResult(text);
  };

  const renderScreen = () => {
    switch (activeTab) {
      case 'Home':
        return <Dashboard onAddTx={() => setIsAddTxOpen(true)} onVoiceResult={handleVoiceResult} />;
      case 'Accounts':
        return <Accounts />;
      case 'History':
        return <Transactions />;
      case 'Insights':
        return <Analytics />;
      case 'Settings':
        return <Settings onNavigateCategories={() => setActiveTab('Categories')} />;
      case 'Categories':
        return <Categories />;
      default:
        return <Dashboard onAddTx={() => setIsAddTxOpen(true)} onVoiceResult={handleVoiceResult} />;
    }
  };

  return (
    <MobileLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderScreen()}

      <BottomSheet
        isOpen={isAddTxOpen}
        onClose={() => setIsAddTxOpen(false)}
        title="Add Transaction"
      >
        <TransactionForm onSuccess={() => setIsAddTxOpen(false)} />
      </BottomSheet>

      <BottomSheet
        isOpen={!!voiceResult}
        onClose={() => setVoiceResult(null)}
        title="Voice Transcription"
      >
        <div className="flex flex-col gap-6 py-4">
          <div className="bg-bg-primary p-6 rounded-2xl border border-black/5 min-h-[120px] flex items-center justify-center text-center">
            <p className="text-[17px] font-semibold text-text-primary leading-relaxed italic">
              "{voiceResult}"
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-text-muted font-medium px-1">
              This is what I heard. In the future, I'll be able to parse this into a transaction!
            </p>
            <button
              onClick={() => setVoiceResult(null)}
              className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-95 transition-all"
            >
              Got it
            </button>
          </div>
        </div>
      </BottomSheet>
    </MobileLayout>
  );
};

export default App;
