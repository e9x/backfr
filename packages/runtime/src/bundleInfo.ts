export interface BundleInfo {
	version: string;
	pages: Record<string, string>;
	dist: string[];
	checksums: Record<string, string>;
}

export const schema = {
	type: 'object',
	properties: {
		version: {
			type: 'string',
		},
		pages: {
			type: 'object',
			patternProperties: {
				'^.*$': {
					type: 'string',
				},
			},
		},
		checksums: {
			type: 'object',
			patternProperties: {
				'^.*$': {
					type: 'string',
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
	required: ['version', 'pages', 'checksums', 'dist'],
};
