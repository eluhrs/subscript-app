import React, { useState } from 'react';
import { UploadCloud } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';

const NewDocumentScreen = ({ setView }) => {
    const [selectedModel, setSelectedModel] = useState('gemini-pro-3');
    const [files, setFiles] = useState([]); // Array of { file: File, preview: string, id: string }
    const [pdfFilename, setPdfFilename] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

    // Modal State
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
        onClose: () => { }
    });

    // Cleanup previews on unmount
    React.useEffect(() => {
        return () => {
            files.forEach(f => URL.revokeObjectURL(f.preview));
        };
    }, []);

    const processFiles = (newFiles) => {
        const processed = Array.from(newFiles).map(file => ({
            file,
            preview: URL.createObjectURL(file),
            id: Math.random().toString(36).substring(7)
        }));
        setFiles(prev => [...prev, ...processed]);
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
        }
    };

    const removeFile = (e, id) => {
        e.stopPropagation(); // Prevent opening file dialog
        setFiles(prev => {
            const fileToRemove = prev.find(f => f.id === id);
            if (fileToRemove) {
                URL.revokeObjectURL(fileToRemove.preview);
            }
            return prev.filter(f => f.id !== id);
        });
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

    const handleBeginTranscribing = async () => {
        if (files.length === 0) {
            showModal("Missing File", "Please select one or more files to upload.", "warning");
            return;
        }

        const token = localStorage.getItem('token');
        setUploading(true);
        setUploadProgress({ current: 0, total: files.length });

        // Phase 2: Batch Upload (if filename provided)
        if (pdfFilename && pdfFilename.trim() !== '') {
            try {
                const formData = new FormData();
                files.forEach(item => formData.append('files', item.file));
                formData.append('model', selectedModel);
                formData.append('group_filename', pdfFilename);

                const response = await fetch('/api/upload-batch', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData,
                });

                if (response.ok) {
                    showModal(
                        "Batch Upload Successful",
                        `Successfully uploaded ${files.length} pages as "${pdfFilename}".\n\nThey have been added to the queue.`,
                        "success",
                        () => setView('dashboard')
                    );
                } else {
                    const errData = await response.json();
                    showModal("Upload Failed", errData.detail || response.statusText, "danger");
                }
            } catch (error) {
                console.error("Batch upload error", error);
                showModal("Upload Error", error.message, "danger");
            } finally {
                setUploading(false);
            }
            return;
        }

        // Phase 1: Bulk Upload (Loop)
        let successCount = 0;
        let failCount = 0;
        let errors = [];

        for (let i = 0; i < files.length; i++) {
            const item = files[i];
            setUploadProgress({ current: i + 1, total: files.length });

            const formData = new FormData();
            formData.append('file', item.file);
            formData.append('model', selectedModel);

            try {
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData,
                });

                if (response.ok) {
                    successCount++;
                } else {
                    const errData = await response.json();
                    failCount++;
                    errors.push(`${item.file.name}: ${errData.detail || response.statusText}`);
                }
            } catch (error) {
                console.error("Upload error", error);
                failCount++;
                errors.push(`${item.file.name}: ${error.message}`);
            }
        }

        setUploading(false);

        if (failCount === 0) {
            showModal(
                "Upload Successful",
                `Successfully uploaded ${successCount} document(s).\n\nThey have been added to the queue.`,
                "success",
                () => setView('dashboard')
            );
        } else {
            showModal(
                "Upload Completed with Errors",
                `Success: ${successCount}\nFailed: ${failCount}\n\nErrors:\n${errors.join('\n')}`,
                "warning",
                () => { if (successCount > 0) setView('dashboard'); }
            );
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: #9ca3af; /* gray-400 */
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background-color: #6b7280; /* gray-500 */
                }
            `}</style>
            <h2 className="text-3xl font-bold text-[#3A5A80] mb-6">New Document</h2>

            <div className="bg-[#EDEDEB] shadow-xl rounded-xl p-6 border border-gray-500">
                {/* Drag and Drop Area */}
                <div
                    className="border-4 border-dashed border-[#5B84B1] rounded-xl bg-white hover:border-[#3A5A80] transition duration-300 relative overflow-hidden"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    <input
                        id="file-upload"
                        type="file"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        accept=".pdf,.jpg,.jpeg,.png"
                        multiple
                    />

                    {files.length === 0 ? (
                        <div className="p-12 text-center pointer-events-none flex flex-col items-center justify-center">
                            <UploadCloud className="mx-auto h-12 w-12 text-[#5B84B1] mb-3" />
                            <p className="text-lg font-medium text-gray-900">
                                Drag & Drop Your Images
                            </p>
                            <p className="text-sm text-gray-500">JPG and PNG formats supported</p>
                            <button
                                onClick={() => document.getElementById('file-upload').click()}
                                className="mt-6 px-6 py-2 bg-[#5B84B1] text-white font-semibold rounded-lg shadow-md hover:bg-[#3A5A80] transition pointer-events-auto relative z-20"
                            >
                                Select Images
                            </button>
                        </div>
                    ) : (
                        <div className="p-4 pointer-events-auto">
                            <div className="max-h-[300px] overflow-y-auto pr-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 custom-scrollbar relative z-20">
                                {files.map((item) => (
                                    <div key={item.id} className="relative group aspect-[3/4] bg-white rounded-lg border border-gray-300 overflow-hidden shadow-sm flex flex-col">
                                        <div className="absolute top-1 right-1 z-30 opacity-100">
                                            <button
                                                onClick={(e) => removeFile(e, item.id)}
                                                className="bg-[#C75146] text-white rounded-full p-1 hover:bg-[#A83F35] transition shadow-sm"
                                                title="Remove file"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                                </svg>
                                            </button>
                                        </div>

                                        {/* Preview Area */}
                                        <div className="flex-1 relative overflow-hidden bg-gray-100 flex items-center justify-center">
                                            {item.file.type.startsWith('image/') ? (
                                                <img src={item.preview} alt={item.file.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-xs font-bold text-gray-500 uppercase">{item.file.name.split('.').pop()}</span>
                                            )}
                                        </div>

                                        {/* Filename Footer */}
                                        <div className="bg-white flex items-center justify-center py-1 px-1 w-full">
                                            <span className="text-[9px] text-gray-500 truncate font-medium w-full text-center" title={item.file.name}>
                                                {item.file.name}
                                            </span>
                                        </div>
                                    </div>
                                ))}

                                {/* Add More Card */}
                                <div
                                    onClick={(e) => { e.stopPropagation(); document.getElementById('file-upload').click(); }}
                                    className="aspect-[3/4] rounded-lg border-2 border-dashed border-[#5B84B1] hover:border-[#3A5A80] hover:bg-gray-50 flex flex-col items-center justify-center cursor-pointer transition group"
                                >
                                    <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-indigo-50 flex items-center justify-center mb-2 transition">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#5B84B1] group-hover:text-[#3A5A80]">
                                            <line x1="12" y1="5" x2="12" y2="19"></line>
                                            <line x1="5" y1="12" x2="19" y2="12"></line>
                                        </svg>
                                    </div>
                                    <span className="text-xs font-medium text-gray-500 group-hover:text-[#3A5A80]">Add File</span>
                                </div>
                            </div>
                            <div className="mt-4 text-center text-sm text-gray-500 pointer-events-none">
                                <p>Drag more files or use the Add button</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Model Selection and PDF Filename */}
                <div className="pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Select Transcription Model</label>
                            <select
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                                className="block w-full pl-3 pr-10 py-2 text-base border-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border"
                            >
                                <option value="gemini-pro-3">Gemini 3.0 Pro</option>
                                <option value="gemini-pro-2.5">Gemini 2.5 Pro</option>
                                <option value="gemini-flash-2.5">Gemini 2.5 Flash</option>
                                <option value="gemini-flash-lite-2.5">Gemini 2.5 Flash Lite</option>
                                <option value="openai-gpt-4o">OpenAI GPT-4o</option>
                                <option value="claude-sonnet-4.5">Claude 3.5 Sonnet</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Optionally merge all images into a single PDF</label>
                            <input
                                type="text"
                                placeholder="e.g. my_book.pdf"
                                value={pdfFilename}
                                onChange={(e) => setPdfFilename(e.target.value)}
                                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-400 rounded-md border px-3 py-2"
                            />
                        </div>
                    </div>
                </div>

                {/* Action Button */}
                <button
                    onClick={handleBeginTranscribing}
                    disabled={uploading}
                    className="w-full flex justify-center py-3 px-4 border border-gray-600 rounded-lg shadow-lg text-lg font-semibold text-white bg-[#5B84B1] hover:bg-[#4A6D94] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out mt-6 disabled:opacity-50"
                >
                    {uploading
                        ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...`
                        : `Begin Transcribing ${files.length > 0 ? `(${files.length} Files)` : ''}`}
                </button>
            </div>

            {/* Reusable Modal */}
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

export default NewDocumentScreen;
