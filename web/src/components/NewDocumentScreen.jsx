import React, { useState } from 'react';
import { UploadCloud } from 'lucide-react';

const NewDocumentScreen = ({ setView }) => {
    const [selectedModel, setSelectedModel] = useState('gemini-pro-3');
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);

    const models = ['gemini', 'openai', 'anthropic'];

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleBeginTranscribing = async () => {
        if (!file) {
            alert("Please select a file first.");
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('model', selectedModel);

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData,
            });

            if (response.ok) {
                alert(`Transcription started for ${file.name} using ${selectedModel}.`);
                setView('dashboard');
            } else {
                alert("Upload failed.");
            }
        } catch (error) {
            console.error("Upload error", error);
            alert("Upload error.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-800 mb-6">Upload New Document</h2>

            <div className="bg-white shadow-xl rounded-xl p-8 space-y-6">
                {/* Drag and Drop Area */}
                <div className="border-4 border-dashed border-gray-300 p-12 text-center rounded-xl bg-gray-50 hover:border-indigo-500 transition duration-300 cursor-pointer relative">
                    <input
                        type="file"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        accept=".pdf,.jpg,.jpeg,.png"
                    />
                    <UploadCloud className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                    <p className="text-lg font-medium text-gray-900">
                        {file ? file.name : "Drag & Drop or Click to Upload"}
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
                            <label className="block text-sm font-medium text-gray-700 mb-2">PDF Filename for Multi-Image Conversions</label>
                            <input
                                type="text"
                                placeholder="e.g. my_document.pdf"
                                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md border px-3 py-2"
                            />
                        </div>
                    </div>
                </div>

                {/* Action Button */}
                <button
                    onClick={handleBeginTranscribing}
                    disabled={uploading}
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-lg font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out mt-6 disabled:opacity-50"
                >
                    {uploading ? "Uploading..." : "Begin Transcribing"}
                </button>
            </div>
        </div>
    );
};

export default NewDocumentScreen;
