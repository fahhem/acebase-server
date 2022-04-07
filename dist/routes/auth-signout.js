"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addRoute = void 0;
const error_1 = require("../shared/error");
const addRoute = (env) => {
    env.app.post(`/auth/${env.db.name}/signout`, async (req, res) => {
        var _a;
        try {
            if (req.user) {
                const client = typeof req.body.client_id === 'string' ? env.clients.get(req.body.client_id) : null; // NEW in AceBaseClient v0.9.4
                if (client) {
                    // Remove user binding from client socket
                    client.user = null;
                }
                const signOutEverywhere = typeof req.body === 'object' && req.body.everywhere === true; // NEW in AceBaseClient v0.9.14
                if (signOutEverywhere) {
                    // Remove token from cache
                    env.authCache.remove(req.user.uid);
                    // Remove user binding from all clients signed in with current user
                    for (let client of env.clients.values()) {
                        if (((_a = client.user) === null || _a === void 0 ? void 0 : _a.uid) === req.user.uid) {
                            client.user = null;
                        }
                    }
                }
                // Remove token from user's auth node
                await env.authRef.child(req.user.uid).transaction(snap => {
                    if (!snap.exists()) {
                        return;
                    }
                    const user = snap.val();
                    if (signOutEverywhere) {
                        user.access_token = null;
                    }
                    user.last_signout = new Date();
                    user.last_signout_ip = req.ip;
                    return user;
                });
                env.logRef.push({ action: 'signout', success: true, uid: req.user.uid, ip: req.ip, date: new Date() });
            }
            res.send('Bye!');
        }
        catch (err) {
            env.logRef.push({ action: 'signout', success: false, code: 'unexpected', message: err.message, uid: req.user.uid, ip: req.ip, date: new Date() });
            error_1.sendUnexpectedError(res, err);
        }
    });
};
exports.addRoute = addRoute;
exports.default = exports.addRoute;
//# sourceMappingURL=auth-signout.js.map