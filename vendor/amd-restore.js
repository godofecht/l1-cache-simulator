// Restore AMD loader after UMD libs load.
if (window.__amd_define) {
    window.define = window.__amd_define;
    window.requirejs = window.__amd_requirejs;
    window.require = window.__amd_require;
}
