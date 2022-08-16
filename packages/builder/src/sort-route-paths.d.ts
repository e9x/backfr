declare module 'sort-route-paths' {
	export default function sort(routes: string): string[];

	export default function sort<T>(
		routes: Readonly<T[]>,
		map: (entry: T) => string
	): T[];
}
