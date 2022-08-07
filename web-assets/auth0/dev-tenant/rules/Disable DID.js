function (user, context, callback) {
    global.ENABLE_2FA = false;
    return callback(null, user, context);
}