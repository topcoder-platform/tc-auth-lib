const qs = (function (a) {
  if (a == "") return {};
  let b = {};
  for (let i = 0; i < a.length; ++i) {
    let p = a[i].split("=", 2);
    if (p.length == 1) b[p[0]] = "";
    else b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
  }
  return b;
})(window.location.search.substr(1).split("&"));
/**
 * Resolves activation/resend failures from v6 and legacy identity API responses.
 * Used by the check-email page to display API messages as text, with a useful
 * fallback for network failures. JSON parse failures are handled internally.
 *
 * @param {Object} error jQuery error response with responseJSON/responseText.
 * @param {string} fallback Message when the response contains no usable error.
 * @returns {string} A displayable error message. Does not throw for invalid JSON.
 */
function getActivationErrorMessage(error, fallback) {
  var payload = error && error.responseJSON;
  if (!payload && error && error.responseText) {
    try {
      payload = JSON.parse(error.responseText);
    } catch (ignored) {
      return fallback;
    }
  }

  var message = payload && (payload.message ||
    (payload.result && payload.result.content) ||
    (payload.error && payload.error.message));
  if (message && typeof message === 'object' && !Array.isArray(message)) message = message.message;
  if (Array.isArray(message)) {
    message = message.filter(function (item) {
      return typeof item === "string" && item.trim();
    }).join(" ");
  }
  return typeof message === "string" && message.trim() ? message.trim() : fallback;
}

$(document).ready(function () {
  window.history.forward();
  // Standalone activation starts after Auth0 has rejected an unverified login.
  // It never resumes that failed transaction or fabricates a verified session.
  const standalone = qs.mode === 'standalone' && !qs.formAction;
  const params = standalone
    ? Object.fromEntries(new URLSearchParams((window.location.hash || '').slice(1)))
    : qs;
  const resendToken = params.resendToken;
  let canResend = params.canResend === 'true';
  const userId = params.userId;
  let isActivating = false;
  let isResending = false;
  let sessionExpired = false;
  let codeState = params.activationCodeState;
  let nextResend = Date.parse(params.nextResendAt) || 0;
  let retryTimer;
  const formAction = qs.formAction || '#';
  const opt1 = 'https://auth.{{DOMAIN}}/continue';
  const opt2 = 'https://{{AUTH0DOMAIN}}/continue';
  if ((!standalone && formAction !== opt1 && formAction !== opt2) ||
      (standalone && (!/^\d+$/.test(userId || '') ||
        typeof resendToken !== 'string' || resendToken.length > 8192 ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(resendToken)))) {
    $('#error').text('Your activation link is invalid. Please sign in again.');
    $('#error').closest('.message-wrapper').fadeIn();
    setContinueButtonDisabledStatus(true);
    return false;
  }

  let afterActivation = 'https://www.{{DOMAIN}}/';
  if (params.returnUrl) {
    try {
      const target = new URL(params.returnUrl);
      const domain = '{{DOMAIN}}';
      if (target.protocol === 'https:' && !target.username && !target.password &&
          (!target.port || target.port === '443') &&
          (target.hostname === domain || target.hostname.endsWith('.' + domain))) {
        afterActivation = target.href;
      }
    } catch (ignored) { /* Keep the safe default destination. */ }
  }
  const apiServerUrl = "https://api.{{DOMAIN}}/v6/users";
  const signInUrl = 'https://accounts-auth0.{{DOMAIN}}/?retUrl=' + encodeURIComponent(afterActivation);

  function needsReplacement() {
    return canResend && (codeState === 'expired' || codeState === 'replacement_required');
  }

  function renderActions() {
    const needsCode = needsReplacement();
    const remaining = Math.max(0, nextResend - Date.now());
    $('#otp, #continueBtn').toggle(!sessionExpired && !needsCode);
    $('#replacement, #enter-code').toggle(!sessionExpired && needsCode);
    $('#replacement').prop('disabled', isResending || remaining > 0);
    $('#resend-text').toggle(!sessionExpired && !needsCode && canResend && !remaining);
    $('#sign-in').attr('href', signInUrl).toggle(sessionExpired);
    $('#resend-time').toggle(!sessionExpired && canResend && remaining > 0);
    clearTimeout(retryTimer);
    if (remaining && !sessionExpired) {
      $('#resend-time').text('You can request another code at ' + new Date(nextResend).toLocaleString() + '.');
      retryTimer = setTimeout(renderActions, Math.min(remaining, 86400000));
    }
    setContinueButtonDisabledStatus(sessionExpired || needsCode || isActivating || isResending || !/^\d{6}$/.test($('#otp').val().trim()));
  }

  function showError(message) {
    $('#error').text(message).closest('.message-wrapper').fadeIn();
    $('#notify').closest('.message-wrapper').fadeOut();
  }

  function handleFailure(error, fallback) {
    const message = getActivationErrorMessage(error, fallback);
    if (error.status === 410) {
      sessionExpired = true;
      showError('Your activation session expired. Sign in again to continue.');
    } else if (error.status === 429 && error.responseJSON && Date.parse(error.responseJSON.retryAt)) {
      nextResend = Date.parse(error.responseJSON.retryAt);
      showError('Please try again at ' + new Date(nextResend).toLocaleString() + '.');
    } else {
      if (message === 'Activation code expired') codeState = 'expired';
      if (['Too many attempts', 'Request a new activation code', 'No activation code found'].includes(message)) codeState = 'replacement_required';
      if (codeState === 'expired' || codeState === 'replacement_required') canResend = true;
      showError(message);
    }
    renderActions();
  }

  if (codeState === 'expired') showError('Your activation code has expired.');
  if (codeState === 'replacement_required') showError('Request a new code to activate your account.');
  $('#enter-code').click(function () {
    codeState = 'valid';
    $('#error').closest('.message-wrapper').fadeOut();
    renderActions();
    $('#otp').trigger('focus');
    return false;
  });
  $("#continueBtn").click(function () {
    if (isActivating || isResending || sessionExpired || needsReplacement()) {
      return false;
    }
    var otp = $("#otp").val().trim();
    if (!/^\d{6}$/.test(otp)) {
      $("#error").text("Enter the six-digit activation code from your email.");
      $("#error").closest(".message-wrapper").fadeIn();
      return false;
    }
    isActivating = true;
    setContinueButtonDisabledStatus(true);
    $("#error").closest(".message-wrapper").fadeOut();
    $("#error").text("");
    $.ajax({
      type: "PUT",
      url: apiServerUrl + "/activate",
      contentType: "application/json",
      mimeType: "application/json",
      data: JSON.stringify({
        "param": {
          userId, resendToken, otp
        }
      }),
      dataType: "json",
      success: function (result) {
        $("#notify").html("Your account is activated");
        $("#notify").closest(".message-wrapper").fadeIn();
        $("#resend-text").hide();
        if (standalone) {
          window.location.replace(signInUrl);
          return;
        }
        $('#verifyOtp').attr('action', formAction);
        $("#state").val(qs["state"]);
        $("#returnUrl").val(qs["returnUrl"]);
        $("#otp").attr('disabled', 'disabled');
        $("#verifyOtp").submit();
      },
      error: function (error) {
        isActivating = false;
        handleFailure(error, 'Unable to activate your account. Please try again.');
      }
    });
    return false;
  });
  $("#resend, #replacement").click(function () {
    if (!canResend || sessionExpired || isActivating || isResending || nextResend > Date.now()) return false;
    isResending = true;
    renderActions();
    $.ajax({
      type: "POST",
      url: apiServerUrl + "/resendActivationEmail",
      contentType: "application/json",
      mimeType: "application/json",
      data: JSON.stringify({
        "param": {
          userId, resendToken
        }
      }),
      dataType: "json",
      success: function (result) {
        isResending = false;
        codeState = 'valid';
        const content = (result.result && result.result.content) || result;
        nextResend = Date.parse(content.nextResendAt) || 0;
        // Refreshing the page should reopen code entry with the same proof.
        const url = new URL(window.location.href);
        const locationParams = standalone ? new URLSearchParams(url.hash.slice(1)) : url.searchParams;
        locationParams.set('activationCodeState', 'valid');
        locationParams.set('canResend', 'true');
        if (nextResend) locationParams.set('nextResendAt', new Date(nextResend).toISOString());
        else locationParams.delete('nextResendAt');
        if (standalone) url.hash = locationParams.toString();
        window.history.replaceState(window.history.state, '', url.href);
        $('#otp').val('');
        $('#error').closest('.message-wrapper').fadeOut();
        $('#notify').text('Check your email and enter the newest six-digit code.').closest('.message-wrapper').fadeIn();
        renderActions();
        $('#otp').trigger('focus');
      },
      error: function (error) {
        isResending = false;
        handleFailure(error, 'Unable to resend your activation email. Please try again.');
      }
    });
    return false;
  });

  $(".close-error").on("click", function () {
    $(this).closest(".message-wrapper").fadeOut();
  });

  $("#otp").on("input change", renderActions);
  renderActions();
});
/**
 * Enables or disables the activation action during validation and API requests.
 * @param {boolean} status True to disable Continue; false to allow a retry.
 * @returns {void} Updates the button. Does not throw under the page's jQuery setup.
 */
function setContinueButtonDisabledStatus(status) {
  var continueBtnObj = $("#continueBtn");
  if (status) {
    continueBtnObj.attr("disabled", true);
  } else {
    continueBtnObj.removeAttr("disabled");
  }
}
