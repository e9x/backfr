export interface Config {
	sourceMap: boolean;
}

export const configSchema = {
	type: 'object',
	properties: {
		sourceMap: {
			type: 'boolean',
		},
	},
};
