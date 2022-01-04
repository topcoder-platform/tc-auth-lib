function (user, context, callback) {
    if (context.clientID === configuration.CLIENT_ACCOUNTS_LOGIN) {
        if (context.redirect) {
            return callback(null, user, context);
        }

        let handle = _.get(user, "handle", null);
        const provider = _.get(user, "identities[0].provider", null);
        if (!handle && provider === "auth0") {
          handle = _.get(user, "nickname", null);
        }
        console.log("Fetch onboarding_checklist for email/handle: ", user.email, handle, provider);

        global.AUTH0_CLAIM_NAMESPACE = "https://" + configuration.DOMAIN + "/";
        try {
            const axios = require('axios@0.19.2');
           
            const redirectUrl = `https://platform.${configuration.DOMAIN}/onboard`;
            const options = {
                method: 'GET',
                url: `https://api.${configuration.DOMAIN}/v5/members/${handle}/traits?traitIds=onboarding_checklist`,                
            }
            
            axios(options).then(result => {
                const data = result.data;        
        
                if (data.length === 0) {
                    context.redirect = {
                        url: redirectUrl
                    }
                    console.log('Setting redirectUrl', redirectUrl);
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
                        console.log('checking item', item);
                        if (profileCompletedData.metadata[item]) {
                            return callback(null, user, context);
                        }
                    }
                }
    
                context.redirect = {
                    url: redirectUrl
                }
                console.log('Setting redirectUrl', redirectUrl);
                return callback(null, user, context);
            })
            
        } catch (err) {
            console.log("Error in fetching onboarding_checklist", + err);            
            return callback(null, user, context);
        }
    } else {
        return callback(null, user, context);
    }
}