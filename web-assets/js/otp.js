var qs = (function (a) {
  if (a == "") return {};
  var b = {};
  for (var i = 0; i < a.length; ++i) {
    var p = a[i].split("=", 2);
    if (p.length == 1) b[p[0]] = "";
    else b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
  }
  return b;
})(window.location.search.substr(1).split("&"));

$(document).ready(function () {
  window.history.forward();
  const resendToken = qs["resendToken"];
  const userId = qs["userId"];
  if (resendToken && userId) {
      const apiServerUrl = "https://api.{{DOMAIN}}/v3/users";
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
                  $("#notify").closest(".messages").fadeIn();
                  $("#resend").hide();
              },
              error: function (error) {
                  if (error.responseJSON && error.responseJSON.result) {
                      $("#error").html(error.responseJSON.result.content);
                      $("#error").closest(".message-wrapper").fadeIn();
                      $("#error").closest(".messages").fadeIn();
                      $("#resend").hide();
                  } else {
                      $("#error").html("Unknown Error");
                      $("#error").closest(".message-wrapper").fadeIn();
                      $("#error").closest(".messages").fadeIn();
                  }
              }
          });
      });
  } else {
      $("#resend").hide();
  }

  $(".close-error").on("click", function () {
      $(this).closest(".message-wrapper").fadeOut();
      $(this).closest(".messages").fadeOut();
  });
});

let inputVal = [];

const isKeyInput = (e) => {
// exclude backspace, tab, shift, ctrl, alt, esc and arrow keys
  return (
      [8, 9, 16, 17, 18, 27, 37, 38, 39, 40, 46].indexOf(e.which) === -1
  );
};

const isNumberInput = (e) => {
  var charKey = e.key;
  return !isNaN(charKey) || charKey.toLowerCase() === "backspace";
};

const autotab = (e, currentPosition, to) => {
  const currentElement = e.currentTarget;
  if (
      isKeyInput(e) &&
      currentElement.getAttribute &&
      !e.ctrlKey &&
      currentElement.value.length >=
      currentElement.getAttribute("maxlength")
  ) {
      inputVal[currentPosition] = currentElement.value;
      if (to) {
          const elem = document.getElementById(to);
          if (elem) {
              elem.focus();
              elem.select();
          }
      } else {
          submit();
      }
  }
};

const submit = () => {
  let formAction = qs["formAction"] || "#";
  const opt1 = 'https://auth.domain/continue';
  const opt2 = 'https://{{AUTH0DOMAIN}}/continue';
  if (!formAction.startsWith(opt1) && !formAction.startsWith(opt2)) {
      // looks like XSS attack
      $('#verifyOtp').attr('action', '#');
      return false;
  }
  $('#verifyOtp').attr('action', formAction);
  $("#code1").attr('disabled', 'disabled');
  $("#code2").attr('disabled', 'disabled');
  $("#code3").attr('disabled', 'disabled');
  $("#code4").attr('disabled', 'disabled');
  $("#code5").attr('disabled', 'disabled');
  $("#code6").attr('disabled', 'disabled');
  var otp = `${$("#code1").val()}${$("#code2").val()}${$("#code3").val()}${$("#code4").val()}${$("#code5").val()}${$("#code6").val()}`;
  $("#otp").val(otp);
  $("#state").val(qs["state"]);
  $("#returnUrl").val(qs["returnUrl"]);
  $("#verifyOtp").submit();
}

const keydownHandler = (e, prefix, currentPosition) => {
  const currentElement = e.currentTarget;
  if (e.which === 8 && currentElement.value.length === 0) {
      // go to previous input when backspace is pressed
      const elem = document.getElementById(
      `${prefix}${currentPosition - 1}`
      );
      if (elem) {
          elem.focus();
          elem.select();
          e.preventDefault();
          return;
      }
  }
  // only allows numbers (prevents e, +, - on input number type)
  if (
      // currentElement.type === "number" &&
      e.which === 69 ||
      e.which === 187 ||
      e.which === 189 ||
      e.which === 190 ||
      !isNumberInput(e)
  ) {
      e.preventDefault();
      return;
  }
  const elem = document.getElementById(
  `${prefix}${currentPosition - 1}`
  );
  if (elem && !elem.value) {
      e.preventDefault();
      return;
  }
};

const pasteHandler = (e, prefix, currentPosition) => {
  const clipboardData = e.clipboardData || window.clipboardData;
  const pastedData = clipboardData.getData("Text");
  let inputPos = currentPosition;
  let strIndex = 0;
  let elem;
  do {
      elem = document.getElementById(`${prefix}${inputPos}`);
      if (elem && pastedData[strIndex]) {
          elem.value = pastedData[strIndex];
          elem.dispatchEvent(new Event("input"));
          if (inputPos === 6) {
              submit();
          }
          e.preventDefault();
      } else {
          break;
      }
      strIndex++;
      inputPos++;
  } while (elem && strIndex < pastedData.length);
};