import { parse, walk, CssNode } from 'css-tree';
import { interpolateName } from 'loader-utils';
import MagicString from 'magic-string';
import webpack from 'webpack';

console.log(interpolateName);

function Loader(
	this: webpack.LoaderContext<{
		name: string;
		public: string;
		module: boolean;
	}>,
	content: Buffer,
	map: string,
	meta: webpack.AssetInfo
) {
	const options = this.getOptions();

	const write = interpolateName(this, options.name, { content });
	const publicPath = interpolateName(this, options.public, { content });

	const magic = new MagicString(content.toString());
	const tree = parse(content.toString(), { positions: true });

	const classNames: Record<string, string> = {};

	const replacement = (name: string) => {
		const replaced = interpolateName(this, `${name}-[contenthash:4]`, {
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

	this.emitFile(
		write,
		magic.toString(),
		JSON.stringify(magic.generateMap(JSON.parse(map))),
		meta
	);

	return `require("@backfr/runtime").exportCSS(${JSON.stringify(
		publicPath
	)});module.exports=${JSON.stringify(classNames)}`;
}

namespace Loader {
	const raw = true;
}

export default Loader;
