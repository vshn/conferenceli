// Contact form behaviour. Two jobs, no dependencies.

(function () {
  "use strict";

  // 1. Flash messages: dismiss on tap, fade out on their own after 6s.
  //    The fade itself is a CSS transition; this only toggles the class.
  function dismiss(flash) {
    if (!flash || flash.classList.contains("is-leaving")) return;
    flash.classList.add("is-leaving");
    flash.addEventListener("transitionend", function () {
      flash.remove();
    });
    // transitionend never fires under prefers-reduced-motion, so back it up
    setTimeout(function () {
      flash.remove();
    }, 600);
  }

  document.addEventListener("click", function (event) {
    if (!(event.target instanceof Element)) return;
    var close = event.target.closest("[data-flash-close]");
    if (close) dismiss(close.closest(".flash"));
  });

  document.querySelectorAll("[data-autoclose]").forEach(function (flash) {
    setTimeout(function () {
      dismiss(flash);
    }, 6000);
  });

  // 2. Submit state. A label physically prints on submit, so the button says
  //    so — and locks, because a double tap at the booth means two labels and
  //    a duplicate lead.
  document.querySelectorAll("form").forEach(function (form) {
    form.addEventListener("submit", function () {
      // The browser blocks submit when a required field is empty; don't lock
      // the button in that case or the form becomes unsubmittable.
      if (form.checkValidity && !form.checkValidity()) return;

      var button = form.querySelector('button[type="submit"]');
      if (!button || button.disabled) return;

      var busyLabel = button.getAttribute("data-busy-label");
      if (busyLabel) button.textContent = busyLabel;
      button.classList.add("is-busy");

      // Disabling immediately drops the button from the submitted payload in
      // some browsers, so defer past the current event loop turn.
      setTimeout(function () {
        button.disabled = true;
      }, 0);
    });
  });
})();
