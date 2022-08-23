import compileBack, { version } from './compiler.js';
import { getPaths } from 'backfr/tools';
import chokidar from 'chokidar';
import { Command } from 'commander';
import { expand } from 'dotenv-expand';
import { config } from 'dotenv-flow';
import { dirname, join } from 'path';
import sourceMapSupport from 'source-map-support';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';

const __dirname = dirname(fileURLToPath(import.meta.url));
const spawner = join(__dirname, 'spawner.js');

sourceMapSupport.install();

const program = new Command();

expand(config());

program.name('backfr-builder').version(version).description('backfr builder');

program.action(async () => {
	const cwd = process.cwd();
	const success = await compileBack(cwd, false);
	process.exit(success ? 0 : 1);
});

async function spawnRuntime(cwd: string, port: number) {
	const runtime = new Worker(spawner, {
		workerData: {
			port,
			cwd,
		},
	});

	runtime.on('error', (err) => {
		console.log('Error:');
		console.error(err);
	});

	return () => {
		runtime.terminate();
	};
}

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
			[
				join(cwd, 'back.config.js'),
				join(cwd, 'back.config.mjs'),
				join(cwd, 'tsconfig.json'),
				paths.src,
			],
			{
				persistent: true,
			}
		);

		let detachRuntime: (() => void) | undefined;
		let lastCompilation = Promise.resolve();

		const update = async () => {
			if (detachRuntime) detachRuntime();

			try {
				await compileBack(cwd, true);
				detachRuntime = await spawnRuntime(cwd, port);
			} catch (err) {
				console.error(err);
			}
		};

		await update();

		watcher.on('all', async () => {
			await lastCompilation;
			lastCompilation = update();
		});
	});

program.parse(process.argv);
