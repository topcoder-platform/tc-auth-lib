#!/bin/bash
set -eo pipefail
CONFFILENAME="./web-assets/js/setupAuth0WithRedirect.js"

perl -pi -e "s/\{\{DOMAIN\}\}/$DOMAIN/g" $CONFFILENAME
perl -pi -e "s/\{\{AUTH0_CLIENT_ID\}\}/$AUTH0_CLIENT_ID/g" $CONFFILENAME
perl -pi -e "s/\{\{LOGGERMODE\}\}/$LOGGERMODE/g" $CONFFILENAME
perl -pi -e "s/\{\{AUTH0DOMAIN\}\}/$AUTH0DOMAIN/g" $CONFFILENAME

mkdir dist
cp -rv ./web-assets/css/* ./dist/
cp -rv ./web-assets/js/* ./dist/
cp -rv ./web-assets/images ./dist/
cp -rv ./web-assets/static-pages/* ./dist/



