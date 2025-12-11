import React from 'react';
import { X, AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';

const ConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    type = "info", // info, success, danger, warning
    singleButton = false
}) => {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'danger': return <XCircle className="h-6 w-6 text-red-600" />;
            case 'warning': return <AlertTriangle className="h-6 w-6 text-yellow-600" />;
            case 'success': return <CheckCircle className="h-6 w-6 text-green-600" />;
            default: return <Info className="h-6 w-6 text-blue-600" />;
        }
    };

    const getButtonColor = () => {
        switch (type) {
            case 'danger': return 'bg-red-600 hover:bg-red-700 focus:ring-red-500';
            case 'warning': return 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500';
            case 'success': return 'bg-green-600 hover:bg-green-700 focus:ring-green-500';
            default: return 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500';
        }
    };

    return (
        <div className="relative z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

            {/* Flex Container for Centering */}
            <div className="fixed inset-0 z-10 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4 text-center">
                    {/* Modal Panel */}
                    <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 w-full max-w-sm">
                        <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            <div className="sm:flex sm:items-start">
                                <div className={`mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full sm:mx-0 sm:h-10 sm:w-10 ${type === 'danger' ? 'bg-red-100' :
                                    type === 'warning' ? 'bg-yellow-100' :
                                        type === 'success' ? 'bg-green-100' : 'bg-blue-100'
                                    }`}>
                                    {getIcon()}
                                </div>
                                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                    <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                                        {title}
                                    </h3>
                                    <div className="mt-2">
                                        <p className="text-sm text-gray-500 whitespace-pre-line">
                                            {message}
                                        </p>
                                    </div>
                                </div>
                                <div className="absolute top-0 right-0 pt-4 pr-4">
                                    <button type="button" className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none" onClick={onClose}>
                                        <span className="sr-only">Close</span>
                                        <X className="h-6 w-6" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                            {onConfirm && (
                                <button
                                    type="button"
                                    className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm ${getButtonColor()}`}
                                    onClick={onConfirm}
                                >
                                    {confirmText}
                                </button>
                            )}
                            {!singleButton && (
                                <button
                                    type="button"
                                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                                    onClick={onClose}
                                >
                                    {cancelText}
                                </button>
                            )}
                            {singleButton && !onConfirm && (
                                <button
                                    type="button"
                                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                                    onClick={onClose}
                                >
                                    Close
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
