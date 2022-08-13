import {
	BackModule,
	BackPage,
	BaseContext,
	GetServerSideProps,
	Props,
} from './types.js';

export interface ProcessedPage<T extends Props = {}> {
	getServerSideProps: GetServerSideProps<T>;
	page: BackPage<T>;
}

export type ProcessedPages = Record<string, ProcessedPage>;

export function processPage(
	dist: string,
	pages: ProcessedPages
): ProcessedPage {
	const module: BackModule = require(dist);

	if (!module.default) {
		throw new Error(`Page ${dist} did not satisfy BackModule`);
	}

	const page = module.default;
	const getServerSideProps: GetServerSideProps =
		module.getServerSideProps || (() => ({ props: {} }));

	return {
		page,
		getServerSideProps,
	};
}

export async function renderPage(context: BaseContext) {}
