import { BundleInfo } from './bundleInfo.js';
import {
	AppPage,
	BackModule,
	BackPage,
	BaseContext,
	GetServerSideProps,
	Props,
} from './types.js';
import { resolve } from 'path';
import { renderToPipeableStream } from 'react-dom/server';
import { Helmet } from 'react-helmet';
import { PassThrough } from 'stream';

export interface ProcessedPage<P extends Props = {}> {
	getServerSideProps: GetServerSideProps;
	Page: BackPage<P>;
	css: string[];
}

function requireComponent<P extends Props = {}>(
	src: string,
	cwd: string,
	bundleInfo: BundleInfo
): { module: BackModule; css: string[] } {
	const css: string[] = [];

	require.extensions['.css'] = function (module, filename) {
		console.log(filename);

		for (const file in bundleInfo.webResources) {
			console.log(resolve(cwd, file), filename);
			if (resolve(file) === filename) {
				css.push(bundleInfo.webResources[file]);
			}
		}
	};

	const mod = require(src) as BackModule<P>;
	console.log('required', src);

	// delete require.extensions['.css'];

	return { module: mod, css };
}

export function processPage<P extends Props = {}>(
	src: string,
	cwd: string,
	bundleInfo: BundleInfo
): ProcessedPage<P> {
	const comp = requireComponent<P>(src, cwd, bundleInfo);

	if (!comp.module.default)
		throw new Error(`Page ${src} did not satisfy BackModule`);

	return {
		Page: comp.module.default as BackPage<P>,
		getServerSideProps:
			comp.module.getServerSideProps || (() => ({ props: {} })),
		css: comp.css,
	};
}

export async function renderPage(
	{ Page, getServerSideProps, css }: ProcessedPage,
	{ Page: App, css: appCSS }: ProcessedPage & { Page: AppPage },
	context: BaseContext
) {
	const result = await getServerSideProps(context);

	context.res.setHeader('content-type', 'text/html');

	const to = new PassThrough();

	to.on('data', (chunk: Buffer) => {
		context.res.write(chunk);
	});

	to.on('end', () => {
		context.res.write(`</div></body></html>`);
		context.res.end();
	});

	const stream = renderToPipeableStream(
		<>
			<Helmet>
				{appCSS.concat(css).map((css) => (
					<link rel="stylesheet" href={css} key={css} />
				))}
			</Helmet>
			<App Component={Page} pageProps={result.props} />
		</>,
		{
			onAllReady() {
				const helmet = Helmet.renderStatic();
				context.res.write(
					`<!doctype html><html ${helmet.htmlAttributes}><head><meta charSet="utf-8" />${helmet.base}${helmet.title}${helmet.meta}${helmet.link}${helmet.style}</head><body${helmet.bodyAttributes}><div id="root">`.replace(
						/ data-react-helmet="true"/,
						''
					)
				);

				stream.pipe(to);
			},
		}
	);
}
