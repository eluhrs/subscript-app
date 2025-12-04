import React from 'react';
import { Save, Plus } from 'lucide-react';

const ProfileScreen = ({ setView }) => {
    const handleSave = (e) => {
        e.preventDefault();
        alert('Profile updated successfully!');
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">My Profile</h2>
                <button
                    onClick={() => setView('new')}
                    className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition duration-150"
                >
                    <Plus size={20} />
                    <span>New Document</span>
                </button>
            </div>

            <div className="bg-white shadow-xl rounded-xl p-8">
                <form onSubmit={handleSave} className="space-y-6">
                    <h3 className="text-xl font-semibold text-gray-700 border-b pb-2">User Details</h3>

                    <div>
                        <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">Full Name</label>
                        <input id="fullName" type="text" defaultValue="Jane Doe" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>

                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
                        <input id="email" type="email" defaultValue="jane.doe@subscript.com" readOnly className="mt-1 block w-full px-4 py-2 border border-gray-300 bg-gray-50 rounded-lg cursor-not-allowed" />
                    </div>

                    <h3 className="text-xl font-semibold text-gray-700 border-b pb-2 pt-4">Change Password</h3>

                    <div>
                        <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">Current Password</label>
                        <input id="currentPassword" type="password" placeholder="••••••••" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>

                    <div>
                        <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">New Password</label>
                        <input id="newPassword" type="password" placeholder="••••••••" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>

                    <div>
                        <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                        <input id="confirmNewPassword" type="password" placeholder="••••••••" className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>

                    <button
                        type="submit"
                        className="w-full flex justify-center items-center space-x-2 py-3 px-4 border border-transparent rounded-lg shadow-lg text-lg font-semibold text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-150 ease-in-out"
                    >
                        <Save size={20} />
                        <span>Save All Changes</span>
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ProfileScreen;
