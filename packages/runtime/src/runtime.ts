import { BundleInfo, schema } from './bundleInfo.js';
import * as NotFoundModule from './pages/_404.js';
import * as AppModule from './pages/_app.js';
import { ProcessedPage, processPage, renderPage } from './render.js';
import { BackModule, BaseContext } from './types.js';
import Ajv from 'ajv';
import express from 'express';
import { readFileSync } from 'fs';
import { Server } from 'http';
import { join, resolve } from 'path';
import semver from 'semver';

export function getPaths(cwd: string) {
	const output = join(cwd, '.back');
	const bundleInfoPath = join(output, 'bundle.json');
	const packagePath = join(output, 'package.json');
	const dist = join(output, 'dist');
	const src = resolve(cwd, 'src');
	const srcPages = join(src, 'pages');
	const publicFiles = join(src, 'public');

	return {
		output,
		bundleInfoPath,
		packagePath,
		dist,
		src,
		publicFiles,
		srcPages,
	};
}

const ajv = new Ajv();

export const { version } = JSON.parse(
	readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
) as { version: string };

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

	const expressServer = express();

	for (const dist of bundleInfo.dist) {
		const script = resolve(cwd, dist);
		delete require.cache[script];
	}

	let notFound: ProcessedPage;
	let app: ProcessedPage;

	for (const route in bundleInfo.pages) {
		const src = resolve(cwd, bundleInfo.pages[route]);

		const module: BackModule = require(src);

		if (!module.default)
			throw new Error(`Page ${src} did not satisfy BackModule`);

		const page = processPage(module);

		switch (route) {
			case '/_404':
				notFound = page;
				break;
			case '/_app':
				app = page;
				break;
			default:
				expressServer.all(route, async (req, res, next) => {
					const context: BaseContext = { req, res };

					try {
						await renderPage(page, context);
					} catch (err) {
						next(err);
					}
				});
				break;
		}
	}

	notFound ||= processPage(NotFoundModule);
	app ||= processPage(AppModule);

	expressServer.use(express.static(paths.publicFiles));

	expressServer.use('*', async (req, res, next) => {
		console.log('404');
		const context: BaseContext = { req, res };

		try {
			await renderPage(notFound, context);
		} catch (err) {
			next(err);
		}
	});

	expressServer.use((err, req, res, next) => {
		console.log(err);
		res.send('err');
	});

	server.on('request', expressServer);

	return () => {
		server.off('request', expressServer);
	};
}
