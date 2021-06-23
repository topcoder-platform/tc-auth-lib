
function (user, context, callback) {
    if (context.clientID === configuration.CLIENT_ACCOUNTS_LOGIN) { // client/application specific
        // TODO: implement your rule
        const _ = require('lodash');

        const resend = _.get(context, "request.query.resend", null);

        if (context.protocol === 'redirect-callback' && resend) {
            console.log("----------:Entered Email Resend Rule:------------");
            let handle = _.get(user, "handle", null);
            const provider = _.get(user, "identities[0].provider", null);
            if (!handle && provider === "auth0") {
                handle = _.get(user, "nickname", null);
            }

            global.AUTH0_CLAIM_NAMESPACE = "https://" + configuration.DOMAIN + "/";
            // trigger resend email event at identity servcie 
            try {
                request.post({
                    url: 'http://api.' + configuration.DOMAIN + '/v3/users/resendEmail',
                    form: {
                        email: user.email,
                        handle: handle
                    }
                }, function (err, response, body) {
                    console.log("called topcoder api for resend email: response status - ", response.statusCode);
                    if (err) return callback(err, user, context);
                    if (response.statusCode !== 200) {
                        const error_message = _.get(body, 'result.content', 'unknown error');
                        return callback(`Resend Email Error: ${error_message}`, user, context);
                    }
                    return callback(null, user, context);
                }
                );
            } catch (e) {
                return callback("Something went worng!. Please retry.", user, context);
            }
            // returnning from here no need to check further  
        } else {  // if it is not redirect, do nothing 
            return callback(null, user, context);
        }
    } else {
        // for other apps do nothing 
        return callback(null, user, context);
    }
}