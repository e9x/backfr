#!/usr/bin/env node
import compileBack from './compiler.js';
import { attachRuntime, DetachRuntime, getPaths } from '@backfr/runtime';
import chokidar from 'chokidar';
import { Command } from 'commander';
import { createServer } from 'http';
import { join } from 'path';

const program = new Command();

async function compileStages(cwd: string, dev: boolean) {
	await compileBack(cwd, dev);
}

program.command('build').action(async () => {
	const cwd = process.cwd();
	await compileStages(cwd, false);
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

			await compileStages(cwd, true);

			try {
				detachRuntime = attachRuntime(cwd, server);
			} catch (err) {
				console.error('Failure attaching runtime:');
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
