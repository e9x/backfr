export interface BundleInfo {
	version: string;
	pages: Record<string, string>;
	dist: string[];
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
		dist: {
			type: 'array',
			items: {
				type: 'string',
			},
			uniqueItems: true,
		},
	},
	required: ['version', 'pages', 'dist'],
};
