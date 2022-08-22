import type {
	AppPage,
	BackPage,
	BaseContext,
	GetServerSideProps,
	Props,
} from '../types';
import { renderToStaticMarkup } from 'react-dom/server';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import type { FilledContext } from 'react-helmet-async';

export { Helmet as Head };

export interface ProcessedPage<P extends Props = {}> {
	getServerSideProps: GetServerSideProps;
	Page: BackPage<P>;
	css: string[];
}

export function renderPage<T extends Props>(
	{ Page, css }: ProcessedPage<T>,
	props: T,
	{ Page: App, css: appCSS }: ProcessedPage & { Page: AppPage },
	context: BaseContext
) {
	const helmetContext: Partial<FilledContext> = {};

	const markup = renderToStaticMarkup(
		<HelmetProvider context={helmetContext}>
			<Helmet>
				{appCSS.concat(css).map((css) => (
					<link rel="stylesheet" href={css} key={css} />
				))}
			</Helmet>
			<App Component={Page} pageProps={props} />
		</HelmetProvider>
	);

	const helmet = helmetContext.helmet!;
	context.res.setHeader('content-type', 'text/html');
	const ht = helmet.htmlAttributes.toString();

	const helmetInject = `${helmet.title.toString()}${helmet.priority}${
		helmet.meta
	}${helmet.link}${helmet.script}${helmet.noscript}`.replace(
		/ data-rh="true"/g,
		''
	);

	context.res.send(
		`<!doctype html><html${
			ht ? ' ' + ht : ht
		}><head><meta charSet="utf-8" />${helmetInject}</head><body${
			helmet.bodyAttributes
		}><div id="root">${markup}</div></html>`
	);
}
