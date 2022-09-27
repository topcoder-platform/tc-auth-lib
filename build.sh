#!/bin/bash
set -eo pipefail
CONFFILENAME="./web-assets/js/setupAuth0WithRedirect.js"

perl -pi -e "s/\{\{DOMAIN\}\}/$DOMAIN/g" $CONFFILENAME
perl -pi -e "s/\{\{AUTH0_CLIENT_ID\}\}/$AUTH0_CLIENT_ID/g" $CONFFILENAME
perl -pi -e "s/\{\{LOGGERMODE\}\}/$LOGGERMODE/g" $CONFFILENAME
perl -pi -e "s/\{\{AUTH0DOMAIN\}\}/$AUTH0DOMAIN/g" $CONFFILENAME
perl -pi -e "s/\{\{DISCORD_URL_PATTERN\}\}/$DISCORD_URL_PATTERN/g" $CONFFILENAME

SIGNUPFILENAME="./web-assets/js/signup.js"
perl -pi -e "s/\{\{DOMAIN\}\}/$DOMAIN/g" $SIGNUPFILENAME
perl -pi -e "s/\{\{AUTH0DOMAIN\}\}/$AUTH0DOMAIN/g" $SIGNUPFILENAME

CHECKEMAIL="./web-assets/js/check_email.js"
perl -pi -e "s/\{\{DOMAIN\}\}/$DOMAIN/g" $CHECKEMAIL
perl -pi -e "s/\{\{AUTH0DOMAIN\}\}/$AUTH0DOMAIN/g" $CHECKEMAIL

OTPFILENAME="./web-assets/js/otp.js"
perl -pi -e "s/\{\{DOMAIN\}\}/$DOMAIN/g" $OTPFILENAME
perl -pi -e "s/\{\{AUTH0DOMAIN\}\}/$AUTH0DOMAIN/g" $OTPFILENAME

DICECALLBACK="./web-assets/static-pages/dice-verify-callback.html"
perl -pi -e "s/\{\{DOMAIN\}\}/$DOMAIN/g" $DICECALLBACK
perl -pi -e "s/\{\{DICE_AUTH\}\}/$DICE_AUTH/g" $DICECALLBACK
perl -pi -e "s/\{\{CA_SUB_1\}\}/$CA_SUB_1/g" $DICECALLBACK

DICEVERIFIER="./web-assets/static-pages/dice-verifier.html"
perl -pi -e "s/\{\{DOMAIN\}\}/$DOMAIN/g" $DICEVERIFIER
perl -pi -e "s/\{\{DICE_AUTH\}\}/$DICE_AUTH/g" $DICEVERIFIER

mkdir dist
cp -rv ./web-assets/css/* ./dist/
cp -rv ./web-assets/js/* ./dist/
cp -rv ./web-assets/images ./dist/
cp -rv ./web-assets/static-pages/* ./dist/



