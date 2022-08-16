import compileBack, { version } from './compiler.js';
import { attachRuntime, DetachRuntime, getPaths } from '@backfr/runtime';
import chokidar from 'chokidar';
import { Command } from 'commander';
import { expand } from 'dotenv-expand';
import { config } from 'dotenv-flow';
import { createServer } from 'http';
import { join } from 'path';

const program = new Command();

expand(config());

program.name('backfr-builder').version(version).description('backfr builder');

program.action(async () => {
	const cwd = process.cwd();
	await compileBack(cwd, false);
});

program
	.command('dev')
	.option('-p, --port', 'Port')
	.action(async ({ port }: { port?: number }) => {
		const envPort = parseInt(process.env.PORT);
		port ??= isNaN(envPort) ? 3000 : envPort;

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

		const update = async () => {
			if (detachRuntime) detachRuntime();

			try {
				await compileBack(cwd, true);
				detachRuntime = attachRuntime(cwd, server);
				console.log('Runtime attached');
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

		watcher.on('change', async () => {
			await lastCompilation;
			lastCompilation = update();
		});
	});

program.parse(process.argv);
