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

  // 2. Validation feedback and submit state.

  function fieldOf(control) {
    return control.closest ? control.closest(".field") : null;
  }

  function showError(control, message) {
    var field = fieldOf(control);
    if (!field) return;
    field.classList.add("field--invalid");
    // Reuse the server-rendered <p> when there is one, so a client-side error
    // and a WTForms error look and behave identically.
    var note = field.querySelector(".field__error");
    if (!note) {
      note = document.createElement("p");
      note.className = "field__error";
      note.id = control.id + "__error";
      field.appendChild(note);
    }
    note.textContent = message;
    control.setAttribute("aria-invalid", "true");
    control.setAttribute("aria-describedby", note.id);
  }

  function clearError(control) {
    var field = fieldOf(control);
    if (!field || !field.classList.contains("field--invalid")) return;
    field.classList.remove("field--invalid");
    var note = field.querySelector(".field__error");
    if (note) note.remove();
    control.removeAttribute("aria-invalid");
    control.removeAttribute("aria-describedby");
  }

  document.querySelectorAll("form").forEach(function (form) {
    var button = form.querySelector('button[type="submit"]');
    var idleLabel = button ? button.textContent : "";
    var submitting = false;
    var pendingFocus = null;

    // Firefox for Android does not render the native validation bubble. With
    // a required field empty it blocks the submit and shows nothing at all —
    // no message, no request — so the button simply looks dead. Report the
    // problem ourselves and every browser behaves the same way.
    //
    // `invalid` does not bubble, so the capture phase is the only way to see
    // it from the form. Cancelling it suppresses the UA's own bubble on the
    // browsers that have one, leaving exactly one error message on screen.
    form.addEventListener(
      "invalid",
      function (event) {
        event.preventDefault();
        var control = event.target;
        showError(control, control.validationMessage);

        // `invalid` fires per control in document order, so the first one
        // through is the field to send them to.
        if (pendingFocus) return;
        pendingFocus = control;
        setTimeout(function () {
          pendingFocus.focus({ preventScroll: true });
          // block:center keeps the field clear of the sticky action bar
          pendingFocus.scrollIntoView({ block: "center", behavior: "smooth" });
          pendingFocus = null;
        }, 0);
      },
      true
    );

    function onEdit(event) {
      var control = event.target;
      if (control.willValidate && control.checkValidity()) clearError(control);
    }
    form.addEventListener("input", onEdit);
    form.addEventListener("change", onEdit);

    // Only fires once constraint validation has passed.
    form.addEventListener("submit", function (event) {
      if (submitting) {
        event.preventDefault(); // second tap while the first is in flight
        return;
      }
      submitting = true;
      if (!button) return;

      var busy = button.getAttribute("data-busy-label");
      if (busy) button.textContent = busy;
      button.classList.add("is-busy");
      // Deliberately not `button.disabled = true`: a disabled submit button is
      // dropped from the payload, and disabling one mid-submission has a long
      // history of aborting the navigation outright. The `submitting` flag is
      // what stops the double tap; this only says so on screen.
      button.setAttribute("aria-disabled", "true");
    });

    // Back button restores from bfcache with the button still reading
    // "Printing…" and the guard still latched. Reset both.
    window.addEventListener("pageshow", function (event) {
      if (!event.persisted) return;
      submitting = false;
      if (!button) return;
      button.textContent = idleLabel;
      button.classList.remove("is-busy");
      button.removeAttribute("aria-disabled");
    });
  });
})();
