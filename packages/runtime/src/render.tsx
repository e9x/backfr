import {
	AppPage,
	BackModule,
	BackPage,
	BaseContext,
	GetServerSideProps,
	Props,
} from './types.js';
import { renderToPipeableStream } from 'react-dom/server';
import { Helmet } from 'react-helmet';
import { PassThrough } from 'stream';

export interface ProcessedPage<T extends Props = {}> {
	getServerSideProps: GetServerSideProps<T>;
	Page: BackPage<T>;
}

export function processPage(module: BackModule): ProcessedPage {
	const Page = module.default;
	const getServerSideProps: GetServerSideProps =
		module.getServerSideProps || (() => ({ props: {} }));

	return {
		Page,
		getServerSideProps,
	};
}

export async function renderPage(
	{ Page, getServerSideProps }: ProcessedPage,
	App: AppPage,
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
		<App Component={Page} pageProps={result.props} />,
		{
			onAllReady() {
				const helmet = Helmet.renderStatic();
				context.res.write(
					`<!doctype html><html ${
						helmet.htmlAttributes
					}><head><meta charSet="utf-8" />${helmet.base}${helmet.title
						.toString()
						.replace(/ data-react-helmet="true"/, '')}${helmet.meta}${
						helmet.link
					}${helmet.style}</head><body${helmet.bodyAttributes}><div id="root">`
				);

				stream.pipe(to);
			},
		}
	);
}
