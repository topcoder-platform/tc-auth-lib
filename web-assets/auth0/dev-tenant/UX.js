try {
    const firstNameDiv =
        document.getElementById("1-firstName").parentNode.parentNode;
    const lastNameDiv =
        document.getElementById("1-lastName").parentNode.parentNode;
    const emailDiv = document.getElementById("1-email").parentNode.parentNode;
    emailDiv.parentNode.insertBefore(e_firstname, e_email);
    emailDiv.parentNode.insertBefore(e_lastname, e_email);
    
} catch (e) {
    console.log("Error occured in re-ordering", e);
}
