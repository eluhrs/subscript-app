import React, { useState, useEffect } from 'react';
import { UserPlus, ArrowLeft } from 'lucide-react';

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
            <div
                className="relative z-10 w-full max-w-md bg-[#EDEDEB] shadow-2xl rounded-xl overflow-hidden border border-gray-200 h-[540px] flex flex-col"
                style={{ transform: 'translateY(2px)' }}
            >
                <div className="p-8 flex-1 flex flex-col h-full">
                    <h1 className="text-4xl font-extrabold text-center text-[#3A5A80] mb-[54px]">Create Account</h1>

                    {error && (
                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                            <span className="block sm:inline">{error}</span>
                        </div>
                    )}

                    {isInviteOnly && !token && (
                        <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded relative text-center mb-4">
                            <p className="font-bold">Invitation Required</p>
                            <p className="text-sm">Registration is currently limited to invited users only.</p>
                        </div>
                    )}

                    {token && (
                        <div className="bg-green-100 border border-green-400 text-green-800 px-4 py-2 rounded text-center text-sm mb-4">
                            Invitation Code Applied
                        </div>
                    )}

                    <form onSubmit={handleRegister} className="flex flex-col h-full block">
                        <div className="space-y-4 shrink-0">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="block w-full px-4 py-3 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-0 transition shadow-sm"
                                    style={{ borderColor: '#9ca3af', '--tw-ring-color': '#5B84B1' }}
                                    onFocus={(e) => e.target.style.borderColor = '#5B84B1'}
                                    onBlur={(e) => e.target.style.borderColor = '#9ca3af'}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="block w-full px-4 py-3 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-0 transition shadow-sm"
                                    style={{ borderColor: '#9ca3af', '--tw-ring-color': '#5B84B1' }}
                                    onFocus={(e) => e.target.style.borderColor = '#5B84B1'}
                                    onBlur={(e) => e.target.style.borderColor = '#9ca3af'}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="block w-full px-4 py-3 border border-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-0 transition shadow-sm"
                                    style={{ borderColor: '#9ca3af', '--tw-ring-color': '#5B84B1' }}
                                    onFocus={(e) => e.target.style.borderColor = '#5B84B1'}
                                    onBlur={(e) => e.target.style.borderColor = '#9ca3af'}
                                />
                            </div>
                        </div>

                        <div className="mt-4 mb-[11px] shrink-0">
                            <button
                                type="submit"
                                disabled={loading || !canRegister}
                                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-md text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-transform transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ backgroundColor: '#5B84B1' }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4A6D94'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#5B84B1'}
                            >
                                {loading ? (
                                    <UserPlus className="animate-spin mr-2" size={24} />
                                ) : (
                                    'Sign Up'
                                )}
                            </button>
                        </div>

                        <div className="flex-1 flex items-center justify-center pt-[2px]">
                            <button
                                type="button"
                                onClick={() => setView('login-guest')}
                                className="flex items-center justify-center w-full text-base font-medium text-[#5B84B1] hover:underline transition bg-transparent border-none cursor-pointer"
                            >
                                <ArrowLeft size={18} className="mr-1" /> Back to Guest Login
                            </button>
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
                    setView('login-guest');
                }}
                onClose={() => {
                    setShowSuccessModal(false);
                    setView('login-guest');
                }}
                confirmText="Go to Login"
                type="success"
                singleButton={true}
            />
        </div>
    );
};

export default RegisterScreen;
