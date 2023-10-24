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

document.addEventListener("DOMContentLoaded", () => {
  const diceVerificationStatus = qs["diceVerificationStatus"];
  window.parent.postMessage(
    { type: "onLoginTemplate", diceVerificationStatus },
    window.origin
  );
  if (diceVerificationStatus === "false") {
    window.close;
  } else {
    const userManager = new Oidc.UserManager({
      response_type: "code",
      response_mode: "query",
      loadUserInfo: false,
    });
    const vcAuthUrl = sessionStorage.getItem("connectionlessVCAuthUrl");
    userManager.settings.metadata = {
      issuer: `${vcAuthUrl}`,
      token_endpoint: `${vcAuthUrl}/vc/connect/token`,
    };
    userManager
      .signinRedirectCallback()
      .then((user) => {
        window.parent.postMessage(
          { type: "onLoginTemplateSuccess", user },
          window.origin
        );
        window.close();
      })
      .catch((e) => {
        window.parent.postMessage(
          { type: "onLoginTemplateError", e },
          window.origin
        );
        window.close();
      });
  }
});
