function (user, context, callback) {
    if (context.clientID === configuration.CLIENT_ACCOUNTS_LOGIN) {
        console.log("rule:DICE DID:enter");

        if (context.redirect) {
            console.log("rule:DICE DID:exiting due to context being a redirect");
            return callback(null, user, context);
        }
        const _ = require('lodash');
        const isAuth0 = (_.get(user, "identities[0].provider") === 'auth0') ? true : false;
        const isSocial = _.get(user, "identities[0].isSocial");
        const mfaEnabled = _.get(user, "mfa_enabled", false);
        const mfaVerified = _.get(user, "mfa_verified", false);

        if (!isAuth0 && !isSocial) {
            console.log("rule:DICE DID:exiting due to enterprise user");
            return callback(null, user, context);
        }
        if (mfaEnabled && mfaVerified) {
            if (context.protocol === "redirect-callback") {
                // User was redirected to the /continue endpoint
                console.log("rule:DICE DID:User was redirected to the /continue endpoint");
                if (context.request.query.diceVerificationStatus === 'false') {
                    return callback('Login Error: Credentials verification is failed.<br>Please contact with support <a href="mailto:support@topcoder.com">support@topcoder.com</a>.<br> Back to application ', user, context);
                } else if (context.request.query.otp) {
                    request.post({
                        url: 'https://api.' + configuration.DOMAIN + '/v3/users/checkOtp',
                        json: {
                            "param": {
                                "userId": user.userId,
                                "otp": context.request.query.otp
                            }
                        }
                    }, function (error, response, body) {
                        if (error) return callback(error, user, context);
                        if (response.statusCode !== 200) {
                            return callback('Login Error: Whoops! Something went wrong.', user, context);
                        }
                        if (body.result.content.verified === true) {
                            return callback(null, user, context);
                        } else {
                            return callback('Login Error: wrong OTP', user, context);
                        }
                    });
                } else {
                    const jwt_decode = require('jwt-decode');
                    request.post({
                        url: 'https://tc-vcauth-uat.diceid.com/vc/connect/token',
                        form: {
                            code: context.request.query.code,
                            grant_type: 'authorization_code',
                            client_id: 'topcoder'
                        }
                    }, function (error, response, body) {
                        if (error) return callback(error, user, context);
                        if (response.statusCode !== 200) {
                            return callback('Login Error: Whoops! Something went wrong.', user, context);
                        }
                        const result = JSON.parse(body);
                        const decoded = jwt_decode(result.id_token);
                        console.log("Decoded: ", decoded);
                        if (decoded.Email !== user.email) {
                            return callback('Login Error: Credetials do not match', user, context);
                        }
                        console.log("rule:DICE DID:credentials approved");
                        return callback(null, user, context);
                    });
                }
            } else {
                const maxRetry = 2;
                const useOtp = function () {
                    request.post({
                        url: 'https://api.' + configuration.DOMAIN + '/v3/users/sendOtp',
                        json: {
                            "param": {
                                "userId": user.userId
                            }
                        }
                    }, function (error, response, body) {
                        if (error) return callback(error, user, context);
                        if (response.statusCode !== 200) {
                            return callback('Login Error: Whoops! Something went wrong.', user, context);
                        }
                        console.log("rule:DICE DID: redirecting to OTP page");
                        const hostName = _.get(context, "request.hostname", null);
                        const otpCompletetUrl = "https://" + hostName + "/continue";
                        const retUrl = _.get(context, "request.query.returnUrl", null);
                        const otpRedirectUrl = configuration.CUSTOM_PAGES_BASE_URL +
                            "/otp.html?formAction=" + otpCompletetUrl +
                            "&returnUrl=" + retUrl;
                        context.redirect = {
                            url: otpRedirectUrl
                        };
                        return callback(null, user, context);
                    });
                };
                const checkDiceHealth = function (attempt) {
                    console.log("rule:DICE DID:checking dice health, attempt:" + attempt);
                    request.get({
                        url: 'https://tc-vcauth-uat.diceid.com/.well-known/openid-configuration'
                    }, function (error, response, body) {
                        if (error || response.statusCode !== 200) {
                            if (attempt >= maxRetry) {
                                console.log("rule:DICE DID:dice services down, using otp flow...");
                                useOtp();
                            } else {
                                checkDiceHealth(attempt + 1);
                            }
                        } else {
                            console.log("rule:DICE DID:exiting with redirecting user to QR code page.");
                            context.redirect = {
                                url: `https://tc-vcauth-uat.diceid.com/vc/connect/authorize?pres_req_conf_id=Topcoder_2FA&client_id=topcoder&redirect_uri=https%3A%2F%2Fauth.topcoder-dev.com%2Fcontinue&response_type=code&scope=openid%20profile%20vc_authn`
                            };
                            return callback(null, user, context);
                        }
                    });
                };
                if (!global.ENABLE_2FA) {
                    console.log("rule:DICE DID:dice switch disabled, using otp flow...");
                    useOtp();
                } else {
                    checkDiceHealth(1);
                }
            }
        } else {
            console.log("rule:DICE DID:exiting due to mfa is not enabled");
            return callback(null, user, context);
        }
    } else {
        return callback(null, user, context);
    }
}