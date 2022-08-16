export interface RuntimeOptions {
	poweredByHeader: boolean;
}

export const runtimeOptionsSchema = {
	type: 'object',
	properties: {
		poweredByHeader: {
			type: 'boolean',
		},
	},
};
