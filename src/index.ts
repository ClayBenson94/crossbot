import * as http from 'http';
import { SetupClient } from './client';

(async () => {
	// set up the client
	await SetupClient();

	// I didn't realize, but apparently Google Cloud Run _requires_ responses to HTTP calls, so this dumb server is here to satisfy the contract
	const requestListener = function (req: http.IncomingMessage, res: http.ServerResponse) {
		res.writeHead(200);
		res.end('Hello, random person on the internet!');
	};

	const server = http.createServer(requestListener);
	server.listen(8080, '0.0.0.0', () => {
		console.log(`Server is running!`);
	});
})();
