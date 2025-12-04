import React from 'react';
import { User, LayoutDashboard } from 'lucide-react';

const Header = ({ currentView, setView }) => {
    const NavButton = ({ viewName, icon: Icon, label }) => (
        <button
            onClick={() => setView(viewName)}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg font-medium transition duration-150 ease-in-out ${currentView === viewName
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-indigo-600'
                }`}
        >
            <Icon size={20} />
            <span>{label}</span>
        </button>
    );

    return (
        <header className="bg-white shadow-lg sticky top-0 z-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
                {/* Top-left Logo Placeholder */}
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg">S</div>
                    <h1 className="text-2xl font-extrabold text-gray-900">Subscript</h1>
                </div>

                {/* Top-right Nav Buttons */}
                <nav className="flex space-x-2">
                    <NavButton viewName="dashboard" icon={LayoutDashboard} label="Dashboard" />
                    <NavButton viewName="profile" icon={User} label="Profile" />
                </nav>
            </div>
        </header>
    );
};

export default Header;
