import type {
	GetServerSidePropsResult,
	Props,
	RedirectA,
	RedirectB,
	ResultA,
	ResultB,
} from '../types';

// advanced type checks
export const isRedirectA = (res: RedirectA | RedirectB): res is RedirectA =>
	'statusCode' in res;

export const isResultA = <P extends Props>(
	res: GetServerSidePropsResult<P>
): res is ResultA<P> => 'props' in res;

export const isResultB = <P extends Props>(
	res: GetServerSidePropsResult<P>
): res is ResultB => 'redirect' in res;
