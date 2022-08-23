import createHandler, { version } from './runtime.js';
import { Command } from 'commander';
import { expand } from 'dotenv-expand';
import { config } from 'dotenv-flow';
import { createServer } from 'http';
import sourceMapSupport from 'source-map-support';

sourceMapSupport.install();

const program = new Command();

process.env.NODE_ENV = 'production';

expand(config());

program
	.description('backfr runtime')
	.version(version)
	.option('-p, --port <port>', 'Port')
	.option('-p, --host <host>')
	.action(async ({ port, host }: { port?: number; host?: string }) => {
		const cwd = process.cwd();
		const server = createServer();
		const handler = await createHandler(cwd);

		const envPort = parseInt(process.env.PORT);
		if (!isNaN(envPort)) port ??= envPort;
		port ??= 3000;
		host ??= '0.0.0.0';

		server.on('request', (req, res) => {
			handler(req, res);
		});

		server.listen({ host, port }, () => {
			console.log('Runtime listening on port', port);
		});
	});

program.parse(process.argv);
