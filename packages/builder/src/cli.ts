#!/usr/bin/env node
import compileBack from './compiler.js';
import runtime from '@backfr/runtime';
import chokidar from 'chokidar';
import { Command } from 'commander';
import { createServer } from 'http';

const program = new Command();

async function compileStages(cwd: string) {
	await compileBack(cwd);
}

program.command('build').action(async () => {
	const cwd = process.cwd();
	await compileStages(cwd);
});

program
	.command('dev')
	.option('-p, --port', 'Port')
	.action(async ({ port }: { port?: number }) => {
		const envPort = parseInt(process.env.PORT);
		port ??= isNaN(envPort) ? 3000 : envPort;

		const cwd = process.cwd();
		const paths = runtime.getPaths(cwd);
		const watcher = chokidar.watch(cwd, {
			ignored: [paths.output],
			persistent: true,
		});

		const server = createServer();
		let detachRuntime: runtime.DetachRuntime | undefined;
		let lastCompilation = Promise.resolve();

		const update = async () => {
			if (detachRuntime) {
				detachRuntime();
				detachRuntime = undefined;
			}

			await compileStages(cwd);
			try {
				detachRuntime = runtime.attachRuntime(cwd, server);
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
