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

$(document).ready(function () {
  const redirectUri = qs["redirect_uri"];
  const state = qs["state"];
  const conf = qs["conf"];

  const diceConf = JSON.parse(atob(conf));

  const callbackParams = {
    state,
  };

  const redirect = () => {
    window.location.href = redirectUri + "?" + $.param(callbackParams);
  };

  $("#btn-other-way").on("click", () => {
    callbackParams.otherMethods = true;
    redirect();
  });

  const switchToMessage = () => {
    $("#signin-body").hide();
    $("#signin-message").css("display", "flex");
  };

  const switchToQR = () => {
    $("#signin-message").hide();
    $("#signin-body").css("display", "flex");
  };

  const listener = (evt) => {
    switch (evt.data.type) {
      case "qrReceived": {
        $("#myIframe").attr("src", evt.data.url);
        break;
      }
      case "onLoginTemplate": {
        switchToMessage();
        if (evt.data.diceVerificationStatus === "false") {
          callbackParams.diceVerificationStatus = false;
          redirect();
        }
        break;
      }
      case "onLoginTemplateSuccess": {
        switchToMessage();
        callbackParams.diceVerificationStatus = true;
        callbackParams.diceToken = evt.data.user.id_token;
        redirect();
        break;
      }
      case "onLoginTemplateError": {
        switchToQR();
        createSignIn(diceConf);
        break;
      }
    }
  };

  const createSignIn = (obj) => {
    const authBaseUrl = `${obj.vcauthUrl}/`;
    window.sessionStorage.setItem(
      "connectionlessVCAuthUrl",
      `${obj.vcauthUrl}`
    );
    const userManager = new window.Oidc.UserManager({
      authority: authBaseUrl,
      client_id: `${obj.clientId}`,
      redirect_uri: window.origin + "/dice-login-callback.html",
      response_type: "code",
      response_mode: "query",
      scope: "openid profile vc_authn",
      loadUserInfo: false,
    });
    userManager.settings.metadata = {
      issuer: authBaseUrl,
      jwks_uri: authBaseUrl + ".well-known/openid-configuration/jwks",
      authorization_endpoint:
        authBaseUrl + "vc/connect/authorize?pres_req_conf_id=" + obj.configId,
      token_endpoint: authBaseUrl + "vc/connect/token",
      userinfo_endpoint: authBaseUrl + "connect/userinfo",
      check_session_iframe: authBaseUrl + "vc/connect/checksession",
      revocation_endpoint: authBaseUrl + "vc/connect/revocation",
    };
    userManager.createSigninRequest().then(
      function (response) {
        window.postMessage({
          type: "qrReceived",
          url: response.url,
        });
      },
      function (error) {
        console.log(error);
      }
    );
  };

  window.addEventListener("message", listener);
  createSignIn(diceConf);
});
