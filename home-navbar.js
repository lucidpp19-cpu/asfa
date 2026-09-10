(() => {
  const SIDEBAR_CLASS = "home-mobile-sidebar";
  const NAV_SELECTOR = ".navbar-wrapper-main nav";

  const normalizeAnnouncement = (doc) => {
    doc.querySelectorAll(".alertText-0-2-39").forEach((announcement) => {
    let link = announcement.querySelector(".alertLink-0-2-40, .alertLink-d2-0-2-44");
    if (!link) {
      link = document.createElement("a");
      link.className = "alertLink-0-2-40 alertLink-d2-0-2-44";
      announcement.textContent = "";
      announcement.appendChild(link);
    }
    link.textContent = "We have a server now! Click me to join it.";
    link.href = "https://discord.gg/fksKkFvmgU";
    link.target = "_blank";
    link.rel = "noopener";
  });
  };

  const activateDiscover = (doc) => {
    doc.querySelectorAll(".navbar-wrapper-main a").forEach((link) => {
      if (link.textContent.trim() !== "Discover") return;
      link.href = "/games-webblox.html";
      link.removeAttribute("data-savepage-href");
      link.classList.remove("home-disabled-link");
      link.setAttribute("aria-label", "Discover");
    });
  };

  const normalizeBaseplateIcon = (doc) => {
    // Home was captured with the old placeholder image, while Discover uses
    // the actual Baseplate icon. Keep both cards backed by the same asset so
    // the game context and the visible thumbnail cannot diverge.
    doc.querySelectorAll(
      ".gameCard-0-2-136 img.img-0-2-133, .gameCard-0-2-122[aria-label='Baseplate'] img.img-0-2-119"
    ).forEach((image) => {
      image.src = "/uploads/image-19.png";
      image.alt = "Baseplate";
      image.removeAttribute("data-savepage-src");
    });
  };

  const updateBaseplateStats = (doc, playerCount) => {
    doc.querySelectorAll(
      ".gameCard-0-2-136, .gameCard-0-2-122[aria-label='Baseplate']"
    ).forEach((card) => {
      const infoItems = card.querySelectorAll(".infoItem-0-2-130, .infoItem-0-2-116");
      const rating = infoItems[0]?.querySelector("span:last-child");
      const players = infoItems[1]?.querySelector("span:last-child");
      if (rating) rating.textContent = "100%";
      if (players) players.textContent = String(playerCount);
    });
  };

  const updateRobux = (doc, amount) => {
    doc.querySelectorAll(".robuxText-0-2-106, .robuxText-0-2-102").forEach((element) => {
      element.title = String(amount);
      const value = element.querySelector("span");
      if (value) value.textContent = String(amount);
    });
    doc.querySelectorAll(".linkContainerCol-0-2-105 p[title], .linkContainerCol-0-2-101 p[title]").forEach((element) => {
      if (element.querySelector(".icon-nav-robux")) element.title = String(amount);
    });
  };

  const ensureHomeAdSlot = (doc) => {
    const row = doc.querySelector(".container-0-2-47 > .row");
    const mainBody = row?.querySelector(":scope > .mainBody-0-2-58");
    if (!row || !mainBody) return;

    const currentRails = [...row.querySelectorAll(":scope > .home-ad-column")];
    if (currentRails.length === 2) return;
    currentRails.forEach((rail) => rail.remove());

    const createAdColumn = () => {
      const column = doc.createElement("div");
      column.className = "d-none d-lg-flex col-2 adColumn-0-2-52 home-ad-column";
      column.setAttribute("aria-hidden", "true");
      column.innerHTML = '<div class="row"><div class="col-12"><div class="adWrapper-0-2-85 home-ad-placeholder" aria-hidden="true"></div></div></div>';
      return column;
    };

    // Match the original Home grid: one centered ad rail on each side of the
    // col-lg-8 content area. Both rails stay empty while preserving spacing.
    const leftRail = createAdColumn();
    const rightRail = createAdColumn();
    row.insertBefore(leftRail, mainBody);
    row.insertBefore(rightRail, mainBody.nextElementSibling);
  };

  const sidebarCardMarkup = () => `
    <div class="card-0-2-89 card-d0-0-2-96">
      <p class="username-0-2-93 username-d2-0-2-98"></p>
      <div class="divider-0-2-94 divider-d3-0-2-99"></div>
      <a href="/home-webblox.html" class="link-0-2-163 link-d1-0-2-168">
        <div class="wrapper-0-2-162 hover-icon-nav-home"><p class="linkEntry-0-2-160"><span class="icon-nav-home"></span> <span class="name-0-2-161 name-d0-0-2-167">Home</span></p></div>
      </a>
      <a class="link-0-2-163 link-d4-0-2-171 home-disabled-link">
        <div class="wrapper-0-2-162 hover-icon-nav-profile"><p class="linkEntry-0-2-160"><span class="icon-nav-profile"></span> <span class="name-0-2-161 name-d3-0-2-170">Profile</span></p></div>
      </a>
      <a class="link-0-2-163 link-d7-0-2-174 home-disabled-link">
        <div class="wrapper-0-2-162 hover-icon-nav-message"><p class="linkEntry-0-2-160"><span class="icon-nav-message"></span> <span class="name-0-2-161 name-d6-0-2-173">Messages</span></p></div>
      </a>
      <a class="link-0-2-163 link-d10-0-2-177 home-disabled-link">
        <div class="wrapper-0-2-162 hover-icon-nav-friends"><p class="linkEntry-0-2-160"><span class="icon-nav-friends"></span> <span class="name-0-2-161 name-d9-0-2-176">Friends</span></p></div>
      </a>
      <a class="link-0-2-163 link-d13-0-2-180 home-disabled-link">
        <div class="wrapper-0-2-162 hover-icon-nav-charactercustomizer"><p class="linkEntry-0-2-160"><span class="icon-nav-charactercustomizer"></span> <span class="name-0-2-161 name-d12-0-2-179">Avatar</span></p></div>
      </a>
      <a class="link-0-2-163 link-d16-0-2-183 home-disabled-link">
        <div class="wrapper-0-2-162 hover-icon-nav-inventory"><p class="linkEntry-0-2-160"><span class="icon-nav-inventory"></span> <span class="name-0-2-161 name-d15-0-2-182">Inventory</span></p></div>
      </a>
      <a class="link-0-2-163 link-d19-0-2-186 home-disabled-link">
        <div class="wrapper-0-2-162 hover-icon-nav-trade"><p class="linkEntry-0-2-160"><span class="icon-nav-trade"></span> <span class="name-0-2-161 name-d18-0-2-185">Trade</span></p></div>
      </a>
      <a class="link-0-2-163 link-d22-0-2-189 home-disabled-link">
        <div class="wrapper-0-2-162 hover-icon-nav-group"><p class="linkEntry-0-2-160"><span class="icon-nav-group"></span> <span class="name-0-2-161 name-d21-0-2-188">Groups</span></p></div>
      </a>
      <a class="home-disabled-link"><p class="upgradeNowButton-0-2-95 upgradeNowButton-d4-0-2-100">Promocodes</p></a>
    </div>`;

  const sidebarMarkup = () => `
    <div class="container-0-2-88 home-mobile-sidebar" hidden aria-hidden="true">${sidebarCardMarkup()}</div>`;

  const setUsername = (doc, username) => {
    doc.querySelectorAll(`.${SIDEBAR_CLASS} .username-0-2-93`).forEach((element) => {
      element.textContent = username;
    });

    doc.querySelectorAll(".mainBody-0-2-58 .helloMessage-0-2-50 span").forEach((element) => {
      element.textContent = username;
    });

    doc.querySelectorAll(".mainBody-0-2-58 .image-0-2-87").forEach((image) => {
      image.alt = username;
      if (username) {
        image.src = `https://images.websim.com/avatar/${encodeURIComponent(username)}`;
        image.removeAttribute("data-savepage-src");
      }
    });
  };

  const updateSidebarPosition = (doc, nav) => {
    const bottom = Math.max(0, Math.ceil(nav.getBoundingClientRect().bottom));
    doc.documentElement.style.setProperty("--home-navbar-height", `${bottom}px`);
    doc.querySelectorAll(`.${SIDEBAR_CLASS}`).forEach((sidebar) => {
      sidebar.style.setProperty("top", `${bottom}px`, "important");
    });
  };

  const bindDocument = (doc) => {
    if (!doc?.documentElement) return;
    normalizeAnnouncement(doc);
    activateDiscover(doc);
    normalizeBaseplateIcon(doc);
    ensureHomeAdSlot(doc);
    const nav = doc.querySelector(NAV_SELECTOR);
    const wrapper = doc.querySelector(".navbar-wrapper-main");
    const menuButton = wrapper?.querySelector(".openSideNavMobile-0-2-15");
    if (!nav || !wrapper || !menuButton) return;

    let sidebar = wrapper.querySelector(`.${SIDEBAR_CLASS}`);
    if (!sidebar) {
      wrapper.insertAdjacentHTML("beforeend", sidebarMarkup());
      sidebar = wrapper.querySelector(`.${SIDEBAR_CLASS}`);
    }
    sidebar.innerHTML = sidebarCardMarkup();
    sidebar.id = sidebar.id || "home-mobile-sidebar";

    const existingToggle = menuButton.getAttribute("aria-expanded") !== null
      && menuButton.getAttribute("aria-controls") === sidebar.id;

    if (!menuButton.dataset.sidebarBound && !existingToggle) {
      menuButton.dataset.sidebarBound = "true";
      menuButton.setAttribute("role", "button");
      menuButton.setAttribute("tabindex", "0");
      menuButton.setAttribute("aria-controls", sidebar.id);
      menuButton.setAttribute("aria-expanded", "false");

      const toggle = () => {
        const open = sidebar.hidden;
        sidebar.hidden = !open;
        sidebar.setAttribute("aria-hidden", String(!open));
        menuButton.setAttribute("aria-expanded", String(open));
        updateSidebarPosition(doc, nav);
      };

      menuButton.addEventListener("click", toggle);
      menuButton.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      });
    }

    updateSidebarPosition(doc, nav);
    if (typeof ResizeObserver !== "undefined" && !nav.dataset.sidebarResizeBound) {
      nav.dataset.sidebarResizeBound = "true";
      new ResizeObserver(() => updateSidebarPosition(doc, nav)).observe(nav);
    }

    if (!wrapper.dataset.sidebarMutationBound) {
      wrapper.dataset.sidebarMutationBound = "true";
      new MutationObserver(() => updateSidebarPosition(doc, nav)).observe(wrapper, { childList: true, subtree: true });
    }

    if (!doc.defaultView?.__homeNavbarResizeBound) {
      doc.defaultView.__homeNavbarResizeBound = true;
      doc.defaultView.addEventListener("resize", () => updateSidebarPosition(doc, nav));
    }
  };

  const bindDetailsFrame = () => {
    const frame = document.getElementById("game-details-frame");
    if (!frame) return;
    frame.addEventListener("load", () => {
      bindDocument(frame.contentDocument);
      if (loadedUsername !== null && frame.contentDocument) setUsername(frame.contentDocument, loadedUsername);
    });
    if (frame.contentDocument?.querySelector(NAV_SELECTOR)) bindDocument(frame.contentDocument);
  };

  let loadedUsername = null;
  let currentPlayerCount = 0;
  bindDocument(document);
  bindDetailsFrame();
  setUsername(document, "");
  updateBaseplateStats(document, currentPlayerCount);

  const refreshGameStats = async () => {
    try {
      const response = await fetch("/api/game-stats", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      currentPlayerCount = Number.isFinite(Number(data?.players)) ? Math.max(0, Number(data.players)) : 0;
    } catch {
      currentPlayerCount = 0;
    }
    updateBaseplateStats(document, currentPlayerCount);
    const detailsFrame = document.getElementById("game-details-frame");
    if (detailsFrame?.contentDocument) updateBaseplateStats(detailsFrame.contentDocument, currentPlayerCount);
  };

  updateRobux(document, 0);
  const statsTimer = window.setInterval(refreshGameStats, 5000);
  refreshGameStats();

  Promise.resolve(window.websim?.getUser?.()).then((user) => {
    const username = String(user?.username || "").trim();
    loadedUsername = username;
    setUsername(document, username);
    const frame = document.getElementById("game-details-frame");
    if (frame?.contentDocument) setUsername(frame.contentDocument, username);
  }).catch(() => {});
})();
