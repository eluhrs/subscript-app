import React, { useState, useEffect } from 'react';
import { Save, Users, User, Trash, Check, X } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';

const ProfileScreen = ({ setView }) => {
    // User Data & Auth State
    const [user, setUser] = useState({ full_name: '', email: '', is_admin: false });
    const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });

    // UI State
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'admin'

    // Admin Data
    const [adminUsers, setAdminUsers] = useState([]);
    const [adminLoading, setAdminLoading] = useState(false);

    // Modal State
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
        onClose: () => { }
    });

    // Confirm Action Modal (for critical admin actions)
    const [confirmAction, setConfirmAction] = useState({
        isOpen: false,
        title: '',
        message: '',
        action: null
    });

    useEffect(() => {
        fetchUserData();
    }, []);

    // Fetch user list when switching to Admin tab
    useEffect(() => {
        if (activeTab === 'admin' && user.is_admin) {
            fetchUsersList();
        }
    }, [activeTab, user.is_admin]);

    const fetchUserData = async () => {
        const token = localStorage.getItem('token');
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
            } else {
                console.error("Failed to fetch user");
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

    // --- Admin Actions ---

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
                fetchUsersList(); // Refresh list
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
                setConfirmAction({ isOpen: false, title: '', message: '', action: null });
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
            message: `Are you sure you want to delete user ${targetUser.email}? This cannot be undone.`,
            action: () => handleDeleteUser(targetUser)
        });
    };

    // --- Profile Actions ---

    const closeModal = () => {
        setModalConfig(prev => ({ ...prev, isOpen: false }));
    };

    const showModal = (title, message, type = 'info', onCloseCallback = null) => {
        setModalConfig({
            isOpen: true,
            title,
            message,
            type,
            onClose: () => {
                closeModal();
                if (onCloseCallback) onCloseCallback();
            }
        });
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setLoading(true);
        const token = localStorage.getItem('token');
        let successMessage = [];
        let errorOccurred = false;

        // 1. Update Profile (Full Name)
        try {
            const profileRes = await fetch('/api/auth/me', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ full_name: user.full_name })
            });

            if (profileRes.ok) {
                successMessage.push("Profile details updated.");
            } else {
                errorOccurred = true;
                successMessage.push("Failed to update profile details.");
            }
        } catch (error) {
            errorOccurred = true;
            successMessage.push("Error updating profile.");
        }

        // 2. Update Password (if provided)
        if (passwords.current || passwords.new || passwords.confirm) {
            if (passwords.new !== passwords.confirm) {
                showModal("Validation Error", "New passwords do not match.", "warning");
                setLoading(false);
                return;
            }
            if (!passwords.current) {
                showModal("Validation Error", "Please enter your current password to change it.", "warning");
                setLoading(false);
                return;
            }

            try {
                const passRes = await fetch('/api/auth/password', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        old_password: passwords.current,
                        new_password: passwords.new
                    })
                });

                if (passRes.ok) {
                    successMessage.push("Password changed successfully.");
                    setPasswords({ current: '', new: '', confirm: '' });
                } else {
                    const errData = await passRes.json();
                    errorOccurred = true;
                    successMessage.push(`Password Update Failed: ${errData.detail || 'Unknown error'}`);
                }
            } catch (error) {
                errorOccurred = true;
                successMessage.push("Error updating password.");
            }
        }

        setLoading(false);

        if (errorOccurred) {
            showModal("Update Issues", successMessage.join("\n"), "danger");
        } else {
            showModal("Success", successMessage.join("\n"), "success");
        }
    };

    // --- Render ---

    const containerMaxWidth = activeTab === 'admin' ? 'max-w-4xl' : 'max-w-lg';

    return (
        <div className={`p-4 sm:p-6 lg:p-8 ${containerMaxWidth} mx-auto transition-all duration-300 ease-in-out`}>

            {/* Header & Tabs */}
            <div className="flex justify-between items-end mb-6">
                <h2 className="text-3xl font-bold text-[#3A5A80]">
                    {activeTab === 'profile' ? 'My Profile' : 'Admin Dashboard'}
                </h2>

                {user.is_admin && (
                    <div className="flex space-x-1 bg-white rounded-lg p-1 shadow-sm border border-gray-300">
                        <button
                            onClick={() => setActiveTab('profile')}
                            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'profile'
                                ? 'bg-[#5B84B1] text-white shadow-sm'
                                : 'text-gray-600 hover:bg-gray-100'
                                }`}
                        >
                            <User size={16} />
                            <span>Profile</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('admin')}
                            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'admin'
                                ? 'bg-[#5B84B1] text-white shadow-sm'
                                : 'text-gray-600 hover:bg-gray-100'
                                }`}
                        >
                            <Users size={16} />
                            <span>Admin</span>
                        </button>
                    </div>
                )}
            </div>

            <div className="bg-[#EDEDEB] shadow-xl rounded-xl p-8 border border-gray-500 overflow-hidden min-h-[500px]">

                {/* PROFILE TAB */}
                {activeTab === 'profile' && (
                    <form onSubmit={handleSaveProfile} className="space-y-6 animate-fadeIn">
                        <h3 className="text-xl font-semibold text-gray-700 border-b pb-2">User Details</h3>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Full Name</label>
                            <input
                                type="text"
                                value={user.full_name}
                                onChange={(e) => setUser({ ...user, full_name: e.target.value })}
                                className="mt-1 block w-full px-4 py-2 border border-gray-400 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Email Address</label>
                            <input
                                type="email"
                                value={user.email}
                                readOnly
                                className="mt-1 block w-full px-4 py-2 border border-gray-400 bg-[#E0E0DE] rounded-lg cursor-not-allowed text-gray-600"
                            />
                        </div>

                        <h3 className="text-xl font-semibold text-gray-700 border-b pb-2 pt-4">Change Password</h3>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Current Password</label>
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={passwords.current}
                                onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                                className="mt-1 block w-full px-4 py-2 border border-gray-400 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">New Password</label>
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={passwords.new}
                                onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                                className="mt-1 block w-full px-4 py-2 border border-gray-400 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={passwords.confirm}
                                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                                className="mt-1 block w-full px-4 py-2 border border-gray-400 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center items-center space-x-2 py-3 px-4 border border-gray-600 rounded-lg shadow-lg text-lg font-semibold text-white bg-[#5B84B1] hover:bg-[#4A6D94] transition duration-150 ease-in-out disabled:opacity-50"
                        >
                            {loading ? <span>Saving...</span> : <><Save size={20} /><span>Save All Changes</span></>}
                        </button>
                    </form>
                )}

                {/* ADMIN TAB */}
                {activeTab === 'admin' && (
                    <div className="animate-fadeIn">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-gray-700">User Management</h3>
                            <button onClick={fetchUsersList} className="text-sm text-[#3A5A80] hover:underline">Refresh List</button>
                        </div>

                        {adminLoading ? (
                            <div className="text-center py-10 text-gray-500">Loading users...</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-300">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Admin?</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {adminUsers.map((u) => (
                                            <tr key={u.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                    {u.full_name || 'No Name'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {u.email}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    <button
                                                        onClick={() => {
                                                            if (u.id === user.id) return; // Prevent self-toggle visual
                                                            handleRoleUpdate(u, !u.is_admin)
                                                        }}
                                                        disabled={u.id === user.id}
                                                        className={`flex items-center space-x-1 px-2 py-1 rounded border ${u.is_admin ? 'bg-green-100 border-green-300 text-green-800' : 'bg-gray-100 border-gray-300 text-gray-600'} ${u.id !== user.id ? 'hover:shadow-sm cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                                                    >
                                                        {u.is_admin ? <Check size={14} /> : <X size={14} />}
                                                        <span>{u.is_admin ? 'Yes' : 'No'}</span>
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    {u.id !== user.id && (
                                                        <button
                                                            onClick={() => confirmDeleteUser(u)}
                                                            className="text-red-600 hover:text-red-900 transition-colors"
                                                            title="Delete User"
                                                        >
                                                            <Trash size={18} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                onClose={modalConfig.onClose}
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
