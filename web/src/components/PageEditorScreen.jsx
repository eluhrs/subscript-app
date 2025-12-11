import React, { useState, useEffect } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';

const PageEditorScreen = ({ docId, setView }) => {
    const [editorUrl, setEditorUrl] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [docTitle, setDocTitle] = useState('');

    useEffect(() => {
        const fetchDocAndBuildUrl = async () => {
            if (!docId) {
                setError("No document ID provided");
                setLoading(false);
                return;
            }

            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    setView('login');
                    return;
                }

                const response = await fetch(`/api/documents/${docId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) {
                    throw new Error("Failed to load document");
                }

                const doc = await response.json();
                setDocTitle(doc.filename);

                // Logic from DashboardScreen to build URL
                let relPath = "";
                let sourcePath = doc.output_xml_path || doc.output_pdf_path || doc.output_txt_path || doc.filename;

                if (sourcePath) {
                    relPath = sourcePath
                        .replace(/^\/app\/documents\//, '')
                        .replace(/^documents\//, '');
                } else {
                    relPath = `unknown/${doc.filename}`;
                }

                let url = "";
                if (doc.is_container) {
                    const listPath = relPath.substring(0, relPath.lastIndexOf('.')) + ".lst";
                    url = `/editor/web-app/index.php?l=${encodeURI(listPath)}&docId=${doc.id}&token=${token}`;
                } else {
                    const xmlPath = relPath.substring(0, relPath.lastIndexOf('.')) + ".xml";
                    url = `/editor/web-app/index.php?f=${encodeURI(xmlPath)}&docId=${doc.id}&token=${token}`;
                }

                setEditorUrl(url);
            } catch (err) {
                console.error("Editor load error:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchDocAndBuildUrl();
    }, [docId, setView]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-[#EDEDEB]">
                <div className="text-[#3A5A80] font-medium text-lg animate-pulse">Loading Editor...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)] bg-[#EDEDEB] space-y-4">
                <div className="text-red-600 font-bold text-xl">Error Loading Editor</div>
                <div className="text-gray-600">{error}</div>
                <button
                    onClick={() => setView('dashboard')}
                    className="px-4 py-2 bg-[#5B84B1] text-white rounded hover:bg-[#4A6D94] transition"
                >
                    Back to Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-[#e5e5e5]">

            {/* Iframe Container */}
            <div className="flex-1 relative w-full overflow-hidden">
                <iframe
                    src={editorUrl}
                    title="Page Editor"
                    className="absolute inset-0 w-full h-full border-none"
                    allowFullScreen
                />
            </div>
        </div>
    );
};

export default PageEditorScreen;
