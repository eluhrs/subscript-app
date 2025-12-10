import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';


// --- Icon Definitions for Actions ---
const ActionIcons = ({ doc, onDownload, onDelete, onEdit, onUpdatePdf }) => (
    <div className="flex items-center space-x-1">
        {/* 1. Edit */}
        <div className="w-8 flex justify-center">
            <button
                onClick={() => onEdit(doc)}
                title={doc.is_container ? "Edit Group Layout" : "Edit Layout"}
                className="p-1 rounded-full text-blue-500 hover:text-blue-700 hover:bg-blue-100 transition"
            >
                <Pencil size={18} />
            </button>
        </div>

        {/* 2. Debug (B) */}
        <div className="w-8 flex justify-center">
            {doc.has_debug && !doc.is_container ? (
                <button
                    onClick={() => onDownload(doc.id, 'debug')}
                    title="Download Debug Image"
                    className="p-1 rounded-full hover:bg-red-50 transition flex items-center justify-center"
                >
                    <div className="w-4 h-4 rounded-sm bg-white border border-red-500 text-red-600 flex items-center justify-center text-[10px] font-bold leading-none">
                        B
                    </div>
                </button>
            ) : (
                <span className="text-gray-400 text-xs select-none">--</span>
            )}
        </div>

        {/* 3. Download TXT */}
        <div className="w-8 flex justify-center">
            {doc.output_txt_path ? (
                <button
                    onClick={() => onDownload(doc.id, 'txt')}
                    title="Download TXT"
                    className="p-1 rounded-full hover:bg-green-100 transition flex items-center justify-center"
                >
                    <img
                        src="https://placehold.co/18x18/10b981/fff?text=T"
                        alt="Download TXT"
                        className="w-4 h-4 rounded-sm"
                    />
                </button>
            ) : (
                <span className="text-gray-400 text-xs select-none">--</span>
            )}
        </div>

        {/* 4. XML (X) */}
        <div className="w-8 flex justify-center">
            {doc.has_xml && !doc.is_container ? (
                <button
                    onClick={() => onDownload(doc.id, 'xml')}
                    title="Download XML"
                    className="p-1 rounded-full hover:bg-gray-200 transition flex items-center justify-center"
                >
                    <div className="w-4 h-4 rounded-sm bg-black text-white flex items-center justify-center text-[10px] font-bold leading-none doc-icon-xml">
                        X
                    </div>
                </button>
            ) : (
                <span className="text-gray-400 text-xs select-none">--</span>
            )}
        </div>

        {/* 5. Download PDF */}
        <div className="w-8 flex justify-center">
            {doc.output_pdf_path ? (
                <button
                    onClick={() => onDownload(doc.id, 'pdf')}
                    title="Download PDF"
                    className="p-1 rounded-full hover:bg-red-100 transition flex items-center justify-center"
                >
                    <img
                        src="https://placehold.co/18x18/ef4444/fff?text=P"
                        alt="Download PDF"
                        className="w-4 h-4 rounded-sm"
                    />
                </button>
            ) : (
                <span className="text-gray-400 text-xs select-none">--</span>
            )}
        </div>

        {/* 6. Delete */}
        <div className="w-8 flex justify-center">
            <button
                onClick={() => onDelete(doc)}
                title="Delete"
                className="p-1 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition"
            >
                <Trash2 size={18} />
            </button>
        </div>
    </div>
);

const DashboardScreen = ({ setView }) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    console.log("DASHBOARD VERSION: 2026");

    // Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [docToDelete, setDocToDelete] = useState(null);

    useEffect(() => {
        fetchDocuments();
        const interval = setInterval(fetchDocuments, 1000); // Poll every 1 second
        return () => clearInterval(interval);
    }, []);

    const fetchDocuments = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/documents', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                setDocuments(data);
            } else if (response.status === 401) {
                console.error("Unauthorized");
            }
        } catch (error) {
            console.error("Failed to fetch documents", error);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (doc) => {
        // Construct the file path relative to the editor's 'data' directory
        let relPath = "";
        let sourcePath = doc.output_xml_path || doc.output_pdf_path || doc.output_txt_path || doc.filename;

        if (sourcePath) {
            relPath = sourcePath
                .replace(/^\/app\/documents\//, '')
                .replace(/^documents\//, '');
        } else {
            relPath = `unknown/${doc.filename}`;
        }

        const token = localStorage.getItem('token');
        let editorUrl = "";

        if (doc.is_container) {
            // For grouped docs, point to the .lst file
            // Filename: MyBook.pdf -> MyBook.lst (?)
            // Logic in backend: lst_base = os.path.splitext(clean_group_name)[0] + ".lst"
            // relPath currently: email/MyBook.pdf
            // We want: email/MyBook.lst

            // Strip extension and add .lst
            const listPath = relPath.substring(0, relPath.lastIndexOf('.')) + ".lst";
            editorUrl = `/editor/web-app/index.php?l=${encodeURI(listPath)}&docId=${doc.id}&token=${token}`;
        } else {
            // For single docs, point to .xml
            const xmlPath = relPath.substring(0, relPath.lastIndexOf('.')) + ".xml";
            editorUrl = `/editor/web-app/index.php?f=${encodeURI(xmlPath)}&docId=${doc.id}&token=${token}`;
        }

        window.open(editorUrl, '_blank');
    };

    const handleDownload = async (docId, type) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/download/${docId}/${type}?t=${new Date().getTime()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);

                if (['pdf', 'txt', 'xml', 'debug'].includes(type)) {
                    // Open in new tab
                    window.open(url, '_blank');
                } else {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `document.${type}`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }

                setTimeout(() => window.URL.revokeObjectURL(url), 1000);
            } else {
                alert("Download failed.");
            }
        } catch (error) {
            console.error("Download error", error);
            alert("Download error.");
        }
    };

    const handleUpdatePdf = async (docId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/rebuild-pdf/${docId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                fetchDocuments(); // Optimistic refresh
            } else {
                alert("Update failed.");
            }
        } catch (error) {
            console.error("Update error", error);
            alert("Update error.");
        }
    };

    // Open Modal
    const handleDeleteClick = (doc) => {
        setDocToDelete(doc);
        setDeleteModalOpen(true);
    };

    // Actual Delete Logic
    const confirmDelete = async () => {
        if (!docToDelete) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/documents/${docToDelete.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                fetchDocuments(); // Refresh list
            } else {
                alert("Delete failed.");
            }
        } catch (error) {
            console.error("Delete error", error);
            alert("Delete error.");
        } finally {
            setDeleteModalOpen(false);
            setDocToDelete(null);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return 'bg-green-100 text-green-800';
            case 'processing': return 'bg-yellow-100 text-yellow-800';
            case 'merging': return 'bg-yellow-100 text-yellow-800';
            case 'updating_pdf': return 'bg-yellow-100 text-yellow-800';
            case 'error': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusText = (status) => {
        switch (status) {
            case 'completed': return 'Ready to edit';
            case 'processing': return 'Transcribing';
            case 'merging': return 'Merging PDF';
            case 'updating_pdf': return 'Updating PDF';
            case 'error': return 'Error';
            default: return 'Queued';
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
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Modified</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {documents.map((doc) => (
                                <tr key={doc.id} className="hover:bg-indigo-50 transition duration-150">
                                    <td className="px-6 py-4 whitespace-nowrap w-20">
                                        {doc.thumbnail_url ? (
                                            <div
                                                onClick={() => handleDownload(doc.id, 'pdf')}
                                                className="w-12 h-16 bg-gray-100 rounded-md overflow-hidden border border-gray-200 cursor-pointer"
                                            >
                                                <img
                                                    src={`${doc.thumbnail_url}${doc.thumbnail_url.includes('?') ? '&' : '?'}token=${localStorage.getItem('token')}`}
                                                    alt="Thumbnail"
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/48x64/e5e7eb/a3a3a3?text=PDF"; }}
                                                />
                                            </div>
                                        ) : (
                                            <div className="w-12 h-16 bg-gray-200 rounded-md flex items-center justify-center text-gray-500 text-xs">...</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900">
                                        {doc.output_pdf_path ? (
                                            <button
                                                onClick={() => handleDownload(doc.id, 'pdf')}
                                                className="hover:text-indigo-600 hover:underline text-left"
                                            >
                                                {doc.filename}
                                            </button>
                                        ) : (
                                            <span>{doc.filename}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {new Date((doc.last_modified || doc.upload_date) + 'Z').toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-3 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(doc.status)}`}>
                                            {getStatusText(doc.status)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {doc.status === 'processing' || doc.status === 'merging' ? (
                                            <span className="text-gray-400 text-xs italic">
                                                Processing...
                                            </span>
                                        ) : doc.status === 'queued' ? (
                                            <button
                                                onClick={() => handleDeleteClick(doc)}
                                                title="Delete"
                                                className="p-1 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        ) : (
                                            <ActionIcons doc={doc} onDownload={handleDownload} onDelete={handleDeleteClick} onEdit={handleEdit} onUpdatePdf={handleUpdatePdf} />
                                        )}
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

            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Document"
                message={`Are you sure you want to delete "${docToDelete?.filename}"?\n\nThis action cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
                type="danger"
            />
        </div>
    );
};

export default DashboardScreen;
