import * as debug from 'debug';
import * as http from 'http';
import Server from './server';

debug('ts-express:server');

const port = normalizePort(process.env.PORT || 3000);
Server.set('port', port);
const server = http.createServer(Server);
server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
server.on('error', onError);
function normalizePort(val: number | string): number | string | boolean {
  const port: number = typeof val === 'string' ? parseInt(val, 10) : val;
  if (isNaN(port)) {
    return val;
  } else if (port >= 0) {
    return port;
  } else {
    return false;
  }
}

function onError(error: NodeJS.ErrnoException): void {
  try {
    if (error.syscall !== 'listen') { throw error; }
    const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;
    switch (error.code) {
      case 'EACCES':
        console.log(`${bind} requires elevated privileges`);
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.log(`${bind} is already in use`);
        process.exit(1);
        break;
      default:
        throw error;
    }
  } catch (err) { console.log(err); }
}