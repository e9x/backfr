import {
	AppPage,
	BackPage,
	BaseContext,
	GetServerSideProps,
	Props,
} from './types.js';
import { renderToPipeableStream } from 'react-dom/server';
import { FilledContext, Helmet, HelmetProvider } from 'react-helmet-async';
import { PassThrough } from 'stream';

export { Helmet as Head };

export interface BackModule<P extends Props = {}> {
	default: BackPage<P>;
	getServerSideProps?: GetServerSideProps<P>;
}

export interface ProcessedPage<P extends Props = {}> {
	getServerSideProps: GetServerSideProps;
	Page: BackPage<P>;
	css: string[];
}

export async function renderPage<T extends Props>(
	{ Page, css }: ProcessedPage<T>,
	props: T,
	{ Page: App, css: appCSS }: ProcessedPage & { Page: AppPage },
	context: BaseContext
) {
	return await new Promise<void>((resolve, reject) => {
		const to = new PassThrough();

		to.on('data', (chunk: Buffer) => {
			context.res.write(chunk);
		});

		to.on('end', () => {
			context.res.write(`</div></body></html>`);
			context.res.end();
			resolve();
		});

		const helmetContext: Partial<FilledContext> = {};

		const stream = renderToPipeableStream(
			<HelmetProvider context={helmetContext}>
				<Helmet>
					{appCSS.concat(css).map((css) => (
						<link rel="stylesheet" href={css} key={css} />
					))}
				</Helmet>
				<App Component={Page} pageProps={props} />
			</HelmetProvider>,
			{
				onShellError(err) {
					reject(err);
				},
				onShellReady() {
					const helmet = helmetContext.helmet!;
					context.res.setHeader('content-type', 'text/html');
					const ht = helmet.htmlAttributes.toString();
					console.log(JSON.stringify(ht));
					context.res.write(
						`<!doctype html><html${
							ht ? ' ' + ht : ht
						}><head><meta charSet="utf-8" />${helmet.title.toString()}${
							helmet.priority
						}${helmet.meta}${helmet.link}${helmet.script}${
							helmet.noscript
						}</head><body${helmet.bodyAttributes}><div id="root">`.replace(
							/ data-rh="true"/g,
							''
						)
					);
				},
			}
		);

		stream.pipe(to);
	});
}
