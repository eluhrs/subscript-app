import React, { useState, useEffect, useRef } from 'react';
import { Save, Trash, Check, X } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';

// Helper to format log lines (moved outside to avoid re-creation)
const formatLogLine = (line) => {
    if (!line || typeof line !== 'string') return line;

    // Regex for "YYYY-MM-DD HH:MM:SS,mmm" or "YYYY-MM-DD HH:MM:SS"
    const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:,\d+)?)(.*)/);
    if (match) {
        const dateStr = match[1].replace(',', '.'); // JS needs dot for milliseconds
        const content = match[2];
        try {
            // Append Z to force UTC parsing if server logs are UTC/Local
            const date = new Date(dateStr + "Z");
            return (
                <span>
                    <span className="text-gray-500 select-none mr-2">
                        {date.toLocaleTimeString()}
                    </span>
                    {content}
                </span>
            );
        } catch (e) { return line; }
    }
    return line;
};

const ProfileScreen = () => {
    // User Data & Auth State
    const [user, setUser] = useState({ full_name: '', email: '', is_admin: false });
    const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });

    // UI State
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'admin'
    const [adminSubTab, setAdminSubTab] = useState('users'); // 'users' | 'health' | 'logs'

    // Admin Data
    const [adminUsers, setAdminUsers] = useState([]);
    const [adminLoading, setAdminLoading] = useState(false);
    const [healthData, setHealthData] = useState(null);
    const [logs, setLogs] = useState([]);

    // Refs for Logs
    const logsEndRef = useRef(null);

    // Modal State
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
        onClose: () => { }
    });

    const [confirmAction, setConfirmAction] = useState({
        isOpen: false,
        title: '',
        message: '',
        action: null
    });

    // --- Effects ---

    // 1. Initial Data Load
    useEffect(() => {
        fetchUserData();
    }, []);

    // 2. Tab Data Load
    useEffect(() => {
        if (activeTab === 'admin' && user.is_admin) {
            if (adminSubTab === 'users') fetchUsersList();
            if (adminSubTab === 'health') fetchHealth();
            if (adminSubTab === 'logs') fetchLogs();
        }
    }, [activeTab, adminSubTab, user.is_admin]);

    // 3. Log Polling & Auto-scroll
    useEffect(() => {
        let interval;
        if (activeTab === 'admin' && adminSubTab === 'logs') {
            // Auto-scroll on mount/update
            if (logsEndRef.current) {
                logsEndRef.current.scrollIntoView({ behavior: "smooth" });
            }
            // Start polling
            interval = setInterval(fetchLogs, 2000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [activeTab, adminSubTab, logs.length]); // Added logs.length to trigger scroll on new logs

    // --- API Calls ---

    const fetchUserData = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const response = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setUser({
                    id: data.id,
                    full_name: data.full_name || '',
                    email: data.email || '',
                    is_admin: data.is_admin || false
                });
            }
        } catch (error) {
            console.error("Error fetching user", error);
        }
    };

    const fetchUsersList = async () => {
        setAdminLoading(true);
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setAdminUsers(data);
            }
        } catch (error) {
            console.error("Error fetching users", error);
        } finally {
            setAdminLoading(false);
        }
    };

    const fetchHealth = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/admin/health', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setHealthData(data);
            }
        } catch (error) {
            console.error("Error fetching health", error);
        }
    };

    const fetchLogs = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/admin/logs?lines=100', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setLogs(data.logs || []);
            }
        } catch (error) {
            console.error("Error fetching logs", error);
        }
    };

    // --- Actions ---

    const handleRoleUpdate = async (targetUser, newIsAdmin) => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`/api/users/${targetUser.id}/role`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ is_admin: newIsAdmin })
            });

            if (response.ok) {
                fetchUsersList();
            } else {
                const err = await response.json();
                showModal("Error", err.detail || "Failed to update role", "danger");
            }
        } catch (error) {
            showModal("Error", "Network error updating role", "danger");
        }
    };

    const handleDeleteUser = async (targetUser) => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`/api/users/${targetUser.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                fetchUsersList();
                setConfirmAction({ ...confirmAction, isOpen: false });
            } else {
                const err = await response.json();
                showModal("Error", err.detail || "Failed to delete user", "danger");
            }
        } catch (error) {
            showModal("Error", "Network error deleting user", "danger");
        }
    };

    const confirmDeleteUser = (targetUser) => {
        setConfirmAction({
            isOpen: true,
            title: "Delete User?",
            message: `Are you sure you want to delete user ${targetUser.email}?`,
            action: () => handleDeleteUser(targetUser)
        });
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setLoading(true);
        const token = localStorage.getItem('token');
        let successMessage = [];
        let errorOccurred = false;

        try {
            const profileRes = await fetch('/api/auth/me', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ full_name: user.full_name })
            });
            if (profileRes.ok) successMessage.push("Profile updated.");
            else {
                errorOccurred = true;
                successMessage.push("Failed to update profile.");
            }
        } catch (e) { loading = false; }

        if (passwords.current) {
            if (passwords.new !== passwords.confirm) {
                showModal("Error", "Passwords do not match", "warning");
                setLoading(false);
                return;
            }
            try {
                const passRes = await fetch('/api/auth/password', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ old_password: passwords.current, new_password: passwords.new })
                });
                if (passRes.ok) successMessage.push("Password updated.");
                else {
                    errorOccurred = true;
                    successMessage.push("Password update failed.");
                }
            } catch (e) { errorOccurred = true; }
        }

        setLoading(false);
        showModal(errorOccurred ? "Issues" : "Success", successMessage.join(", "), errorOccurred ? "danger" : "success");
        if (!errorOccurred && passwords.current) setPasswords({ current: '', new: '', confirm: '' });
    };

    const showModal = (title, message, type = 'info') => {
        setModalConfig({ isOpen: true, title, message, type, onClose: () => setModalConfig(prev => ({ ...prev, isOpen: false })) });
    };

    // --- Render ---
    const containerMaxWidth = activeTab === 'admin' ? 'max-w-4xl' : 'max-w-lg';

    return (
        <div className={`p-4 sm:p-6 lg:p-8 ${containerMaxWidth} mx-auto transition-all duration-300 ease-in-out`}>
            {/* Header */}
            <div className="mb-6">
                <h2 className="text-3xl font-bold text-[#3A5A80]">My Profile</h2>
            </div>

            <div className="bg-[#EDEDEB] shadow-xl rounded-xl p-8 border border-gray-500 overflow-hidden min-h-[500px]">

                {/* Tabs */}
                <div className="flex items-end space-x-6 border-b border-gray-400 mb-6">
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`text-xl font-semibold pb-2 ${activeTab === 'profile' ? 'text-gray-700' : 'text-gray-400 hover:text-gray-500'}`}
                    >
                        User Details
                    </button>
                    {user.is_admin && (
                        <>
                            <div className="h-8 w-px bg-gray-400 mb-0"></div>
                            <button
                                onClick={() => setActiveTab('admin')}
                                className={`text-xl font-semibold pb-2 ${activeTab === 'admin' ? 'text-gray-700' : 'text-gray-400 hover:text-gray-500'}`}
                            >
                                Admin Settings
                            </button>
                        </>
                    )}
                </div>

                {/* Profile Content */}
                {activeTab === 'profile' && (
                    <form onSubmit={handleSaveProfile} className="space-y-6 animate-fadeIn">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Full Name</label>
                            <input
                                type="text"
                                value={user.full_name}
                                onChange={(e) => setUser({ ...user, full_name: e.target.value })}
                                className="mt-1 block w-full px-4 py-2 border border-gray-400 rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Email</label>
                            <input type="email" value={user.email} readOnly className="mt-1 block w-full px-4 py-2 border border-gray-400 bg-gray-200 rounded-lg text-gray-600 cursor-not-allowed" />
                        </div>

                        <h3 className="text-xl font-semibold text-gray-700 border-b pb-2 pt-4">Change Password</h3>
                        <div className="space-y-4">
                            <input type="password" placeholder="Current Password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} className="block w-full px-4 py-2 border border-gray-400 rounded-lg" />
                            <input type="password" placeholder="New Password" value={passwords.new} onChange={(e) => setPasswords({ ...passwords, new: e.target.value })} className="block w-full px-4 py-2 border border-gray-400 rounded-lg" />
                            <input type="password" placeholder="Confirm Password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} className="block w-full px-4 py-2 border border-gray-400 rounded-lg" />
                        </div>

                        <button type="submit" disabled={loading} className="w-full flex justify-center items-center space-x-2 py-3 px-4 border border-gray-600 rounded-lg shadow-lg text-lg font-semibold text-white bg-[#5B84B1] hover:bg-[#4A6D94] disabled:opacity-50">
                            {loading ? "Saving..." : <><Save size={20} /><span>Save All Changes</span></>}
                        </button>
                    </form>
                )}

                {/* Admin Content */}
                {activeTab === 'admin' && (
                    <div className="animate-fadeIn">
                        {/* Sub Tabs */}
                        <div className="flex justify-center mb-6">
                            <div className="bg-gray-200 p-1 rounded-lg inline-flex space-x-1">
                                {['users', 'health', 'logs'].map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setAdminSubTab(tab)}
                                        className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize w-24 ${adminSubTab === tab ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:bg-gray-300'}`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Users */}
                        {adminSubTab === 'users' && (
                            <div className="overflow-x-auto">
                                <div className="flex justify-end mb-2"><button onClick={fetchUsersList} className="text-blue-600 text-sm">Refresh</button></div>
                                {adminLoading ? <div className="text-center p-4">Loading...</div> : (
                                    <table className="min-w-full divide-y divide-gray-300">
                                        <thead className="bg-gray-100">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Admin</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {adminUsers.map(u => (
                                                <tr key={u.id}>
                                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{u.full_name}</td>
                                                    <td className="px-6 py-4 text-sm text-gray-500">{u.email}</td>
                                                    <td className="px-6 py-4 text-sm">
                                                        <button onClick={() => u.id !== user.id && handleRoleUpdate(u, !u.is_admin)} disabled={u.id === user.id} className={`flex items-center space-x-1 px-2 py-1 rounded border ${u.is_admin ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                                            {u.is_admin ? <Check size={14} /> : <X size={14} />} <span>{u.is_admin ? 'Yes' : 'No'}</span>
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        {u.id !== user.id && <button onClick={() => confirmDeleteUser(u)} className="text-red-600"><Trash size={18} /></button>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}

                        {/* Health */}
                        {adminSubTab === 'health' && (
                            <div className="space-y-4">
                                <div className="flex justify-end"><button onClick={fetchHealth} className="text-blue-600 text-sm">Refresh</button></div>
                                {healthData ? (
                                    healthData.status === 'error' ? (
                                        <div className="p-4 bg-red-100 text-red-700 rounded">Error: {healthData.message}</div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="bg-white p-4 rounded shadow">
                                                <p className="text-xs text-gray-500 font-bold uppercase">Status</p>
                                                <p className="text-xl font-semibold text-green-600 capitalize">{healthData.status}</p>
                                            </div>
                                            {healthData.system_load && (
                                                <div className="bg-white p-4 rounded shadow">
                                                    <p className="text-xs text-gray-500 font-bold uppercase">System Load</p>
                                                    <p className="text-sm font-mono">{healthData.system_load?.['1min']} / {healthData.system_load?.['5min']} / {healthData.system_load?.['15min']}</p>
                                                </div>
                                            )}
                                            <div className="bg-white p-4 rounded shadow">
                                                <p className="text-xs text-gray-500 font-bold uppercase">Disk (Used / Free)</p>
                                                <p className="text-lg font-semibold text-gray-800">
                                                    {healthData.disk_usage?.used} / {healthData.disk_usage?.free}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">{healthData.disk_usage?.percent} Full</p>
                                            </div>
                                        </div>
                                    )
                                ) : <div className="text-center p-10 text-gray-500">Loading...</div>}
                            </div>
                        )}

                        {/* Logs */}
                        {adminSubTab === 'logs' && (
                            <div>
                                <div className="flex justify-end mb-2"><button onClick={fetchLogs} className="text-blue-600 text-sm">Refresh</button></div>
                                <div className="bg-gray-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-xs text-green-400">
                                    {logs.length > 0 ? (
                                        <>
                                            {logs.map((line, i) => (
                                                <div key={i} className="mb-px break-all">
                                                    {formatLogLine(line)}
                                                </div>
                                            ))}
                                            <div ref={logsEndRef} />
                                        </>
                                    ) : <div className="text-gray-500 italic">Waiting for logs...</div>}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                singleButton={true}
                confirmText="OK"
            />
            <ConfirmationModal
                isOpen={confirmAction.isOpen}
                onClose={() => setConfirmAction({ ...confirmAction, isOpen: false })}
                title={confirmAction.title}
                message={confirmAction.message}
                type="warning"
                singleButton={false}
                confirmText="Delete"
                onConfirm={confirmAction.action}
            />
        </div>
    );
};

export default ProfileScreen;
