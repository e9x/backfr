import { runtimeOptionsSchema } from './runtimeOptions.js';
import type { RuntimeOptions } from './runtimeOptions.js';

export interface RouteMeta {
	route: string;
	src: string;
}

export interface BundleInfo {
	version: string;
	pages: RouteMeta[];
	middleware?: string;
	runtimeOptions: RuntimeOptions;
	configChecksums: {
		back: string;
		tsconfig?: string;
	};
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
		middleware: {
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
		configChecksums: {
			type: 'object',
			properties: {
				back: {
					type: 'string',
				},
				tsconfig: {
					type: 'string',
				},
			},
			required: ['back'],
		},
		checksums: {
			type: 'object',
			patternProperties: {
				'^.*$': bundleChecksumSchema,
			},
		},
	},
	required: ['version', 'runtimeOptions', 'pages', 'checksums'],
};

export * from './runtimeOptions.js';
