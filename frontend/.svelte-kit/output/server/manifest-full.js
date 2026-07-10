export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["global.css"]),
	mimeTypes: {".css":"text/css"},
	_: {
		client: {start:"_app/immutable/entry/start.wf09vZ6R.js",app:"_app/immutable/entry/app.DbHFVGFq.js",imports:["_app/immutable/entry/start.wf09vZ6R.js","_app/immutable/chunks/C9UUrHyx.js","_app/immutable/chunks/RmOXOJP5.js","_app/immutable/chunks/xkzUQ1cp.js","_app/immutable/entry/app.DbHFVGFq.js","_app/immutable/chunks/RmOXOJP5.js","_app/immutable/chunks/CXWkIY0q.js","_app/immutable/chunks/Cd1suD1i.js","_app/immutable/chunks/xkzUQ1cp.js","_app/immutable/chunks/CqUZcBza.js","_app/immutable/chunks/CPo62yu0.js","_app/immutable/chunks/BlPZTb_X.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js')),
			__memo(() => import('./nodes/3.js')),
			__memo(() => import('./nodes/4.js')),
			__memo(() => import('./nodes/5.js')),
			__memo(() => import('./nodes/6.js')),
			__memo(() => import('./nodes/7.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/categories",
				pattern: /^\/categories\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/login",
				pattern: /^\/login\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/records",
				pattern: /^\/records\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/stats",
				pattern: /^\/stats\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 6 },
				endpoint: null
			},
			{
				id: "/upload",
				pattern: /^\/upload\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 7 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
