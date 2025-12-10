import React, { useState } from 'react';
import { UploadCloud } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';

const NewDocumentScreen = ({ setView }) => {
    const [selectedModel, setSelectedModel] = useState('gemini-pro-3');
    const [files, setFiles] = useState([]); // Changed from single file to array
    const [pdfFilename, setPdfFilename] = useState(''); // New state for grouping
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 }); // Track progress

    // Modal State
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'info',
        onClose: () => { }
    });

    const models = ['gemini', 'openai', 'anthropic'];

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setFiles(Array.from(e.target.files));
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
            setFiles(Array.from(e.dataTransfer.files));
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
                files.forEach(file => formData.append('files', file)); // Note: 'files' matches backend param
                formData.append('model', selectedModel);
                formData.append('group_filename', pdfFilename);

                // Use the new batch endpoint
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

        // Loop through all selected files
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setUploadProgress({ current: i + 1, total: files.length });

            const formData = new FormData();
            formData.append('file', file);
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
                    errors.push(`${file.name}: ${errData.detail || response.statusText}`);
                }
            } catch (error) {
                console.error("Upload error", error);
                failCount++;
                errors.push(`${file.name}: ${error.message}`);
            }
        }

        setUploading(false);

        // Show summary modal
        if (failCount === 0) {
            showModal(
                "Upload Successful",
                `Successfully uploaded ${successCount} document(s).\n\nThey have been added to the queue.`,
                "success",
                () => setView('dashboard') // Redirect on close
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
            <h2 className="text-3xl font-bold text-gray-800 mb-6">Upload New Document</h2>

            <div className="bg-white shadow-xl rounded-xl p-8 space-y-6">
                {/* Drag and Drop Area */}
                <div
                    className="border-4 border-dashed border-gray-300 p-12 text-center rounded-xl bg-gray-50 hover:border-indigo-500 transition duration-300 cursor-pointer relative"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    <input
                        type="file"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        accept=".pdf,.jpg,.jpeg,.png"
                        multiple // Enable multiple selection
                    />
                    <UploadCloud className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                    <p className="text-lg font-medium text-gray-900">
                        {files.length > 0
                            ? `${files.length} file(s) selected: ${files.length <= 3 ? files.map(f => f.name).join(', ') : files.slice(0, 3).map(f => f.name).join(', ') + ` + ${files.length - 3} more`}`
                            : "Drag & Drop or Click to Upload Multiple Files"}
                    </p>
                    <p className="text-sm text-gray-500">PDF, JPG, PNG files supported</p>
                </div>

                {/* Model Selection and PDF Filename */}
                <div className="pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Select Transcription Model</label>
                            <select
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                                className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border"
                            >
                                <option value="gemini-pro-3">gemini-pro-3</option>
                                <option value="gemini-pro-2.5">gemini-pro-2.5</option>
                                <option value="gemini-flash-2.5">gemini-flash-2.5</option>
                                <option value="gemini-flash-lite-2.5">gemini-flash-lite-2.5</option>
                                <option value="openai-gpt-4o">openai-gpt-4o</option>
                                <option value="antropic-claude-4.5">antropic-claude-4.5</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">PDF Filename (Optional for Grouping)</label>
                            <input
                                type="text"
                                placeholder="e.g. my_book.pdf"
                                value={pdfFilename}
                                onChange={(e) => setPdfFilename(e.target.value)}
                                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md border px-3 py-2"
                            />
                            <p className="mt-1 text-xs text-gray-500">Enter a filename to group these pages into one document.</p>
                        </div>
                    </div>
                </div>

                {/* Action Button */}
                <button
                    onClick={handleBeginTranscribing}
                    disabled={uploading}
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-lg font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out mt-6 disabled:opacity-50"
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
