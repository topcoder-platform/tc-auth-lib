
function (user, context, callback) {
    if (context.clientID === configuration.CLIENT_ACCOUNTS_LOGIN) { // client/application specific

        const _ = require('lodash');
        console.log("Enter Rule: Enterprise-User-Registration");

        const baseApiUrl = "https://api." + configuration.DOMAIN + "/v3";
        //console.log("register user rule executed- user", user);
        //console.log("register user rule executed - context", context);

        const isEnterprise = (_.get(user, "identities[0].provider") !== 'auth0') &&
            !(_.get(user, "identities[0].isSocial")) ? true : false;

        console.log("Is enterprise login: ", isEnterprise);
        if (isEnterprise) {
            let provider = _.get(user, "identities[0].connection");
            const providerType = _.get(user, "identities[0].provider");
            let userId = _.get(user, "identities[0].user_id");
            userId = userId.substring(userId.lastIndexOf('|') + 1);

            let handle = _.get(user, "nickname", "");
            const lastName = _.get(user, "family_name");
            const firstName = _.get(user, "given_name");
            const email = _.get(user, "email");
            //const emailVerified = _.get(user, "email_verified", true);
            const name = _.get(user, "name");

            let isoAlpha2Code = _.get(context, "request.geoip.country_code");
            let isoAlpha3Code = _.get(context, "request.geoip.country_code3");
            let countryCode = _.get(context, "request.geoip.country_name");
            let regSource = _.get(context, "request.query.regSource", null);
            let retUrl = _.get(context, "request.query.returnUrl", null);
            let utmSource = _.get(context, "request.query.utmSource", null);
            let utmMedium = _.get(context, "request.query.utmMedium", null);
            let utmCampaign = _.get(context, "request.query.utmCampaign", null);

            const resourcePath = '/identityproviders?filter=handle=' + email;
            const afterActivationURL = configuration.DEFAULT_AFTER_ACTIVATION_URL;
            const hostName = _.get(context, "request.hostname", null);
            const registrationCompletetUrl = "https://" + hostName + "/continue";
            //const userHandleRedirectUrl = configuration.CUSTOM_PAGES_BASE_URL + '/signup.html?source='+ utmSource + '&formAction=' + registrationCompletetUrl;
            const userHandleRedirectUrl = configuration.CUSTOM_PAGES_BASE_URL +
                "/signup.html?regSource=" + regSource +
                "&firstName=" + encodeURIComponent(firstName) +
                "&lastName=" + encodeURIComponent(lastName) +
                "&utmSource=" + encodeURIComponent(utmSource) +
                "&utmMedium=" + encodeURIComponent(utmMedium) +
                "&utmCampaign=" + encodeURIComponent(utmCampaign) +
                "&formAction=" + registrationCompletetUrl +
                "&returnUrl=" + retUrl;

            console.log("provider", provider, email);
            try {
                request.get({
                    url: baseApiUrl + resourcePath
                }, function (err, response, body) {
                    console.log("Enterprise user check - responseBody", body);

                    if (err) {
                        console.log("Enterprise validation error:", err);
                    }

                    /**
                     * check if enterprise profile is valid for our TC database 
                     */

                    /* 
                        Aug 2021 adding new wipro-sso connection with name wipro_azuread
                    */ 
                     
                    if (_.includes([configuration.WIPRO_SSO_AZURE_AD_CONNECTION_NAME], provider)
                    ) {
                        provider = configuration.WIPRO_SSO_ADFS_CONNECTION_NAME;
                    }

                    let isSSOUserExist = (_.get(JSON.parse(body), "result.content.name") === provider) ?
                        true : false;

                    console.log("Enterprise customer alreday available:", isSSOUserExist);
                    if (!isSSOUserExist) {
                        console.log("register enterprise user.");
                        if (context.protocol === "redirect-callback") {
                            // User was redirected to the /continue endpoint
                            console.log("print data", typeof context);
                            console.log("get user extra data from query param");
                            handle = _.get(context, "request.query.handle", handle);
                            console.log("...Handle....", handle);

                            const countryStr = _.get(context, "request.query.country", null);
                            const countryObj = JSON.parse(countryStr);
                            if (countryObj) {
                                countryCode = _.get(countryObj, "code", countryCode);
                                isoAlpha2Code = _.get(countryObj, "alpha2", isoAlpha2Code);
                                isoAlpha3Code = _.get(countryObj, "alpha3", isoAlpha3Code);
                            }
                            utmSource = _.get(context, "request.query.source", utmSource);
                            utmMedium = _.get(context, "request.query.utmMedium", utmMedium);
                            utmCampaign = _.get(context, "request.query.utmCampaign", utmCampaign);
                        } else {
                            console.log('Redirect to choose user handle page.');
                            context.redirect = {
                                url: userHandleRedirectUrl
                            };
                            return callback(null, user, context);
                        }
                        // Enterprise profile will be active default
                        let data = {
                            "param": {
                                "handle": handle,
                                "firstName": firstName,
                                "lastName": lastName,
                                "email": email,
                                "country": {
                                    "code": countryCode,
                                    "isoAlpha3Code": isoAlpha3Code,
                                    "isoAlpha2Code": isoAlpha2Code
                                },
                                "utmSource": utmSource,
                                "utmMedium": utmMedium,
                                "utmCampaign": utmCampaign,
                                "active": true,
                                "profile": {
                                    "name": name,
                                    "email": email,
                                    "providerType": providerType,
                                    "provider": provider,
                                    "userId": userId
                                }
                            },
                            "options": {
                                "afterActivationURL": encodeURIComponent( configuration.DEFAULT_AFTER_ACTIVATION_URL)
                            }
                        };
                        console.log("Going to add enterprise", JSON.stringify(data));
                        request.post({
                            url: "https://api." + configuration.DOMAIN + "/v3/users",
                            json: data
                        }, function (error, response, body) {
                            if (response.statusCode !== 200) {
                                console.log("Enterprise registration error", error);
                            }
                            // on success 
                            return callback(null, user, context);
                            //if (response.statusCode === 401) return callback();
                        });
                    } else { // valid social user if block end
                        return callback(null, user, context);
                    }
                }
                ); // end validatesocial request
            } catch (e) {
                console.log(`Error in calling validate enterprise user ${e}`);
                return callback(null, user, context);
            }
        } else {// end isSocial if-block
            console.log("existing from Enterprise-User-Registration rule.");
            return callback(null, user, context);
        }
    } else { // END client-id check 
        return callback(null, user, context);
    }
}
