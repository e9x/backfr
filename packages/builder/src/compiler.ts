import { Config } from './config.js';
import { getPaths, BundleInfo } from '@backfr/runtime';
import { createHash } from 'crypto';
import { createReadStream, read } from 'fs';
import { readdir, readFile, writeFile } from 'fs/promises';
import glob from 'glob';
import { dirname, join, relative } from 'path';
import semver from 'semver';
import ts from 'typescript';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const globP = promisify(glob);

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version }: { version: string } = JSON.parse(
	await readFile(join(__dirname, '..', 'package.json'), 'utf-8')
);

const fileChecksum = (file: string) =>
	new Promise<string>((resolve, reject) => {
		const hash = createHash('sha256');
		const read = createReadStream(file);
		read.on('end', () => resolve(hash.digest('base64')));
		read.on('error', reject);
		read.pipe(hash);
	});

export default async function compileBack(cwd: string) {
	const paths = getPaths(cwd);

	const configFile = (await readdir(cwd)).find(
		(file) => file === 'back.config.js' || file === 'back.config.mjs'
	);

	if (!configFile) throw new Error('Config file missing');

	const { default: config }: { default: Config } = await import(configFile);

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
		if (!err || err.code !== 'ENOENT' || !(err instanceof SyntaxError))
			throw err;
	}

	const bundleInfo: BundleInfo = {
		version,
		pages: {},
		checksums: {},
	};

	const rootNames = [];

	for (const file of await globP('src/**/{*.tsx,*.jsx,*.ts,*.js}', { cwd })) {
		const dest = join(paths.dist, relative(paths.src, file));
		const checksum = fileChecksum(file);

		rootNames.push(file);
	}

	const program = ts.createProgram({
		options: {
			checkJs: false,
			rootDir: cwd,
		},
		rootNames,
	});

	program.emit();

	await writeFile(paths.bundleInfoPath, JSON.stringify(bundleInfo));
}
