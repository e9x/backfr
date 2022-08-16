import { RuntimeOptions, runtimeOptionsSchema } from './runtimeOptions.js';

export interface RouteMeta {
	route: string;
	src: string;
}

export interface BundleInfo {
	version: string;
	pages: RouteMeta[];
	dist: string[];
	runtimeOptions: RuntimeOptions;
	checksums: Record<string, Record<string, string>>;
}

export const bundleInfoSchema = {
	type: 'object',
	properties: {
		version: {
			type: 'string',
		},
		runtimeOptions: runtimeOptionsSchema,
		pages: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					route: {
						type: 'string',
					},
					src: {
						type: 'string',
					},
				},
				required: ['route', 'src'],
			},
		},
		checksums: {
			type: 'object',
			patternProperties: {
				'^.*$': {
					type: 'object',
					patternProperties: {
						'^.*$': {
							type: 'string',
						},
					},
				},
			},
		},
		dist: {
			type: 'array',
			items: {
				type: 'string',
			},
			uniqueItems: true,
		},
	},
	required: ['version', 'runtimeOptions', 'pages', 'checksums', 'dist'],
};

export * from './runtimeOptions.js';
