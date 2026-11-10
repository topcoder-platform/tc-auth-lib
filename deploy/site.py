#!/usr/bin/env python3
"""Release tc-auth-lib's accounts and hosted Auth0 assets using CircleCI OIDC."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from urllib.request import Request, urlopen

sys.path.insert(0, '/tmp/tc-deploy-scripts')
import tcdeploy as d

PUBLIC_VARIABLES = frozenset({'DOMAIN', 'AUTH0DOMAIN', 'AUTH0_CLIENT_ID', 'LOGGERMODE',
    'DISCORD_URL_PATTERN', 'GTM', 'DICE_AUTH', 'CA_SUB_1', 'CA_SUB_2'})
NO_CACHE = 'no-cache,no-store,max-age=0'
OPERATIONS = {'sts': {'get-caller-identity'},
    's3api': {'get-object', 'head-object', 'put-object', 'get-bucket-versioning', 'list-objects-v2'},
    'cloudfront': {'get-distribution', 'create-invalidation', 'get-invalidation'}}
REQUIRED = {'dist': {'index.html', 'activation_required.html', 'email-verification.js', 'setupAuth0WithRedirect.js'},
            'diststatic': {'js/util.js', 'js/country.js', 'css/custom.css'}}
TARGETS = {'dev': {'accounts': {'bucket': 'accounts-auth0.topcoder-dev.com', 'prefix': '', 'distributionId': 'E33X97Z0KO76GE', 'publicUrl': 'https://accounts-auth0.topcoder-dev.com', 'origin': 'accounts-auth0.topcoder-dev.com.s3.us-east-1.amazonaws.com', 'directory': 'dist'}, 'static': {'bucket': 'tc-public-static-files-dev', 'prefix': 'topcoder-auth/', 'distributionId': 'E15DJQDGLQ31WF', 'publicUrl': 'https://tc-public-static-files.topcoder-dev.com/topcoder-auth', 'origin': 'tc-public-static-files-dev.s3.amazonaws.com', 'directory': 'diststatic'}}, 'prod': {'accounts': {'bucket': 'accounts-auth0.topcoder.com', 'prefix': '', 'distributionId': 'E3PS8DKF1P5Q74', 'publicUrl': 'https://accounts-auth0.topcoder.com', 'origin': 'accounts-auth0.topcoder.com.s3.us-east-1.amazonaws.com', 'directory': 'dist'}, 'static': {'bucket': 'tc-public-static-files', 'prefix': 'topcoder-auth/', 'distributionId': 'E660F096J7YP7', 'publicUrl': 'https://tc-public-static-files.topcoder.com/topcoder-auth', 'origin': 'tc-public-static-files.s3.amazonaws.com', 'directory': 'diststatic'}}}


def read_manifest(path):
    m = json.loads(Path(path).read_text(), object_pairs_hook=d.unique_object)
    expected = {'schemaVersion', 'environment', 'branch', 'region', 'accountId', 'repository',
                'circleciOrgId', 'circleciProjectId', 'buildRoleArn', 'deployRoleArn', 'buildConfig', 'targets'}
    d.require(set(m) == expected and m['schemaVersion'] == 1, 'Invalid site manifest')
    env = m['environment']
    d.require(env in TARGETS and m['branch'] == {'dev': 'dev', 'prod': 'master'}[env], 'Wrong release branch')
    account = {'dev': '811668436784', 'prod': '409275337247'}[env]
    d.require(m['accountId'] == account and m['region'] == 'us-east-1', 'Wrong AWS target')
    d.require(m['repository'] == 'github.com/topcoder-platform/tc-auth-lib', 'Wrong repository')
    d.require(m['circleciOrgId'] == '947bef5e-1669-415d-b83c-4fc85155b7df' and
              m['circleciProjectId'] == '63854f65-91c8-40fa-aab8-13e92fc09453', 'Wrong CircleCI project')
    for phase in ('build', 'deploy'):
        d.require(m[phase + 'RoleArn'] == f'arn:aws:iam::{account}:role/tc-auth-lib-{env}-{phase}', 'Wrong role')
    d.require(m['targets'] == TARGETS[env], 'Unreviewed site target or shared-bucket prefix')
    c = m['buildConfig']
    d.require(set(c) == {'bucket', 'key', 'versionId', 'sha256'} and
              c['bucket'] == 'tc-platform-' + env and c['key'] == f'securitymanager/{env}-tc-auth-lib-buildvar.json' and
              isinstance(c['versionId'], str) and c['versionId'] not in ('', 'null') and
              re.fullmatch(r'[a-f0-9]{64}', c['sha256']), 'Invalid versioned browser config')
    return m


def check_job(m):
    d.require(os.environ.get('CIRCLE_BRANCH') == m['branch'] and not os.environ.get('CIRCLE_TAG'), 'Wrong deployment branch or tag')
    d.require(os.environ.get('CIRCLE_PROJECT_USERNAME') == 'topcoder-platform' and
              os.environ.get('CIRCLE_PROJECT_REPONAME') == 'tc-auth-lib', 'Wrong CircleCI repository')
    sha = os.environ.get('CIRCLE_SHA1', '')
    d.require(re.fullmatch(r'[a-f0-9]{40}', sha), 'Invalid source revision')
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    d.require(actual == sha, 'Checkout differs from pipeline revision')
    return sha


def policy(m, phase):
    d.require(phase in ('build', 'deploy'), 'Unknown authentication phase')
    statements = [
        {'Effect': 'Deny', 'Action': ['ssm:*', 'secretsmanager:*', 'kms:Decrypt', 'sts:AssumeRole*',
                                     's3:DeleteObject', 's3:DeleteObjectVersion'], 'Resource': '*'},
        {'Effect': 'Allow', 'Action': 'sts:GetCallerIdentity', 'Resource': '*'}]
    if phase == 'build':
        c = m['buildConfig']
        statements.append({'Effect': 'Allow', 'Action': 's3:GetObjectVersion',
            'Resource': f'arn:aws:s3:::{c["bucket"]}/{c["key"]}',
            'Condition': {'StringEquals': {'s3:VersionId': c['versionId']}}})
    else:
        targets = list(m['targets'].values())
        for target in targets:
            statement = {'Effect': 'Allow', 'Action': 's3:ListBucket',
                         'Resource': 'arn:aws:s3:::' + target['bucket']}
            if target['prefix']:
                statement['Condition'] = {'StringLike': {'s3:prefix': target['prefix'] + '*'}}
            statements.append(statement)
        statements += [
            {'Effect': 'Allow', 'Action': 's3:GetBucketVersioning',
             'Resource': ['arn:aws:s3:::' + t['bucket'] for t in targets]},
            {'Effect': 'Allow', 'Action': ['s3:GetObject', 's3:GetObjectVersion', 's3:PutObject'],
             'Resource': [f'arn:aws:s3:::{t["bucket"]}/{t["prefix"]}*' for t in targets]},
            {'Effect': 'Allow', 'Action': ['cloudfront:GetDistribution', 'cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
             'Resource': [f'arn:aws:cloudfront::{m["accountId"]}:distribution/{t["distributionId"]}' for t in targets]}]
    result = {'Version': '2012-10-17', 'Statement': statements}
    d.require(len(d.compact(result)) <= 2048, 'STS policy exceeds size limit')
    return result


class SiteAWS:
    def __init__(self, env):
        self.env = env

    def call(self, service, operation, extra=(), **parameters):
        d.require(operation in OPERATIONS.get(service, set()), 'Unreviewed AWS operation')
        command = ['aws', service, operation, '--region', 'us-east-1', '--output', 'json', '--no-cli-pager']
        input_text = d.compact(parameters)
        if service == 's3api' and operation == 'get-object':
            # The CLI streaming download does not support cli-input-json.
            # Only reviewed, public object coordinates may enter its argv.
            d.require({'Bucket', 'Key'} <= set(parameters) <= {'Bucket', 'Key', 'VersionId'},
                      'Unreviewed S3 download parameters')
            for name, option in (('Bucket', '--bucket'), ('Key', '--key'), ('VersionId', '--version-id')):
                if name in parameters:
                    command.extend((option, parameters[name]))
            input_text = None
        else:
            command.extend(('--cli-input-json', 'file:///dev/stdin'))
        command.extend(extra)
        result = d.execute(command, self.env, input_text)
        return json.loads(result) if result.strip() else {}


def authenticate(m, phase):
    check_job(m)
    token = os.environ.get('CIRCLE_OIDC_TOKEN_V3')
    d.require(isinstance(token, str) and len(token) > 100, 'CircleCI OIDC V3 is required')
    response = d.AWS(m['region']).call('sts', 'assume-role-with-web-identity',
        RoleArn=m[phase + 'RoleArn'], RoleSessionName='tc-auth-lib-' + str(int(time.time())),
        WebIdentityToken=token, DurationSeconds=3600, Policy=d.compact(policy(m, phase)))
    c = response.get('Credentials', {})
    d.require(all(isinstance(c.get(k), str) and c[k] for k in ['AccessKeyId', 'SecretAccessKey', 'SessionToken', 'Expiration']), 'Incomplete STS credentials')
    d.require(re.fullmatch(r'ASIA[A-Z0-9]{16}', c['AccessKeyId']), 'Temporary credentials required')
    expiry = datetime.fromisoformat(c['Expiration'].replace('Z', '+00:00'))
    d.require(3300 <= (expiry - datetime.now(timezone.utc)).total_seconds() <= 3660, 'Unexpected STS expiry')
    env = d.clean_environment(m['region'])
    env.update(AWS_ACCESS_KEY_ID=c['AccessKeyId'], AWS_SECRET_ACCESS_KEY=c['SecretAccessKey'], AWS_SESSION_TOKEN=c['SessionToken'])
    aws = SiteAWS(env)
    identity = aws.call('sts', 'get-caller-identity')
    d.require(identity.get('Account') == m['accountId'] and identity.get('Arn', '').startswith(
        f'arn:aws:sts::{m["accountId"]}:assumed-role/tc-auth-lib-{m["environment"]}-{phase}/'), 'Wrong STS identity')
    return aws


def config_values(m, path):
    raw = Path(path).read_bytes()
    d.require(hashlib.sha256(raw).hexdigest() == m['buildConfig']['sha256'], 'Browser config digest changed')
    variables = json.loads(raw, object_pairs_hook=d.unique_object)
    d.require(isinstance(variables, dict) and set(variables) == PUBLIC_VARIABLES, 'Unreviewed browser variable')
    d.require(all(isinstance(v, str) and len(v) < 10000 and not any(ord(c) < 32 for c in v)
                  for v in variables.values()), 'Invalid browser config value')
    suffix = '-dev' if m['environment'] == 'dev' else ''
    d.require(variables['DOMAIN'] == f'topcoder{suffix}.com' and
              variables['AUTH0DOMAIN'] == f'topcoder{suffix}.auth0.com' and variables['AUTH0_CLIENT_ID'],
              'Wrong browser authentication environment')
    return variables


def fetch_config(m, output):
    aws = authenticate(m, 'build')
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    c = m['buildConfig']
    aws.call('s3api', 'get-object', extra=(str(output),), Bucket=c['bucket'], Key=c['key'], VersionId=c['versionId'])
    output.chmod(0o600)
    config_values(m, output)
    print('Verified pinned browser configuration; values withheld')


def file_digests(root):
    root = Path(root)
    d.require(root.is_dir() and not root.is_symlink(), 'Missing build directory')
    files = {}
    for p in sorted(root.rglob('*')):
        d.require(not p.is_symlink(), 'Symlink in artifact')
        if not p.is_file():
            continue
        name = p.relative_to(root).as_posix()
        d.require(re.fullmatch(r'[A-Za-z0-9_./-]+', name) and
                  p.suffix.lower() in {'.js', '.css', '.html', '.png', '.svg', '.ico', '.jpg', '.gif'} and
                  name.split('/')[0] in REQUIRED and not any(x.startswith('.') for x in name.split('/')),
                  'Unreviewed artifact filename')
        d.require(p.stat().st_size < 10_000_000, 'Oversized artifact')
        files[name] = hashlib.sha256(p.read_bytes()).hexdigest()
    for folder, required in REQUIRED.items():
        d.require({folder + '/' + name for name in required} <= set(files), 'Incomplete build output')
    return files


def build(m, config, output):
    sha = check_job(m)
    variables = config_values(m, config)
    root = Path(output).parent / 'build'
    d.require(not root.exists(), 'Build output already exists')
    root.mkdir(parents=True)
    source = Path('web-assets')
    d.require(not source.is_symlink() and all(not p.is_symlink() for p in source.rglob('*')), 'Symlink in sources')
    # Copy only the same public asset trees as build.sh/buildstatic.sh; source files stay untouched.
    for directory, destination in [('css', 'dist'), ('js', 'dist'), ('images', 'dist/images'),
        ('static-pages', 'dist'), ('auth0/css', 'diststatic/css'), ('auth0/js', 'diststatic/js'),
        ('auth0/images', 'diststatic/images')]:
        shutil.copytree(source / directory, root / destination, dirs_exist_ok=True)
    for p in root.rglob('*'):
        if p.suffix not in ('.js', '.css', '.html'):
            continue
        text = p.read_bytes().decode('utf-8')
        # Literal substitution: configuration is never evaluated by a shell or Perl.
        text = re.sub(r'\{\{([A-Z_0-9]+)\}\}', lambda match: variables[match[1]], text)
        p.write_bytes(text.encode('utf-8'))
    shutil.copyfile(root / 'diststatic/js/util.js', root / 'diststatic/js/country.js')
    files = file_digests(root)
    Path(output).write_text(json.dumps({'source': sha, 'environment': m['environment'],
        'configSha256': m['buildConfig']['sha256'], 'files': files}, sort_keys=True) + '\n')
    print('Built source ' + sha + '; both asset trees have recorded digests')


def verify_artifact(m, root, metadata, source):
    actual = json.loads(Path(metadata).read_text(), object_pairs_hook=d.unique_object)
    d.require(set(actual) == {'source', 'environment', 'configSha256', 'files'} and
              actual['source'] == source and actual['environment'] == m['environment'] and
              actual['configSha256'] == m['buildConfig']['sha256'], 'Artifact provenance differs')
    d.require(actual['files'] == file_digests(root), 'Artifact bytes differ from build')


def put(aws, target, key, path, release):
    content_type = {'.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html',
                    '.svg': 'image/svg+xml'}.get(Path(key).suffix) or mimetypes.guess_type(key)[0]
    d.require(content_type is not None, 'Unknown content type')
    aws.call('s3api', 'put-object', extra=('--body', str(path)), Bucket=target['bucket'], Key=key,
        ContentType=content_type, CacheControl=NO_CACHE,
        ChecksumSHA256=base64.b64encode(hashlib.sha256(Path(path).read_bytes()).digest()).decode(),
        Metadata={'release': release})


def invalidate(aws, target, reference):
    path = '/' + target['prefix'] + '*'
    result = aws.call('cloudfront', 'create-invalidation', DistributionId=target['distributionId'],
        InvalidationBatch={'Paths': {'Quantity': 1, 'Items': [path]}, 'CallerReference': reference})
    identifier = result['Invalidation']['Id']
    deadline = time.monotonic() + 1200
    while time.monotonic() < deadline:
        state = aws.call('cloudfront', 'get-invalidation', DistributionId=target['distributionId'], Id=identifier)['Invalidation']['Status']
        if state == 'Completed':
            return identifier
        d.require(state == 'InProgress', 'Invalidation failed')
        time.sleep(10)
    raise d.DeployError('CloudFront invalidation timed out')


def deploy(m, root, metadata, receipt):
    sha = check_job(m)
    root = Path(root)
    verify_artifact(m, root, metadata, sha)
    aws = authenticate(m, 'deploy')
    release = sha + '-' + os.environ.get('CIRCLE_BUILD_NUM', '')
    d.require(re.fullmatch(r'[a-f0-9]{40}-[0-9]{1,12}', release), 'Invalid release identity')
    # Validate both destinations before any upload, including the shared static-bucket prefix.
    for target in m['targets'].values():
        dist = aws.call('cloudfront', 'get-distribution', Id=target['distributionId'])['Distribution']
        cfg = dist['DistributionConfig']
        origins = cfg['Origins']['Items']
        d.require(dist['Status'] == 'Deployed' and cfg['Enabled'] and len(origins) == 1 and
                  origins[0]['DomainName'] == target['origin'] and not origins[0].get('OriginPath') and
                  target['publicUrl'].split('/')[2] in cfg['Aliases'].get('Items', []) and
                  cfg['DefaultCacheBehavior']['TargetOriginId'] == origins[0]['Id'] and
                  not cfg.get('CacheBehaviors', {}).get('Quantity', 0), 'CloudFront routing differs')
        d.require(aws.call('s3api', 'get-bucket-versioning', Bucket=target['bucket']).get('Status') == 'Enabled',
                  'Enable bucket versioning before release')
    files = file_digests(root)
    result = {'source': sha, 'environment': m['environment'], 'release': release, 'previousVersions': {}, 'invalidations': {}}
    output = Path(receipt)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Retain an operator receipt even on a partial upload; never delete or silently roll back another release.
    try:
        for name, target in m['targets'].items():
            folder = target['directory'] + '/'
            names = [key for key in files if key.startswith(folder)]
            names.sort(key=lambda key: (key.endswith('.html'), key))
            for filename in names:
                key = target['prefix'] + filename.removeprefix(folder)
                # Prefix-scoped listing distinguishes a new asset from an access failure.
                listed = aws.call('s3api', 'list-objects-v2', Bucket=target['bucket'], Prefix=key, MaxKeys=1)
                old = None
                if any(item.get('Key') == key for item in listed.get('Contents', [])):
                    old = aws.call('s3api', 'head-object', Bucket=target['bucket'], Key=key).get('VersionId', 'null')
                    d.require(isinstance(old, str) and bool(old), 'Existing asset has no recoverable version')
                result['previousVersions'][name + '/' + key] = old
                put(aws, target, key, root / filename, release)
            result['invalidations'][name] = invalidate(aws, target, 'tc-auth-lib-' + name + '-' + release)
            checks = ['index.html', 'activation_required.html', 'email-verification.js'] if name == 'accounts' else ['js/util.js', 'js/country.js']
            for key in checks:
                request = Request(target['publicUrl'] + '/' + key, headers={'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache'})
                with urlopen(request, timeout=30) as response:
                    public = response.read(10_000_001)
                d.require(hashlib.sha256(public).hexdigest() == files[folder + key], 'Published asset differs from build')
        result['verifiedAt'] = datetime.now(timezone.utc).isoformat()
        print('Verified both tc-auth-lib asset trees for release ' + release)
    finally:
        output.write_text(json.dumps(result, indent=2) + '\n')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=['config', 'build', 'deploy'])
    p.add_argument('--manifest', required=True)
    p.add_argument('--config', default='/tmp/release/browser-config.json')
    p.add_argument('--root', default='/tmp/release/build')
    p.add_argument('--metadata', default='/tmp/release/artifact.json')
    p.add_argument('--receipt', default='/tmp/release/deployment-receipt.json')
    a = p.parse_args()
    m = read_manifest(a.manifest)
    if a.action == 'config':
        fetch_config(m, a.config)
    elif a.action == 'build':
        build(m, a.config, a.metadata)
    else:
        deploy(m, a.root, a.metadata, a.receipt)


if __name__ == '__main__':
    try:
        main()
    except d.DeployError as exc:
        print('tc-auth-lib release stopped: ' + str(exc), file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print('tc-auth-lib release stopped; inspect the reviewed configuration or deployment receipt. No credentials were logged.', file=sys.stderr)
        sys.exit(1)
