#!/usr/bin/env node --expose-internals
import attachRuntime, { version } from './runtime.js';
import { Command } from 'commander';
import { createServer } from 'http';

const program = new Command();

program
	.description('backfr Runtime')
	.version(version)
	.option('-p, --port <port>', 'Port')
	.option('-p, --host <host>')
	.action(async ({ port, host }: { port: number; host?: string }) => {
		const cwd = process.cwd();
		const server = createServer();

		attachRuntime(cwd, server);

		port ??= 3000;
		host ??= '0.0.0.0';

		console.log('Listening on', port);

		server.listen({ host, port });
	});

program.parse(process.argv);
