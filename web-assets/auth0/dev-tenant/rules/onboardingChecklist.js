function OnboardingChecklist(user, context, callback) {
    if (context.clientID === configuration.CLIENT_ACCOUNTS_LOGIN) {
        console.log("rule:onboarding-checklist:enter");

        if (context.redirect) {
            console.log("rule:onboarding-checklist:exiting due to context being a redirect");
            return callback(null, user, context);
        }

        const _ = require('lodash');
        const moment = require('moment');

        const isSocial = _.get(user, "identities[0].isSocial");
        const connection = _.get(user, "identities[0].connection");

        console.log("rule:onboarding-checklist: isSocial/connection", isSocial + "/" + connection);
        console.log("rule:onboarding-checklist: WIPRO_SS_AZURE_AD_CONNECTION_NAME", configuration.WIPRO_SSO_AZURE_AD_CONNECTION_NAME);

        if (_.includes([configuration.WIPRO_SSO_AZURE_AD_CONNECTION_NAME], connection)) {
            console.log("rule:onboarding-checklist:exiting due to user being an enterprise user.");
            return callback(null, user, context);
        }

        const handle = context.idToken[global.AUTH0_CLAIM_NAMESPACE + 'handle'];
        console.log("rule:onboarding-checklist: fetch onboarding_checklist for email/handle: ", user.email, handle);

        if (handle === null) {
            console.log("rule:onboarding-checklist: exiting due to handle being null.");
            return callback(null, user, context);
        }
      
      	const roles = context.idToken[global.AUTH0_CLAIM_NAMESPACE + 'roles'];

        if (roles && roles.includes('Topcoder Customer')) {
            console.log("rule:onboarding-checklist:exiting due to user being a customer.");
            return callback(null, user, context);
        }

        const createdAt = _.get(user, "created_at", null);
        const thresholdDate = moment(configuration.PROFILE_CREATION_DATE_THRESHOLD, "YYYY-MM-DD");

        try {
            // For users created before thresholdDate, we don't want to check onboarding_checklist
            // This is because older profiles might not have onboarding_checklist data and they don't need to see the onboarding_wizard
            if (createdAt && !thresholdDate.isBefore(moment(createdAt))) {
                console.log("rule:onboarding-checklist: user created before threshold date. Not checking onboarding_checklist.");
                return callback(null, user, context);
            }
        } catch (err) {
            console.log("rule:onboarding-checklist: failed to compare userCreationDate", createdAt, " with threshold. Error", err);
        }

        /**
         * Returns M2M token needed to fetch onboarding_checklist
         */
        const getToken = function (callback) {
            if (global.M2MToken) {
                console.log('rule:onboarding-checklist:M2M token is available');
                const jwt = require('jsonwebtoken');
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
                console.log('rule:onboarding-checklist:setting the M2MToken globally', global.M2MToken);
                return callback(null, global.M2MToken);
            });
        };

        getToken(function (err, token) {
            if (err) {
                console.log('rule:onboarding-checklist:failed to fetch M2M token.');
                return callback(null, user, context);
            }
            global.AUTH0_CLAIM_NAMESPACE = "https://" + configuration.DOMAIN + "/";
            const axios = require('axios@0.19.2');

            const options = {
                method: 'GET',
                url: `https://api.${configuration.DOMAIN}/v5/members/${handle}/traits?traitIds=onboarding_checklist`,
                headers: {
                    Authorization: `Bearer ${token}`
                }
            };

            // Fetch onboarding_checklist using v5 member Api.
            axios(options)
                .then(result => {
                    try {
                        const data = result.data;

                        if (data.length === 0) {
                            // User doesn't have any traits with traitId onboarding_checklist and should be shown the onboarding wizard
                            context.idToken[global.AUTH0_CLAIM_NAMESPACE + 'onboarding_wizard'] = 'show';
                            console.log('rule:onboarding-checklist:Setting onboarding_wizard to show');
                            return callback(null, user, context);
                        }

                        const onboardingChecklistTrait = data.filter((item) => item.traitId === 'onboarding_checklist')[0].traits;
                        let override = 'show';

                        for (let checklistTrait of onboardingChecklistTrait.data) {
                            if (checklistTrait.onboarding_wizard !== null) {
                                if (checklistTrait.onboarding_wizard.status !== 'pending_at_user' || // any non pending_at_user status indicates OB was either seen or completed and can be skipped
                                    checklistTrait.onboarding_wizard.skip ||// for certain signup routes skip is set to true, and thus onboarding wizard needn't be shown
                                    checklistTrait.onboarding_wizard.override === 'skip') {
                                    return callback(null, user, context);
                                } else if (checklistTrait.onboarding_wizard.override === 'useRetUrl') {
                                    override = 'useRetUrl';
                                }
                            }
                        }

                        const profileCompletedData = onboardingChecklistTrait.data.length > 0 ? onboardingChecklistTrait.data[0].profile_completed : null;

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

                        // All checks failed - indicating user newly registered and needs to be shown the onboarding wizard
                        console.log('rule:onboarding-checklist: set onboarding_wizard ' + override);

                        context.idToken[global.AUTH0_CLAIM_NAMESPACE + 'onboarding_wizard'] = override;



                        return callback(null, user, context);
                    } catch (e) {
                        console.log("rule:onboarding-checklist:Error in fetching onboarding_checklist", e);
                        return callback(null, user, context);
                    }
                }).catch(requestError => {
                    console.log("rule:onboarding-checklist:Failed fetching onboarding_checklist with error", requestError.response.status);
                    return callback(null, user, context);
                });
        });
    } else {
        return callback(null, user, context);
    }
}