import { createFilter } from '@rollup/pluginutils';
import { BinaryToTextEncoding, createHash } from 'crypto';
import { parse as parseCSS, walk as walkCSS, CssNode } from 'css-tree';
import { createReadStream } from 'fs';
import { mkdir, writeFile, readFile, copyFile } from 'fs/promises';
import MagicString from 'magic-string';
import { dirname } from 'path';
import { Plugin } from 'rollup';
import sass from 'sass';

interface AssetContext {
	id: string;
	contentHash: string;
}

export const fileChecksum = (
	file: string,
	algorithm: string,
	digest: BinaryToTextEncoding
) =>
	new Promise<string>((resolve, reject) => {
		const hash = createHash(algorithm);
		const read = createReadStream(file);
		read.on('end', () => resolve(hash.digest(digest)));
		read.on('error', reject);
		read.pipe(hash);
	});

export const stringChecksum = (
	text: string,
	algorithm: string,
	digest: BinaryToTextEncoding
) => {
	const hash = createHash(algorithm);
	hash.update(text);
	return hash.digest(digest);
};

export function assetPlugin(options: {
	include: string;
	file(context: AssetContext): string;
	public(context: AssetContext): string;
}): Plugin {
	const filter = createFilter(options.include);

	return {
		name: 'asset-plugin',
		resolveId(id) {
			if (!filter(id)) return;
			return id;
		},
		async load(id) {
			if (!filter(id)) return;

			const contentHash = await fileChecksum(id, 'md4', 'hex');
			const context: AssetContext = { id, contentHash };

			const filePath = options.file(context);
			const publicPath = options.public(context);

			try {
				await mkdir(dirname(filePath), { recursive: true });
			} catch (err) {
				if (err?.code !== 'EEXIST') throw err;
			}

			await copyFile(id, filePath);

			return {
				code: `const url = ${JSON.stringify(publicPath)}; export default url;`,
			};
		},
	};
}

export function cssPlugin(options: {
	include: string;
	module: string;
	sass: string;
	file(context: AssetContext): string;
	public(context: AssetContext): string;
	sourceMap: boolean;
}): Plugin {
	const filter = createFilter(options.include);
	const sassFilter = createFilter(options.sass);
	const moduleFilter = createFilter(options.module);

	return {
		name: 'css-plugin',
		resolveId(id) {
			if (!filter(id)) return;
			return id;
		},
		async load(id) {
			if (!filter(id)) return;

			const isSass = sassFilter(id);
			const isModule = moduleFilter(id);

			const contentHash = await fileChecksum(id, 'md4', 'hex');
			const context: AssetContext = { id, contentHash };

			const filePath = options.file(context);
			const fileMapPath = options.file(context) + '.map';
			const publicPath = options.public(context);

			const classNames: Record<string, string> = {};

			let map: any;

			try {
				await mkdir(dirname(filePath), { recursive: true });
			} catch (err) {
				if (err?.code !== 'EEXIST') throw err;
			}

			let cssCode = await readFile(id, 'utf-8');

			if (isSass) {
				const compilation = await sass.compileAsync(id, {
					sourceMap: options.sourceMap,
					sourceMapIncludeSources: true,
					style: 'compressed',
				});

				cssCode = compilation.css;
				map = compilation.sourceMap;
			}

			if (isModule) {
				const cssMagic = new MagicString(cssCode);
				const cssTree = parseCSS(cssCode, { positions: true });

				walkCSS(cssTree, {
					enter(node: CssNode) {
						if (node.type === 'ClassSelector') {
							const replaced = `${node.name}-${contentHash.slice(-8)}`;

							classNames[node.name] = replaced;

							cssMagic.overwrite(
								node.loc.start.offset,
								node.loc.end.offset,
								`.${replaced}`
							);
						}
					},
				});

				cssCode = cssMagic.toString();
			}

			if (map) {
				await writeFile(
					filePath,
					cssCode + `/*# sourceMappingURL=${publicPath}.map*/`
				);
				await writeFile(fileMapPath, JSON.stringify(map));
			} else {
				await writeFile(filePath, cssCode);
			}

			return {
				code: `import { exportCSS } from "@backfr/runtime"; exportCSS(${JSON.stringify(
					publicPath
				)}); const styles = ${JSON.stringify(
					classNames
				)}; export default styles;`,
			};
		},
	};
}

/**
	const options = this.getOptions();

	const write = interpolateName(this, options.name, { content });
	const publicPath = interpolateName(this, options.public, { content });

	const classNames: Record<string, string> = {};

	if (options.module) {
		const magic = new MagicString(content.toString());
		const tree = parse(content.toString(), { positions: true });

		const replacement = (name: string) => {
			const replaced = interpolateName(this, `${name}-[contenthash:8]`, {
				content,
			});
			classNames[name] = replaced;
			return replaced;
		};

		walk(tree, {
			enter(node: CssNode) {
				if (node.type === 'ClassSelector')
					magic.overwrite(
						node.loc.start.offset,
						node.loc.end.offset,
						`.${replacement(node.name)}`
					);
			},
		});

		const generated = magic.generateMap({
			source: publicPath,
			includeContent: true,
		});

		const merged = merge(generated, map);

		map = merged;
		content = magic.toString();
	}

	//@ts-ignore
	this.emitFile(write, content, map);

	return `require("@backfr/runtime").exportCSS(${JSON.stringify(
		publicPath
	)});module.exports=${JSON.stringify(classNames)}`;*/
