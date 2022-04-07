"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addRoute = void 0;
const acebase_core_1 = require("acebase-core");
const password_1 = require("../shared/password");
const tokens_1 = require("../shared/tokens");
const socketSignInSuccess = `<html><script>window.close()</script><body>Signed in succesfully. You can <a href="javascript:window.close()">close</a> this page</body></html>`;
const socketSignInFailed = `<html><script>window.close()</script><body>Failed to sign in. You can <a href="javascript:window.close()">close</a> this page</body></html>`;
const addRoute = (env) => {
    env.app.get(`/oauth2/${env.db.name}/signin`, async (req, res) => {
        var _a, _b;
        // This is where the user is redirected to by the provider after signin or error
        try {
            const state = tokens_1.parseSignedPublicToken(req.query.state, env.tokenSalt);
            if (req.query.error) {
                if (state.flow === 'socket') {
                    const client = env.clients.get(state.client_id);
                    client.socket.emit('oauth2-signin', { error: req.query.error, reason: req.query.error_reason, description: req.query.error_description, provider: state.provider });
                }
                else {
                    const callbackUrl = `${state.callbackUrl}?provider=${state.provider}&error=${req.query.error}&reason=${req.query.error_reason}&description=${req.query.error_description}`;
                    res.redirect(callbackUrl);
                }
                return;
            }
            // Got authorization code
            const authCode = req.query.code;
            const provider = env.authProviders[state.provider];
            // Get access & refresh tokens
            const tokens = await provider.getAccessToken({ type: 'auth', auth_code: authCode, redirect_url: `${req.protocol}://${req.headers.host}/oauth2/${env.db.name}/signin` });
            let user_details;
            // TODO: Have we got an id_token?
            // if (tokens.id_token) {
            //     // decode, extract user information
            // }
            // else {
            user_details = await provider.getUserInfo(tokens.access_token);
            // }
            if (user_details.picture && user_details.picture.length > 0) {
                // Download it, convert to base64
                const best = user_details.picture.sort((a, b) => a.width * a.height > b.width * b.height ? -1 : 1)[0];
                // TODO: Let client do this instead:
                const { fetch } = require('./oauth-providers/simple-fetch');
                await fetch(best.url)
                    .then(async (response) => {
                    const contentType = response.headers.get('Content-Type');
                    if (contentType === 'image/png') { //state.provider === 'google' && 
                        // Don't accept image/png, because it's probably a placeholder image. Google does this by creating a png with people's initials
                        user_details.picture = [];
                        return;
                    }
                    const image = await response.arrayBuffer();
                    let buff = Buffer.from(image);
                    best.url = `data:${contentType};base64,${buff.toString('base64')}`;
                    user_details.picture = [best]; // Only keep the best one
                })
                    .catch(err => {
                    env.debug.warn(`Could not fetch profile picture from "${best.url}": `, err);
                    user_details.picture = null;
                });
            }
            const getProviderSettings = () => {
                // Returns an object with all info (except picture) the provider has about the user
                const settings = {
                    [`${state.provider}_id`]: user_details.id,
                    [`${state.provider}_email`]: user_details.email,
                    [`${state.provider}_email_verified`]: user_details.email_verified,
                    [`${state.provider}_name`]: user_details.name,
                    [`${state.provider}_display_name`]: user_details.display_name,
                };
                Object.keys(user_details.other).forEach(key => {
                    settings[`${state.provider}_${key}`] = user_details.other[key];
                });
                return settings;
            };
            const providerUsername = `${state.provider}:${user_details.id}`;
            // Check if this user exists in the database
            let snaps;
            let addToExistingAccount = true;
            if (typeof state.uid === 'string') {
                // Use the signed in uid to link this account to. This allows multiple auth provider
                // accounts (with different email addresses) to be linked to the account the user
                // is signed into, and also allows multiple AceBase users to link to the same provider
                // accounts, eg if a client app allows users to link their own account to a shared 
                // family Spotify / Dropbox account.
                let snap = await env.authRef.child(state.uid).get();
                if (!snap.exists()) {
                    // This is wrong!
                    throw new Error(`Invalid uid`);
                }
                snaps = [snap];
                let user = snap.val();
                addToExistingAccount = user.email === user_details.email;
            }
            else {
                const query = env.authRef.query();
                if (user_details.email) {
                    query.filter('email', '==', user_details.email);
                }
                else {
                    // User did not allow reading e-mail address, or provider does not have one (eg whatsapp?)
                    // Switch to using a generated username such as "facebook-3292389234" instead
                    query.filter('username', '==', providerUsername);
                }
                snaps = await query.get();
            }
            if (snaps.length === 0 && user_details.email) {
                // Try again with providerUsername, use might previously have denied access to email, 
                // and now has granted access. In that case, we'll already have an account with the 
                // generated providerUsername
                snaps = await env.authRef.query().filter('username', '==', providerUsername).get();
            }
            let user;
            if (snaps.length === 1) {
                const uid = snaps[0].key;
                user = snaps[0].val();
                user.uid = uid;
                if (addToExistingAccount) {
                    // Update user details
                    user.email_verified = user.email_verified || user_details.email_verified;
                    user.email = user.email || user_details.email;
                    if (user_details.picture && user_details.picture.length > 0) {
                        user.picture = user_details.picture[0];
                    }
                    await env.authRef.child(uid).update({
                        email: user.email || null,
                        email_verified: user.email_verified,
                        last_signin: new Date(),
                        last_signin_ip: req.ip,
                        picture: user.picture
                    });
                }
                // Add provider details
                await env.authRef.child(uid).child('settings').update(getProviderSettings());
                // Log success
                env.logRef.push({ action: 'oauth2_signin', success: true, ip: req.ip, date: new Date(), uid });
                // Cache the user
                env.authCache.set(user.uid, user);
                // Request signin e-mail to be sent
                const request = {
                    type: 'user_signin',
                    user: {
                        uid: user.uid,
                        username: user.username,
                        email: user.email,
                        displayName: user.display_name,
                        settings: user.settings
                    },
                    date: user.created,
                    ip: req.ip,
                    activationCode: user.email_verified ? null : tokens_1.createSignedPublicToken({ uid: user.uid }, env.tokenSalt),
                    emailVerified: user.email_verified,
                    provider: state.provider
                };
                (_a = env.config.email) === null || _a === void 0 ? void 0 : _a.send(request).catch(err => {
                    env.logRef.push({ action: 'oauth2_login_email', success: false, code: 'unexpected', ip: req.ip, date: new Date(), error: err.message, request });
                });
            }
            else if (snaps.length === 0) {
                // User does not exist, create
                if (!env.config.auth.allowUserSignup) {
                    env.logRef.push({ action: 'oauth2_signup', success: false, code: 'user_signup_disabled', provider: state.provider, email: user_details.email, date: new Date() });
                    res.statusCode = 403; // Forbidden
                    return res.send({ code: 'admin_only', message: 'Only admin is allowed to create users' });
                }
                // Create user with Generated password
                let pwd = password_1.createPasswordHash(password_1.generatePassword());
                user = {
                    uid: null,
                    username: typeof user_details.email === 'undefined' ? providerUsername : null,
                    email: user_details.email || null,
                    email_verified: user_details.email_verified,
                    display_name: user_details.display_name,
                    password: pwd.hash,
                    password_salt: pwd.salt,
                    created: new Date(),
                    created_ip: req.ip,
                    access_token: acebase_core_1.ID.generate(),
                    access_token_created: new Date(),
                    last_signin: new Date(),
                    last_signin_ip: req.ip,
                    picture: user_details.picture && user_details.picture[0],
                    settings: getProviderSettings()
                };
                const userRef = await env.authRef.push(user);
                const uid = userRef.key;
                user.uid = uid;
                // Log success
                env.logRef.push({ action: 'oauth2_signup', success: true, ip: req.ip, date: new Date(), uid });
                // Cache the user
                env.authCache.set(user.uid, user);
                // Request welcome e-mail to be sent
                const request = {
                    type: 'user_signup',
                    user: {
                        uid: user.uid,
                        username: user.username,
                        email: user.email,
                        displayName: user.display_name,
                        settings: user.settings
                    },
                    date: user.created,
                    ip: user.created_ip,
                    activationCode: user.email_verified ? null : tokens_1.createSignedPublicToken({ uid: user.uid }, env.tokenSalt),
                    emailVerified: user.email_verified,
                    provider: state.provider
                };
                (_b = env.config.email) === null || _b === void 0 ? void 0 : _b.send(request).catch(err => {
                    env.logRef.push({ action: 'oauth2_signup_email', success: false, code: 'unexpected', ip: req.ip, date: new Date(), error: err.message, request });
                });
            }
            else {
                // More than 1?!!
                if (state.flow === 'socket') {
                    const client = env.clients.get(state.client_id);
                    client.socket.emit('oauth2-signin', { action: 'error', error: 'account_duplicates' });
                    return res.send(socketSignInFailed);
                }
                else {
                    const callbackUrl = `${state.callbackUrl}?provider=${state.provider}&error=account_duplicates`;
                    return res.redirect(callbackUrl);
                }
            }
            let result = {
                provider: {
                    name: state.provider,
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    expires_in: tokens.expires_in
                },
                access_token: tokens_1.createPublicAccessToken(user.uid, req.ip, user.access_token, env.tokenSalt),
            };
            if (state.flow === 'socket') {
                const client = env.clients.get(state.client_id);
                client.socket.emit('oauth2-signin', { action: 'success', result });
                res.send(socketSignInSuccess);
            }
            else {
                const base64Result = Buffer.from(JSON.stringify(result)).toString('base64');
                const callbackUrl = `${state.callbackUrl}?result=${base64Result}`;
                res.redirect(callbackUrl);
            }
        }
        catch (err) {
            res.status(500).send(err.message);
        }
    });
};
exports.addRoute = addRoute;
//# sourceMappingURL=oauth2-signin.js.map