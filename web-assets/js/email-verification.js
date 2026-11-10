/* Shared by the accounts pages and the npm connector. APIs still verify signatures. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.hasVerifiedEmail = factory();
})(typeof window === 'undefined' ? this : window, function () {
  return function hasVerifiedEmail(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const namespaces = ['', 'https://topcoder.com/', 'https://www.topcoder.com/',
      'https://topcoder-dev.com/', 'https://api.topcoder.com/v6/',
      'https://api.topcoder-dev.com/v6/', 'http://www.topcoder.com/',
      'https://api.topcoder.com/', 'https://api.topcoder-dev.com/'];
    const values = ['email_verified', 'emailVerified', 'emailActive'].flatMap(function (name) {
      return namespaces.filter(function (prefix) {
        return Object.prototype.hasOwnProperty.call(payload, prefix + name);
      }).map(function (prefix) { return payload[prefix + name]; });
    });
    return values.length > 0 && values.every(function (value) { return value === true; });
  };
});
