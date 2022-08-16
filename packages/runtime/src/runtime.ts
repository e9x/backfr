import { BundleInfo, bundleInfoSchema } from './bundleInfo.js';
import { ProcessedPage, processPage, renderPage } from './render.js';
import { AppProps, BaseContext } from './types.js';
import Ajv from 'ajv';
import express from 'express';
import { readFileSync } from 'fs';
import { Server } from 'http';
import { join, resolve } from 'path';
import semver from 'semver';

export { exportCSS } from './render';

export function getPaths(cwd: string) {
	const output = join(cwd, '.back');
	const bundleInfoPath = join(output, 'bundle.json');
	const packagePath = join(output, 'package.json');
	const dist = join(output, 'dist');
	const src = resolve(cwd, 'src');
	const srcPages = join(src, 'pages');
	const publicFiles = join(cwd, 'public');
	const outputStatic = join(output, 'static');

	return {
		output,
		bundleInfoPath,
		packagePath,
		dist,
		src,
		publicFiles,
		outputStatic,
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

	const validate = ajv.compile<BundleInfo>(bundleInfoSchema);

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
	let app: ProcessedPage<AppProps>;

	for (const route in bundleInfo.pages) {
		const src = resolve(cwd, bundleInfo.pages[route]);

		const page = processPage(src);

		switch (route) {
			case '/_404':
				notFound = page;
				break;
			case '/_app':
				app = page as ProcessedPage<AppProps>;
				break;
			default:
				expressServer.all(route, async (req, res, next) => {
					const context: BaseContext = { req, res };

					try {
						await renderPage(page, app, context);
					} catch (err) {
						next(err);
					}
				});
				break;
		}
	}

	notFound ||= processPage(require.resolve('./pages/_404.js'));
	app ||= processPage(require.resolve('./pages/_app.js'));

	expressServer.use(express.static(paths.publicFiles));
	expressServer.use('/static/', express.static(paths.outputStatic));

	expressServer.use('*', async (req, res, next) => {
		const context: BaseContext = { req, res };

		try {
			await renderPage(notFound, app, context);
		} catch (err) {
			next(err);
		}
	});

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	expressServer.use((err, req, res, next) => {
		console.log(err);
		res.send('err');
	});

	server.on('request', expressServer);

	return () => {
		server.off('request', expressServer);
	};
}
