/// <reference types="node" />

declare module '*.module.sass' {
	const classes: { readonly [key: string]: string };
	export = classes;
}

declare module '*.module.scss' {
	const classes: { readonly [key: string]: string };
	export = classes;
}
declare module '*.scss' {}

declare module '*.css' {}
