#!/bin/bash
set -eo pipefail

CONFFILENAME="./web-assets/auth0/css/custom.css"

perl -pi -e "s/\{\{DOMAIN\}\}/$DOMAIN/g" $CONFFILENAME


mkdir diststatic
cp -rv ./web-assets/auth0/css ./diststatic/
cp -rv ./web-assets/auth0/js ./diststatic/
cp -rv ./web-assets/auth0/images ./diststatic/
