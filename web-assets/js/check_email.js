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
  const canResend = params.canResend === 'true';
  const userId = params.userId;
  let isActivating = false;
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
  if (standalone && params.returnUrl) {
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
  $("#continueBtn").click(function () {
    if (isActivating) {
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
          window.location.replace('https://accounts-auth0.{{DOMAIN}}/?retUrl=' + encodeURIComponent(afterActivation));
          return;
        }
        $('#verifyOtp').attr('action', formAction);
        $("#state").val(qs["state"]);
        $("#returnUrl").val(qs["returnUrl"]);
        $("#otp").attr('disabled', 'disabled');
        $("#verifyOtp").submit();
      },
      error: function (error) {
        console.error("[tc-auth-lib] check_email activate error", {
          status: error && error.status,
          responseJSON: error && error.responseJSON,
          responseText: error && error.responseText
        });
        $("#error").text(getActivationErrorMessage(error,
          "Unable to activate your account. Please try again."));
        $("#error").closest(".message-wrapper").fadeIn();
        isActivating = false;
        setContinueButtonDisabledStatus(!/^\d{6}$/.test($("#otp").val().trim()));
      }
    });
    return false;
  });
  if (canResend) {
    $("#resend").click(function () {
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
          $("#notify").html("Email sent");
          $("#notify").closest(".message-wrapper").fadeIn();
          $("#resend-text").hide();
        },
        error: function (error) {
          console.error("[tc-auth-lib] check_email resendActivationEmail error", {
            status: error && error.status,
            responseJSON: error && error.responseJSON,
            responseText: error && error.responseText
          });
          $("#error").text(getActivationErrorMessage(error,
            "Unable to resend your activation email. Please try again."));
          $("#error").closest(".message-wrapper").fadeIn();
        }
      });
      return false;
    });
  } else {
    $("#resend-text").hide();
  }

  $(".close-error").on("click", function () {
    $(this).closest(".message-wrapper").fadeOut();
  });

  $("#otp").on("change keydown paste input", function () {
    if (isActivating || !/^\d{6}$/.test($(this).val().trim())) {
      setContinueButtonDisabledStatus(true)
    } else {
      setContinueButtonDisabledStatus(false)
    }
  });
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
