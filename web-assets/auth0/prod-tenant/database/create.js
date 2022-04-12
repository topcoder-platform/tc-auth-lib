/*function create(user, callback) {
  // This script should create a user entry in your existing database. It will
  // be executed when a user attempts to sign up, or when a user is created
  // through the Auth0 dashboard or API.
  // When this script has finished executing, the Login script will be
  // executed immediately afterwards, to verify that the user was created
  // successfully.
  //
  // The user object will always contain the following properties:
  // * email: the user's email
  // * password: the password entered by the user, in plain text
  // * tenant: the name of this Auth0 account
  // * client_id: the client ID of the application where the user signed up, or
  //              API key if created through the API or Auth0 dashboard
  // * connection: the name of this database connection
  //
  // There are three ways this script can finish:
  // 1. A user was successfully created
  //     callback(null);
  // 2. This user already exists in your database
  //     callback(new ValidationError("user_exists", "my error message"));
  // 3. Something went wrong while trying to reach your database
  //     callback(new Error("my error message"));
  const msg = 'Please implement the Create script for this database connection ' +
    'at https://manage.auth0.com/#/connections/database';
  return callback(new Error(msg)); */
  function create(user, callback) {

    var countryObj = JSON.parse(user.user_metadata.country);
    var regSource = user.user_metadata.reg_source;
    var utmSource = user.user_metadata.utm_source;
    var utmMedium = user.user_metadata.utm_medium;
    var utmCampaign = user.user_metadata.utm_campaign;
    var retUrl = user.user_metadata.returnUrl;
    var afterActivationURL = retUrl != null ? retUrl : "https://" + configuration.DOMAIN + "/home";
    if (regSource === configuration.REG_BUSINESS) {
      afterActivationURL = "https://connect."+configuration.DOMAIN;
    }
    var data = {
        "param": {
            "handle": user.username,
            "email": user.email,
            "credential": {
                "password": user.password
            },
            "firstName": user.user_metadata.firstName,
            "lastName": user.user_metadata.lastName,
            "country": {
                "code": countryObj.code,
                "isoAlpha3Code": countryObj.alpha3,
                "isoAlpha2Code": countryObj.alpha2
            },
            "regSource": regSource,
            "utmSource": utmSource,
            "utmMedium": utmMedium,
            "utmCampaign": utmCampaign,
        },
        "options": {
            "afterActivationURL": encodeURIComponent(afterActivationURL)
        }
    };
    request.post({
        url: "https://api."+configuration.DOMAIN+"/v3/users",
        json: data
        //for more options check:
        //https://github.com/mikeal/request#requestoptions-callback
    }, function (err, response, body) {

        console.log(err);
        console.log(response.statusCode);
        console.log(body);

        if (err) return callback(err);

        if (response.statusCode !== 200) {
            //return callback(new ValidationError('user_exists', body.result.content));
            const error_message = body.result.content;
            let code = "lock.fallback";
           
             if (error_message.search("Handle may not contain a space") !== -1) {
               code = "handle_invalid_space";
             } else if (error_message.search("Length of Handle in character should be between 2 and 15") !== -1){
             	 code = "handle_invalid_length";
             } else if (error_message.search("Please choose another handle, not starting with admin") !== -1) {
               code = "handle_invalid_startwith_admin";
             } else if (error_message.search('Handle may contain only letters, numbers and') !== -1) {
               code = "handle_invalid_constains_forbidden_char";
             } else if (error_message.search("Handle may not contain only punctuation") !== -1) {
               code = "handle_invalid_conatins_only_punctuation";
             } else if (error_message.search("has already been taken") !== -1) {
               code = "user_exists";
             }
          
             return callback(new ValidationError(code,error_message));
        }
        //if (response.statusCode === 401) return callback();
        
        
        callback(null);
    }); //end post request 
    //callback(null);
}
