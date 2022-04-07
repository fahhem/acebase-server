import { RouteInitEnvironment, RouteRequest } from './shared/env';
import { AceBaseUser, DbUserAccountDetails, getPublicAccountDetails, UserProfilePicture } from './schema/user';
import { emailExistsError, emailOrUsernameExistsError, invalidDisplayNameError, invalidEmailError, invalidPasswordError, invalidPictureError, invalidSettingsError, invalidUsernameError, isValidDisplayName, isValidEmail, isValidNewEmailAddress, isValidNewUsername, isValidPassword, isValidPicture, isValidSettings, isValidUsername, usernameExistsError } from './shared/validate';
import { createPasswordHash } from './shared/password';
import { ID } from 'acebase-core';
import { AceBaseUserSignupEmailRequest } from './shared/email';
import { createPublicAccessToken, createSignedPublicToken } from './shared/tokens';
import { sendUnexpectedError } from './shared/error';

export class SignupError extends Error { 
    constructor(public code: 'admin_only'|'conflict'|'email_conflict'|'username_conflict'|'missing_details'|'invalid_email'|'invalid_username'|'invalid_display_name'|'invalid_password'|'invalid_picture'|'invalid_settings', message: string) {
        super(message);
    }
}

export type RequestQuery = {};
export type RequestBody = {
    username: string;
    email: string;
    password: string;
    displayName?: string;
    display_name?: string;
    picture?: UserProfilePicture;
    settings: {
        [name: string]: string|number|boolean
    };
} & (
    // Allow both spellings of display name. display_name is used in the db, displayName in public user detail server responses.
    // displayName is prefered and documented in the OpenAPI docs
    { displayName: string; } | { display_name: string; }
);

export type ResponseBody = { access_token: string; user: AceBaseUser } | { code: SignupError['code']; message: string };
export type Request = RouteRequest<any, ResponseBody, RequestBody, RequestQuery>;

export const addRoute = (env: RouteInitEnvironment) => {
    env.app.post(`/auth/${env.db.name}/signup`, async (req: Request, res) => {
        if (!env.config.auth.allowUserSignup && (!req.user || req.user.username !== 'admin')) {
            env.logRef.push({ action: 'signup', success: false, code: 'user_signup_disabled', ip: req.ip, date: new Date() });
            res.statusCode = 403; // Forbidden
            return res.send({ code: 'admin_only', message: 'Only admin is allowed to create users' });
        }

        // Create user if it doesn't exist yet.
        // TODO: Rate-limit nr of signups per IP to prevent abuse
        
        const details = req.body;

        if (typeof details.display_name === 'string' && typeof details.displayName !== 'string') {
            // Allow display_name to be sent also (which is used in update endpoint)
            details.displayName = details.display_name;
        }

        // Check if sent details are ok
        let err: { code: SignupError['code'], message: string };
        if (!details.username && !details.email) {
            err = { code: 'missing_details', message: 'No username or email provided' };
        }
        else if (details.email && !isValidEmail(details.email)) {
            err = invalidEmailError;
        }
        else if (details.email && !await isValidNewEmailAddress(env.authRef, details.email)) {
            err = emailExistsError;
        }
        else if (details.username && !isValidUsername(details.username)) {
            err = invalidUsernameError;
        }
        else if (details.username && !await isValidNewUsername(env.authRef, details.username)) {
            err = usernameExistsError;
        }
        else if (!isValidDisplayName(details.displayName)) {
            err = invalidDisplayNameError;
        }
        else if (!isValidPassword(details.password)) {
            err = invalidPasswordError;
        }
        else if (!isValidSettings(details.settings)) {
            err = invalidSettingsError;
        }
        else  if (details.picture && !isValidPicture(details.picture)) {
            err = invalidPictureError;
        }
        
        if (err === emailExistsError || err === usernameExistsError) {
            env.logRef.push({ action: 'signup', success: false, code: 'conflict', ip: req.ip, date: new Date(), username: details.username, email: details.email });
            res.statusCode = 409; // conflict
            return res.send(emailOrUsernameExistsError);
        }
        else if (err) {
            // Log failure
            env.logRef.push({ action: 'signup', success: false, code: err.code, ip: req.ip, date: new Date() });
            res.statusCode = 422; // Unprocessable Entity
            return res.send(err);
        }

        try {
            // Ok, create user
            let pwd = createPasswordHash(details.password);
            const user: DbUserAccountDetails = {
                uid: null,
                username: details.username ?? null,
                email: details.email ?? null,
                email_verified: false,
                display_name: details.displayName,
                password: pwd.hash,
                password_salt: pwd.salt,
                created: new Date(),
                created_ip: req.ip,
                access_token: ID.generate(),
                access_token_created: new Date(),
                last_signin: new Date(),
                last_signin_ip: req.ip,
                picture: details.picture ?? null,
                settings: details.settings ?? {}
            };

            const userRef = await env.authRef.push(user);
            user.uid = userRef.key;

            // Log success
            env.logRef.push({ action: 'signup', success: true, ip: req.ip, date: new Date(), uid: user.uid });

            // Cache the user
            env.authCache.set(user.uid, user);

            // Request welcome e-mail to be sent
            const request: AceBaseUserSignupEmailRequest = {
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
                provider: 'acebase',
                activationCode: createSignedPublicToken({ uid: user.uid }, env.tokenSalt),
                emailVerified: false
            };

            env.config.email?.send(request).catch(err => {
                env.logRef.push({ action: 'signup_email', success: false, code: 'unexpected', ip: req.ip, date: new Date(), error: err.message, request });
            });

            // Return the positive news
            const isAdmin = req.user && req.user.uid === 'admin';
            res.send({ 
                access_token: isAdmin ? '' : createPublicAccessToken(user.uid, req.ip, user.access_token, env.tokenSalt),
                user: getPublicAccountDetails(user)
            });
        }
        catch (err) {
            env.logRef.push({ action: 'signup', success: false, code: 'unexpected', ip: req.ip, date: new Date(), error: err.message, username: details.username, email: details.email });
            sendUnexpectedError(res, err);
        }
    });
};

export default addRoute;