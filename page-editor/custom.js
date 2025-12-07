// Custom JS for Side-Car Editor ---

$(document).ready(function () {
    console.log("Custom JS Loaded: Initializing Side-Car Editor...");

    // 1. Inject the Side-Car Pane
    if ($('#full-text-pane').length === 0) {
        $('<div id="full-text-pane"></div>').appendTo('#container');
        console.log("Side-Car Pane Injected.");
    }

    // 1b. Update Settings Menu
    // Rename "Lower pane" to "Editing verification pane"
    // 1b. Update Settings Menu
    var lowerPaneLabel = $('#hide-text-edit');
    var imageLabel = $('#hide-img');

    if (lowerPaneLabel.length > 0) {
        // Rename "Lower pane" to "Editing verification pane"
        lowerPaneLabel.contents().filter(function () { return this.nodeType === 3; }).replaceWith(" Editing verification pane");

        // Reorder: Ensure Image comes BEFORE Verification Pane
        if (imageLabel.length > 0) {
            lowerPaneLabel.insertAfter(imageLabel);
        }
    }

    // 1c. Monkey-patch adjustSize to stop image shrinking
    // The native adjustSize() tries to resize #xpg based on window size and sidebar visibility.
    // We want to FORCE 50% width on #xpg and #full-text-pane regardless of logic.
    if (typeof window.adjustSize === 'function') {
        var originalAdjustSize = window.adjustSize;
        window.adjustSize = function () {
            // Call original to handle SVG internal scaling if needed
            // But we suppress its layout side-effects by enforcing CSS !important
            originalAdjustSize.apply(this, arguments);
            // Force reset our layout
            $('#xpg').css({
                'width': '50%',
                'left': '0',
                'flex': 'none'
            });
            $('#full-text-pane').css({
                'width': '50%',
                'left': '50%'
            });

            // Force re-fit of the page in the constrained container
            // This fixes the "zoomed in" or "cropped" look when container shrinks
            if (typeof pageCanvas !== 'undefined' && pageCanvas.fitPage) {
                // We use a small timeout or check if state changed to avoid infinite loops?
                // fitPage() sets zoom. adjustSize() might be called by resize.
                // Let's call it once.
                // Actually, pageCanvas.fitPage() might trigger events.
                // Safe bet:
                // pageCanvas.fitPage(); 
                // But this might reset zoom if user was zoomed in. 
                // However, user specifically complained "I can't see all of the image".
                // So fitPage is the correct "Reset" action on layout change.
                // So fitPage is the correct "Reset" action on layout change.
                // So fitPage is the correct "Reset" action on layout change.
                // So fitPage is the correct "Reset" action on layout change.
                if (!window.sideCar._fitPageCalled) {
                    // Just call the native standard fitPage once to ensure zoom is reset.
                    // We accept Center Alignment as the stable state.
                    if (typeof pageCanvas !== 'undefined' && pageCanvas.fitPage) {
                        pageCanvas.fitPage();
                    }
                }
            }
        };
    }
    // Also stop jQuery from fighting us
    $(window).off('resize');
    $(window).resize(function () {
        if (window.adjustSize) window.adjustSize();
    });

    // FORCE ATTRIBUTE ON load too
    setInterval(function () {
        // Keep forcing it? No, that's rude. 
        // But maybe D3 resets it on zoom.
        var svg = $('#xpg svg');
        if (svg.length > 0 && svg.attr('preserveAspectRatio') !== 'xMaxYMid meet') {
            svg.attr('preserveAspectRatio', 'xMaxYMid meet');
        }
    }, 1000); // Poll purely for this attribute to persist layout choice

    // 2. State & Parsing Logic
    window.sideCar = {
        init: function () {
            if (typeof pageCanvas === 'undefined' || typeof pageCanvas.mode === 'undefined') {
                console.log("Waiting for pageCanvas...");
                setTimeout(window.sideCar.init, 500);
                return;
            }
            console.log("pageCanvas ready. Starting Side-Car...");
            window.sideCar.scanLines();
            window.sideCar.attachHooks();
        },

        scanLines: function () {
            // Clear existing
            $('#full-text-pane').empty();

            // Iterate all TextLines in the SVG Canvas
            // pageCanvas.util.svgRoot points to the SVG, but simpler to use jQuery on DOM
            var lines = $('.TextLine');
            if (lines.length === 0) {
                $('#full-text-pane').html('<div style="color:#666; padding:20px;">No text lines found. waiting...</div>');
                // Retry scan if empty?
                return;
            }

            console.log("Found " + lines.length + " lines. Building editor...");

            lines.each(function (index) {
                var lineId = $(this).attr('id');
                // Extract plain text content, ignoring SVG tags like <tspan>
                var text = $(this).find('.Unicode').text() || "";

                // Build Line Editor Div
                var lineDiv = $('<div class="line-editor" contenteditable="true"></div>')
                    .attr('data-line-id', lineId)
                    .text(text);

                // ... (Events attached below) ...

                // Event: Focus -> Select Image
                lineDiv.on('focus click', function () {
                    if (!$(this).hasClass('active-line')) {
                        console.log("Triggering Click on: " + lineId);
                        try {
                            // Find the SVG element and click it
                            var svgElem = $('#' + lineId);
                            if (svgElem.length > 0) {
                                // Trigger native click event (for D3/jQuery listeners)
                                var evt = new MouseEvent("click", {
                                    bubbles: true,
                                    cancelable: true,
                                    view: window
                                });
                                svgElem[0].dispatchEvent(evt);
                            } else {
                                console.warn("SVG Element not found: " + lineId);
                            }
                        } catch (e) { console.error(e); }
                    }
                });

                // Event: Input -> Update SVG & #textedit
                lineDiv.on('input keyup', function (e) {
                    var newText = $(this).text();

                    try {
                        // ROBUST SELECTOR: Handle IDs with dots/colons
                        var svgNode = document.getElementById(lineId);
                        if (svgNode) {
                            var $svgNode = $(svgNode);
                            // 1. Update internal model/SVG
                            // FIX: setTextEquiv is in 'util' namespace, not root
                            if (pageCanvas.util && pageCanvas.util.setTextEquiv) {
                                pageCanvas.util.setTextEquiv(newText, $svgNode);
                            } else if (pageCanvas.setTextEquiv) {
                                pageCanvas.setTextEquiv(newText, $svgNode);
                            } else {
                                console.error("setTextEquiv not found!");
                            }

                            // Ensure dirty state is registered
                            if (pageCanvas.util && pageCanvas.util.registerChange) {
                                pageCanvas.util.registerChange('mod ' + lineId);
                            }
                        }
                    } catch (err) {
                        console.error("Sync error: " + err);
                    }

                    // 2. Force Verification Pane Update
                    // We trigger EVERY possible event to wake up the native app listeners
                    var te = $('#textedit');
                    te.val(newText);

                    // Visual Debug: Flash Border Color on Input
                    te.css('border-bottom', '2px solid red');
                    setTimeout(function () { te.css('border-bottom', ''); }, 200);

                    te.trigger('input')
                        .trigger('change')
                        .trigger('keyup')
                        .trigger('keydown')
                        .trigger('keypress');
                });

                $('#full-text-pane').append(lineDiv);
            });
        },

        attachHooks: function () {
            // Hook Selection change via MutationObserver on #selectedId
            var targetNode = document.getElementById('selectedId');
            if (!targetNode) return;

            var observer = new MutationObserver(function (mutationsList) {
                for (var mutation of mutationsList) {
                    var selectedId = $('#selectedId').text();
                    if (selectedId && selectedId !== '-') {
                        window.sideCar.highlightLine(selectedId);
                    }
                }
            });
            observer.observe(targetNode, { attributes: true, childList: true, subtree: true });
        },

        // Highlight logic
        highlightLine: function (id) {
            $('.line-editor').removeClass('active-line');
            var target = $('.line-editor[data-line-id="' + id + '"]');
            if (target.length > 0) {
                target.addClass('active-line');
                target[0].scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }
    };

    // 3. Start Init Loop
    window.sideCar.init();

    // Poll for lines appearing (lazy load)
    var loadCheck = setInterval(function () {
        if ($('.TextLine').length > 0 && $('#full-text-pane').children().length === 0) {
            window.sideCar.scanLines();
        }
    }, 2000);

    // Re-scan button (Reset Settings acts as reload, so that's fine)
    // Add a manual "Refresh Text" button to the pane header?
    $('<button>Refresh Text</button>')
        .css({
            "position": "absolute", "top": "0", "right": "0", "z-index": "200",
            "padding": "5px", "font-size": "10px"
        })
        .appendTo('#full-text-pane')
        .click(function () { window.sideCar.scanLines(); });

});

// Overwrite the "Reset Settings" (Legacy)
$('#reset-settings').click(function () {
    if (confirm('Reset all settings?')) {
        localStorage.clear();
        location.reload();
    }
});
