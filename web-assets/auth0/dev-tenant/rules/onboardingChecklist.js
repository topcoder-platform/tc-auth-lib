function (user, context, callback) {
    if (context.clientID === configuration.CLIENT_ACCOUNTS_LOGIN) {
        console.log("rule:onboarding-checklist:enter");

        if (context.redirect) {
            console.log("rule:onboarding-checklist:exiting due to context being a redirect");
            return callback(null, user, context);
        }

        const _ = require('lodash');

        let handle = _.get(user, "handle", null);
        const provider = _.get(user, "identities[0].provider", null);
        if (!handle && provider === "auth0") {
          handle = _.get(user, "nickname", null);
        }
      
        const getToken = function(callback) {
            if (global.M2MToken) {
                console.log('rule:onboarding-checklist:M2M token is available');
                const jwt = require('jsonwebtoken');
                const moment = require('moment');
                const decoded = jwt.decode(global.M2MToken);
                const exp = moment.unix(decoded.exp);

                if (exp > new Date()) {
                    console.log('rule:onboarding-checklist:M2M token is valid. Reusing...');
                    return callback(null, global.M2MToken);
                }
            }

            console.log('rule:onboarding-checklist:Fetching new M2M token');
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
                    return callback(err);                        
                }

                global.M2MToken = body.access_token;
                console.log('rule:onboarding-checklist:setting the M2MToken globally');
                return callback(null, global.M2MToken);
            });
        }

        getToken(function(err, token) {
            if (err) {
                console.log('rule:onboarding-checklist:failed to fetch M2M token.');
                return callback(null, user, context);
            }

            console.log("rule:onboarding-checklist: fetch onboarding_checklist for email/handle: ", user.email, handle, provider);
            global.AUTH0_CLAIM_NAMESPACE = "https://" + configuration.DOMAIN + "/";
            try {
                const axios = require('axios@0.19.2');
            
                const redirectUrl = `https://platform.${configuration.DOMAIN}/onboard`;
                const options = {
                    method: 'GET',
                    url: `https://api.${configuration.DOMAIN}/v5/members/${handle}/traits?traitIds=onboarding_checklist`,
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
                
                axios(options).then(result => {
                    const data = result.data;        
            
                    if (data.length === 0) {
                        context.redirect = {
                            url: redirectUrl
                        }
                        console.log('rule:onboarding-checklist:Setting redirectUrl', redirectUrl);
                        return callback(null, user, context);
                    }

                    const onboardingChecklistTrait = data.filter((item) => item.traitId === 'onboarding_checklist')[0].traits;
            
                    for (let checklistTrait of onboardingChecklistTrait.data) {
                        if (
                            checklistTrait.onboarding_wizard != null &&
                            (checklistTrait.onboarding_wizard.status != null ||
                                checklistTrait.onboarding_wizard.skip)
                            ) {
                                return callback(null, user, context);
                            }
                    }
        
                    const profileCompletedData = onboardingChecklistTrait.data[0].profile_completed;
        
                    if (profileCompletedData) {
                        if (profileCompletedData.status === "completed") {
                            return callback(null, user, context);
                        }
                    
                        for (const item in profileCompletedData.metadata) {
                            if (profileCompletedData.metadata[item]) {
                                return callback(null, user, context);
                            }
                        }
                    }
        
                    context.redirect = {
                        url: redirectUrl
                    }
                    console.log('rule:onboarding-checklist:Setting redirectUrl', redirectUrl);
                    return callback(null, user, context);
                }).catch(requestError => {
                    console.log("rule:onboarding-checklist:Failed fetching onboarding_checklist with error", requestError);
                    return callback(null, user, context);
                })
                
            } catch (e) {
                console.log("rule:onboarding-checklist:Error in fetching onboarding_checklist", + e);            
                return callback(null, user, context);
            }
        })
    } else {
        return callback(null, user, context);
    }
}
