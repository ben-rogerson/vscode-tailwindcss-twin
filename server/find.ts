import { Token } from "./typings"

export interface SelectionInfo {
	selected?: Token
	inGroup: boolean
	variants: Token[]
	important: boolean
}

export interface ClassInfo {
	token: Token
	variants: Token[]
	inGroup: boolean
	important: boolean
}

export function findClasses({
	classes,
	start = 0,
	end,
	index,
	hover = false,
	greedy = true,
	separator = ":",
	handleBrackets = false,
	handleImportant = false,
	lbrace = "(",
	rbrace = ")",
}: {
	classes: string
	start?: number
	end?: number
	index?: number
	hover?: boolean
	greedy?: boolean // not stop when selection exists.
	separator?: string
	handleBrackets?: boolean
	handleImportant?: boolean
	lbrace?: string
	rbrace?: string
}): { classList: ClassInfo[]; selection: SelectionInfo } {
	classes = classes.substring(0, end)
	const reg = handleBrackets
		? new RegExp(`(([^${lbrace}${rbrace}\\s]+)${separator})+[${lbrace}]|\\S+`, "g")
		: new RegExp(`\\S+`, "g")
	const variantReg = handleBrackets
		? new RegExp(`([^${lbrace}${rbrace}\\s]+?)(?:${separator})`, "g")
		: new RegExp(`(\\S+?)(?:${separator})`, "g")
	const lbraceReg = new RegExp(`[${lbrace}]`)
	const rbraceReg = new RegExp(`[${rbrace}]`)
	reg.lastIndex = start
	const classList: ClassInfo[] = []
	let selected: Token = null
	let variantsSelected: Token[] = []
	let important = false
	let inGroup = false
	let e: RegExpExecArray
	while ((e = reg.exec(classes))) {
		const [, variants] = e
		if (variants) {
			const endBracket = findBrackets({ classes, start: reg.lastIndex - 1, lbraceReg, rbraceReg })
			if (index >= reg.lastIndex && index <= endBracket) {
				inGroup = true
			}
			variantReg.lastIndex = 0
			let m: RegExpExecArray
			const vs: Token[] = []
			while ((m = variantReg.exec(variants))) {
				const t: Token = [e.index + m.index, e.index + m.index + m[1].length, m[1]]
				vs.push(t)
				if (index >= t[0] && index < t[1]) {
					selected = t
				}
			}

			const ret = findClasses({
				classes,
				start: reg.lastIndex,
				end: endBracket,
				index,
				hover,
				greedy,
				separator,
				handleBrackets,
				handleImportant,
				lbrace,
				rbrace,
			})
			classList.push(
				...ret.classList.map(item => ({ ...item, variants: [...vs, ...item.variants], inGroup: true })),
			)

			if (index > endBracket) {
				variantsSelected = []
			} else if (index >= e.index) {
				variantsSelected = [...vs]
			}
			if (index >= e.index) {
				if (ret.selection.selected) {
					selected = ret.selection.selected
				}
				if (ret.selection.inGroup) {
					inGroup = ret.selection.inGroup
				}
				variantsSelected.push(...ret.selection.variants)
			}
			if (endBracket) {
				reg.lastIndex = endBracket + 1
			} else {
				break
			}
		} else {
			variantReg.lastIndex = e.index
			let last = variantReg.lastIndex
			let m: RegExpExecArray
			const isSelected = index >= e.index && (hover ? index < reg.lastIndex : index <= reg.lastIndex)
			const s = classes.substring(0, reg.lastIndex)
			const item: ClassInfo = {
				token: null,
				variants: [],
				inGroup: false,
				important: false,
			}
			if (isSelected) {
				variantsSelected = []
			}
			while ((m = variantReg.exec(s))) {
				last = variantReg.lastIndex
				const t: Token = [m.index, m.index + m[1].length, m[1]]
				item.variants.push(t)
				if (isSelected) {
					variantsSelected.push(t)
				}
				if (index >= t[0] && index < t[1]) {
					selected = t
				}
			}
			item.token = [last, reg.lastIndex, classes.substring(last, reg.lastIndex)]
			if (handleImportant && item.token[2].endsWith("!")) {
				item.important = true
				item.token[2] = item.token[2].substring(0, item.token[2].length - 1)
				item.token[1] = item.token[1] - 1
			}
			if (isSelected && index >= item.token[0]) {
				if (handleImportant && item.important) {
					important = true
				}
				selected = item.token
			}
			classList.push(item)
		}
		if (!greedy) {
			if (selected) break
		}
	}
	return { classList, selection: { selected, inGroup, important, variants: variantsSelected } }
}

function findBrackets({
	classes,
	start,
	lbraceReg = /[(]/,
	rbraceReg = /[)]/,
}: {
	classes: string
	start: number
	lbraceReg: RegExp
	rbraceReg: RegExp
}): number {
	const stack: number[] = []
	for (let i = start; i < classes.length; i++) {
		if (lbraceReg.test(classes[i])) {
			stack.push(i)
		} else if (rbraceReg.test(classes[i])) {
			if (stack.length === 0) {
				return undefined
			}
			if (stack.length === 1) {
				return i
			}
			stack.pop()
		}
	}
	return undefined
}
