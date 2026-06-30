import { useState, useEffect, useRef } from 'react';
import MobileLayout from './components/layout/MobileLayout';
import Dashboard from './screens/Dashboard';
import Accounts from './screens/Accounts';
import Transactions from './screens/Transactions';
import Analytics from './screens/Analytics';
import Settings from './screens/Settings';
import Categories from './screens/Categories';
import Budgets from './screens/Budgets';
import BottomSheet from './components/ui/BottomSheet';
import TransactionForm from './components/transactions/TransactionForm';
import AccountForm from './components/forms/AccountForm';
import CategoryForm from './components/forms/CategoryForm';
import { accountService } from './services/accountService';
import { transactionService } from './services/transactionService';
import { categoryService } from './services/categoryService';
import { budgetService } from './services/budgetService';
import { settingsService } from './services/settingsService';
import { deepSeekService } from './services/deepSeekService';
import { ledgerEngine, LedgerValidationError } from './services/ledgerEngine';
import { sqliteService } from './services/sqliteService';
import { secretsService, SECRET_KEYS } from './services/secretsService';
import LockScreen from './components/security/LockScreen';
import { Cloud, Loader2 } from 'lucide-react';
import type { Account, Transaction, Category, UserSettings, Budget } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('Home');
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [voiceResult, setVoiceResult] = useState<string | null>(null);
  const [isProcessingTransaction, setIsProcessingTransaction] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [initialCategoryType, setInitialCategoryType] = useState<'Expense' | 'Income'>('Expense');
  const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
  const [accountToEdit, setAccountToEdit] = useState<Account | null>(null);

  // Real Data State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDbReady, setIsDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // App lock: decide once when settings first load, so toggling lock mid-session
  // doesn't lock the user out until the next launch.
  const [isLocked, setIsLocked] = useState(false);
  const lockInitialized = useRef(false);

  // Navigation State
  const [accountFilter, setAccountFilter] = useState<string | null>(null);

  // Database Initialization
  useEffect(() => {
    const initDb = async () => {
      try {
        console.log('Initializing database from App...');
        await sqliteService.initialize();
        await secretsService.seedFromEnvIfEmpty();
        console.log('Database initialized successfully from App');
        setIsDbReady(true);
      } catch (error) {
        console.error('Failed to initialize database:', error);
        setDbError(error instanceof Error ? error.message : 'Failed to initialize the local database.');
      }
    };
    initDb();
  }, []);

  useEffect(() => {
    if (!isDbReady) return;

    let accountsLoaded = false;
    let transactionsLoaded = false;
    let categoriesLoaded = false;
    let settingsLoaded = false;

    const checkLoading = () => {
      if (accountsLoaded && transactionsLoaded && categoriesLoaded && settingsLoaded) {
        setIsLoading(false);
      }
    };

    // Subscribe to all services
    const unsubAccounts = accountService.subscribeToAccounts((data) => {
      setAccounts(data);
      accountsLoaded = true;
      checkLoading();
    });
    const unsubTransactions = transactionService.subscribeToTransactions((data) => {
      setTransactions(data);
      transactionsLoaded = true;
      checkLoading();
    });
    const unsubCategories = categoryService.subscribeToCategories((data) => {
      setCategories(data);
      categoriesLoaded = true;
      checkLoading();
    });

    const unsubBudgets = budgetService.subscribeToBudgets((data) => {
      setBudgets(data);
    });

    const unsubSettings = settingsService.subscribeToSettings((data) => {
      setSettings(data);
      settingsLoaded = true;
      checkLoading();
    });

    return () => {
      unsubAccounts();
      unsubTransactions();
      unsubCategories();
      unsubBudgets();
      unsubSettings();
    };
  }, [isDbReady]);

  // Apply theme: toggle the `dark` class on <html> based on the setting.
  useEffect(() => {
    const theme = settings?.theme || 'system';
    const apply = () => {
      const isDark = theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);
    };
    apply();
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [settings?.theme]);

  useEffect(() => {
    if (!settings || lockInitialized.current) return;
    lockInitialized.current = true;
    if (settings.appLockEnabled && settings.appPin) {
      setIsLocked(true);
    }
  }, [settings]);

  const handleVoiceResult = (text: string) => {
    setVoiceResult(text);
    setProcessingError(null);
  };

  const handleProcessTransaction = async () => {
    if (!voiceResult || !settings) return;

    setIsProcessingTransaction(true);
    setProcessingError(null);

    try {
      // Check for DeepSeek API key (secure storage)
      const deepSeekApiKey = await secretsService.getKey(SECRET_KEYS.deepSeek);
      if (!deepSeekApiKey) {
        throw new Error("DeepSeek API Key not configured. Please add it in Settings.");
      }

      // Parse with DeepSeek
      const accountNames = accounts.map(a => a.name);
      const categoryNames = categories.map(c => c.name);
      const parsed = await deepSeekService.parseTransaction(
        voiceResult,
        deepSeekApiKey,
        accountNames,
        categoryNames
      );

      // Process with Ledger Engine
      await ledgerEngine.processTransaction(parsed, accounts, categories);

      // Success!
      setVoiceResult(null);
      setProcessingError(null);
    } catch (error) {
      console.error("Transaction processing error:", error);
      if (error instanceof LedgerValidationError) {
        setProcessingError(error.message);
      } else if (error instanceof Error) {
        setProcessingError(error.message);
      } else {
        setProcessingError("Failed to process transaction. Please try again.");
      }
    } finally {
      setIsProcessingTransaction(false);
    }
  };

  const handleViewAccountHistory = (accountId: string) => {
    setAccountFilter(accountId);
    setActiveTab('History');
  };

  const handleEditTransaction = (tx: Transaction) => {
    setTransactionToEdit(tx);
    setIsAddTxOpen(true);
  };

  const handleEditAccount = (account: Account) => {
    setAccountToEdit(account);
    setIsAddAccountOpen(true);
  };

  const renderScreen = () => {
    switch (activeTab) {
      case 'Home':
        return (
          <Dashboard
            onAddTx={() => {
              setTransactionToEdit(null);
              setIsAddTxOpen(true);
            }}
            onEditTx={handleEditTransaction}
            onViewAll={() => setActiveTab('History')}
            onVoiceResult={handleVoiceResult}
            accounts={accounts}
            transactions={transactions}
            categories={categories}
            settings={settings}
          />
        );
      case 'Accounts':
        return (
          <Accounts
            accounts={accounts}
            transactions={transactions}
            categories={categories}
            onAddAccount={() => {
              setAccountToEdit(null);
              setIsAddAccountOpen(true);
            }}
            onEditAccount={handleEditAccount}
            onViewHistory={handleViewAccountHistory}
            settings={settings}
          />
        );
      case 'History':
        return (
          <Transactions
            categories={categories}
            accounts={accounts}
            accountFilter={accountFilter}
            setAccountFilter={setAccountFilter}
            settings={settings}
            onEditTx={handleEditTransaction}
          />
        );
      case 'Insights':
        return <Analytics categories={categories} settings={settings} />;
      case 'Settings':
        return (
          <Settings
            onNavigateCategories={() => setActiveTab('Categories')}
            onNavigateBudgets={() => setActiveTab('Budgets')}
            settings={settings}
          />
        );
      case 'Budgets':
        return <Budgets budgets={budgets} categories={categories} settings={settings} />;
      case 'Categories':
        return (
          <Categories
            categories={categories}
            transactions={transactions}
            onAddCategory={(type) => {
              setInitialCategoryType(type);
              setIsAddCategoryOpen(true);
            }}
          />
        );
      default:
        return (
          <Dashboard
            onAddTx={() => {
              setTransactionToEdit(null);
              setIsAddTxOpen(true);
            }}
            onEditTx={handleEditTransaction}
            onViewAll={() => setActiveTab('History')}
            onVoiceResult={handleVoiceResult}
            accounts={accounts}
            transactions={transactions}
            categories={categories}
            settings={settings}
          />
        );
    }
  };

  if (dbError) {
    return (
      <div className="h-[100dvh] w-full bg-bg-primary flex flex-col items-center justify-center p-8 gap-6 text-center max-w-[500px] mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-expense/10 text-expense flex items-center justify-center">
          <Loader2 className="text-expense" size={30} />
        </div>
        <div>
          <h2 className="text-xl font-bold mb-2">Database unavailable</h2>
          <p className="text-text-muted text-[14px]">Couldn't open the local database.</p>
          <p className="text-text-muted text-[12px] mt-3 font-mono break-words opacity-70">{dbError}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-primary text-white rounded-2xl font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-95 transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading || !isDbReady) {
    return (
      <div className="h-[100dvh] w-full bg-bg-primary flex flex-col items-center justify-center p-8 gap-6">
        <Loader2 className="animate-spin text-primary" size={48} />
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Smart Ledger</h2>
          <p className="text-text-muted text-[14px]">Initializing local database...</p>
        </div>
      </div>
    );
  }

  if (isLocked && settings?.appPin) {
    return <LockScreen pin={settings.appPin} onUnlock={() => setIsLocked(false)} />;
  }

  return (
    <>
      <MobileLayout
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      >
        <div className="flex items-center gap-2 mb-2 px-1">
          <Cloud size={12} className="text-primary" />
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
            Local Storage Mode
          </span>
        </div>
        {renderScreen()}
      </MobileLayout>

      <BottomSheet
        isOpen={isAddTxOpen}
        onClose={() => {
          setIsAddTxOpen(false);
          setTransactionToEdit(null);
        }}
        title={transactionToEdit ? "Edit Transaction" : "Add Transaction"}
      >
        <TransactionForm
          onSuccess={() => {
            setIsAddTxOpen(false);
            setTransactionToEdit(null);
          }}
          accounts={accounts}
          categories={categories}
          transactionToEdit={transactionToEdit}
        />
      </BottomSheet>

      <BottomSheet
        isOpen={!!voiceResult}
        onClose={() => {
          setVoiceResult(null);
          setProcessingError(null);
        }}
        title="Voice Transcription"
      >
        <div className="flex flex-col gap-6 py-4">
          <div className="bg-bg-primary p-6 rounded-2xl border border-black/5 min-h-[120px] flex items-center justify-center text-center">
            <p className="text-[17px] font-semibold text-text-primary leading-relaxed italic">
              "{voiceResult}"
            </p>
          </div>

          {processingError && (
            <div className="bg-expense/10 border border-expense/20 p-4 rounded-2xl">
              <p className="text-[13px] font-semibold text-expense">{processingError}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              onClick={handleProcessTransaction}
              disabled={isProcessingTransaction}
              className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-[15px] shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessingTransaction ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Processing...
                </>
              ) : (
                'Process Transaction'
              )}
            </button>
            <button
              onClick={() => {
                setVoiceResult(null);
                setProcessingError(null);
              }}
              className="w-full py-3 bg-bg-secondary text-text-secondary rounded-2xl font-semibold text-[14px] active:scale-95 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        isOpen={isAddAccountOpen}
        onClose={() => {
          setIsAddAccountOpen(false);
          setAccountToEdit(null);
        }}
        title={accountToEdit ? "Edit Account" : "New Account"}
      >
        <AccountForm
          key={accountToEdit?.id || 'new'}
          onSuccess={() => {
            setIsAddAccountOpen(false);
            setAccountToEdit(null);
          }}
          accounts={accounts}
          accountToEdit={accountToEdit}
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
          initialType={initialCategoryType}
        />
      </BottomSheet>
    </>
  );
};

export default App;
