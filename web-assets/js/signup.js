
var apiServerUrl = "https://api.{{DOMAIN}}/v3/users";
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
    $.ajax({
      url: apiServerUrl + "/validateHandle?handle=" + handle,
      xhrFields: {
        withCredentials: true,
      },
      success: function (result) {
        if (
          result.result.status === 200 &&
          !result.result.content.valid
        ) {
          $("#error").html("Error: " + result.result.content.reason);
          $("#error").closest(".message").fadeIn();
        }
        if (result.result.status === 200 && result.result.content.valid && submit_flag) {
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
          $("#regSource").val(qs["regSource"]);
          $("#utmSource").val(qs["utmSource"]);
          $("#utmMedium").val(qs["utmMedium"]);
          $("#utmCampaign").val(qs["utmCampaign"]);
          $("#returnUrl").val(qs["returnUrl"]);
          $("#signup").submit();
          submit_flag = false;
          setContinueButtonDisabledStatus(true);
        }
      },
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
    $("#user_privacy_policy").on("change", function(){
      continueBtnDisable = !this.checked;
      if (!continueBtnDisable) {
        setContinueButtonDisabledStatus(continueBtnDisable);
      }
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
