import React, { useState } from 'react';
import LoginScreen from './components/LoginScreen';
import Header from './components/Header';
import DashboardScreen from './components/DashboardScreen';
import ProfileScreen from './components/ProfileScreen';
import NewDocumentScreen from './components/NewDocumentScreen';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'profile', 'new'

  // If not authenticated, show the Login screen
  if (!isAuthenticated) {
    return <LoginScreen setIsAuthenticated={setIsAuthenticated} />;
  }

  // If authenticated, show the main layout
  return (
    <div className="min-h-screen bg-gray-50 font-sans antialiased">
      <Header currentView={currentView} setView={setCurrentView} />

      <main className="pb-10">
        {currentView === 'dashboard' && <DashboardScreen setView={setCurrentView} />}
        {currentView === 'profile' && <ProfileScreen setView={setCurrentView} />}
        {currentView === 'new' && <NewDocumentScreen setView={setCurrentView} />}
      </main>
    </div>
  );
}

export default App;
