import {
	AppPage,
	BackModule,
	BackPage,
	BaseContext,
	DocumentPage,
	GetServerSideProps,
	Props,
} from './types.js';
import { renderToPipeableStream } from 'react-dom/server';

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

async function renderable(
	{ getServerSideProps, Page }: ProcessedPage,
	context: BaseContext
) {
	const result = await getServerSideProps(context);
	return <Page {...result.props} />;
}

export async function renderPage(
	{ Page, getServerSideProps }: ProcessedPage,
	App: AppPage,
	context: BaseContext
) {
	const result = await getServerSideProps(context);

	context.res.setHeader('content-type', 'text/html');
	renderToPipeableStream(
		<html>
			<head>
				<meta charSet="utf-8" />
			</head>
			<body>
				<App Component={Page} pageProps={result.props} />
			</body>
		</html>,
		{
			namespaceURI: 'HTML',
		}
	).pipe(context.res);
}
