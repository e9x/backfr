import freeImport from '../freeImport.js';
import { Config } from './config.js';
import { getPaths, BundleInfo } from '@backfr/runtime';
import { readFileSync } from 'fs';
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import glob from 'glob';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { join, parse, relative, resolve, sep } from 'path';
import semver from 'semver';
import { promisify } from 'util';
import webpack from 'webpack';

const globP = promisify(glob);

const { version }: { version: string } = JSON.parse(
	readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
);

function getIdealIdentifier(id: string) {
	return id.replace(/[^a-z0-9@]/gi, '__');
}

// style files regexes
const cssRegex = /\.css$/;
const cssModuleRegex = /\.module\.css$/;
const sassRegex = /\.(scss|sass)$/;
const sassModuleRegex = /\.module\.(scss|sass)$/;

export default async function compileBack(cwd: string, isDevelopment: boolean) {
	const isProduction = !isDevelopment;

	process.env.NODE_ENV = isDevelopment ? 'development' : 'production';

	const paths = getPaths(cwd);

	const configFile = (await readdir(cwd)).find(
		(file) => file === 'back.config.js' || file === 'back.config.mjs'
	);

	if (!configFile) throw new Error('Config file missing');

	const { default: config }: { default: Config } = await freeImport(
		resolve(cwd, configFile)
	);

	// VALIDATE CONFIG

	const shouldUseSourceMap = true;
	const publicUrlOrPath = '/';
	const imageInlineSizeLimit = 10000;

	try {
		await mkdir(paths.output);
	} catch (err) {
		if (err?.code !== 'EEXIST') throw err;
	}

	let prevBundleInfo: BundleInfo | void;

	try {
		const parsed: BundleInfo = JSON.parse(
			await readFile(paths.bundleInfoPath, 'utf-8')
		);

		if (!semver.satisfies(version, parsed.version)) {
			console.warn(
				`Builder (v${version}) does not satisfy old bundle (v${parsed.version})`
			);
		} else {
			prevBundleInfo = parsed;
		}
	} catch (err) {
		if (!err && err.code !== 'ENOENT' && !(err instanceof SyntaxError))
			throw err;
	}

	const bundleInfo: BundleInfo = {
		version,
		pages: {},
		checksums: {},
		dist: [],
	};

	const javascript = await globP('src/**/{*.tsx,*.jsx,*.ts,*.js}', { cwd });

	const styles = await globP('src/**/{*.css,*.scss}', { cwd });
	// for (const file of await globP('src/**/*.*', { cwd })) {

	/*for (const file of javascript) {
		const parsed = parse(file);
		const dest = join(
			paths.dist,
			relative(paths.src, join(parsed.dir, parsed.name + '.js'))
		);
		
		bundleInfo.dist.push(relative(cwd, dest));

		if (prevBundleInfo && prevBundleInfo.checksums[file] === checksum) {
			continue;
		}

		console.log('Updated', file);

		rootNames.push(file);
	}*/

	const entries: Record<string, string> = {};

	const jsNames: Record<string, string> = {};

	for (const js of javascript) {
		const absolute = resolve(cwd, js);
		const idealName = getIdealIdentifier(js);

		jsNames[js] = idealName;

		console.log('Updated', js);
		entries[idealName] = absolute;
	}

	for (const js of await globP('src/pages/**/{*.tsx,*.jsx,*.ts,*.js}', {
		cwd,
	})) {
		const parsed = parse(js);
		const dest = join(paths.dist, jsNames[js] + '.js');

		const route =
			'/' +
			relative(
				paths.srcPages,
				parsed.name === 'index' ? parsed.dir : join(parsed.dir, parsed.name)
			).replaceAll(sep, '/');

		bundleInfo.pages[route] = relative(cwd, dest);
	}

	const getStyleLoaders = (cssOptions: object, preProcessor?: string) => {
		const loaders: unknown[] = [
			// require.resolve('style-loader'),
			{
				loader: MiniCssExtractPlugin.loader,
				// css is located in `static/css`, use '../../' to locate index.html folder
				// in production `paths.publicUrlOrPath` can be a relative path
				options: publicUrlOrPath.startsWith('.')
					? { publicPath: '../../' }
					: {},
			},
			{
				loader: require.resolve('./test.js'),
				options: cssOptions,
			},
			/*{
				// Options for PostCSS as we reference these options twice
				// Adds vendor prefixing based on your specified browser support in
				// package.json
				loader: 'postcss-loader',
				options: {
					postcssOptions: {
						// Necessary for external CSS imports to work
						// https://github.com/facebook/create-react-app/issues/2677
						ident: 'postcss',
						config: false,
						plugins: [
							'tailwindcss',
							'postcss-flexbugs-fixes',
							[
								'postcss-preset-env',
								{
									autoprefixer: {
										flexbox: 'no-2009',
									},
									stage: 3,
								},
							],
						],
					},
					sourceMap: isProduction ? shouldUseSourceMap : isDevelopment,
				},
			},*/
		].filter(Boolean);
		if (preProcessor) {
			loaders.push(
				{
					loader: require.resolve('resolve-url-loader'),
					options: {
						sourceMap: isProduction ? shouldUseSourceMap : isDevelopment,
						root: paths.src,
					},
				},
				{
					loader: preProcessor,
					options: {
						sourceMap: true,
					},
				}
			);
		}
		return loaders;
	};

	const compiler = webpack({
		entry: entries,
		target: 'node',
		externals: async (data: {
			getResolve: () => (context: string, request: string) => Promise<string>;
			context: string;
			request: string;
		}) => {
			const resolver = data.getResolve();
			const resolved = await resolver(data.context, data.request);
			const internal = resolved.startsWith(paths.src);
			return !internal;
		},
		output: {
			filename: '[name].js',
			path: paths.dist,
			publicPath: publicUrlOrPath,
			library: {
				type: 'commonjs',
			},
		},
		mode: isDevelopment ? 'development' : 'production',
		module: {
			strictExportPresence: true,
			rules: <webpack.RuleSetRule[]>[
				// Handle node_modules packages that contain sourcemaps
				shouldUseSourceMap && {
					enforce: 'pre',
					exclude: /@babel(?:\/|\\{1,2})runtime/,
					test: /\.(js|mjs|jsx|ts|tsx|css)$/,
					loader: require.resolve('source-map-loader'),
				},
				{
					// "oneOf" will traverse all following loaders until one will
					// match the requirements. When no loader matches it will fall
					// back to the "file" loader at the end of the loader list.
					oneOf: [
						// "url" loader works like "file" loader except that it embeds assets
						// smaller than specified limit in bytes as data URLs to avoid requests.
						// A missing `test` is equivalent to a match.
						{
							test: [/\.avif$/, /\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
							type: 'asset',
							parser: {
								dataUrlCondition: {
									maxSize: imageInlineSizeLimit,
								},
							},
						},
						{
							test: /\.svg$/,
							use: [
								{
									loader: require.resolve('@svgr/webpack'),
									options: {
										prettier: false,
										svgo: false,
										svgoConfig: {
											plugins: [{ removeViewBox: false }],
										},
										titleProp: true,
										ref: true,
									},
								},
								{
									loader: require.resolve('file-loader'),
									options: {
										name: join(
											paths.outputStatic,
											'media',
											'[name].[hash].[ext]'
										),
									},
								},
							],
							issuer: {
								and: [/\.(ts|tsx|js|jsx|md|mdx)$/],
							},
						},
						// Process application JS with Babel.
						// The preset includes JSX, Flow, TypeScript, and some ESnext features.
						{
							test: /\.(js|mjs|jsx|ts|tsx)$/,
							include: paths.src,
							loader: require.resolve('ts-loader'),
							options: {
								transpileOnly: true,
								compilerOptions: {
									jsx: 'react-jsx',
								},
							},
						},
						{
							test: sassRegex,
							exclude: sassModuleRegex,
							use: [
								{
									loader: require.resolve('./css-loader.js'),
									options: {
										name: '../static/css/[name].[contenthash:8].css',
										public: '/static/css/[name].[contenthash:8].css',
										module: false,
									},
								},
								require.resolve('sass-loader'),
							],
							// Don't consider CSS imports dead code even if the
							// containing package claims to have no side effects.
							// Remove this when webpack adds a warning or an error for this.
							// See https://github.com/webpack/webpack/issues/6571
							sideEffects: true,
						},
						{
							test: sassModuleRegex,
							use: [
								{
									loader: require.resolve('./css-loader.js'),
									options: {
										name: '../static/css/[name].[contenthash:8].css',
										public: '/static/css/[name].[contenthash:8].css',
										module: true,
									},
								},
								require.resolve('sass-loader'),
							],
							// Don't consider CSS imports dead code even if the
							// containing package claims to have no side effects.
							// Remove this when webpack adds a warning or an error for this.
							// See https://github.com/webpack/webpack/issues/6571
							sideEffects: true,
						},
						// "postcss" loader applies autoprefixer to our CSS.
						// "css" loader resolves paths in CSS and adds assets as dependencies.
						// "style" loader turns CSS into JS modules that inject <style> tags.
						// In production, we use MiniCSSExtractPlugin to extract that CSS
						// to a file, but in development "style" loader enables hot editing
						// of CSS.
						// By default we support CSS Modules with the extension .module.css
						/*{
							test: cssRegex,
							exclude: cssModuleRegex,
							use: getStyleLoaders({
								importLoaders: 1,
								sourceMap: isProduction ? shouldUseSourceMap : isDevelopment,
								modules: {
									mode: 'icss',
								},
							}),
							// Don't consider CSS imports dead code even if the
							// containing package claims to have no side effects.
							// Remove this when webpack adds a warning or an error for this.
							// See https://github.com/webpack/webpack/issues/6571
							sideEffects: true,
						},
						// Adds support for CSS Modules (https://github.com/css-modules/css-modules)
						// using the extension .module.css
						{
							test: cssModuleRegex,
							use: getStyleLoaders({
								importLoaders: 1,
								sourceMap: isProduction ? shouldUseSourceMap : isDevelopment,
								modules: {
									mode: 'local',
									getLocalIdent: getIdealIdentifier,
								},
							}),
						},
						// Opt-in support for SASS (using .scss or .sass extensions).
						// By default we support SASS Modules with the
						// extensions .module.scss or .module.sass
						{
							test: sassRegex,
							exclude: sassModuleRegex,
							use: getStyleLoaders(
								{
									importLoaders: 3,
									sourceMap: isProduction ? shouldUseSourceMap : isDevelopment,
									modules: {
										mode: 'icss',
									},
								},
								require.resolve('sass-loader')
							),
							// Don't consider CSS imports dead code even if the
							// containing package claims to have no side effects.
							// Remove this when webpack adds a warning or an error for this.
							// See https://github.com/webpack/webpack/issues/6571
							sideEffects: true,
						},
						// Adds support for CSS Modules, but using SASS
						// using the extension .module.scss or .module.sass
						{
							test: sassModuleRegex,
							use: getStyleLoaders(
								{
									importLoaders: 3,
									sourceMap: isProduction ? shouldUseSourceMap : isDevelopment,
									modules: {
										mode: 'local',
										getLocalIdent: getIdealIdentifier,
									},
								},
								require.resolve('sass-loader')
							),
						},*/
						// "file" loader makes sure those assets get served by WebpackDevServer.
						// When you `import` an asset, you get its (virtual) filename.
						// In production, they would get copied to the `build` folder.
						// This loader doesn't use a "test" so it will catch all modules
						// that fall through the other loaders.
						{
							// Exclude `js` files to keep "css" loader working as it injects
							// its runtime that would otherwise be processed through "file" loader.
							// Also exclude `html` and `json` extensions so they get processed
							// by webpacks internal loaders.
							exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
							type: 'asset/resource',
						},
						// ** STOP ** Are you adding a new loader?
						// Make sure to add the new loader(s) before the "file" loader.
					],
				},
			].filter(Boolean),
		},
		plugins: [
			/*new MiniCssExtractPlugin({
				// Options similar to the same options in webpackOptions.output
				// both options are optional
				filename: relative(
					cwd,
					join('..', 'static', 'css', '[name].[contenthash:8].css')
				),
				chunkFilename: relative(
					cwd,
					join('..', 'static', 'css', '[name].[contenthash:8].chunk.css')
				),
			}),*/
		],
	});

	const res = await new Promise<webpack.Stats>((resolve, reject) =>
		compiler.run((err, res) => {
			if (err) reject(err);
			else resolve(res);
		})
	);

	console.log(res.toString());

	await writeFile(paths.packagePath, JSON.stringify({ type: 'commonjs' }));
	await writeFile(paths.bundleInfoPath, JSON.stringify(bundleInfo));
}
