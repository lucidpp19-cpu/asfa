(() => {
  const HOTBAR_SLOTS = 10;
  const STORAGE_KEY = "webblox_backpack_v1";
  const DEFAULT_FONT_SIZE = 14;
  const BURGER_ITEM = {
    id: "cheezburger",
    name: "Cheezburger",
    tooltip: "Eat to recover 1.6 health",
    shortName: "Cheezburger",
    animation: "ToolAnim",
    icon: "uploads/Cheezburger.webp",
  };

  const root = document.getElementById("backpack-ui");
  const hotbar = document.getElementById("backpack-hotbar");
  const inventory = document.getElementById("backpack-inventory");
  const grid = document.getElementById("backpack-grid");
  const openButton = document.getElementById("backpack-open");
  const closeButton = document.getElementById("backpack-close");
  const search = document.getElementById("backpack-search");
  const fontSizeInput = document.getElementById("backpack-font-size");
  const fontSizeOutput = document.getElementById("backpack-font-size-value");
  if (!root || !hotbar || !inventory || !grid || !openButton) return;

  const state = {
    username: "guest",
    open: false,
    equippedId: null,
    hotbar: Array(HOTBAR_SLOTS).fill(null),
    inventory: [],
    counts: {},
    draggingId: null,
    draggingArea: null,
    fontSize: DEFAULT_FONT_SIZE,
  };

  function readSavedLayout() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || typeof saved !== "object") return;
      if (Array.isArray(saved.hotbar) && saved.hotbar.length === HOTBAR_SLOTS) state.hotbar = saved.hotbar;
      if (Array.isArray(saved.inventory)) state.inventory = saved.inventory;
      if (typeof saved.equippedId === "string") state.equippedId = saved.equippedId;
      if (saved.counts && typeof saved.counts === "object") state.counts = saved.counts;
    } catch {
      // Storage is optional; the current session still has a working backpack.
    }
  }

  function saveLayout() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        hotbar: state.hotbar,
        inventory: state.inventory,
        equippedId: state.equippedId,
        counts: state.counts,
      }));
    } catch {
      // Ignore private-mode storage errors.
    }
  }

  function itemById(id) {
    if (!id) return null;
    return id === BURGER_ITEM.id ? BURGER_ITEM : null;
  }

  function countOf(id) {
    if (!id) return 0;
    if (state.counts[id] != null) return Math.max(0, Number(state.counts[id]) || 0);
    // A slot present without an explicit count is a legacy single item.
    return (state.hotbar.includes(id) || state.inventory.includes(id)) ? 1 : 0;
  }

  function hasItem(id) {
    return Boolean(id) && countOf(id) > 0;
  }

  function emitEquipChange() {
    const item = itemById(state.equippedId);
    window.dispatchEvent(new CustomEvent("webblox:tool-equipped", {
      detail: { item, equipped: Boolean(item), itemId: item?.id || null },
    }));
  }

  function removeItem(id) {
    if (!itemById(id) || !hasItem(id)) return false;
    const n = countOf(id);
    if (n <= 1) {
      delete state.counts[id];
      state.hotbar = state.hotbar.map((slotId) => (slotId === id ? null : slotId));
      state.inventory = state.inventory.filter((slotId) => slotId !== id);
      if (state.equippedId === id) {
        state.equippedId = null;
        emitEquipChange();
      }
    } else {
      state.counts[id] = n - 1;
    }
    saveLayout();
    render();
    return true;
  }

  function addItem(id) {
    if (!itemById(id)) return false;
    const n = countOf(id);
    state.counts[id] = n + 1;
    if (n === 0) {
      const emptyHotbar = state.hotbar.indexOf(null);
      if (emptyHotbar >= 0) state.hotbar[emptyHotbar] = id;
      else state.inventory.push(id);
    }
    saveLayout();
    render();
    return true;
  }

  function equip(id) {
    if (!itemById(id)) return;
    state.equippedId = state.equippedId === id ? null : id;
    saveLayout();
    render();
    emitEquipChange();
  }

  function setFontSize(value) {
    state.fontSize = Math.max(10, Math.min(24, Number(value) || DEFAULT_FONT_SIZE));
    root.style.setProperty("--backpack-font-size", `${state.fontSize}px`);
    if (fontSizeInput && fontSizeInput.value !== String(state.fontSize)) fontSizeInput.value = String(state.fontSize);
    if (fontSizeOutput) fontSizeOutput.textContent = String(state.fontSize);
  }

  function setOpen(open) {
    state.open = Boolean(open);
    inventory.hidden = !state.open;
    openButton.hidden = state.open;
    openButton.setAttribute("aria-expanded", String(state.open));
    render();
  }

  function closeWhenClickingOutside(event) {
    if (!state.open) return;
    const target = event.target;
    if (inventory.contains(target) || hotbar.contains(target) || openButton.contains(target)) return;
    setOpen(false);
  }

  function createSlot(item, area, slotIndex, showNumber = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "backpack-slot";
    button.dataset.area = area;
    button.dataset.slotIndex = String(slotIndex);
    button.draggable = Boolean(item);
    if (!item) {
      button.classList.add("is-empty");
      button.setAttribute("aria-label", "Empty slot");
    } else {
      button.classList.toggle("is-equipped", state.equippedId === item.id);
      button.setAttribute("aria-label", state.equippedId === item.id ? "Equipped item" : "Item");
      const icon = document.createElement("img");
      icon.src = item.icon;
      icon.alt = "";
      icon.draggable = false;
      button.append(icon);
      const itemCount = countOf(item.id);
      if (itemCount > 1) {
        const badge = document.createElement("span");
        badge.className = "backpack-slot-count";
        badge.textContent = String(itemCount);
        button.append(badge);
      }
      button.addEventListener("click", () => equip(item.id));
      button.addEventListener("dragstart", (event) => {
        state.draggingId = item.id;
        state.draggingArea = area;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
        button.classList.add("is-dragging");
      });
      button.addEventListener("dragend", () => {
        state.draggingId = null;
        state.draggingArea = null;
        button.classList.remove("is-dragging");
      });
    }
    if (showNumber) {
      const number = document.createElement("span");
      number.className = "backpack-slot-number";
      number.textContent = slotIndex === 9 ? "0" : String(slotIndex + 1);
      button.append(number);
    }
    button.addEventListener("dragover", (event) => {
      if (state.draggingId) {
        event.preventDefault();
        button.classList.add("is-drop-target");
      }
    });
    button.addEventListener("dragleave", () => button.classList.remove("is-drop-target"));
    button.addEventListener("drop", (event) => {
      event.preventDefault();
      button.classList.remove("is-drop-target");
      moveDraggedItem(area, slotIndex);
    });
    return button;
  }

  function moveDraggedItem(destinationArea, destinationIndex) {
    const id = state.draggingId;
    if (!id || !hasItem(id)) return;
    const sourceArea = state.draggingArea;
    const sourceIndex = sourceArea === "hotbar"
      ? state.hotbar.indexOf(id)
      : state.inventory.indexOf(id);
    if (sourceIndex < 0) return;
    const targetArray = destinationArea === "hotbar" ? state.hotbar : state.inventory;
    const sourceArray = sourceArea === "hotbar" ? state.hotbar : state.inventory;
    const targetIndex = destinationArea === "hotbar" ? destinationIndex : targetArray.length;
    if (sourceArray === targetArray && sourceIndex === targetIndex) return;
    sourceArray[sourceIndex] = targetArray[targetIndex] || null;
    if (sourceArray === targetArray) {
      targetArray[targetIndex] = id;
    } else {
      targetArray[targetIndex] = id;
      if (sourceArea === "hotbar" && sourceArray[sourceIndex] === null) {
        // Keep the fixed hotbar shape intact.
      } else if (sourceArea === "inventory") {
        sourceArray.splice(sourceIndex, 1);
      }
    }
    state.draggingId = null;
    state.draggingArea = null;
    if (sourceArea === "hotbar" && destinationArea === "inventory" && state.equippedId === id) {
      state.equippedId = null;
      emitEquipChange();
    }
    saveLayout();
    render();
  }

  function render() {
    const hasItems = state.hotbar.some(Boolean) || state.inventory.length > 0;
    root.hidden = !hasItems;
    if (!hasItems) return;
    root.classList.toggle("is-open", state.open);
    const mobileLayout = document.documentElement.classList.contains("is-mobile") || window.innerWidth <= 720;
    const visibleHotbarItems = state.hotbar.filter(Boolean).length;
    const hotbarColumns = state.open
      ? (mobileLayout ? 5 : HOTBAR_SLOTS)
      : Math.max(1, visibleHotbarItems);
    hotbar.style.setProperty("--backpack-hotbar-columns", String(hotbarColumns));
    hotbar.classList.toggle("is-open", state.open);
    hotbar.replaceChildren();
    for (let index = 0; index < HOTBAR_SLOTS; index += 1) {
      const item = itemById(state.hotbar[index]);
      if (state.open || item) hotbar.append(createSlot(item, "hotbar", index, true));
    }
    grid.replaceChildren();
    const query = String(search?.value || "").trim().toLowerCase();
    const inventoryCellCount = state.open ? state.inventory.length : 0;
    for (let index = 0; index < inventoryCellCount; index += 1) {
      const item = itemById(state.inventory[index]);
      const matchesSearch = item && (!query || `${item.name} ${item.tooltip}`.toLowerCase().includes(query));
      if (matchesSearch) grid.append(createSlot(item, "inventory", index));
    }
  }

  function setIdentity(username, grantedItems = null) {
    state.username = String(username || "guest").trim().toLowerCase();
    // The burger is a universal item now. The server grants it to every
    // connection, while the local inventory keeps the hotbar/gui consistent
    // even for guests.
    if (countOf(BURGER_ITEM.id) === 0) {
      state.counts[BURGER_ITEM.id] = 1;
      state.hotbar[0] = BURGER_ITEM.id;
    }
    saveLayout();
    render();
  }

  openButton.addEventListener("click", () => setOpen(true));
  closeButton?.addEventListener("click", () => setOpen(false));
  document.addEventListener("pointerdown", closeWhenClickingOutside);
  search?.addEventListener("input", render);
  grid.addEventListener("dragover", (event) => {
    if (state.draggingId) event.preventDefault();
  });
  grid.addEventListener("drop", (event) => {
    event.preventDefault();
    moveDraggedItem("inventory", state.inventory.length);
  });
  fontSizeInput?.addEventListener("input", (event) => setFontSize(event.target.value));
  window.addEventListener("resize", render);
  window.addEventListener("webblox:device-mode-changed", render);
  window.addEventListener("keydown", (event) => {
    if (event.target.matches?.("input, textarea, select, [contenteditable='true']")) return;
    if (event.code === "Backquote" || event.key === "`") {
      event.preventDefault();
      setOpen(!state.open);
      return;
    }
    if (event.code === "Escape" && state.open) {
      setOpen(false);
      return;
    }
    const keyIndex = event.code === "Digit0" ? 9 : event.code.startsWith("Digit") ? Number(event.code.slice(-1)) - 1 : -1;
    if (keyIndex >= 0 && keyIndex < HOTBAR_SLOTS) {
      const id = state.hotbar[keyIndex];
      if (id) equip(id);
    }
  });

  readSavedLayout();
  // The server grants the burger after the welcome packet. Never expose a
  // saved hardcore-only item during the anonymous connection phase.
  state.hotbar = state.hotbar.map((id) => id === BURGER_ITEM.id || id === "hardcore-test-tool" ? null : id);
  state.inventory = state.inventory.filter((id) => id !== BURGER_ITEM.id && id !== "hardcore-test-tool");
  if (state.equippedId === BURGER_ITEM.id || state.equippedId === "hardcore-test-tool") state.equippedId = null;
  // The counts must be reset too, or a saved non-zero count survives the slot
  // strip and setIdentity skips re-granting (count != 0), leaving the burger
  // with a count but no slot -> invisible. The welcome packet re-grants it.
  delete state.counts[BURGER_ITEM.id];
  delete state.counts["hardcore-test-tool"];
  setFontSize(fontSizeInput?.value || DEFAULT_FONT_SIZE);
  render();
  globalThis.WebbloxInventory = {
    setIdentity,
    setFontSize,
    getEquippedItem: () => itemById(state.equippedId),
    open: () => setOpen(true),
    close: () => setOpen(false),
    hasItem,
    removeItem,
    addItem,
  };
})();
