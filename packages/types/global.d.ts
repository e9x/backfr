/// <reference types="node" />
import type { BackPage } from '@backfr/runtime';

declare module '_app.*' {
	export default BackPage;
}

declare module '.css' {
	const classes: { readonly [key: string]: string };
	export default classes;
}

declare module '*.module.sass' {
	const classes: { readonly [key: string]: string };
	export default classes;
}

declare module '*.module.scss' {
	const classes: { readonly [key: string]: string };
	export default classes;
}
