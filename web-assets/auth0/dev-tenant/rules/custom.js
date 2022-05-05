
function (user, context, callback) {
  if (context.clientID === configuration.CLIENT_ACCOUNTS_LOGIN) { // 
      const _ = require('lodash');
      
    // TODO: implement your rule
      //  if (context.protocol === "redirect-callback") {
                          // User was redirected to the /continue endpoint
      if (context.redirect) { 
        return callback(null, user, context);
        // returnning from here no need to check further  
      }
     // otherwise to nothing 
     
      console.log("Enter Rule: Custom-Claims");
      let handle = _.get(user, "handle", null);
      const provider = _.get(user, "identities[0].provider", null);
      if (!handle && provider === "auth0") {
        handle = _.get(user, "nickname", null);
      }
      console.log("Fetch roles for email/handle: ", user.email, handle, provider);
      global.AUTH0_CLAIM_NAMESPACE = "https://" + configuration.DOMAIN + "/";
      try {
          request.post({
              url: 'https://api.' + configuration.DOMAIN + '/v3/users/roles',
              form: {
                  email: user.email,
                  handle: handle
              }
          }, function (err, response, body) {
              console.log("called topcoder api for role: response status - ", response.statusCode);
              if (err) return callback(err, user, context);
              if (response.statusCode !== 200) {
                return callback('Login Error: Whoops! Something went wrong. Looks like your registered email has discrepancy with Authentication. Please connect to our support <a href="mailto:support@topcoder.com">support@topcoder.com</a>. Back to application ', user, context);
              }
          
              let res = JSON.parse(body);
              // TODO need to double sure about multiple result or no result 
              let userId = res.result.content.id;
              let handle = res.result.content.handle;
              let roles = res.result.content.roles.map(function (role) {
                  return role.roleName;
              });
              let userStatus = res.result.content.active; // true/false 

              // TEMP
              let tcsso = res.result.content.regSource || '';

              // block wipro/topgear contractor user
              const topgearBlockMessage = 'Topgear can be accessed only by Wipro Employees. If you are a Wipro employee and not able to access, drop an email to <a href="mailto:ask.topgear@wipro.com"> ask.topgear@wipro.com </a> with the error message.Back to application ';
              if (roles.indexOf(configuration.TOPGEAR_CONTRACTOR_ROLE) > -1) {
                return callback(topgearBlockMessage, user, context);
              }

              context.idToken[global.AUTH0_CLAIM_NAMESPACE + 'roles'] = roles;
              context.idToken[global.AUTH0_CLAIM_NAMESPACE + 'userId'] = userId;
              context.idToken[global.AUTH0_CLAIM_NAMESPACE + 'handle'] = handle;
              context.idToken[global.AUTH0_CLAIM_NAMESPACE + 'user_id'] = user.identities[0].provider + "|" + userId;
              context.idToken[global.AUTH0_CLAIM_NAMESPACE + 'tcsso'] = tcsso;
              context.idToken[global.AUTH0_CLAIM_NAMESPACE + 'active'] = userStatus;
              context.idToken.nickname = handle;
              //console.log(user, context);
              if (!userStatus) {
                 context.redirect = {
                    url: `https://accounts-auth0.${configuration.DOMAIN}/check_email.html`
                  };
                return callback(null, user, context);
              }
              if (!userStatus && context.login_counts > 1) {
                return callback('Login Alert: Please verify your email first! Please connect to our support <a href="mailto:support@topcoder.com">support@topcoder.com</a>. Back to application ', user, context);
              }
              return callback(null, user, context);
          }
          );
      } catch (e) {
          console.log("Error in calling user roles" + e);
          return callback("Something went worng!. Please retry.", user, context);
      }
  } else {
      // for other apps do nothing 
      return callback(null, user, context);
  }
}