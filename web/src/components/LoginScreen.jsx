import React, { useState } from 'react';
import { RefreshCcw } from 'lucide-react';

const LoginScreen = ({ setIsAuthenticated, setView }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const formData = new FormData();
        formData.append('username', email);
        formData.append('password', password);

        try {
            const response = await fetch('/api/auth/token', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('token', data.access_token);
                setIsAuthenticated(true);
                setView('dashboard');
            } else {
                const errData = await response.json();
                setError(errData.detail || 'Login failed');
            }
        } catch (error) {
            console.error("Login error", error);
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

            {/* Layer 3: Login Card */}
            <div className="relative z-10 w-full max-w-md bg-[#EDEDEB] shadow-2xl rounded-xl p-8 space-y-6 border border-gray-300">
                <h1 className="text-4xl font-extrabold text-center text-[#3A5A80]">Subscript</h1>
                <p className="text-center text-gray-600">Document Transcription Platform</p>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="mt-1 block w-full px-4 py-2 bg-white border border-gray-400 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="mt-1 block w-full px-4 py-2 bg-white border border-gray-400 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-2 px-4 border border-gray-600 rounded-lg shadow-sm text-lg font-semibold text-white bg-[#5B84B1] hover:bg-[#4A6D94] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out disabled:opacity-50"
                    >
                        {loading ? (
                            <RefreshCcw className="animate-spin mr-2" size={20} />
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>

                <div className="text-center mt-4">
                    <p className="text-sm text-gray-600">
                        Don't have an account?{' '}
                        <button onClick={() => setView('register')} className="font-medium text-[#3A5A80] hover:text-[#4A6D94] transition duration-150">
                            Sign up
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
