import freeImport from '../freeImport.js';
import { Config, schema } from './config.js';
import cssPlugin, { fileChecksum } from './css-plugin.js';
import { getPaths, BundleInfo } from '@backfr/runtime';
import Ajv from 'ajv';
import { readFileSync } from 'fs';
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import glob from 'glob';
import { join, parse, relative, resolve, sep } from 'path';
import { rollup, Plugin } from 'rollup';
import typescript from 'rollup-plugin-typescript2';
import semver from 'semver';
import { promisify } from 'util';

const ajv = new Ajv();

const globP = promisify(glob);

const { version }: { version: string } = JSON.parse(
	readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
);

function getIdealIdentifier(id: string, extension: string = '') {
	const parsed = parse(id);
	return (
		join(parsed.dir, parsed.name).replace(/[^a-z0-9@]/gi, '__') + extension
	);
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

	const validate = ajv.compile<Config>(schema);

	if (!validate(config)) {
		console.error(validate.errors);
		throw new Error('Bad schema');
	}

	const sourceMap = isDevelopment || (config.sourceMap ?? true);

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
		dist: [],
		checksums: {},
	};

	const styles = await globP('src/**/{*.css,*.scss,*.sass}', { cwd });
	const javascript = await globP('src/**/{*.tsx,*.jsx,*.ts,*.js}', { cwd });

	const absoluteStyles = styles.map((asset) => resolve(cwd, asset));
	const absoluteJavascript = javascript.map((asset) => resolve(cwd, asset));

	const jsNames: Record<string, string> = {};

	const compileJS: string[] = [];

	for (const js of javascript) {
		const absolute = resolve(cwd, js);
		const idealName = getIdealIdentifier(js, '.js');
		const checksum = await fileChecksum(js, 'sha256', 'base64');

		jsNames[js] = idealName;
		bundleInfo.checksums[js] = checksum;
		bundleInfo.dist.push(relative(cwd, join(paths.dist, idealName)));

		if (!prevBundleInfo || prevBundleInfo.checksums[js] !== checksum)
			compileJS.push(js);
	}

	for (const js of await globP('src/pages/**/{*.tsx,*.jsx,*.ts,*.js}', {
		cwd,
	})) {
		const parsed = parse(js);
		const dest = join(paths.dist, jsNames[js]);

		const route =
			'/' +
			relative(
				paths.srcPages,
				parsed.name === 'index' ? parsed.dir : join(parsed.dir, parsed.name)
			).replaceAll(sep, '/');

		bundleInfo.pages[route] = relative(cwd, dest);
	}

	/*const getStyleLoaders = (cssOptions: object, preProcessor?: string) => {
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
					sourceMap: isProduction ? sourceMap : isDevelopment,
				},
			},
		].filter(Boolean);
		if (preProcessor) {
			loaders.push(
				{
					loader: require.resolve('resolve-url-loader'),
					options: {
						sourceMap: isProduction ? sourceMap : isDevelopment,
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
	};*/

	// make backjs a bunch of rollup plugins?

	for (const js of compileJS) {
		console.log(`Compiling ${js}...`);

		const res = resolve(cwd, js);
		const file = join(paths.dist, getIdealIdentifier(js, '.js'));

		const compiler = await rollup({
			input: res,
			plugins: [
				typescript({
					cwd,
					abortOnError: false,
				}),
				cssPlugin({
					file: ({ id, contentHash }) =>
						join(
							paths.outputStatic,
							'css',
							`${parse(id).name}.${contentHash.slice(-8)}.css`
						),
					public: ({ id, contentHash }) =>
						`/static/css/${parse(id).name}.${contentHash.slice(-8)}.css`,
				}),
			],
		});

		await compiler.write({
			format: 'commonjs',
			file,
			exports: 'named',
		});
	}

	await writeFile(paths.packagePath, JSON.stringify({ type: 'commonjs' }));
	await writeFile(paths.bundleInfoPath, JSON.stringify(bundleInfo));
}
