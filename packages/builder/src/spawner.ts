import createHandler from 'backfr/tools';
import { createServer } from 'http';
import { workerData } from 'worker_threads';

const { port, cwd } = workerData as { port: number; cwd: string };

const server = createServer();

const handler = await createHandler(cwd);

server.on('request', (req, res) => {
	handler(req, res);
});

server.listen(port, () => {
	console.log('Runtime listening on port', port);
});
