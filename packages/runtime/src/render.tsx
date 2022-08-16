import {
	AppPage,
	BackPage,
	BaseContext,
	GetServerSideProps,
	Props,
} from './types.js';
import { renderToPipeableStream } from 'react-dom/server';
import { Helmet } from 'react-helmet';
import { PassThrough } from 'stream';

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

		const stream = renderToPipeableStream(
			<>
				<Helmet>
					{appCSS.concat(css).map((css) => (
						<link rel="stylesheet" href={css} key={css} />
					))}
				</Helmet>
				<App Component={Page} pageProps={props} />
			</>,
			{
				onShellError(err) {
					reject(err);
				},
				onShellReady() {
					const helmet = Helmet.renderStatic();
					context.res.setHeader('content-type', 'text/html');
					context.res.write(
						`<!doctype html><html ${helmet.htmlAttributes}><head><meta charSet="utf-8" />${helmet.base}${helmet.title}${helmet.meta}${helmet.link}${helmet.style}</head><body${helmet.bodyAttributes}><div id="root">`.replace(
							/ data-react-helmet="true"/g,
							''
						)
					);
				},
			}
		);
		stream.pipe(to);
	});
}
