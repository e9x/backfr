// worked very well when type was commonjs and esmoduleinteropt was enabled...
declare module 'htmltojsx-too' {
	import type HTMLtoJSX from 'htmltojsx-too/dist/converters/HTMLtoJSX';

	const moduleHTMLtoJSX: {
		default: typeof HTMLtoJSX;
	};

	export default moduleHTMLtoJSX;
}
