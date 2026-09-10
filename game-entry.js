(() => {
  let parentAckTimer = null;
  let joinRequestAttempts = 0;

  const stopJoinRetry = () => {
    if (parentAckTimer) window.clearTimeout(parentAckTimer);
    parentAckTimer = null;
    joinRequestAttempts = 0;
  };

  const activateDiscoverNavigation = () => {
    document.querySelectorAll(".navbar-wrapper-main a").forEach((link) => {
      if (link.textContent.trim() !== "Discover") return;
      link.href = "/games-webblox.html";
      link.removeAttribute("data-savepage-href");
      link.classList.remove("home-disabled-link");
      link.classList.add("webblox-discover-link");
      link.setAttribute("aria-label", "Discover");
      if (link.dataset.webbloxDiscoverBound) return;
      link.dataset.webbloxDiscoverBound = "true";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const target = window.top === window ? window : window.top;
        target.location.href = "/games-webblox.html";
      });
    });
  };

  const directJoin = () => {
    // Always enter through a fresh game-frame session. Without a cache-buster,
    // returning from Discover can restore the previous page/socket state and
    // the game immediately shows Error Code 277 again.
    const destination = new URL("../index.html", window.location.href);
    destination.searchParams.set("autojoin", "1");
    destination.searchParams.set("session", `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const target = window.top === window ? window : window.top;
    target.location.replace(destination.href);
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.data?.type !== "webblox:join-ack") return;
    stopJoinRetry();
  });

  const bindJoinButton = () => {
    activateDiscoverNavigation();
    // The archived template uses a generated class. Keep semantic fallbacks
    // so a refreshed copy of the template does not silently lose Join.
    const joinButton = document.querySelector(
      ".newBuyButton-0-2-143, button[aria-label='Join'], button[title='Join'], button[class*='newBuyButton']"
    );
    if (!joinButton || joinButton.dataset.webbloxJoinBound) return Boolean(joinButton);

    joinButton.dataset.webbloxJoinBound = "true";
    joinButton.type = "button";
    joinButton.classList.add("webblox-join-button");
    joinButton.setAttribute("aria-label", "Join");
    joinButton.title = "Join";
    joinButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (window.top !== window) {
        const requestJoin = () => {
          if (joinRequestAttempts >= 8) {
            stopJoinRetry();
            return;
          }
          joinRequestAttempts += 1;
          window.parent.postMessage({ type: "webblox:join-game" }, "*");
          parentAckTimer = window.setTimeout(requestJoin, 250);
        };
        stopJoinRetry();
        requestJoin();
        return;
      }
      directJoin();
    });
    return true;
  };

  if (!bindJoinButton()) {
    document.addEventListener("DOMContentLoaded", bindJoinButton, { once: true });
  }
})();
