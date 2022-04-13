import * as crypto from 'crypto';
export const createPublicAccessToken = (uid, ip, dbToken, password) => {
    let obj = {
        t: dbToken,
        c: Date.now(),
        u: uid,
        i: ip
    };
    // let str = JSON.stringify(obj);
    // str = Buffer.from(str).toString('base64');
    // return 'a' + str; // version a
    return 'b' + createSignedPublicToken(obj, password);
};
export const decodePublicAccessToken = (accessToken, password) => {
    if (accessToken[0] === 'b') {
        // New signed version
        const obj = parseSignedPublicToken(accessToken.slice(1), password);
        const details = {
            access_token: obj.t,
            uid: obj.u,
            created: obj.c,
            ip: obj.i
        };
        if (!details.access_token || !details.uid || !details.created || !details.ip) {
            throw new Error('Invalid token');
        }
        return details;
    }
    else if (accessToken[0] === 'a') {
        // Old insecure version, previously allowed until August 1, 2020.
        throw new Error('Old token version not allowed');
    }
};
const getSignature = (content, salt) => {
    // Use fast md5 with salt to sign with. Large salt recommended!!
    return crypto.createHash('md5').update(salt + content).digest('hex');
};
/**
 * Sign objects with an md5 hash. An attacker might base4 decode it and see the content and generated checksum hash,
 * but will need to guess the password used to generate the hash to manipulate it. This is  not impossible but will take
 * a very long time when using a large password
 * @param obj data object to sign
 * @param password password to use as salt for the generated md5 hash
 * @returns base64 encoded signed token
 */
export const createSignedPublicToken = (obj, password) => {
    const str = JSON.stringify(obj);
    const checksum = getSignature(str, password);
    return Buffer.from(JSON.stringify({ v: 1, cs: checksum, d: str })).toString('base64');
};
/**
 * Parses and validates a signed token that was previouslt generated by `createSignedPublicToken`
 * @param str token previously generated by `createSignedPublicToken`
 * @param password the same password used to create the token with
 * @returns the original data object
 */
export const parseSignedPublicToken = (str, password) => {
    const json = Buffer.from(str, 'base64').toString('utf8');
    const obj = JSON.parse(json);
    if (obj.v !== 1) {
        throw new Error(`Unsupported version`);
    }
    if (typeof obj.cs !== 'string' || typeof obj.d !== 'string') {
        throw new Error('Invalid token');
    }
    const checksum = obj.cs;
    if (checksum !== getSignature(obj.d, password)) {
        throw new Error(`compromised object`);
    }
    return JSON.parse(obj.d);
};
//# sourceMappingURL=tokens.js.map