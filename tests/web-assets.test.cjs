const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

/**
 * Runs the real check-email script with a small jQuery adapter and captured AJAX.
 * No inputs; returns selectors, requests and the VM for exercising page handlers.
 * Used by activation tests; propagates script loading/execution errors.
 */
function activationPage(options = {}) {
  const elements = new Map();
  const requests = [];
  const document = {};
  const redirects = [];
  const window = {
    history: { forward() {} },
    location: { search: options.search ?? '?formAction=https%3A%2F%2Fauth.topcoder-dev.com%2Fcontinue&userId=123&resendToken=test&canResend=true&state=state-test', hash: options.hash || '', replace: url => redirects.push(url) }
  };
  /**
   * Adapts the selector/object supplied by the page to a chainable jQuery fixture.
   * @param {string|Object} selector CSS selector or an existing fixture/document.
   * @returns {Object} Stateful element fixture. Does not throw for page selectors.
   */
  function $(selector) {
    if (typeof selector === 'object' && selector !== document) return selector;
    if (!elements.has(selector)) {
      const element = {
        value: '', textValue: '', attributes: {}, handlers: {}, hidden: false, submits: 0,
        ready(fn) { fn(); return this; },
        val(value) { if (value === undefined) return this.value; this.value = value; return this; },
        text(value) { this.textValue = value; return this; },
        html(value) { this.htmlValue = value; return this; },
        closest() { return this; },
        fadeIn() { this.hidden = false; return this; },
        fadeOut() { this.hidden = true; return this; },
        hide() { this.hidden = true; return this; },
        attr(name, value) { this.attributes[name] = value; return this; },
        removeAttr(name) { delete this.attributes[name]; return this; },
        click(fn) { this.handlers.click = fn; return this; },
        on(events, fn) { for (const event of events.split(' ')) this.handlers[event] = fn; return this; },
        submit() { this.submits++; return this; }
      };
      elements.set(selector, element);
    }
    return elements.get(selector);
  }
  $.ajax = options => requests.push(options);
  const context = vm.createContext({ $, document, window, URL, URLSearchParams, console: { error() {} } });
  vm.runInContext(readFileSync(join(__dirname, '../web-assets/js/check_email.js'), 'utf8').replaceAll('{{DOMAIN}}', 'topcoder-dev.com').replaceAll('{{AUTH0DOMAIN}}', 'topcoder-dev.auth0.com'), context);
  return { $, requests, context, redirects };
}

for (const [name, error, expected] of [
  ['v6 message', { responseJSON: { message: 'Wrong activation code' } }, 'Wrong activation code'],
  ['v6 validation array', { responseJSON: { message: ['Invalid user', 'Invalid code'] } }, 'Invalid user Invalid code'],
  ['legacy error', { responseJSON: { result: { content: 'Activation code expired' } } }, 'Activation code expired'],
  ['nested message', { responseJSON: { error: { message: 'Expired token' } } }, 'Expired token'],
  ['JSON response text', { responseText: '{"message":"Too many attempts"}' }, 'Too many attempts'],
  ['network failure', { status: 0 }, 'Unable to activate your account. Please try again.'],
  ['non-JSON response', { responseText: '<html>Bad gateway</html>' }, 'Unable to activate your account. Please try again.'],
  ['HTML in API message', { responseJSON: { message: '<img src=x onerror=alert(1)>' } }, '<img src=x onerror=alert(1)>']
]) {
  test(`activation displays ${name} as text and permits retry`, () => {
    const { $, requests } = activationPage();
    $('#otp').val('123456');
    $('#continueBtn').handlers.click();
    assert.equal(requests.length, 1);
    requests[0].error(error);
    assert.equal($('#error').textValue, expected);
    assert.equal($('#error').htmlValue, undefined);
    assert.equal($('#continueBtn').attributes.disabled, undefined);
    $('#continueBtn').handlers.click();
    assert.equal(requests.length, 2);
  });
}

test('pending activation cannot be submitted again by changing the code', () => {
  const { $, requests } = activationPage();
  $('#otp').val('123456');
  $('#continueBtn').handlers.click();
  $('#otp').val('654321');
  $('#otp').handlers.input.call($('#otp'));
  $('#continueBtn').handlers.click();
  assert.equal(requests.length, 1);
  assert.equal($('#continueBtn').attributes.disabled, true);
});

test('successful activation continues the Auth0 flow with the original state', () => {
  const { $, requests } = activationPage();
  $('#otp').val('012345');
  $('#continueBtn').handlers.click();
  assert.deepEqual(JSON.parse(requests[0].data).param, { userId: '123', resendToken: 'test', otp: '012345' });
  requests[0].success({ id: 123 });
  assert.equal($('#verifyOtp').submits, 1);
  assert.equal($('#verifyOtp').attributes.action, 'https://auth.topcoder-dev.com/continue');
  assert.equal($('#state').value, 'state-test');
});

for (const code of ['', '12345', 'abcdef']) {
  test(`invalid activation code ${JSON.stringify(code)} sends no request`, () => {
    const { $, requests } = activationPage();
    $('#otp').val(code);
    $('#continueBtn').handlers.click();
    assert.equal(requests.length, 0);
    assert.equal($('#error').textValue, 'Enter the six-digit activation code from your email.');
  });
}

test('resend displays v6 errors and keeps the retry link available', () => {
  const { $, requests } = activationPage();
  $('#resend').handlers.click();
  requests[0].error({ responseJSON: { message: 'Resend token has expired.' } });
  assert.equal($('#error').textValue, 'Resend token has expired.');
  assert.equal($('#resend-text').hidden, false);
});

/**
 * Loads the shipped Lock patch and exposes synthetic submit events for boundaries.
 * No inputs; returns the Lock event handlers and guard submission helper.
 * Used to verify signup-only interception. Propagates loading/execution errors.
 */
function lockPage({ navigationFails = false } = {}) {
  const events = {};
  const listeners = {};
  const input = { value: '', closest: () => ({}) };
  const form = { querySelector: () => input };
  const redirects = [];
  const navigationStates = [];
  const errorNode = { textContent: "We're sorry, something went wrong when attempting to sign up." };
  const timers = [];
  const logs = [];
  const pendingNodes = [];
  const window = {
    location: { assign(value) {
      navigationStates.push(pendingNodes.length);
      if (navigationFails) throw new Error('Navigation failed');
      redirects.push(value);
    } },
    addEventListener: (name, listener) => { listeners[name] = listener; }
  };
  const document = {
    getElementById: () => ({}),
    querySelectorAll: selector => selector === '.auth0-lock-error-msg' ? [errorNode] : [],
    body: { appendChild: node => pendingNodes.push(node) },
    createElement(tagName) {
      return {
        tagName, children: [], attributes: {}, style: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        appendChild(node) { this.children.push(node); },
        remove() { pendingNodes.splice(pendingNodes.indexOf(this), 1); }
      };
    }
  };
  /** Fake Lock constructor for installing the patch; no arguments or errors. */
  function Auth0Lock() {}
  Auth0Lock.prototype.on = (name, handler) => { events[name] = handler; };
  Auth0Lock.prototype.show = () => {};
  window.Auth0Lock = Auth0Lock;
  const context = vm.createContext({ window, document, console: { error: (...args) => logs.push(args) }, setTimeout: fn => timers.push(fn) });
  vm.runInContext(readFileSync(join(__dirname, '../web-assets/auth0/js/util.js'), 'utf8'), context);
  new Auth0Lock().show();
  return {
    events,
    redirects,
    pendingNodes, navigationStates, errorNode, logs,
    restore() { listeners.pageshow(); },
    flushTimers() { while (timers.length) timers.shift()(); },
    /**
     * Dispatches a handle value through the real capture-phase submit listener.
     * @param {string} handle Signup handle or login identifier.
     * @returns {boolean} Whether submission was blocked. Does not throw.
     */
    blocked(handle) {
      input.value = handle;
      let blocked = false;
      listeners.submit({
        target: { closest: () => form },
        preventDefault() { blocked = true; },
        stopPropagation() {}
      });
      return blocked;
    }
  };
}

test('signup blocks outside 3–15 characters and accepts a corrected 15-character handle', () => {
  const { events, blocked } = lockPage();
  events['signup ready']();
  assert.equal(blocked('boundaryhandle16'), true);
  assert.equal(blocked('boundaryhandle1'), false);
  assert.equal(blocked('abcdef'), false);
  assert.equal(blocked('abc'), false);
  assert.equal(blocked('ab'), true);
});

test('login and password reset accept long identifiers after visiting signup', () => {
  const { events, blocked } = lockPage();
  events['signup ready']();
  events['signin ready']();
  assert.equal(blocked('long.email@example.com'), false);
  events['forgot_password ready']();
  assert.equal(blocked('long.email@example.com'), false);
});

for (const error of [
  { code: 'EMAIL_VERIFICATION_REQUIRED' },
  { error_description: 'Activate your account before logging in.' },
  { original: { result: { content: { code: 'EMAIL_VERIFICATION_REQUIRED' } } } }
]) {
  test('hosted Lock login redirects verification failures to account activation', () => {
    const { events, redirects } = lockPage();
    events.authorization_error(error);
    assert.deepEqual(redirects, ['https://accounts-auth0.{{DOMAIN}}/activation_required.html']);
  });
}

const activationProof = { code: 'EMAIL_VERIFICATION_REQUIRED', activation: { userId: '123', resendToken: 'header.payload.signature', canResend: true } };
test('activation pending UI precedes navigation and duplicate events redirect only once', () => {
  const page = lockPage();
  page.events['signup error']({ description: JSON.stringify(activationProof) });
  page.events.authorization_error({ description: JSON.stringify(activationProof) });
  assert.deepEqual(page.navigationStates, [1]);
  assert.equal(page.redirects.length, 1);
  const status = page.pendingNodes[0].children.find(node => node.attributes.role === 'status');
  assert.equal(status.textContent, 'Opening email verification…');
  assert.equal(status.attributes['aria-live'], 'polite');
  assert.equal(JSON.stringify(page.logs).includes(activationProof.activation.resendToken), false);
  page.restore();
  assert.equal(page.pendingNodes.length, 0);
  page.events['signup error'](activationProof);
  assert.equal(page.redirects.length, 2);
});

test('ordinary signup errors remain visible without an activation screen or redirect', () => {
  const page = lockPage();
  page.events['signup error']({ code: 'user_exists', description: 'The user already exists.' });
  page.flushTimers();
  assert.equal(page.errorNode.textContent, 'The user already exists.');
  assert.equal(page.pendingNodes.length, 0);
  assert.equal(page.redirects.length, 0);
});

test('failed navigation restores Lock and replaces its later fallback with a retry message', () => {
  const page = lockPage({ navigationFails: true });
  page.events['signup error'](activationProof);
  page.errorNode.textContent = "We're sorry, something went wrong when attempting to sign up.";
  page.flushTimers();
  assert.equal(page.pendingNodes.length, 0);
  assert.equal(page.redirects.length, 0);
  assert.equal(page.errorNode.textContent, 'Unable to open email verification. Please try again.');
});

for (const event of ['signup error', 'authorization_error']) {
  for (const error of [
    { code: 'blocked_user', description: JSON.stringify(activationProof) },
    { original: { response: { body: { message: JSON.stringify(activationProof) } } } },
    { code: 'EMAIL_VERIFICATION_REQUIRED', original: { description: JSON.stringify(activationProof) } }
  ]) {
    test(`${event} opens standalone OTP activation using the limited proof in the fragment`, () => {
      const { events, redirects } = lockPage();events[event](error);
      assert.equal(redirects.length, 1);
      const url = new URL(redirects[0].replace('{{DOMAIN}}', 'topcoder-dev.com'));
      assert.equal(url.origin, 'https://accounts-auth0.topcoder-dev.com');assert.equal(url.pathname, '/check_email.html');
      assert.equal(url.search, '?mode=standalone');
      assert.equal(new URLSearchParams(url.hash.slice(1)).get('resendToken'), 'header.payload.signature');
    });
  }
}
test('malformed activation proof cannot select a redirect or expose arbitrary payload', () => {
  const { events, redirects } = lockPage();
  events.authorization_error({ description: JSON.stringify({ ...activationProof, activation: { userId: '123', resendToken: 'https://evil.test' } }) });
  assert.deepEqual(redirects, ['https://accounts-auth0.{{DOMAIN}}/activation_required.html']);
});
function standalone(returnUrl = 'https://www.topcoder-dev.com/challenges', canResend = 'true') {
  return activationPage({ search: '?mode=standalone', hash: '#userId=123&resendToken=header.payload.signature&canResend=' + canResend + '&returnUrl=' + encodeURIComponent(returnUrl) });
}
test('standalone activation posts OTP proof and then starts a fresh login, without resuming Auth0', () => {
  const { $, requests, redirects } = standalone();$('#otp').val('123456');$('#continueBtn').handlers.click();
  assert.equal(requests[0].url, 'https://api.topcoder-dev.com/v6/users/activate');
  assert.deepEqual(JSON.parse(requests[0].data), { param: { userId: '123', resendToken: 'header.payload.signature', otp: '123456' } });
  requests[0].success({});assert.equal($('#verifyOtp').submits, 0);
  assert.equal(redirects[0], 'https://accounts-auth0.topcoder-dev.com/?retUrl=' + encodeURIComponent('https://www.topcoder-dev.com/challenges'));
});
test('standalone activation failure stays on the form and permits retry', () => {
  const { $, requests, redirects } = standalone();$('#otp').val('123456');$('#continueBtn').handlers.click();
  requests[0].error({ responseJSON: { message: 'Wrong activation code' } });
  assert.equal(redirects.length, 0);assert.equal($('#error').textValue, 'Wrong activation code');assert.equal($('#continueBtn').attributes.disabled, undefined);
});
test('standalone resend uses only the activation proof and does not create a session', () => {
  const { $, requests, redirects } = standalone();$('#resend').handlers.click();
  assert.deepEqual(JSON.parse(requests[0].data), { param: { userId: '123', resendToken: 'header.payload.signature' } });
  requests[0].success({});assert.equal(redirects.length, 0);
  assert.equal(standalone(undefined, 'false').$('#resend-text').hidden, true);
});
for (const target of ['https://evil.test/', 'https://topcoder-dev.com.evil.test/', 'https://topcoder-dev.com@evil.test/', 'javascript:alert(1)', '//evil.test/', 'http://www.topcoder-dev.com/', 'https://www.topcoder-dev.com:8443/', 'https://user:pass@www.topcoder-dev.com/']) {
  test(`standalone activation rejects unsafe return destination ${target}`, () => {
    const { $, requests, redirects } = standalone(target);$('#otp').val('123456');$('#continueBtn').handlers.click();requests[0].success({});
    assert.equal(redirects[0], 'https://accounts-auth0.topcoder-dev.com/?retUrl=' + encodeURIComponent('https://www.topcoder-dev.com/'));
  });
}
for (const options of [
  { search: '?mode=standalone', hash: '#userId=123&resendToken=invalid' },
  { search: '?mode=standalone&formAction=https://evil.test/', hash: '#userId=123&resendToken=header.payload.signature' },
  { search: '?formAction=https://auth.topcoder-dev.com/continue.evil&userId=123' }
]) {
  test('invalid activation context binds no submit handler', () => {
    const { $, requests } = activationPage(options);assert.equal($('#continueBtn').handlers.click, undefined);assert.equal(requests.length, 0);
  });
}
