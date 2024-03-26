function showForm(formNumber) {
    // Hide all forms
    var forms = document.querySelectorAll('.form-register');
    forms.forEach(function(form) {
        form.classList.remove('active');
    });

    // Show the selected form
    var form = document.getElementById('form' + formNumber);
    form.classList.add('active');

    // Toggle active class on buttons
    var buttons = document.querySelectorAll('.buttons-register button');
    buttons.forEach(function(button, index) {
        if (index === formNumber - 1) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}