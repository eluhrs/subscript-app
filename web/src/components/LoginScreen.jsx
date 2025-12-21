import React, { useState, useEffect } from 'react';
import { RefreshCcw, User, Lock, Mail, AlertCircle } from 'lucide-react';

const LoginScreen = ({ setIsAuthenticated, setView, initialTab = 'lehigh' }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(initialTab); // Use initialTab prop
    const usernameInputRef = React.useRef(null);

    // Auto-focus when switching tabs
    React.useEffect(() => {
        if (usernameInputRef.current) {
            usernameInputRef.current.focus();
        }
    }, [activeTab]);

    // Sync state with prop if it changes (e.g. navigation)
    React.useEffect(() => {
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

    // Colors
    const COLORS = {
        lehigh: {
            // Desaturated Brown matching provided image
            primary: '#6F5F58',
            hover: '#5A4D47',
            ring: '#6F5F58'
        },
        guest: {
            // Existing Brand Blue
            primary: '#5B84B1',
            hover: '#4A6D94',
            ring: '#5B84B1'
        }
    };

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
                throw new Error(data.detail || 'Failed to sign in');
            }

            const data = await response.json();
            localStorage.setItem('token', data.access_token);
            setIsAuthenticated(true);
            setView('dashboard'); // Explicitly switch to dashboard view to prevent empty render
        } catch (err) {
            setError(err.message || 'Failed to sign in');
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

            {/* Login Card - Fixed Height h-[540px] */}
            <div className="bg-[#EDEDEB] rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 h-[540px] flex flex-col relative z-10">
                <div className="p-8 flex-1 flex flex-col h-full">

                    {/* Header */}
                    <div className="text-center mb-2">
                        <h1 className="text-3xl font-extrabold text-[#3A5A80]">Subscript</h1>
                        <p className="text-gray-500 text-sm mt-2 mb-6">Document Transcription Platform</p>
                    </div>

                    {/* Tabs - Only show if LDAP is enabled */}
                    {isLdapEnabled && (
                        <div className="flex border-b border-gray-200 mb-6 shrink-0">
                            <button
                                onClick={() => { setActiveTab('lehigh'); setError(''); }}
                                className={`flex-1 py-3 px-4 text-center font-bold focus:outline-none transition-colors border-b-2 
                                    ${activeTab === 'lehigh'
                                        ? `text-[${COLORS.lehigh.primary}] border-[${COLORS.lehigh.primary}]`
                                        : 'text-gray-500 border-transparent font-medium hover:text-gray-700'}`}
                                style={activeTab === 'lehigh' ? { color: COLORS.lehigh.primary, borderColor: COLORS.lehigh.primary } : {}}
                            >
                                Lehigh Login
                            </button>
                            <button
                                onClick={() => { setActiveTab('guest'); setError(''); }}
                                className={`flex-1 py-3 px-4 text-center font-bold focus:outline-none transition-colors border-b-2 
                                    ${activeTab === 'guest'
                                        ? `text-[${COLORS.guest.primary}] border-[${COLORS.guest.primary}]`
                                        : 'text-gray-500 border-transparent font-medium hover:text-gray-700'}`}
                                style={activeTab === 'guest' ? { color: COLORS.guest.primary, borderColor: COLORS.guest.primary } : {}}
                            >
                                Guest Access
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-3 rounded shrink-0">
                            <div className="flex items-center">
                                <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleLogin} className="flex flex-col h-full block">
                        <div className="space-y-4 shrink-0">

                            {/* Username / Email Field */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    {activeTab === 'lehigh' ? 'Username' : 'Email Address'}
                                </label>
                                <div className="relative">
                                    <input
                                        type={activeTab === 'lehigh' ? "text" : "email"}
                                        ref={usernameInputRef}
                                        autoFocus
                                        required
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder={activeTab === 'lehigh' ? "Lehigh UserID" : "name@example.com"}
                                        className="block w-full pl-10 pr-3 py-3 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-0 transition shadow-sm"
                                        style={{
                                            '--tw-ring-color': activeTab === 'lehigh' ? COLORS.lehigh.ring : COLORS.guest.ring,
                                            borderColor: '#9ca3af'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = activeTab === 'lehigh' ? COLORS.lehigh.ring : COLORS.guest.ring}
                                        onBlur={(e) => e.target.style.borderColor = '#9ca3af'}
                                    />
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        {activeTab === 'lehigh'
                                            ? <User className="text-gray-400 w-5 h-5" />
                                            : <Mail className="text-gray-400 w-5 h-5" />
                                        }
                                    </div>
                                </div>
                            </div>

                            {/* Password Field */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="block w-full pl-10 pr-3 py-3 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-0 transition shadow-sm"
                                        style={{ borderColor: '#9ca3af' }}
                                        onFocus={(e) => e.target.style.borderColor = activeTab === 'lehigh' ? COLORS.lehigh.ring : COLORS.guest.ring}
                                        onBlur={(e) => e.target.style.borderColor = '#9ca3af'}
                                    />
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="text-gray-400 w-5 h-5" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="mt-4 mb-[11px] shrink-0">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-transform transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{
                                    backgroundColor: activeTab === 'lehigh' ? COLORS.lehigh.primary : COLORS.guest.primary,
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = activeTab === 'lehigh' ? COLORS.lehigh.hover : COLORS.guest.hover}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = activeTab === 'lehigh' ? COLORS.lehigh.primary : COLORS.guest.primary}
                            >
                                {loading ? (
                                    <RefreshCcw className="animate-spin" size={24} />
                                ) : (
                                    activeTab === 'lehigh' ? 'Sign in with Lehigh UserID' : (isLdapEnabled ? 'Sign In as Guest' : 'Sign In')
                                )}
                            </button>
                        </div>

                        {/* Footer */}
                        <div className="flex-1 flex items-center justify-center pt-[2px]">
                            <div className="text-center">
                                {/* Tab: LEHIGH */}
                                {activeTab === 'lehigh' && (
                                    <p className="text-sm text-gray-600">
                                        {isSystemOpen
                                            ? "Sign in with your UserID."
                                            : <span className="italic text-gray-500">Accounts are by invitation only.</span>
                                        }
                                    </p>
                                )}

                                {/* Tab: GUEST */}
                                {activeTab === 'guest' && (
                                    isSystemOpen ? (
                                        <p className="text-sm text-gray-600">
                                            <button
                                                type="button"
                                                onClick={() => setView('register')}
                                                className="font-medium cursor-pointer hover:underline bg-transparent border-none p-0 inline"
                                                style={{ color: COLORS.guest.primary }}
                                            >
                                                Sign up
                                            </button>
                                            {' '}to create an account.
                                        </p>
                                    ) : (
                                        <p className="text-sm text-gray-500 italic">
                                            Accounts are by invitation only.
                                        </p>
                                    )
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
