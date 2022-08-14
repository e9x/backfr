import { parse, walk, CssNode } from 'css-tree';
import { interpolateName } from 'loader-utils';
import MagicString from 'magic-string';
import merge from 'merge-source-map';
import webpack from 'webpack';

function Loader(
	this: webpack.LoaderContext<{
		name: string;
		public: string;
		module: boolean;
		sourceMap: boolean;
	}>,
	content: Buffer | string,
	map: object
) {
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
	)});module.exports=${JSON.stringify(classNames)}`;
}

namespace Loader {
	const raw = true;
}

export default Loader;
