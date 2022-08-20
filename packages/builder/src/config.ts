import type { RuntimeOptions } from 'backfr/tools';
import { runtimeOptionsSchema } from 'backfr/tools';

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
