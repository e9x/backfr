import { Config } from './config.js';
import runtime from '@backfr/runtime';
import { BinaryToTextEncoding, createHash } from 'crypto';
import { createReadStream } from 'fs';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'fs/promises';
import glob from 'glob';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { createRequire } from 'module';
import { dirname, join, parse, relative, resolve, sep } from 'path';
import sass from 'sass';
import semver from 'semver';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import webpack from 'webpack';

const globP = promisify(glob);

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version }: { version: string } = JSON.parse(
	await readFile(join(__dirname, '..', 'package.json'), 'utf-8')
);

// LOL
const localRequire = createRequire(__dirname);

const fileChecksum = (
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

const stringChecksum = (
	text: string,
	algorithm: string,
	digest: BinaryToTextEncoding
) => {
	const hash = createHash(algorithm);
	hash.update(text);
	return hash.digest(digest);
};

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

	const paths = runtime.getPaths(cwd);

	const configFile = (await readdir(cwd)).find(
		(file) => file === 'back.config.js' || file === 'back.config.mjs'
	);

	if (!configFile) throw new Error('Config file missing');

	const { default: config }: { default: Config } = await import(
		resolve(cwd, configFile)
	);

	// VALIDATE CONFIG

	const shouldUseSourceMap = false;
	const publicUrlOrPath = '/';
	const imageInlineSizeLimit = 10000;

	try {
		await mkdir(paths.output);
	} catch (err) {
		if (err?.code !== 'EEXIST') throw err;
	}

	try {
		await mkdir(paths.publicFiles);
	} catch (err) {
		if (err?.code !== 'EEXIST') throw err;
	}

	try {
		await mkdir(paths.outputStatic);
	} catch (err) {
		if (err?.code !== 'EEXIST') throw err;
	}

	let prevBundleInfo: runtime.BundleInfo | void;

	try {
		const parsed: runtime.BundleInfo = JSON.parse(
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

	const bundleInfo: runtime.BundleInfo = {
		version,
		pages: {},
		checksums: {},
		dist: [],
		webResources: {},
	};

	const rootNames = [];

	for (const file of await globP('src/pages/**/{*.tsx,*.jsx,*.ts,*.js}', {
		cwd,
	})) {
		const parsed = parse(file);
		const dest = join(
			paths.dist,
			relative(paths.src, join(parsed.dir, parsed.name + '.js'))
		);
		const route =
			'/' +
			relative(
				paths.srcPages,
				parsed.name === 'index' ? parsed.dir : join(parsed.dir, parsed.name)
			).replaceAll(sep, '/');

		bundleInfo.pages[route] = relative(cwd, dest);
	}

	const javascript = await globP('src/**/{*.tsx,*.jsx,*.ts,*.js}', { cwd });

	const styles = await globP('src/**/{*.css,*.scss}', { cwd });
	// for (const file of await globP('src/**/*.*', { cwd })) {

	/*
	for (const style of styles) {
		const checksum = await stringChecksum(style, 'md5', 'hex');
		const parsed = parse(style);

		const name = `${parsed.name}.${checksum}${parsed.ext}`;

		const dest = join(paths.outputStatic, name);
		const jsDest = join(paths.dist, relative(paths.src, style));

		const route = `/static/${name}`;

		// will need to normalize
		bundleInfo.webResources[relative(cwd, jsDest)] = route;

		const res = await sass.compileAsync(style, { sourceMap: true });

		await writeFile(dest, res.css + `//#sourceMappingURL=${route}.map`);
		await writeFile(dest + '.map', JSON.stringify(res.sourceMap));
	}

	for (const style of styles) {
	}

		if (javascript.includes(file)) continue;

		const dest = join(paths.dist, relative(paths.src, file));

		try {
			await mkdir(dirname(dest), { recursive: true });
		} catch (err) {
			if (err?.code !== 'EEXIST') throw err;
		}

		await copyFile(file, dest);
	}

	for (const file of javascript) {
		const parsed = parse(file);
		const dest = join(
			paths.dist,
			relative(paths.src, join(parsed.dir, parsed.name + '.js'))
		);
		const checksum = await fileChecksum(file, 'sha256', 'base64');

		bundleInfo.checksums[file] = checksum;

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
		const idealName = getIdealIdentifier(js);

		jsNames[js] = idealName;
		entries[idealName] = resolve(cwd, js);
	}

	console.log(entries);

	const getStyleLoaders = (cssOptions: object, preProcessor?: string) => {
		const loaders: unknown[] = [
			localRequire.resolve('style-loader'),
			{
				loader: MiniCssExtractPlugin.loader,
				// css is located in `static/css`, use '../../' to locate index.html folder
				// in production `paths.publicUrlOrPath` can be a relative path
				options: publicUrlOrPath.startsWith('.')
					? { publicPath: '../../' }
					: {},
			},
			{
				loader: localRequire.resolve('css-loader'),
				options: cssOptions,
			},
			/*{
				// Options for PostCSS as we reference these options twice
				// Adds vendor prefixing based on your specified browser support in
				// package.json
				loader: localRequire.resolve('postcss-loader'),
				options: {
					postcssOptions: {
						// Necessary for external CSS imports to work
						// https://github.com/facebook/create-react-app/issues/2677
						ident: 'postcss',
						config: false,
						plugins: [
							localRequire.resolve('tailwindcss'),
							localRequire.resolve('postcss-flexbugs-fixes'),
							[
								localRequire.resolve('postcss-preset-env'),
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
					loader: localRequire.resolve('resolve-url-loader'),
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
		// context: cwd,
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
			rules: [
				// Handle node_modules packages that contain sourcemaps
				shouldUseSourceMap && {
					enforce: 'pre',
					exclude: /@babel(?:\/|\\{1,2})runtime/,
					test: /\.(js|mjs|jsx|ts|tsx|css)$/,
					loader: localRequire.resolve('source-map-loader'),
				},
				{
					// "oneOf" will traverse all following loaders until one will
					// match the requirements. When no loader matches it will fall
					// back to the "file" loader at the end of the loader list.
					oneOf: [
						// TODO: Merge this config once `image/avif` is in the mime-db
						// https://github.com/jshttp/mime-db
						{
							test: [/\.avif$/],
							type: 'asset',
							mimetype: 'image/avif',
							parser: {
								dataUrlCondition: {
									maxSize: imageInlineSizeLimit,
								},
							},
						},
						// "url" loader works like "file" loader except that it embeds assets
						// smaller than specified limit in bytes as data URLs to avoid requests.
						// A missing `test` is equivalent to a match.
						{
							test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
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
									loader: localRequire.resolve('@svgr/webpack'),
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
									loader: localRequire.resolve('file-loader'),
									options: {
										name: 'static/media/[name].[hash].[ext]',
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
							loader: localRequire.resolve('babel-loader'),
							options: {
								customize: localRequire.resolve(
									'babel-preset-react-app/webpack-overrides'
								),
								presets: [
									[
										localRequire.resolve('babel-preset-react-app'),
										{
											runtime: 'automatic',
										},
									],
								],
								// This is a feature of `babel-loader` for webpack (not Babel itself).
								// It enables caching results in ./node_modules/.cache/babel-loader/
								// directory for faster rebuilds.
								cacheDirectory: true,
								// See #6846 for context on why cacheCompression is disabled
								cacheCompression: false,
								compact: isProduction,
							},
						},
						// Process any JS outside of the app with Babel.
						// Unlike the application JS, we only compile the standard ES features.
						{
							test: /\.(js|mjs)$/,
							exclude: /@babel(?:\/|\\{1,2})runtime/,
							loader: localRequire.resolve('babel-loader'),
							options: {
								babelrc: false,
								configFile: false,
								compact: false,
								presets: [
									[
										localRequire.resolve('babel-preset-react-app/dependencies'),
										{ helpers: true },
									],
								],
								cacheDirectory: true,
								// See #6846 for context on why cacheCompression is disabled
								cacheCompression: false,

								// Babel sourcemaps are needed for debugging into node_modules
								// code.  Without the options below, debuggers like VSCode
								// show incorrect code and set breakpoints on the wrong lines.
								sourceMaps: shouldUseSourceMap,
								inputSourceMap: shouldUseSourceMap,
							},
						},
						// "postcss" loader applies autoprefixer to our CSS.
						// "css" loader resolves paths in CSS and adds assets as dependencies.
						// "style" loader turns CSS into JS modules that inject <style> tags.
						// In production, we use MiniCSSExtractPlugin to extract that CSS
						// to a file, but in development "style" loader enables hot editing
						// of CSS.
						// By default we support CSS Modules with the extension .module.css
						{
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
								'sass-loader'
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
								'sass-loader'
							),
						},
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
			new MiniCssExtractPlugin({
				// Options similar to the same options in webpackOptions.output
				// both options are optional
				filename: relative(
					cwd,
					join(paths.outputStatic, 'css', '[name].[contenthash:8].css')
				),
				chunkFilename: relative(
					cwd,
					join(paths.outputStatic, 'css', '[name].[contenthash:8].chunk.css')
				),
			}),
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
