(function () {
  // Embeddable booking widget loader - see EmbedSnippet.tsx for the generated
  // <script> tag this file expects (a data-tenant attribute, loaded with
  // `defer` so document.currentScript is still the right element when this
  // runs). Injects an iframe pointing at the hosted /book/[tenantSlug] page
  // and resizes it to fit using postMessage (see BookingPage.tsx's
  // ResizeObserver effect, which posts "shiftup-booking-resize").
  var script = document.currentScript;
  if (!script) return;

  var tenant = script.getAttribute("data-tenant");
  if (!tenant) return;

  var origin = new URL(script.src, window.location.href).origin;

  var iframe = document.createElement("iframe");
  iframe.src = origin + "/book/" + encodeURIComponent(tenant) + "?embed=1";
  iframe.title = "Book an appointment";
  iframe.style.width = "100%";
  iframe.style.border = "none";
  iframe.style.minHeight = "420px";
  iframe.setAttribute("scrolling", "no");

  script.parentNode.insertBefore(iframe, script.nextSibling);

  window.addEventListener("message", function (event) {
    if (event.origin !== origin || event.source !== iframe.contentWindow) return;
    var data = event.data;
    if (data && data.type === "shiftup-booking-resize" && typeof data.height === "number") {
      iframe.style.height = data.height + "px";
    }
  });
})();
