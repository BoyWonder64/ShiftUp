/**
 * ShiftUp public booking widget embed loader.
 *
 * Usage (see Settings > Booking Widget's embed snippet box):
 *   <script src="https://<your-domain>/booking-widget.js" data-tenant="<slug>" async></script>
 *
 * Finds its own <script> tag, injects a same-origin iframe pointed at
 * /book/<slug>?embed=1 in its place, and auto-resizes that iframe based on
 * postMessage height updates the embedded page sends (see
 * src/app/book/[tenantSlug]/BookingPage.tsx's ResizeObserver effect).
 */
(function () {
  var currentScript =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  var tenant = currentScript.getAttribute("data-tenant");
  if (!tenant) {
    console.error("[ShiftUp booking widget] missing data-tenant attribute on the embed <script> tag.");
    return;
  }

  // Same origin as this script file itself - the script is served from the
  // ShiftUp app, so its own src gives the app's real domain regardless of
  // what domain the embedding page is on.
  var origin = new URL(currentScript.src, window.location.href).origin;

  var iframe = document.createElement("iframe");
  iframe.src = origin + "/book/" + encodeURIComponent(tenant) + "?embed=1";
  iframe.style.width = "100%";
  iframe.style.border = "none";
  iframe.style.minHeight = "400px";
  iframe.setAttribute("title", "Book an appointment");

  currentScript.parentNode.insertBefore(iframe, currentScript.nextSibling);

  window.addEventListener("message", function (event) {
    if (event.source !== iframe.contentWindow) return;
    var data = event.data;
    if (data && data.type === "shiftup-booking-resize" && typeof data.height === "number") {
      iframe.style.height = data.height + "px";
    }
  });
})();
