function (user, context, callback) {
    // TODO: implement your rule
    //user.sachin.userId = 1234;
    if (!global.init) {
        global.AUTH0_CLAIM_NAMESPACE = "https://topcoder-dev-test.com/claims/";
        //global.AUTH0_CLAIM_NAMESPACE = "identityData";

        // Protocols that get custom claims
        global.CUSTOM_CLAIMS_PROTOCOLS = ['oauth2-refresh-token', 'oauth2-device-code', 'oidc-basic-profile', 'oauth2'];

        // 2FA switch
        global.ENABLE_2FA = true;

        global.init = true;
    }
    callback(null, user, context);
}