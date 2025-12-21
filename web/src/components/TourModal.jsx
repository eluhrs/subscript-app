import React, { useState } from 'react';

// Steps Configuration
const STEPS = [
    {
        title: 'What is Subscript?',
        content: (
            <div className="flex flex-col md:flex-row gap-6 items-center">
                <div className="w-full md:w-1/2">
                    <img src="/assets/img/tour-slide-1.png" alt="Intro" className="w-full h-auto max-h-[280px] object-contain" />
                </div>
                <div className="w-full md:w-1/2 text-left">
                    <p className="text-lg leading-relaxed text-gray-700">
                        The Subscript historical transcription tool uses <strong>AI to extract editable text from historical documents</strong>. The application provides an <strong>interface for correcting</strong> extracted text, then <strong>generates searchable PDFs</strong>, and <strong>creates PageXML files essential for text mining and machine learning projects</strong>. All of this is achieved using a deceptively simple interface that hides a high level of underlying complexity.
                    </p>
                </div>
            </div>
        )
    },
    {
        title: 'Document Dashboard',
        content: (
            <div className="flex flex-col md:flex-row gap-6 items-center">
                <div className="w-full md:w-1/2">
                    <img src="/assets/img/tour-slide-2.png" alt="Dashboard" className="w-full h-auto max-h-[280px] object-contain" />
                </div>
                <div className="w-full md:w-1/2 text-left">
                    <p className="text-lg leading-relaxed text-gray-700">
                        <strong>Left-hand document details</strong> include thumbnail, filename, and last update time. The <strong>middle status indicator</strong> shows "Done", "Transcribing", or "Error" states. <strong>Right-hand buttons</strong> allow editing, sharing, viewing, or deleting documents. The files button expands to view/download specific outputs (Segmentation Map, TXT, XML, PDF, or ZIP archive). The <strong>Bulk Actions button</strong> allows deletion of selected rows or downloading all files of specific types for chosen documents.
                    </p>
                </div>
            </div>
        )
    },
    {
        title: 'Uploading Images to Process',
        content: (
            <div className="flex flex-col md:flex-row gap-6 items-center">
                <div className="w-full md:w-1/2">
                    <img src="/assets/img/tour-slide-3.png" alt="Upload" className="w-full h-auto max-h-[280px] object-contain" />
                </div>
                <div className="w-full md:w-1/2 text-left">
                    <p className="text-lg leading-relaxed text-gray-700">
                        <strong>Drag and drop or browse for images</strong> to process, either <strong>individually or in batches</strong>.  By default, processing <strong>multiple images creates individual transcription</strong>.  Optionally, you may <strong>combine all images into a single multi-page transcription</strong>. The latter enables multi-page TXT transcripts, PDFs, and editor functions.  Access advanced settings via the <strong>Options button</strong>, with each setting documented within the app.
                    </p>
                </div>
            </div>
        )
    },
    {
        title: 'Profile Page',
        content: (
            <div className="flex flex-col md:flex-row gap-6 items-center px-4 md:px-8">
                <div className="w-full md:w-1/2">
                    <img src="/assets/img/tour-slide-4.png" alt="Profile" className="w-full h-auto max-h-[280px] object-contain" />
                </div>
                <div className="w-full md:w-1/2 text-left pl-0 md:pl-8">
                    <p className="text-lg leading-relaxed text-gray-700">
                        The profile page includes a secure <strong>password change tool</strong> for guest accounts, but not for institutional accounts which are managed centrally.  The profile tool also includes a link to <strong>view this tour again</strong>.  A <strong>sample document</strong> for you to explore has been placed on your dashboard.
                    </p>
                </div>
            </div>
        )
    },
    {
        title: 'Subscript is a Work in Progress',
        content: (
            <div className="flex flex-col md:flex-row gap-6 items-center px-4 md:px-8">
                <div className="flex-shrink-0 w-24 flex items-center justify-center">
                    <div className="text-[80px] leading-none">⚠️</div>
                </div>
                <div className="w-full text-left pl-0 md:pl-4">
                    <p className="text-lg leading-relaxed text-gray-700">
                        Please note that Subscript is an <strong>experimental application under active development</strong>. While an effort will be made to preserve user content, it is entirely possible that uploaded images and processed <strong>documents may be deleted without notice</strong>. Therefore it is imperative that you <strong>download all files you wish to retain permanently</strong>.
                    </p>
                </div>
            </div>
        )
    }
];

const TourModal = ({ onComplete }) => {
    const [currentStep, setCurrentStep] = useState(0);

    const handleNext = React.useCallback(() => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            onComplete();
        }
    }, [currentStep, onComplete]);

    const handlePrev = React.useCallback(() => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    }, [currentStep]);

    // Keyboard Navigation
    React.useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowRight') handleNext();
            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === 'Escape') onComplete();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleNext, handlePrev, onComplete]);

    return (
        <>
            {/* Backdrop: Z-100 (Cover Navbar) - Darkened to 80% */}
            <div
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
                aria-hidden="true"
                onClick={onComplete}
            />

            {/* Modal Container: Z-101 (Highest Level) */}
            <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col h-[600px] overflow-hidden animation-fade-in-up">

                    {/* Header */}
                    <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 flex-shrink-0">
                        <h2 className="text-2xl font-bold text-[#3A5A80]">
                            {STEPS[currentStep].title}
                        </h2>
                        <div className="text-sm font-medium text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                            Step {currentStep + 1} of {STEPS.length}
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-8 flex-1 overflow-y-auto flex items-center justify-center">
                        {STEPS[currentStep].content}
                    </div>

                    {/* Footer */}
                    <div className="px-8 py-6 border-t border-gray-100 flex justify-between items-center bg-gray-50/50 flex-shrink-0">
                        <button
                            onClick={onComplete}
                            className="text-gray-400 hover:text-gray-600 font-medium px-4 py-2 hover:bg-gray-100 rounded transition-colors"
                        >
                            Skip Tour
                        </button>

                        <div className="flex gap-3">
                            <button
                                onClick={handlePrev}
                                disabled={currentStep === 0}
                                className={`px-6 py-2.5 rounded-lg border font-semibold transition-all ${currentStep === 0
                                    ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                                    : 'border-gray-300 text-gray-600 hover:bg-white hover:border-[#3A5A80] hover:text-[#3A5A80] shadow-sm'
                                    }`}
                            >
                                Previous
                            </button>
                            <button
                                onClick={handleNext}
                                className="px-8 py-2.5 bg-[#5B84B1] hover:bg-[#4A6D94] text-white font-bold rounded-lg shadow-md hover:shadow-lg transition-all transform active:scale-95"
                            >
                                {currentStep === STEPS.length - 1 ? 'Finish' : 'Next'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default TourModal;
