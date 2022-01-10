function login(handleOrEmail, password, callback) {
request.post({
    url:  "https://api."+configuration.DOMAIN+"/v3/users/login",
    form: {
      handleOrEmail: handleOrEmail,
      password: password
    }
    //for more options check: https://github.com/mikeal/request#requestoptions-callback
  }, function (err, response, body) {
    console.log(body);
    //console.log("context", context);
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
      roles: user.result.content.roles,
      email_verified: user.result.content.emailActive,
    });
  });
}
