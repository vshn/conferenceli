window.addEventListener('load', function () {
    // Function to get URL parameter by name using URLSearchParams
    function getUrlParameter(name) {
        var urlParams = new URLSearchParams(window.location.search);
        return urlParams.has(name) ? urlParams.get(name) : '';
    }

    // Function to set the value and defaultValue for a given parameter and field
    function setFieldValue(paramName, fieldId) {
        var paramValue = getUrlParameter(paramName);
        var field = document.getElementById(fieldId);
        if (paramValue && field) {
            field.value = paramValue;
            field.defaultValue = paramValue;
        }
    }

    // List of parameters and corresponding field IDs
    var fields = {
        'voucher': 'orsmnsvnm9ls',
        'company': 'odd9fk5scwf',
        'name': 'os04atey7tl',
        'email': 'o2xpnic8ta8b',
        'phone': 'o15hygq9fspui'
    };

    // Loop through each parameter and set the corresponding field value
    for (var param in fields) {
        if (fields.hasOwnProperty(param)) {
            setFieldValue(param, fields[param]);
        }
    }
});
