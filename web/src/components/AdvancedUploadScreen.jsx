import React, { useState, useEffect } from 'react';
import { UploadCloud, MessageSquare, ChevronDown, SlidersHorizontal, RotateCcw, FilePlus, CircleHelp } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';

const AdvancedUploadScreen = ({ setView }) => {
    // Basic Upload State
    const [files, setFiles] = useState([]); // Array of { file: File, preview: string, id: string }
    const [pdfFilename, setPdfFilename] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

    // Options State (Sticky)
    const [showOptions, setShowOptions] = useState(false);

    // Sticky Settings Initialization
    const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('subscript_model') || 'gemini-pro-3');
    const [temperature, setTemperature] = useState(() => parseFloat(localStorage.getItem('subscript_temp') || '0.8'));
    const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem('subscript_prompt') || '');

    // Modal State
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
        onClose: () => { }
    });

    // Cleanup previews on unmount
    useEffect(() => {
        return () => {
            files.forEach(f => URL.revokeObjectURL(f.preview));
        };
    }, []);

    // Save Sticky Settings
    useEffect(() => {
        localStorage.setItem('subscript_model', selectedModel);
    }, [selectedModel]);

    useEffect(() => {
        localStorage.setItem('subscript_temp', temperature.toString());
    }, [temperature]);

    useEffect(() => {
        localStorage.setItem('subscript_prompt', systemPrompt);
    }, [systemPrompt]);

    const handleResetDefaults = () => {
        setSelectedModel('gemini-pro-3');
        setTemperature(0.8);
        setSystemPrompt('');
        localStorage.removeItem('subscript_model');
        localStorage.removeItem('subscript_temp');
        localStorage.removeItem('subscript_prompt');
    };

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

                // Construct options JSON
                const options = {
                    transcription: {
                        prompt: systemPrompt.trim() ? systemPrompt : undefined,
                        temperature: temperature
                    }
                };
                formData.append('options', JSON.stringify(options));

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

            // Construct options JSON
            const options = {
                transcription: {
                    prompt: systemPrompt.trim() ? systemPrompt : undefined,
                    temperature: temperature
                }
            };
            formData.append('options', JSON.stringify(options));

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
                
                input[type=range] {
                    -webkit-appearance: none;
                    width: 100%;
                    background: transparent;
                }
                input[type=range]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    height: 16px;
                    width: 16px;
                    border-radius: 50%;
                    background: #5B84B1;
                    cursor: pointer;
                    margin-top: -6px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                }
                input[type=range]::-webkit-slider-runnable-track {
                    width: 100%;
                    height: 4px;
                    cursor: pointer;
                    background: #E5E7EB;
                    border-radius: 2px;
                }

                /* Styles for Custom Tooltip Logic */
                .tooltip-trigger:hover + .custom-tooltip,
                .custom-tooltip:hover {
                    opacity: 1;
                    visibility: visible;
                }
            `}</style>

            <h2 className="text-3xl font-bold text-[#3A5A80] mb-6">New Document</h2>

            <div className="bg-[#EDEDEB] shadow-xl rounded-xl p-6 border border-gray-500">
                {/* Drag and Drop Area */}
                <div
                    className="border-4 border-dashed border-[#5B84B1] rounded-xl bg-white hover:border-[#3A5A80] transition duration-300 relative overflow-hidden mb-6"
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

                {/* Main Controls Row: Options + Filename */}
                <div className="flex items-center gap-4 mb-2">

                    {/* Options Toggle Button */}
                    <button
                        onClick={() => setShowOptions(!showOptions)}
                        className="flex items-center gap-2 px-3 py-2 bg-[#f3f4f6] border border-gray-300 rounded-lg hover:bg-white hover:border-gray-400 transition shadow-sm text-gray-700 hover:text-[#3A5A80] hover:shadow-md"
                    >
                        <SlidersHorizontal className="h-4 w-4" />
                        <span className="text-xs font-semibold uppercase tracking-wide">Options</span>
                        <ChevronDown className={`h-3 w-3 transition-transform ${showOptions ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Filename Input */}
                    <div className="flex items-center gap-2 flex-grow">
                        <label className="text-sm font-bold text-gray-600 whitespace-nowrap">Filename:</label>
                        <div className="relative flex-grow">
                            <input
                                type="text"
                                value={pdfFilename}
                                onChange={(e) => setPdfFilename(e.target.value)}
                                placeholder="Optionally merge multiple images into a single PDF file"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5B84B1] focus:border-[#5B84B1] outline-none text-sm shadow-sm placeholder-gray-400"
                            />
                        </div>
                    </div>
                </div>

                {/* Advanced Options Panel */}
                <div className={`transform transition-all duration-300 ease-in-out ${showOptions ? 'opacity-100 max-h-[500px]' : 'opacity-0 max-h-0 hidden'}`}>
                    <div className="bg-gray-100 rounded-lg border border-gray-300 shadow-inner p-4 mt-2 relative">

                        {/* Reset Defaults */}
                        <button
                            onClick={handleResetDefaults}
                            className="absolute top-2 right-5 text-[10px] text-red-500 hover:text-red-700 hover:underline flex items-center gap-1 z-10 font-bold bg-gray-100 px-2 rounded"
                        >
                            <RotateCcw className="h-3 w-3" /> Reset Defaults
                        </button>

                        <fieldset style={{ padding: '1.25rem' }} className="border border-gray-300 rounded-lg mt-8 bg-[#E5E7EB]">
                            <legend className="px-2 text-xs font-bold text-gray-600 uppercase tracking-wider">Model & Behavior Settings</legend>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

                                {/* Model Selection */}
                                <div className="bg-white border border-gray-300 rounded p-4 shadow-sm relative group">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-semibold text-gray-600 flex items-center gap-2">
                                            Model
                                        </label>

                                        <CircleHelp className="tooltip-trigger h-3 w-3 text-gray-400 hover:text-[#5B84B1] cursor-help z-20 relative" />

                                        <div className="custom-tooltip absolute top-0 left-0 w-full h-full bg-white bg-opacity-95 backdrop-blur-sm p-4 rounded border border-blue-100 shadow-lg text-[10px] text-gray-700 flex items-center z-10 opacity-0 invisible transition-all duration-200">
                                            <div>
                                                Selects the underlying AI engine. <strong>Pro</strong> models generally provide higher accuracy for difficult handwriting or complex layouts, while <strong>Flash</strong> models are faster and more cost-effective.
                                            </div>
                                        </div>
                                    </div>
                                    <select
                                        value={selectedModel}
                                        onChange={(e) => setSelectedModel(e.target.value)}
                                        className="block w-full pl-2 pr-8 py-2 text-xs border-gray-300 rounded border focus:ring-[#5B84B1] focus:border-[#5B84B1] relative z-0"
                                    >
                                        <option value="gemini-pro-3">Gemini 3.0 Pro</option>
                                        <option value="gemini-pro-2.5">Gemini 2.5 Pro</option>
                                        <option value="gemini-flash-2.5">Gemini 2.5 Flash</option>
                                        <option value="gemini-flash-lite-2.5">Gemini 2.5 Flash Lite</option>
                                        <option value="openai-gpt-4o">OpenAI GPT-4o</option>
                                        <option value="claude-sonnet-4.5">Claude 3.5 Sonnet</option>
                                    </select>
                                </div>

                                {/* Temperature */}
                                <div className="bg-white border border-gray-300 rounded p-4 shadow-sm relative group">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-semibold text-gray-600 flex items-center gap-2">
                                            Temperature
                                        </label>

                                        <CircleHelp className="tooltip-trigger h-3 w-3 text-gray-400 hover:text-[#5B84B1] cursor-help z-20 relative" />

                                        <div className="custom-tooltip absolute top-0 left-0 w-full h-full bg-white bg-opacity-95 backdrop-blur-sm p-4 rounded border border-blue-100 shadow-lg text-[10px] text-gray-700 flex items-center z-10 opacity-0 invisible transition-all duration-200">
                                            <div>
                                                Controls the model's creativity (0.0 to 1.0). <strong>Lower values (around 0.2)</strong> are recommended for strict, literal transcription. Higher values increase variability but may lead to hallucinations or inaccuracies.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 mt-3 relative z-0">
                                        <span className="text-[10px] text-gray-500 font-mono w-4">0</span>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={temperature}
                                            onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                            className="flex-grow h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                        />
                                        <span className="text-[10px] text-gray-500 font-mono w-6 text-right">{temperature}</span>
                                    </div>
                                </div>
                            </div>

                            {/* System Prompt */}
                            <div className="bg-white border border-gray-300 rounded p-4 shadow-sm relative group">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-semibold text-gray-600 flex items-center gap-2">
                                        System Prompt
                                    </label>

                                    <CircleHelp className="tooltip-trigger h-3 w-3 text-gray-400 hover:text-[#5B84B1] cursor-help z-20 relative" />

                                    <div className="custom-tooltip absolute top-0 left-0 w-full h-full bg-white bg-opacity-95 backdrop-blur-sm p-4 rounded border border-blue-100 shadow-lg text-[10px] text-gray-700 flex flex-col justify-center z-10 opacity-0 invisible transition-all duration-200">
                                        <div className="mb-1">
                                            Emends the default transcription instructions. Use this to enforce specific formatting rules (e.g., 'Convert all dates to ISO format' or 'Modernize spelling').
                                        </div>
                                        <div className="font-bold text-red-500">
                                            Important: Do not instruct the model to ignore JSON formatting, as the application relies on structured output to render the page.
                                        </div>
                                    </div>
                                </div>

                                <textarea
                                    rows="3"
                                    placeholder="Enter custom system instructions..."
                                    value={systemPrompt}
                                    onChange={(e) => setSystemPrompt(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded text-[10px] font-mono focus:ring-1 focus:ring-[#5B84B1] outline-none leading-relaxed transition resize-none relative z-0"
                                    spellCheck="false"
                                />
                            </div>
                        </fieldset>
                    </div>
                </div>

                {/* Action Button */}
                <button
                    onClick={handleBeginTranscribing}
                    disabled={uploading}
                    className="w-full flex justify-center py-3 px-4 border border-gray-600 rounded-lg shadow-lg text-lg font-semibold text-white bg-[#5B84B1] mt-6 hover:bg-[#4A6D94] hover:shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
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

export default AdvancedUploadScreen;
