import { createFilter } from '@rollup/pluginutils';
import { BinaryToTextEncoding, createHash } from 'crypto';
import { parse as parseCSS, walk as walkCSS, CssNode } from 'css-tree';
import { createReadStream } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import MagicString from 'magic-string';
import { dirname } from 'path';
import { Plugin } from 'rollup';
import sass from 'sass';
import sorcery from 'sorcery';

interface CSSContext {
	id: string;
	contentHash: string;
}

interface CSSPluginOptions {
	include: string;
	module: string;
	sass: string;
	file(context: CSSContext): string;
	public(context: CSSContext): string;
	sourceMap: boolean;
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

export default function cssPlugin(options: CSSPluginOptions): Plugin {
	const filter = createFilter(options.include);
	const sassFilter = createFilter(options.sass);
	const moduleFilter = createFilter(options.module);

	return {
		name: 'CSS',
		async transform(code, id) {
			if (!filter(id)) return undefined;

			const isSass = sassFilter(id);
			const isModule = moduleFilter(id);

			const contentHash = stringChecksum(code, 'md4', 'hex');
			const context: CSSContext = { id, contentHash };

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

			let cssCode = code;

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

			const mainMagic = new MagicString(code);

			mainMagic.replace(/^[\s\S]*?$/g, '');

			mainMagic.prependLeft(
				0,
				`import { exportCSS } from "@backfr/runtime"; exportCSS(${JSON.stringify(
					publicPath
				)}); const styles = ${JSON.stringify(
					classNames
				)}; export default styles;`
			);

			return {
				code: mainMagic.toString(),
				map: mainMagic.generateMap(),
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
