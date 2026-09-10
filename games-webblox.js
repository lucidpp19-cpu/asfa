(() => {
  const body = document.body;
  body.classList.add("home-page", "games-webblox-page");

  // Keep the captured navbar present, but make its unavailable destinations
  // behave exactly like the matching home page.
  // Only process the real top navigation. The mobile sidebar is injected
  // inside the navbar wrapper too, but its Home item must stay active and
  // must keep the same state as Home's sidebar.
  document.querySelectorAll(".navbar-wrapper-main nav a, .footer-0-2-75 a").forEach((link) => {
    if (link.textContent.trim() === "Discover") {
      link.href = "/games-webblox.html";
      link.removeAttribute("data-savepage-href");
      link.classList.remove("home-disabled-link");
      return;
    }
    link.classList.add("home-disabled-link");
    link.removeAttribute("href");
    link.removeAttribute("data-savepage-href");
  });

  const footerMessage = document.querySelector(".footer-0-2-75 .disclaimer-0-2-80 p");
  if (footerMessage) footerMessage.textContent = "THANK YOU SO MUCH FOR PLAYING WEBBLOX";

  document.querySelectorAll(".robuxText-0-2-102, .robuxText-0-2-106").forEach((element) => {
    element.title = "0";
    const value = element.querySelector("span");
    if (value) value.textContent = "0";
  });
  document.querySelectorAll(".linkContainerCol-0-2-101 p[title], .linkContainerCol-0-2-105 p[title]").forEach((element) => {
    if (element.querySelector(".icon-nav-robux")) element.title = "0";
  });

  document.querySelectorAll(
    ".gameCard-0-2-122[aria-label='Baseplate'] img.img-0-2-119"
  ).forEach((image) => {
    image.src = "/uploads/image-19.png";
    image.alt = "Baseplate";
    image.removeAttribute("data-savepage-src");
  });

  document.querySelectorAll(".container_container__Ufhp_, .chatMenu_chatMenu__3SjMs").forEach((element) => {
    element.remove();
  });

  const cardLinks = [...document.querySelectorAll(
    ".gameCard-0-2-122[aria-label='Baseplate'], .gameCard-0-2-122"
  )].filter((link) => link.querySelector(".label-0-2-114")?.textContent.trim() === "Baseplate");

  const detailsFrame = document.createElement("iframe");
  detailsFrame.id = "games-details-frame";
  detailsFrame.title = "Baseplate details";
  detailsFrame.hidden = true;
  detailsFrame.setAttribute("aria-hidden", "true");
  detailsFrame.src = "about:blank";

  const gameFrame = document.createElement("iframe");
  gameFrame.id = "games-game-frame";
  gameFrame.title = "Baseplate game";
  gameFrame.hidden = true;
  gameFrame.setAttribute("aria-hidden", "true");
  gameFrame.allow = "fullscreen; autoplay; gamepad";
  // Do not boot Three.js/WebsimSocket while the iframe is display:none. A
  // zero-sized renderer can poison the game runtime before the real Join.
  gameFrame.src = "about:blank";

  document.body.append(detailsFrame, gameFrame);

  const gameContext = () => {
    const image = cardLinks[0]?.querySelector("img.img-0-2-119");
    return {
      type: "webblox:game-context",
      title: "Baseplate",
      creator: "by hardcore",
      iconUrl: image?.currentSrc || image?.src || "/uploads/image-19.png",
    };
  };

  const sendGameContext = () => {
    gameFrame.contentWindow?.postMessage(gameContext(), "*");
  };

  const freshGameUrl = () => {
    const url = new URL("game.html", window.location.href);
    url.searchParams.set("session", `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    return `${url.pathname}${url.search}`;
  };

  const enterGame = () => {
    document.body.classList.add("games-open", "games-playing");
    detailsFrame.hidden = true;
    detailsFrame.setAttribute("aria-hidden", "true");
    gameFrame.hidden = false;
    gameFrame.setAttribute("aria-hidden", "false");
    if (gameFrame.getAttribute("src") === "about:blank") {
      // The load handler will send the enter message after the new document
      // has initialized at its real iframe size.
      gameFrame.setAttribute("src", freshGameUrl());
      return;
    }
    const context = gameContext();
    gameFrame.contentWindow?.postMessage(context, "*");
    gameFrame.contentWindow?.postMessage({ ...context, type: "webblox:enter-game" }, "*");
    gameFrame.focus();
  };

  const openDetails = (event) => {
    event.preventDefault();
    event.stopPropagation();
    document.body.classList.add("games-open");
    document.body.classList.remove("games-playing");
    detailsFrame.hidden = false;
    detailsFrame.setAttribute("aria-hidden", "false");
    gameFrame.hidden = true;
    gameFrame.setAttribute("aria-hidden", "true");
    if (detailsFrame.getAttribute("src") === "about:blank") {
      detailsFrame.src = "uploads/gametemplate.html";
    }
    detailsFrame.focus();
  };

  cardLinks.forEach((link) => {
    // The archived markup points at the details document as a fallback. Keep
    // that fallback in-page so a slow script load cannot escape the iframe
    // launcher before the click handler is attached.
    link.href = "#baseplate";
    link.addEventListener("click", openDetails);
  });

  detailsFrame.addEventListener("load", () => {
    detailsFrame.contentWindow?.postMessage(gameContext(), "*");
  });

  gameFrame.addEventListener("load", () => {
    if (gameFrame.getAttribute("src") === "about:blank") return;
    sendGameContext();
    gameFrame.contentWindow?.postMessage({ type: "webblox:home-ready" }, "*");
    if (document.body.classList.contains("games-playing")) enterGame();
  });

  window.addEventListener("message", (event) => {
    if (event.source === detailsFrame.contentWindow && event.data?.type === "webblox:join-game") {
      enterGame();
      detailsFrame.contentWindow?.postMessage({ type: "webblox:join-ack" }, "*");
      return;
    }

    if (event.source === gameFrame.contentWindow && event.data?.type === "webblox:restart-game") {
      document.body.classList.add("games-open", "games-playing");
      detailsFrame.hidden = true;
      detailsFrame.setAttribute("aria-hidden", "true");
      gameFrame.hidden = false;
      gameFrame.setAttribute("aria-hidden", "false");
      gameFrame.setAttribute("src", freshGameUrl());
      return;
    }

    if (event.source !== gameFrame.contentWindow || event.data?.type !== "webblox:leave-game") return;
    document.body.classList.remove("games-open", "games-playing");
    gameFrame.hidden = true;
    gameFrame.setAttribute("aria-hidden", "true");
    detailsFrame.hidden = true;
    detailsFrame.setAttribute("aria-hidden", "true");
    gameFrame.contentWindow?.postMessage({ type: "webblox:home-ready" }, "*");
    // Dispose the running document completely. The next Join creates a
    // visible, fresh game runtime instead of reviving a hidden socket.
    gameFrame.setAttribute("src", "about:blank");
  });
})();
