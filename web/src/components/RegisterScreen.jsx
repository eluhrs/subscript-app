import React, { useState, useEffect } from 'react';
import { User, Mail, Lock, RefreshCcw } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';

const RegisterScreen = ({ setView }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [token, setToken] = useState('');
    const [registrationMode, setRegistrationMode] = useState('open');
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const t = params.get('token');
        if (t) {
            setToken(t);
            // Clean URL: remove query params but keep the path
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        fetch('/api/system/config')
            .then(res => res.json())
            .then(data => setRegistrationMode(data.registration_mode))
            .catch(console.error);
    }, []);

    const isInviteOnly = registrationMode === 'invite';
    const canRegister = !isInviteOnly || (isInviteOnly && token);

    const handleRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Strong Password Validation
            const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
            if (!strongPasswordRegex.test(password)) {
                setError("Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.");
                setLoading(false);
                return;
            }

            const url = token ? `/api/auth/register?token=${token}` : '/api/auth/register';
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password, full_name: fullName }),
            });

            if (response.ok) {
                setShowSuccessModal(true);
            } else {
                const errData = await response.json();
                setError(errData.detail || 'Registration failed');
            }
        } catch (error) {
            console.error("Registration error", error);
            setError('Network error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
            {/* Layer 1: Background Image */}
            <div
                className="absolute inset-0 z-0 bg-cover bg-no-repeat blur-sm scale-105"
                style={{
                    backgroundImage: "url('/background.jpg')",
                    backgroundPosition: "center 25%"
                }}
            />
            {/* Layer 2: Dark Overlay */}
            <div className="absolute inset-0 z-0 bg-black/80 backdrop-blur-sm" />

            {/* Layer 3: Register Card */}
            <div className="relative z-10 w-full max-w-md bg-[#EDEDEB] shadow-2xl rounded-xl overflow-hidden border border-gray-200 flex flex-col">
                <div className="pt-8 px-8 pb-6 flex-1 flex flex-col">
                    <form onSubmit={handleRegister} className="view-signup flex flex-col">
                        <div className="text-center mb-0">
                            <h1 className="text-3xl font-extrabold text-[#3A5A80]">Subscript Sign Up</h1>
                            {/* Fixed Height Subtitle */}
                            <p className="text-gray-500 text-sm mt-2 mb-6 h-5 flex items-center justify-center">Historical Document Transcription Platform</p>
                        </div>

                        {/* Full Name Input */}
                        <div className="space-y-4 shrink-0">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <User className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="John Doe"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        className="block w-full py-3 pl-10 pr-3 transition-colors duration-200 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-blue/50 focus:border-brand-blue"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1 label-user">Email Address</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="email"
                                        placeholder="name@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="block w-full py-3 pl-10 pr-3 transition-colors duration-200 border border-gray-300 rounded-lg input-user outline-none focus:ring-2 focus:ring-brand-blue/50 focus:border-brand-blue"
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
                                        className="block w-full py-3 pl-10 pr-3 transition-colors duration-200 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-blue/50 focus:border-brand-blue"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 mb-4 shrink-0">
                            <button
                                type="submit"
                                disabled={loading || !canRegister}
                                className={`w-full py-3 px-4 rounded-lg font-semibold text-white bg-brand-blue btn-submit transition-transform active:scale-[0.98] flex justify-center items-center ${loading || !canRegister ? 'opacity-80 cursor-not-allowed' : ''}`}
                            >
                                {loading ? <RefreshCcw className="animate-spin h-5 w-5" /> : 'Sign Up'}
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
                                        <p className="text-sm text-gray-600 system-open-msg">
                                            <span onClick={() => setView('login')} className="text-brand-blue font-bold hover:underline cursor-pointer">Back to Login</span>
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            <ConfirmationModal
                isOpen={showSuccessModal}
                title="Registration Successful"
                message="Your account has been created. Please log in to continue."
                onConfirm={() => {
                    setShowSuccessModal(false);
                    setView('login');
                }}
                onClose={() => {
                    setShowSuccessModal(false);
                    setView('login');
                }}
                confirmText="Go to Login"
                type="success"
                singleButton={true}
            />
        </div>
    );
};

export default RegisterScreen;
