# authlib
Mixed front-end lib for auth0 authorization 


## Signup and account activation (PM-5922)

The hosted Auth0 Lock signup page loads `web-assets/auth0/js/util.js`, published
as both `util.js` and the legacy `country.js`. Its capture-phase submit guard
allows handles from 3 through 15 characters inclusive and blocks out-of-range
handles before account creation. Login and password reset are unaffected. The
separate social-signup page applies the same bounds in `web-assets/js/signup.js`.
Configure the dev hosted template to load the `topcoder-dev.com` static host so
dev deployments are available to QA; the production host follows master.

`web-assets/js/check_email.js` completes account activation through
`PUT /v6/users/activate`. It displays v6 `message` strings/validation arrays as
well as legacy `result.content` errors, using text rather than HTML. Failed
activation keeps the entered code and enables retry; editing the code while a
request is pending cannot send a duplicate activation. Resend failures likewise
show the API error and retain the retry link. A successful response submits the
existing continuation form with the original Auth0 state.

Run `npm test` with Node 22 for dependency-free regression tests covering handle
boundaries, login/reset isolation, activation errors, retries and continuation.
The repository has no npm lint or build scripts. Validate JavaScript with
`node --check`; the CI builds are `./build.sh` and `./buildstatic.sh`. Run builds
in a disposable copy because they replace environment placeholders in source
files and create `dist`/`diststatic` directories.

QA should check an overlong handle followed by a corrected 15-character handle,
then complete activation with a fresh emailed code. A remaining activation API
failure now shows its actual reason (for example an expired or wrong code)
instead of "Unknown Error"; the UI does not bypass activation checks.
