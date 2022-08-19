import { fileChecksum, dataChecksum } from './checksums.js';
import { createFilter } from '@rollup/pluginutils';
import { parse as parseCSS, walk as walkCSS, CssNode } from 'css-tree';
import { mkdir, writeFile, readFile, copyFile } from 'fs/promises';
import imagemin from 'imagemin';
import imageminWebp from 'imagemin-webp';
import MagicString from 'magic-string';
import { dirname, join, parse } from 'path';
import { Plugin } from 'rollup';
import sass from 'sass';
import { optimize, OptimizedSvg, OptimizedError } from 'svgo';
import ts from 'typescript';

export interface AssetContext {
	id: string;
	contentHash: string;
}

export interface AssetLocation {
	public: string;
	file: string;
}

interface ParsedOptimizedImageQuery {
	params: URLSearchParams;
	relative: string;
}

function parseOptimizeImageQuery(
	query: string
): ParsedOptimizedImageQuery | undefined {
	if (!query.startsWith('optimizeImage?')) return;

	const end = query.slice('optimizeImage'.length);
	const lastComma = end.lastIndexOf(',');
	if (lastComma === -1) return;

	const search = end.slice(0, lastComma);
	const relative = end.slice(lastComma + 1);

	const params = new URLSearchParams(search);

	return { params, relative };
}

async function loadImage(
	data: ParsedOptimizedImageQuery,
	id: string,
	media: (context: AssetContext) => AssetLocation
) {
	let quality = parseInt(data.params.get('quality'));
	if (isNaN(quality)) quality = 100;

	const [output] = await imagemin([id], {
		plugins: [imageminWebp({ quality })],
	});

	const contentHash = dataChecksum(output.data, 'md4', 'hex');
	const betterID = join(dirname(id), parse(id).name + '.webp');
	const context: AssetContext = { id: betterID, contentHash };

	const location = media(context);

	try {
		await mkdir(dirname(location.file), { recursive: true });
	} catch (err) {
		if (err?.code !== 'EEXIST') throw err;
	}

	await writeFile(location.file, output.data);

	return location;
}

async function loadMedia(
	id: string,
	media: (context: AssetContext) => AssetLocation
) {
	const contentHash = await fileChecksum(id, 'md4', 'hex');
	const location = media({
		id: id,
		contentHash,
	});

	try {
		await mkdir(dirname(location.file), { recursive: true });
	} catch (err) {
		if (err?.code !== 'EEXIST') throw err;
	}

	await copyFile(id, location.file);

	return location;
}

export function imagePlugin(options: {
	media: (context: AssetContext) => AssetLocation;
}): Plugin {
	const pluginName = 'image-plugin';

	return {
		name: pluginName,
		async resolveId(id, importer) {
			const parsed = parseOptimizeImageQuery(id);
			if (!parsed) return;
			const res = await this.resolve(parsed.relative, importer);
			res.meta = {
				[pluginName]: parsed,
			};
			return res;
		},
		async load(id) {
			const { [pluginName]: data } = this.getModuleInfo(id).meta as {
				[pluginName]: ParsedOptimizedImageQuery;
			};

			if (!data) return;

			const location = await loadImage(data, id, options.media);

			return {
				code: `const url = ${JSON.stringify(
					location.public
				)}; export default url;`,
			};
		},
	};
}

export function mediaPlugin(options: {
	include: string;
	media: (context: AssetContext) => AssetLocation;
}): Plugin {
	const filter = createFilter(options.include);

	return {
		name: 'media-plugin',
		resolveId(id) {
			if (!filter(id)) return;
			return id;
		},
		async load(id) {
			if (!filter(id)) return;

			const location = await loadMedia(id, options.media);

			return {
				code: `const url = ${JSON.stringify(
					location.public
				)}; export default url;`,
			};
		},
	};
}

function resultIsError(
	result: OptimizedSvg | OptimizedError
): result is OptimizedError {
	return 'error' in result;
}

const convertStylesStringToObject = (stringStyles: string) => {
	const styleObject: Record<string, any> = {};

	walkCSS(
		parseCSS(stringStyles, { context: 'declarationList', positions: true }),
		{
			enter(node: CssNode) {
				if (node.type === 'Declaration') {
					let reactProp = node.property;
					if (reactProp.startsWith('-ms-'))
						reactProp = 'ms-' + reactProp.slice(4);
					reactProp = reactProp.replace(/-(.)/g, (match, char) =>
						char.toUpperCase()
					);
					styleObject[reactProp] =
						stringStyles.slice(
							node.value.loc.start.offset,
							node.value.loc.end.offset
						) + (node.important ? ' !important' : '');
				}
			},
		}
	);

	return styleObject;
};

export function svgPlugin(options: {
	include: string;
	svg(context: AssetContext): AssetLocation;
}): Plugin {
	const filter = createFilter(options.include);

	return {
		name: 'svg-plugin',
		resolveId(id) {
			if (!filter(id)) return;
			return id;
		},
		async load(id) {
			if (!filter(id)) return;

			const contentHash = await fileChecksum(id, 'md4', 'hex');
			const location = options.svg({ id, contentHash });

			try {
				await mkdir(dirname(location.file), { recursive: true });
			} catch (err) {
				if (err?.code !== 'EEXIST') throw err;
			}

			const svg = await readFile(id);

			const optimized = optimize(svg);

			const { data } = optimized as OptimizedSvg;

			await writeFile(location.file, data);

			if (resultIsError(optimized)) throw optimized.modernError;

			const jsxComponent = data
				.replace(/<svg((?: \w+="(?:[^"]|\\")*?")*)>/, '<svg$1 {...props}>')
				.replace(
					/(<.*?(?: \w+="(?:[^"]|\\")*?")*) style="((?:[^"]|\\")*?)"/g,
					(match, padStart, style) =>
						`${padStart} style={${JSON.stringify(
							convertStylesStringToObject(style)
						)}}`
				)
				.replace(
					/ (xmlns|xlink):(\w+)/g,
					(match, ns, word) => ns + word[0].toUpperCase() + word.slice(1)
				);

			const code =
				`const url = ${JSON.stringify(location.public)};` +
				`export default url;` +
				`export const ReactComponent = (props) => (${jsxComponent});`;

			const result = ts.transpileModule(code, {
				fileName: 'inline.js',
				compilerOptions: {
					jsx: ts.JsxEmit.ReactJSX,
					target: ts.ScriptTarget.ESNext,
					module: ts.ModuleKind.ESNext,
				},
			});

			return {
				code: result.outputText,
			};
		},
	};
}

export function cssPlugin(options: {
	include: string;
	includeModule: string;
	includeSass: string;
	includeMedia: string;
	css: (context: AssetContext) => AssetLocation;
	media: (context: AssetContext) => AssetLocation;
	sourceMap: boolean;
}): Plugin {
	const filter = createFilter(options.include);
	const moduleFilter = createFilter(options.includeModule);
	const mediaFilter = createFilter(options.includeMedia);

	return {
		name: 'css-plugin',
		resolveId(id) {
			if (!filter(id)) return;
			return id;
		},
		async load(id) {
			if (!filter(id)) return;

			const isModule = moduleFilter(id);

			const sourceContentHash = await fileChecksum(id, 'md4', 'hex');

			const classNames: Record<string, string> = {};

			let cssCode = await readFile(id, 'utf-8');

			const compilation = await sass.compileAsync(id, {
				sourceMap: options.sourceMap,
				sourceMapIncludeSources: true,
				style: 'compressed',
			});

			cssCode = compilation.css;
			const map = compilation.sourceMap;

			const cssMagic = new MagicString(cssCode);
			const cssTree = parseCSS(cssCode, { positions: true });

			const promises: Promise<void>[] = [];

			walkCSS(cssTree, {
				enter: (node: CssNode) => {
					if (node.type === 'Url')
						promises.push(
							(async () => {
								const value = <string>(<unknown>node.value);
								const mediaID = await this.resolve(value, id);

								if (!mediaID || !mediaFilter(mediaID.id)) return;

								const parsed = parseOptimizeImageQuery(value);

								const location = parsed
									? await loadImage(parsed, mediaID.id, options.media)
									: await loadMedia(mediaID.id, options.media);

								cssMagic.overwrite(
									node.loc.start.offset,
									node.loc.end.offset,
									`url(${JSON.stringify(location.public)})`
								);
							})()
						);

					if (isModule && node.type === 'ClassSelector') {
						const replaced = `${node.name}-${sourceContentHash.slice(-8)}`;

						classNames[node.name] = replaced;

						cssMagic.overwrite(
							node.loc.start.offset,
							node.loc.end.offset,
							`.${replaced}`
						);
					}
				},
			});

			await Promise.all(promises);

			cssCode = cssMagic.toString();

			const contentHash = dataChecksum(cssCode, 'md4', 'hex');

			const context: AssetContext = { id, contentHash };

			const location = options.css(context);

			try {
				await mkdir(dirname(location.file), { recursive: true });
			} catch (err) {
				if (err?.code !== 'EEXIST') throw err;
			}

			if (map && options.sourceMap) {
				await writeFile(
					location.file,
					cssCode + `/*# sourceMappingURL=${location.public}.map*/`
				);
				await writeFile(location.file + '.map', JSON.stringify(map));
			} else {
				await writeFile(location.file, cssCode);
			}

			return {
				code: `import { exportCSS } from "backfr"; exportCSS(${JSON.stringify(
					location.public
				)}); const styles = ${JSON.stringify(
					classNames
				)}; export default styles;`,
			};
		},
	};
}
