import React, { useState } from 'react';
import { UploadCloud, MessageSquare, ChevronDown, SlidersHorizontal, RotateCcw } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';

// Fallback icon to avoid version conflicts
const CircleHelp = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
    </svg>
);

const NewDocumentScreen = ({ setView }) => {
    const [selectedModel, setSelectedModel] = useState('');
    const [availableModels, setAvailableModels] = useState([]);
    const [files, setFiles] = useState([]); // Array of { file: File, preview: string, id: string }
    const [pdfFilename, setPdfFilename] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

    // Fetch Preferences (Models)
    React.useEffect(() => {
        const fetchPreferences = async () => {
            const token = localStorage.getItem('token');
            try {
                const response = await fetch('/api/preferences', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setAvailableModels(data.available_models || []);
                    // Set default from preference/config
                    if (data.subscript_model) {
                        setSelectedModel(data.subscript_model);
                    } else if (data.available_models && data.available_models.length > 0) {
                        setSelectedModel(data.available_models[0].id);
                    }
                    if (data.subscript_prompt) setSystemPrompt(data.subscript_prompt);
                }
            } catch (error) {
                console.error("Failed to load preferences:", error);
            }
        };
        fetchPreferences();
    }, []);

    // Options State
    const [showOptions, setShowOptions] = useState(false);
    const [systemPrompt, setSystemPrompt] = useState('');
    const [activeHelpSection, setActiveHelpSection] = useState(null);

    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
        onClose: () => { }
    });

    // Fetch Preferences (Models)
    React.useEffect(() => {
        const fetchPreferences = async () => {
            const token = localStorage.getItem('token');
            try {
                const response = await fetch('/api/preferences', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setAvailableModels(data.available_models || []);
                    // Set default from preference/config
                    if (data.subscript_model) {
                        setSelectedModel(data.subscript_model);
                    } else if (data.available_models && data.available_models.length > 0) {
                        setSelectedModel(data.available_models[0].id);
                    }
                    if (data.subscript_prompt) setSystemPrompt(data.subscript_prompt);
                }
            } catch (error) {
                console.error("Failed to load preferences:", error);
            }
        };
        fetchPreferences();
    }, []);

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
                                {availableModels.map(model => (
                                    <option key={model.id} value={model.id}>
                                        {model.name}
                                    </option>
                                ))}
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

                {/* Advanced Settings Toggle */}
                <div className="bg-white rounded-lg border border-gray-300 overflow-hidden shadow-sm mt-6">
                    <button onClick={() => setShowOptions(!showOptions)} className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition text-left">
                        <div className="flex items-center gap-2">
                            <SlidersHorizontal className="h-4 w-4 text-[#3A5A80]" />
                            <span className="font-semibold text-gray-700 text-sm">Advanced Options</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showOptions ? 'rotate-180' : ''}`} />
                        </div>
                    </button>

                    {/* Options Panel */}
                    {showOptions && (
                        <div className="border-t border-gray-200 bg-white p-4">
                            <div className="mb-4">
                                <div className="flex items-center justify-between mb-2 border-b border-gray-200 pb-1">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                        <MessageSquare className="h-3 w-3" /> System Prompt
                                    </h4>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => setActiveHelpSection(activeHelpSection === 'prompt' ? null : 'prompt')} className="text-gray-400 hover:text-[#5B84B1] transition">
                                            <CircleHelp className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                                {activeHelpSection === 'prompt' && (
                                    <div className="bg-[#F0F4F8] text-[#3A5A80] text-[10px] p-2 rounded mb-2 border border-[#DAE1E7]">
                                        The system enforces JSON output for layout preservation. Use this prompt to modify transcription <em>style</em> (e.g., 'Modernize spelling') but not output format.
                                    </div>
                                )}
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-xs font-medium text-gray-700">Custom Instructions</label>
                                    <button onClick={() => setSystemPrompt('')} className="text-xs text-red-500 hover:text-red-700 hover:underline flex items-center gap-1">
                                        <RotateCcw className="h-3 w-3" /> Clear
                                    </button>
                                </div>
                                <textarea
                                    rows="4"
                                    value={systemPrompt}
                                    onChange={(e) => setSystemPrompt(e.target.value)}
                                    placeholder="Enter custom system instructions..."
                                    className="w-full p-3 border border-gray-300 rounded text-[10px] font-mono focus:ring-1 focus:ring-[#5B84B1] outline-none leading-relaxed"
                                    spellCheck="false"
                                />
                            </div>
                        </div>
                    )}
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
