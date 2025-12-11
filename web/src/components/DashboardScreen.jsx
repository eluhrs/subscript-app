import React, { useState, useEffect, useRef } from 'react';
import { Pencil, Trash2, Share2, FolderOpen, FileText, Code, AlignLeft, Map, Eye, Download, Archive, MoreVertical } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';

const DashboardScreen = ({ setView, setEditorDocId }) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    // Track which row has its "Files" menu open
    const [activeMenuDocId, setActiveMenuDocId] = useState(null);
    const menuRef = useRef(null);

    // Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [docToDelete, setDocToDelete] = useState(null);

    useEffect(() => {
        fetchDocuments();
        const interval = setInterval(fetchDocuments, 1000); // Poll every 1 second
        return () => clearInterval(interval);
    }, []);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setActiveMenuDocId(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchDocuments = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/documents', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setDocuments(data);
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
            }
        } catch (error) {
            console.error("Failed to fetch documents", error);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (doc) => {
        setEditorDocId(doc.id);
        setView('page-editor');
    };

    const handleFileAction = async (docId, type, action) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/download/${docId}/${type}?t=${new Date().getTime()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                // For 'view', we want to open in new tab if browser supports it
                if (action === 'view') {
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    window.open(url, '_blank');
                    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
                } else {
                    // For download, we rely on the backend Content-Disposition header
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;

                    // Extract filename from header if present
                    const contentDisposition = response.headers.get('Content-Disposition');
                    let filename = `document_${docId}.${type}`;
                    if (contentDisposition) {
                        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                        if (filenameMatch && filenameMatch.length === 2)
                            filename = filenameMatch[1];
                    } else {
                        // Fallback logic
                        if (type === 'debug') filename = `debug-${docId}.jpg`;
                        if (type === 'zip') filename = `assets-${docId}.zip`;
                    }

                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
                }
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
            } else {
                alert("Action failed: " + response.statusText);
            }
        } catch (error) {
            console.error("Action error", error);
            alert("Action failed.");
        }
    };

    // Open Modal
    const handleDeleteClick = (doc) => {
        setDocToDelete(doc);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!docToDelete) return;
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/documents/${docToDelete.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                fetchDocuments();
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
            } else {
                alert("Delete failed.");
            }
        } catch (error) {
            console.error("Delete error", error);
        } finally {
            setDeleteModalOpen(false);
            setDocToDelete(null);
        }
    };

    const handleShare = async (doc) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/documents/${doc.id}/share`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                const shareUrl = `${window.location.origin}/s/${data.share_token}`;
                navigator.clipboard.writeText(shareUrl);
                alert("Share link copied to clipboard!\n" + shareUrl);
            } else if (response.status === 401) {
                window.dispatchEvent(new Event('auth:unauthorized'));
            } else {
                alert("Share failed.");
            }
        } catch (error) {
            console.error("Share error", error);
            alert("Share failed.");
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto pb-40">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-[#3A5A80]">Dashboard</h2>
            </div>

            <div className="space-y-4">
                {documents.map((doc) => (
                    <div key={doc.id} className="bg-[#EDEDEB] rounded-xl shadow-lg border border-gray-400 overflow-visible relative">
                        <div className="flex items-center px-4 py-4 gap-4">

                            {/* Thumbnail */}
                            <div className="w-16 flex-shrink-0">
                                <div className="w-12 h-16 bg-white rounded border border-gray-500 shadow-sm overflow-hidden relative cursor-pointer"
                                    onClick={() => handleFileAction(doc.id, 'pdf', 'view')}>
                                    {doc.thumbnail_url ? (
                                        <img
                                            src={`${doc.thumbnail_url}${doc.thumbnail_url.includes('?') ? '&' : '?'}token=${localStorage.getItem('token')}`}
                                            alt="Thumbnail"
                                            className="w-full h-full object-cover"
                                            onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/48x64/eee/999?text=IMG"; }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-100 text-xs text-gray-400">...</div>
                                    )}
                                </div>
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0 mr-4">
                                <h4 className="text-lg font-semibold text-gray-900 truncate" title={doc.filename}>
                                    {doc.filename}
                                </h4>
                                <div className="flex items-center gap-3 text-sm text-gray-500 mt-1 font-medium">
                                    <span>{new Date((doc.last_modified || doc.upload_date) + 'Z').toLocaleDateString()} <span className="text-xs ml-0.5">{new Date((doc.last_modified || doc.upload_date) + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>
                                    <span className="w-1 h-1 rounded-full bg-gray-400"></span>
                                    {doc.status === 'completed' && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-medium border border-green-200">Ready</span>}
                                    {doc.status === 'processing' && <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium border border-yellow-200">Processing</span>}
                                    {doc.status === 'merging' && <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium border border-yellow-200">Merging</span>}
                                    {doc.status === 'updating_pdf' && <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium border border-yellow-200">Updating PDF</span>}
                                    {doc.status === 'error' && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-medium border border-red-200">Error</span>}
                                    {doc.status === 'queued' && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 text-xs font-medium border border-gray-200">Queued</span>}
                                </div>
                            </div>

                            {/* Actions Toolbar */}
                            <div className="flex items-center bg-[#F7F7F5] rounded-lg p-1 gap-1">

                                <button onClick={() => handleEdit(doc)} className="flex flex-col items-center justify-center w-12 h-10 hover:bg-[#E0E0DE] rounded text-gray-700 transition" title="Edit">
                                    <Pencil size={16} className="mb-0.5" />
                                    <span className="text-[9px] font-medium">Edit</span>
                                </button>

                                <div className="w-px h-6 bg-gray-300"></div>

                                <button onClick={() => handleShare(doc)} className="flex flex-col items-center justify-center w-12 h-10 hover:bg-[#E0E0DE] rounded text-gray-700 transition" title="Share (Public Link)">
                                    <Share2 size={16} className="mb-0.5" />
                                    <span className="text-[9px] font-medium">Share</span>
                                </button>

                                <div className="w-px h-6 bg-gray-300"></div>

                                {/* Files Menu Trigger */}
                                <div className="relative">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenuDocId(activeMenuDocId === doc.id ? null : doc.id);
                                        }}
                                        className={`flex flex-col items-center justify-center w-14 h-10 rounded transition ${activeMenuDocId === doc.id ? 'bg-[#E0E0DE] text-[#3A5A80]' : 'bg-[#F7F7F5] text-[#3A5A80] hover:bg-[#E0E0DE]'}`}
                                    >
                                        <FolderOpen size={16} className="mb-0.5" />
                                        <span className="text-[9px] font-medium">Files ▼</span>
                                    </button>

                                    {/* Files Popover */}
                                    {activeMenuDocId === doc.id && (
                                        <div ref={menuRef} className="absolute right-0 top-12 w-64 bg-[#F7F7F5] border-0 rounded-lg shadow-xl z-50 p-2 ring-1 ring-gray-200">
                                            {/* MAP (Debug) */}
                                            <div className="flex items-center justify-between p-2 hover:bg-[#E0E0DE] rounded">
                                                <div className="flex items-center gap-2">
                                                    <Map size={16} className="text-purple-500" />
                                                    <span className="text-sm font-medium text-gray-700">MAP</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    <button onClick={() => handleFileAction(doc.id, 'debug', 'view')} className="p-1.5 hover:bg-blue-100 text-blue-600 rounded"><Eye size={14} /></button>
                                                    <button onClick={() => handleFileAction(doc.id, 'debug', 'download')} className="p-1.5 hover:bg-gray-200 text-gray-600 rounded"><Download size={14} /></button>
                                                </div>
                                            </div>
                                            {/* TXT */}
                                            <div className="flex items-center justify-between p-2 hover:bg-[#E0E0DE] rounded">
                                                <div className="flex items-center gap-2">
                                                    <AlignLeft size={16} className="text-gray-500" />
                                                    <span className="text-sm font-medium text-gray-700">TXT</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    <button onClick={() => handleFileAction(doc.id, 'txt', 'view')} className="p-1.5 hover:bg-blue-100 text-blue-600 rounded"><Eye size={14} /></button>
                                                    <button onClick={() => handleFileAction(doc.id, 'txt', 'download')} className="p-1.5 hover:bg-gray-200 text-gray-600 rounded"><Download size={14} /></button>
                                                </div>
                                            </div>
                                            {/* XML */}
                                            <div className="flex items-center justify-between p-2 hover:bg-[#E0E0DE] rounded">
                                                <div className="flex items-center gap-2">
                                                    <Code size={16} className="text-orange-500" />
                                                    <span className="text-sm font-medium text-gray-700">XML</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    <button onClick={() => handleFileAction(doc.id, 'xml', 'view')} className="p-1.5 hover:bg-blue-100 text-blue-600 rounded"><Eye size={14} /></button>
                                                    <button onClick={() => handleFileAction(doc.id, 'xml', 'download')} className="p-1.5 hover:bg-gray-200 text-gray-600 rounded"><Download size={14} /></button>
                                                </div>
                                            </div>
                                            {/* PDF */}
                                            <div className="flex items-center justify-between p-2 hover:bg-[#E0E0DE] rounded">
                                                <div className="flex items-center gap-2">
                                                    <FileText size={16} className="text-red-500" />
                                                    <span className="text-sm font-medium text-gray-700">PDF</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    <button onClick={() => handleFileAction(doc.id, 'pdf', 'view')} className="p-1.5 hover:bg-blue-100 text-blue-600 rounded" title="View"><Eye size={14} /></button>
                                                    <button onClick={() => handleFileAction(doc.id, 'pdf', 'download')} className="p-1.5 hover:bg-gray-200 text-gray-600 rounded" title="Download"><Download size={14} /></button>
                                                </div>
                                            </div>

                                            <div className="border-t border-gray-300 my-1"></div>

                                            {/* Download All */}
                                            <button
                                                onClick={() => handleFileAction(doc.id, 'zip', 'download')}
                                                className="w-full block p-2 text-center text-xs font-bold text-white bg-[#3A5A80] hover:bg-[#2A4A70] rounded shadow-sm transition"
                                            >
                                                Download All Assets (ZIP)
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="w-px h-6 bg-gray-300"></div>

                                <button onClick={() => handleDeleteClick(doc)} className="flex flex-col items-center justify-center w-12 h-10 hover:bg-red-50 text-red-600 rounded transition" title="Delete">
                                    <Trash2 size={16} className="mb-0.5" />
                                    <span className="text-[9px] font-medium">Del</span>
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {documents.length === 0 && !loading && (
                    <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                        <p>No documents found. Upload one to get started.</p>
                    </div>
                )}
            </div>

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
