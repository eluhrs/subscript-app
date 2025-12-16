import React from 'react';
import { User, LayoutDashboard, LogOut, FolderPlus } from 'lucide-react';

const Header = ({ currentView, setView, onLogout }) => {
    const NavButton = ({ viewName, icon: Icon, label, id }) => (
        <button
            id={id}
            onClick={() => setView(viewName)}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg font-medium border border-transparent transition duration-150 ease-in-out ${currentView === viewName
                ? 'bg-[#5B84B1] text-white shadow-md'
                : 'text-gray-700 hover:bg-gray-200 hover:text-[#5B84B1] hover:border-gray-400'
                }`}
        >
            <Icon size={20} />
            <span className="hidden md:inline">{label}</span>
        </button>
    );

    return (
        <header className="bg-[#D8D8D7] shadow-lg sticky top-0 z-50 border-b border-gray-500">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
                {/* Top-left Logo Placeholder */}
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-[#5B84B1] rounded-full flex items-center justify-center text-white font-bold text-lg">S</div>
                    <h1 className="text-2xl font-extrabold text-[#3A5A80]">Subscript</h1>
                </div>

                {/* Top-right Nav Buttons */}
                <nav className="flex space-x-2 items-center">
                    <NavButton viewName="dashboard" icon={LayoutDashboard} label="Dashboard" id="nav-dashboard-link" />
                    <NavButton viewName="new" icon={FolderPlus} label="Upload" id="nav-upload-link" />
                    <NavButton viewName="profile" icon={User} label="Profile" id="nav-profile-link" />
                    <button
                        onClick={onLogout}
                        className="flex items-center space-x-2 px-3 py-2 rounded-lg font-medium border border-transparent text-gray-700 hover:bg-gray-200 hover:text-red-600 hover:border-gray-400 transition duration-150 ease-in-out ml-2"
                    >
                        <LogOut size={20} />
                        <span className="hidden md:inline">Logout</span>
                    </button>
                </nav>
            </div>
        </header>
    );
};

export default Header;
