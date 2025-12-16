import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export const useAppTour = () => {
    // Check if tour has been seen
    const hasSeenTour = localStorage.getItem('tour_seen');

    // Helper to remove any existing clone
    const removeClone = () => {
        const existingClone = document.getElementById('tour-upload-clone');
        if (existingClone) existingClone.remove();
    };

    // Helper to create a visual clone of the Upload Button
    const createClone = (targetSelector) => {
        const original = document.querySelector(targetSelector);
        if (!original) return;

        const rect = original.getBoundingClientRect();
        const clone = original.cloneNode(true); // Clone deep to get icon/text

        // Match styles
        clone.id = 'tour-upload-clone'; // Reusing ID for simplicity (only 1 exists at a time)
        clone.style.position = 'fixed';
        clone.style.top = `${rect.top}px`;
        clone.style.left = `${rect.left}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        clone.style.zIndex = '100002'; // Above driver overlay
        clone.style.margin = '0';
        clone.style.pointerEvents = 'none'; // Passive visual only

        // Style adjustments for "Highlighted" look
        clone.classList.remove('text-gray-700', 'hover:bg-gray-200', 'bg-[#5B84B1]', 'text-white'); // Remove default inactive AND active styles
        clone.classList.add('bg-[#D8D8D7]', 'text-[#5B84B1]', 'shadow-md'); // Add active/brand styles
        // White border ring for visibility against overlay
        clone.style.boxShadow = '0 0 0 4px #ffffff, 0 4px 6px rgba(0,0,0,0.3)';
        clone.style.borderRadius = '0.5rem'; // Match rounded-lg (8px)
        clone.style.backgroundColor = '#D8D8D7';

        document.body.appendChild(clone);
    };

    const startTour = () => {
        const driverObj = driver({
            showProgress: true,
            animate: true,
            allowClose: true,
            doneBtnText: 'Finish',
            nextBtnText: 'Next',
            prevBtnText: 'Previous',
            onHighlightStarted: (element, step, options) => {
                // Remove any previous clone first
                removeClone();

                // Step 3 (Getting Started) -> Upload Link
                if (step.popover?.title === 'Getting Started') {
                    createClone('#nav-upload-link');
                }
                // Step 4 (Your Library) -> Dashboard Link
                else if (step.popover?.title === 'Your Library') {
                    createClone('#nav-dashboard-link');
                }
                // Step 5 (Your Account) -> Profile Link
                else if (step.popover?.title === 'Your Account') {
                    createClone('#nav-profile-link');
                }
            },
            onDeselected: (element, step, options) => {
                removeClone();
            },
            onDestroyed: () => {
                localStorage.setItem('tour_seen', 'true');
                removeClone();
            },
            steps: [
                // 1. Introduction: The Problem
                {
                    // No element -> Modal centered on screen
                    popover: {
                        title: 'What is Subscript, and why was it created?',
                        popoverClass: 'intro-modal',
                        description: `
                            <div style="display: flex; flex-direction: row; gap: 24px; align-items: center; padding: 10px;">
                                <div style="flex: 1;">
                                    <img src="/assets/img/tour-intro-handwritten.png" style="width: 100%; aspect-ratio: 1/1; object-fit: cover; border-radius: 8px; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" />
                                </div>
                                <div style="flex: 1; text-align: left;">
                                    <p style="font-size: 16px; line-height: 1.6; color: #374151;">
                                        Historic handwritten documents are beautiful but <em>locked away</em>. 
                                        They cannot be searched, copied, or easily read.
                                    </p>
                                </div>
                            </div>
                        `,
                        side: "center",
                        align: 'center'
                    }
                },
                // 2. The Solution
                {
                    // No element -> Modal centered on screen
                    popover: {
                        title: 'The Solution',
                        popoverClass: 'intro-modal',
                        description: `
                            <div style="display: flex; flex-direction: row; gap: 24px; align-items: center; padding: 10px;">
                                <div style="flex: 1;">
                                    <img src="/assets/img/tour-intro-pdf.png" style="width: 100%; aspect-ratio: 1/1; object-fit: cover; border-radius: 8px; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" />
                                </div>
                                <div style="flex: 1; text-align: left;">
                                    <p style="font-size: 16px; line-height: 1.6; color: #374151;">
                                        <strong>Subscript</strong> transforms these images into <strong>Searchable PDFs</strong> with perfectly aligned text overlays.
                                    </p>
                                </div>
                            </div>
                        `,
                        side: "center",
                        align: 'center'
                    }
                },
                // 3. Navigation
                {
                    // No element -> Modal centered on screen, Manual Clone Highlight
                    popover: {
                        stagePadding: 0,
                        title: 'Getting Started',
                        popoverClass: 'intro-modal',
                        description: `
                            <div style="display: flex; flex-direction: row; gap: 24px; align-items: center; padding: 10px;">
                                <div style="flex: 1;">
                                    <div style="width: 100%; aspect-ratio: 1/1; border-radius: 8px; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; background-color: #f9fafb;">
                                        <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" stroke="#5B84B1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                            <polyline points="14 2 14 8 20 8"></polyline>
                                            <line x1="12" y1="18" x2="12" y2="12"></line>
                                            <line x1="9" y1="15" x2="15" y2="15"></line>
                                        </svg>
                                    </div>
                                </div>
                                <div style="flex: 1; text-align: left;">
                                    <p style="font-size: 16px; line-height: 1.6; color: #374151;">
                                        Head over to the <strong>New Document</strong> tab to upload your handwritten images. Subscript will process them in the background.
                                    </p>
                                </div>
                            </div>
                        `,
                        side: "center",
                        align: 'center'
                    }
                },
                // 4. Library
                {
                    // No element -> Manual Clone Highlight (#nav-dashboard-link)
                    popover: {
                        title: 'Your Library',
                        popoverClass: 'intro-modal',
                        description: `
                            <div style="display: flex; flex-direction: row; gap: 24px; align-items: center; padding: 10px;">
                                <div style="flex: 1;">
                                    <div style="width: 100%; aspect-ratio: 1/1; border-radius: 8px; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; background-color: #f9fafb;">
                                        <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" stroke="#5B84B1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                            <rect x="3" y="3" width="7" height="7"></rect>
                                            <rect x="14" y="3" width="7" height="7"></rect>
                                            <rect x="14" y="14" width="7" height="7"></rect>
                                            <rect x="3" y="14" width="7" height="7"></rect>
                                        </svg>
                                    </div>
                                </div>
                                <div style="flex: 1; text-align: left;">
                                    <p style="font-size: 16px; line-height: 1.6; color: #374151;">
                                        All your processed documents appear in the <strong>Dashboard</strong>. 
                                        You can view, edit, search, or download them as PDFs anytime.
                                    </p>
                                </div>
                            </div>
                        `,
                        side: "center",
                        align: 'center'
                    }
                },
                // 5. Account
                {
                    // No element -> Manual Clone Highlight (#nav-profile-link)
                    popover: {
                        title: 'Your Account',
                        popoverClass: 'intro-modal',
                        description: `
                            <div style="display: flex; flex-direction: row; gap: 24px; align-items: center; padding: 10px;">
                                <div style="flex: 1;">
                                    <div style="width: 100%; aspect-ratio: 1/1; border-radius: 8px; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; background-color: #f9fafb;">
                                        <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" stroke="#5B84B1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                            <circle cx="12" cy="7" r="4"></circle>
                                        </svg>
                                    </div>
                                </div>
                                <div style="flex: 1; text-align: left;">
                                    <p style="font-size: 16px; line-height: 1.6; color: #374151;">
                                        Visit your <strong>Profile</strong> to manage settings, change your password, or <strong>restart this tour</strong> if you need a refresher.
                                    </p>
                                </div>
                            </div>
                        `,
                        side: "center",
                        align: 'center'
                    }
                }
            ]
        });

        driverObj.drive();
    };

    return { startTour, hasSeenTour };
};
