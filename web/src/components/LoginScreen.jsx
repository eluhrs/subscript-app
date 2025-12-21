import React, { useState, useEffect, useRef } from 'react';
import { RefreshCcw, User, Lock, Mail } from 'lucide-react';

const LoginScreen = ({ setIsAuthenticated, setView, initialTab = 'lehigh' }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(initialTab); // Use initialTab prop
    const usernameInputRef = useRef(null);

    // Auto-focus when switching tabs
    useEffect(() => {
        if (usernameInputRef.current) {
            usernameInputRef.current.focus();
        }
    }, [activeTab]);

    // Sync state with prop if it changes (e.g. navigation)
    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    // System Status
    const [isSystemOpen, setIsSystemOpen] = useState(false); // Default to closed for safety until fetched
    const [isLdapEnabled, setIsLdapEnabled] = useState(true); // Default to true so tabs exist initially

    useEffect(() => {
        const fetchSystemStatus = async () => {
            try {
                const response = await fetch('/api/system/status');
                if (response.ok) {
                    const data = await response.json();
                    setIsSystemOpen(data.registration_mode === 'open');
                    setIsLdapEnabled(data.ldap_enabled !== false); // Default true if missing
                }
            } catch (error) {
                console.error("Failed to fetch system status", error);
            }
        };
        fetchSystemStatus();
    }, []);

    // Force 'guest' tab if LDAP is disabled
    useEffect(() => {
        if (!isLdapEnabled) {
            setActiveTab('guest');
        }
    }, [isLdapEnabled]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            const response = await fetch('/api/auth/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData,
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Invalid credentials provided. Please try again.');
            }

            const data = await response.json();
            localStorage.setItem('token', data.access_token);
            setIsAuthenticated(true);
            setView('dashboard'); // Explicitly switch to dashboard view to prevent empty render
        } catch (err) {
            setError(err.message || 'Invalid credentials provided. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen relative flex flex-col justify-center items-center p-4 font-sans">
            {/* Background Image & Overlay */}
            <div
                className="absolute inset-0 z-0 bg-cover blur-sm scale-105"
                style={{ backgroundImage: "url('/background.jpg')", backgroundPosition: 'center 25%' }}
            ></div>
            <div className="absolute inset-0 z-0 bg-black/80"></div>

            {/* Login Card */}
            <div className="bg-[#EDEDEB] rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 flex flex-col relative z-10">
                <div className="pt-8 px-8 pb-6 flex-1 flex flex-col">
                    <form className="view-login flex flex-col" onSubmit={handleLogin}>
                        <div className="text-center mb-0">
                            <h1 className="text-3xl font-extrabold text-[#3A5A80]">Subscript</h1>
                            {/* Fixed Height Subtitle */}
                            <p className="text-gray-500 text-sm mt-2 mb-6 h-5 flex items-center justify-center">Historical Document Transcription Platform</p>
                        </div>

                        {/* Tabs Block - Only show if LDAP enabled */}
                        {isLdapEnabled && (
                            <div className="flex border-b border-gray-200 mb-10 shrink-0 h-[50px]">
                                <div
                                    className={`flex-1 py-3 px-4 text-center font-bold border-b-2 cursor-pointer tab-btn transition-colors ${activeTab === 'lehigh' ? 'text-lehigh border-lehigh' : 'text-gray-500 border-transparent font-medium hover:text-gray-700'}`}
                                    onClick={() => { setActiveTab('lehigh'); setError(''); }}
                                >
                                    Lehigh Login
                                </div>
                                <div
                                    className={`flex-1 py-3 px-4 text-center font-bold border-b-2 cursor-pointer tab-btn transition-colors ${activeTab === 'guest' ? 'text-brand-blue border-brand-blue' : 'text-gray-500 border-transparent font-medium hover:text-gray-700'}`}
                                    onClick={() => { setActiveTab('guest'); setError(''); }}
                                >
                                    Guest Access
                                </div>
                            </div>
                        )}

                        <div className="space-y-4 shrink-0">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1 label-user">
                                    {activeTab === 'lehigh' ? 'Username' : 'Email Address'}
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        {activeTab === 'lehigh'
                                            ? <User className="h-5 w-5 text-gray-400" />
                                            : <Mail className="h-5 w-5 text-gray-400" />
                                        }
                                    </div>
                                    <input
                                        type={activeTab === 'lehigh' ? "text" : "email"}
                                        placeholder={activeTab === 'lehigh' ? "Lehigh UserID" : "name@example.com"}
                                        ref={usernameInputRef}
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className={`block w-full py-3 pl-10 pr-3 transition-colors duration-200 border border-gray-300 rounded-lg input-user outline-none focus:ring-2 focus:ring-offset-0 ${activeTab === 'lehigh' ? 'focus:ring-lehigh/50 !focus:border-lehigh' : 'focus:ring-brand-blue/50 !focus:border-brand-blue'}`}
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className={`block w-full py-3 pl-10 pr-3 transition-colors duration-200 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-offset-0 ${activeTab === 'lehigh' ? 'focus:ring-lehigh/50 !focus:border-lehigh' : 'focus:ring-brand-blue/50 !focus:border-brand-blue'}`}
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 mb-4 shrink-0">
                            <button
                                type="submit"
                                disabled={loading}
                                className={`w-full py-3 px-4 rounded-lg font-semibold text-white btn-submit transition-transform active:scale-[0.98] flex justify-center items-center ${activeTab === 'lehigh' ? 'bg-lehigh' : 'bg-brand-blue'} ${loading ? 'opacity-80' : ''}`}
                            >
                                {loading ? <RefreshCcw className="animate-spin h-5 w-5" /> : 'Sign In'}
                            </button>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-center border-t border-gray-200 mt-2">
                            <div className="text-center w-full min-h-[72px] flex flex-col justify-center items-center relative">
                                {error ? (
                                    /* Error State */
                                    <div className="w-full bg-red-100 border border-red-400 text-red-700 p-2 rounded text-sm shadow-sm leading-tight h-[60px] flex items-center justify-center">
                                        <span>{error}</span>
                                    </div>
                                ) : (
                                    /* Normal State Container */
                                    <div className="normal-state w-full h-full flex flex-col justify-center items-center">
                                        {isSystemOpen ? (
                                            <p className="text-sm text-gray-600 system-open-msg">
                                                Don't have an account? <span onClick={() => setView('register')} className="text-brand-blue font-bold hover:underline cursor-pointer">Sign up</span>
                                            </p>
                                        ) : (
                                            <p className="text-sm text-gray-500 italic system-closed-msg">
                                                Accounts are by invitation only.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
