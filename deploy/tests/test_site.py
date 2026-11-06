import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('auth_release', Path(__file__).parents[1] / 'site.py')
site = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(site)
REPO = Path(__file__).parents[2]


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.m = site.read_manifest(REPO / 'deploy/dev.json')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = self.root / 'config.json'
        self.variables = {key: 'fixture' for key in site.PUBLIC_VARIABLES}
        self.variables.update(DOMAIN='topcoder-dev.com', AUTH0DOMAIN='topcoder-dev.auth0.com', LOGGERMODE='false')
        self.save_config()

    def save_config(self):
        self.config.write_text(json.dumps(self.variables))
        self.m['buildConfig']['sha256'] = hashlib.sha256(self.config.read_bytes()).hexdigest()

    def artifact(self):
        with patch.object(site, 'check_job', return_value='a' * 40):
            site.build(self.m, self.config, self.root / 'artifact.json')
        return self.root / 'build'

    def test_real_asset_build_is_complete_and_keeps_country_alias(self):
        root = self.artifact()
        self.assertEqual((root / 'diststatic/js/util.js').read_bytes(), (root / 'diststatic/js/country.js').read_bytes())
        self.assertIn('accounts-auth0.topcoder-dev.com', (root / 'diststatic/js/util.js').read_text())
        for path in root.rglob('*'):
            if path.suffix in ('.js', '.html', '.css'):
                self.assertNotRegex(path.read_text(), r'\{\{[A-Z_0-9]+\}\}')
        self.assertIn('{{DOMAIN}}', (REPO / 'web-assets/js/setupAuth0WithRedirect.js').read_text())
        self.assertEqual(len(site.file_digests(root)), 51)

    def test_configuration_is_literal_not_shell_or_perl_code(self):
        self.variables['DICE_AUTH'] = '$(touch /tmp/auth-deploy-must-not-exist);$&'
        self.save_config()
        root = self.artifact()
        self.assertIn(self.variables['DICE_AUTH'], (root / 'dist/dice-verifier.html').read_text())
        self.assertFalse(Path('/tmp/auth-deploy-must-not-exist').exists())

    def test_config_rejects_extra_variables_wrong_environment_and_digest(self):
        self.variables['AWS_SECRET_ACCESS_KEY'] = 'fixture'
        self.save_config()
        with self.assertRaises(site.d.DeployError):
            site.config_values(self.m, self.config)
        self.variables.pop('AWS_SECRET_ACCESS_KEY')
        self.variables['DOMAIN'] = 'topcoder.com'
        self.save_config()
        with self.assertRaises(site.d.DeployError):
            site.config_values(self.m, self.config)
        self.config.write_text('{}')
        with self.assertRaises(site.d.DeployError):
            site.config_values(self.m, self.config)

    def test_artifact_rejects_mutation_symlinks_and_wrong_source(self):
        root = self.artifact()
        metadata = self.root / 'artifact.json'
        site.verify_artifact(self.m, root, metadata, 'a' * 40)
        with self.assertRaises(site.d.DeployError):
            site.verify_artifact(self.m, root, metadata, 'b' * 40)
        (root / 'dist/index.html').write_text('tampered')
        with self.assertRaises(site.d.DeployError):
            site.verify_artifact(self.m, root, metadata, 'a' * 40)
        (root / 'dist/extra.js').symlink_to('/etc/passwd')
        with self.assertRaises(site.d.DeployError):
            site.file_digests(root)

    def test_manifest_rejects_account_project_branch_and_prefix_changes(self):
        for key, value in [('accountId', '409275337247'), ('branch', 'feature'), ('circleciProjectId', 'foreign')]:
            manifest = copy.deepcopy(self.m)
            manifest[key] = value
            path = self.root / 'manifest.json'
            path.write_text(json.dumps(manifest))
            with self.subTest(key=key), self.assertRaises(site.d.DeployError):
                site.read_manifest(path)
        manifest = copy.deepcopy(self.m)
        manifest['targets']['static']['prefix'] = ''
        path.write_text(json.dumps(manifest))
        with self.assertRaises(site.d.DeployError):
            site.read_manifest(path)

    def test_exact_branches_and_no_tags_for_both_environments(self):
        for env, branch in [('dev', 'dev'), ('prod', 'master')]:
            manifest = site.read_manifest(REPO / f'deploy/{env}.json')
            variables = {'CIRCLE_BRANCH': branch, 'CIRCLE_PROJECT_USERNAME': 'topcoder-platform',
                         'CIRCLE_PROJECT_REPONAME': 'tc-auth-lib', 'CIRCLE_SHA1': 'a' * 40}
            with patch.dict(os.environ, variables, clear=True), patch.object(site.subprocess, 'check_output', return_value='a' * 40):
                site.check_job(manifest)
                for override in [{'CIRCLE_BRANCH': 'v6'}, {'CIRCLE_TAG': 'deploy'}, {'CIRCLE_PROJECT_REPONAME': 'foreign'}, {'CIRCLE_SHA1': 'b' * 40}]:
                    with patch.dict(os.environ, override), self.assertRaises(site.d.DeployError):
                        site.check_job(manifest)

    def test_roles_split_configuration_and_publication_permissions(self):
        for env in ['dev', 'prod']:
            m = site.read_manifest(REPO / f'deploy/{env}.json')
            build, deploy = site.policy(m, 'build'), site.policy(m, 'deploy')
            self.assertNotIn('s3:PutObject', json.dumps(build))
            self.assertNotIn(m['buildConfig']['key'], json.dumps(deploy))
            self.assertIn(m['targets']['static']['bucket'] + '/topcoder-auth/*', json.dumps(deploy))
            self.assertNotIn(m['targets']['static']['bucket'] + '/*', json.dumps(deploy))
            for policy in [build, deploy]:
                self.assertLessEqual(len(site.d.compact(policy)), 2048)
                self.assertIn('ssm:*', policy['Statement'][0]['Action'])
                self.assertIn('secretsmanager:*', policy['Statement'][0]['Action'])
                self.assertIn('s3:DeleteObject', policy['Statement'][0]['Action'])

    def test_oidc_is_required_and_no_legacy_credential_fallback(self):
        with patch.object(site, 'check_job'), patch.dict(os.environ, {'CI_AUTH0_CLIENTSECRET': 'secret', 'AWS_ACCESS_KEY_ID': 'old'}, clear=True), patch.object(site.d.AWS, 'call') as call:
            with self.assertRaises(site.d.DeployError):
                site.authenticate(self.m, 'deploy')
            call.assert_not_called()

    def test_no_upload_if_either_origin_or_versioning_is_wrong(self):
        root = self.artifact()
        for mode in ['wrong-origin', 'unversioned']:
            aws = FakeAWS(self.m, root, mode)
            with patch.object(site, 'check_job', return_value='a' * 40), patch.object(site, 'authenticate', return_value=aws), patch.dict(os.environ, {'CIRCLE_BUILD_NUM': '1'}):
                with self.assertRaises(site.d.DeployError):
                    site.deploy(self.m, root, self.root / 'artifact.json', self.root / 'receipt.json')
            self.assertEqual(aws.puts, [])

    def test_both_targets_publish_with_prefix_scoped_invalidations_and_live_checks(self):
        root = self.artifact()
        aws = FakeAWS(self.m, root)
        def fetch(req, **kwargs):
            for t in self.m['targets'].values():
                if req.full_url.startswith(t['publicUrl'] + '/'):
                    return io.BytesIO((root / t['directory'] / req.full_url.removeprefix(t['publicUrl'] + '/')).read_bytes())
            raise AssertionError('Unreviewed public URL')
        with patch.object(site, 'check_job', return_value='a' * 40), patch.object(site, 'authenticate', return_value=aws), patch.object(site, 'urlopen', side_effect=fetch), patch.dict(os.environ, {'CIRCLE_BUILD_NUM': '1'}):
            site.deploy(self.m, root, self.root / 'artifact.json', self.root / 'receipt.json')
        self.assertEqual(len(aws.puts), 51)
        self.assertEqual(aws.invalidations, ['/*', '/topcoder-auth/*'])
        receipt = json.loads((self.root / 'receipt.json').read_text())
        self.assertIn('verifiedAt', receipt)
        self.assertEqual(len(receipt['previousVersions']), 51)
        static = self.m['targets']['static']['bucket']
        self.assertTrue(all(key.startswith('topcoder-auth/') for bucket, key in aws.puts if bucket == static))
        account_keys = [key for bucket, key in aws.puts if bucket != static]
        first_html = next(i for i, key in enumerate(account_keys) if key.endswith('.html'))
        self.assertTrue(all(key.endswith('.html') for key in account_keys[first_html:]))

    def test_failed_upload_leaves_receipt_and_does_not_delete_or_claim_success(self):
        root = self.artifact()
        aws = FakeAWS(self.m, root, 'upload-error')
        with patch.object(site, 'check_job', return_value='a' * 40), patch.object(site, 'authenticate', return_value=aws), patch.dict(os.environ, {'CIRCLE_BUILD_NUM': '1'}):
            with self.assertRaises(site.d.DeployError):
                site.deploy(self.m, root, self.root / 'artifact.json', self.root / 'receipt.json')
        receipt = json.loads((self.root / 'receipt.json').read_text())
        self.assertNotIn('verifiedAt', receipt)
        self.assertTrue(receipt['previousVersions'])

    def test_access_denied_is_not_treated_as_a_missing_object(self):
        root = self.artifact()
        aws = FakeAWS(self.m, root, 'access-denied')
        with patch.object(site, 'check_job', return_value='a' * 40), patch.object(site, 'authenticate', return_value=aws), patch.dict(os.environ, {'CIRCLE_BUILD_NUM': '1'}):
            with self.assertRaises(site.d.DeployError):
                site.deploy(self.m, root, self.root / 'artifact.json', self.root / 'receipt.json')
        self.assertEqual(aws.puts, [])


class FakeAWS:
    def __init__(self, manifest, root, mode=''):
        self.m, self.root, self.mode = manifest, root, mode
        self.puts, self.invalidations = [], []

    def call(self, service, operation, extra=(), **kw):
        if operation == 'get-distribution':
            t = next(t for t in self.m['targets'].values() if t['distributionId'] == kw['Id'])
            origin = 'wrong' if self.mode == 'wrong-origin' and t['prefix'] else t['origin']
            return {'Distribution': {'Status': 'Deployed', 'DistributionConfig': {'Enabled': True,
                'Origins': {'Items': [{'Id': 'origin', 'DomainName': origin}]},
                'Aliases': {'Items': [t['publicUrl'].split('/')[2]]}, 'DefaultCacheBehavior': {'TargetOriginId': 'origin'}}}}
        if operation == 'get-bucket-versioning':
            return {} if self.mode == 'unversioned' else {'Status': 'Enabled'}
        if operation == 'list-objects-v2':
            return {'Contents': [{'Key': kw['Prefix']}]}
        if operation == 'head-object':
            if self.mode == 'access-denied':
                raise site.d.DeployError('External command failed: AccessDenied')
            return {'VersionId': 'previous'}
        if operation == 'put-object':
            if self.mode == 'upload-error':
                raise site.d.DeployError('External command failed')
            self.puts.append((kw['Bucket'], kw['Key']))
            self.assert_no_credentials(kw)
            return {}
        if operation == 'create-invalidation':
            self.invalidations.extend(kw['InvalidationBatch']['Paths']['Items'])
            return {'Invalidation': {'Id': 'fixture'}}
        if operation == 'get-invalidation':
            return {'Invalidation': {'Status': 'Completed'}}
        raise AssertionError(operation)

    def assert_no_credentials(self, kw):
        assert 'ContentEncoding' not in kw
        assert kw['CacheControl'] == site.NO_CACHE
        assert kw['Metadata']['release'] == 'a' * 40 + '-1'


if __name__ == '__main__':
    unittest.main()
