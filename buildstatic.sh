#!/bin/bash
set -eo pipefail

mkdir diststatic
cp -rv ./web-assets/auth0/css ./diststatic/
cp -rv ./web-assets/auth0/js ./diststatic/
cp -rv ./web-assets/auth0/images ./diststatic/
