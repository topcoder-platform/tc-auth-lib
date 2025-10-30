
var apiServerUrl = "https://api.{{DOMAIN}}/v6/users";
var submit_flag = true;
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
  $.each(countryObjs, function () {
    $("#country").append(
      $("<option></option>").text(this.name).val(JSON.stringify(this))
    );
  });
  //first name & last name div
  var firstname = qs['firstName'];
  if (firstname !== 'undefined') {
    $("#firstName").val(firstname);
    $("#fn").hide();
  }
  var lastname = qs['lastName'];
  if (lastname !== 'undefined') {
    $("#lastName").val(lastname);
    $("#ln").hide();
  }
  $("#continueBtn").click(function () {
    var handle = $("#handle").val();
    var country = $("#country").val();
    if (!handle){
      $("#error").html("Need Username / Handle");
      $("#error").closest(".message").fadeIn();
      return false;
    }
    if (!country){
      $("#error").html("Choose your country");
      $("#error").closest(".message").fadeIn();
      return false;
    }
    $.ajax({
      url: apiServerUrl + "/validateHandle?handle=" + handle,
      xhrFields: {
        withCredentials: true,
      },
      dataType: 'json',
      success: function (result) {
        console.log(JSON.stringify(result));
        if (result && result.valid && submit_flag) {
          $("#error").closest(".message").fadeOut();
          $("#error").html("");
          let formAction = qs["formAction"];
          const opt1 = 'https://auth.{{DOMAIN}}/continue';
          const opt2 = 'https://{{AUTH0DOMAIN}}/continue';
          if (!formAction.startsWith(opt1) && !formAction.startsWith(opt2)) {
            // looks like XSS attack
            formAction = "#";
          }
          $('#signup').attr('action', formAction);
          $("#state").val(qs["state"]);
          $("#regSource").val(qs["reg_source"]);
          $("#utmSource").val(qs["utm_source"]);
          $("#utmMedium").val(qs["utm_medium"]);
          $("#utmCampaign").val(qs["utm_campaign"]);
          $("#returnUrl").val(qs["returnUrl"]);
          $("#signup").submit();
          submit_flag = false;
          //setContinueButtonDisabledStatus(true);
        }
      }, 
      error: function (jqXHR) {
        // Try to extract server-provided message from JSON body
        var message = null;
        try {
          if (jqXHR && jqXHR.responseJSON && jqXHR.responseJSON.message) {
            message = jqXHR.responseJSON.message;
          } else if (jqXHR && jqXHR.responseText) {
            var parsed = JSON.parse(jqXHR.responseText);
            if (parsed && parsed.message) {
              message = parsed.message;
            }
          }
        } catch (e) {
          // fall through to default message
        }

        if (!message) {
          // Provide a sensible fallback when no message is available
          if (jqXHR && jqXHR.status === 409) {
            message = "Handle is already taken.";
          } else {
            message = "An error occurred. Please try again.";
          }
        }

        $("#error").html(message);
        $("#error").closest(".message").fadeIn();
      }
    });
    return false;
  });

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
    .on("change", function () {
      var disableStatus = false;
      inputObj.each(function (index, element) {
        if ($(element).val() === "") {
          disableStatus = true;
          return;
        }
      });
      //setContinueButtonDisabledStatus(disableStatus);
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

      //setContinueButtonDisabledStatus(continueBtnDisable);
    });
    $("#user_privacy_policy").on("change", function(){
      setContinueButtonDisabledStatus(!this.checked);
    })
});
function setContinueButtonDisabledStatus(status) {
  var continueBtnObj = $("#continueBtn");
  if (status) {
    continueBtnObj.attr("disabled", true);
  } else {
    continueBtnObj.removeAttr("disabled");
  }
}
