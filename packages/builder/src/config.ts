import { RuntimeOptions, runtimeOptionsSchema } from '@backfr/runtime';

export interface Config {
	runtimeOptions?: Partial<RuntimeOptions>;
	sourceMap: boolean;
}

export const configSchema = {
	type: 'object',
	properties: {
		runtimeOptions: runtimeOptionsSchema,
		sourceMap: {
			type: 'boolean',
		},
	},
};
