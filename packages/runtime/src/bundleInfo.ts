import { RuntimeOptions, runtimeOptionsSchema } from './runtimeOptions.js';

export interface RouteMeta {
	route: string;
	src: string;
}

export interface BundleInfo {
	version: string;
	pages: RouteMeta[];
	js: string[];
	runtimeOptions: RuntimeOptions;
	checksums: Record<string, BundleChecksum>;
}

export interface BundleChecksum {
	requires: Record<string, string>;
	emitted: Record<string, string>;
}

export const bundleChecksumSchema = {
	type: 'object',
	properties: {
		requires: {
			type: 'object',
			patternProperties: {
				'^.*$': {
					type: 'string',
				},
			},
		},
		emitted: {
			type: 'object',
			patternProperties: {
				'^.*$': {
					type: 'string',
				},
			},
		},
	},
	required: ['emitted', 'requires'],
};

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
				'^.*$': bundleChecksumSchema,
			},
		},
		js: {
			type: 'array',
			items: {
				type: 'string',
			},
			uniqueItems: true,
		},
	},
	required: ['version', 'runtimeOptions', 'pages', 'checksums', 'js'],
};

export * from './runtimeOptions.js';
