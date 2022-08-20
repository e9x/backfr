import type {
	AppProps,
	BackHandler,
	BackMiddlewareConfig,
	BackPage,
	BaseContext,
	ErrorCodeProps,
	ErrorProps,
	Props,
} from '../types';
import type { BundleInfo } from './bundleInfo.js';
import { bundleInfoSchema } from './bundleInfo.js';
import type { ProcessedPage } from './render.js';
import { renderPage, Head } from './render.js';
import { isRedirectA, isResultA, isResultB } from './typeCheck.js';
import Ajv from 'ajv';
import express from 'express';
import { readFileSync } from 'fs';
import { STATUS_CODES } from 'http';
import type { Server } from 'http';
import createError from 'http-errors';
import { join, resolve } from 'path';
import semver from 'semver';

export { Head };

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

let lastModuleCSS: string[] | undefined;

interface BackComponent {
	module: any;
	css: string[];
}

function requireComponent(src: string): BackComponent {
	const css: string[] = [];
	lastModuleCSS = css;

	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const mod = require(src);

	lastModuleCSS = undefined;

	return { module: mod, css };
}

export function exportCSS(staticPath: string) {
	if (!lastModuleCSS) throw new Error('Unmanaged CSS import');
	lastModuleCSS.push(staticPath);
}

function processAPI(component: BackComponent): BackHandler {
	return component.module.default;
}

function processMiddleware(component: BackComponent): {
	api: BackHandler;
	config: BackMiddlewareConfig;
} {
	const config: BackMiddlewareConfig = {
		matcher: [],
	};

	if (component.module.config?.matcher)
		for (const route of component.module.config.matcher)
			config.matcher.push(route);

	if (!config.matcher.length) config.matcher.push('*');

	return {
		api: component.module.default,
		config,
	};
}

function processPage<P extends Props = {}>(
	component: BackComponent
): ProcessedPage<P> {
	if (!component.module.default)
		throw new Error(`Page did not satisfy BackModule`);

	return {
		Page: component.module.default as BackPage<P>,
		getServerSideProps:
			component.module.getServerSideProps || (() => ({ props: {} })),
		css: component.css,
	};
}

export default async function attachRuntime(
	cwd: string,
	server: Server
): Promise<DetachRuntime> {
	const paths = getPaths(cwd);
	const bundleInfo: BundleInfo = JSON.parse(
		readFileSync(paths.bundleInfoPath, 'utf-8')
	);

	const validateBundleInfo = ajv.compile<BundleInfo>(bundleInfoSchema);

	if (!validateBundleInfo(bundleInfo)) {
		console.error(validateBundleInfo.errors);
		throw new Error('Bad schema');
	}

	if (!semver.satisfies(version, bundleInfo.version))
		throw new Error(
			`Runtime (v${version}) does not satify bundle (v${bundleInfo.version})`
		);

	const expressServer = express();

	if (!bundleInfo.runtimeOptions.poweredByHeader)
		expressServer.disable('x-powered-by');

	for (const dist of bundleInfo.js) {
		const res = resolve(cwd, dist);
		delete require.cache[res];
	}

	let app: ProcessedPage<AppProps>;
	let error: ProcessedPage<ErrorProps>;

	const errorCodePages = new Map<number, ProcessedPage<ErrorCodeProps>>();

	for (const { route, src } of bundleInfo.pages) {
		const component = requireComponent(resolve(cwd, src));

		const [, errorCode] = route.match(/^\/_(\d{3})$/) || [];

		if (errorCode) {
			errorCodePages.set(
				parseInt(errorCode),
				processPage<ErrorCodeProps>(component)
			);
			continue;
		}

		if (route.startsWith('/api/')) {
			const api = processAPI(component);

			expressServer.all(route, async (req, res, next) => {
				api(req, res, next);
			});
		} else
			switch (route) {
				case '/_error':
					error = processPage<ErrorProps>(component);
					break;
				case '/_app':
					app = processPage<AppProps>(component);
					break;
				case '/middleware':
					{
						const mid = processMiddleware(component);

						for (const match of mid.config.matcher)
							expressServer.use(match, async (req, res, next) => {
								mid.api(req, res, next);
							});
					}
					break;
				default:
					{
						const page = processPage(component);

						expressServer.all(route, async (req, res, next) => {
							const context: BaseContext = { req, res };

							const result = await page.getServerSideProps(context);

							if (isResultA(result)) {
								try {
									await renderPage(page, result.props, app, context);
								} catch (err) {
									console.log(err);
									next(err);
								}
							} else if (isResultB(result)) {
								if (isRedirectA(result.redirect)) {
									res.status(result.redirect.statusCode);
								} else {
									res.status(result.redirect.permanent ? 301 : 307);
								}

								res.redirect(result.redirect.destination);
							} else {
								// .notFound has to be true, otherwise the result is invalid
								next();
							}
						});
					}
					break;
			}
	}

	if (!error) {
		if (!errorCodePages.has(404))
			errorCodePages.set(
				404,
				processPage<ErrorCodeProps>(
					requireComponent(require.resolve('./pages/_404.js'))
				)
			);

		error ||= processPage<ErrorProps>(
			requireComponent(require.resolve('./pages/_error.js'))
		);
	}

	app ||= processPage(requireComponent(require.resolve('./pages/_app.js')));

	expressServer.use(express.static(paths.publicFiles));
	expressServer.use('/static/', express.static(paths.outputStatic));

	expressServer.use('*', () => {
		throw new createError.NotFound();
	});

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	expressServer.use(async (err, req, res, next) => {
		const context: BaseContext = { req, res };

		const message = err?.message;
		let expose = false;
		let statusCode = 500;

		if (createError.isHttpError(err)) {
			statusCode = err.statusCode;
			expose = err.expose !== false;
		}

		const title = expose ? message : STATUS_CODES[statusCode] || '';

		try {
			if (errorCodePages.has(statusCode)) {
				await renderPage(
					errorCodePages.get(statusCode)!,
					{
						title,
					},
					app,
					context
				);
			} else {
				await renderPage(
					error,
					{
						statusCode,
						title,
					},
					app,
					context
				);
			}
		} catch (err) {
			console.log(err);
			res.send('');
		}
	});

	server.on('request', expressServer);

	return () => {
		server.off('request', expressServer);
	};
}
