import compileBack, { version } from './compiler.js';
import { getPaths } from 'backfr/tools';
import { fork } from 'child_process';
import chokidar from 'chokidar';
import { Command } from 'commander';
import { expand } from 'dotenv-expand';
import { config } from 'dotenv-flow';
import { dirname, join } from 'path';
import sourceMapSupport from 'source-map-support';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const spawner = join(__dirname, 'spawner.js');

sourceMapSupport.install();

const program = new Command();

expand(config());

program.name('backfr-builder').version(version).description('backfr builder');

program.action(async () => {
	const cwd = process.cwd();
	await compileBack(cwd, false);
});

async function spawnRuntime(cwd: string, port: number) {
	const runtime = fork(spawner, [port.toString()], { stdio: 'inherit', cwd });

	await new Promise<void>((resolve, reject) => {
		const cleanup = () => {
			runtime.off('error', errorHandler);
			runtime.off('spawn', spawnHandler);
		};

		const errorHandler = (err: Error) => {
			cleanup();
			reject(err);
		};

		const spawnHandler = () => {
			cleanup();
			resolve();
		};

		runtime.once('error', errorHandler);
		runtime.once('spawn', spawnHandler);
	});

	return () => {
		runtime.kill('SIGKILL');
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
			[join(cwd, 'back.config.js'), join(cwd, 'back.config.mjs'), paths.src],
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
