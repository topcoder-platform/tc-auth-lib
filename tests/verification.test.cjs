const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const hasVerifiedEmail = require('../web-assets/js/email-verification');

function accounts(claims, search = '', cookieToken) {
  const writes = [], redirects = [], messages = [];
  const location = { search, protocol: 'https:', host: 'accounts-auth0.topcoder-dev.com', hostname: 'accounts-auth0.topcoder-dev.com', assign: value => redirects.push(value), replace: value => redirects.push(value) };
  let cookie = cookieToken ? `tcjwt=${cookieToken}` : '';
  const document = { createElement: () => ({}), getElementsByTagName: () => ({ item: () => ({ appendChild() {} }) }) };
  Object.defineProperty(document, 'cookie', { get: () => cookie, set(value) { writes.push(value); if (value.startsWith('tcjwt=;')) cookie = ''; } });
  const context = vm.createContext({ window: { location }, location, document, hasVerifiedEmail, console, URL, clearInterval() {}, setInterval() {}, atob: value => Buffer.from(value, 'base64').toString('binary') });
  const source = fs.readFileSync(require.resolve('../web-assets/js/setupAuth0WithRedirect.js'), 'utf8')
    .replace('    init();', '    return { storeToken, receiveMessage, isLoggedIn, _init, setAuth(value) { auth0 = value; } };');
  vm.runInContext(source + '\nthis.api = authSetup();', context);
  const token = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 300, ...claims })).toString('base64url')}.signature`;
  const auth = { getIdTokenClaims: async () => ({ ...claims, __raw: token }), getTokenSilently: async () => token };
  context.api.setAuth(auth);
  return { ...context.api, auth, token, writes, redirects, messages, refresh() { context.api.receiveMessage({ data: { type: 'REFRESH_TOKEN' }, origin: 'https://www.topcoder-dev.com', source: { postMessage: message => messages.push(message.type) } }); } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

for (const value of [undefined, false, 'true', 1, null]) {
  test(`accounts rejects active member with invalid verification ${value}`, async () => {
    const page = accounts({ active: true, email_verified: value });
    page.storeToken();
    await flush();
    assert.ok(page.redirects[0].endsWith('/activation_required.html'));
    assert.ok(page.writes.every(value => value.includes('1970')));
  });
}

test('verified active member can establish cookies', async () => {
  const page = accounts({ active: true, emailVerified: true });
  page.storeToken();
  await flush();
  assert.ok(page.writes.some(value => value.startsWith(`tcjwt=${page.token}`)));
  assert.equal(page.redirects.length, 0);
});

test('cached unverified cookie cannot satisfy iframe refresh', () => {
  const first = accounts({ active: true });
  const page = accounts({}, '', first.token);
  assert.equal(page.isLoggedIn(), false);
  page.refresh();
  assert.deepEqual(page.messages, ['FAILURE']);
  assert.ok(page.writes.some(value => value.startsWith('tcjwt=') && value.includes('1970')));
});

test('identity verification error opens activation page without starting login again', () => {
  const page = accounts({}, '?error=access_denied&error_description=EMAIL_VERIFICATION_REQUIRED&state=test');
  page._init(page.auth);
  assert.ok(page.redirects[0].endsWith('/activation_required.html'));
});

test('verification rejects attacker namespaces, conflicts, and machine flags in browsers', () => {
  for (const payload of [{ 'https://attacker.example/emailVerified': true }, { email_verified: false, emailVerified: true }, { isMachine: true }]) assert.equal(hasVerifiedEmail(payload), false);
  assert.equal(hasVerifiedEmail({ 'https://topcoder.com/emailVerified': true }), true);
});

test('connector rejects cached and refreshed tokens without verification', async () => {
  for (const cached of [true, false]) {
    let listener;
    const source = fs.readFileSync(require.resolve('../src/connector-wrapper.js'), 'utf8').replace(/export function /g, 'function ');
    const payload = { handle: 'member', exp: Math.floor(Date.now() / 1000) + 300 };
    const context = vm.createContext({
      require(name) {
        if (name.includes('email-verification')) return hasVerifiedEmail;
        if (name === './token') return { getToken: () => 'token', isTokenExpired: () => !cached, decodeToken: () => payload };
        if (name === './iframe') return { createFrame: () => ({ contentWindow: { postMessage() { queueMicrotask(() => listener({ data: { type: 'SUCCESS' } })); } } }) };
        throw new Error(name);
      },
      window: { addEventListener(_type, callback) { listener = callback; }, removeEventListener() {} }, console,
    });
    vm.runInContext(source + '\nconfigureConnector({ connectorUrl: "https://accounts.example.com" }); iframe.onload(); this.getFreshToken = getFreshToken;', context);
    await assert.rejects(context.getFreshToken(), /EMAIL_VERIFICATION_REQUIRED/);
    payload.emailVerified = true;
    assert.equal(await context.getFreshToken(), 'token');
  }
});
