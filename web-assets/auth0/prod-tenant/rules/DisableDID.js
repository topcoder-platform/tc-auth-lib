function (user, context, callback) {
    // Set the Enable_2FA to false globally - safety switch to turn off
    global.ENABLE_2FA = false;
    return callback(null, user, context);
}