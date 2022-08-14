export interface Config {
	sourceMap: boolean;
}

export const schema = {
	type: 'object',
	properties: {
		sourceMap: {
			type: 'boolean',
		},
	},
};
