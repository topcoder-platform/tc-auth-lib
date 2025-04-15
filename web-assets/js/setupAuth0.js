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

    const domain = 'topcoder-dev.auth0.com';
    const clientId = 'BXWXUWnilVUPdN01t2Se29Tw2ZYNGZvH';
    const useLocalStorage = false;
    const useRefreshTokens = false;
    const v3JWTCookie = 'v3jwt';
    const tcJWTCookie = 'tcjwt';
    const tcSSOCookie = 'tcsso';
    const cookieExpireIn = 12 * 60; // 12 hrs
    const refreshTokenInterval = 60000; // in milliseconds
    const refreshTokenOffset = 65; // in seconds
    const returnAppUrl = qs['retUrl'];
    const shouldLogout = qs['logout'];
    const regSource = qs['regSource'];
    const utmSource = qs['utm_source'];
    const loggerMode = "dev";
    const IframeLogoutRequestType = "LOGOUT_REQUEST";
    const trustedDomains = ['www.topcoder.com', 'www.topcoder-dev.com', 'topcoder-dev.com', 'topcoder.com'];


    var auth0 = null;
    var isAuthenticated = false;
    var idToken = null;
    var callRefreshTokenFun = null;
    var host = window.location.protocol + "//" + window.location.host
    const registerSuccessUrl = host + '/register_success.html';

    const urlValidator = function (url) {
        try {
            const decodedUrl = decodeURIComponent(url);
            const parsedUrl = new URL(decodedUrl);
            const hostname = parsedUrl.hostname.toLowerCase();
        
            const isTrustedUrl = trustedDomains.some(domain =>
              hostname === domain || hostname.endsWith('.' + domain)
            );
        
            // Prevent "javascript:" or "data:" scheme
            const isSafeScheme = ['http:', 'https:'].includes(parsedUrl.protocol);
        
            return isTrustedUrl && isSafeScheme;
        } catch (e) {
            return false;
        }
    }

    const init = function () {
        if (!urlValidator(returnAppUrl)) {
            return;
        }
        correctOldUrl();
        createAuth0Client({
            domain: domain,
            client_id: clientId,
            cacheLocation: useLocalStorage
                ? 'localstorage'
                : 'memory',
            useRefreshTokens: useRefreshTokens
        }).then(_init);
        window.addEventListener("message", receiveMessage, false);
    };

    const _init = function (authObj) {
        auth0 = authObj
        if (shouldLogout) {
            host = returnAppUrl ? returnAppUrl : host;
            logout();
            return;
        }
        if (!isLoggedIn() && returnAppUrl) {
            login();
        } else {
            console.log("User already logged in.");
            postLogin();
        }
        showAuthenticated();
    };

    const showAuthenticated = function () {
        auth0.isAuthenticated().then(function (isAuthenticated) {
            isAuthenticated = isAuthenticated;
            console.log("_init:isAuthenticated", isAuthenticated);
        });
    };

    const refreshToken = function () {
        var token = getCookie(tcJWTCookie);
        if (!token || isTokenExpired(token)) {
            let d = new Date();
            console.log(`${d.getHours()}::${d.getMinutes()}::${d.getSeconds()} refreshing token...`);
            auth0.getTokenSilently().then(function (token) {
                console.log("access token", token);
                showAuth0Info();
                storeToken();
            }).catch(function (e) {
                console.log("Error in refreshing token: ", e)
                if (e.error && ((e.error == "login_required") || (e.error == "timeout"))) {
                    clearInterval(callRefreshTokenFun);
                }
            }
            );
        }
    };

    const showAuth0Info = function () {
        auth0.getUser().then(function (user) {
            console.log("Profile", user);
        });
        auth0.getIdTokenClaims().then(function (claims) {
            idToken = claims.__raw;
            console.log("Id token", idToken);
        });
    };

    const login = function () {
        auth0
            .loginWithPopup({
                redirect_uri: host + '/callback.html',
                regSource: regSource,
                utmSource: utmSource
            })
            .then(function () {
                auth0.isAuthenticated().then(function (isAuthenticated) {
                    isAuthenticated = isAuthenticated;
                    showAuth0Info();
                    storeToken();
                    postLogin();
                });
            });
    };

    const logout = function () {
        auth0.logout({
            returnTo: host
        });
        // TODO  
        setCookie(tcJWTCookie, "", -1);
        setCookie(v3JWTCookie, "", -1);
        setCookie(tcSSOCookie, "", -1);
    };

    const isLoggedIn = function () {
        var token = getCookie(tcJWTCookie);
        //console.log("Token", isTokenExpired(token));
        return token ? !isTokenExpired(token) : false;
    };

    const postLogin = function () {
        if (returnAppUrl) {
            window.location = returnAppUrl;
        } else {
            if (callRefreshTokenFun != null) {
                clearInterval(callRefreshTokenFun);
            }
            refreshToken();
            callRefreshTokenFun = setInterval(refreshToken, refreshTokenInterval);
        }
    }

    const storeToken = function () {
        auth0.getIdTokenClaims().then(function (claims) {
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
                //console.log(tcsso.includes(tcSSOCookie));
                console.log("storing token");
                setCookie(tcJWTCookie, idToken, cookieExpireIn, true);
                setCookie(v3JWTCookie, idToken, cookieExpireIn, true);
                setCookie(tcSSOCookie, tcsso, cookieExpireIn, true);
            } else {
                console.log("User not active");
                host = registerSuccessUrl;
                logout();
            }
        });
    };

    /////// Token.js 

    function getTokenExpirationDate(token) {
        const decoded = decodeToken(token)

        if (typeof decoded.exp === 'undefined') {
            return null
        }

        const d = new Date(0) // The 0 here is the key, which sets the date to the epoch
        d.setUTCSeconds(decoded.exp)

        return d
    }

    function decodeToken(token) {
        const parts = token.split('.')

        if (parts.length !== 3) {
            throw new Error('The token is invalid')
        }

        const decoded = urlBase64Decode(parts[1])

        if (!decoded) {
            throw new Error('Cannot decode the token')
        }

        // covert base64 token in JSON object
        let t = JSON.parse(decoded)
        return t
    }

    function isTokenExpired(token, offsetSeconds = refreshTokenOffset) {
        const d = getTokenExpirationDate(token)

        if (d === null) {
            return false
        }

        // Token expired?
        return !(d.valueOf() > (new Date().valueOf() + (offsetSeconds * 1000)))
    }

    function urlBase64Decode(str) {
        let output = str.replace(/-/g, '+').replace(/_/g, '/')

        switch (output.length % 4) {
            case 0:
                break

            case 2:
                output += '=='
                break

            case 3:
                output += '='
                break

            default:
                throw 'Illegal base64url string!'
        }
        return decodeURIComponent(escape(atob(output))) //polyfill https://github.com/davidchambers/Base64.js
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

    }

    init();
};
