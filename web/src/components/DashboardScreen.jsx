import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';

// --- Icon Definitions for Actions ---
const ActionIcons = ({ doc }) => (
    <div className="flex space-x-2">
        {/* Edit */}
        <button title="Edit" className="p-1 rounded-full text-blue-500 hover:text-blue-700 hover:bg-blue-100 transition">
            <Pencil size={18} />
        </button>

        {/* Download TXT */}
        {doc.output_txt_path && (
            <a href={`/api/download/${doc.id}/txt`} target="_blank" rel="noreferrer" title="Download TXT" className="p-1 rounded-full hover:bg-green-100 transition flex items-center justify-center">
                <img
                    src="https://placehold.co/18x18/10b981/fff?text=T"
                    alt="Download TXT"
                    className="w-4 h-4 rounded-sm"
                />
            </a>
        )}

        {/* Download PDF */}
        {doc.output_pdf_path && (
            <a href={`/api/download/${doc.id}/pdf`} target="_blank" rel="noreferrer" title="Download PDF" className="p-1 rounded-full hover:bg-red-100 transition flex items-center justify-center">
                <img
                    src="https://placehold.co/18x18/ef4444/fff?text=P"
                    alt="Download PDF"
                    className="w-4 h-4 rounded-sm"
                />
            </a>
        )}

        {/* Delete */}
        <button title="Delete" className="p-1 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition">
            <Trash2 size={18} />
        </button>
    </div>
);

const DashboardScreen = ({ setView }) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDocuments();
        const interval = setInterval(fetchDocuments, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, []);

    const fetchDocuments = async () => {
        try {
            const response = await fetch('/api/documents');
            if (response.ok) {
                const data = await response.json();
                setDocuments(data);
            }
        } catch (error) {
            console.error("Failed to fetch documents", error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return 'bg-green-100 text-green-800';
            case 'processing': return 'bg-yellow-100 text-yellow-800';
            case 'error': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">Dashboard</h2>
                <button
                    onClick={() => setView('new')}
                    className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition duration-150"
                >
                    <Plus size={20} />
                    <span>New Document</span>
                </button>
            </div>

            <div className="bg-white shadow-xl rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Preview</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Filename</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Upload Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {documents.map((doc) => (
                                <tr key={doc.id} className="hover:bg-indigo-50 transition duration-150">
                                    <td className="px-6 py-4 whitespace-nowrap w-20">
                                        <div className="w-12 h-16 bg-gray-200 rounded-md flex items-center justify-center text-gray-500 text-xs">PDF</div>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900">{doc.filename}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(doc.upload_date).toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-3 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(doc.status)}`}>
                                            {doc.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <ActionIcons doc={doc} />
                                    </td>
                                </tr>
                            ))}
                            {documents.length === 0 && !loading && (
                                <tr>
                                    <td colSpan="5" className="px-6 py-4 text-center text-gray-500">No documents found. Upload one to get started.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default DashboardScreen;
