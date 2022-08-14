import { Config } from './config.js';
import runtime from '@backfr/runtime';
import { BinaryToTextEncoding, createHash } from 'crypto';
import { createReadStream } from 'fs';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'fs/promises';
import glob from 'glob';
import { dirname, join, parse, relative, resolve, sep } from 'path';
import sass from 'sass';
import semver from 'semver';
import ts from 'typescript';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const globP = promisify(glob);

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version }: { version: string } = JSON.parse(
	await readFile(join(__dirname, '..', 'package.json'), 'utf-8')
);

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

export default async function compileBack(cwd: string) {
	const paths = runtime.getPaths(cwd);

	const configFile = (await readdir(cwd)).find(
		(file) => file === 'back.config.js' || file === 'back.config.mjs'
	);

	if (!configFile) throw new Error('Config file missing');

	const { default: config }: { default: Config } = await import(
		resolve(cwd, configFile)
	);

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

	for (const style of styles) {
		const checksum = await fileChecksum(style, 'sha1', 'hex');
		const parsed = parse(style);

		const name = `${parsed.name}.${checksum}${parsed.ext}`;

		const dest = join(paths.outputStatic, name);

		const route = `/static/${name}`;

		console.log(route);

		// will need to normalize
		bundleInfo.webResources[relative(cwd, style)] = route;

		const res = await sass.compileAsync(style, { sourceMap: true });

		console.log(dest, res.css, res.loadedUrls, res.sourceMap);

		await writeFile(dest, res.css + `//#sourceMappingURL=${route}.map`);
		await writeFile(dest, JSON.stringify(res.sourceMap));
	}

	for (const style of styles) {
	}

	for (const file of await globP('src/**/*.*', { cwd })) {
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
	}

	const program = ts.createProgram({
		options: {
			checkJs: false,
			rootDir: paths.src,
			outDir: paths.dist,
			jsx: ts.JsxEmit.ReactJSX,
		},
		rootNames,
	});

	program.emit();

	await writeFile(paths.packagePath, JSON.stringify({ type: 'commonjs' }));
	await writeFile(paths.bundleInfoPath, JSON.stringify(bundleInfo));
}
