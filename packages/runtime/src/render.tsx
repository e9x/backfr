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

export type ProcessedPages = Record<string, ProcessedPage>;

export function processPage(dist: string): ProcessedPage {
	const module: BackModule = require(dist);

	if (!module.default) {
		throw new Error(`Page ${dist} did not satisfy BackModule`);
	}

	const Page = module.default;
	const getServerSideProps: GetServerSideProps =
		module.getServerSideProps || (() => ({ props: {} }));

	return {
		Page,
		getServerSideProps,
	};
}

export async function renderPage(
	context: BaseContext,
	{ getServerSideProps, Page }: ProcessedPage
) {
	const result = await getServerSideProps(context);
	renderToPipeableStream(<Page {...result.props} />).pipe(context.res);
}
