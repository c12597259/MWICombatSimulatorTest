import spriteUrl from './assets/drop-items.svg?asset';
import iconNames from './assets/drop-item-icons.json';
import itemDetailMap from './combatsimulator/data/itemDetailMap.json';

const availableIcons = new Set(iconNames);
const svgNamespace = 'http://www.w3.org/2000/svg';
const displayPreferenceKey = 'mwiDropDisplayMode';

// Collection category order in the game; items within each category use sortIndex.
const collectionCategories = ['currency', 'loot', 'scroll', 'labyrinth', 'dungeon_key', 'food', 'drink', 'ability_book', 'equipment', 'resource'];
const categoryOrder = new Map(collectionCategories.map((category, index) => [`/item_categories/${category}`, index]));

export function sortDropInventoryRows(rows) {
    return [...rows].sort((left, right) => {
        const leftItem = itemDetailMap[left.key];
        const rightItem = itemDetailMap[right.key];
        const leftCategory = categoryOrder.get(leftItem?.categoryHrid) ?? Infinity;
        const rightCategory = categoryOrder.get(rightItem?.categoryHrid) ?? Infinity;
        if (leftCategory !== rightCategory) return leftCategory - rightCategory;
        const leftIndex = Number.isFinite(leftItem?.sortIndex) ? leftItem.sortIndex : Infinity;
        const rightIndex = Number.isFinite(rightItem?.sortIndex) ? rightItem.sortIndex : Infinity;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return String(left.key).localeCompare(String(right.key));
    });
}

function formatSmallDropQuantity(value) {
    const number = Number(value);
    const magnitude = Math.abs(number);
    if (magnitude > 0 && magnitude < 0.001) return number < 0 ? '>-0.001' : '<0.001';
    if (magnitude > 0 && magnitude < 0.1) return number.toFixed(3);
    return null;
}

export function formatDropIconQuantity(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    const smallQuantity = formatSmallDropQuantity(number);
    if (smallQuantity !== null) return smallQuantity;
    const magnitude = Math.abs(number);
    if (magnitude > 1000000) return `${(number / 1000000).toFixed(2)}M`;
    if (magnitude > 100000) return `${(number / 1000).toFixed(0)}K`;
    return number.toLocaleString(undefined, {
        useGrouping: false,
        minimumFractionDigits: magnitude > 0.1 && magnitude < 100 ? 2 : 0,
        maximumFractionDigits: magnitude < 100 ? 2 : 0,
    });
}

export function createDropInventory(rows, { itemName, formatQuantity, labels = { icons: '图标', text: '纯文字' } }) {
    const root = document.createElement('div');
    root.className = 'drop-inventory';
    const controls = document.createElement('div');
    controls.className = 'drop-inventory-modes';
    const grid = document.createElement('div');
    grid.className = 'drop-inventory-grid';
    grid.setAttribute('role', 'list');
    const list = document.createElement('div');
    list.className = 'drop-inventory-list';
    list.setAttribute('role', 'list');
    const detail = document.createElement('div');
    detail.className = 'drop-inventory-detail small mt-2';
    detail.setAttribute('aria-live', 'polite');
    detail.hidden = true;
    const setMode = mode => {
        root.dataset.mode = mode;
        grid.hidden = mode !== 'icons';
        list.hidden = mode !== 'text';
        detail.hidden = true;
        controls.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    };
    for (const mode of ['icons', 'text']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.mode = mode;
        button.textContent = labels[mode];
        button.addEventListener('click', () => {
            setMode(mode);
            try { localStorage.setItem(displayPreferenceKey, mode); } catch { /* Storage may be unavailable. */ }
        });
        controls.append(button);
    }
    for (const { key, value } of sortDropInventoryRows(rows)) {
        const name = itemName(key);
        const fullQuantity = Number(value).toLocaleString(undefined, { maximumSignificantDigits: 16 });
        const description = `${name} × ${fullQuantity}`;
        const entry = document.createElement('div');
        entry.setAttribute('role', 'listitem');
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'drop-inventory-tile';
        tile.dataset.itemHrid = key;
        tile.dataset.quantity = String(value);
        tile.title = description;
        tile.setAttribute('aria-label', description);
        const iconName = key.split('/').pop();
        if (availableIcons.has(iconName)) {
            const icon = document.createElementNS(svgNamespace, 'svg');
            icon.setAttribute('viewBox', '0 0 50 50');
            icon.setAttribute('aria-hidden', 'true');
            icon.setAttribute('focusable', 'false');
            const use = document.createElementNS(svgNamespace, 'use');
            use.setAttribute('href', `${spriteUrl}#${iconName}`);
            icon.append(use);
            tile.append(icon);
        } else {
            const label = document.createElement('span');
            label.className = 'drop-inventory-fallback';
            label.textContent = name;
            tile.append(label);
        }
        const quantity = document.createElement('span');
        quantity.className = 'drop-inventory-quantity';
        quantity.setAttribute('aria-hidden', 'true');
        quantity.textContent = formatDropIconQuantity(value);
        tile.append(quantity);
        const showDetail = () => { detail.textContent = tile.title; detail.dataset.itemHrid = key; detail.hidden = false; };
        tile.addEventListener('click', showDetail);
        tile.addEventListener('focus', showDetail);
        entry.append(tile);
        grid.append(entry);
        const textRow = document.createElement('div');
        textRow.className = 'drop-inventory-text-row';
        textRow.setAttribute('role', 'listitem');
        textRow.dataset.itemHrid = key;
        const textName = document.createElement('span');
        textName.className = 'drop-inventory-text-name';
        textName.textContent = name;
        const textQuantity = document.createElement('span');
        textQuantity.textContent = formatSmallDropQuantity(value) ?? formatQuantity(value, key);
        textRow.append(textName, textQuantity);
        list.append(textRow);
    }
    let mode = 'icons';
    try { if (localStorage.getItem(displayPreferenceKey) === 'text') mode = 'text'; } catch { /* Use icons by default. */ }
    setMode(mode);
    root.append(controls, grid, list, detail);
    return root;
}

export function updateDropInventoryLabels(root, itemName, labels) {
    if (labels) root.querySelectorAll('.drop-inventory-modes button').forEach(button => {
        button.textContent = labels[button.dataset.mode];
    });
    root.querySelectorAll('.drop-inventory-text-row').forEach(row => {
        row.querySelector('.drop-inventory-text-name').textContent = itemName(row.dataset.itemHrid);
    });
    root.querySelectorAll('.drop-inventory-tile').forEach(tile => {
        const name = itemName(tile.dataset.itemHrid);
        const amount = Number(tile.dataset.quantity).toLocaleString(undefined, { maximumSignificantDigits: 16 });
        tile.title = `${name} × ${amount}`;
        tile.setAttribute('aria-label', tile.title);
        const fallback = tile.querySelector('.drop-inventory-fallback');
        if (fallback) fallback.textContent = name;
        const detail = tile.closest('.drop-inventory').querySelector('.drop-inventory-detail');
        if (detail.dataset.itemHrid === tile.dataset.itemHrid) detail.textContent = tile.title;
    });
}
