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

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);

  const renderScreen = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onAddTx={() => setIsAddTxOpen(true)} />;
      case 'accounts':
        return <Accounts />;
      case 'transactions':
        return <Transactions />;
      case 'analytics':
        return <Analytics />;
      case 'settings':
        return <Settings onNavigateCategories={() => setActiveTab('categories')} />;
      case 'categories':
        return <Categories />;
      default:
        return <Dashboard onAddTx={() => setIsAddTxOpen(true)} />;
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
    </MobileLayout>
  );
}

export default App;
