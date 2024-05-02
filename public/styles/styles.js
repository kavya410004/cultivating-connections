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
document.addEventListener("DOMContentLoaded", function() {
    const copyButton = document.getElementById('copy-button');
    const textToCopy = document.getElementById('phone-number');

    copyButton.addEventListener('click', function() {
        const text = textToCopy.innerText; // Get the text to copy
        const contactAlert = document.getElementById('contact-alert');
        // Use the Clipboard API to copy text to clipboard
        navigator.clipboard.writeText(text).then(function() {
            console.log('Text copied to clipboard');
            contactAlert.classList.toggle('d-none');
        }, function(err) {
            console.error('Failed to copy text to clipboard', err);
        });
    });
});