const qs = (function (a) {
  if (a == "") return {};
  let b = {};
  for (let i = 0; i < a.length; ++i) {
    let p = a[i].split("=", 2);
    if (p.length == 1) b[p[0]] = "";
    else b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
  }
  return b;
})(window.location.search.substr(1).split("&"));

const handleQR = function () {
  var obj = {
    AUTH_BASE_URL: "https://console-api-dev.diceid.com/v1/oidc",
    VCAUTH_CLIENT_ID: "1cefd7e9-3f11-4028-acf8-0a5d1a9fe7d0",
    WEBAPP_URL: "http://localhost:3000/",
    VCAUTH_CONFIG_ID: "75559037-306c-4b08-b4d4-8ee03c3e9895",
    REDIRECT_URI: "http://localhost:3000/verification-callback.html",
  };
  createSignIn(obj)
  const listener = (evt) => {
    console.log(JSON.stringify(evt.data));
    switch (evt.data.type) {
      case "qrReceived": {
        document.getElementById("myIframe").src = evt.data.data;
        break;
      }
      case "onLoginTemplate": {
        document.getElementById("signin-body").style.display = "none";
        document.getElementById("signin-message").style.display = "flex";
        console.log(evt.data.data.id_token)
        break;
      }
    }
  };
  window.addEventListener("message", listener);
};

const createSignIn = function (obj) {
  var REDIRECT_URI = window.origin + '/verification-callback.html';
  window.sessionStorage.setItem('connectionlessVCAuthUrl', obj.AUTH_BASE_URL);
  var Constants = {
    stsAuthority: "".concat(obj.AUTH_BASE_URL, "/"),
    clientId: "".concat(obj.VCAUTH_CLIENT_ID),
    clientRoot: "".concat(obj.WEBAPP_URL),
    clientScope: "openid profile vc_authn",
    apiRoot: "https://demo.identityserver.io/api/"
  };
  var settings = {
    authority: Constants.stsAuthority,
    client_id: Constants.clientId,
    redirect_uri: "".concat(REDIRECT_URI),
    silent_redirect_uri: "".concat(Constants.clientRoot, "silent-callback.html"),
    post_logout_redirect_uri: "".concat(Constants.clientRoot),
    response_type: "code",
    scope: Constants.clientScope,
    loadUserInfo: false
  };
  var userManager = new window.Oidc.UserManager(settings);
  userManager.settings.metadata = {
    issuer: "".concat(obj.AUTH_BASE_URL, "/"),
    jwks_uri: "".concat(obj.AUTH_BASE_URL, "/.well-known/openid-configuration/jwks"),
    authorization_endpoint: "".concat(obj.AUTH_BASE_URL, "/vc/connect/authorize?pres_req_conf_id=").concat(obj.VCAUTH_CONFIG_ID),
    token_endpoint: "".concat(obj.AUTH_BASE_URL, "/vc/connect/token"),
    userinfo_endpoint: "".concat(obj.AUTH_BASE_URL, "/connect/userinfo"),
    //end_session_endpoint: `${obj.AUTH_BASE_URL}/vc/connect/endsession`,
    check_session_iframe: "".concat(obj.AUTH_BASE_URL, "/vc/connect/checksession"),
    revocation_endpoint: "".concat(obj.AUTH_BASE_URL, "/vc/connect/revocation")
  };
  userManager.createSigninRequest().then(function (response) {
    console.log("Response URl: " + response.url);
    window.postMessage({
      type: 'qrReceived',
      data: response.url
    });
  }, function (error) {
    console.log(error);
  });
  return "Hello";
}

$(document).ready(function () {
  const redirectUri = qs["redirect_uri"]
  const state = qs["state"]
  $('#btn-other-way').on("click", function () {
    window.location.href = redirectUri + "?otherMethods=true&state=" + state
  })
  handleQR()
  $('#myIframe').on("load", function () {
    console.log($('#myIframe').html())
  })
})