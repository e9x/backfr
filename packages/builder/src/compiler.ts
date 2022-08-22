import { fileChecksum } from './checksums.js';
import type { Config } from './config.js';
import { configSchema } from './config.js';
import type { AssetContext, AssetLocation } from './loaders.js';
import { parseImageLoaderQuery } from './loaders.js';
import { cssPlugin, mediaPlugin, svgPlugin, imagePlugin } from './loaders.js';
import { createFilter } from '@rollup/pluginutils';
import Ajv from 'ajv';
import { getPaths, bundleInfoSchema } from 'backfr/tools';
import type {
	BundleChecksum,
	BundleInfo,
	RuntimeOptions,
	RouteMeta,
} from 'backfr/tools';
import { ESLint } from 'eslint';
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import glob from 'glob';
import { createRequire } from 'module';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'path';
import { rollup } from 'rollup';
import sourcemaps from 'rollup-plugin-sourcemaps';
import typescript from 'rollup-plugin-typescript2';
import rsort from 'route-sort';
import semver from 'semver';
import ts from 'typescript';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const ajv = new Ajv();

const globP = promisify(glob);

export const { version }: { version: string } = JSON.parse(
	await readFile(
		join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'),
		'utf-8'
	)
);

export default async function compileBack(cwd: string, isDevelopment: boolean) {
	process.env.NODE_ENV = isDevelopment ? 'development' : 'production';

	const paths = getPaths(cwd);

	const configFile = (await readdir(cwd)).find(
		(file) => file === 'back.config.js' || file === 'back.config.mjs'
	);

	if (!configFile) throw new Error('Config file missing');

	const { default: config } = (await import(resolve(cwd, configFile))) as {
		default: Config;
	};

	const validateConfig = ajv.compile<Config>(configSchema);

	if (!validateConfig(config)) {
		console.error(validateConfig.errors);
		throw new Error('Bad schema');
	}

	const sourceMap = isDevelopment || (config.sourceMap ?? true);

	try {
		await mkdir(paths.output);
	} catch (err) {
		if (err?.code !== 'EEXIST') throw err;
	}

	let prevBundleInfo: BundleInfo | undefined;

	try {
		const parsed: BundleInfo = JSON.parse(
			await readFile(paths.bundleInfoPath, 'utf-8')
		);

		const validate = ajv.compile<BundleInfo>(bundleInfoSchema);

		if (validate(parsed) && semver.satisfies(version, parsed.version))
			prevBundleInfo = parsed;
	} catch (err) {
		if (!err && err.code !== 'ENOENT' && !(err instanceof SyntaxError))
			throw err;
	}

	config.runtimeOptions ||= {};
	config.runtimeOptions.poweredByHeader ??= true;

	const bundleInfo: BundleInfo = {
		version,
		runtimeOptions: <RuntimeOptions>config.runtimeOptions,
		pages: [],
		checksums: {},
	};

	const getDestination = (js: string) => {
		const parsed = parse(js);

		return join(
			paths.dist,
			relative(paths.src, join(parsed.dir, parsed.name + '.js'))
		);
	};

	const javascript = await globP('src/**/{*.tsx,*.jsx,*.ts,*.js}', { cwd });

	// only ONE is selected
	const [middleware] = await globP(
		'src/{middleware.tsx,middleware.jsx,middleware.ts,middleware.js}',
		{ cwd }
	);

	if (middleware) {
		const dest = getDestination(middleware);
		bundleInfo.middleware = dest;
	}

	/*
	/index
	/api/abc
	/test
	/etc
	/api/ab:testc
	/ae:test/abc
	/:test/abc
	*/

	const getRoute = (js: string) => {
		const parsed = parse(js);
		return (
			'/' +
			relative(
				paths.srcPages,
				parsed.name === 'index' ? parsed.dir : join(parsed.dir, parsed.name)
			).replaceAll(sep, '/')
		);
	};

	const pages: RouteMeta[] = [];

	for (const js of await globP('src/pages/**/{*.tsx,*.jsx,*.ts,*.js}', {
		cwd,
	})) {
		const dest = getDestination(js);
		const route = getRoute(js);

		pages.push({
			route,
			src: relative(cwd, dest),
		});
	}

	const sortedRoutes = rsort(pages.map((route) => route.route));

	for (const route of sortedRoutes)
		bundleInfo.pages.push(pages.find((page) => page.route === route));

	const tsConfigFile = ts.findConfigFile(cwd, ts.sys.fileExists);

	if (!tsConfigFile)
		throw new Error(`Couldn't find tsconfig. Incompatible project.`);

	const aParsedTsconfig = ts.parseConfigFileTextToJson(
		tsConfigFile,
		await readFile(tsConfigFile, 'utf-8')
	);

	const baseDir = dirname(tsConfigFile);

	if (aParsedTsconfig.error) {
		console.error(
			ts.formatDiagnosticsWithColorAndContext([aParsedTsconfig.error], {
				getCurrentDirectory: () => cwd,
				getCanonicalFileName: (f) => f,
				getNewLine: () => '\n',
			})
		);

		throw new Error(`Couldn't parse tsconfig. Incompatible project.`);
	}

	const parsedTsConfig = ts.parseJsonConfigFileContent(
		aParsedTsconfig.config,
		ts.sys,
		baseDir,
		undefined,
		tsConfigFile
	);

	if (parsedTsConfig.errors.length) {
		console.error(
			ts.formatDiagnosticsWithColorAndContext(parsedTsConfig.errors, {
				getCurrentDirectory: () => cwd,
				getCanonicalFileName: (f) => f,
				getNewLine: () => '\n',
			})
		);

		throw new Error(`Couldn't parse tsconfig. Incompatible project.`);
	}

	if (parsedTsConfig.options.jsx !== ts.JsxEmit.ReactJSX)
		throw new Error(`tsconfig.jsx must be "react-jsx". Incompatible project.`);

	if (parsedTsConfig.options.module !== ts.ModuleKind.ESNext)
		throw new Error(`tsconfig.module must be "ESNext". Incompatible project.`);

	const lint = new ESLint({ cwd });

	// fake async api haha
	const res = await lint.lintFiles(javascript);
	const formatter = await lint.loadFormatter();

	let errorCount = 0;
	for (const r of res) errorCount += r.errorCount;

	const formatted = await formatter.format(res);

	console.log(formatted.trim());

	if (errorCount)
		throw new Error('Fix eslint errors before trying to compile again.');

	const includeMedia = 'src/**/{*.avif,*.webp,*.bmp,*.gif,*.jpeg,*.jpg,*.png}';
	const includeCSS =
		'src/**/{*.module.scss,*.module.sass,*.module.css,*.scss,*.sass,*.css}';
	const includeSVG = 'src/**/*.svg';

	const assetFilter = createFilter([includeCSS, includeMedia, includeSVG]);

	for (const js of javascript) {
		const file = getDestination(js);

		let reuseBuild = true;

		if (prevBundleInfo && js in prevBundleInfo.checksums) {
			try {
				const goalChecksums = prevBundleInfo.checksums[js];

				for (const file in goalChecksums.requires) {
					const checksum = await fileChecksum(
						resolve(cwd, file),
						'sha256',
						'base64'
					);

					if (checksum !== goalChecksums.requires[file]) {
						reuseBuild = false;
						console.log(`Script ${js} was updated, rebuilding...`);
						break;
					}
				}

				for (const file in goalChecksums.emitted) {
					const checksum = await fileChecksum(
						resolve(cwd, file),
						'sha256',
						'base64'
					);

					if (checksum !== goalChecksums.emitted[file]) {
						reuseBuild = false;
						console.log(
							`Asset ${file} of script ${js} was corrupted, rebuilding...`
						);
						break;
					}
				}
			} catch (err) {
				console.error('error checking checksums');
				console.error(err);
				reuseBuild = false;
			}
		} else {
			console.log(`New script ${js}, building...`);
			reuseBuild = false;
		}

		if (reuseBuild) {
			bundleInfo.checksums[js] = prevBundleInfo!.checksums[js];
			continue;
		}

		const tempDist: string[] = [];

		tempDist.push(file);

		const logEmit = (location: AssetLocation) => {
			tempDist.push(location.file);
			return location;
		};

		const media = ({ id, contentHash }: AssetContext): AssetLocation =>
			logEmit({
				file: join(
					paths.outputStatic,
					'media',
					`${parse(id).name}.${contentHash.slice(-8)}${parse(id).ext}`
				),
				public: `/static/media/${parse(id).name}.${contentHash.slice(-8)}${
					parse(id).ext
				}`,
			});

		const res = resolve(cwd, js);

		const compiler = await rollup({
			input: res,
			onwarn: (warning, next) => {
				if (warning.code === 'UNRESOLVED_IMPORT') return;
				next(warning);
			},
			external: (source, importer) => {
				const req = createRequire(importer);
				let src: string;

				try {
					src = req.resolve(source);
				} catch (err) {
					// throw when a src module is being imported (or the module really can't be imported)
					src = resolve(importer, source);
				}

				return !assetFilter(src);
			},
			plugins: [
				imagePlugin({
					media,
				}),
				mediaPlugin({
					include: includeMedia,
					media,
				}),
				cssPlugin({
					sourceMap,
					include: includeCSS,
					includeSass: 'src/**/{*.scss,*.sass}',
					includeModule: 'src/**/{*.module.scss,*.module.sass,*.module.css}',
					includeMedia,
					media,
					css: ({ id, contentHash }) =>
						logEmit({
							file: join(
								paths.outputStatic,
								'css',
								`${parse(id).name}.${contentHash.slice(-8)}.css`
							),
							public: `/static/css/${parse(id).name}.${contentHash.slice(
								-8
							)}.css`,
						}),
				}),
				svgPlugin({
					include: includeSVG,
					svg: ({ id, contentHash }) =>
						logEmit({
							file: join(
								paths.outputStatic,
								'media',
								`${parse(id).name}.${contentHash.slice(-8)}.svg`
							),
							public: `/static/media/${parse(id).name}.${contentHash.slice(
								-8
							)}.svg`,
						}),
				}),
				sourceMap && sourcemaps(),
				typescript({
					cwd,
					tsconfig: tsConfigFile,
				}),
			],
		});

		await compiler.write({
			format: 'esm',
			file,
			exports: 'named',
			sourcemap: true,
		});

		const record: BundleChecksum = {
			emitted: {},
			requires: {},
		};

		for (const dist of tempDist) {
			record.emitted[relative(cwd, dist)] = await fileChecksum(
				dist,
				'sha256',
				'base64'
			);
		}

		for (const file of compiler.watchFiles) {
			const parsed = parseImageLoaderQuery(file);

			let theFile: string;

			if (parsed) {
				// parsed.relative should be absolute
				if (!isAbsolute(parsed.relative))
					throw new Error('Virtual image loader query was not absolute.');

				theFile = parsed.relative;
			} else {
				theFile = file;
			}

			record.requires[relative(cwd, theFile)] = await fileChecksum(
				theFile,
				'sha256',
				'base64'
			);
		}

		bundleInfo.checksums[js] = record;
	}

	await writeFile(paths.packagePath, JSON.stringify({ type: 'module' }));
	await writeFile(paths.bundleInfoPath, JSON.stringify(bundleInfo));
}
