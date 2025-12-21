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

    // Helper to clean prompt text (strip config newlines)
    const cleanPrompt = (text) => {
        if (!text) return '';
        // Replace newlines with space, then collapse multiple spaces to single
        return text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    };

    // State for Dynamic Config (Phase 27 & 28 & 29)
    const [isLoaded, setIsLoaded] = useState(false);
    const [modelOptions, setModelOptions] = useState([]); // Transcription Models
    const [segOptions, setSegOptions] = useState([]); // Segmentation Models

    // User Preferences (Init as null until loaded from API)
    const [selectedModel, setSelectedModel] = useState(null);
    const [temperature, setTemperature] = useState(null);
    const [systemPrompt, setSystemPrompt] = useState(null);
    const [segmentationModel, setSegmentationModel] = useState(null);

    const [preprocessing, setPreprocessing] = useState(null);

    // Phase 29: Per-Model Overrides (Map of model_id -> { temp, prompt, seg, preproc })
    const [modelOverrides, setModelOverrides] = useState({});

    // Global Defaults (Fallback for new models)
    const [globalDefaults, setGlobalDefaults] = useState({
        seg: null,
        preproc: null
    });

    // Initialization: Fetch Merged Preferences from Server
    const loadPreferences = () => {
        const token = localStorage.getItem('token');
        setIsLoaded(false);
        fetch('/api/preferences', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(res => {
                if (!res.ok) throw new Error("Failed to fetch preferences");
                return res.json();
            })
            .then(data => {
                // 1. Set Options Meta
                if (data.available_models) setModelOptions(data.available_models);
                if (data.segmentation_models) setSegOptions(data.segmentation_models);

                // Store Global Defaults (from config.yml)
                setGlobalDefaults({
                    seg: data.default_segmentation_model,
                    preproc: data.preprocessing
                });

                // 2. Set Active Preferences (Backend has already merged defaults + user overrides!)
                if (data.preferences) {
                    const p = data.preferences;
                    setSelectedModel(p.subscript_model);
                    setTemperature(p.subscript_temp);
                    // Use cleanPrompt here to ensure initial state is clean (no newlines)
                    setSystemPrompt(cleanPrompt(p.subscript_prompt));
                    setSegmentationModel(p.subscript_seg);

                    setPreprocessing(p.subscript_preproc);

                    // Load Overrides (or clear if missing/reset)
                    setModelOverrides(p.model_overrides || {});
                }
                setIsLoaded(true);
            })
            .catch(err => console.error("Failed to fetch preferences", err));
    };

    useEffect(() => {
        loadPreferences();
    }, []);

    // Debounced Save (Phase 29)
    useEffect(() => {
        if (!isLoaded) return;

        const timer = setTimeout(() => {
            const payload = {
                preferences: {
                    subscript_model: selectedModel,
                    // Force float for robust DB storage, handle partial inputs
                    subscript_temp: temperature !== null ? parseFloat(temperature) : 0.0,
                    subscript_prompt: systemPrompt,
                    subscript_seg: segmentationModel,
                    subscript_preproc: preprocessing,
                    model_overrides: modelOverrides
                }
            };

            const token = localStorage.getItem('token');
            fetch('/api/preferences', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            }).catch(err => console.error("Failed to save preferences", err));

        }, 1000); // Debounce 1s

        return () => clearTimeout(timer);
    }, [selectedModel, temperature, systemPrompt, segmentationModel, preprocessing, modelOverrides, isLoaded]);



    // Sync Logic: When Model Changes
    const handleModelChange = (e) => {
        const newModelId = e.target.value;
        const oldModelId = selectedModel;

        setSelectedModel(newModelId);

        // Find the full config objects
        const newModelConfig = modelOptions.find(m => m.id === newModelId);
        const oldModelConfig = modelOptions.find(m => m.id === oldModelId);

        if (newModelConfig) {
            // 1. Save current settings to Override Map for the OLD model (if valid)
            const updatedOverrides = { ...modelOverrides };

            // Only save if oldModelId was valid and we have data
            if (oldModelId && temperature !== null && systemPrompt !== null) {
                updatedOverrides[oldModelId] = {
                    temp: temperature,
                    prompt: systemPrompt,
                    seg: segmentationModel,
                    preproc: preprocessing
                };
            }

            // 2. Check if we have an override for the NEW model
            const savedOverride = updatedOverrides[newModelId];

            if (savedOverride) {
                // RESTORE saved preferences for this model
                setTemperature(savedOverride.temp);
                setSystemPrompt(savedOverride.prompt);
                setSegmentationModel(savedOverride.seg);
                setPreprocessing(savedOverride.preproc);
            } else {
                // LOAD DEFAULTS for this model (First time switching to it)
                setTemperature(newModelConfig.default_temperature);
                setSystemPrompt(cleanPrompt(newModelConfig.default_prompt));
                // Fallback to global defaults for non-model-specific settings
                setSegmentationModel(globalDefaults.seg);
                setPreprocessing(globalDefaults.preproc);
            }

            // Update state map
            setModelOverrides(updatedOverrides);
        }
    };

    // Modal State
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
        onClose: () => { }
    });

    const [showResetConfirm, setShowResetConfirm] = useState(false);

    // Cleanup previews on unmount
    useEffect(() => {
        return () => {
            files.forEach(f => URL.revokeObjectURL(f.preview));
        };
    }, []);



    const handleResetDefaults = () => {
        setShowResetConfirm(true);
    };

    const confirmReset = () => {
        const token = localStorage.getItem('token');
        fetch('/api/preferences/reset', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(res => {
                if (res.ok) {
                    loadPreferences();
                    // success modal removed per user request
                } else {
                    showModal("Error", "Failed to reset defaults.", "danger");
                }
            })
            .catch(err => {
                console.error(err);
                showModal("Error", "Failed to reset defaults.", "danger");
            });
        setShowResetConfirm(false);
    };
    // Helper for Preprocessing Changes
    const updatePreprocessing = (key, value) => {
        setPreprocessing(prev => ({ ...prev, [key]: value }));
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
                        prompt: systemPrompt,
                        temperature: temperature
                    },
                    segmentation_model: segmentationModel,
                    preprocessing: preprocessing
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
                    prompt: systemPrompt,
                    temperature: temperature
                },
                segmentation_model: segmentationModel,
                preprocessing: preprocessing
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
                    background: #9CA3AF;
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
                <div className={`transform transition-all duration-300 ease-in-out ${showOptions ? 'opacity-100 max-h-[1200px]' : 'opacity-0 max-h-0 hidden'}`}>
                    <div className="bg-gray-100 rounded-lg border border-gray-300 shadow-inner p-4 mt-2 relative">

                        {/* Reset Defaults with Tooltip */}
                        <div className="absolute top-[5px] right-5 z-50 flex items-center gap-1">
                            <button
                                onClick={handleResetDefaults}
                                className="text-[10px] text-red-500 hover:text-red-700 hover:underline flex items-center gap-1 font-bold bg-gray-100 px-2 rounded cursor-pointer"
                            >
                                <RotateCcw className="h-3 w-3" /> Reset Defaults
                            </button>

                            <div className="relative group">
                                <CircleHelp className="tooltip-trigger h-3 w-3 text-gray-400 hover:text-[#5B84B1] cursor-help" />
                                <div className="custom-tooltip absolute top-0 right-0 w-48 bg-white bg-opacity-95 backdrop-blur-sm p-2 rounded border border-blue-100 shadow-lg text-[10px] text-gray-700 z-20 opacity-0 invisible transition-all duration-200 mt-4 mr-[-10px]">
                                    Subscript remembers all changes until Reset Defaults is clicked.
                                </div>
                            </div>
                        </div>

                        <fieldset style={{ padding: '1.25rem' }} className="border border-gray-300 rounded-lg mt-0 bg-[#E5E7EB]">
                            <legend className="px-2 text-xs font-bold text-gray-600 uppercase tracking-wider relative -top-[8px]">Model & Behavior Settings</legend>

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
                                        value={modelOptions.length > 0 ? selectedModel : ""}
                                        onChange={handleModelChange}
                                        disabled={modelOptions.length === 0}
                                        className="block w-full pl-2 pr-8 py-2 text-xs border-gray-300 rounded border focus:ring-[#5B84B1] focus:border-[#5B84B1] relative z-0 disabled:bg-gray-100 disabled:text-gray-400"
                                    >
                                        {modelOptions.length > 0 ? (
                                            modelOptions.map((model) => (
                                                <option key={model.id} value={model.id}>
                                                    {model.name}
                                                </option>
                                            ))
                                        ) : (
                                            <option>Loading available models...</option>
                                        )}
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
                                            value={temperature ?? 0.8}
                                            onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                            className="flex-grow h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                        />
                                        <span className="text-[10px] text-gray-500 font-mono w-6 text-right">{temperature ?? 0.8}</span>
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
                                    rows="5"
                                    placeholder="Enter custom system instructions..."
                                    value={systemPrompt || ""}
                                    onChange={(e) => setSystemPrompt(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded text-[10px] font-mono focus:ring-1 focus:ring-[#5B84B1] outline-none leading-relaxed transition resize-none relative z-0"
                                    spellCheck="false"
                                />
                            </div>
                        </fieldset>

                        {/* Phase 28: Split Row for Image & Layout */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">

                            {/* Image Preprocessor Settings */}
                            <fieldset style={{ padding: '1.25rem' }} className="border border-gray-300 rounded-lg bg-[#E5E7EB]">
                                <legend className="px-2 text-xs font-bold text-gray-600 uppercase tracking-wider relative -top-[8px]">Image Preprocessor Settings</legend>
                                <div className="space-y-4">
                                    {/* Resize */}
                                    <div className="bg-white border border-gray-300 rounded p-4 shadow-sm relative group">
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-xs font-semibold text-gray-600 flex items-center gap-2">
                                                Resize Image
                                            </label>

                                            <CircleHelp className="tooltip-trigger h-3 w-3 text-gray-400 hover:text-[#5B84B1] cursor-help z-20 relative" />

                                            <div className="custom-tooltip absolute top-0 left-0 w-full h-full bg-white bg-opacity-95 backdrop-blur-sm p-4 rounded border border-blue-100 shadow-lg text-[10px] text-gray-700 flex items-center z-10 opacity-0 invisible transition-all duration-200">
                                                <div>
                                                    Downscales large images to improve processing speed and reduce token usage. Recommended for high-resolution scans.
                                                </div>
                                            </div>
                                        </div>
                                        <select
                                            value={preprocessing?.resize_image ?? "large"}
                                            onChange={(e) => updatePreprocessing('resize_image', e.target.value)}
                                            className="block w-full text-xs bg-white border border-gray-300 text-gray-800 rounded focus:ring-[#5B84B1] focus:border-[#5B84B1] p-2 relative z-0"
                                        >
                                            <option value="large">Large (Max 3000px)</option>
                                            <option value="medium">Medium (Max 2000px)</option>
                                            <option value="small">Small (Max 1000px)</option>
                                            <option value="false">Original Size</option>
                                        </select>
                                    </div>

                                    {/* Contrast */}
                                    <div className="bg-white border border-gray-300 rounded p-4 shadow-sm relative group">
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-xs font-semibold text-gray-600 flex items-center gap-2">
                                                Contrast
                                            </label>

                                            <CircleHelp className="tooltip-trigger h-3 w-3 text-gray-400 hover:text-[#5B84B1] cursor-help z-20 relative" />

                                            <div className="custom-tooltip absolute top-0 left-0 w-full h-full bg-white bg-opacity-95 backdrop-blur-sm p-4 rounded border border-blue-100 shadow-lg text-[10px] text-gray-700 flex items-center z-10 opacity-0 invisible transition-all duration-200">
                                                <div>
                                                    Adjusts image contrast. Higher values (1.5+) can help make faint handwriting stand out against the background.
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 mt-3 relative z-0">
                                            <span className="text-[10px] text-gray-500 font-mono w-4">0.5</span>
                                            <input
                                                type="range"
                                                min="0.5"
                                                max="2.0"
                                                step="0.1"
                                                value={preprocessing?.contrast ?? 1.0}
                                                onChange={(e) => updatePreprocessing('contrast', parseFloat(e.target.value))}
                                                className="flex-grow h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                                style={{ background: '#e5e7eb' }}
                                            />
                                            <style>{`
                                                input[type=range]::-webkit-slider-runnable-track {
                                                    background: #9CA3AF !important; 
                                                }
                                            `}</style>
                                            <span className="text-[10px] text-gray-500 font-mono w-6 text-right">{(preprocessing?.contrast ?? 1.0).toFixed(1)}</span>
                                        </div>
                                    </div>

                                    {/* Monochrome Conversion */}
                                    <div className="bg-white border border-gray-300 rounded p-4 shadow-sm relative group">
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-xs font-semibold text-gray-600 flex items-center gap-2">
                                                Monochrome Conversion
                                            </label>

                                            <CircleHelp className="tooltip-trigger h-3 w-3 text-gray-400 hover:text-[#5B84B1] cursor-help z-20 relative" />

                                            <div className="custom-tooltip absolute top-0 left-0 w-full h-full bg-white bg-opacity-95 backdrop-blur-sm p-4 rounded border border-blue-100 shadow-lg text-[10px] text-gray-700 flex items-center z-10 opacity-0 invisible transition-all duration-200">
                                                <div>
                                                    <b>Binarize:</b> Convert to pure black and white.<br />
                                                    <b>Invert:</b> Flip colors (for negative images).
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-4 justify-center relative z-0 mt-3">
                                            <label className="inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={preprocessing?.binarize ?? false}
                                                    onChange={(e) => updatePreprocessing('binarize', e.target.checked)}
                                                    className="sr-only peer"
                                                />
                                                <div className="relative w-9 h-5 bg-gray-400 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                                <span className="ms-3 text-xs font-medium text-gray-700">Binarize</span>
                                            </label>

                                            <label className="inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={preprocessing?.invert ?? false}
                                                    onChange={(e) => updatePreprocessing('invert', e.target.checked)}
                                                    className="sr-only peer"
                                                />
                                                <div className="relative w-9 h-5 bg-gray-400 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                                <span className="ms-3 text-xs font-medium text-gray-700">Invert</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </fieldset>

                            {/* Layout Analysis Model */}
                            <fieldset style={{ padding: '1.25rem' }} className="border border-gray-300 rounded-lg bg-[#E5E7EB]">
                                <legend className="px-2 text-xs font-bold text-gray-600 uppercase tracking-wider relative -top-[8px]">Layout Analysis Model</legend>
                                <div className="space-y-4">
                                    {/* Segmentation Model Dropdown */}
                                    <div className="bg-white border border-gray-300 rounded p-4 shadow-sm relative group">
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-xs font-semibold text-gray-600 flex items-center gap-2">
                                                Segmentation Model
                                            </label>

                                            <CircleHelp className="tooltip-trigger h-3 w-3 text-gray-400 hover:text-[#5B84B1] cursor-help z-20 relative" />

                                            <div className="custom-tooltip absolute top-0 left-0 w-full h-full bg-white bg-opacity-95 backdrop-blur-sm p-4 rounded border border-blue-100 shadow-lg text-[10px] text-gray-700 flex items-center z-10 opacity-0 invisible transition-all duration-200">
                                                <div>
                                                    Selects the model used to identify page regions (text blocks, images, tables). Currently, <strong>historical-manuscript</strong> is optimized for most archival documents.
                                                </div>
                                            </div>
                                        </div>
                                        <select
                                            value={segmentationModel ?? "historical-manuscript"}
                                            onChange={(e) => setSegmentationModel(e.target.value)}
                                            className="block w-full bg-white border border-gray-300 text-xs text-gray-800 rounded focus:ring-blue-500 focus:border-blue-500 p-2 relative z-0"
                                        >
                                            {/* Available Options */}
                                            {segOptions.map((modelId) => (
                                                <option key={modelId} value={modelId}>
                                                    {modelId}
                                                </option>
                                            ))}
                                            {segOptions.length === 0 && <option value="historical-manuscript">historical-manuscript</option>}

                                            {/* Pending Options */}
                                            <optgroup label="Not yet available" disabled>
                                                <option>illuminated-manuscript</option>
                                                <option>modern-manuscript</option>
                                                <option>historical-printed-works</option>
                                                <option>modern-printed-works</option>
                                                <option>columnar-materials</option>
                                            </optgroup>
                                        </select>
                                    </div>
                                </div>
                            </fieldset>
                        </div>
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

            {/* Confirmation Modal for Reset */}
            <ConfirmationModal
                isOpen={showResetConfirm}
                title="Reset to Defaults?"
                message="Are you sure you want to reset all advanced settings (Models, Prompts, Temperature, etc.) to the system defaults? This cannot be undone."
                onConfirm={confirmReset}
                onCancel={() => setShowResetConfirm(false)}
            />

            {/* Reusable Modal */}
            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                onConfirm={() => {
                    modalConfig.onClose();
                    setModalConfig(prev => ({ ...prev, isOpen: false }));
                }}
                onCancel={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                singleButton={true} // Alert mode
            />
        </div>
    );
};

export default AdvancedUploadScreen;
