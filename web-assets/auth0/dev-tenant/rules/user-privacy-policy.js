function (user, context, callback) {
    if (context.clientID === configuration.CLIENT_ACCOUNTS_LOGIN) { // client/application specific
        console.log("rule:user-privacy-policy:enter");
        // configuration.M2M_CLIENT_I vgXLK3lICyra8wQonokc7NCJr4UrHmk4 
        const _ = require('lodash');

        const loginCount = _.get(context, "stats.loginsCount");
        const isAuth0 = (_.get(user, "identities[0].provider") === 'auth0') ? true : false;

        /**
         *  Note : Sachin Maheshwari
         *  This rule should be execute after Custom-Claims Rule, 
         *  to get the userId for social and enterprise login in 'IdToken'
         */
        var userId = _.get(context, `idToken['https://${configuration.DOMAIN}/userId']`, null);

        if (isAuth0) {
            // no need to check futher as this rule is other than Auth0 i.e. social or enterprise 
            //return callback(null, user, context);
            userId = _.get(user, "identities[0].user_id", null);
        }

        console.log('rule:user-privacy-policy:logincount', loginCount);
        console.log('rule:user-privacy-policy:userId', userId);

        if (!userId) {
            // no need to check futher
            console.log('rule:user-privacy-policy:error:user_id null');
            return callback(null, user, context);
        }

        if (loginCount < 10) {
            const getToken = function (tokenCB) {
                if (global.M2MToken) {
                    console.log('rule:user-privacy-policy:a M2M token is present');
                    const jwt = require('jsonwebtoken');
                    const moment = require('moment');
                    const decoded = jwt.decode(global.M2MToken);
                    const exp = moment.unix(decoded.exp);

                    if (exp > new Date()) {
                        console.log('M2MToken is still valid. reusing token');
                        tokenCB(null, global.M2MToken);
                        return;
                    }
                }
                console.log('rule:user-privacy-policy:fetching fresh m2m token');
                request.post({
                    url: `https://auth0proxy.${configuration.DOMAIN}/token`,
                    headers: 'content-type: application/json',
                    json: {
                        client_id: configuration.M2M_CLIENT_ID,
                        client_secret: configuration.M2M_CLIENT_SECRET,
                        audience: configuration.M2M_AUDIENCE,
                        auth0_url: configuration.M2M_TOKEN_URL,
                        grant_type: 'client_credentials'
                    }
                }, function (err, response, body) {
                    if (err) {
                        tokenCB(err);
                        return;
                    }

                    global.M2MToken = body.access_token;
                    console.log('rule:user-privacy-policy:setting the M2MToken globally');
                    tokenCB(null, global.M2MToken);
                });
            };

            const callTermApi = function (token) {
                console.log("rule:user-privacy-policy:calling Term API");

                var payload = { userId };

                request.post({
                    url: `https://api.${configuration.DOMAIN}/v5/terms/${configuration.TERMS_USER_PRIVACY_POLICY_UUID}/users`,
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'Content-Type': 'application/json'
                    },
                    json: payload
                },
                    function (err, response, body) {
                        // swallow error
                        if (err) {
                            //console.log(err);
                        } else {
                            console.log('rule:user-privacy-policy:called term API!');
                            console.log('rule:user-privacy-policy:response - ', body);
                        }
                        callback(null, user, context);
                    });
            };

            getToken(function (err, token) {
                if (err) {
                    console.log(err);
                } else {
                    console.log('rule:user-privacy-policy:m2m token', token);
                    callTermApi(token);
                }
            });
        } else {
            return callback(null, user, context);
        }
    } else {
        return callback(null, user, context);
    }
}