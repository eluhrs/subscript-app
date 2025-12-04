import React, { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen';
import RegisterScreen from './components/RegisterScreen';
import Header from './components/Header';
import DashboardScreen from './components/DashboardScreen';
import ProfileScreen from './components/ProfileScreen';
import NewDocumentScreen from './components/NewDocumentScreen';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'profile', 'new', 'login', 'register'

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
    } else {
      setCurrentView('login');
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    setCurrentView('login');
  };

  // If not authenticated, show the Login or Register screen
  if (!isAuthenticated) {
    if (currentView === 'register') {
      return <RegisterScreen setView={setCurrentView} />;
    }
    return <LoginScreen setIsAuthenticated={setIsAuthenticated} setView={setCurrentView} />;
  }

  // If authenticated, show the main layout
  return (
    <div className="min-h-screen bg-gray-50 font-sans antialiased">
      <Header currentView={currentView} setView={setCurrentView} onLogout={handleLogout} />

      <main className="pb-10">
        {currentView === 'dashboard' && <DashboardScreen setView={setCurrentView} />}
        {currentView === 'profile' && <ProfileScreen setView={setCurrentView} />}
        {currentView === 'new' && <NewDocumentScreen setView={setCurrentView} />}
      </main>
    </div>
  );
}

export default App;
