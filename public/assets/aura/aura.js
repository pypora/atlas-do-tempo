/* AURA — interações para componentes web | Sem dependências */
(function () {
  "use strict";

  const initialized = new WeakMap();
  const toastTimers = new WeakMap();
  const progressTimers = new WeakMap();
  let themeInitialized = false;

  function currentTheme() {
    return document.documentElement.getAttribute("data-aura-theme") === "dark" ? "dark" : "light";
  }

  function syncThemeButtons(root) {
    const dark = currentTheme() === "dark";
    components(root || document, "[data-aura-theme-toggle]").forEach(function (button) {
      const label = dark ? "Modo claro" : "Modo escuro";
      button.setAttribute("aria-pressed", String(dark));
      button.setAttribute("aria-label", label);
      const text = button.querySelector("[data-aura-theme-label]");
      if (text) text.textContent = label;
    });
  }

  function syncThemeColors(root) {
    const styles = window.getComputedStyle(document.documentElement);
    components(root || document, "[data-aura-color-value]").forEach(function (element) {
      const value = styles.getPropertyValue(element.dataset.auraColorValue || "").trim();
      if (value) element.textContent = value.toUpperCase();
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    const canvas = styles.getPropertyValue("--aura-canvas").trim();
    if (meta && canvas) meta.setAttribute("content", canvas);
  }

  function applyTheme(theme, persist) {
    const previous = document.documentElement.getAttribute("data-aura-theme");
    document.documentElement.setAttribute("data-aura-theme", theme);
    if (persist) {
      try { window.localStorage.setItem("aura-theme", theme); } catch (error) { /* O tema funciona mesmo sem armazenamento. */ }
    }
    syncThemeButtons(document);
    syncThemeColors(document);
    if (persist || previous !== theme) {
      document.dispatchEvent(new CustomEvent("aura:themechange", { detail: { theme: theme }, bubbles: true }));
    }
    return theme;
  }

  function setTheme(theme) {
    if (theme !== "light" && theme !== "dark") return currentTheme();
    themeInitialized = true;
    return applyTheme(theme, true);
  }

  function initTheme() {
    if (themeInitialized) return;
    themeInitialized = true;
    let theme = currentTheme();
    try {
      const saved = window.localStorage.getItem("aura-theme");
      if (saved === "light" || saved === "dark") theme = saved;
    } catch (error) { /* Usa o tema declarado no documento quando o armazenamento está indisponível. */ }
    applyTheme(theme, false);
  }

  function initThemeToggle(button) {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      setTheme(currentTheme() === "dark" ? "light" : "dark");
    });
    syncThemeButtons(button);
  }

  function components(root, selector) {
    const elements = Array.from(root.querySelectorAll(selector));
    if (root instanceof Element && root.matches(selector)) elements.unshift(root);
    return elements;
  }

  function once(element, key, setup) {
    let keys = initialized.get(element);
    if (!keys) {
      keys = new Set();
      initialized.set(element, keys);
    }
    if (keys.has(key)) return;
    keys.add(key);
    setup(element);
  }

  function byId(element, value) {
    if (!value) return null;
    return element.ownerDocument.getElementById(value.replace(/^#/, ""));
  }

  function emitChange(input) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function initRange(input) {
    const update = function () {
      const min = input.min === "" ? 0 : Number(input.min);
      const max = input.max === "" ? 100 : Number(input.max);
      const value = Number(input.value);
      const percent = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
      input.style.setProperty("--range-percent", percent + "%");
      const output = byId(input, input.dataset.output);
      if (output) output.textContent = input.value + (input.dataset.suffix || "");
    };
    input.addEventListener("input", update);
    input.addEventListener("change", update);
    update();
  }

  function initTabs(group) {
    const tabs = function () {
      return Array.from(group.querySelectorAll('[role="tab"]')).filter(function (tab) {
        return tab.closest("[data-aura-tabs]") === group;
      });
    };
    const enabledTabs = function () {
      return tabs().filter(function (tab) {
        return !tab.disabled && tab.getAttribute("aria-disabled") !== "true";
      });
    };
    const select = function (selected, focus) {
      tabs().forEach(function (tab) {
        const active = tab === selected;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        const panel = byId(tab, tab.getAttribute("aria-controls"));
        if (panel) panel.hidden = !active;
      });
      if (selected && focus) selected.focus();
    };
    group.addEventListener("click", function (event) {
      const tab = event.target.closest('[role="tab"]');
      if (!tab || !enabledTabs().includes(tab)) return;
      event.preventDefault();
      select(tab, false);
    });
    group.addEventListener("keydown", function (event) {
      const tab = event.target.closest('[role="tab"]');
      const enabled = enabledTabs();
      const current = enabled.indexOf(tab);
      if (current < 0) return;
      const list = tab.closest('[role="tablist"]');
      const vertical = list && list.getAttribute("aria-orientation") === "vertical";
      const previousKey = vertical ? "ArrowUp" : "ArrowLeft";
      const nextKey = vertical ? "ArrowDown" : "ArrowRight";
      let next;
      if (event.key === previousKey) next = (current - 1 + enabled.length) % enabled.length;
      else if (event.key === nextKey) next = (current + 1) % enabled.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = enabled.length - 1;
      else return;
      event.preventDefault();
      select(enabled[next], true);
    });
    const enabled = enabledTabs();
    select(enabled.find(function (tab) { return tab.getAttribute("aria-selected") === "true"; }) || enabled[0], false);
  }

  function initStepper(group) {
    const input = group.querySelector('input[type="number"]');
    if (!input) return;
    const limits = function () {
      return {
        min: input.min === "" ? -Infinity : Number(input.min),
        max: input.max === "" ? Infinity : Number(input.max)
      };
    };
    const update = function () {
      const bounds = limits();
      group.querySelectorAll("[data-step]").forEach(function (button) {
        const atLimit = input.value !== "" && (button.dataset.step === "down" ? Number(input.value) <= bounds.min : Number(input.value) >= bounds.max);
        button.disabled = input.disabled || atLimit;
      });
    };
    group.addEventListener("click", function (event) {
      const button = event.target.closest("[data-step]");
      if (!button || button.closest("[data-aura-stepper]") !== group || button.disabled || input.disabled || input.readOnly) return;
      event.preventDefault();
      const direction = button.dataset.step === "down" ? -1 : 1;
      const previous = input.value;
      try {
        if (direction < 0) input.stepDown();
        else input.stepUp();
      } catch (error) {
        const bounds = limits();
        const step = Number(input.step) > 0 ? Number(input.step) : 1;
        const current = input.value === "" ? (Number.isFinite(bounds.min) ? bounds.min : 0) : Number(input.value);
        input.value = String(Math.min(bounds.max, Math.max(bounds.min, Number((current + direction * step).toFixed(12)))));
      }
      if (input.value !== previous) emitChange(input);
      update();
    });
    input.addEventListener("input", update);
    input.addEventListener("change", update);
    update();
  }

  function initCarousel(group) {
    const slides = function () {
      return Array.from(group.querySelectorAll("[data-slide]")).filter(function (slide) {
        return slide.closest("[data-aura-carousel]") === group;
      });
    };
    let index = Math.max(0, slides().findIndex(function (slide) { return !slide.hidden; }));
    const update = function () {
      const items = slides();
      if (!items.length) return;
      index = (index + items.length) % items.length;
      items.forEach(function (slide, position) { slide.hidden = position !== index; });
      const status = group.querySelector("[data-carousel-status]");
      if (status) status.textContent = "Slide " + (index + 1) + " de " + items.length;
      group.querySelectorAll("[data-carousel]").forEach(function (button) { button.disabled = items.length < 2; });
    };
    group.addEventListener("click", function (event) {
      const button = event.target.closest("[data-carousel]");
      if (!button || button.closest("[data-aura-carousel]") !== group || button.disabled) return;
      event.preventDefault();
      index += button.dataset.carousel === "prev" ? -1 : 1;
      update();
    });
    update();
  }

  function initPassword(button) {
    const input = byId(button, button.dataset.togglePassword);
    if (!input) return;
    const update = function () {
      const visible = input.type === "text";
      button.setAttribute("aria-pressed", String(visible));
      button.setAttribute("aria-label", visible ? "Ocultar senha" : "Mostrar senha");
    };
    button.addEventListener("click", function (event) {
      event.preventDefault();
      input.type = input.type === "password" ? "text" : "password";
      update();
    });
    update();
  }

  function initDialog(dialog) {
    dialog.addEventListener("click", function (event) {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (outside && dialog.open) dialog.close();
    });
  }

  function initMenu(menu) {
    const summary = Array.from(menu.children).find(function (child) { return child.tagName === "SUMMARY"; });
    menu.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || !menu.open) return;
      event.preventDefault();
      event.stopPropagation();
      menu.open = false;
      if (summary) summary.focus();
    });
    menu.addEventListener("click", function (event) {
      const action = event.target.closest('button, a[href], [data-menu-action]');
      if (!action || action.closest("details[data-aura-menu]") !== menu || (summary && summary.contains(action))) return;
      if (action.disabled || action.getAttribute("aria-disabled") === "true") return;
      menu.open = false;
    });
    once(menu.ownerDocument, "menu-outside", function (doc) {
      doc.addEventListener("click", function (event) {
        doc.querySelectorAll("details[data-aura-menu][open]").forEach(function (openMenu) {
          if (!openMenu.contains(event.target)) openMenu.open = false;
        });
      });
    });
  }

  function initSelection(group) {
    const header = group.querySelector("[data-select-all]");
    if (!header) return;
    const items = function () {
      return Array.from(group.querySelectorAll("input[data-select-item]:not(:disabled)")).filter(function (input) {
        return input.closest("[data-aura-selection]") === group;
      });
    };
    const update = function () {
      const selectable = items();
      const selected = selectable.filter(function (input) { return input.checked; }).length;
      header.checked = selectable.length > 0 && selected === selectable.length;
      header.indeterminate = selected > 0 && selected < selectable.length;
      header.disabled = selectable.length === 0;
    };
    group.addEventListener("change", function (event) {
      if (event.target === header) {
        const selected = header.checked;
        const selectable = items();
        selectable.forEach(function (input) { input.checked = selected; });
        selectable.forEach(function (input) { input.dispatchEvent(new Event("change", { bubbles: true })); });
        update();
      } else if (items().includes(event.target)) update();
    });
    update();
  }

  function initTooltip(wrapper) {
    if (!wrapper.querySelector('[role="tooltip"]')) return;
    let hovered = wrapper.matches(":hover");
    let focused = wrapper.contains(wrapper.ownerDocument.activeElement);
    const reset = function () {
      if (!hovered && !focused) wrapper.classList.remove("is-dismissed");
    };
    wrapper.addEventListener("mouseenter", function () { hovered = true; });
    wrapper.addEventListener("mouseleave", function () { hovered = false; reset(); });
    wrapper.addEventListener("focusin", function () { focused = true; });
    wrapper.addEventListener("focusout", function (event) {
      focused = !!event.relatedTarget && wrapper.contains(event.relatedTarget);
      reset();
    });
    once(wrapper.ownerDocument, "tooltip-escape", function (doc) {
      doc.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") return;
        doc.querySelectorAll("[data-aura-tooltip]").forEach(function (tooltip) {
          if (tooltip.matches(":hover") || tooltip.contains(doc.activeElement)) tooltip.classList.add("is-dismissed");
        });
      });
    });
  }

  function removeToast(toast) {
    const state = toastTimers.get(toast);
    if (state) clearTimeout(state.timer);
    toastTimers.delete(toast);
    toast.remove();
  }

  function pauseToast(toast, reason) {
    const state = toastTimers.get(toast);
    if (!state) return;
    state[reason] = true;
    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.remaining = Math.max(0, state.remaining - (performance.now() - state.startedAt));
      state.timer = null;
    }
  }

  function resumeToast(toast, reason) {
    const state = toastTimers.get(toast);
    if (!state) return;
    state[reason] = false;
    if (state.hovered || state.focused || state.timer !== null || !toast.isConnected) return;
    state.startedAt = performance.now();
    state.timer = setTimeout(function () { removeToast(toast); }, state.remaining);
  }

  function showToast(button) {
    const doc = button.ownerDocument;
    let region = doc.getElementById("aura-toast-region");
    if (!region) {
      region = doc.createElement("div");
      region.id = "aura-toast-region";
      region.className = "aura-toast-region";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      region.setAttribute("aria-atomic", "false");
      doc.body.append(region);
    }
    while (region.querySelectorAll(".aura-toast").length >= 3) removeToast(region.querySelector(".aura-toast"));
    const toast = doc.createElement("div");
    toast.className = "aura-toast";
    const message = doc.createElement("span");
    message.className = "aura-toast__message";
    message.textContent = button.dataset.toast || "Alterações salvas.";
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "aura-toast__close";
    close.setAttribute("aria-label", "Fechar notificação");
    close.textContent = "×";
    close.addEventListener("click", function () { removeToast(toast); });
    toast.append(message, close);
    region.append(toast);
    toastTimers.set(toast, { remaining: 6000, startedAt: 0, timer: null, hovered: false, focused: false });
    toast.addEventListener("mouseenter", function () { pauseToast(toast, "hovered"); });
    toast.addEventListener("mouseleave", function () { resumeToast(toast, "hovered"); });
    toast.addEventListener("focusin", function () { pauseToast(toast, "focused"); });
    toast.addEventListener("focusout", function (event) {
      if (!event.relatedTarget || !toast.contains(event.relatedTarget)) resumeToast(toast, "focused");
    });
    resumeToast(toast, "focused");
  }

  function initProgress(button) {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      const progress = byId(button, button.dataset.progressDemo);
      if (!progress) return;
      clearInterval(progressTimers.get(button));
      const output = byId(button, button.dataset.output);
      const max = progress.max > 0 ? progress.max : 100;
      const update = function () {
        const text = Math.round((progress.value / max) * 100) + "%";
        progress.textContent = text;
        if (output) output.textContent = text;
      };
      progress.value = 0;
      update();
      button.textContent = "Reiniciar simulação";
      const timer = setInterval(function () {
        if (!progress.isConnected || !button.isConnected) {
          clearInterval(timer);
          progressTimers.delete(button);
          return;
        }
        progress.value = Math.min(max, progress.value + max / 20);
        update();
        if (progress.value >= max - Number.EPSILON * max) {
          progress.value = max;
          update();
          clearInterval(timer);
          progressTimers.delete(button);
          button.textContent = "Repetir simulação";
        }
      }, 160);
      progressTimers.set(button, timer);
    });
  }

  function initPagination(group) {
    const pageButtons = function () {
      return Array.from(group.querySelectorAll("[data-page]")).filter(function (button) {
        return button.closest("[data-pagination]") === group && Number.isFinite(Number(button.dataset.page)) && button.dataset.page !== "";
      });
    };
    const first = pageButtons().find(function (button) { return button.getAttribute("aria-current") === "page"; }) || pageButtons()[0];
    let current = first ? Number(first.dataset.page) : 1;
    const update = function () {
      const buttons = pageButtons();
      const pages = buttons.map(function (button) { return Number(button.dataset.page); });
      buttons.forEach(function (button) {
        if (Number(button.dataset.page) === current) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      const previous = group.querySelector('[data-page="prev"]');
      const next = group.querySelector('[data-page="next"]');
      if (previous) previous.disabled = pages.indexOf(current) <= 0;
      if (next) next.disabled = pages.indexOf(current) >= pages.length - 1;
      const output = group.querySelector("[data-page-status]");
      if (output) output.textContent = "Página " + current + " de " + (pages.length ? Math.max.apply(null, pages) : 1);
    };
    group.addEventListener("click", function (event) {
      const button = event.target.closest("[data-page]");
      if (!button || button.closest("[data-pagination]") !== group || button.disabled) return;
      event.preventDefault();
      const pages = pageButtons().map(function (item) { return Number(item.dataset.page); });
      const index = pages.indexOf(current);
      if (button.dataset.page === "prev") current = pages[Math.max(0, index - 1)] || current;
      else if (button.dataset.page === "next") current = pages[Math.min(pages.length - 1, index + 1)] || current;
      else if (Number.isFinite(Number(button.dataset.page))) current = Number(button.dataset.page);
      update();
    });
    update();
  }

  function initForm(form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const feedback = form.querySelector("[data-form-feedback], #form-feedback");
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = form.dataset.submitMessage || "Tudo certo! Suas informações foram validadas.";
      }
    });
  }

  function initUpload(input) {
    const update = function () {
      const output = byId(input, input.dataset.output);
      if (!output) return;
      const files = Array.from(input.files || []);
      output.textContent = !files.length ? "Nenhum arquivo selecionado" : files.length === 1 ? files[0].name : files.length + " arquivos selecionados";
      output.title = files.map(function (file) { return file.name; }).join("\n");
    };
    input.addEventListener("change", update);
    update();
  }

  function init(root) {
    root = root || document;
    initTheme();
    const definitions = [
      ["[data-aura-theme-toggle]", "theme-toggle", initThemeToggle],
      ['input[type="range"][data-aura-range]', "range", initRange],
      ["[data-aura-tabs]", "tabs", initTabs],
      ["[data-aura-stepper]", "stepper", initStepper],
      ["[data-aura-carousel]", "carousel", initCarousel],
      ["[data-toggle-password]", "password", initPassword],
      ["dialog", "dialog", initDialog],
      ["details[data-aura-menu]", "menu", initMenu],
      ["[data-aura-selection]", "selection", initSelection],
      ["[data-aura-tooltip]", "tooltip", initTooltip],
      ["[data-open-dialog]", "open-dialog", function (button) {
        button.addEventListener("click", function (event) {
          event.preventDefault();
          const dialog = byId(button, button.dataset.openDialog);
          if (dialog && !dialog.open && typeof dialog.showModal === "function") dialog.showModal();
        });
      }],
      ["[data-close-dialog]", "close-dialog", function (button) {
        button.addEventListener("click", function (event) {
          event.preventDefault();
          const dialog = button.closest("dialog");
          if (dialog && dialog.open) dialog.close();
        });
      }],
      ["[data-toast]", "toast", function (button) {
        button.addEventListener("click", function (event) { event.preventDefault(); showToast(button); });
      }],
      ["[data-progress-demo]", "progress", initProgress],
      ["[data-dismiss]", "dismiss", function (button) {
        button.addEventListener("click", function (event) {
          event.preventDefault();
          const alert = button.closest(".aura-alert");
          if (alert) alert.remove();
        });
      }],
      ["[data-pagination]", "pagination", initPagination],
      ["form[data-submit-demo]", "form", initForm],
      ['input[type="file"][data-upload]', "upload", initUpload]
    ];
    definitions.forEach(function (definition) {
      components(root, definition[0]).forEach(function (element) { once(element, definition[1], definition[2]); });
    });
    syncThemeButtons(root);
    syncThemeColors(root);
    return root;
  }

  window.Aura = Object.assign(window.Aura || {}, { init: init, setTheme: setTheme });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(document); }, { once: true });
  else init(document);
}());
