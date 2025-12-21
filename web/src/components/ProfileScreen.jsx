import React, { useState, useEffect, useRef } from 'react';
import { Save, Trash, Check, X, Copy, Link, Edit2, Lock, Unlock, HelpCircle } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';
import TourModal from './TourModal';

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

const InvitesTab = ({ newInviteEmail, setNewInviteEmail, handleCreateInvite, handleAddUser }) => {
    const [inviteType, setInviteType] = useState('ldap'); // 'guest' | 'ldap'

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-md font-medium text-gray-900 mb-4">
                Invite Users
            </h3>

            {/* Toggle */}
            <div className="flex bg-gray-100 p-1 rounded-lg mb-4 w-fit">
                <button
                    onClick={() => setInviteType('ldap')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${inviteType === 'ldap' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    LDAP User
                </button>
                <button
                    onClick={() => setInviteType('guest')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${inviteType === 'guest' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Guest User
                </button>
            </div>

            <p className="text-sm text-gray-500 mb-2">
                {inviteType === 'guest'
                    ? "Generate a token link for a guest to create their own password."
                    : "Pre-authorize a Lehigh user to log in immediately without an invite link."}
            </p>

            <div className="flex gap-4">
                <input
                    type="text"
                    placeholder={inviteType === 'guest' ? "User Email Address" : "Lehigh UserID or Email"}
                    value={newInviteEmail}
                    onChange={(e) => setNewInviteEmail(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                    onClick={() => {
                        if (inviteType === 'guest') {
                            handleCreateInvite();
                        } else {
                            handleAddUser(newInviteEmail, 'ldap');
                        }
                    }}
                    className="px-6 py-2 bg-[#3A5A80] text-white rounded-lg hover:bg-[#2A4A70] font-medium"
                >
                    {inviteType === 'guest' ? "Generate Link" : "Add User"}
                </button>
            </div>
        </div>
    );
};

const ProfileScreen = () => {
    // User Data & Auth State
    const [user, setUser] = useState({ full_name: '', email: '', is_admin: false });
    const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });

    // UI State
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'admin'
    const [adminSubTab, setAdminSubTab] = useState('users'); // 'users' | 'health' | 'logs'
    const [showTour, setShowTour] = useState(false);

    // Admin Data
    const [adminUsers, setAdminUsers] = useState([]);
    const [adminLoading, setAdminLoading] = useState(false);
    const [healthData, setHealthData] = useState(null);
    const [logs, setLogs] = useState([]);
    const [configContent, setConfigContent] = useState('');

    // Invites State
    const [registrationMode, setRegistrationMode] = useState('open'); // 'open' | 'invite'
    const [invites, setInvites] = useState([]);
    const [newInviteEmail, setNewInviteEmail] = useState('');
    const [copiedInviteId, setCopiedInviteId] = useState(null); // Track which invite link was just copied

    // Edit User State
    const [editingUser, setEditingUser] = useState(null); // { id, full_name, email, is_locked, password (optional) }
    const [showEditModal, setShowEditModal] = useState(false);

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
            if (adminSubTab === 'users') fetchUsersList();
            if (adminSubTab === 'availability') { fetchSettings(); fetchInvites(); }
            if (adminSubTab === 'health') fetchHealth();
            if (adminSubTab === 'config') fetchConfig();
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
                    is_admin: data.is_admin || false,
                    auth_source: data.auth_source || 'local'
                });
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
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
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
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
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
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
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
            }
        } catch (error) {
            console.error("Error fetching logs", error);
        }
    };

    const fetchSettings = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/admin/settings', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setRegistrationMode(data.registration_mode);
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
            }
        } catch (error) { console.error("Error fetching settings", error); }
    };

    const fetchInvites = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/admin/invites', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setInvites(data);
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
            }
        } catch (error) { console.error("Error fetching invites", error); }
    };

    // Config
    const fetchConfig = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/admin/config/yml', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setConfigContent(data.content);
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
            } else {
                showModal("Error", "Failed to fetch config", "danger");
            }
        } catch (error) { console.error("Error fetching config", error); }
    };

    const handleSaveConfig = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/admin/config/yml', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: configContent })
            });

            if (response.ok) {
                showModal("Success", "Configuration updated successfully", "success");
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
            } else {
                const err = await response.json();
                showModal("Error", err.detail || "Failed to update config", "danger");
            }
        } catch (error) {
            showModal("Error", "Network error saving config", "danger");
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
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
            } else {
                const err = await response.json();
                showModal("Error", err.detail || "Failed to update role", "danger");
            }
        } catch (error) {
            showModal("Error", "Network error updating role", "danger");
        }
    };

    const handleToggleLock = async (targetUser) => {
        // Prevent self-locking
        if (targetUser.id === user.id) {
            showModal("Warning", "You cannot lock your own account", "warning");
            return;
        }

        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`/api/users/${targetUser.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ is_locked: !targetUser.is_locked })
            });

            if (response.ok) {
                fetchUsersList();
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
            } else {
                const err = await response.json();
                showModal("Error", err.detail || "Failed to toggle lock", "danger");
            }
        } catch (e) { showModal("Error", "Network error", "danger"); }
    };

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`/api/users/${editingUser.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    full_name: editingUser.full_name,
                    email: editingUser.email,
                    is_locked: editingUser.is_locked,
                    password: editingUser.password || undefined // Only send if set
                })
            });

            if (response.ok) {
                setShowEditModal(false);
                fetchUsersList();
                showModal("Success", "User updated successfully", "success");
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
            } else {
                const data = await response.json();
                showModal("Error", data.detail || "Failed to update user", "danger");
            }
        } catch (e) { showModal("Error", "Network error", "danger"); }
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
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
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
            else if (profileRes.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
                return;
            } else {
                errorOccurred = true;
                successMessage.push("Failed to update profile.");
            }
        } catch (e) { setLoading(false); }

        if (passwords.current) {
            if (passwords.new !== passwords.confirm) {
                showModal("Error", "Passwords do not match", "warning");
                setLoading(false);
                return;
            }

            // Strong Password Validation
            const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
            if (!strongPasswordRegex.test(passwords.new)) {
                showModal("Weak Password", "Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.", "warning");
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
                else if (passRes.status === 401) {
                    window.dispatchEvent(new Event('auth:unauthorized'));
                    return;
                } else {
                    errorOccurred = true;
                    successMessage.push("Password update failed.");
                }
            } catch (e) { errorOccurred = true; }
        }

        setLoading(false);
        showModal(errorOccurred ? "Issues" : "Success", successMessage.join(", "), errorOccurred ? "danger" : "success");
        if (!errorOccurred && passwords.current) setPasswords({ current: '', new: '', confirm: '' });
    };

    const handleToggleMode = async () => {
        const token = localStorage.getItem('token');
        const newMode = registrationMode === 'open' ? 'invite' : 'open';
        try {
            const response = await fetch('/api/admin/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ registration_mode: newMode })
            });
            if (response.ok) {
                setRegistrationMode(newMode);
                showModal("Updated", `Registration is now ${newMode === 'open' ? 'Open to Everyone' : 'Invite Only'}`, "success");
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
            }
        } catch (e) { showModal("Error", "Failed to update settings", "danger"); }
    };

    const handleCreateInvite = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/admin/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ email: newInviteEmail || null })
            });
            if (response.ok) {
                setNewInviteEmail('');
                fetchInvites();
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
            }
        } catch (e) { showModal("Error", "Failed to create invite", "danger"); }
    };

    const handleDeleteInvite = async (id) => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`/api/admin/invites/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) fetchInvites();
            else if (response.status === 401) window.dispatchEvent(new Event('auth:unauthorized'));
            else showModal("Error", "Failed to delete invite", "danger");
        } catch (e) { showModal("Error", "Network error", "danger"); }
    };

    const copyToClipboard = (text, id) => {
        navigator.clipboard.writeText(text);
        setCopiedInviteId(id);
        setTimeout(() => setCopiedInviteId(null), 2000); // Reset after 2 seconds
    };

    const showModal = (title, message, type = 'info') => {
        setModalConfig({ isOpen: true, title, message, type, onClose: () => setModalConfig(prev => ({ ...prev, isOpen: false })) });
    };
    const handleAddUser = async (email, authSource) => {
        if (!email) return;
        setLoading(true);
        try {
            await axios.post('/api/users', { email, auth_source: authSource });
            showModal("Success", `User ${email} added successfully. They can now log in.`, "success");
            setNewInviteEmail("");
            fetchUsersLogic(); // Refresh users list
        } catch (err) {
            console.error(err);
            showModal("Error", "Failed to add user. They may already exist.", "error");
        } finally {
            setLoading(false);
        }
    };


    // --- Render ---
    const containerMaxWidth = activeTab === 'admin' ? 'max-w-4xl' : 'max-w-lg';

    return (
        <div className={`p-4 sm:p-6 lg:p-8 ${containerMaxWidth} mx-auto transition-all duration-300 ease-in-out pb-40`}>
            {/* Header */}
            <div className="mb-6 flex justify-between items-center">
                <h2 className="text-3xl font-bold text-[#3A5A80]">My Profile</h2>
                <button
                    onClick={() => setShowTour(true)}
                    className="flex items-center space-x-2 text-[#5B84B1] hover:text-[#3A5A80] transition-colors"
                >
                    <HelpCircle size={24} />
                    <span className="font-semibold">Help</span>
                </button>
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
                                readOnly
                                className="mt-1 block w-full px-4 py-2 border border-gray-400 bg-gray-200 rounded-lg text-gray-600 cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Email</label>
                            <input type="email" value={user.email} readOnly className="mt-1 block w-full px-4 py-2 border border-gray-400 bg-gray-200 rounded-lg text-gray-600 cursor-not-allowed" />
                        </div>

                        {user.auth_source !== 'local' && (
                            <div className="flex items-center p-4 bg-gray-200 border border-gray-400 rounded-lg">
                                <div className="p-2 bg-gray-300 rounded-full mr-3 text-gray-600">
                                    <Lock size={20} />
                                </div>
                                <div>
                                    <span className="text-sm font-medium text-gray-700">
                                        Your profile cannot be edited because it is managed by your organization.
                                    </span>
                                </div>
                            </div>
                        )}

                        {user.auth_source === 'local' && (
                            <>
                                <h3 className="text-xl font-semibold text-gray-700 border-b pb-2 pt-4">Change Password</h3>
                                <div className="space-y-4">
                                    <input type="password" placeholder="Current Password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} className="block w-full px-4 py-2 border border-gray-400 rounded-lg" />
                                    <input type="password" placeholder="New Password" value={passwords.new} onChange={(e) => setPasswords({ ...passwords, new: e.target.value })} className="block w-full px-4 py-2 border border-gray-400 rounded-lg" />
                                    <input type="password" placeholder="Confirm Password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} className="block w-full px-4 py-2 border border-gray-400 rounded-lg" />
                                </div>
                            </>
                        )}

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
                                {['users', 'availability', 'health', 'config', 'logs'].map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setAdminSubTab(tab)}
                                        className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize w-24 ${adminSubTab === tab ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:bg-gray-300'}`}
                                    >
                                        {tab === 'availability' ? 'Availability' : tab}
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
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
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
                                                        <span className={`px-2 py-0.5 inline-flex text-xs font-medium border rounded ${u.auth_source === 'ldap'
                                                            ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                                                            : 'bg-gray-50 text-gray-500 border-gray-200'
                                                            }`}>
                                                            {u.auth_source === 'ldap' ? 'LDAP' : 'Local'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm">
                                                        <button onClick={() => u.id !== user.id && handleRoleUpdate(u, !u.is_admin)} disabled={u.id === user.id} className={`flex items-center space-x-1 px-2 py-1 rounded border ${u.is_admin ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                                            {u.is_admin ? <Check size={14} /> : <X size={14} />} <span>{u.is_admin ? 'Yes' : 'No'}</span>
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 text-right flex items-center justify-end gap-3">
                                                        <button
                                                            onClick={() => { setEditingUser({ ...u, password: '' }); setShowEditModal(true); }}
                                                            className="text-blue-600 hover:text-blue-800"
                                                            title="Edit User"
                                                        >
                                                            <Edit2 size={18} />
                                                        </button>

                                                        <button
                                                            onClick={() => u.id !== user.id && handleToggleLock(u)}
                                                            disabled={u.id === user.id}
                                                            className={`${u.is_locked ? 'text-red-500 hover:text-red-700' : 'text-green-500 hover:text-green-700'} ${u.id === user.id ? 'opacity-30 cursor-not-allowed' : ''}`}
                                                            title={u.is_locked ? "Unlock Account" : "Lock Account"}
                                                        >
                                                            {u.is_locked ? <Lock size={18} /> : <Unlock size={18} />}
                                                        </button>

                                                        {u.id !== user.id ? (
                                                            <button onClick={() => confirmDeleteUser(u)} className="text-gray-500 hover:text-red-600" title="Delete User"><Trash size={18} /></button>
                                                        ) : (
                                                            <button disabled className="text-gray-300 cursor-not-allowed" title="Cannot delete yourself"><Trash size={18} /></button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}

                        {/* Availability */}
                        {adminSubTab === 'availability' && (
                            <div className="space-y-6">
                                {/* Mode Toggle */}
                                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-lg font-medium text-gray-900">System Availability</h3>
                                        <p className="text-sm text-gray-500">
                                            {registrationMode === 'open'
                                                ? "Anyone can create an account."
                                                : "Accounts can only be created with an invitation link."}
                                        </p>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <span className={`text-sm font-medium ${registrationMode === 'open' ? 'text-green-700' : 'text-gray-400'}`}>
                                            Open Registration
                                        </span>
                                        <button
                                            onClick={handleToggleMode}
                                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${registrationMode === 'invite' ? 'bg-red-500' : 'bg-green-600'}`}
                                        >
                                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${registrationMode === 'invite' ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                        <span className={`text-sm font-medium ${registrationMode === 'invite' ? 'text-red-600' : 'text-gray-400'}`}>
                                            By Invitation Only
                                        </span>
                                    </div>
                                </div>

                                {/* Create Invite / Add User */}
                                {registrationMode === 'invite' && (
                                    <InvitesTab
                                        newInviteEmail={newInviteEmail}
                                        setNewInviteEmail={setNewInviteEmail}
                                        handleCreateInvite={handleCreateInvite}
                                        handleAddUser={handleAddUser}
                                    />
                                )}

                                {/* Invites List - ONLY IN INVITE MODE */}
                                {registrationMode === 'invite' && (
                                    <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Token / Link</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">For</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {invites.map((invite) => (
                                                    <tr key={invite.id}>
                                                        <td className="px-6 py-4 text-sm font-mono text-gray-600 truncate max-w-xs">{invite.token}</td>
                                                        <td className="px-6 py-4 text-sm text-gray-600">{invite.email || '-'}</td>
                                                        <td className="px-6 py-4 text-sm">
                                                            <span className={`px-2 py-1 rounded-full text-xs ${invite.is_used ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                                                {invite.is_used ? 'Used' : 'Active'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                                                            {!invite.is_used && (
                                                                <div className="relative group">
                                                                    <button
                                                                        onClick={() => copyToClipboard(`${window.location.origin}/register?token=${invite.token}`, invite.id)}
                                                                        className={`${copiedInviteId === invite.id ? 'text-green-600' : 'text-blue-600 hover:text-blue-800'}`}
                                                                    >
                                                                        {copiedInviteId === invite.id ? <Check size={16} /> : <Copy size={16} />}
                                                                    </button>
                                                                    {/* Custom fast tooltip */}
                                                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-white text-xs py-1 px-2 rounded shadow-lg whitespace-nowrap z-50">
                                                                        {copiedInviteId === invite.id ? 'Copied!' : 'Copy Link'}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <button
                                                                onClick={() => handleDeleteInvite(invite.id)}
                                                                className="text-red-500 hover:text-red-700"
                                                                title="Delete Invite"
                                                            >
                                                                <Trash size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {invites.length === 0 && (
                                                    <tr><td colSpan="4" className="text-center py-8 text-gray-400">No invitations created.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Config */}
                        {adminSubTab === 'config' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="text-lg font-medium text-gray-700">System Configuration (config.yml)</h3>
                                    <div className="flex space-x-2">
                                        <button onClick={fetchConfig} className="text-gray-500 hover:text-gray-700 text-sm">Refresh</button>
                                        <button onClick={handleSaveConfig} className="flex items-center space-x-1 px-4 py-2 bg-[#5B84B1] text-white rounded hover:bg-[#4A6D94]">
                                            <Save size={16} /> <span>Save Config</span>
                                        </button>
                                    </div>
                                </div>
                                <textarea
                                    value={configContent}
                                    onChange={(e) => setConfigContent(e.target.value)}
                                    className="w-full h-96 p-4 font-mono text-sm bg-gray-50 border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                    spellCheck="false"
                                />
                                <div className="text-xs text-gray-500">
                                    Note: Changes may require a server restart to take full effect depending on the setting.
                                </div>
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

            {/* Edit User Modal */}
            {showEditModal && editingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <h3 className="text-xl font-bold text-gray-800">Edit User</h3>
                            <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateUser} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                <input
                                    type="text"
                                    value={editingUser.full_name || ''}
                                    onChange={e => setEditingUser({ ...editingUser, full_name: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                                <input
                                    type="email"
                                    required
                                    value={editingUser.email || ''}
                                    onChange={e => setEditingUser({ ...editingUser, email: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Password (Leave blank to keep)</label>
                                <input
                                    type="password"
                                    placeholder="Set new password..."
                                    value={editingUser.password || ''}
                                    onChange={e => setEditingUser({ ...editingUser, password: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                />
                            </div>

                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 mt-4">
                                <div className="flex items-center gap-2">
                                    {editingUser.is_locked ? <Lock size={20} className="text-red-500" /> : <Unlock size={20} className="text-green-500" />}
                                    <span className={`font-medium ${editingUser.is_locked ? 'text-red-700' : 'text-gray-700'}`}>
                                        {editingUser.is_locked ? 'Account Locked' : 'Account Active'}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setEditingUser({ ...editingUser, is_locked: !editingUser.is_locked })}
                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${editingUser.is_locked ? 'bg-red-500' : 'bg-green-500'}`}
                                >
                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${editingUser.is_locked ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            {/* Prevent self-locking warning */}
                            {editingUser.id === user.id && editingUser.is_locked && (
                                <p className="text-xs text-red-600 bg-red-50 p-2 rounded">
                                    Warning: You are locking your own account. You will be logged out immediately.
                                </p>
                            )}

                            <div className="flex justify-end gap-3 mt-8 pt-4 border-t">
                                <button
                                    type="button"
                                    onClick={() => setShowEditModal(false)}
                                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-[#3A5A80] text-white rounded-lg hover:bg-[#2A4A70] font-medium transition-colors flex items-center gap-2"
                                >
                                    <Save size={18} /> Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
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

            {/* Tour Modal */}
            {showTour && <TourModal onComplete={() => setShowTour(false)} />}
        </div>
    );
};

export default ProfileScreen;
