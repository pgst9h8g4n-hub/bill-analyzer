
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/private';
 * 
 * console.log(ENVIRONMENT); // => "production"
 * console.log(PUBLIC_BASE_URL); // => throws error during build
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/private' {
	export const VITE_SUPABASE_URL: string;
	export const VITE_SUPABASE_ANON_KEY: string;
	export const VITE_API_URL: string;
	export const OSLogRateLimit: string;
	export const ANTHROPIC_DEFAULT_SONNET_MODEL: string;
	export const INFOPATH: string;
	export const CLAUDE_CODE_SESSION_ID: string;
	export const VSCODE_PID: string;
	export const npm_config_user_agent: string;
	export const COREPACK_ENABLE_AUTO_PIN: string;
	export const npm_lifecycle_script: string;
	export const VSCODE_CWD: string;
	export const ANTHROPIC_AUTH_TOKEN: string;
	export const CLAUDECODE: string;
	export const npm_config_cache: string;
	export const VSCODE_IPC_HOOK: string;
	export const APPLICATION_INSIGHTS_NO_STATSBEAT: string;
	export const VSCODE_NLS_CONFIG: string;
	export const HOME: string;
	export const npm_config_prefix: string;
	export const SHLVL: string;
	export const CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: string;
	export const XPC_SERVICE_NAME: string;
	export const CLAUDE_CODE_ENABLE_TASKS: string;
	export const npm_package_version: string;
	export const MACH_PORT_RENDEZVOUS_PEER_VALDATION: string;
	export const npm_config_npm_version: string;
	export const LANG: string;
	export const EDITOR: string;
	export const XPC_FLAGS: string;
	export const npm_command: string;
	export const USER: string;
	export const GIT_EDITOR: string;
	export const __CFBundleIdentifier: string;
	export const __CF_USER_TEXT_ENCODING: string;
	export const npm_config_init_module: string;
	export const VSCODE_HANDLES_UNCAUGHT_ERRORS: string;
	export const SVELTEKIT_FORK: string;
	export const npm_node_execpath: string;
	export const _: string;
	export const npm_package_json: string;
	export const PATH: string;
	export const VSCODE_CODE_CACHE_PATH: string;
	export const ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME: string;
	export const ELECTRON_RUN_AS_NODE: string;
	export const npm_config_node_gyp: string;
	export const COPILOT_OTEL_FILE_EXPORTER_PATH: string;
	export const PWD: string;
	export const SSH_AUTH_SOCK: string;
	export const VSCODE_CRASH_REPORTER_PROCESS_TYPE: string;
	export const npm_config_globalconfig: string;
	export const NoDefaultCurrentDirectoryInExePath: string;
	export const npm_config_global_prefix: string;
	export const VSCODE_ESM_ENTRYPOINT: string;
	export const npm_lifecycle_event: string;
	export const ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: string;
	export const FPATH: string;
	export const AI_AGENT: string;
	export const NODE_ENV: string;
	export const CLAUDE_CODE_EXECPATH: string;
	export const ANTHROPIC_DEFAULT_FABLE_MODEL: string;
	export const TMPDIR: string;
	export const MallocNanoZone: string;
	export const LOGNAME: string;
	export const ANTHROPIC_BASE_URL: string;
	export const npm_config_local_prefix: string;
	export const npm_package_name: string;
	export const npm_config_noproxy: string;
	export const CLAUDE_CODE_CHILD_SESSION: string;
	export const SHELL: string;
	export const VSCODE_L10N_BUNDLE_LOCATION: string;
	export const CLAUDE_CODE_ENTRYPOINT: string;
	export const COLOR: string;
	export const CLAUDE_AGENT_SDK_VERSION: string;
	export const COMMAND_MODE: string;
	export const ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: string;
	export const ANTHROPIC_DEFAULT_OPUS_MODEL: string;
	export const MXC_BIN_DIR: string;
	export const npm_execpath: string;
	export const npm_config_userconfig: string;
	export const ANTHROPIC_DEFAULT_FABLE_MODEL_NAME: string;
	export const ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
	export const INIT_CWD: string;
	export const HOMEBREW_CELLAR: string;
	export const MCP_CONNECTION_NONBLOCKING: string;
	export const HOMEBREW_PREFIX: string;
	export const HOMEBREW_REPOSITORY: string;
	export const NODE: string;
	export const CLAUDE_EFFORT: string;
}

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/public';
 * 
 * console.log(ENVIRONMENT); // => throws error during build
 * console.log(PUBLIC_BASE_URL); // => "http://site.com"
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * 
 * console.log(env.ENVIRONMENT); // => "production"
 * console.log(env.PUBLIC_BASE_URL); // => undefined
 * ```
 */
declare module '$env/dynamic/private' {
	export const env: {
		VITE_SUPABASE_URL: string;
		VITE_SUPABASE_ANON_KEY: string;
		VITE_API_URL: string;
		OSLogRateLimit: string;
		ANTHROPIC_DEFAULT_SONNET_MODEL: string;
		INFOPATH: string;
		CLAUDE_CODE_SESSION_ID: string;
		VSCODE_PID: string;
		npm_config_user_agent: string;
		COREPACK_ENABLE_AUTO_PIN: string;
		npm_lifecycle_script: string;
		VSCODE_CWD: string;
		ANTHROPIC_AUTH_TOKEN: string;
		CLAUDECODE: string;
		npm_config_cache: string;
		VSCODE_IPC_HOOK: string;
		APPLICATION_INSIGHTS_NO_STATSBEAT: string;
		VSCODE_NLS_CONFIG: string;
		HOME: string;
		npm_config_prefix: string;
		SHLVL: string;
		CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: string;
		XPC_SERVICE_NAME: string;
		CLAUDE_CODE_ENABLE_TASKS: string;
		npm_package_version: string;
		MACH_PORT_RENDEZVOUS_PEER_VALDATION: string;
		npm_config_npm_version: string;
		LANG: string;
		EDITOR: string;
		XPC_FLAGS: string;
		npm_command: string;
		USER: string;
		GIT_EDITOR: string;
		__CFBundleIdentifier: string;
		__CF_USER_TEXT_ENCODING: string;
		npm_config_init_module: string;
		VSCODE_HANDLES_UNCAUGHT_ERRORS: string;
		SVELTEKIT_FORK: string;
		npm_node_execpath: string;
		_: string;
		npm_package_json: string;
		PATH: string;
		VSCODE_CODE_CACHE_PATH: string;
		ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME: string;
		ELECTRON_RUN_AS_NODE: string;
		npm_config_node_gyp: string;
		COPILOT_OTEL_FILE_EXPORTER_PATH: string;
		PWD: string;
		SSH_AUTH_SOCK: string;
		VSCODE_CRASH_REPORTER_PROCESS_TYPE: string;
		npm_config_globalconfig: string;
		NoDefaultCurrentDirectoryInExePath: string;
		npm_config_global_prefix: string;
		VSCODE_ESM_ENTRYPOINT: string;
		npm_lifecycle_event: string;
		ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: string;
		FPATH: string;
		AI_AGENT: string;
		NODE_ENV: string;
		CLAUDE_CODE_EXECPATH: string;
		ANTHROPIC_DEFAULT_FABLE_MODEL: string;
		TMPDIR: string;
		MallocNanoZone: string;
		LOGNAME: string;
		ANTHROPIC_BASE_URL: string;
		npm_config_local_prefix: string;
		npm_package_name: string;
		npm_config_noproxy: string;
		CLAUDE_CODE_CHILD_SESSION: string;
		SHELL: string;
		VSCODE_L10N_BUNDLE_LOCATION: string;
		CLAUDE_CODE_ENTRYPOINT: string;
		COLOR: string;
		CLAUDE_AGENT_SDK_VERSION: string;
		COMMAND_MODE: string;
		ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: string;
		ANTHROPIC_DEFAULT_OPUS_MODEL: string;
		MXC_BIN_DIR: string;
		npm_execpath: string;
		npm_config_userconfig: string;
		ANTHROPIC_DEFAULT_FABLE_MODEL_NAME: string;
		ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
		INIT_CWD: string;
		HOMEBREW_CELLAR: string;
		MCP_CONNECTION_NONBLOCKING: string;
		HOMEBREW_PREFIX: string;
		HOMEBREW_REPOSITORY: string;
		NODE: string;
		CLAUDE_EFFORT: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://example.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.ENVIRONMENT); // => undefined, not public
 * console.log(env.PUBLIC_BASE_URL); // => "http://example.com"
 * ```
 * 
 * ```
 * 
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
