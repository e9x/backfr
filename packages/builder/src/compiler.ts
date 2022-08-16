import freeImport from '../freeImport.js';
import { Config, configSchema } from './config.js';
import {
	cssPlugin,
	mediaPlugin,
	svgPlugin,
	fileChecksum,
	AssetContext,
	AssetLocation,
} from './loaders.js';
import { getPaths, BundleInfo, RouteMeta } from '@backfr/runtime';
import { bundleInfoSchema } from '@backfr/runtime';
import { createFilter } from '@rollup/pluginutils';
import Ajv from 'ajv';
import { ESLint } from 'eslint';
import { readFileSync } from 'fs';
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import glob from 'glob';
import { createRequire } from 'module';
import { dirname, join, parse, relative, resolve, sep } from 'path';
import { rollup } from 'rollup';
import sourcemaps from 'rollup-plugin-sourcemaps';
import typescript from 'rollup-plugin-typescript2';
import semver from 'semver';
import sort from 'sort-route-paths';
import ts from 'typescript';
import { promisify } from 'util';

const ajv = new Ajv();

const globP = promisify(glob);

const { version }: { version: string } = JSON.parse(
	readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
);

export default async function compileBack(cwd: string, isDevelopment: boolean) {
	process.env.NODE_ENV = isDevelopment ? 'development' : 'production';

	const paths = getPaths(cwd);

	const configFile = (await readdir(cwd)).find(
		(file) => file === 'back.config.js' || file === 'back.config.mjs'
	);

	if (!configFile) throw new Error('Config file missing');

	const { default: config } = (await freeImport(resolve(cwd, configFile))) as {
		default: Config;
	};

	const validate = ajv.compile<Config>(configSchema);

	if (!validate(config)) {
		console.error(validate.errors);
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

	const bundleInfo: BundleInfo = {
		version,
		pages: [],
		dist: [],
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

	/*
	/index
	/api/abc
	/test
	/etc
	/api/ab:testc
	/ae:test/abc
	/:test/abc
	*/

	const pages: RouteMeta[] = [];

	for (const js of await globP('src/pages/**/{*.tsx,*.jsx,*.ts,*.js}', {
		cwd,
	})) {
		const dest = getDestination(js);
		const parsed = parse(js);

		const route =
			'/' +
			relative(
				paths.srcPages,
				parsed.name === 'index' ? parsed.dir : join(parsed.dir, parsed.name)
			).replaceAll(sep, '/');

		pages.push({
			route,
			src: relative(cwd, dest),
		});
	}

	bundleInfo.pages = sort(pages, (entry) => entry.route);

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

	const media = ({ id, contentHash }: AssetContext): AssetLocation => ({
		file: join(
			paths.outputStatic,
			'media',
			`${parse(id).name}.${contentHash.slice(-8)}${parse(id).ext}`
		),
		public: `/static/media/${parse(id).name}.${contentHash.slice(-8)}${
			parse(id).ext
		}`,
	});

	const includeMedia = 'src/**/{*.avif,*.bmp,*.gif,*.jpeg,*.jpg,*.png}';
	const includeCSS =
		'src/**/{*.module.scss,*.module.sass,*.module.css,*.scss,*.sass,*.css}';
	const includeSVG = 'src/**/*.svg';

	const assetFilter = createFilter([includeCSS, includeMedia, includeSVG]);

	for (const js of javascript) {
		let reuseBuild = true;

		if (prevBundleInfo && js in prevBundleInfo.checksums) {
			const goalChecksums = prevBundleInfo.checksums[js];

			for (const file in goalChecksums) {
				const checksum = await fileChecksum(
					resolve(cwd, file),
					'sha256',
					'base64'
				);

				if (checksum !== goalChecksums[file]) {
					reuseBuild = false;
					console.log(js, 'cannot be lazy compiled,', file, 'was updated');
					break;
				}
			}
		} else {
			reuseBuild = false;
		}

		const file = getDestination(js);

		bundleInfo.dist.push(relative(cwd, file));

		if (reuseBuild) {
			console.log('Skip', js);
			bundleInfo.checksums[js] = prevBundleInfo!.checksums[js];
			continue;
		}

		console.log('Compile', js);

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
					css: ({ id, contentHash }) => ({
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
					svg: ({ id, contentHash }) => ({
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
				sourcemaps(),
				typescript({
					cwd,
					tsconfig: tsConfigFile,
				}),
			],
		});

		await compiler.write({
			format: 'commonjs',
			file,
			exports: 'named',
			sourcemap: true,
		});

		const record: Record<string, string> = {};

		for (const file of compiler.watchFiles) {
			record[relative(cwd, file)] = await fileChecksum(
				file,
				'sha256',
				'base64'
			);
		}

		bundleInfo.checksums[js] = record;
	}

	await writeFile(paths.packagePath, JSON.stringify({ type: 'commonjs' }));
	await writeFile(paths.bundleInfoPath, JSON.stringify(bundleInfo));
}
