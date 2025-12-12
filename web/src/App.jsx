import React, { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import LoginScreen from './components/LoginScreen';
import RegisterScreen from './components/RegisterScreen';
import Header from './components/Header';
import DashboardScreen from './components/DashboardScreen';
import ProfileScreen from './components/ProfileScreen';
import AdvancedUploadScreen from './components/AdvancedUploadScreen';
import PageEditorScreen from './components/PageEditorScreen';
import ConfirmationModal from './components/ConfirmationModal';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'profile', 'new', 'login', 'register', 'page-editor'
  const [editorDocId, setEditorDocId] = useState(null); // ID of document being edited
  const [showSessionWarning, setShowSessionWarning] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
      checkTokenExpiration(token);
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

  // Session Expiration Check
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      const token = localStorage.getItem('token');
      if (token) {
        checkTokenExpiration(token);
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const checkTokenExpiration = (token) => {
    try {
      const decoded = jwtDecode(token);
      const currentTime = Date.now() / 1000;
      const timeLeft = decoded.exp - currentTime;

      // Warn if less than 2 minutes remaining (120 seconds)
      // But don't show if already expired (the auth event listener will handle that)
      if (timeLeft < 120 && timeLeft > 0) {
        setShowSessionWarning(true);
      }
    } catch (error) {
      console.error("Invalid token", error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    setCurrentView('login');
    setShowSessionWarning(false);
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
        {currentView === 'new' && <AdvancedUploadScreen setView={setCurrentView} />}
        {currentView === 'page-editor' && <PageEditorScreen docId={editorDocId} setView={setCurrentView} />}
      </main>

      {/* Session Warning Modal */}
      <ConfirmationModal
        isOpen={showSessionWarning}
        onClose={() => setShowSessionWarning(false)}
        title="Session Expiring"
        message="Your session will expire in less than 2 minutes. Please save your work."
        singleButton={true}
        confirmText="OK"
        type="warning"
      />
    </div>
  );
}

export default App;
