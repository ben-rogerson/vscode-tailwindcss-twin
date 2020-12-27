import type { Postcss, Plugin } from "postcss"
import path from "path"
import { TModule } from "./module"
import { extractClassNames, __INNER_TAILWIND_SEPARATOR__ } from "./classnames"
import { dlv } from "./common"

interface InitParams {
	workspaceFolder: string
	configPath: string
}

interface Settings {
	twin: boolean
	fallbackDefaultConfig: boolean
}

type PurgeOption =
	| {
			enabled: boolean
			content: string[]
	  }
	| string[]

interface TailwindConfigJS {
	purge: PurgeOption
	darkMode: false | "media" | "class"
	theme: Record<string, unknown>
	plugins: unknown[]
	separator: string
	corePlugins: unknown
	prefix: string
	important: boolean
	variants: {
		extend: Record<string, string[]>
	}

	// ...
}

export class Tailwind {
	constructor(options: Partial<InitParams & Settings>) {
		this.load(options)
	}

	private load({
		configPath,
		workspaceFolder,
		twin = false,
		fallbackDefaultConfig = false,
	}: Partial<InitParams & Settings>) {
		try {
			this.workspaceFolder = workspaceFolder
			configPath = configPath || ""
			const isAbs = configPath && path.isAbsolute(configPath)
			configPath = isAbs ? configPath : path.resolve(workspaceFolder, configPath)
			this.lookup(workspaceFolder)
			this.twin = twin
			this.fallbackDefaultConfig = fallbackDefaultConfig
			this.hasConfig = false
			if (isAbs) {
				const result = this.findConfig(configPath)
				if (result.config) {
					this.config = result.config
					this.configPath = result.configPath
					this.hasConfig = true
				}
			}
			if (!this.config) {
				if (!fallbackDefaultConfig) {
					throw Error("tailwind config is not found.")
				}
				this.config = this.defaultConfig
				this.configPath = this.defaultConfigPath
			}
		} catch (err) {
			if (err.code !== "MODULE_NOT_FOUND") {
				// throw "QQ"
			}
			if (!fallbackDefaultConfig) {
				throw Error("tailwind config is not found.")
			}
			this.config = this.defaultConfig
			this.configPath = this.defaultConfigPath
		}
		this.separator = this.config.separator || ":"
		this.config.separator = __INNER_TAILWIND_SEPARATOR__

		// change config for twin
		if (twin) {
			this.separator = ":" // always use ":" in twin
			this.config.purge = { enabled: false, content: [] }
			if (!this.config.darkMode) {
				this.config.darkMode = "media"
			}
			this.config.corePlugins = undefined
			this.config.prefix = undefined
			this.config.important = undefined
		}
	}

	async reload({
		workspaceFolder = this.workspaceFolder,
		configPath = this.configPath,
		twin = this.twin,
		fallbackDefaultConfig = this.fallbackDefaultConfig,
	}: Partial<InitParams & Settings>) {
		this.load({
			workspaceFolder,
			configPath,
			twin,
			fallbackDefaultConfig,
		})
		await this.process()
	}

	twin: boolean
	jsonTwin?: { config?: string }

	// tailwindcss
	tailwindcss: (config: string | TailwindConfigJS) => Plugin
	tailwindcssPath: string
	tailwindcssVersion: string
	resolveConfig: (config: TailwindConfigJS) => TailwindConfigJS
	defaultConfig: TailwindConfigJS
	defaultConfigPath: string
	separator: string

	// postcss
	postcss: Postcss
	postcssPath: string
	postcssVersion: string

	private lookup(base: string) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const hasTailwind = (packageJSON: any) =>
			!!packageJSON?.dependencies?.tailwindcss || !!packageJSON?.devDependencies?.tailwindcss
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const hasPostcss = (packageJSON: any) =>
			!!packageJSON?.dependencies?.postcss || !!packageJSON?.devDependencies?.postcss

		const json = TModule.require({ base, moduleId: "./package.json" })

		if (json) {
			this.jsonTwin = json.twin
		}

		if (json && hasTailwind(json)) {
			const m = new TModule(base)
			this.tailwindcssPath = m.resolve({ moduleId: "tailwindcss/package.json" })
			if (this.tailwindcssPath) {
				const tailwindcss = m.require({ moduleId: "tailwindcss" })
				const resolveConfig = m.require({ moduleId: "tailwindcss/resolveConfig" })
				const _json = m.require({ moduleId: "tailwindcss/package.json" })
				if (tailwindcss && resolveConfig && _json) {
					this.tailwindcss = tailwindcss
					this.resolveConfig = resolveConfig
					this.tailwindcssVersion = _json.version
					this.defaultConfigPath = m.resolve({ moduleId: "tailwindcss/defaultConfig" })
					this.defaultConfig = m.require({ moduleId: "tailwindcss/defaultConfig" })
				}
			}
		}

		if (!this.tailwindcss) {
			this.tailwindcssPath = TModule.resolve({ moduleId: "tailwindcss/package.json" })
			this.tailwindcss = TModule.require({ moduleId: "tailwindcss" })
			this.resolveConfig = TModule.require({ moduleId: "tailwindcss/resolveConfig" })
			const _json = TModule.require({ moduleId: "tailwindcss/package.json" })
			this.tailwindcssVersion = _json.version
			this.defaultConfigPath = TModule.resolve({ moduleId: "tailwindcss/defaultConfig" })
			this.defaultConfig = TModule.require({ moduleId: "tailwindcss/defaultConfig" })
		}

		if (json && hasPostcss(json)) {
			const m = new TModule(base)
			this.postcssPath = m.resolve({ moduleId: "postcss/package.json" })
			if (this.postcssPath) {
				const postcss = m.require({ moduleId: "postcss" })
				const _json = m.require({ moduleId: "postcss/package.json" })
				if (postcss && _json) {
					this.postcss = postcss
					this.postcssVersion = _json.version
				}
			}
		}

		if (!this.postcss) {
			if (this.tailwindcssPath) {
				const m = new TModule(path.dirname(this.tailwindcssPath))
				this.postcssPath = m.resolve({ moduleId: "postcss/package.json" })
				if (this.postcssPath) {
					const postcss = m.require({ moduleId: "postcss" })
					const _json = m.require({ moduleId: "postcss/package.json" })
					if (postcss && _json) {
						this.postcss = postcss
						this.postcssVersion = _json.version
					}
				}
			} else {
				this.postcssPath = TModule.resolve({ moduleId: "postcss/package.json" })
				this.postcss = TModule.require({ moduleId: "postcss" })
				const _json = TModule.require({ moduleId: "postcss/package.json" })
				this.postcssVersion = _json.version
			}
		}
	}

	// user config
	configPath: string
	workspaceFolder: string
	hasConfig: boolean
	config: TailwindConfigJS
	fallbackDefaultConfig: boolean

	private findConfig(configPath: string) {
		const _configPath = TModule.resolve({
			base: path.dirname(configPath),
			moduleId: "./" + path.basename(configPath),
			silent: false,
		})
		return {
			configPath: _configPath,
			config: TModule.require({
				base: path.dirname(configPath),
				moduleId: "./" + path.basename(configPath),
				silent: false,
			}) as TailwindConfigJS,
		}
	}

	classnames: ReturnType<typeof extractClassNames>

	async process() {
		const processer = this.postcss([this.tailwindcss(this.config)])
		const results = await Promise.all([
			processer.process(`@tailwind base;`, { from: undefined }),
			processer.process(`@tailwind components;`, { from: undefined }),
			processer.process(`@tailwind utilities;`, { from: undefined }),
		])
		this.config = this.resolveConfig(this.config)
		this.classnames = extractClassNames(results, this.config.darkMode, this.twin)
	}

	/**
	 * get theme value.
	 *
	 * example: ```getTheme("colors.blue.500")```
	 * @param keys
	 */
	getTheme(keys: string[]) {
		if (!this.config) {
			return undefined
		}
		return dlv(this.config.theme, keys)
	}

	getConfig(keys: string[]) {
		if (!this.config) {
			return undefined
		}
		return dlv(this.config, keys)
	}
}
