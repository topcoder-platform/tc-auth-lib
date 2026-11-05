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

## CircleCI OIDC deployments

The pipeline reads the pinned public browser configuration with a read-only OIDC
role, builds both asset trees without cloud credentials, then publishes with a
separate OIDC role. It no longer uses `org-global`, `CI_AUTH0_*`, `awsenvconf`,
`buildenvvar`, or the v1 credential broker. The nine browser configuration values
are the same client-visible values used by the previous build scripts. They are
loaded from one exact S3 object version and checked against a SHA-256 digest;
no configuration values are evaluated as shell commands.

`dev` publishes development and `master` publishes production. Feature branches,
`v6`, `qa`, and tags only run validation; they cannot assume the deployment roles.
Production requires promotion of this change to `master`. The four empty contexts
are `tc-auth-lib-{dev,prod}-{build,deploy}`, restricted to this CircleCI project,
the exact branch, no SSH jobs, and no API-supplied configuration. IAM independently
binds both the checkout and configuration source/ref to this repository.

The manifests in `deploy/` pin both destinations: the accounts bucket and the
`topcoder-auth/` prefix of the shared static bucket. Only those objects and their
CloudFront distributions are writable. The static invalidation is limited to
`/topcoder-auth/*`. IAM templates and provisioning evidence are maintained in
`v6-services-iac/services/tc-auth-lib/`; both target buckets must have versioning
enabled before release. Role policies and permission boundaries deny parameter
and secret access, KMS decryption, role chaining, and object deletion.

The deployment verifies artifact hashes and source revision, validates both live
origins before writing, uploads assets before HTML, waits for invalidations, and
compares public accounts/activation/helper and hosted Auth0 JS bytes with the
build. These are two static sites with stable filenames, so a release is not
atomic across all files. A partial failure remains a failed job. Its stored
`deployment-receipt.json` records previous object versions for operator recovery;
no automatic rollback can overwrite a newer release. Reverting the application
commit and deploying again is the usual recovery path. Exact previous versions
can also be copied back by an authorized operator; never delete versions.
[CircleCI serial groups](https://circleci.com/docs/reference/configuration-reference/#serial-group)
serialize deployments separately for each environment.

Deployment regression tests use mocked cloud responses and a local HTTP fixture:

```sh
# The pipeline first checks out and verifies tc-deploy-scripts v2.0.9 at
# /tmp/tc-deploy-scripts (commit dc06de730f068a230efa9d5f4d4d9c80782d3bfb).
python3 -m unittest discover -s deploy/tests -v
npm test
```

The AWS CLI fixture tests run inside the pinned AWS executor with no cloud access.
They cover the real CLI's versioned downloads and uploads. The application build
is now performed by `deploy/site.py build`; `build.sh` and `buildstatic.sh` remain
available for local compatibility. Changing browser configuration requires a
reviewed version/hash update in the manifests and corresponding build-role policy.
