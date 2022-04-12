function (user, context, callback) {
  if (context.clientID === configuration.CLIENT_ACCOUNTS_LOGIN) {
    console.log("rule:block-user:enter");

    if (context.redirect) {
      console.log("rule:block-user:exiting due to context being a redirect");
      return callback(null, user, context);
    }

    const FORBIDDEN_COUNTRIES_CODES = [
      "IRN",
      "PRK",
      "CUB",
      "SDN",
      "SSD", // (south sudan)
      "SYR",
      "BLR",
      "RUS",
    ];

    const handle = context.idToken[global.AUTH0_CLAIM_NAMESPACE + "handle"];
    if (!handle) {
      console.log("rule:block-user: exiting due to handle being null.");
      return callback(null, user, context);
    }

    global.AUTH0_CLAIM_NAMESPACE = "https://" + configuration.DOMAIN + "/";
    const axios = require("axios@0.19.2");
    const options = {
      method: "GET",
      url: `https://api.${configuration.DOMAIN}/v5/members/${handle}`,
    };

    // Fetch v5 mmber Api.
    axios(options)
      .then((result) => {
        try {
          const data = result.data;

          const { homeCountryCode, competitionCountryCode } = data;
          console.log(
            "rule:block-user: set block user ",
            homeCountryCode,
            competitionCountryCode
          );
          const blockIP =
            FORBIDDEN_COUNTRIES_CODES.includes(homeCountryCode) ||
            FORBIDDEN_COUNTRIES_CODES.includes(competitionCountryCode)
              ? true
              : false;
          console.log(
            "rule:block-user: blocking user IP ? ..............",
            blockIP
          );
          context.idToken[global.AUTH0_CLAIM_NAMESPACE + "blockIP"] = blockIP;

          if (blockIP) {
            context.idToken[global.AUTH0_CLAIM_NAMESPACE + "tcsso"] =
              "123|block";
          }

          return callback(null, user, context);
        } catch (e) {
          console.log(
            "rule:block-user:error in member api response handling: ",
            e
          );
          return callback(null, user, context);
        }
      })
      .catch((requestError) => {
        console.log(
          "rule:block-user:failed to fetch member api, error: ",
          requestError.response.status
        );
        return callback(null, user, context);
      });
  } else {
    return callback(null, user, context);
  }
}
