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

declare module '*.avif' {
	const url: string;
	export default url;
}

declare module '*.bmp' {
	const url: string;
	export default url;
}

declare module '*.gif' {
	const url: string;
	export default url;
}

declare module '*.jpeg' {
	const url: string;
	export default url;
}

declare module '*.jpg' {
	const url: string;
	export default url;
}

declare module '*.png' {
	const url: string;
	export default url;
}

declare module '*.svg' {
	const url: string;
	export const ReactComponent: React.ComponentType<React.SVGAttributes<{}>>;
	export default url;
}
