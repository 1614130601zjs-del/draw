(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  let toastTimer;
  let resultCount = 0;
  let currentResult = 1;
  let selectedCache = new Set();

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 2300);
  }

  function showPage(pageName) {
    $$(".nav-tab").forEach(button => button.classList.toggle("active", button.dataset.page === pageName));
    $$(".page").forEach(page => page.classList.toggle("active", page.id === `page-${pageName}`));
    $("#page-root").scrollIntoView({ block: "start", behavior: "smooth" });
  }

  $$(".nav-tab").forEach(button => button.addEventListener("click", () => showPage(button.dataset.page)));

  $$(".subtab").forEach(button => button.addEventListener("click", () => {
    $$(".subtab").forEach(tab => tab.classList.toggle("active", tab === button));
    ["artist", "vibe", "params"].forEach(name => {
      const section = $(`#sub-${name}`);
      section.classList.toggle("hidden", name !== button.dataset.subtab);
    });
  }));

  $("#active-character").addEventListener("change", event => {
    const examples = {
      "char-1": "dark hair, warm brown eyes, elegant features, tall slender build"
    };
    $("#appearance").value = examples[event.target.value] || "";
  });

  $$("[data-action]").forEach(button => button.addEventListener("click", () => {
    const action = button.dataset.action;
    const messages = {
      "load-prompt": "提示词库接线后，可选择完整提示词载入工作区。",
      "clear-prompt": "正向提示词已清空。",
      "generate": "这是界面骨架，尚未连接真实生图 API。",
      "save-result": "接入后将导出不含生成元数据的干净图片。",
      "add-preset": "预设编辑器将在下一阶段接入。",
      "edit-preset": "预设编辑器将在下一阶段接入。",
      "import-vibe": "Vibe 导入与编码模块尚未接入。",
      "add-character": "填写上方表单后可在下一阶段保存角色。",
      "save-character": "角色本地持久化尚未接入。",
      "edit-character": "角色详情编辑将在下一阶段接入。",
      "add-prompt": "完整提示词编辑器将在下一阶段接入。",
      "edit-prompt": "完整提示词编辑器将在下一阶段接入。",
      "use-prompt": "提示词载入功能将在下一阶段接入。",
      "select-all": "示例图片已进入演示选择状态。",
      "delete-selected": "当前只有示例卡片；实际缓存删除尚未接入。"
    };
    if (action === "prev" || action === "next") {
      if (!resultCount) return toast("还没有生成结果。");
      currentResult = action === "prev" ? Math.max(1, currentResult - 1) : Math.min(resultCount, currentResult + 1);
      $("#result-index").textContent = `${currentResult} / ${resultCount}`;
      return;
    }
    if (action === "toggle-select") {
      button.classList.toggle("selected");
      if (button.classList.contains("selected")) selectedCache.add(button); else selectedCache.delete(button);
      return;
    }
    if (action === "select-all") {
      const items = $$(".cache-item");
      const allSelected = items.every(item => item.classList.contains("selected"));
      items.forEach(item => item.classList.toggle("selected", !allSelected));
      selectedCache = new Set(allSelected ? [] : items);
      return toast(allSelected ? "已取消全选（演示）" : "已选择全部示例卡片");
    }
    if (action === "delete-selected") {
      if (!selectedCache.size) return toast("请先选择图片。");
      if (confirm("仅取消/删除选中的演示卡片？正式版会二次确认，并默认不删除聊天消息中的图片。")) {
        selectedCache.forEach(item => item.remove());
        selectedCache.clear();
        toast("演示卡片已移除。");
      }
      return;
    }
    if (action === "use-prompt") {
      showPage("workspace");
      $("#prompt").value = "【示例完整提示词】\n这里替换为提示词库中选中的完整提示词。";
      $("#negative").value = "low quality, blurry";
      return toast("已将示例内容载入工作区。");
    }
    if (action === "load-prompt") {
      showPage("prompts");
      return;
    }
    if (action === "clear-prompt") {
      $("#prompt").value = "";
      return toast(messages[action]);
    }
    toast(messages[action] || "该模块将在后续接入。");
  }));

  $("#prompt-search").addEventListener("input", event => {
    const query = event.target.value.trim().toLowerCase();
    $$(".prompt-item").forEach(item => item.classList.toggle("hidden", !item.textContent.toLowerCase().includes(query)));
  });

  $$(".chip").forEach(chip => chip.addEventListener("click", () => {
    $$(".chip").forEach(item => item.classList.remove("selected"));
    chip.classList.add("selected");
    const category = chip.textContent.trim();
    $$(".prompt-item").forEach(item => item.classList.toggle("hidden", category !== "全部" && !item.textContent.includes(category)));
  }));
})();
