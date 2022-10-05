var script = document.createElement('script');
script.src = "https://cdn.auth0.com/js/auth0-spa-js/1.10/auth0-spa-js.production.js";
script.type = 'text/javascript';
script.defer = true;
document.getElementsByTagName('head').item(0).appendChild(script);

/** 
 * read query string  
 * 
 */
const qs = (function (a) {
    if (a == "") return {};
    let b = {};
    for (let i = 0; i < a.length; ++i) {
        let p = a[i].split('=', 2);
        if (p.length == 1)
            b[p[0]] = "";
        else
            b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
    }
    return b;
})(window.location.search.substr(1).split('&'));

const authSetup = function () {

    let domain = 'auth.{{DOMAIN}}';
    
    const onboardingWizardUrl = 'https://platform.{{DOMAIN}}/onboard';
    const clientId = '{{AUTH0_CLIENT_ID}}';
    const useLocalStorage = false;
    const useRefreshTokens = false;
    const v3JWTCookie = 'v3jwt';
    const tcJWTCookie = 'tcjwt';
    const tcSSOCookie = 'tcsso';
    const cookieExpireIn = 12 * 60; // 12 hrs
    const refreshTokenInterval = 30000; // in milliseconds
    const refreshTokenOffset = 65; // in seconds  
    const shouldLogout = qs['logout'];
    const regSource = qs['regSource'];
    const utmSource = qs['utm_source'];
    const utmMedium = qs['utm_medium'];
    const utmCampaign = qs['utm_campaign'];
    const loggerMode = "{{LOGGERMODE}}";
    const IframeLogoutRequestType = "LOGOUT_REQUEST";
    const enterpriseCustomers = ['zurich', 'cs'];
    const mode = qs['mode'] || 'signIn';
    let returnAppUrl = handleSpecificReturnUrl(qs['retUrl'], 'retUrl');
    let appUrl = qs['appUrl'] || false;
    const discord_pattern = '{{DISCORD_URL_PATTERN}}';

    if (utmSource &&
        (utmSource != 'undefined') &&
        (enterpriseCustomers.indexOf(utmSource) > -1)) {
        domain = "{{AUTH0DOMAIN}}";
        returnAppUrl += '&utm_source=' + utmSource;
    }


    var auth0 = null;
    var isAuthenticated = false;
    var idToken = null;
    var callRefreshTokenFun = null;
    var host = window.location.protocol + "//" + window.location.host
    const registerSuccessUrl = host + '/check_email.html';

    const init = function () {
        correctOldUrl();
        changeWindowMessage();
        createAuth0Client({
            domain: domain,
            client_id: clientId,
            cacheLocation: useLocalStorage
                ? 'localstorage'
                : 'memory',
            useRefreshTokens: useRefreshTokens
        }).then(_init).catch(function (e) {
            logger("Error occurred in initializing auth0 object: ", e);
            window.location.reload();
        });
        window.addEventListener("message", receiveMessage, false);
    };

    const _init = function (authObj) {
        auth0 = authObj
        if (qs['code'] && qs['state']) {
            auth0.handleRedirectCallback().then(function (data) {
                logger('handleRedirectCallback() success: ', data);
                showAuth0Info();
                storeToken();
            }).catch(function (e) {
                logger('handleRedirectCallback() error: ', e);
            });
        } else if (shouldLogout) {
            host = returnAppUrl ? decodeURIComponent(returnAppUrl) : host;
            logout();
            return;
        } else if (!isLoggedIn() && returnAppUrl) {
            login();
        } else if (qs['error'] && qs['state']) {
            var error_description = encode(qs['error_description']);
            logger("Error in executing callback(): ", error_description);
            showLoginError(error_description, appUrl);
        } else {
            logger("User already logged in", true);
            postLogin();
        }
        showAuthenticated();
    };

    const showAuthenticated = function () {
        auth0.isAuthenticated().then(function (isAuthenticated) {
            isAuthenticated = isAuthenticated;
            logger("_init:isAuthenticated", isAuthenticated);
        });
    };

    const refreshToken = function () {
        let d = new Date();
        logger('checking token status at: ', `${d.getHours()}::${d.getMinutes()}::${d.getSeconds()} `);
        var token = getCookie(v3JWTCookie);
        if (!token || isTokenExpired(token)) {
            logger('refreshing token... at: ', `${d.getHours()}::${d.getMinutes()}::${d.getSeconds()} `);
            try {
                let issuerHostname = "";
                if (token) {
                    let tokenJson = decodeToken(token);
                    let issuer = tokenJson.iss;
                    issuerHostname = extractHostname(issuer);
                }
                if (issuerHostname && domain !== issuerHostname) {
                    domain = issuerHostname;
                    logger("reintialize auth0 for new domain..", domain);
                    createAuth0Client({
                        domain: domain,
                        client_id: clientId,
                        cacheLocation: useLocalStorage
                            ? 'localstorage'
                            : 'memory',
                        useRefreshTokens: useRefreshTokens
                    }).then(function (newAuth0Obj) {
                        auth0 = newAuth0Obj;
                        auth0.getTokenSilently().then(function (token) {
                            showAuth0Info();
                            storeToken();
                            logger("refreshing token for new domain..", domain);
                        }).catch(function (e) {
                            logger("Error in refreshing token: ", e)
                            if (e.error && ((e.error == "login_required") || (e.error == "timeout"))) {
                                clearInterval(callRefreshTokenFun);
                                clearAllCookies();
                            }
                        }
                        );
                    });
                } else {
                    auth0.getTokenSilently().then(function (token) {
                        showAuth0Info();
                        storeToken();
                    }).catch(function (e) {
                        logger("Error in refreshing token: ", e)
                        if (e.error && ((e.error == "login_required") || (e.error == "timeout"))) {
                            clearInterval(callRefreshTokenFun);
                            clearAllCookies();
                        }
                    }
                    );
                }
            } catch (e) {
                logger("Error in refresh token function ", e.message)
            }

        }
    };

    const showAuth0Info = function () {
        auth0.getUser().then(function (user) {
            logger("User Profile: ", user);
        });
        auth0.getIdTokenClaims().then(function (claims) {
            idToken = claims.__raw;
            logger("JWT Token: ", idToken);
        });
    };

    const login = function () {
        logger('returnUrl', returnAppUrl);
        auth0
            .loginWithRedirect({
                redirect_uri: host + '?appUrl=' + returnAppUrl,
                reg_source: regSource,
                utm_source: utmSource,
                utm_campaign: utmCampaign,
                utm_medium: utmMedium,
                returnUrl: returnAppUrl,
                mode: mode
            })
            .then(function () {
                auth0.isAuthenticated().then(function (isAuthenticated) {
                    isAuthenticated = isAuthenticated;
                    if (isAuthenticated) {
                        showAuth0Info();
                        storeToken();
                        postLogin();
                    }
                });
            });
    };

    const logout = function () {
        clearAllCookies();
        auth0.logout({
            returnTo: host
        });
    };

    const clearAllCookies = function () {
        // TODO  
        setCookie(tcJWTCookie, "", -1);
        setCookie(v3JWTCookie, "", -1);
        setCookie(tcSSOCookie, "", -1);

        // to clear any old session
        setCookie('auth0Jwt', "", -1);
        setCookie('zendeskJwt', "", -1);
        setCookie('auth0Refresh', "", -1);
        // for scorecard
        setCookie('JSESSIONID', "", -1);
    }

    const isLoggedIn = function () {
        var token = getCookie(v3JWTCookie);
        return token ? !isTokenExpired(token) : false;
    };

    const redirectToOnboardingWizard = function () {
        logger("redirect to onboarding wizard");
        window.location = onboardingWizardUrl
    }

    const redirectToApp = function () {
      logger("redirect to app", appUrl);
      if (appUrl) {
        hookRedirect(appUrl);
      }
    };

    const postLogin = function () {
        if (isLoggedIn() && returnAppUrl) {
            auth0.isAuthenticated().then(function (isAuthenticated) {
                if (isAuthenticated) {
                    hookRedirect(returnAppUrl);
                } else {
                    login(); // old session exist case
                }
            });
        }
        logger('calling postLogin: ', true);
        logger('callRefreshTokenFun: ', callRefreshTokenFun);
        if (callRefreshTokenFun != null) {
            clearInterval(callRefreshTokenFun);
        }
        refreshToken();
        callRefreshTokenFun = setInterval(refreshToken, refreshTokenInterval);
    }

    const storeToken = function () {
        auth0.getIdTokenClaims().then(function (claims) {
            idToken = claims.__raw;

            logger('Claims', JSON.stringify(claims));
            
            let showOnboardingWizard = false;
            Object.keys(claims).forEach(key => {
                logger('Checking key', key);
                if (key.indexOf('onboarding_wizard') !== -1) {
                    if (claims[key] === 'show' || claims[key] === 'useRetUrl') {
                        showOnboardingWizard = claims[key];
                    }
                }
            });

            logger('Show Onboarding Wizard', showOnboardingWizard);

            let userActive = false;
            Object.keys(claims).findIndex(function (key) {
                if (key.includes('active')) {
                    userActive = claims[key];
                    return true;
                }
                return false;
            });            
            if (userActive) {
                let tcsso = '';
                Object.keys(claims).findIndex(function (key) {
                    if (key.includes(tcSSOCookie)) {
                        tcsso = claims[key];
                        return true;
                    }
                    return false;
                });
                logger('Storing token...', true);
                try {
                    const exT = getCookieExpiry(idToken);
                    if (exT) {
                        setDomainCookie(tcJWTCookie, idToken, exT, true);
                        setDomainCookie(v3JWTCookie, idToken, exT, true);
                        setDomainCookie(tcSSOCookie, tcsso, exT, true);
                    } else {
                        setCookie(tcJWTCookie, idToken, cookieExpireIn, true);
                        setCookie(v3JWTCookie, idToken, cookieExpireIn, true);
                        setCookie(tcSSOCookie, tcsso, cookieExpireIn, true);
                    }
                } catch (e) {
                    logger('Error occured in fecthing token expiry time', e.message);
                }

                if (showOnboardingWizard) {
                    logger('Take user to onboarding wizard', showOnboardingWizard);
                    if (showOnboardingWizard === 'useRetUrl') {
                        setCookie('returnAfterOnboard', qs['appUrl'] || qs['retUrl'])
                    }
                    redirectToOnboardingWizard(returnAppUrl);
                } 
                else {
                    // session still active, but app calling login
                    if (!appUrl && returnAppUrl) {
                        appUrl = returnAppUrl
                    }
                    redirectToApp();
                }
            } else {
                logger("User active ? ", userActive);
                host = registerSuccessUrl;
                logout();
            }
        }).catch(function (e) {
            logger("Error in fetching token from auth0: ", e);
        });
    };

    /////// Token.js 

    function getTokenExpirationDate(token) {
        const decoded = decodeToken(token);
        if (typeof decoded.exp === 'undefined') {
            return null;
        }
        const d = new Date(0); // The 0 here is the key, which sets the date to the epoch
        d.setUTCSeconds(decoded.exp);
        return d;
    }

    function decodeToken(token) {
        const parts = token.split('.');

        if (parts.length !== 3) {
            throw new Error('The token is invalid');
        }

        const decoded = urlBase64Decode(parts[1])

        if (!decoded) {
            throw new Error('Cannot decode the token');
        }

        // covert base64 token in JSON object
        let t = JSON.parse(decoded);
        return t;
    }

    function isTokenExpired(token, offsetSeconds = refreshTokenOffset) {
        const d = getTokenExpirationDate(token)

        if (d === null) {
            return false;
        }

        // Token expired?
        return !(d.valueOf() > (new Date().valueOf() + (offsetSeconds * 1000)));
    }

    function urlBase64Decode(str) {
        let output = str.replace(/-/g, '+').replace(/_/g, '/')

        switch (output.length % 4) {
            case 0:
                break;

            case 2:
                output += '=='
                break;

            case 3:
                output += '='
                break;

            default:
                throw 'Illegal base64url string!';
        }
        return decodeURIComponent(escape(atob(output))); //polyfill https://github.com/davidchambers/Base64.js
    }

    function setCookie(cname, cvalue, exMins, secure = false) {
        const cdomain = getHostDomain();

        let d = new Date();
        d.setTime(d.getTime() + (exMins * 60 * 1000));

        let expires = ";expires=" + d.toUTCString();
        let cookie = cname + "=" + cvalue + cdomain + expires + ";path=/";
        if (secure) {
            cookie += "; HttpOnly; Secure";
        }
        document.cookie = cookie;
    }

    function getCookie(name) {
        const v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
        return v ? v[2] : undefined;
    }
    // end token.js 

    // XSS rules
    const encode = function(str) {
        return str.replace(/[\x26\x0A\<>'"]/g,function(str){return"&#"+str.charCodeAt(0)+";"})
    }
    // end XSS rules

    function getHostDomain() {
        let hostDomain = "";
        if (location.hostname !== 'localhost') {
            hostDomain = ";domain=." +
                location.hostname.split('.').reverse()[1] +
                "." + location.hostname.split('.').reverse()[0];
        }
        return hostDomain;
    }

    function correctOldUrl() {
        const pattern = '#!/member';
        const sso_pattern = '/#!/sso-login';
        const logout_pattern = '/#!/logout?';

        const url = window.location.href;

        const result = url.match(/^(.+)(\#!\/(.+)\?)(.+)/);

        if (result) {
            try {
                const newUrl = result[1] + "?" + result[4];
                logger("new url: ", newUrl);
                window.location.href = newUrl;
            } catch (e) {
                logger("Creating new url error: ", e.message);
            }
        }
        // Need to cleanup below code, should never execute
        if (window.location.href.indexOf(pattern) > -1) {
            window.location.href = window.location.href.replace(pattern, '');
        }

        if (window.location.href.indexOf(sso_pattern) > -1) {
            window.location.href = window.location.href.replace(sso_pattern, '');
        }

        if (window.location.href.indexOf(logout_pattern) > -1) {
            window.location.href = window.location.href.replace(logout_pattern, '/?logout=true&');
        }
    }

    function logger(label, message) {
        if (loggerMode === "dev") {
            console.log(label, message);
        }
    }

    /**
    * will receive message from iframe
    */
    function receiveMessage(e) {
        logger("received Event:", e);
        if (e.data && e.data.type && e.origin) {
            if (e.data.type === IframeLogoutRequestType) {
                host = e.origin;
                logout();
            }
        }
        if (e.data && e.data.type && e.data.type === "REFRESH_TOKEN") {
            const token = getCookie(v3JWTCookie);
            const failed = {
                type: "FAILURE"
            };
            const success = {
                type: "SUCCESS"
            };

            const informIt = function (payload) {
                e.source.postMessage(payload, e.origin);
            }
            try {
                const storeRefreshedToken = function (aObj) {
                    aObj.getIdTokenClaims().then(function (claims) {
                        idToken = claims.__raw;
                        let userActive = false;
                        Object.keys(claims).findIndex(function (key) {
                            if (key.includes('active')) {
                                userActive = claims[key];
                                return true;
                            }
                            return false;
                        });
                        if (userActive) {
                            let tcsso = '';
                            Object.keys(claims).findIndex(function (key) {
                                if (key.includes(tcSSOCookie)) {
                                    tcsso = claims[key];
                                    return true;
                                }
                                return false;
                            });
                            logger('Storing refreshed token...', true);
                            try {
                                const exT = getCookieExpiry(idToken);
                                if (exT) {
                                    setDomainCookie(tcJWTCookie, idToken, exT, true);
                                    setDomainCookie(v3JWTCookie, idToken, exT, true);
                                    setDomainCookie(tcSSOCookie, tcsso, exT, true);
                                } else {
                                    setCookie(tcJWTCookie, idToken, cookieExpireIn, true);
                                    setCookie(v3JWTCookie, idToken, cookieExpireIn, true);
                                    setCookie(tcSSOCookie, tcsso, cookieExpireIn, true);
                                }
                                informIt(success);
                            } catch (e) {
                                logger('Error occured in fecthing token expiry time', e.message);
                                informIt(failed);
                            }
                        } else {
                            logger("Refeshed token - user active ? ", userActive);
                            informIt(failed);
                        }
                    }).catch(function (err) {
                        logger("Refeshed token - error in fetching token from auth0: ", err);
                        informIt(failed);
                    });
                };

                const getToken = function (aObj) {
                    aObj.getTokenSilently({ timeoutInSeconds: 60 }).then(function (token) {
                        storeRefreshedToken(aObj);
                    }).catch(function (err) {
                        logger("receiveMessage: Error in refreshing token through iframe:", err)
                        informIt(failed);
                    });

                };

                // main execution start here
                if (token && !isTokenExpired(token)) {
                    informIt(success);
                } else if (!token) {
                    const auth0Session = getCookie('auth0.is.authenticated');
                    logger('auth0 session available ?', auth0Session);
                    if (auth0Session) {
                        logger('auth session true', 1);
                        if (!auth0) {
                            createAuth0Client({
                                domain: domain,
                                client_id: clientId,
                                cacheLocation: useLocalStorage
                                    ? 'localstorage'
                                    : 'memory',
                                useRefreshTokens: useRefreshTokens
                            }).then(function (newAuth0Obj) {
                                getToken(newAuth0Obj);
                            }).catch(function (e) {
                                logger("Error occurred in re-initializing auth0 object: ", e);
                                informIt(failed);
                            });
                        } else {
                            getToken(auth0);
                        }
                    } else {
                        informIt(failed);
                    }

                } else {
                    if (auth0) {
                        getToken(auth0);
                    } else {
                        informIt(failed);
                    }
                }
            } catch (e) {
                logger("error occured in iframe handler:", e.message);
                informIt(failed);
            }
        } else {
            // do nothing
        }
    }

    function changeWindowMessage() {
        try {
            if ((!returnAppUrl && !appUrl) || ((returnAppUrl == 'undefined') && (appUrl == 'undefined'))) {

                var hdomain = location.hostname.split('.').reverse()[1];
                var linkurl = "http://" + window.location.host + "/?logout=true&retUrl=http://" + window.location.host;
                if (hdomain) {
                    linkurl = "https://" + window.location.host + "/?logout=true&retUrl=https://" + hdomain + ".com";
                }
                document.getElementById("page-title-heading").innerHTML = "Alert";
                document.getElementById("loading_message_p").innerHTML = "Login/Logout action is not called. Please check return url (retUrl) value in query parameters or <a href=" + linkurl + ">click here</a>";
            } else if (shouldLogout) {
                document.getElementById("loading_message_p").innerHTML = "Wait Logout processing ...";
            } else if (returnAppUrl || appUrl) {
                document.getElementById("loading_message_p").innerHTML = "Wait Login processing ...";
            }
        } catch (err) {
            logger("Error in changing loading message: ", err.message)
        }
    }

    function extractHostname(url) {
        var hostname;
        //find & remove protocol (http, ftp, etc.) and get hostname

        if (url.indexOf("//") > -1) {
            hostname = url.split('/')[2];
        }
        else {
            hostname = url.split('/')[0];
        }
        //find & remove port number
        hostname = hostname.split(':')[0];
        //find & remove "?"
        hostname = hostname.split('?')[0];

        return hostname;
    }

    function showLoginError(message, linkUrl) {
        try {
            document.getElementById("page-title-heading").innerText = "Alert";
            var messageElement = document.createElement("textarea");
            messageElement.innerHTML = message;
            document.getElementById("loading_message_p").innerHTML = messageElement.value + " <a href=" + linkUrl + ">click here</a>";
        } catch (err) {
            logger("Error in changing loading message: ", err.message)
        }
    }

    function getCookieExpiry(token) {
        const d = getTokenExpirationDate(token)
        if (d === null) {
            return false;
        }
        const diff = d.valueOf() - (new Date().valueOf()); //in millseconds
        if (diff > 0) {
            return diff; // in milliseconds
        }
        return false;
    }

    function setDomainCookie(cname, cvalue, exMilliSeconds) {
        const cdomain = getHostDomain();

        let d = new Date();
        d.setTime(d.getTime() + exMilliSeconds);

        let expires = ";expires=" + d.toUTCString();
        document.cookie = cname + "=" + cvalue + cdomain + expires + ";path=/";
    }

    function handleSpecificReturnUrl(value, param) {
        try {
            let hostdomain = "";
            if (location.hostname !== 'localhost') {
                hostdomain = "." + location.hostname.split('.').reverse()[1] +
                    "." + location.hostname.split('.').reverse()[0];
            }
            const prefixArray = ['apps', 'software'];
            if (hostdomain && value) {
                for (let i = 0; i < prefixArray.length; i++) {
                    if (value.indexOf(prefixArray[i] + hostdomain) > -1) {
                        const queryParam = window.location.search.substr(1);
                        if (queryParam) {
                            const indx = queryParam.indexOf(param);
                            if (indx > -1) {
                                //assuming queryParam value like retUrl=xxxxxx
                                const result = queryParam.substring(indx + param.length + 1);
                                // verify broken url : https://abc.com/&utm=abc
                                logger('handleSpecificReturnUrl: match query result', result);
                                if (result.indexOf('&') > -1 && result.indexOf('?') === -1) {
                                        return value;
                                }
                                return encodeURIComponent(decodeURIComponent(result));
                            } else {
                                return value;
                            }
                        } else {
                            return value;
                        }
                    }
                }
                return value;
            }
            return value;
        } catch (e) {
            logger('Issue while handling specific query param function', e.message);
            return value;
        }
    };

    function hookRedirect(redirect_url) {
        if (redirect_url && (redirect_url.indexOf(discord_pattern) > -1)) {
            try {
              var newUrl = new URL(redirect_url);
               newUrl.searchParams.append(
                "token",
                getCookie(v3JWTCookie)
              );
              window.location = newUrl.href;
            } catch (e) {
              logger("Error in redirecting to discord", e.message);
              window.location = redirect_url;
            }
          } else {
            window.location = redirect_url;
          }
    }

    // execute    
    init();
};
