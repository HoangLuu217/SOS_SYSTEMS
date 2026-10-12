import { useState } from 'react';
import { AdminPortal } from './components/admin/AdminPortal';
import { AuthorPortal } from './components/author/AuthorPortal';
import { LoginPage } from './components/LoginPage';
import { AppProvider } from './context/AppContext';
import { domainDService } from './services/domainDService';
import './App.css';

type PortalView = 'admin' | 'author' | 'login';

function MainRouter() {
  const [currentView, setCurrentView] = useState<PortalView>(() => {
    const saved = localStorage.getItem('sos_active_portal');
    if (saved === 'admin' || saved === 'author' || saved === 'login') return saved;
    // Check if logged in user is admin
    const storedUser = localStorage.getItem('sos_auth_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed.roles?.includes('ADMIN')) return 'admin';
        return 'author';
      } catch {
        // Fallback
      }
    }
    return 'author';
  });

  const handleSwitchPortal = (target: PortalView) => {
    setCurrentView(target);
    localStorage.setItem('sos_active_portal', target);
    if (target === 'admin') {
      domainDService.setActiveOfficer('officer-admin-01');
    } else if (target === 'author') {
      domainDService.setActiveOfficer('officer-hc-htd');
    }
  };

  if (currentView === 'login') {
    return (
      <LoginPage
        onEnterConsole={(targetPortal) => {
          handleSwitchPortal(targetPortal || 'author');
        }}
      />
    );
  }

  if (currentView === 'admin') {
    return (
      <AdminPortal
        onSwitchToAuthor={() => handleSwitchPortal('author')}
        onLogout={() => handleSwitchPortal('login')}
      />
    );
  }

  return (
    <AuthorPortal
      onSwitchToAdmin={() => handleSwitchPortal('admin')}
      onLogout={() => handleSwitchPortal('login')}
    />
  );
}

function App() {
  return (
    <AppProvider>
      <MainRouter />
    </AppProvider>
  );
}

export default App;
