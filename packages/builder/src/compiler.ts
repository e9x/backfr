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
import { getPaths, BundleInfo } from '@backfr/runtime';
import { bundleInfoSchema } from '@backfr/runtime';
import Ajv from 'ajv';
import { readFileSync } from 'fs';
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import glob from 'glob';
import { dirname, join, parse, relative, resolve, sep } from 'path';
import { rollup } from 'rollup';
import sourcemaps from 'rollup-plugin-sourcemaps';
import typescript from 'rollup-plugin-typescript2';
import semver from 'semver';
import ts from 'typescript';
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
		pages: {},
		dist: [],
		checksums: {},
	};

	const javascript = await globP('src/**/{*.tsx,*.jsx,*.ts,*.js}', { cwd });
	const jsNames: Record<string, string> = {};

	for (const js of javascript) {
		const idealName = getIdealIdentifier(js, '.js');

		jsNames[js] = idealName;
		bundleInfo.dist.push(relative(cwd, join(paths.dist, idealName)));
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

	if (parsedTsConfig.options.jsx !== ts.JsxEmit.ReactJSX) {
		throw new Error(`tsconfig.jsx must be "react-jsx". Incompatible project.`);
	}

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

		if (reuseBuild) {
			console.log('Skip', js);
			bundleInfo.checksums[js] = prevBundleInfo!.checksums[js];
			continue;
		}

		console.log('Compile', js);

		const res = resolve(cwd, js);
		const file = join(paths.dist, getIdealIdentifier(js, '.js'));

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

		const compiler = await rollup({
			input: res,
			onwarn: (warning, next) => {
				if (warning.code === 'UNRESOLVED_IMPORT') return;
				next(warning);
			},
			plugins: [
				mediaPlugin({
					include: includeMedia,
					media,
				}),
				cssPlugin({
					sourceMap,
					include:
						'src/**/{*.module.scss,*.module.sass,*.module.css,*.scss,*.sass,*.css}',
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
					include: 'src/**/*.svg',
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
					abortOnError: false,
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
