import React, { useState } from 'react';
import { UserPlus, ArrowLeft } from 'lucide-react';

const RegisterScreen = ({ setView }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password, full_name: fullName }),
            });

            if (response.ok) {
                alert('Registration successful! Please log in.');
                setView('login');
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
                className="absolute inset-0 z-0 bg-cover bg-no-repeat"
                style={{
                    backgroundImage: "url('/background.jpg')",
                    backgroundPosition: "center 25%"
                }}
            />

            {/* Layer 2: Dark Overlay */}
            <div className="absolute inset-0 z-0 bg-black/80 backdrop-blur-sm" />

            {/* Layer 3: Register Card */}
            <div
                className="relative z-10 w-full max-w-md bg-[#EDEDEB] shadow-2xl rounded-xl p-6 space-y-4 border border-gray-300"
                style={{ transform: 'translateY(2px)' }}
            >
                <h1 className="text-4xl font-extrabold text-center text-[#3A5A80]">Create Account</h1>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}

                <form onSubmit={handleRegister} className="space-y-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Full Name</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="mt-1 block w-full px-4 py-2 border border-gray-400 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="mt-1 block w-full px-4 py-2 border border-gray-400 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="mt-1 block w-full px-4 py-2 border border-gray-400 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-2 px-4 border border-gray-600 rounded-lg shadow-sm text-lg font-semibold text-white bg-[#5B84B1] hover:bg-[#4A6D94] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-150 ease-in-out disabled:opacity-50"
                    >
                        {loading ? (
                            <UserPlus className="animate-spin mr-2" size={20} />
                        ) : (
                            'Sign Up'
                        )}
                    </button>
                </form>

                <div className="text-center mt-1">
                    <button onClick={() => setView('login')} className="flex items-center justify-center w-full text-sm text-gray-500 hover:text-gray-700 transition">
                        <ArrowLeft size={16} className="mr-1" /> Back to Login
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RegisterScreen;
