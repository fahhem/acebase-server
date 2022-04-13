"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = exports.SocketIOManager = void 0;
const socketIO = require("socket.io");
const createSocketIOServer = (_a = socketIO.default) !== null && _a !== void 0 ? _a : socketIO; // ESM and CJS compatible approach
const manager_1 = require("./manager");
const cors_1 = require("../middleware/cors");
class SocketIOManager extends manager_1.WebSocketManager {
    constructor() {
        super('Socket.IO');
    }
    disconnect(socket) {
        socket.disconnect(true);
    }
    send(socket, event, message) {
        socket.emit(event, message);
    }
}
exports.SocketIOManager = SocketIOManager;
const createServer = (env) => {
    // TODO: determine max socket payload using env.config.maxPayloadSize which is now only used for json POST data
    // const maxPayloadBytes = ((payloadStr) => {
    //     const match = payloadStr.match(/^([0-9]+)(?:mb|kb|b)$/i);
    //     if (!match) { return 10e7; } // Socket.IO 2.x default (100MB), 3.x default is 1MB (1e6)
    //     const nr = +match[0], unit = match[1].toLowerCase();
    //     switch (unit) {
    //         case 'mb': return nr * 1e6;
    //         case 'kb': return nr * 1e3;
    //         case 'b': return nr;
    //     }
    // }, env.config.maxPayloadSize);
    const maxPayloadBytes = 10e7; // Socket is closed if sent message exceeds this. Socket.io 2.x default is 10e7 (100MB)
    const server = createSocketIOServer(env.server, {
        // See https://socket.io/docs/v2/server-initialization/ and https://socket.io/docs/v3/server-initialization/
        pingInterval: 5000,
        pingTimeout: 5000,
        maxHttpBufferSize: maxPayloadBytes,
        // socket.io 2.x:
        handlePreflightRequest: (req, res) => {
            const headers = (0, cors_1.getCorsHeaders)(env.config.allowOrigin, req.headers.origin);
            res.writeHead(200, headers);
            res.end();
        }
        // socket.io 3+ uses cors package:
        // cors: getCorsOptions(env.config.allowOrigin)
    });
    // Setup event emitter for communication with consuming server
    const manager = new SocketIOManager();
    server.sockets.on('connection', socket => {
        const { protocol, host, port } = socket.request.headers;
        // Notify manager of new connection
        manager.emit('connect', { socket, socket_id: socket.id });
        // Pass any events to manager
        socket.on('disconnect', data => manager.emit('disconnect', { socket, socket_id: socket.id, data }));
        socket.on('reconnect', data => manager.emit('connect', { socket, socket_id: socket.id, data }));
        socket.on('signin', accessToken => manager.emit('signin', { socket, socket_id: socket.id, data: { accessToken } }));
        socket.on('signout', data => manager.emit('signout', { socket, socket_id: socket.id, data }));
        socket.on('oauth2-signin', data => {
            data.server = { protocol, host, port }; // Add server info - event handler needs that to contruct callback url for OAuth2 provider
            manager.emit('oauth2-signin', { socket, socket_id: socket.id, data });
        });
        socket.on('subscribe', data => manager.emit('subscribe', { socket, socket_id: socket.id, data }));
        socket.on('unsubscribe', data => manager.emit('unsubscribe', { socket, socket_id: socket.id, data }));
        socket.on('query-unsubscribe', data => manager.emit('query-unsubscribe', { socket, socket_id: socket.id, data }));
        socket.on('query_unsubscribe', data => manager.emit('query-unsubscribe', { socket, socket_id: socket.id, data })); // OLD spelling "query_unsubscribe"
        socket.on('transaction', data => {
            if (data.action === 'start') {
                manager.emit('transaction-start', { socket, socket_id: socket.id, data });
            }
            else if (data.action === 'finish') {
                manager.emit('transaction-finish', { socket, socket_id: socket.id, data });
            }
        });
    });
    return manager;
};
exports.createServer = createServer;
//# sourceMappingURL=socket.io.js.map