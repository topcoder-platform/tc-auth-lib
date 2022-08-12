function (user, context, callback) {
    if (!global.init) {
        global.AUTH0_CLAIM_NAMESPACE = "https://topcoder.com/";
        global.CUSTOM_CLAIMS_PROTOCOLS = ['oauth2-refresh-token', 'oauth2-device-code', 'oidc-basic-profile'];
        global.ENABLE_2FA = true;
        global.init = true;
    }
    callback(null, user, context);
}