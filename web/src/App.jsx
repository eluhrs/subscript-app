import React, { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen';
import RegisterScreen from './components/RegisterScreen';
import Header from './components/Header';
import DashboardScreen from './components/DashboardScreen';
import ProfileScreen from './components/ProfileScreen';
import NewDocumentScreen from './components/NewDocumentScreen';
import PageEditorScreen from './components/PageEditorScreen';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'profile', 'new', 'login', 'register', 'page-editor'
  const [editorDocId, setEditorDocId] = useState(null); // ID of document being edited

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
    } else {
      // Check if URL indicates registration (e.g. /register or ?token=...)
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);

      if (path === '/register' || params.get('token')) {
        setCurrentView('register');
      } else {
        setCurrentView('login');
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    setCurrentView('login');
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      handleLogout();
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  // If not authenticated, show the Login or Register screen
  if (!isAuthenticated) {
    if (currentView === 'register') {
      return <RegisterScreen setView={setCurrentView} />;
    }
    return <LoginScreen setIsAuthenticated={setIsAuthenticated} setView={setCurrentView} />;
  }

  // If authenticated, show the main layout
  return (
    <div className="min-h-screen bg-[#e5e5e5] font-sans antialiased">
      <Header currentView={currentView} setView={setCurrentView} onLogout={handleLogout} />

      <main className="pb-10">
        {currentView === 'dashboard' && <DashboardScreen setView={setCurrentView} setEditorDocId={setEditorDocId} />}
        {currentView === 'profile' && <ProfileScreen setView={setCurrentView} />}
        {currentView === 'new' && <NewDocumentScreen setView={setCurrentView} />}
        {currentView === 'page-editor' && <PageEditorScreen docId={editorDocId} setView={setCurrentView} />}
      </main>
    </div>
  );
}

export default App;
