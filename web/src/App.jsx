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
import { useAppTour } from './hooks/useAppTour';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'profile', 'new', 'login', 'register', 'page-editor'
  const [editorDocId, setEditorDocId] = useState(null); // ID of document being edited
  const [showSessionWarning, setShowSessionWarning] = useState(false);

  const { startTour, hasSeenTour } = useAppTour();

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

  // Auto-start Tour for new users (authenticated or not? Usually authenticated makes sense, but the tour explains the tool.
  // Let's start it ONLY if authenticated OR if we want to show it on login?
  // Our tour highlights dashboard, so we should wait until authenticated.
  useEffect(() => {
    if (isAuthenticated && !hasSeenTour && currentView === 'dashboard') {
      // Slight delay to ensure DOM is ready
      setTimeout(() => startTour(), 1000);
    }
  }, [isAuthenticated, hasSeenTour, currentView]);

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

  // Track user activity
  const lastActive = React.useRef(Date.now());

  useEffect(() => {
    const updateActivity = () => {
      lastActive.current = Date.now();
    };

    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('click', updateActivity);

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('click', updateActivity);
    };
  }, []);

  const handleTokenRefresh = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.access_token);
        setShowSessionWarning(false);
        // Check again after refresh to clear states if needed
        checkTokenExpiration(data.access_token);
      } else {
        handleLogout();
      }
    } catch (error) {
      console.error("Refresh failed", error);
      handleLogout();
    }
  };

  const checkTokenExpiration = (token) => {
    try {
      const decoded = jwtDecode(token);
      const currentTime = Date.now() / 1000;
      const timeLeft = decoded.exp - currentTime;
      const idleTimeSeconds = (Date.now() - lastActive.current) / 1000;

      // Auto-refresh if active and token is getting old (less than 5 mins left)
      if (timeLeft < 300 && timeLeft > 0 && idleTimeSeconds < 120) {
        handleTokenRefresh();
        return;
      }

      // Warn if idle and less than 2 minutes remaining (120 seconds)
      if (timeLeft < 120 && timeLeft > 0) {
        setShowSessionWarning(true);
      }
    } catch (error) {
      console.error("Invalid token", error);
      handleLogout();
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
        onClose={() => handleTokenRefresh()}
        title="Session Expiring"
        message="Your session will expire in less than 2 minutes. Please save your work."
        singleButton={true}
        confirmText="OK"
        type="warning"
      />

      {/* Tour Phantom Target (Centered) */}
      <div id="tour-phantom-trigger" style={{ height: 1, width: 1, position: 'fixed', top: '50%', left: '50%', pointerEvents: 'none' }} />
    </div>
  );
}

export default App;
