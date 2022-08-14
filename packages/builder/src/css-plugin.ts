/*
import { interpolateName } from 'loader-utils';
import merge from 'merge-source-map';*/
import { createFilter } from '@rollup/pluginutils';
import { BinaryToTextEncoding, createHash } from 'crypto';
import { parse as parseCSS, walk as walkCSS, CssNode } from 'css-tree';
import { createReadStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import MagicString from 'magic-string';
import { dirname, parse } from 'path';
import { Plugin } from 'rollup';

interface CSSContext {
	id: string;
	contentHash: string;
}

interface CSSPluginOptions {
	file(context: CSSContext): string;
	public(context: CSSContext): string;
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
	const filter = createFilter('src/**/{*.css,*.module.css}');

	return {
		name: 'CSS',
		async transform(code, id) {
			if (!filter(id)) return undefined;

			/*const transformResult: TransformationResult = {
				code: result.code,
				map: { mappings: '' },
			};

			if (result.map) {
				pluginOptions.sourceMapCallback?.(id, result.map);
				transformResult.map = JSON.parse(result.map);
			}*/

			const classNames: Record<string, string> = {};

			const cssMagic = new MagicString(code);
			const cssTree = parseCSS(code, { positions: true });
			const contentHash = stringChecksum(code, 'md4', 'hex');

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

			const context: CSSContext = { id, contentHash };

			const filePath = options.file(context);

			try {
				await mkdir(dirname(filePath), { recursive: true });
			} catch (err) {
				if (err?.code !== 'EEXIST') throw err;
			}

			console.log(filePath);

			// sourcemaps, check if options.sourceMap
			await writeFile(filePath, cssMagic.toString());

			const publicPath = options.public(context);

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
