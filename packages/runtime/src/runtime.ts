import { BundleInfo, schema } from './bundleInfo.js';
import { ProcessedPages, processPage } from './render.js';
import Ajv from 'ajv';
import { readFileSync } from 'fs';
import { IncomingMessage, Server, ServerResponse } from 'http';
import { join, resolve } from 'path';
import semver from 'semver';

export function getPaths(cwd: string) {
	const output = join(cwd, '.back');
	const bundleInfoPath = join(output, 'bundle.json');
	const packagePath = join(output, 'package.json');
	const dist = join(output, 'dist');
	const src = resolve(cwd, 'src');
	const srcPages = join(src, 'pages');

	return { output, bundleInfoPath, packagePath, dist, src, srcPages };
}

const ajv = new Ajv();

export const { version } = <{ version: string }>(
	JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))
);

export type DetachRuntime = () => void;

export default function attachRuntime(
	cwd: string,
	server: Server
): DetachRuntime {
	const paths = getPaths(cwd);
	const bundleInfo: BundleInfo = JSON.parse(
		readFileSync(paths.bundleInfoPath, 'utf-8')
	);

	const validate = ajv.compile<BundleInfo>(schema);

	if (!validate(bundleInfo)) {
		console.error(validate.errors);
		throw new Error('Bad schema');
	}

	if (!semver.satisfies(version, bundleInfo.version))
		throw new Error(
			`Runtime (v${version}) does not satify bundle (v${bundleInfo.version})`
		);

	for (const dist of bundleInfo.dist) {
		const script = require.resolve(resolve(paths.dist, dist));
		delete require.cache[script];
	}

	const compiledPages: ProcessedPages = {};

	function onRequest(req: IncomingMessage, res: ServerResponse) {}

	for (const route in bundleInfo.pages) {
		const src = resolve(cwd, bundleInfo.pages[route]);
		compiledPages[src] = processPage(src);
	}

	server.on('request', onRequest);

	return () => {
		server.off('request', onRequest);
	};
}
