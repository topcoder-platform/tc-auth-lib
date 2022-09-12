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
  $("#continueBtn").click(function () {
    var otp = $("#otp").val();
    if (!otp) {
      $("#error").html("Need Password");
      $("#error").closest(".message").fadeIn();
      return false;
    }
    $("#error").closest(".message").fadeOut();
    $("#error").html("");
    let formAction = qs["formAction"];
    const opt1 = 'https://auth.{{DOMAIN}}/continue';
    const opt2 = 'https://{{AUTH0DOMAIN}}/continue';
    if (!formAction.startsWith(opt1) && !formAction.startsWith(opt2)) {
      // looks like XSS attack
      formAction = "#";
    }
    $('#verifyOtp').attr('action', formAction);
    $("#state").val(qs["state"]);
    $("#returnUrl").val(qs["returnUrl"]);
    $("#verifyOtp").submit();
    return false;
  });
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
          $("#notify").closest(".message").fadeIn();
          $("#resend").hide();
        },
        error: function (error) {
          if (error.responseJSON && error.responseJSON.result) {
            $("#error").html(error.responseJSON.result.content);
            $("#error").closest(".message").fadeIn();
            $("#resend").hide();
          } else {
            $("#error").html("Unknown Error");
            $("#error").closest(".message").fadeIn();
          }
        }
      });
    });
  } else {
    $("#resend").hide();
  }

  /**
   * Script for field placeholder
   **/
  $(".messages .close-error").on("click", function () {
    $(this).closest(".message").fadeOut();
  });
  var inputObj = $(".input-field .input-text"),
    continueBtnDisable = false;
  inputObj
    .on("focus", function () {
      $(this).parent().addClass("active focussed");
    })
    .on("blur", function () {
      var parentObj = $(this).parent();
      if ($(this).val() === "") {
        parentObj.removeClass("active");
      }
      parentObj.removeClass("focussed");
    })
    .on("change keydown paste input", function () {
      var disableStatus = false;
      inputObj.each(function (index, element) {
        if ($(element).val() === "") {
          disableStatus = true;
          return;
        } else {
          disableStatus = false;
          return;
        }
      });
      setContinueButtonDisabledStatus(disableStatus);
    })
    .each(function (index, element) {
      var parentObj = $(element).parent();
      if ($(element).val() !== "") {
        parentObj.addClass("active");
      } else {
        parentObj.removeClass("active");
      }

      if ($(element).val() === "" && continueBtnDisable === false) {
        continueBtnDisable = true;
      }

      setContinueButtonDisabledStatus(continueBtnDisable);
    });
});
function setContinueButtonDisabledStatus(status) {
  var continueBtnObj = $("#continueBtn");
  if (status) {
    continueBtnObj.attr("disabled", true);
  } else {
    continueBtnObj.removeAttr("disabled");
  }
}
