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

const encode = function (str) {
  str = str.replace(/[\x26\x0A\<>'"]/g, function (str) { return "&#" + str.charCodeAt(0) + ";" })
  return String(str).replace(/[^\w. ]/gi, function (c) {
    return '&#' + c.charCodeAt(0) + ';';
  });
}

$(document).ready(function () {
  window.history.forward();
  let formAction = qs["formAction"] || "#";
  const opt1 = 'https://auth.{{DOMAIN}}/continue';
  const opt2 = 'https://{{AUTH0DOMAIN}}/continue';
  if (!formAction.startsWith(opt1) && !formAction.startsWith(opt2)) {
    // looks like XSS attack
    formAction = "#"
    return false;
  }
  const resendToken = qs["resendToken"];
  const userId = qs["userId"];
  if (resendToken && userId) {
    const apiServerUrl = "https://api.{{DOMAIN}}/v6/users";
    $("#resend").click(function () {
      $.ajax({
        type: "POST",
        url: apiServerUrl + "/resendOtpEmail",
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
          $("#resend").hide();
        },
        error: function (error) {
          if (error.responseJSON && error.responseJSON.result) {
            $("#error").html(error.responseJSON.result.content);
            $("#error").closest(".message-wrapper").fadeIn();
            $("#resend").hide();
          } else {
            $("#error").html("Unknown Error");
            $("#error").closest(".message-wrapper").fadeIn();
          }
        }
      });
    });
  } else {
    $("#resend").hide();
  }
  const errorMessage = qs["message"];
  if (errorMessage) {
    $("#error").html(encode(errorMessage));
    $("#error").closest(".message-wrapper").fadeIn();
  }

  $(".close-error").on("click", function () {
    $(this).closest(".message-wrapper").fadeOut();
  });
  const otpcodes = $(".otpcode").toArray();
  const handleKeyDown = (e) => {
    const currentElement = e.currentTarget;
    const i = otpcodes.indexOf(currentElement)
    if (e.which === 8 && !currentElement.value && i) {
      const previousElement = otpcodes[i - 1];
      previousElement.focus();
      previousElement.select();
      previousElement.value = "";
    }
  }
  const handleInput = (e) => {
    const currentElement = e.currentTarget;
    const i = otpcodes.indexOf(currentElement)
    if (currentElement.value && (i + 1) % otpcodes.length) {
      otpcodes[i + 1].focus();
      otpcodes[i + 1].select();
    }
    if (checkForSubmit()) {
      console.log("will submit")
      submit();
    }
  }
  const handlePaste = (e) => {
    const clipboardData = e.clipboardData || window.clipboardData || e.originalEvent.clipboardData;
    const pastedData = clipboardData.getData("Text");
    const pin = pastedData.replace(/\s/g, "");
    if (!pin) return;
    const ch = [...pin];
    otpcodes.forEach((el, i) => el.value = ch[i] ?? "");
    e.preventDefault();
    if (pin.length >= otpcodes.length) {
      otpcodes[otpcodes.length - 1].focus();
      otpcodes[otpcodes.length - 1].select();
      submit();
    } else {
      otpcodes[pin.length].focus();
      otpcodes[pin.length].select();
    }

  }
  const checkForSubmit = () => {
    for (let i = 0; i < otpcodes.length; i++) {
      if (!otpcodes[i].value) {
        return false;
      }
    }
    return true;
  }
  const submit = () => {
    $('#verifyOtp').attr('action', formAction);
    let otp = "";
    otpcodes.forEach(element => {
      $(element).attr('disabled', 'disabled');
      otp = `${otp}${$(element).val()}`;
    })
    $("#otp").val(otp);
    $("#state").val(qs["state"]);
    $("#returnUrl").val(qs["returnUrl"]);
    $("#verifyOtp").submit();
  }
  otpcodes.forEach(element => {
    $(element).on("paste", handlePaste);
    $(element).on("input", handleInput);
    $(element).on("keydown", handleKeyDown);
  });
});
