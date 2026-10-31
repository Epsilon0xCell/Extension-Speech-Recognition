// Test stub for the SillyTavern extensions.js module.
export const extension_settings = {};
export const modules = [];
export function getContext() { return { chat: [] }; }
export class ModuleWorkerWrapper {
    constructor(fn) { this.fn = fn; }
    async update() {}
}
export function getApiUrl() { return ''; }
export async function doExtrasFetch() { throw new Error('extras not available in tests'); }
