import { useState, useEffect } from 'react';
import MobileLayout from './components/layout/MobileLayout';
import Dashboard from './screens/Dashboard';
import Accounts from './screens/Accounts';
import Transactions from './screens/Transactions';
import Analytics from './screens/Analytics';
import Settings from './screens/Settings';
import Categories from './screens/Categories';
import BottomSheet from './components/ui/BottomSheet';
import TransactionForm from './components/transactions/TransactionForm';
import AccountForm from './components/forms/AccountForm';
import CategoryForm from './components/forms/CategoryForm';
import { accountService } from './services/accountService';
import { transactionService } from './services/transactionService';
import { categoryService } from './services/categoryService';
import { settingsService } from './services/settingsService';
import { Cloud } from 'lucide-react';
import type { Account, Transaction, Category, UserSettings } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('Home');
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [voiceResult, setVoiceResult] = useState<string | null>(null);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);

  // Real Data State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Navigation State
  const [accountFilter, setAccountFilter] = useState<string | null>(null);

  useEffect(() => {
    let accountsLoaded = false;
    let transactionsLoaded = false;
    let categoriesLoaded = false;
    let settingsLoaded = false;

    const checkLoading = () => {
      if (accountsLoaded && transactionsLoaded && categoriesLoaded && settingsLoaded) {
        setIsLoading(false);
      }
    };

    // Subscribe to all collections
    const unsubAccounts = accountService.subscribeToAccounts((data) => {
      setAccounts(data);
      accountsLoaded = true;
      checkLoading();
      setIsSyncing(true);
      setTimeout(() => setIsSyncing(false), 2000);
    });
    const unsubTransactions = transactionService.subscribeToTransactions((data) => {
      setTransactions(data);
      transactionsLoaded = true;
      checkLoading();
      setIsSyncing(true);
      setTimeout(() => setIsSyncing(false), 2000);
    });
    const unsubCategories = categoryService.subscribeToCategories((data) => {
      setCategories(data);
      categoriesLoaded = true;
      checkLoading();
      setIsSyncing(true);
      setTimeout(() => setIsSyncing(false), 2000);
    });

    const unsubSettings = settingsService.subscribeToSettings((data) => {
      setSettings(data);
      settingsLoaded = true;
      checkLoading();
      setIsSyncing(true);
      setTimeout(() => setIsSyncing(false), 2000);
    });

    return () => {
      unsubAccounts();
      unsubTransactions();
      unsubCategories();
      unsubSettings();
    };
  }, []);

  const handleVoiceResult = (text: string) => {
    setVoiceResult(text);
  };

  const handleViewAccountHistory = (accountId: string) => {
    setAccountFilter(accountId);
    setActiveTab('History');
  };

  const renderScreen = () => {
    switch (activeTab) {
      case 'Home':
        return (
          <Dashboard
            onAddTx={() => setIsAddTxOpen(true)}
            onViewAll={() => setActiveTab('History')}
            onVoiceResult={handleVoiceResult}
            accounts={accounts}
            transactions={transactions}
            categories={categories}
          />
        );
      case 'Accounts':
        return (
          <Accounts
            accounts={accounts}
            transactions={transactions}
            categories={categories}
            onAddAccount={() => setIsAddAccountOpen(true)}
            onViewHistory={handleViewAccountHistory}
          />
        );
      case 'History':
        return (
          <Transactions
            transactions={transactions}
            categories={categories}
            accounts={accounts}
            accountFilter={accountFilter}
            setAccountFilter={setAccountFilter}
          />
        );
      case 'Insights':
        return <Analytics transactions={transactions} categories={categories} />;
      case 'Settings':
        return <Settings onNavigateCategories={() => setActiveTab('Categories')} settings={settings} />;
      case 'Categories':
        return (
          <Categories
            categories={categories}
            transactions={transactions}
            onAddCategory={() => setIsAddCategoryOpen(true)}
          />
        );
      default:
        return (
          <Dashboard
            onAddTx={() => setIsAddTxOpen(true)}
            onViewAll={() => setActiveTab('History')}
            onVoiceResult={handleVoiceResult}
            accounts={accounts}
            transactions={transactions}
            categories={categories}
          />
        );
    }
  };

  if (isLoading) {
    return (
      <div className="h-[100dvh] w-full bg-bg-primary flex flex-col items-center justify-center p-8 gap-6">
        <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Smart Ledger</h2>
          <p className="text-text-muted text-[14px]">Syncing with your cloud database...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <MobileLayout
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      >
        <div className="flex items-center gap-2 mb-2 px-1">
          <Cloud size={12} className={`text-income ${isSyncing ? 'animate-bounce' : 'animate-pulse'}`} />
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
            {isSyncing ? 'Syncing...' : 'Live Sync Enabled'}
          </span>
        </div>
        {renderScreen()}
      </MobileLayout>

      <BottomSheet
        isOpen={isAddTxOpen}
        onClose={() => setIsAddTxOpen(false)}
        title="Add Transaction"
      >
        <TransactionForm
          onSuccess={() => setIsAddTxOpen(false)}
          accounts={accounts}
          categories={categories}
        />
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

      <BottomSheet
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        title="New Account"
      >
        <AccountForm
          onSuccess={() => setIsAddAccountOpen(false)}
          accounts={accounts}
        />
      </BottomSheet>

      <BottomSheet
        isOpen={isAddCategoryOpen}
        onClose={() => setIsAddCategoryOpen(false)}
        title="New Category"
      >
        <CategoryForm
          onSuccess={() => setIsAddCategoryOpen(false)}
          categories={categories}
        />
      </BottomSheet>
    </>
  );
};

export default App;
