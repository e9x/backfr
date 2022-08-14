import type { Request, Response } from 'express';
import type { ComponentType } from 'react';

export type Props = object;

export type BackPage<P extends Props = {}> = ComponentType<P>;

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

export interface BackModule<P extends Props = {}> {
	default: BackPage<P>;
	getServerSideProps?: GetServerSideProps<P>;
}

export interface AppProps extends Props {
	Component: ComponentType<any>;
	pageProps: any;
}

export type AppPage = BackPage<AppProps>;
