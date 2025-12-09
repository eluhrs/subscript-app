// Custom JS for PageXML Editor
console.log('%c Antigravity Custom JS Loaded: v2059 (Spacing Adjustment) ', 'background: #222; color: #bada55');
var $ = window.jQuery;
$(document).ready(function () {
    console.log("Custom JS Loaded: Initializing Side-Car Editor...");

    // 1. Inject the Side-Car Pane
    if ($('#full-text-pane').length === 0) {
        var pane = $('<div id="full-text-pane"></div>').appendTo('#container');

        // --- CONTENT CONTAINER ---
        $('<div id="sidecar-content"></div>').appendTo(pane);

        console.log("Side-Car Pane Injected.");
    }

    // ... [Settings Menu Update Code ignored for brevity in this replace] ...

    // ... [Monkey-patch adjustSize logic ignored for brevity] ...

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
            window.sideCar.injectControls();
        },

        injectControls: function () {
            // Remove existing if any (prevent dupes on hot reload logic)
            // Remove existing if any (prevent dupes on hot reload logic)
            $('#zoomControls').remove();

            // Check if #statusBar exists
            if ($('#statusBar').length === 0) return;

            // Check if target exists
            var target = $('#nextPage');
            if (target.length === 0) {
                // Fallback to nextPage if xmlFile isn't ready
                console.log("Waiting for #nextPage to inject controls...");
                setTimeout(window.sideCar.injectControls, 500); // Retry
                return;
            }

            // Group Page Controls for styling (border around group)
            if ($('#pageControlsGroup').length === 0) {
                // Check if elements exist
                if ($('#prevPage').length && $('#pageNumWrap').length && $('#nextPage').length) {
                    $('#prevPage, #pageNumWrap, #nextPage').wrapAll('<span id="pageControlsGroup"></span>');
                }
            }

            // Create Zoom Controls Container
            // USE SPAN instead of DIV to prevent block-breaking in navbar
            var zoomControls = $('<span id="zoomControls" class="zoom-controls"></span>');
            var btnIn = $('<button id="zoomIn" class="btn btn-sm btn-default" title="Zoom In">+</button>');
            var btnReset = $('<button id="zoomReset" class="btn btn-sm btn-default" title="Reset Zoom">Reset Zoom</button>');
            var btnOut = $('<button id="zoomOut" class="btn btn-sm btn-default" title="Zoom Out">-</button>');

            zoomControls.append(btnOut, btnReset, btnIn);

            // Bind events
            btnIn.on('click', function (e) { e.preventDefault(); window.sideCar.doZoom(1); });
            btnOut.on('click', function (e) { e.preventDefault(); window.sideCar.doZoom(-1); });
            btnReset.on('click', function (e) { e.preventDefault(); window.sideCar.resetZoom(); });

            // Insert into proper location in #statusBar
            // We append to #statusBar and use CSS Flexbox 'order' to position it first
            $('#statusBar').append(zoomControls);

            // --- NEW: Update PDF Button ---
            // Parse query params to see if we have docId and token
            const urlParams = new URLSearchParams(window.location.search);
            // 2b-FIX: Parse 'f' (filename) instead of 'docId' for the API call
            // The API expects /api/rebuild-pdf/{filename_base64_or_path} ?? 
            // Actually, the server/main.py expects `filename` as path param.
            // Let's verify what 'f' contains. It's "eluhrs@gmail.com/mr-test.xml".
            const filenameObj = urlParams.get('f');
            const token = urlParams.get('token'); // RESTORED THIS LINE!

            // We need BOTH docId (for context?) OR just filename? 
            // Main.py: @app.post("/api/rebuild-pdf/{filename:path}")
            // So we need to pass the raw filename.

            if (filenameObj && token) {
                // DO NOT ENCODE the filename. The API uses {filename:path} which expects raw slashes.

                // --- NEW FINAL: Update PDF Button (Formerly "Update PDF 2") ---
                // Replaces the old button. Uses .btn-prototype-v2 styles.

                var zoomClone = $('<span id="zoomClone" class="zoom-controls"></span>');

                // Using .btn-prototype-v2 class to handle all styles. 
                var btnResetClone = $('<button id="btnPrototype" class="btn btn-default btn-prototype-v2" title="Rebuild PDF">Update PDF</button>');

                zoomClone.append(btnResetClone);
                $('#statusBar').append(zoomClone);

                // --- Button Action ---
                $('#btnPrototype').click(function () {
                    var $btn = $(this);

                    // Prevent double clicks
                    if ($btn.prop('disabled')) return;

                    // 1. Get Parameters (reusing logic from original button)
                    var urlParams = new URLSearchParams(window.location.search);
                    var f_param = urlParams.get('f');
                    var token = urlParams.get('token');
                    var docId = urlParams.get('docId');

                    if (!docId || !token) {
                        alert("Missing parameters (docId or token) for API call.");
                        return;
                    }

                    // 2. Set Loading State
                    var originalText = $btn.text();
                    $btn.prop('disabled', true).html('<span class="spinner"></span> Updating...');

                    // 3. API Call
                    // FIX v2057: Use existing backend endpoint which handles "--onlypdf"
                    fetch('/api/rebuild-pdf/' + docId, {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + token
                        }
                    })
                        .then(response => {
                            if (response.ok) {
                                // 4. Success State
                                // "A checkmark in front of the text is preferred"
                                // Light Green BG via .state-success
                                $btn.addClass('state-success')
                                    .html('&#10003; Updated'); // Checkmark + Text

                                // Revert after 3 seconds
                                setTimeout(function () {
                                    $btn.removeClass('state-success')
                                        .html(originalText)
                                        .prop('disabled', false);
                                }, 3000);
                            } else {
                                throw new Error('API Error');
                            }
                        })
                        .catch(error => {
                            console.error('Prototype API Error:', error);
                            // 5. Error State
                            // Light Red BG via .state-error
                            $btn.addClass('state-error')
                                .text('Error');

                            // Revert after 3 seconds
                            setTimeout(function () {
                                $btn.removeClass('state-error')
                                    .html(originalText)
                                    .prop('disabled', false);
                            }, 3000);
                        });
                });
            }

            // Enhance Info Display with Persistent Cleaning
            // The native app might replace the specific DOM node, preventing one-time cleaning.
            // So we watch the PARENT (#statusBar) for changes.
            var parentNode = document.getElementById('statusBar');
            if (parentNode) {
                // Initial Clean
                window.sideCar.cleanNavbar();

                // Watch for changes in the entire status bar
                var observer = new MutationObserver(function (mutations) {
                    // Check if #xmlFile exists
                    var el = $('#xmlFile');
                    if (el.length > 0) {
                        window.sideCar.cleanNavbar();
                    }
                });
                observer.observe(parentNode, { characterData: true, childList: true, subtree: true });
            }

            console.log("Zoom Controls Injected Successfully.");
        },

        cleanNavbar: function () {
            var el = $('#xmlFile');

            // CSS handles hiding of garbage text, we just need to ensure the standard 
            // "File: filename" format is clean.
            var rawText = el.text();

            // Strip any native "File:" prefix if it got into the node value
            // and the "():" if it somehow ended up INSIDE the node
            var filename = rawText.replace(/File:\s*/g, '').replace(/\(\):/g, '').trim();

            // Rebuild standard string
            var cleanString = 'File: ' + filename;

            if (el.text() !== cleanString) {
                el.text(cleanString);
            }
        },

        scanLines: function () {
            // Target the content container only
            var content = $('#sidecar-content');
            if (content.length === 0) return; // Should not happen

            // Clear existing lines
            content.empty();

            // Iterate all TextLines in the SVG Canvas
            // pageCanvas.util.svgRoot points to the SVG, but simpler to use jQuery on DOM
            var lines = $('.TextLine');
            if (lines.length === 0) {
                // Safari Fix: Retry if SVG hasn't rendered yet
                if (!window.sideCar._scanRetries) window.sideCar._scanRetries = 0;
                if (window.sideCar._scanRetries < 10) {
                    window.sideCar._scanRetries++;
                    console.log("No lines found yet. Retrying (" + window.sideCar._scanRetries + "/10)...");
                    setTimeout(window.sideCar.scanLines, 500);
                    return;
                }

                content.html('<div style="color:#666; padding:20px;">No text lines found. waiting...</div>');
                return;
            }
            window.sideCar._scanRetries = 0; // Reset on success

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



                    te.trigger('input')
                        .trigger('change')
                        .trigger('keyup')
                        .trigger('keydown')
                        .trigger('keypress');

                    // 3. Force Native Save Trigger
                    // The native app might wait 30s. We nudge it, or enable the button.
                    // If 'autosave' is on, this dirty state should suffice, but we can try to force it.
                    var saveBtn = $('#saveFile');
                    if (saveBtn.length && !saveBtn.prop('disabled')) {
                        // Optional: Click it if you want INSTANT save. 
                        // Beware of performance if typing fast. Debounce recommended?
                        // User asked "make it save".
                        // Let's try to enable it if disabled (native app manages this)
                    }
                    // Actually, let's just trigger the click if it's the specific user request "make it save".
                    // But debounce it to avoid hammering.
                    if (window.saveDebounce) clearTimeout(window.saveDebounce);
                    window.saveDebounce = setTimeout(function () {
                        if ($('#saveFile').length) {
                            $('#saveFile').click();
                        }
                    }, 1000); // 1s debounce
                });

                content.append(lineDiv);
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
    // FIX: Check #sidecar-content for children, NOT the #full-text-pane (bug fix)
    var loadCheck = setInterval(function () {
        if ($('.TextLine').length > 0 && $('#sidecar-content').children().length === 0) {
            window.sideCar.scanLines();
        }
    }, 2000);


    // Zoom Logic (Manual ViewBox Manipulation)
    window.sideCar.doZoom = function (direction) {
        var svg = $('#xpg svg')[0];
        if (!svg) return;

        // Capture initial ViewBox if not set
        if (!window.sideCar.initialViewBox) {
            var vb = svg.getAttribute('viewBox');
            if (vb) window.sideCar.initialViewBox = vb;
        }

        var vb = svg.getAttribute('viewBox');
        if (!vb) return;

        var box = vb.split(' ').map(parseFloat);
        var factor = 0.1;
        var rw = box[2];
        var rh = box[3];
        var dx = rw * factor * direction;
        var dy = rh * factor * direction;

        var newW = rw - dx;
        var newH = rh - dy;
        var newX = box[0] + (dx / 2);
        var newY = box[1] + (dy / 2);

        if (newW < 10 || newH < 10) return;

        svg.setAttribute('viewBox', [newX, newY, newW, newH].join(' '));
    };

    // Global Reset Zoom Helper
    window.sideCar.resetZoom = function () {
        var svg = $('#xpg svg')[0];
        if (svg && window.sideCar.initialViewBox) {
            svg.setAttribute('viewBox', window.sideCar.initialViewBox);
        } else if (typeof pageCanvas !== 'undefined' && pageCanvas.fitPage) {
            pageCanvas.fitPage();
        }
    };

    // Wheel Zoom
    $('#container').on('wheel', '#xpg svg', function (e) {
        if (e.ctrlKey) { // Only pinch/ctrl+wheel
            e.preventDefault();
            var delta = e.originalEvent.deltaY;
            window.sideCar.doZoom(delta < 0 ? 1 : -1);
        }
    });


    // Pan Logic (Spacebar + Drag)
    var isPanning = false;
    var isSpacePressed = false;
    var startPanX, startPanY;
    var startViewBox;

    $(document).on('keydown', function (e) {
        if (e.code === 'Space' && !isSpacePressed) {
            // Check if we are focusing an input... if so, don't prevent default unless we want to block typing spaces? 
            // Better: only block if not in contenteditable
            if (!$(e.target).is('[contenteditable], input, textarea')) {
                e.preventDefault(); // Prevent scrolling
            }
            isSpacePressed = true;
            $('#xpg svg').css('cursor', 'grab');
        }
    }).on('keyup', function (e) {
        if (e.code === 'Space') {
            isSpacePressed = false;
            isPanning = false;
            $('#xpg svg').css('cursor', '');
        }
    });

    $('#container').on('mousedown', '#xpg svg', function (e) {
        if (isSpacePressed) {
            e.preventDefault();
            e.stopPropagation(); // Stop selection box
            isPanning = true;
            $('#xpg svg').css('cursor', 'grabbing');
            startPanX = e.clientX;
            startPanY = e.clientY;

            // Capture starting ViewBox
            var vb = $(this).attr('viewBox');
            if (vb) {
                startViewBox = vb.split(' ').map(parseFloat);
            }
        }
    }).on('mousemove', function (e) {
        if (isPanning && startViewBox) {
            e.preventDefault();
            var dx = e.clientX - startPanX;
            var dy = e.clientY - startPanY;

            // Calculate scale (SVG Units per Pixel)
            // width attribute might be 100%, so use getBoundingClientRect
            var rect = $('#xpg svg')[0].getBoundingClientRect();
            var scaleX = startViewBox[2] / rect.width;
            var scaleY = startViewBox[3] / rect.height;

            // Update ViewBox (Pan moves the "camera", so subtract delta)
            var newX = startViewBox[0] - (dx * scaleX);
            var newY = startViewBox[1] - (dy * scaleY);

            var newVB = [newX, newY, startViewBox[2], startViewBox[3]].join(' ');
            $('#xpg svg').attr('viewBox', newVB);
        }
    }).on('mouseup', function () {
        if (isPanning) {
            isPanning = false;
            $('#xpg svg').css('cursor', 'grab');
        }
    });

});

// Overwrite the "Reset Settings" (Legacy)
$('#reset-settings').click(function () {
    if (confirm('Reset all settings?')) {
        localStorage.clear();
        location.reload();
    }
});
