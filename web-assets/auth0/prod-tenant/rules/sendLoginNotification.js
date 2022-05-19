function (user, context, callback) {
    if (context.clientID === configuration.CLIENT_ACCOUNTS_LOGIN) {
        console.log("rule:login-notification:enter");
        console.log('rule:login-notification:context', context);
        
       if (context.redirect) {
            console.log("rule:login-notification:exiting due to context being a redirect");
            return callback(null, user, context);
        }

        const handle = context.idToken[global.AUTH0_CLAIM_NAMESPACE + 'handle'];

        if (handle == null) {
            console.log("rule:login-notification:exiting due to handle being null.");
            return callback(null, user, context);
        }

        /**
         * Send notification to Zap
         */
        const axios = require('axios@0.19.2');
        const payload = {
            timestamp: new Date(),
            event: context.request.query.prompt == 'none' ? 'logout' : 'login',
            handle,
            status: 'success'
        };

        const config = {
            method: 'POST',
            url: configuration.ZAPIER_CATCH_WEBHOOK,
            headers: { 
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(payload)

        };

        axios(config)
        .then(_ => {
            console.log('rule:login-notification:successfully Zapped!');
            return callback(null, user, context);
        })
        .catch(requestError => {
            console.log('rule:login-notification:failed to write to Zap with error', requestError.response.status);
            return callback(null, user, context);
        });

    } else {
        return callback(null, user, context);
    }
}