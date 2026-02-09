// Temporarily disable AMD loader so UMD libs attach to window.
window.__amd_define = window.define;
window.__amd_requirejs = window.requirejs;
window.__amd_require = window.require;
window.define = undefined;
window.requirejs = undefined;
window.require = undefined;
