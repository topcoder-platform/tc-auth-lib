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
function activationPage() {
  const elements = new Map();
  const requests = [];
  const document = {};
  const window = {
    history: { forward() {} },
    location: { search: '?formAction=https%3A%2F%2Fauth.{{DOMAIN}}%2Fcontinue&userId=123&resendToken=test&canResend=true&state=state-test' }
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
  const context = vm.createContext({ $, document, window, console: { error() {} } });
  vm.runInContext(readFileSync(join(__dirname, '../web-assets/js/check_email.js'), 'utf8'), context);
  return { $, requests, context };
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
  assert.equal($('#verifyOtp').attributes.action, 'https://auth.{{DOMAIN}}/continue');
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
function lockPage() {
  const events = {};
  const listeners = {};
  const input = { value: '', closest: () => ({}) };
  const form = { querySelector: () => input };
  const window = { addEventListener: (name, listener) => { listeners[name] = listener; } };
  const document = { getElementById: () => ({}) };
  /** Fake Lock constructor for installing the patch; no arguments or errors. */
  function Auth0Lock() {}
  Auth0Lock.prototype.on = (name, handler) => { events[name] = handler; };
  Auth0Lock.prototype.show = () => {};
  window.Auth0Lock = Auth0Lock;
  const context = vm.createContext({ window, document, console: { log() {} }, setTimeout });
  vm.runInContext(readFileSync(join(__dirname, '../web-assets/auth0/js/util.js'), 'utf8'), context);
  new Auth0Lock().show();
  return {
    events,
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
