import React, { useState } from 'react';
import { UploadCloud } from 'lucide-react';

const NewDocumentScreen = ({ setView }) => {
    const [selectedModel, setSelectedModel] = useState('gemini');
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
            const response = await fetch('/api/upload', {
                method: 'POST',
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

                {/* Model Selection */}
                <div className="pt-4 border-t border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-700 mb-4">Select Transcription Model:</h3>
                    <div className="flex flex-wrap gap-4">
                        {models.map((model) => (
                            <label key={model} className={`flex items-center space-x-2 p-3 rounded-lg border-2 transition duration-150 cursor-pointer ${selectedModel === model ? 'border-indigo-600 bg-indigo-50 shadow-md' : 'border-gray-200 hover:border-indigo-400'
                                }`}>
                                <input
                                    type="radio"
                                    name="transcriptionModel"
                                    value={model}
                                    checked={selectedModel === model}
                                    onChange={() => setSelectedModel(model)}
                                    className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                />
                                <span className="font-medium text-gray-800 capitalize">{model}</span>
                            </label>
                        ))}
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
