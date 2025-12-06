// Custom JS for nw-page-editor
window.addEventListener('load', function () {
    console.log("Custom JS loaded: Injecting Reset Button");

    // Create Reset Button
    var btn = document.createElement('button');
    btn.innerHTML = 'Reset Settings';
    btn.style.position = 'fixed';
    btn.style.bottom = '10px';
    btn.style.left = '10px';
    btn.style.zIndex = '1000';
    btn.style.padding = '5px 10px';
    btn.style.background = '#ff4444';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.borderRadius = '3px';
    btn.style.cursor = 'pointer';

    btn.onclick = function () {
        if (confirm('Reset all editor settings? This will clear local storage and reload.')) {
            localStorage.clear();
            location.reload();
        }
    };

    document.body.appendChild(btn);
});
