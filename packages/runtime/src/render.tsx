import {
	BackModule,
	BackPage,
	BaseContext,
	GetServerSideProps,
	Props,
} from './types.js';
import React from 'react';
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

export async function renderPage(
	{ getServerSideProps, Page }: ProcessedPage,
	context: BaseContext
) {
	const result = await getServerSideProps(context);
	context.res.setHeader('content-type', 'text/html');
	renderToPipeableStream(<Page {...result.props} />).pipe(context.res);
}
