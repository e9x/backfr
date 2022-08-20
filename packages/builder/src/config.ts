import type { RuntimeOptions } from 'backfr';
import { runtimeOptionsSchema } from 'backfr';

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
