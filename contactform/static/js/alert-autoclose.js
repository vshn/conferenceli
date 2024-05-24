// Get all elements with class "auto-close"
const autoCloseElements = document.querySelectorAll(".alert-dismissible");

// Define a function to handle the fading and sliding animation
function fadeAndSlide(element) {
    const fadeDuration = 500;
    const slideDuration = 500;

    // Step 1: Fade out the element
    let opacity = 1;
    const fadeInterval = setInterval(function () {
        if (opacity > 0) {
            opacity -= 0.1;
            element.style.opacity = opacity;
        } else {
            clearInterval(fadeInterval);
            // Step 2: Slide up the element
            let height = element.offsetHeight;
            const slideInterval = setInterval(function () {
                if (height > 0) {
                    height -= 10;
                    element.style.height = height + "px";
                } else {
                    clearInterval(slideInterval);
                    // Step 3: Remove the element from the DOM
                    element.parentNode.removeChild(element);
                }
            }, slideDuration / 10);
        }
    }, fadeDuration / 10);
}

// Set a timeout to execute the animation after 5000 milliseconds (5 seconds)
setTimeout(function () {
    autoCloseElements.forEach(function (element) {
        fadeAndSlide(element);
    });
}, 5000);