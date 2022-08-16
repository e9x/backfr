import type { NextFunction, Request, Response } from 'express';
import type { ComponentType } from 'react';

export { Request, Response };

export type BackHandler = (
	req: Request,
	res: Response,
	next: NextFunction
) => void;

export type Props = object;

export type BackPage<P extends Props = {}> = ComponentType<P>;

export interface BaseContext {
	req: Request;
	res: Response;
}

export interface RedirectA {
	statusCode: 301 | 302 | 303 | 307 | 308;
	destination: string;
	basePath?: false;
}

export interface RedirectB {
	permanent: boolean;
	destination: string;
	basePath?: false;
}

export interface ResultA<P extends Props> {
	props: P | Promise<P>;
}

export interface ResultB {
	redirect: RedirectA | RedirectB;
}

export interface ResultC {
	notFound: true;
}

export type GetServerSidePropsResult<P extends Props> =
	| ResultA<P>
	| ResultB
	| ResultC;

// advanced type checks
export const isRedirectA = (res: RedirectA | RedirectB): res is RedirectA =>
	'statusCode' in res;

export const isResultA = <P extends Props>(
	res: GetServerSidePropsResult<P>
): res is ResultA<P> => 'props' in res;

export const isResultB = <P extends Props>(
	res: GetServerSidePropsResult<P>
): res is ResultB => 'redirect' in res;

export type GetServerSideProps<
	P extends Props = {},
	C extends BaseContext = BaseContext
> = (
	context: C
) => Promise<GetServerSidePropsResult<P>> | GetServerSidePropsResult<P>;

export interface AppProps extends Props {
	Component: ComponentType<any>;
	pageProps: any;
}

export type AppPage = BackPage<AppProps>;

export interface ErrorProps extends Props {
	statusCode: number;
	title: string;
}

export interface ErrorCodeProps extends Props {
	title: string;
}

export type ErrorCodePage = BackPage<ErrorCodeProps>;

export type ErrorPage = BackPage<ErrorProps>;
