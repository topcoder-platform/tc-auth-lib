#!/bin/bash
set -eo pipefail

CONFFILENAME="./web-assets/auth0/css/custom.css"

perl -pi -e "s/\{\{DOMAIN\}\}/$DOMAIN/g" $CONFFILENAME


perl -pi -e "s/\{\{DOMAIN\}\}/$DOMAIN/g" ./web-assets/auth0/js/util.js

mkdir diststatic
cp -rv ./web-assets/auth0/css ./diststatic/
cp -rv ./web-assets/auth0/js ./diststatic/
cp -rv ./web-assets/auth0/images ./diststatic/

# Backward compatibility for existing templates still loading country.js.
cp -v ./diststatic/js/util.js ./diststatic/js/country.js
