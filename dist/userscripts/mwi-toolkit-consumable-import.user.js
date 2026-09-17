// ==UserScript==
// @name         MWI Toolkit - Simulator Consumable Import
// @name:zh-CN   MWI Toolkit - 模拟器消耗品导入
// @namespace    https://github.com/c12597259/MWICombatSimulatorTest
// @version      1.0.0
// @description  Import rounded per-character consumables exported by MWI Combat Simulator into the MWI Toolkit calculator plan.
// @description:zh-CN 将战斗模拟器计划汇总中导出的角色消耗品导入 MWI Toolkit 计算器计划列表。
// @author       c12597259
// @license      MIT
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://test.milkywayidlecn.com/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://c12597259.github.io/MWICombatSimulatorTest/dist/userscripts/mwi-toolkit-consumable-import.user.js
// @downloadURL  https://c12597259.github.io/MWICombatSimulatorTest/dist/userscripts/mwi-toolkit-consumable-import.user.js
// ==/UserScript==

(function () {
    'use strict';

    const TRANSFER_TYPE = 'mwi-simulation-plan-consumables';
    const TRANSFER_VERSION = 1;
    const PANEL_SELECTOR = '[class^="Toolkit_Calculator_Container"]';
    const IMPORTER_ATTRIBUTE = 'data-mwi-simulator-consumable-importer';

    function parseTransferPayload(text) {
        let value;
        try {
            value = JSON.parse(String(text ?? '').trim());
        } catch {
            throw new Error('粘贴内容不是有效的 JSON。');
        }
        if (value?.type !== TRANSFER_TYPE || value?.schemaVersion !== TRANSFER_VERSION) {
            throw new Error('这不是战斗模拟器导出的消耗品数据，或数据版本不受支持。');
        }
        if (!Array.isArray(value.items)) {
            throw new Error('导出数据中缺少消耗品列表。');
        }

        const mergedItems = new Map();
        for (const entry of value.items) {
            const itemHrid = typeof entry?.itemHrid === 'string' ? entry.itemHrid.trim() : '';
            const quantity = Math.ceil(Number(entry?.quantity));
            if (!itemHrid.startsWith('/items/') || !Number.isSafeInteger(quantity) || quantity <= 0) {
                throw new Error(`消耗品条目无效：${itemHrid || '未知物品'}`);
            }
            const names = {
                zh: typeof entry?.names?.zh === 'string' ? entry.names.zh.trim() : '',
                en: typeof entry?.names?.en === 'string' ? entry.names.en.trim() : '',
            };
            const existing = mergedItems.get(itemHrid);
            if (existing) {
                const mergedQuantity = existing.quantity + quantity;
                if (!Number.isSafeInteger(mergedQuantity)) {
                    throw new Error(`消耗品数量过大：${itemHrid}`);
                }
                existing.quantity = mergedQuantity;
                existing.names.zh ||= names.zh;
                existing.names.en ||= names.en;
            } else {
                mergedItems.set(itemHrid, { itemHrid, quantity, names });
            }
        }

        return {
            characterName: typeof value.characterName === 'string' ? value.characterName.trim() : '',
            items: [...mergedItems.values()],
        };
    }

    function getNameCandidates(item, language) {
        return [
            item.names?.[language],
            item.names?.[language === 'zh' ? 'en' : 'zh'],
        ].filter((name, index, names) => name && names.indexOf(name) === index);
    }

    if (typeof document === 'undefined') {
        globalThis.MWI_TOOLKIT_CONSUMABLE_IMPORT_TEST_API = {
            parseTransferPayload,
            getNameCandidates,
        };
        return;
    }

    function findToolkitAddControls(calculatorPanel) {
        const searchInput = [...calculatorPanel.querySelectorAll('input[type="text"]')]
            .find((input) => /搜索物品名称|Search item name/i.test(input.placeholder || ''));
        const searchContainer = searchInput?.parentElement;
        if (!searchInput || !searchContainer) {
            return null;
        }
        const directInputs = [...searchContainer.children]
            .filter((element) => element.tagName === 'INPUT');
        const countInput = directInputs.find((input) => input !== searchInput);
        const addButton = [...searchContainer.children]
            .find((element) => element.tagName === 'BUTTON' && /^(添加|Add)$/i.test(element.textContent.trim()));
        if (!countInput || !addButton) {
            return null;
        }
        return {
            searchInput,
            countInput,
            addButton,
            language: /Search item name/i.test(searchInput.placeholder || '') ? 'en' : 'zh',
        };
    }

    function addItemThroughToolkit(controls, item) {
        for (const name of getNameCandidates(item, controls.language)) {
            controls.searchInput.value = name;
            controls.countInput.value = String(item.quantity);
            controls.addButton.click();
            if (controls.searchInput.value === '') {
                return true;
            }
        }
        controls.searchInput.value = '';
        controls.countInput.value = '1';
        return false;
    }

    function setStatus(status, message, kind = 'normal') {
        status.textContent = message;
        status.style.color = kind === 'error'
            ? '#ff8b8b'
            : kind === 'success'
                ? '#79e39c'
                : '#c8c8c8';
    }

    function createImporter(calculatorPanel) {
        // Toolkit reuses this class for the top-level calculator and each item row.
        // Only the real calculator owns the item search/count/add controls.
        if (!findToolkitAddControls(calculatorPanel)) {
            return;
        }
        if (calculatorPanel.querySelector(`[${IMPORTER_ATTRIBUTE}]`)) {
            return;
        }

        const root = document.createElement('div');
        root.setAttribute(IMPORTER_ATTRIBUTE, '');
        root.style.margin = '2px';
        root.style.padding = '6px';
        root.style.borderRadius = '4px';
        root.style.background = '#2c2e45';

        const toggleButton = document.createElement('button');
        toggleButton.type = 'button';
        toggleButton.textContent = '导入模拟器消耗品';
        toggleButton.style.width = '100%';
        toggleButton.style.padding = '5px 10px';
        toggleButton.style.border = 'none';
        toggleButton.style.borderRadius = '4px';
        toggleButton.style.cursor = 'pointer';
        toggleButton.style.color = '#fff';
        toggleButton.style.background = '#1770b3';

        const editor = document.createElement('div');
        editor.hidden = true;
        editor.style.marginTop = '6px';

        const textarea = document.createElement('textarea');
        textarea.rows = 7;
        textarea.placeholder = '粘贴战斗模拟器“计划模拟 → 角色汇总 → 消耗品”导出的 JSON';
        textarea.style.boxSizing = 'border-box';
        textarea.style.width = '100%';
        textarea.style.resize = 'vertical';
        textarea.style.padding = '6px';
        textarea.style.border = '1px solid #667';
        textarea.style.borderRadius = '4px';
        textarea.style.color = '#111';
        textarea.style.background = '#dde2f8';

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.alignItems = 'center';
        actions.style.gap = '6px';
        actions.style.marginTop = '6px';

        const importButton = document.createElement('button');
        importButton.type = 'button';
        importButton.textContent = '导入到计划列表';
        importButton.style.padding = '5px 10px';
        importButton.style.border = 'none';
        importButton.style.borderRadius = '4px';
        importButton.style.cursor = 'pointer';
        importButton.style.color = '#fff';
        importButton.style.background = '#4CAF50';

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = '取消';
        cancelButton.style.padding = '5px 10px';
        cancelButton.style.border = 'none';
        cancelButton.style.borderRadius = '4px';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.color = '#fff';
        cancelButton.style.background = '#666';

        const status = document.createElement('span');
        status.style.fontSize = '12px';
        actions.append(importButton, cancelButton, status);
        editor.append(textarea, actions);
        root.append(toggleButton, editor);

        toggleButton.addEventListener('click', () => {
            editor.hidden = !editor.hidden;
            if (!editor.hidden) {
                textarea.focus();
            }
        });
        cancelButton.addEventListener('click', () => {
            editor.hidden = true;
            setStatus(status, '');
        });
        importButton.addEventListener('click', () => {
            let payload;
            try {
                payload = parseTransferPayload(textarea.value);
            } catch (error) {
                setStatus(status, error.message, 'error');
                return;
            }
            const controls = findToolkitAddControls(calculatorPanel);
            if (!controls) {
                setStatus(status, '没有找到 MWI Toolkit 的物品添加控件，请确认 Toolkit 5.3.12 或兼容版本已启用。', 'error');
                return;
            }

            const failed = [];
            for (const item of payload.items) {
                if (!addItemThroughToolkit(controls, item)) {
                    failed.push(item.itemHrid);
                }
            }
            if (failed.length > 0) {
                setStatus(status, `已导入 ${payload.items.length - failed.length} 项；无法识别：${failed.join('、')}`, 'error');
                return;
            }
            const character = payload.characterName ? `“${payload.characterName}”的` : '';
            setStatus(status, `已将${character} ${payload.items.length} 种消耗品累加到计划列表。`, 'success');
            textarea.value = '';
        });

        const addItemSection = calculatorPanel.firstElementChild;
        if (addItemSection) {
            addItemSection.insertAdjacentElement('afterend', root);
        } else {
            calculatorPanel.prepend(root);
        }
    }

    function enhanceCalculatorPanels() {
        document.querySelectorAll(PANEL_SELECTOR).forEach(createImporter);
    }

    enhanceCalculatorPanels();
    const observer = new MutationObserver(enhanceCalculatorPanels);
    observer.observe(document.documentElement, { childList: true, subtree: true });
})();
