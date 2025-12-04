import React, { useState } from 'react';
import { RefreshCcw } from 'lucide-react';

const LoginScreen = ({ setIsAuthenticated }) => {
    const [loading, setLoading] = useState(false);
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);

        // Call API
        try {
            const response = await fetch('/api/auth/login', { method: 'POST' });
            if (response.ok) {
                setIsAuthenticated(true);
            } else {
                alert('Login failed');
            }
        } catch (error) {
            console.error("Login error", error);
            alert('Login error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md bg-white shadow-2xl rounded-xl p-8 space-y-6">
                <h1 className="text-4xl font-extrabold text-center text-indigo-700">Subscript</h1>
                <p className="text-center text-gray-600">Document Transcription Platform</p>
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email Address</label>
                        <input
                            type="email"
                            placeholder="user@example.com"
                            required
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Password</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            required
                            className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-lg font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out disabled:opacity-50"
                    >
                        {loading ? (
                            <RefreshCcw className="animate-spin mr-2" size={20} />
                        ) : (
                            'Log In'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginScreen;
