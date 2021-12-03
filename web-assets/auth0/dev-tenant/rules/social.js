
function (user, context, callback) {
    if (context.clientID === configuration.CLIENT_ACCOUNTS_LOGIN) { // client/application specific
        global.AUTH0_CLAIM_NAMESPACE = "https://" + configuration.DOMAIN + "/";
        const _ = require('lodash');
        console.log("Enter Rule: Social-User-Registration");
        const isSocial = _.get(user, "identities[0].isSocial");
        const connection = _.get(user, "identities[0].connection");
        console.log("is social login", isSocial);
        if (isSocial) {
            let provider = _.get(user, "identities[0].provider");
            let userId = _.get(user, "identities[0].user_id");
            // changes for github custom setup
            if (connection.includes('github')) {
                provider = 'github';
                if (typeof userId === 'string' || userId instanceof String) {
                    let resArray = userId.split('|');
                    userId = resArray[1];
                }
            }

            const accessToken = _.get(user, "identities[0].access_token");
            const email = _.get(user, "email");
            const emailVerified = _.get(user, "email_verified");
            const name = _.get(user, "name");
            const auth0UserId = _.get(user, "user_id");
            const hostName = _.get(context, "request.hostname", null);
            const registrationCompletetUrl = "https://" + hostName + "/continue";

            let handle = _.get(user, "nickname", null);
            let lastName = _.get(user, "family_name");
            let firstName = _.get(user, "given_name");
            let isoAlpha2Code = _.get(context, "request.geoip.country_code");
            let isoAlpha3Code = _.get(context, "request.geoip.country_code3");
            let countryCode = _.get(context, "request.geoip.country_name");
            let regSource = _.get(context, "request.query.regSource", null);
            let utmSource = _.get(context, "request.query.utmSource", null);
            let utmMedium = _.get(context, "request.query.utmMedium", null);
            let utmCampaign = _.get(context, "request.query.utmCampaign", null);
            let retUrl = _.get(context, "request.query.returnUrl", null);

            //console.log("resource", regSource, _.get(context, "request.query"));

            const userHandleRedirectUrl = configuration.CUSTOM_PAGES_BASE_URL +
                "/signup.html?regSource=" + regSource +
                "&firstName=" + encodeURIComponent(firstName) +
                "&lastName=" + encodeURIComponent(lastName) +
                "&utmSource=" + encodeURIComponent(utmSource) +
                "&utmMedium=" + encodeURIComponent(utmMedium) +
                "&utmCampaign=" + encodeURIComponent(utmCampaign) +
                "&formAction=" + registrationCompletetUrl +
                "&returnUrl=" + retUrl;

            const baseApiUrl = "https://api." + configuration.DOMAIN + "/v3/users";
            const resourcePath = '/validateSocial?socialUserId=' + userId + '&socialProvider=' + provider;
            let afterActivationURL = configuration.DEFAULT_AFTER_ACTIVATION_URL;

            console.log("provider", provider);
            try {
                request.get({
                    url: baseApiUrl + resourcePath
                }, function (err, response, body) {
                    //console.log("social user check - responseBody", body);

                    if (err) {
                        console.log("Social validation error:", err);
                    }

                    /**
                     * check if social profile is valid for our TC database 
                     */
                    let flag = _.get(JSON.parse(body), "result.content.valid");
                    console.log("Is valid social profile: ", flag, response.statusCode);
                    if (response.statusCode !== 200) {
                        console.log(`Error in calling validate social user: ${body}`);
                        return callback(null, user, context);
                    }
                    if (flag) {
                        console.log("register social login");
                        if (context.protocol === "redirect-callback") {
                            // User was redirected to the /continue endpoint
                            console.log("get user extra data from query param");
                            handle = _.get(context, "request.query.handle", handle);
                            const countryStr = _.get(context, "request.query.country", null);
                            const countryObj = JSON.parse(countryStr);
                            if (countryObj) {
                                countryCode = _.get(countryObj, "code", countryCode);
                                isoAlpha2Code = _.get(countryObj, "alpha2", isoAlpha2Code);
                                isoAlpha3Code = _.get(countryObj, "alpha3", isoAlpha3Code);
                            }
                            regSource = _.get(context, "request.query.source", regSource);
                            firstName = _.get(context, "request.query.firstName", firstName);
                            lastName = _.get(context, "request.query.lastName", lastName);
                            utmSource = _.get(context, "request.query.source", utmSource);
                            utmMedium = _.get(context, "request.query.utmMedium", utmMedium);
                            utmCampaign = _.get(context, "request.query.utmCampaign", utmCampaign);
                            retUrl = _.get(context, "request.query.returnUrl", retUrl);
                            console.log("------HHHHHH-----", context.request);
                            afterActivationURL = retUrl ? retUrl : afterActivationURL;
                            if (regSource === configuration.REG_BUSINESS) {
                                afterActivationURL = "https://connect." + configuration.DOMAIN;
                            }
                            // workaround: to avoid activation email failure 
                            if (!firstName) {
                                firstName = _.get(user, "nickname", firstName);
                            }
                            if (!lastName) {
                                lastName = _.get(user, "nickname", lastName);
                            }
                            // end workaround 

                            const data = {
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
                                    "regSource": regSource,
                                    "profile": {
                                        "userId": userId,
                                        "name": name,
                                        "providerType": provider,
                                        "email": email,
                                        "emailVerified": emailVerified,
                                        "context": {
                                            "handle": handle,
                                            "accessToken": accessToken,
                                            "auth0UserId": auth0UserId
                                        }
                                    }
                                },
                                "options": {
                                    "afterActivationURL": encodeURIComponent( configuration.DEFAULT_AFTER_ACTIVATION_URL)
                                }
                            };
                            request.post({
                                url: "https://api." + configuration.DOMAIN + "/v3/users",
                                json: data
                            }, function (error, response, body) {
                                if (response.statusCode !== 200) {
                                    console.log("------- Social registration error occurred -------Http  error status:", response.statusCode);
                                    console.log("Error message:", body.result.content);
                                    return callback( "Social Registration Error: " + body.result.content + " Please retry.", user, context);
                                }
                                // on success 
                                return callback(null, user, context);
                            });
                        } else {
                            console.log('Redirect to choose user handle page.', provider);
                            if (provider === "giveprovider") {
                                return callback("Github signup is temporarily disabled. You can signup directly using a username / password or another social signup.", user, context);
                            } else {
                                context.redirect = {
                                    url: userHandleRedirectUrl
                                };
                                return callback(null, user, context);
                            }
                        }
                    } else { // valid social user if block end
                        return callback(null, user, context);
                    }
                }
                ); // end validatesocial request
            } catch (e) {
                console.log(`Error in calling validate social user ${e}`);
                return callback('Error in validating social user. Please rety.', user, context);
            }
        } else {// end isSocial if-block
            console.log("existing from Social-User-Registration rule.");
            return callback(null, user, context);
        }
    } else {
        return callback(null, user, context);
    }
}
