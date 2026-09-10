(() => {
  const faviconHref = "/upload/coloredlogo.png.png";
  document.querySelectorAll('link[rel~="icon"]').forEach((link) => link.remove());

  const favicon = document.createElement("link");
  favicon.rel = "icon";
  favicon.type = "image/png";
  favicon.href = faviconHref;
  document.head.append(favicon);
})();
