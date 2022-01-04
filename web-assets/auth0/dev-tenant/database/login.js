function login(handleOrEmail, password, callback) {
    // This script should authenticate a user against the credentials stored in
    // your database.
    // It is executed when a user attempts to log in or immediately after signing
    // up (as a verification that the user was successfully signed up).
    //
    // Everything returned by this script will be set as part of the user profile
    // and will be visible by any of the tenant admins. Avoid adding attributes
    // with values such as passwords, keys, secrets, etc.
    //
    // The `password` parameter of this function is in plain text. It must be
    // hashed/salted to match whatever is stored in your database. For example:
    //
    //     var bcrypt = require('bcrypt@0.8.5');
    //     bcrypt.compare(password, dbPasswordHash, function(err, res)) { ... }
    //
    // There are three ways this script can finish:
    // 1. The user's credentials are valid. The returned user profile should be in
    // the following format: https://auth0.com/docs/users/normalized/auth0/normalized-user-profile-schema
    //     var profile = {
    //       user_id: ..., // user_id is mandatory
    //       email: ...,
    //       [...]
    //     };
    //     callback(null, profile);
    // 2. The user's credentials are invalid
    //     callback(new WrongUsernameOrPasswordError(email, "my error message"));
    // 3. Something went wrong while trying to reach your database
    //     callback(new Error("my error message"));
    //
    // A list of Node.js modules which can be referenced is available here:
    //
    //    https://tehsis.github.io/webtaskio-canirequire/
  request.post({
      url:  "https://api."+configuration.DOMAIN+"/v3/users/login",
      form: {
        handleOrEmail: handleOrEmail,
        password: password
      }
      //for more options check: https://github.com/mikeal/request#requestoptions-callback
    }, function (err, response, body) {
      console.log("response..............", err,response.statusCode);
      if (err) return callback(err);
      if (response.statusCode === 401) return callback();
      var user = JSON.parse(body);
      user.result.content.roles = user.result.content.roles.map(function(role) {
        return role.roleName;
      });
  
      callback(null,   {
        user_id: user.result.content.id,
        nickname: user.result.content.handle,
        email: user.result.content.email,
        handle:user.result.content.handle,
        roles: user.result.content.roles,
        email_verified: user.result.content.emailActive,
        created_at: user.result.content.createdAt
      });
    });
  }
  