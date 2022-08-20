import compileBack, { version } from './compiler.js';
import type { DetachRuntime } from 'backfr/tools';
import { getPaths, attachRuntime } from 'backfr/tools';
import chokidar from 'chokidar';
import { Command } from 'commander';
import { expand } from 'dotenv-expand';
import { config } from 'dotenv-flow';
import type { IncomingMessage, ServerResponse } from 'http';
import { createServer } from 'http';
import { join } from 'path';
import sourceMapSupport from 'source-map-support';

sourceMapSupport.install();

const program = new Command();

expand(config());

program.name('backfr-builder').version(version).description('backfr builder');

program.action(async () => {
	const cwd = process.cwd();
	await compileBack(cwd, false);
});

program
	.command('dev')
	.option('-p, --port <port>', 'Port')
	.action(async ({ port }: { port?: number }) => {
		const envPort = parseInt(process.env.PORT);
		if (!isNaN(envPort)) port ??= envPort;
		port ??= 3000;

		const cwd = process.cwd();
		const paths = getPaths(cwd);
		const watcher = chokidar.watch(
			[join(cwd, 'back.config.js'), join(cwd, 'back.config.mjs'), paths.src],
			{
				persistent: true,
			}
		);

		const server = createServer();
		let detachRuntime: DetachRuntime | undefined;
		let lastCompilation = Promise.resolve();

		const defaultRequest = (req: IncomingMessage, res: ServerResponse) => {
			// request immediately aborted?
			res.on('error', (err) => console.error(err));
			res.writeHead(500);
			res.end('Server under maintenance');
		};

		const registerDefaultHandlers = () => {
			deregisterDefaultHandlers();
			server.on('request', defaultRequest);
		};

		const deregisterDefaultHandlers = () => {
			server.removeListener('request', defaultRequest);
		};

		const update = async () => {
			if (detachRuntime) detachRuntime();
			registerDefaultHandlers();

			try {
				await compileBack(cwd, true);
				detachRuntime = await attachRuntime(cwd, server);
				console.log('Runtime attached');
				deregisterDefaultHandlers();
			} catch (err) {
				console.error(err);
			}
		};

		await update();

		server.on('listening', () => {
			console.log('Runtime listening on port', port);
		});

		server.listen({
			port,
		});

		watcher.on('all', async () => {
			await lastCompilation;
			lastCompilation = update();
		});
	});

program.parse(process.argv);
