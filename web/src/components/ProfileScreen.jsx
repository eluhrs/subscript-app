import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';

const ProfileScreen = ({ setView }) => {
    const [user, setUser] = useState({ full_name: '', email: '' });
    const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
    const [loading, setLoading] = useState(false);

    // Modal State
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
        onClose: () => { }
    });

    useEffect(() => {
        fetchUserData();
    }, []);

    const fetchUserData = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setUser({
                    full_name: data.full_name || '',
                    email: data.email || ''
                });
            } else {
                console.error("Failed to fetch user");
            }
        } catch (error) {
            console.error("Error fetching user", error);
        }
    };

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

    const handleSave = async (e) => {
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
                    setPasswords({ current: '', new: '', confirm: '' }); // Clear fields
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

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-[#3A5A80]">My Profile</h2>
            </div>

            <div className="bg-[#EDEDEB] shadow-xl rounded-xl p-8 border border-gray-500">
                <form onSubmit={handleSave} className="space-y-6">
                    <h3 className="text-xl font-semibold text-gray-700 border-b pb-2">User Details</h3>

                    <div>
                        <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">Full Name</label>
                        <input
                            id="fullName"
                            type="text"
                            value={user.full_name}
                            onChange={(e) => setUser({ ...user, full_name: e.target.value })}
                            className="mt-1 block w-full px-4 py-2 border border-gray-400 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>

                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
                        <input
                            id="email"
                            type="email"
                            value={user.email}
                            readOnly
                            className="mt-1 block w-full px-4 py-2 border border-gray-400 bg-[#E0E0DE] rounded-lg cursor-not-allowed text-gray-600"
                        />
                    </div>

                    <h3 className="text-xl font-semibold text-gray-700 border-b pb-2 pt-4">Change Password</h3>

                    <div>
                        <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">Current Password</label>
                        <input
                            id="currentPassword"
                            type="password"
                            placeholder="••••••••"
                            value={passwords.current}
                            onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                            className="mt-1 block w-full px-4 py-2 border border-gray-400 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>

                    <div>
                        <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">New Password</label>
                        <input
                            id="newPassword"
                            type="password"
                            placeholder="••••••••"
                            value={passwords.new}
                            onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                            className="mt-1 block w-full px-4 py-2 border border-gray-400 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>

                    <div>
                        <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                        <input
                            id="confirmNewPassword"
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
                        className="w-full flex justify-center items-center space-x-2 py-3 px-4 border border-gray-600 rounded-lg shadow-lg text-lg font-semibold text-white bg-[#5B84B1] hover:bg-[#4A6D94] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out disabled:opacity-50"
                    >
                        {loading ? (
                            <span>Saving...</span>
                        ) : (
                            <>
                                <Save size={20} />
                                <span>Save All Changes</span>
                            </>
                        )}
                    </button>
                </form>
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
        </div>
    );
};

export default ProfileScreen;
