import createHandler from 'backfr/tools';
import { createServer } from 'http';

const cwd = process.cwd();
const port = parseInt(process.argv[2]);
const server = createServer();

const handler = await createHandler(cwd);

server.on('request', (req, res) => {
	handler(req, res);
});

server.listen(port, () => {
	console.log('Runtime listening on port', port);
});
