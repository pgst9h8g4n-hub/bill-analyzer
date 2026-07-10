

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/layout.svelte.js')).default;
export const imports = ["_app/immutable/nodes/0.B0Rqi-hs.js","_app/immutable/chunks/Cd1suD1i.js","_app/immutable/chunks/RmOXOJP5.js","_app/immutable/chunks/CPo62yu0.js"];
export const stylesheets = [];
export const fonts = [];
