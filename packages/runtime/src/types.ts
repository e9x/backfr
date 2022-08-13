import type { Request, Response } from 'express';
import type { ComponentType } from 'react';

export type Props = object;

export type BackPage<P = {}> = ComponentType<P>;

export interface BaseContext {
	req: Request;
	res: Response;
}

export type GetServerSidePropsResult<T extends Props> = { props: T };

export type GetServerSideProps<
	T extends Props = {},
	C extends BaseContext = BaseContext
> = (
	context: C
) => Promise<GetServerSidePropsResult<T>> | GetServerSidePropsResult<T>;

export interface BackModule<T extends Props = {}> {
	default: BackPage<T>;
	getServerSideProps?: GetServerSideProps<T>;
}

export type AppPage = BackPage<{
	Component: ComponentType<any>;
	pageProps: any;
}>;
