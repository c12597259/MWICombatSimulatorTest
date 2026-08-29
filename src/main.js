import Equipment from "./combatsimulator/equipment.js";
import Player from "./combatsimulator/player.js";
import abilityDetailMap from "./combatsimulator/data/abilityDetailMap.json";
import itemDetailMap from "./combatsimulator/data/itemDetailMap.json";
import houseRoomDetailMap from "./combatsimulator/data/houseRoomDetailMap.json";
import Ability from "./combatsimulator/ability.js";
import Consumable from "./combatsimulator/consumable.js";
import HouseRoom from "./combatsimulator/houseRoom"
import combatTriggerDependencyDetailMap from "./combatsimulator/data/combatTriggerDependencyDetailMap.json";
import combatTriggerConditionDetailMap from "./combatsimulator/data/combatTriggerConditionDetailMap.json";
import combatTriggerComparatorDetailMap from "./combatsimulator/data/combatTriggerComparatorDetailMap.json";
import abilitySlotsLevelRequirementList from "./combatsimulator/data/abilitySlotsLevelRequirementList.json";
import actionDetailMap from "./combatsimulator/data/actionDetailMap.json";
import combatMonsterDetailMap from "./combatsimulator/data/combatMonsterDetailMap.json";
import damageTypeDetailMap from "./combatsimulator/data/damageTypeDetailMap.json";
import combatStyleDetailMap from "./combatsimulator/data/combatStyleDetailMap.json";
import achievementTierMap from "./combatsimulator/data/achievementTierDetailMap.json"
import achievementDetailMap from "./combatsimulator/data/achievementDetailMap.json"
import { calculateFragmentTimeCosts } from "./fragmentTimeCost.js";
import {
    GUILD_COMBAT_SHRINE_DETAILS,
    normalizeGuildCombatShrineLevel,
    normalizeGuildCombatShrineLevels,
    resolveGuildCombatShrineLevels,
} from "./guildCombatShrines.js";
import {
    createTeamPresetId,
    createTeamPresetTargetKey,
    getDefaultTeamPreset,
    getTeamPresetsForTarget,
    loadTeamPresetStore,
    saveTeamPresetStore,
} from "./teamPresetStore.js";
import { compareTeamPresetWithCurrent } from "./teamPresetComparison.js";
import {
    PRIVATE_LOADOUT_BASELINE_BRIDGE_ATTRIBUTE,
    PRIVATE_LOADOUT_BASELINE_REQUEST_EVENT,
    PRIVATE_LOADOUT_BASELINE_RESPONSE_EVENT,
    buildPrivateLoadoutReferences,
    resolvePrivateLoadoutBaseline,
} from "./privateLoadoutBaseline.js";
import {
    buildSimulationHistoryRecord,
    clearSimulationHistory,
    compareSimulationHistoryRecords,
    deleteSimulationHistoryMap,
    deleteSimulationHistoryRecord,
    getSimulationHistoryStorageSummary,
    loadSimulationHistoryRecords,
    saveSimulationHistoryRecord,
} from "./simulationHistory.js";
import {
    mergeSelectedPlayerFormation,
    normalizePlayerFormation,
    orderSelectedPlayerSlots,
} from "./playerFormation.js";

import patchNote from "../patchNote.json";

const ONE_SECOND = 1e9;
const ONE_HOUR = 60 * 60 * ONE_SECOND;
const PLAYER_FORMATION_STORAGE_KEY = "mwiCombatSimulatorPlayerFormation_v1";

let buttonStartSimulation = document.getElementById("buttonStartSimulation");
let buttonStopSimulation = document.getElementById("buttonStopSimulation");
let progressbar = document.getElementById("simulationProgressBar");
let simStartTime = 0;

let worker = new Worker(new URL("worker.js", import.meta.url));
let multiWorker = new Worker(new URL("multiWorker.js", import.meta.url));
let workerPool = [];


let player = new Player();
let selectedPlayers = [];
let food = [null, null, null];
let drinks = [null, null, null];
let abilities = [null, null, null, null];
let triggerMap = {};
let modalTriggers = [];
let currentSimResults = {};
let pendingSimulationHistoryContext = null;
let simulationHistoryRecords = [];

let currentPlayerTabId = '1';
let lastAutoLoadedTeamPresetTargetKey = null;
const pendingImporterLoadoutNames = new Map();
let playerDataMap = {
    "1": "{\"player\":{\"attackLevel\":1,\"magicLevel\":1,\"meleeLevel\":1,\"rangedLevel\":1,\"defenseLevel\":1,\"staminaLevel\":1,\"intelligenceLevel\":1,\"equipment\":[]},\"food\":{\"/action_types/combat\":[{\"itemHrid\":\"\"},{\"itemHrid\":\"\"},{\"itemHrid\":\"\"}]},\"drinks\":{\"/action_types/combat\":[{\"itemHrid\":\"\"},{\"itemHrid\":\"\"},{\"itemHrid\":\"\"}]},\"abilities\":[{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"}],\"triggerMap\":{},\"zone\":\"/actions/combat/fly\",\"simulationTime\":\"100\",\"houseRooms\":{\"/house_rooms/dairy_barn\":0,\"/house_rooms/garden\":0,\"/house_rooms/log_shed\":0,\"/house_rooms/forge\":0,\"/house_rooms/workshop\":0,\"/house_rooms/sewing_parlor\":0,\"/house_rooms/kitchen\":0,\"/house_rooms/brewery\":0,\"/house_rooms/laboratory\":0,\"/house_rooms/dining_room\":0,\"/house_rooms/library\":0,\"/house_rooms/dojo\":0,\"/house_rooms/gym\":0,\"/house_rooms/armory\":0,\"/house_rooms/archery_range\":0,\"/house_rooms/mystical_study\":0,\"/house_rooms/observatory\":0},\"achievements\":{}}",
    "2": "{\"player\":{\"attackLevel\":1,\"magicLevel\":1,\"meleeLevel\":1,\"rangedLevel\":1,\"defenseLevel\":1,\"staminaLevel\":1,\"intelligenceLevel\":1,\"equipment\":[]},\"food\":{\"/action_types/combat\":[{\"itemHrid\":\"\"},{\"itemHrid\":\"\"},{\"itemHrid\":\"\"}]},\"drinks\":{\"/action_types/combat\":[{\"itemHrid\":\"\"},{\"itemHrid\":\"\"},{\"itemHrid\":\"\"}]},\"abilities\":[{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"}],\"triggerMap\":{},\"zone\":\"/actions/combat/fly\",\"simulationTime\":\"100\",\"houseRooms\":{\"/house_rooms/dairy_barn\":0,\"/house_rooms/garden\":0,\"/house_rooms/log_shed\":0,\"/house_rooms/forge\":0,\"/house_rooms/workshop\":0,\"/house_rooms/sewing_parlor\":0,\"/house_rooms/kitchen\":0,\"/house_rooms/brewery\":0,\"/house_rooms/laboratory\":0,\"/house_rooms/dining_room\":0,\"/house_rooms/library\":0,\"/house_rooms/dojo\":0,\"/house_rooms/gym\":0,\"/house_rooms/armory\":0,\"/house_rooms/archery_range\":0,\"/house_rooms/mystical_study\":0,\"/house_rooms/observatory\":0},\"achievements\":{}}",
    "3": "{\"player\":{\"attackLevel\":1,\"magicLevel\":1,\"meleeLevel\":1,\"rangedLevel\":1,\"defenseLevel\":1,\"staminaLevel\":1,\"intelligenceLevel\":1,\"equipment\":[]},\"food\":{\"/action_types/combat\":[{\"itemHrid\":\"\"},{\"itemHrid\":\"\"},{\"itemHrid\":\"\"}]},\"drinks\":{\"/action_types/combat\":[{\"itemHrid\":\"\"},{\"itemHrid\":\"\"},{\"itemHrid\":\"\"}]},\"abilities\":[{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"}],\"triggerMap\":{},\"zone\":\"/actions/combat/fly\",\"simulationTime\":\"100\",\"houseRooms\":{\"/house_rooms/dairy_barn\":0,\"/house_rooms/garden\":0,\"/house_rooms/log_shed\":0,\"/house_rooms/forge\":0,\"/house_rooms/workshop\":0,\"/house_rooms/sewing_parlor\":0,\"/house_rooms/kitchen\":0,\"/house_rooms/brewery\":0,\"/house_rooms/laboratory\":0,\"/house_rooms/dining_room\":0,\"/house_rooms/library\":0,\"/house_rooms/dojo\":0,\"/house_rooms/gym\":0,\"/house_rooms/armory\":0,\"/house_rooms/archery_range\":0,\"/house_rooms/mystical_study\":0,\"/house_rooms/observatory\":0},\"achievements\":{}}",
    "4": "{\"player\":{\"attackLevel\":1,\"magicLevel\":1,\"meleeLevel\":1,\"rangedLevel\":1,\"defenseLevel\":1,\"staminaLevel\":1,\"intelligenceLevel\":1,\"equipment\":[]},\"food\":{\"/action_types/combat\":[{\"itemHrid\":\"\"},{\"itemHrid\":\"\"},{\"itemHrid\":\"\"}]},\"drinks\":{\"/action_types/combat\":[{\"itemHrid\":\"\"},{\"itemHrid\":\"\"},{\"itemHrid\":\"\"}]},\"abilities\":[{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"}],\"triggerMap\":{},\"zone\":\"/actions/combat/fly\",\"simulationTime\":\"100\",\"houseRooms\":{\"/house_rooms/dairy_barn\":0,\"/house_rooms/garden\":0,\"/house_rooms/log_shed\":0,\"/house_rooms/forge\":0,\"/house_rooms/workshop\":0,\"/house_rooms/sewing_parlor\":0,\"/house_rooms/kitchen\":0,\"/house_rooms/brewery\":0,\"/house_rooms/laboratory\":0,\"/house_rooms/dining_room\":0,\"/house_rooms/library\":0,\"/house_rooms/dojo\":0,\"/house_rooms/gym\":0,\"/house_rooms/armory\":0,\"/house_rooms/archery_range\":0,\"/house_rooms/mystical_study\":0,\"/house_rooms/observatory\":0},\"achievements\":{}}",
    "5": "{\"player\":{\"attackLevel\":1,\"magicLevel\":1,\"meleeLevel\":1,\"rangedLevel\":1,\"defenseLevel\":1,\"staminaLevel\":1,\"intelligenceLevel\":1,\"equipment\":[]},\"food\":{\"/action_types/combat\":[{\"itemHrid\":\"\"},{\"itemHrid\":\"\"},{\"itemHrid\":\"\"}]},\"drinks\":{\"/action_types/combat\":[{\"itemHrid\":\"\"},{\"itemHrid\":\"\"},{\"itemHrid\":\"\"}]},\"abilities\":[{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"}],\"triggerMap\":{},\"zone\":\"/actions/combat/fly\",\"simulationTime\":\"100\",\"houseRooms\":{\"/house_rooms/dairy_barn\":0,\"/house_rooms/garden\":0,\"/house_rooms/log_shed\":0,\"/house_rooms/forge\":0,\"/house_rooms/workshop\":0,\"/house_rooms/sewing_parlor\":0,\"/house_rooms/kitchen\":0,\"/house_rooms/brewery\":0,\"/house_rooms/laboratory\":0,\"/house_rooms/dining_room\":0,\"/house_rooms/library\":0,\"/house_rooms/dojo\":0,\"/house_rooms/gym\":0,\"/house_rooms/armory\":0,\"/house_rooms/archery_range\":0,\"/house_rooms/mystical_study\":0,\"/house_rooms/observatory\":0},\"achievements\":{}}"
};

// #region Worker

function onWorkerMessage(event) {
    switch (event.data.type) {
        case "simulation_result":
            progressbar.style.width = "100%";
            progressbar.innerHTML = "100% (" + ((Date.now() - simStartTime) / 1000).toFixed(2) + "s)";
            //console.log("SIM RESULTS: ", event.data.simResult);
            showSimulationResult(event.data.simResult);
            void saveCompletedSimulationHistory(event.data.simResult);
            updateContent();
            buttonStartSimulation.disabled = false;
            buttonStopSimulation.style.display = 'none';
            document.getElementById('buttonShowAllSimData').style.display = 'none';
            break;
        case "simulation_progress":
            let progress = Math.floor(100 * event.data.progress);
            progressbar.style.width = progress + "%";
            progressbar.innerHTML = progress + "% (" + ((Date.now() - simStartTime) / 1000).toFixed(2) + "s)";
            // 实时更新图表
            if (event.data.timeSeriesData && document.getElementById('hpMpVisualizationToggle').checked) {
                updateChartsRealtime(event.data.timeSeriesData);
            }
            break;
        case "simulation_error":
            pendingSimulationHistoryContext = null;
            showErrorModal(event.data.error.toString());
            break;
    }
};

function onMultiWorkerMessage(event) {
    switch (event.data.type) {
        case "simulation_result_allZones":
        case "simulation_result_allLabyrinths":
            progressbar.style.width = "100%";
            progressbar.innerHTML = "100% (" + ((Date.now() - simStartTime) / 1000).toFixed(2) + "s)";
            showAllSimulationResults(event.data.simResults);
            updateContent();
            buttonStartSimulation.disabled = false;
            buttonStopSimulation.style.display = 'none';
            document.getElementById('buttonShowAllSimData').style.display = 'block';
            break;
        case "simulation_progress":
            let progress = Math.floor(100 * event.data.progress);
            progressbar.style.width = progress + "%";
            progressbar.innerHTML = progress + "% (" + ((Date.now() - simStartTime) / 1000).toFixed(2) + "s)";
            break;
        case "simulation_error":
            showErrorModal(event.data.error.toString());
            break;
    }
};

// #endregion

// #region Equipment

function initEquipmentSection() {
    ["head", "body", "legs", "feet", "hands", "main_hand", "two_hand", "off_hand", "pouch", "neck", "earrings", "ring", "back", "charm"].forEach((type) => {
        initEquipmentSelect(type);
        initEnhancementLevelInput(type);
    });
}

function initEquipmentSelect(equipmentType) {
    let selectId = "selectEquipment_";
    if (equipmentType == "main_hand" || equipmentType == "two_hand") {
        selectId += "weapon";
    } else {
        selectId += equipmentType;
    }
    let selectElement = document.getElementById(selectId);

    let gameEquipment = Object.values(itemDetailMap)
        .filter((item) => item.categoryHrid == "/item_categories/equipment")
        .filter((item) => item.equipmentDetail.type == "/equipment_types/" + equipmentType)
        .sort((a, b) => a.sortIndex - b.sortIndex);

    for (const equipment of Object.values(gameEquipment)) {
        let opt = new Option(equipment.name, equipment.hrid);
        opt.setAttribute("data-i18n", "itemNames." + equipment.hrid);
        selectElement.add(opt);
    }

    selectElement.addEventListener("change", (event) => {
        equipmentSelectHandler(event, equipmentType);
    });
}

function initHouseRoomsModal() {
    let houseRoomsList = document.getElementById("houseRoomsList");
    let newChildren = [];
    let houseRooms = Object.values(houseRoomDetailMap).sort((a, b) => a.sortIndex - b.sortIndex);
    player.houseRooms = {};

    for (const room of Object.values(houseRooms)) {
        player.houseRooms[room.hrid] = 0;

        let column = createElement("div", "col-12 col-lg-6");
        let row = createElement("div", "row g-2 mb-1 align-items-center");

        let nameCol = createElement("div", "col-8", room.name);
        nameCol.setAttribute("data-i18n", "houseRoomNames." + room.hrid);
        row.appendChild(nameCol);

        let levelCol = createElement("div", "col-4");
        let levelInput = createHouseInput(room.hrid);

        levelInput.addEventListener("input", function (e) {
            let inputValue = e.target.value;
            const hrid = e.target.dataset.houseHrid;
            player.houseRooms[hrid] = parseInt(inputValue);
        });

        levelCol.appendChild(levelInput);
        row.appendChild(levelCol);

        column.appendChild(row);
        newChildren.push(column);
    }

    houseRoomsList.replaceChildren(...newChildren);
}

function createHouseInput(hrid) {
    let levelInput = document.createElement("input");
    levelInput.className = "form-control form-control-sm";
    levelInput.type = "number";
    levelInput.placeholder = 0;
    levelInput.min = 0;
    levelInput.max = 8;
    levelInput.step = 1;
    levelInput.dataset.houseHrid = hrid;

    return levelInput;
}

function setGuildCombatBuffLevels(levels = {}) {
    player.guildCombatBuffLevels = normalizeGuildCombatShrineLevels(levels);
    for (const { key } of GUILD_COMBAT_SHRINE_DETAILS) {
        const input = document.querySelector(`[data-guild-combat-buff="${key}"]`);
        if (input) {
            input.value = player.guildCombatBuffLevels[key];
        }
    }
}

function updateGuildCombatBuffLevels() {
    player.guildCombatBuffLevels = normalizeGuildCombatShrineLevels(player.guildCombatBuffLevels);
    for (const { key } of GUILD_COMBAT_SHRINE_DETAILS) {
        const input = document.querySelector(`[data-guild-combat-buff="${key}"]`);
        if (!input) {
            continue;
        }
        const level = normalizeGuildCombatShrineLevel(input.value);
        input.value = level;
        player.guildCombatBuffLevels[key] = level;
    }
}

function initGuildCombatBuffLevels() {
    const list = document.getElementById("guildCombatBuffLevelsList");
    const rows = [];

    const header = createElement("div", "row mb-2 fw-semibold small text-secondary");
    header.innerHTML = `
        <div class="col-4" data-i18n="common:guildCombatBuffs.shrine">Shrine</div>
        <div class="col-5" data-i18n="common:guildCombatBuffs.effect">Effect</div>
        <div class="col-3" data-i18n="common:guildCombatBuffs.level">Level</div>`;
    rows.push(header);

    for (const { key } of GUILD_COMBAT_SHRINE_DETAILS) {
        const row = createElement("div", "row mb-2 align-items-center");

        const nameCol = createElement("div", "col-4");
        const name = createElement("label", "form-label mb-0", key);
        name.htmlFor = `inputGuildCombatBuff_${key}`;
        name.setAttribute("data-i18n", `common:guildCombatBuffs.${key}`);
        nameCol.appendChild(name);

        const effectCol = createElement("div", "col-5 small text-secondary", key);
        effectCol.setAttribute("data-i18n", `common:guildCombatBuffs.${key}Effect`);

        const levelCol = createElement("div", "col-3");
        const levelInput = createElement("input", "form-control");
        levelInput.type = "number";
        levelInput.id = `inputGuildCombatBuff_${key}`;
        levelInput.min = 0;
        levelInput.max = 20;
        levelInput.step = 1;
        levelInput.value = 0;
        levelInput.dataset.guildCombatBuff = key;
        levelInput.addEventListener("input", (event) => {
            player.guildCombatBuffLevels[key] = normalizeGuildCombatShrineLevel(event.target.value);
            updateUI();
        });
        levelInput.addEventListener("change", (event) => {
            event.target.value = normalizeGuildCombatShrineLevel(event.target.value);
        });
        levelCol.appendChild(levelInput);

        row.append(nameCol, effectCol, levelCol);
        rows.push(row);
    }

    list.replaceChildren(...rows);
    setGuildCombatBuffLevels();
}

function refreshAchievementStatics() {
    let tierMap = Object.values(achievementTierMap).sort((a, b) => a.sortIndex - b.sortIndex);
    for(const tier of Object.values(tierMap)) {
        const checks = document.querySelectorAll(`input[data-achievement-hrid][data-tier="${tier.sortIndex}"]`);
        const done = Array.from(checks).filter(cb => cb.checked).length;
        const total = checks.length;

        const stat = document.getElementById(`AchTier${tier.sortIndex}Statics`);
        stat.innerText = `(${done}/${total})`;
        if (done == total) {
            // set to green
            stat.classList.remove("text-secondary");
            stat.classList.add("text-success");
        } else {
            // set to secondary
            stat.classList.remove("text-success");
            stat.classList.add("text-secondary");
        }
    }
}

function initAchievementsModal(){
    let achievementsList = document.getElementById("achievementsList");
    let newChildren = [];
    player.achievements = {};

    let tierMap = Object.values(achievementTierMap).sort((a, b) => a.sortIndex - b.sortIndex);
    for(const tier of Object.values(tierMap)) {
        let detailMap = Object.values(achievementDetailMap).filter((detail) => detail.tierHrid == tier.hrid).sort((a, b) => a.sortIndex - b.sortIndex);
        let detailMapCount = detailMap.length;
        if (detailMapCount <= 0) continue;

        let card = createElement("div", "card");
        let cardHeader = createElement("div", "card-header d-flex align-items-center");

        let cardTitle = createElement("a", "btn", tier.name);
        cardTitle.setAttribute("data-bs-toggle","collapse");
        cardTitle.setAttribute("href", `#AchTier${tier.sortIndex}`);
        cardTitle.setAttribute("data-i18n", "achievementTierNames."+tier.hrid);
        cardHeader.appendChild(cardTitle);

        let bufDesc = createElement("div", "small text-secondary");
        let buffName = createElement("i", "");
        buffName.setAttribute("data-i18n", "buffTypeNames."+tier["buff"].typeHrid);
        bufDesc.appendChild(buffName);
        let buffValue = createElement("i", "");
        buffValue.innerText = ":+" + parseFloat(tier["buff"].ratioBoost==0?tier["buff"].flatBoost:tier["buff"].ratioBoost)*100 + "%";
        bufDesc.appendChild(buffValue);
        cardHeader.appendChild(bufDesc);

        let cardStatics = createElement("div", "ms-auto btn", `(0/${detailMapCount})`);
        cardStatics.id = `AchTier${tier.sortIndex}Statics`;
        cardStatics.dataset.checked = "true";
        cardStatics.addEventListener("click", function (e) {
            const checks = document.querySelectorAll(`input[data-achievement-hrid][data-tier="${tier.sortIndex}"]`);
            for (const check of checks) {
                check.checked = cardStatics.dataset.checked == "true";
                const hrid = check.dataset.achievementHrid;
                player.achievements[hrid] = check.checked;
            }
            cardStatics.dataset.checked = cardStatics.dataset.checked == "true" ? "false" : "true";
            refreshAchievementStatics();
        });
        cardHeader.appendChild(cardStatics);

        card.appendChild(cardHeader);

        let cardMain = createElement("div", "collapse");
        cardMain.id = `AchTier${tier.sortIndex}`;
        let cardBody = createElement("div", "card-body");

        for (const detail of Object.values(detailMap)) {
            let row = createElement("div", "row mb-2");

            let formCheck = createElement("div", "form-check");
            let input = createElement("input", "form-check-input");
            input.setAttribute("type", "checkbox");
            input.setAttribute("data-tier", tier.sortIndex);
            input.id = `AchDetail${detail.sortIndex}`;
            input.dataset.achievementHrid = detail.hrid;
            input.addEventListener("change", function (e) {
                const hrid = e.target.dataset.achievementHrid;
                player.achievements[hrid] = e.target.checked;

                refreshAchievementStatics();
            });
            formCheck.appendChild(input);

            let name = createElement("label", "form-check-label", detail.name);
            name.setAttribute("data-i18n", "achievementNames." + detail.hrid);
            name.setAttribute("for", `AchDetail${detail.sortIndex}`);
            formCheck.appendChild(name);
            row.appendChild(formCheck);
            cardBody.appendChild(row);
        }
        cardMain.appendChild(cardBody);
        card.appendChild(cardMain);

        newChildren.push(card);
    }

    achievementsList.replaceChildren(...newChildren);
}

function initEnhancementLevelInput(equipmentType) {
    let inputId = "inputEquipmentEnhancementLevel_";
    if (equipmentType == "main_hand" || equipmentType == "two_hand") {
        inputId += "weapon";
    } else {
        inputId += equipmentType;
    }

    let inputElement = document.getElementById(inputId);
    inputElement.value = 0;
    inputElement.addEventListener("change", enhancementLevelInputHandler);
}

function equipmentSelectHandler(event, type) {
    let equipmentType = "/equipment_types/" + type;

    if (!event.target.value) {
        updateEquipmentState();
        updateUI();
        return;
    }

    let gameItem = itemDetailMap[event.target.value];

    // Weapon select has two handlers because of mainhand and twohand weapons. Ignore the handler with the wrong type
    if (gameItem.equipmentDetail.type != equipmentType) {
        return;
    }

    if (type == "two_hand") {
        document.getElementById("selectEquipment_off_hand").value = "";
        document.getElementById("inputEquipmentEnhancementLevel_off_hand").value = 0;
    }
    if (type == "off_hand" && player.equipment["/equipment_types/two_hand"]) {
        document.getElementById("selectEquipment_weapon").value = "";
        document.getElementById("inputEquipmentEnhancementLevel_weapon").value = 0;
    }

    updateEquipmentState();
    updateUI();
}

function enhancementLevelInputHandler() {
    updateEquipmentState();
    updateUI();
}

function updateEquipmentState() {
    ["head", "body", "legs", "feet", "hands", "main_hand", "two_hand", "off_hand", "pouch", "neck", "earrings", "ring", "back", "charm"].forEach((type) => {
        let equipmentType = "/equipment_types/" + type;
        let selectType = type;
        if (type == "main_hand" || type == "two_hand") {
            selectType = "weapon";
        }

        let equipmentSelect = document.getElementById("selectEquipment_" + selectType);
        let equipmentHrid = equipmentSelect.value;

        if (!equipmentHrid) {
            player.equipment[equipmentType] = null;
            return;
        }

        let gameItem = itemDetailMap[equipmentHrid];

        // Clear old weapon if a weapon of a different type is equipped
        if (gameItem.equipmentDetail.type != equipmentType) {
            player.equipment[equipmentType] = null;
            return;
        }

        let enhancementLevel = Number(document.getElementById("inputEquipmentEnhancementLevel_" + selectType).value);
        player.equipment[equipmentType] = new Equipment(gameItem.hrid, enhancementLevel);
    });
}

document.getElementById("selectEquipment_set").onchange = changeEquipmentSetListener;

function changeEquipmentSetListener() {
    let value = this.value
    let optgroupType = this.options[this.selectedIndex].parentNode.label;

    ["head", "body", "legs", "feet", "hands"].forEach((type) => {
        let selectType = type;

        let currentEquipment = document.getElementById("selectEquipment_" + selectType);
        if (type === "feet") {
            type = "_boots";
        }
        if (type === "hands") {
            if (optgroupType === "RANGED") {
                type = "_bracers";
            } else if (optgroupType === "MAGIC") {
                type = "_gloves";
            } else {
                type = "_gauntlets";
            }
        }
        if (type === "head") {
            if (optgroupType === "RANGED") {
                type = "_hood";
            } else if (optgroupType === "MAGIC") {
                type = "_hat";
            } else {
                type = "_helmet";
            }
        }
        if (type === "legs") {
            if (optgroupType === "RANGED") {
                type = "_chaps";
            } else if (optgroupType === "MAGIC") {
                type = "_robe_bottoms";
            } else {
                type = "_plate_legs";
            }
        }
        if (type === "body") {
            if (optgroupType === "RANGED") {
                type = "_tunic";
            } else if (optgroupType === "MAGIC") {
                type = "_robe_top";
            } else {
                type = "_plate_body";
            }
        }
        currentEquipment.value = "/items/" + value.toLowerCase() + type;
    });
    updateEquipmentState();
    updateUI();
}

// #endregion

// #region Combat Stats

function updateCombatStatsUI() {
    player.updateCombatDetails();

    let combatStyleElement = document.getElementById("combatStat_combatStyleHrid");
    let combatStyle = player.combatDetails.combatStats.combatStyleHrid;
    combatStyleElement.setAttribute("data-i18n", "combatStyleNames." + combatStyle);
    combatStyleElement.innerHTML = combatStyleDetailMap[combatStyle].name;

    let damageTypeElement = document.getElementById("combatStat_damageType");
    let damageType = damageTypeDetailMap[player.combatDetails.combatStats.damageType];
    damageTypeElement.setAttribute("data-i18n", "damageTypeNames." + damageType.hrid);
    damageTypeElement.innerHTML = damageType.name;

    let attackIntervalElement = document.getElementById("combatStat_attackInterval");
    attackIntervalElement.innerHTML = (player.combatDetails.combatStats.attackInterval / 1e9).toLocaleString() + "s";

    let primaryTrainingElement = document.getElementById("combatStat_primaryTraining");
    let primaryTraining = player.combatDetails.combatStats.primaryTraining;
    primaryTrainingElement.setAttribute("data-i18n", "skillNames." + primaryTraining);
    primaryTrainingElement.innerHTML = primaryTraining;

    let focusTrainingElement = document.getElementById("combatStat_focusTraining");
    let focusTraining = player.combatDetails.combatStats.focusTraining;
    if (focusTraining) {
        focusTrainingElement.setAttribute("data-i18n", "skillNames." + focusTraining);
    } else {
        focusTrainingElement.setAttribute("data-i18n", "characterSelectPage.slots.empty");
    }
    focusTrainingElement.innerHTML = focusTraining;

    [
        "maxHitpoints",
        "maxManapoints",
        "stabAccuracyRating",
        "stabMaxDamage",
        "slashAccuracyRating",
        "slashMaxDamage",
        "smashAccuracyRating",
        "smashMaxDamage",
        "rangedAccuracyRating",
        "rangedMaxDamage",
        "magicAccuracyRating",
        "magicMaxDamage",
        "defensiveMaxDamage",
        "stabEvasionRating",
        "slashEvasionRating",
        "smashEvasionRating",
        "rangedEvasionRating",
        "magicEvasionRating",
        "totalArmor",
        "totalWaterResistance",
        "totalNatureResistance",
        "totalFireResistance",
        "totalThreat"
    ].forEach((stat) => {
        let element = document.getElementById("combatStat_" + stat);
        element.innerHTML = Math.floor(player.combatDetails[stat]);
    });

    [
        "abilityHaste",
        "tenacity"
    ].forEach((stat) => {
        let element = document.getElementById("combatStat_" + stat);
        element.innerHTML = Math.floor(player.combatDetails.combatStats[stat]);
    });

    [
        "physicalAmplify",
        "waterAmplify",
        "natureAmplify",
        "fireAmplify",
        "healingAmplify",
        "lifeSteal",
        "hpRegenPer10",
        "mpRegenPer10",
        "physicalThorns",
        "elementalThorns",
        "criticalRate",
        "criticalDamage",
        "combatExperience",
        "taskDamage",
        "armorPenetration",
        "waterPenetration",
        "naturePenetration",
        "firePenetration",
        "manaLeech",
        "castSpeed",
        "parry",
        "mayhem",
        "pierce",
        "curse",
        "fury",
        "weaken",
        "ripple",
        "bloom",
        "blaze",
        "attackSpeed",
        "autoAttackDamage",
        "abilityDamage",
        "drinkConcentration",
        "foodHaste",
        "staminaExperience",
        "intelligenceExperience",
        "attackExperience",
        "defenseExperience",
        "meleeExperience",
        "rangedExperience",
        "magicExperience"

    ].forEach((stat) => {
        let element = document.getElementById("combatStat_" + stat);
        let value = (100 * player.combatDetails.combatStats[stat]).toLocaleString([], {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4,
        });
        element.innerHTML = value + "%";
    });
}

// #endregion

// #region Level

function initLevelSection() {
    ["stamina", "intelligence", "attack", "melee", "defense", "ranged", "magic"].forEach((skill) => {
        let levelInput = document.getElementById("inputLevel_" + skill);
        levelInput.value = 1;
        levelInput.addEventListener("change", levelInputHandler);
    });
}

function levelInputHandler() {
    updateLevels();
    updateUI();
}

function updateLevels() {
    ["stamina", "intelligence", "attack", "melee", "defense", "ranged", "magic"].forEach((skill) => {
        let levelInput = document.getElementById("inputLevel_" + skill);
        player[skill + "Level"] = Number(levelInput.value);
    });
    updateCombatLevel();
}

function calcCombatLevel(staminaLevel, intelligenceLevel, defenseLevel, attackLevel, meleeLevel, rangedLevel, magicLevel) {
    return 0.1 * (staminaLevel + intelligenceLevel + attackLevel + defenseLevel + Math.max(meleeLevel, rangedLevel, magicLevel)) + 
        0.5 * Math.max(attackLevel, defenseLevel, meleeLevel, rangedLevel, magicLevel)
    ;
}


function updateCombatLevel() {
    let staminaLevel = player["staminaLevel"];
    let intelligenceLevel = player["intelligenceLevel"];
    let defenseLevel = player["defenseLevel"];
    let attackLevel = player["attackLevel"];
    let meleeLevel = player["meleeLevel"];
    let rangedLevel = player["rangedLevel"];
    let magicLevel = player["magicLevel"];

    let levelInput = document.getElementById("inputLevel_combat");
    levelInput.value = parseFloat(calcCombatLevel(staminaLevel, intelligenceLevel, defenseLevel, attackLevel, meleeLevel, rangedLevel, magicLevel).toFixed(1));
}

// #endregion

// #region Food

function initFoodSection() {
    for (let i = 0; i < 3; i++) {
        let element = document.getElementById("selectFood_" + i);

        let gameFoods = Object.values(itemDetailMap)
            .filter((item) => item.categoryHrid == "/item_categories/food")
            .sort((a, b) => a.sortIndex - b.sortIndex);

        for (const food of Object.values(gameFoods)) {
            let opt = new Option(food.name, food.hrid);
            opt.setAttribute("data-i18n", "itemNames." + food.hrid);
            element.add(opt);
        }

        element.addEventListener("change", foodSelectHandler);
    }
}

function foodSelectHandler() {
    updateFoodState();
    updateUI();
}

function updateFoodState() {
    for (let i = 0; i < 3; i++) {
        let foodSelect = document.getElementById("selectFood_" + i);
        food[i] = foodSelect.value;
        if (food[i] && !triggerMap[food[i]]) {
            let gameItem = itemDetailMap[food[i]];
            triggerMap[food[i]] = structuredClone(gameItem.consumableDetail.defaultCombatTriggers);
        }
    }
}

function updateFoodUI() {
    for (let i = 0; i < 3; i++) {
        let selectElement = document.getElementById("selectFood_" + i);
        let triggerButton = document.getElementById("buttonFoodTrigger_" + i);

        selectElement.disabled = i >= player.combatDetails.combatStats.foodSlots;
        triggerButton.disabled = i >= player.combatDetails.combatStats.foodSlots || !food[i];
    }
}

// #endregion

// #region Drinks

function initDrinksSection() {
    for (let i = 0; i < 3; i++) {
        let element = document.getElementById("selectDrink_" + i);

        let gameDrinks = Object.values(itemDetailMap)
            .filter((item) => item.categoryHrid == "/item_categories/drink")
            .filter((item) => item.consumableDetail.usableInActionTypeMap["/action_types/combat"])
            .sort((a, b) => a.sortIndex - b.sortIndex);

        for (const drink of Object.values(gameDrinks)) {
            let opt = new Option(drink.name, drink.hrid);
            opt.setAttribute("data-i18n", "itemNames." + drink.hrid);
            element.add(opt);
        }

        element.addEventListener("change", drinkSelectHandler);
    }
}

function drinkSelectHandler() {
    updateDrinksState();
    updateDrinksUI();
}

function updateDrinksState() {
    for (let i = 0; i < 3; i++) {
        let drinkSelect = document.getElementById("selectDrink_" + i);
        drinks[i] = drinkSelect.value;
        if (drinks[i] && !triggerMap[drinks[i]]) {
            let gameItem = itemDetailMap[drinks[i]];
            triggerMap[drinks[i]] = structuredClone(gameItem.consumableDetail.defaultCombatTriggers);
        }
    }
}

function updateDrinksUI() {
    for (let i = 0; i < 3; i++) {
        let selectElement = document.getElementById("selectDrink_" + i);
        let triggerButton = document.getElementById("buttonDrinkTrigger_" + i);

        selectElement.disabled = i >= player.combatDetails.combatStats.drinkSlots;
        triggerButton.disabled = i >= player.combatDetails.combatStats.drinkSlots || !drinks[i];
    }
}

// #endregion

// #region Abilities

function initAbilitiesSection() {
    for (let i = 0; i < 5; i++) {
        let selectElement = document.getElementById("selectAbility_" + i);
        let inputElement = document.getElementById("inputAbilityLevel_" + i);

        inputElement.value = 1;

        let gameAbilities;
        if (i == 0) {
            gameAbilities = Object.values(abilityDetailMap).filter(x => x.isSpecialAbility).sort((a, b) => a.sortIndex - b.sortIndex);
        } else {
            gameAbilities = Object.values(abilityDetailMap).filter(x => !x.isSpecialAbility).sort((a, b) => a.sortIndex - b.sortIndex);
        }


        for (const ability of Object.values(gameAbilities)) {
            let opt = new Option(ability.name, ability.hrid);
            opt.setAttribute("data-i18n", "abilityNames." + ability.hrid);
            selectElement.add(opt);
        }

        selectElement.addEventListener("change", abilitySelectHandler);
    }

    document.getElementById('abilityOrderSwitch').addEventListener('change', function() {
            const gear = document.getElementById('gearLabel');
            const arrow = document.getElementById('arrowLabel');
            
            if (this.checked) {
                gear.classList.remove('text-primary', 'fw-bold');
                gear.classList.add('text-secondary');
                
                arrow.classList.remove('text-secondary');
                arrow.classList.add('text-primary', 'fw-bold');
            } else {
                gear.classList.remove('text-secondary');
                gear.classList.add('text-primary', 'fw-bold');
                
                arrow.classList.remove('text-primary', 'fw-bold');
                arrow.classList.add('text-secondary');
            }

            for (let i = 0; i < 5; i++) {
                let triggerButton = document.getElementById("buttonAbilityTrigger_" + i);
                triggerButton.parentElement.style.display = this.checked ? 'none' : 'block';
                let moveButton = document.getElementById("selectAbilityMoveUp_" + i);
                moveButton.parentElement.style.display = this.checked ? 'block' : 'none';
            }
        });

}

function abilitySelectHandler() {
    updateAbilityState();
    updateAbilityUI();
}

function updateAbilityState() {
    for (let i = 0; i < 5; i++) {
        let abilitySelect = document.getElementById("selectAbility_" + i);
        abilities[i] = abilitySelect.value;
        if (abilities[i] && !triggerMap[abilities[i]]) {
            let gameAbility = abilityDetailMap[abilities[i]];
            triggerMap[abilities[i]] = structuredClone(gameAbility.defaultCombatTriggers);
        }
    }
}

function updateAbilityUI() {
    for (let i = 0; i < 5; i++) {
        let selectElement = document.getElementById("selectAbility_" + i);
        let inputElement = document.getElementById("inputAbilityLevel_" + i);
        let triggerButton = document.getElementById("buttonAbilityTrigger_" + i);

        selectElement.disabled = player.intelligenceLevel < abilitySlotsLevelRequirementList[i + 1];
        inputElement.disabled = player.intelligenceLevel < abilitySlotsLevelRequirementList[i + 1];
        triggerButton.disabled = player.intelligenceLevel < abilitySlotsLevelRequirementList[i + 1] || !abilities[i];
        let moveUpButton = document.getElementById("selectAbilityMoveUp_" + i);
        moveUpButton.onclick = () => swapAbilityOrder(i, -1);
    }
}

function swapAbilityOrder(abilityIndex, step) {
    const swapIndex = abilityIndex + step;
    if (swapIndex < 0 || swapIndex > 4) {
        return;
    }

    let abilitySelect = document.getElementById("selectAbility_" + abilityIndex);
    let abilityLevelInput = document.getElementById("inputAbilityLevel_" + abilityIndex);

    const tempAbility = abilities[abilityIndex];
    abilities[abilityIndex] = abilities[swapIndex];
    abilities[swapIndex] = tempAbility;

    const tempLevel = abilityLevelInput.value;
    abilityLevelInput.value = document.getElementById("inputAbilityLevel_" + swapIndex).value;
    document.getElementById("inputAbilityLevel_" + swapIndex).value = tempLevel;

    abilitySelect.value = document.getElementById("selectAbility_" + (swapIndex)).value;
    document.getElementById("selectAbility_" + swapIndex).value = abilities[swapIndex];

    updateAbilityState();
    updateAbilityUI();
}

// #endregion

// #region Trigger

function initTriggerModal() {
    let modal = document.getElementById("triggerModal");
    modal.addEventListener("show.bs.modal", (event) => triggerModalShownHandler(event));

    let triggerSaveButton = document.getElementById("buttonTriggerModalSave");
    triggerSaveButton.addEventListener("click", (event) => triggerModalSaveHandler(event));

    let triggerAddButton = document.getElementById("buttonAddTrigger");
    triggerAddButton.addEventListener("click", (event) => triggerAddButtonHandler(event));

    let triggerDefaultButton = document.getElementById("buttonDefaultTrigger");
    triggerDefaultButton.addEventListener("click", (event) => triggerDefaultButtonHandler(event));

    for (let i = 0; i < 4; i++) {
        let triggerDependencySelect = document.getElementById("selectTriggerDependency_" + i);
        let triggerConditionSelect = document.getElementById("selectTriggerCondition_" + i);
        let triggerComparatorSelect = document.getElementById("selectTriggerComparator_" + i);
        let triggerValueInput = document.getElementById("inputTriggerValue_" + i);
        let triggerRemoveButton = document.getElementById("buttonRemoveTrigger_" + i);

        triggerDependencySelect.addEventListener("change", (event) => triggerDependencySelectHandler(event, i));
        triggerConditionSelect.addEventListener("change", (event) => triggerConditionSelectHandler(event, i));
        triggerComparatorSelect.addEventListener("change", (event) => triggerComparatorSelectHander(event, i));
        triggerValueInput.addEventListener("change", (event) => triggerValueInputHandler(event, i));
        triggerRemoveButton.addEventListener("click", (event) => triggerRemoveButtonHandler(event, i));
    }
}

function triggerModalShownHandler(event) {
    let triggerButton = event.relatedTarget;

    let triggerType = triggerButton.getAttribute("data-bs-triggertype");
    let triggerIndex = Number(triggerButton.getAttribute("data-bs-triggerindex"));

    let triggerTarget;
    switch (triggerType) {
        case "food":
            triggerTarget = food[triggerIndex];
            break;
        case "drink":
            triggerTarget = drinks[triggerIndex];
            break;
        case "ability":
            triggerTarget = abilities[triggerIndex];
            break;
    }

    let triggerTargetnput = document.getElementById("inputModalTriggerTarget");
    triggerTargetnput.value = triggerTarget;
    modalTriggers = triggerMap[triggerTarget];
    updateTriggerModal();
}

function triggerModalSaveHandler(event) {
    let triggerTargetnput = document.getElementById("inputModalTriggerTarget");
    let triggerTarget = triggerTargetnput.value;

    triggerMap[triggerTarget] = modalTriggers;
}

function triggerDependencySelectHandler(event, index) {
    modalTriggers[index].dependencyHrid = event.target.value;
    modalTriggers[index].conditionHrid = "";
    modalTriggers[index].comparatorHrid = "";
    modalTriggers[index].value = 0;

    updateTriggerModal();
}

function triggerConditionSelectHandler(event, index) {
    modalTriggers[index].conditionHrid = event.target.value;
    modalTriggers[index].comparatorHrid = "";
    modalTriggers[index].value = 0;

    updateTriggerModal();
}

function triggerComparatorSelectHander(event, index) {
    modalTriggers[index].comparatorHrid = event.target.value;

    updateTriggerModal();
}

function triggerValueInputHandler(event, index) {
    modalTriggers[index].value = Number(event.target.value);

    updateTriggerModal();
}

function triggerRemoveButtonHandler(event, index) {
    modalTriggers.splice(index, 1);

    updateTriggerModal();
}

function triggerAddButtonHandler(event) {
    if (modalTriggers.length == 4) {
        return;
    }

    modalTriggers.push({
        dependencyHrid: "",
        conditionHrid: "",
        comparatorHrid: "",
        value: 0,
    });

    updateTriggerModal();
}

function triggerDefaultButtonHandler(event) {
    let triggerTargetnput = document.getElementById("inputModalTriggerTarget");
    let triggerTarget = triggerTargetnput.value;

    if (triggerTarget.startsWith("/items/")) {
        modalTriggers = structuredClone(itemDetailMap[triggerTarget].consumableDetail.defaultCombatTriggers);
    } else {
        modalTriggers = structuredClone(abilityDetailMap[triggerTarget].defaultCombatTriggers);
    }

    updateTriggerModal();
}

function updateTriggerModal() {
    let triggerStartTextElement = document.getElementById("triggerStartText");
    if (modalTriggers.length == 0) {
        triggerStartTextElement.innerHTML = "Activate as soon as it's off cooldown";
    } else {
        triggerStartTextElement.innerHTML = "Activate when:";
    }

    let triggerAddButton = document.getElementById("buttonAddTrigger");
    triggerAddButton.disabled = modalTriggers.length == 4;

    let triggersValid = true;

    for (let i = 0; i < 4; i++) {
        let triggerElement = document.getElementById("modalTrigger_" + i);

        if (!modalTriggers[i]) {
            hideElement(triggerElement);
            continue;
        }

        showElement(triggerElement);

        let triggerDependencySelect = document.getElementById("selectTriggerDependency_" + i);
        let triggerConditionSelect = document.getElementById("selectTriggerCondition_" + i);
        let triggerComparatorSelect = document.getElementById("selectTriggerComparator_" + i);
        let triggerValueInput = document.getElementById("inputTriggerValue_" + i);

        showElement(triggerDependencySelect);
        fillTriggerDependencySelect(triggerDependencySelect);

        if (modalTriggers[i].dependencyHrid == "") {
            hideElement(triggerConditionSelect);
            hideElement(triggerComparatorSelect);
            hideElement(triggerValueInput);
            triggersValid = false;
            continue;
        }

        triggerDependencySelect.value = modalTriggers[i].dependencyHrid;
        showElement(triggerConditionSelect);
        fillTriggerConditionSelect(triggerConditionSelect, modalTriggers[i].dependencyHrid);

        if (modalTriggers[i].conditionHrid == "") {
            hideElement(triggerComparatorSelect);
            hideElement(triggerValueInput);
            triggersValid = false;
            continue;
        }

        triggerConditionSelect.value = modalTriggers[i].conditionHrid;
        showElement(triggerComparatorSelect);
        fillTriggerComparatorSelect(triggerComparatorSelect, modalTriggers[i].conditionHrid);

        if (modalTriggers[i].comparatorHrid == "") {
            hideElement(triggerValueInput);
            triggersValid = false;
            continue;
        }

        triggerComparatorSelect.value = modalTriggers[i].comparatorHrid;

        if (combatTriggerComparatorDetailMap[modalTriggers[i].comparatorHrid].allowValue) {
            showElement(triggerValueInput);
            triggerValueInput.value = modalTriggers[i].value;
        } else {
            hideElement(triggerValueInput);
        }
    }

    let triggerSaveButton = document.getElementById("buttonTriggerModalSave");
    triggerSaveButton.disabled = !triggersValid;

    updateContent();
}

function fillTriggerDependencySelect(element) {
    element.length = 0;
    element.add(new Option("", ""));

    for (const dependency of Object.values(combatTriggerDependencyDetailMap).sort(
        (a, b) => a.sortIndex - b.sortIndex
    )) {
        let opt = new Option(dependency.name, dependency.hrid);
        opt.setAttribute("data-i18n", "combatTriggerDependencyNames." + dependency.hrid);
        element.add(opt);
    }
}

function fillTriggerConditionSelect(element, dependencyHrid) {
    let dependency = combatTriggerDependencyDetailMap[dependencyHrid];

    let conditions;
    if (dependency.isSingleTarget) {
        conditions = Object.values(combatTriggerConditionDetailMap).filter((condition) => condition.isSingleTarget);
    } else {
        conditions = Object.values(combatTriggerConditionDetailMap).filter((condition) => condition.isMultiTarget);
    }

    element.length = 0;
    element.add(new Option("", ""));

    for (const condition of Object.values(conditions).sort((a, b) => a.sortIndex - b.sortIndex)) {
        let opt = new Option(condition.name, condition.hrid);
        opt.setAttribute("data-i18n", "combatTriggerConditionNames." + condition.hrid);
        element.add(opt);
    }
}

function fillTriggerComparatorSelect(element, conditionHrid) {
    let condition = combatTriggerConditionDetailMap[conditionHrid];

    let comparators = condition.allowedComparatorHrids.map((hrid) => combatTriggerComparatorDetailMap[hrid]);

    element.length = 0;
    element.add(new Option("", ""));

    for (const comparator of Object.values(comparators).sort((a, b) => a.sortIndex - b.sortIndex)) {
        let opt = new Option(comparator.name, comparator.hrid);
        opt.setAttribute("data-i18n", "combatTriggerComparatorNames." + comparator.hrid);
        element.add(opt);
    }
}

function hideElement(element) {
    element.classList.remove("d-flex");
    element.classList.add("d-none");
}

function showElement(element) {
    element.classList.remove("d-none");
    element.classList.add("d-flex");
}

// #endregion

// #region Zones

function initZones() {
    let zoneSelect = document.getElementById("selectZone");

    // TOOD dungeon wave spawns
    let gameZones = Object.values(actionDetailMap)
        .filter((action) => action.type == "/action_types/combat" && action.category != "/action_categories/combat/dungeons")
        .sort((a, b) => a.sortIndex - b.sortIndex);

    for (const zone of Object.values(gameZones)) {
        let opt = new Option(zone.name, zone.hrid);
        opt.setAttribute("data-i18n", "actionNames." + zone.hrid);
        zoneSelect.add(opt);
    }


    let zoneCheckBox = document.getElementById("zoneCheckBox");
    let checkAllZonesToggle = document.getElementById('checkAllZones');

    let simAllZonesToggle = document.getElementById("simAllZoneToggle");
    simAllZonesToggle.addEventListener("change", (event) => {
        if (simAllZonesToggle.checked) {
            zoneCheckBox.classList.remove("d-none");
            zoneCheckBox.querySelectorAll(".zone-checkbox").forEach(checkbox => checkbox.checked = true);
            checkAllZonesToggle.checked = true;
        } else {
            zoneCheckBox.classList.add("d-none");
        }
    });

    let zoneHrids = Object.values(actionDetailMap)
        .filter((action) => action.type == "/action_types/combat" && action.category != "/action_categories/combat/dungeons" && action.combatZoneInfo.fightInfo.randomSpawnInfo.maxSpawnCount > 1)
        .sort((a, b) => a.sortIndex - b.sortIndex)
        .flat();

    for (const zoneHrid of zoneHrids) {
        const newZone = document.createElement('div');
        newZone.classList.add('form-check');
        newZone.innerHTML = `
            <input class="form-check-input zone-checkbox" type="checkbox" id="${zoneHrid.hrid}">
            <label class="form-check-label" for="${zoneHrid.hrid}" data-i18n="actionNames.${zoneHrid.hrid}">
                ${zoneHrid.name}
            </label>
        `;
        zoneCheckBox.append(newZone);
    }

    let checkZoneToggles = document.querySelectorAll('.zone-checkbox');
    checkAllZonesToggle.addEventListener('change', () => {
        checkZoneToggles.forEach(cb => cb.checked = checkAllZonesToggle.checked);
    });

    checkZoneToggles.forEach(cb =>
        cb.addEventListener('change', () => {
            checkAllZonesToggle.checked = [...checkZoneToggles].every(x => x.checked);
        })
    );


    let soloCheckBox = document.getElementById("soloCheckBox");
    let checkAllSolosToggle = document.getElementById('checkAllSolos');

    let simAllSoloToggle = document.getElementById("simAllSoloToggle");
    simAllSoloToggle.addEventListener("change", (event) => {
        if (simAllSoloToggle.checked) {
            soloCheckBox.classList.remove("d-none");
            soloCheckBox.querySelectorAll(".solo-checkbox").forEach(checkbox => checkbox.checked = true);
            checkAllSolosToggle.checked = true;
        } else {
            soloCheckBox.classList.add("d-none");
        }
    });

    let soloHrids = Object.values(actionDetailMap)
        .filter((action) => action.type == "/action_types/combat" && action.category != "/action_categories/combat/dungeons" && action.combatZoneInfo.fightInfo.randomSpawnInfo.maxSpawnCount == 1)
        .sort((a, b) => a.sortIndex - b.sortIndex)
        .flat();

    for (const zoneHrid of soloHrids) {
        const newZone = document.createElement('div');
        newZone.classList.add('form-check');
        newZone.innerHTML = `
            <input class="form-check-input solo-checkbox" type="checkbox" id="${zoneHrid.hrid}">
            <label class="form-check-label" for="${zoneHrid.hrid}" data-i18n="actionNames.${zoneHrid.hrid}">
                ${zoneHrid.name}
            </label>
        `;
        soloCheckBox.append(newZone);
    }

    let checkSoloToggles = document.querySelectorAll('.solo-checkbox');
    checkAllSolosToggle.addEventListener('change', () => {
        checkSoloToggles.forEach(cb => cb.checked = checkAllSolosToggle.checked);
    });

    checkSoloToggles.forEach(cb =>
        cb.addEventListener('change', () => {
            checkAllSolosToggle.checked = [...checkSoloToggles].every(x => x.checked);
        })
    );
}

function initDungeons() {
    let dungeonSelect = document.getElementById("selectDungeon");

    let gameDungeons = Object.values(actionDetailMap)
        .filter((action) => action.type == "/action_types/combat" && action.category == "/action_categories/combat/dungeons")
        .sort((a, b) => a.sortIndex - b.sortIndex);

    for (const dungeon of Object.values(gameDungeons)) {
        let opt = new Option(dungeon.name, dungeon.hrid);
        opt.setAttribute("data-i18n", "actionNames." + dungeon.hrid);
        dungeonSelect.add(opt);
    }
}

let LabyrinthSupplyItems =
{
    TeaCrates: ["/items/basic_tea_crate", "/items/advanced_tea_crate", "/items/expert_tea_crate"],
    CoffeeCrates: ["/items/basic_coffee_crate", "/items/advanced_coffee_crate", "/items/expert_coffee_crate"],
    FoodCrates: ["/items/basic_food_crate", "/items/advanced_food_crate", "/items/expert_food_crate"]
};

let isLabyRinthSim = false;

function initLabyrinth() {
    let labyrinthSelect = document.getElementById("selectLabyrinth");

    let gameLabyrinths = Object.values(combatMonsterDetailMap)
        .filter((monster) => monster.isLabyrinthMonster === true)
        .sort((a, b) => a.sortIndex - b.sortIndex);

    for (const labyrinth of Object.values(gameLabyrinths)) {
        let opt = new Option(labyrinth.name, labyrinth.hrid);
        opt.setAttribute("data-i18n", "monsterNames." + labyrinth.hrid);
        labyrinthSelect.add(opt);
    }

    Object.keys(LabyrinthSupplyItems).forEach((categoryKey, index) => {
        const items = LabyrinthSupplyItems[categoryKey];

        const categorySelect = document.getElementById('select'+categoryKey);
        if (!categorySelect) return;

        // Create radio buttons
        items.forEach((item, itemIndex) => {
            let opt = new Option(item, item);
            opt.setAttribute("data-i18n", "itemNames." + item);
            categorySelect.add(opt);
        });
    });


    const updateLabyrinthToggle = () => {
        let isLabyrinth = simLabyrinthToggle.checked || simAllLabyrinthsToggle.checked;
        if (isLabyRinthSim === isLabyrinth) return;

        const labyrinthSupplyItemsBox = document.getElementById('labyrinthSupplyItemsBox');
        if (!isLabyRinthSim) {
            labyrinthSupplyItemsBox.classList.remove("d-none");
        } else {
            labyrinthSupplyItemsBox.classList.add("d-none");
        }
        isLabyRinthSim = isLabyrinth;
    }
    const simLabyrinthToggle = document.getElementById('simLabyrinthToggle');
    simLabyrinthToggle.onchange = updateLabyrinthToggle;
    const simAllLabyrinthsToggle = document.getElementById('simAllLabyrinthsToggle');
    simAllLabyrinthsToggle.onchange = updateLabyrinthToggle;

}

// #endregion

// #region Simulation Result

function createDamageDoneAccordion(enemyIndex) {
    const accordionDiv = createElement('div', 'row d-none', '', `simulationResultDamageDoneAccordionEnemy${enemyIndex}`);

    const colDiv = createElement('div', 'col');
    const accordionMainDiv = createElement('div', 'accordion');
    const accordionItemDiv = createElement('div', 'accordion-item');

    const headerH2 = createElement('h2', 'accordion-header');
    const button = createElement('button', 'accordion-button collapsed',
        `<b>Damage Done (Enemy ${enemyIndex})</b>`,
        `buttonSimulationResultDamageDoneAccordionEnemy${enemyIndex}`
    );
    button.setAttribute('type', 'button');
    button.setAttribute('data-bs-toggle', 'collapse');
    button.setAttribute('data-bs-target', `#collapseDamageDone${enemyIndex}`);
    button.style.padding = '0.5em';

    const collapseDiv = createElement('div', 'accordion-collapse collapse', '', `collapseDamageDone${enemyIndex}`);
    const accordionBodyDiv = createElement('div', 'accordion-body');

    const headerRow = createElement('div', 'row');
    headerRow.innerHTML = `
        <div class="col-md-5"><b data-i18n="common:simulationResults.source">Source</b></div>
        <div class="col-md-3 text-end"><b data-i18n="common:simulationResults.hitChance">Hitchance</b></div>
        <div class="col-md-2 text-end"><b>DPS</b></div>
        <div class="col-md-2 text-end"><b>%</b></div>
    `;

    const resultDiv = createElement('div', '', '', `simulationResultDamageDoneEnemy${enemyIndex}`);

    accordionBodyDiv.appendChild(headerRow);
    accordionBodyDiv.appendChild(resultDiv);
    collapseDiv.appendChild(accordionBodyDiv);
    headerH2.appendChild(button);
    accordionItemDiv.appendChild(headerH2);
    accordionItemDiv.appendChild(collapseDiv);
    accordionMainDiv.appendChild(accordionItemDiv);
    colDiv.appendChild(accordionMainDiv);
    accordionDiv.appendChild(colDiv);

    return accordionDiv;
}
function createDamageTakenAccordion(enemyIndex) {
    const accordionDiv = createElement('div', 'row d-none', '', `simulationResultDamageTakenAccordionEnemy${enemyIndex}`);

    const colDiv = createElement('div', 'col');
    const accordionMainDiv = createElement('div', 'accordion');
    const accordionItemDiv = createElement('div', 'accordion-item');

    const headerH2 = createElement('h2', 'accordion-header');
    const button = createElement('button', 'accordion-button collapsed',
        `<b>Damage Taken (Enemy ${enemyIndex})</b>`,
        `buttonSimulationResultDamageTakenAccordionEnemy${enemyIndex}`
    );
    button.setAttribute('type', 'button');
    button.setAttribute('data-bs-toggle', 'collapse');
    button.setAttribute('data-bs-target', `#collapseDamageTaken${enemyIndex}`);
    button.style.padding = '0.5em';

    const collapseDiv = createElement('div', 'accordion-collapse collapse', '', `collapseDamageTaken${enemyIndex}`);
    const accordionBodyDiv = createElement('div', 'accordion-body');

    const headerRow = createElement('div', 'row');
    headerRow.innerHTML = `
        <div class="col-md-5"><b data-i18n="common:simulationResults.source">Source</b></div>
        <div class="col-md-3 text-end"><b data-i18n="common:simulationResults.hitChance">Hitchance</b></div>
        <div class="col-md-2 text-end"><b>DPS</b></div>
        <div class="col-md-2 text-end"><b>%</b></div>
    `;

    const resultDiv = createElement('div', '', '', `simulationResultDamageTakenEnemy${enemyIndex}`);

    accordionBodyDiv.appendChild(headerRow);
    accordionBodyDiv.appendChild(resultDiv);
    collapseDiv.appendChild(accordionBodyDiv);
    headerH2.appendChild(button);
    accordionItemDiv.appendChild(headerH2);
    accordionItemDiv.appendChild(collapseDiv);
    accordionMainDiv.appendChild(accordionItemDiv);
    colDiv.appendChild(accordionMainDiv);
    accordionDiv.appendChild(colDiv);

    return accordionDiv;
}


function initDamageDoneTaken() {
    const damageDoneDetails = document.getElementById("simulationResultDamageDoneDetails");
    const damageTakenDetails = document.getElementById("simulationResultDamageTakenDetails");
    for (let i = 1; i <= 64; i++) {
        damageDoneDetails.appendChild(createDamageDoneAccordion(i));
        damageTakenDetails.appendChild(createDamageTakenAccordion(i));
    }
}

function resetDamageDetails() {
    const entry = document.getElementById("simulationResultDamageDetailsEntry");
    const details = document.getElementById("simulationResultDamageDetails");
    const button = document.getElementById("buttonSimulationResultDamageDetails");
    entry.classList.add("d-none");
    details.classList.remove("show");
    button.classList.add("collapsed");
    button.setAttribute("aria-expanded", "false");

    for (let i = 1; i <= 64; i++) {
        for (const kind of ["DamageDone", "DamageTaken"]) {
            document.getElementById(`collapse${kind}${i}`)?.classList.remove("show");
            const nestedButton = document.getElementById(
                `buttonSimulationResult${kind}AccordionEnemy${i}`,
            );
            nestedButton?.classList.add("collapsed");
            nestedButton?.setAttribute("aria-expanded", "false");
        }
    }
}

function showDamageDetailsEntry() {
    document.getElementById("simulationResultDamageDetailsEntry").classList.remove("d-none");
}

function showSimulationResult(simResult) {
    currentSimResults = simResult;
    resetDamageDetails();
    let playerToDisplay = selectedPlayers.length > 0
        ? "player" + selectedPlayers[0]
        : "player1";
    if (selectedPlayers.includes(parseInt(currentPlayerTabId))) {
        playerToDisplay = "player" + currentPlayerTabId;
    }
    if (!simResult.dropRateMultiplier[playerToDisplay]) {
        return;
    }

    showKills(simResult, playerToDisplay);
    showDeaths(simResult, playerToDisplay);
    showExperienceGained(simResult, playerToDisplay);
    showConsumablesUsed(simResult, playerToDisplay);
    showHpSpent(simResult, playerToDisplay);
    showManaUsed(simResult, playerToDisplay);
    showHitpointsGained(simResult, playerToDisplay);
    showManapointsGained(simResult, playerToDisplay);
    showDamageDone(simResult, playerToDisplay);
    showDamageTaken(simResult, playerToDisplay);
    renderWipeEvents(simResult);
    
    // 显示战斗图表
    if (document.getElementById('hpMpVisualizationToggle').checked) {
        renderCombatCharts(simResult);
    }
}

function showAllSimulationResults(simResults) {
    let displaySimResults = manipulateSimResultsDataForDisplay(simResults);
    updateAllSimsModal(displaySimResults);

    let isLabyrinth = simResults?.[0].isLabyrinth ?? false;
    if (isLabyrinth) {
        const table = document.getElementById('allZonesData');
        const rows = table.getElementsByTagName('tr');
        const col = 3;

        for (let row = 1; row < rows.length; row++) {
            const cell = rows[row].cells[col];
            const value = parseFloat(cell.textContent.replace(/,/g, ''));
            if (value >= 30) {
                cell.style.backgroundColor = 'green';
                cell.style.color = 'white';
            }
        }        
    } else {
        const table = document.getElementById('allZonesData');
        const rows = table.getElementsByTagName('tr');
        const numCols = rows[0].cells.length;

        // 遍历每一列
        for (let col = 5; col < numCols; col++) {
            let max = -Infinity;
            let maxCell = null;

            // 找到最大值及其单元格
            for (let row = 1; row < rows.length; row++) {
                const cell = rows[row].cells[col];
                const value = parseFloat(cell.textContent.replace(/,/g, ''));
                if (value > max) {
                    max = value;
                    maxCell = cell;
                }
            }

            if (maxCell && max != 0) {
                maxCell.style.backgroundColor = 'green';
                maxCell.style.color = 'white';
            }
        }
    }
}

// #region 战斗图表功能

let combatCharts = {
    hpChart: null,
    mpChart: null
};

let lastUpdateTime = 0;
const UPDATE_INTERVAL = 1000; // 每秒更新一次图表

// 实时更新图表
function updateChartsRealtime(timeSeriesData) {
    // 节流：避免过于频繁的更新
    const now = Date.now();
    if (now - lastUpdateTime < UPDATE_INTERVAL) {
        return;
    }
    lastUpdateTime = now;
    
    if (!timeSeriesData || !timeSeriesData.timestamps || timeSeriesData.timestamps.length === 0) {
        return;
    }
    
    // 显示图表容器
    const container = document.getElementById('combatChartsContainer');
    if (container) {
        container.classList.remove('d-none');
    }
    
    // 如果图表不存在，先创建
    if (!combatCharts.hpChart || !combatCharts.mpChart) {
        initializeRealtimeCharts();
        // 等待下一次更新周期再更新数据
        return;
    }
    
    const timeLabels = timeSeriesData.timestamps.map(t => (t / ONE_SECOND).toFixed(1));
    const playerIds = Object.keys(timeSeriesData.players);
    
    // 生成颜色方案
    const colors = [
        { border: 'rgb(75, 192, 192)', bg: 'rgba(75, 192, 192, 0.2)' },
        { border: 'rgb(255, 99, 132)', bg: 'rgba(255, 99, 132, 0.2)' },
        { border: 'rgb(54, 162, 235)', bg: 'rgba(54, 162, 235, 0.2)' },
        { border: 'rgb(255, 206, 86)', bg: 'rgba(255, 206, 86, 0.2)' },
        { border: 'rgb(153, 102, 255)', bg: 'rgba(153, 102, 255, 0.2)' }
    ];
    
    // 重建datasets以确保完整更新
    const hpDatasets = playerIds.map((playerId, index) => {
        const playerData = timeSeriesData.players[playerId];
        return {
            label: playerId + ' HP',
            data: playerData.hp,
            borderColor: colors[index % colors.length].border,
            backgroundColor: colors[index % colors.length].bg,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
        };
    });
    
    const mpDatasets = playerIds.map((playerId, index) => {
        const playerData = timeSeriesData.players[playerId];
        return {
            label: playerId + ' MP',
            data: playerData.mp,
            borderColor: colors[index % colors.length].border,
            backgroundColor: colors[index % colors.length].bg,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
        };
    });
    
    // 更新HP图表
    combatCharts.hpChart.data.labels = timeLabels;
    combatCharts.hpChart.data.datasets = hpDatasets;
    combatCharts.hpChart.options.plugins.legend.display = true;
    combatCharts.hpChart.options.plugins.title.text = i18next.t('common:Experiment.hpOverTime');
    combatCharts.hpChart.update('none');
    
    // 更新MP图表
    combatCharts.mpChart.data.labels = timeLabels;
    combatCharts.mpChart.data.datasets = mpDatasets;
    combatCharts.mpChart.options.plugins.legend.display = true;
    combatCharts.mpChart.options.plugins.title.text = i18next.t('common:Experiment.mpOverTime');
    combatCharts.mpChart.update('none');
}

function renderCombatCharts(simResult) {
    // 显示图表容器
    const container = document.getElementById('combatChartsContainer');
    if (container) {
        container.classList.remove('d-none');
    }
    
    if (!simResult.timeSeriesData || !simResult.timeSeriesData.timestamps || simResult.timeSeriesData.timestamps.length === 0) {
        // 显示空状态
        showEmptyCharts();
        return;
    }
    
    const timeLabels = simResult.timeSeriesData.timestamps.map(t => (t / ONE_SECOND).toFixed(1));
    
    // 获取所有玩家
    const playerIds = Object.keys(simResult.timeSeriesData.players);
    
    // 生成颜色方案
    const colors = [
        { border: 'rgb(75, 192, 192)', bg: 'rgba(75, 192, 192, 0.2)' },
        { border: 'rgb(255, 99, 132)', bg: 'rgba(255, 99, 132, 0.2)' },
        { border: 'rgb(54, 162, 235)', bg: 'rgba(54, 162, 235, 0.2)' },
        { border: 'rgb(255, 206, 86)', bg: 'rgba(255, 206, 86, 0.2)' },
        { border: 'rgb(153, 102, 255)', bg: 'rgba(153, 102, 255, 0.2)' }
    ];
    
    // HP图表
    destroyChart('hpChart');
    const hpDatasets = playerIds.map((playerId, index) => {
        const playerData = simResult.timeSeriesData.players[playerId];
        return {
            label: playerId + ' HP',
            data: playerData.hp,
            borderColor: colors[index % colors.length].border,
            backgroundColor: colors[index % colors.length].bg,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
        };
    });
    
    combatCharts.hpChart = new Chart(document.getElementById('hpChart'), {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: hpDatasets
        },
        options: getChartOptions(i18next.t('common:Experiment.hpOverTime'), i18next.t('common:Experiment.timeInSeconds'), 'HP')
    });
    
    // MP图表
    destroyChart('mpChart');
    const mpDatasets = playerIds.map((playerId, index) => {
        const playerData = simResult.timeSeriesData.players[playerId];
        return {
            label: playerId + ' MP',
            data: playerData.mp,
            borderColor: colors[index % colors.length].border,
            backgroundColor: colors[index % colors.length].bg,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
        };
    });
    
    combatCharts.mpChart = new Chart(document.getElementById('mpChart'), {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: mpDatasets
        },
        options: getChartOptions(i18next.t('common:Experiment.mpOverTime'), i18next.t('common:Experiment.timeInSeconds'), 'MP')
    });
}

function destroyChart(chartName) {
    if (combatCharts[chartName]) {
        combatCharts[chartName].destroy();
        combatCharts[chartName] = null;
    }
}

function getChartOptions(title, xLabel, yLabel) {
    return {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    color: '#eee',
                    font: {
                        size: 11
                    }
                }
            },
            title: {
                display: true,
                text: title,
                color: '#eee',
                font: {
                    size: 14
                }
            }
        },
        scales: {
            x: {
                display: true,
                title: {
                    display: true,
                    text: xLabel,
                    color: '#eee'
                },
                ticks: {
                    color: '#ccc',
                    maxTicksLimit: 10
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                }
            },
            y: {
                display: true,
                title: {
                    display: true,
                    text: yLabel,
                    color: '#eee'
                },
                ticks: {
                    color: '#ccc'
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                }
            }
        },
        interaction: {
            intersect: false,
            mode: 'index'
        }
    };
}

// 初始化实时图表（用于模拟过程中更新）
function initializeRealtimeCharts() {
    // 销毁现有图表
    destroyChart('hpChart');
    destroyChart('mpChart');
    
    const hpCanvas = document.getElementById('hpChart');
    const mpCanvas = document.getElementById('mpChart');
    
    if (!hpCanvas || !mpCanvas) {
        console.warn('图表canvas元素未找到');
        return;
    }
    
    // 显示等待状态
    const emptyOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { display: false },
            title: {
                display: true,
                text: i18next.t('common:Experiment.waitingForData'),
                color: '#888',
                font: { size: 14 }
            }
        },
        scales: {
            x: {
                display: true,
                ticks: { color: '#555' },
                grid: { color: 'rgba(255, 255, 255, 0.05)' }
            },
            y: {
                display: true,
                ticks: { color: '#555' },
                grid: { color: 'rgba(255, 255, 255, 0.05)' }
            }
        }
    };
    
    try {
        combatCharts.hpChart = new Chart(hpCanvas, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: emptyOptions
        });
        
        combatCharts.mpChart = new Chart(mpCanvas, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: emptyOptions
        });
    } catch (e) {
        console.error('创建图表时出错:', e);
    }
}

// 显示空图表状态
function showEmptyCharts() {
    initializeRealtimeCharts();
}

// 初始化HP/MP可视化开关事件
function initHpMpVisualization() {
    const toggle = document.getElementById('hpMpVisualizationToggle');
    const container = document.getElementById('combatChartsContainer');

    const enableHpMpVisualization = localStorage.getItem('enableHpMpVisualization');
    if (enableHpMpVisualization === 'true') {
        toggle.checked = true;
        container.classList.remove('d-none');
        showEmptyCharts();
    }
    
    if (toggle && container) {
        toggle.addEventListener('change', function() {
            if (this.checked) {
                container.classList.remove('d-none');
                showEmptyCharts();
            } else {
                container.classList.add('d-none');
                destroyChart('hpChart');
                destroyChart('mpChart');
            }
            localStorage.setItem('enableHpMpVisualization', this.checked);
        });
    }
}

// #endregion

function manipulateSimResultsDataForDisplay(simResults) {
    let displaySimResults = [];
    for (let i = 0; i < simResults.length; i++) {
        for (let j = 0; j < selectedPlayers.length; j++) {
            let playerToDisplay = "player" + selectedPlayers[j].toString();
            let simResult = simResults[i];
            let hoursSimulated = simResult.simulatedTime / ONE_HOUR;
            let zoneName = simResult.zoneName;
            let difficultyTier = simResult.difficultyTier;
            if (simResult.isLabyrinth) {
                zoneName = simResult.labyrinthName;
                difficultyTier = simResult.roomLevel;
            }

            let encountersPerHour = (simResult.encounters / hoursSimulated).toFixed(1);
            let playerDeaths = simResult.deaths[playerToDisplay] ?? 0;
            let deathsPerHour = (playerDeaths / hoursSimulated).toFixed(2);

            let totalExperience = 0;
            if (simResult.experienceGained[playerToDisplay]) {
                totalExperience = Object.values(simResult.experienceGained[playerToDisplay]).reduce((prev, cur) => prev + cur, 0);
            }
            let totalExperiencePerHour = (totalExperience / hoursSimulated).toFixed(0);

            let experiencePerHour = {};
            const skills = ["Stamina", "Intelligence", "Attack", "Melee", "Defense", "Ranged", "Magic"];
            skills.forEach((skill) => {
                const skillLower = skill.toLowerCase();
                let experience = simResult.experienceGained[playerToDisplay]?.[skillLower] ?? 0;
                let experiencePerHourValue = 0;
                if (experience != 0) {
                    experiencePerHourValue = (experience / hoursSimulated).toFixed(0);
                }
                experiencePerHour[skill] = experiencePerHourValue;
            });
            let displaySimRow = {
                "ZoneName": zoneName, "DifficultyTier": difficultyTier, "Player": playerToDisplay, "Encounters": encountersPerHour, "Deaths": deathsPerHour,
                "TotalExperience": totalExperiencePerHour, "Stamina": experiencePerHour["Stamina"],
                "Intelligence": experiencePerHour["Intelligence"], "Attack": experiencePerHour["Attack"],
                "Magic": experiencePerHour["Magic"], "Ranged": experiencePerHour["Ranged"],
                "Melee": experiencePerHour["Melee"], "Defense": experiencePerHour["Defense"]
            };
            displaySimResults.push(displaySimRow);
        }
    }
    return displaySimResults;
}

function calcExpectedDropMap(simResult, playerToDisplay) {
    let dropRateMultiplier = simResult.dropRateMultiplier[playerToDisplay];
    let rareFindMultiplier = simResult.rareFindMultiplier[playerToDisplay];
    let combatDropQuantity = simResult.combatDropQuantity[playerToDisplay];
    let debuffOnLevelGap = simResult.debuffOnLevelGap[playerToDisplay];

    let numberOfPlayers = simResult.numberOfPlayers;
    let monsters = Object.keys(simResult.deaths)
        .filter(enemy => enemy !== "player1" && enemy !== "player2" && enemy !== "player3" && enemy !== "player4" && enemy !== "player5")
        .sort();

    const expectedDropMap = new Map();
    for (const monster of monsters) {
        const monsterDetail = combatMonsterDetailMap[monster];
        if (!monsterDetail) {
            continue;
        }

        const quantityMultiplier = (1 + debuffOnLevelGap) * (1 + combatDropQuantity);
        const addExpectedDrop = (drop, dropRate) => {
            if (drop.minDifficultyTier > simResult.difficultyTier || dropRate <= 0) {
                return;
            }
            const averageCount = (drop.maxCount + drop.minCount) / 2;
            const expectedAmount = simResult.deaths[monster]
                * dropRate
                * averageCount
                * quantityMultiplier
                / numberOfPlayers;
            expectedDropMap.set(
                drop.itemHrid,
                (expectedDropMap.get(drop.itemHrid) ?? 0) + expectedAmount,
            );
        };

        for (const drop of monsterDetail.dropTable ?? []) {
            const difficultyMultiplier = 1.0 + 0.1 * simResult.difficultyTier;
            const tierAdjustedDropRate = Math.min(
                1.0,
                difficultyMultiplier
                    * (drop.dropRate + (drop.dropRatePerDifficultyTier ?? 0) * simResult.difficultyTier),
            );
            addExpectedDrop(drop, Math.min(1.0, tierAdjustedDropRate * dropRateMultiplier));
        }
        for (const drop of monsterDetail.rareDropTable ?? []) {
            addExpectedDrop(drop, drop.dropRate * rareFindMultiplier);
        }
    }

    return expectedDropMap;
}

// #region Simulation History

function interpolateSimulationHistoryFallback(fallback, values = {}) {
    return Object.entries(values).reduce(
        (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
        fallback,
    );
}

function getSimulationHistoryText(key, fallback, values = {}) {
    const translationKey = `common:simulationHistory.${key}`;
    try {
        const translated = i18next.t(translationKey, values);
        if (translated && translated !== translationKey) {
            return translated;
        }
    } catch {
        // i18next may still be initializing during the first render.
    }
    return interpolateSimulationHistoryFallback(fallback, values);
}

function getLocalizedHistoryValue(translationKey, fallback) {
    try {
        const translated = i18next.t(translationKey);
        if (translated && translated !== translationKey) {
            return translated;
        }
    } catch {
        // Use the supplied fallback while translations are unavailable.
    }
    return fallback;
}

function formatSimulationHistoryNumber(value, maximumFractionDigits = 2) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return "0";
    }
    return number.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits,
    });
}

function formatSimulationHistoryDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value ?? "") : date.toLocaleString();
}

function formatSimulationHistorySize(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getSimulationHistoryMapName(record) {
    const translationKey = record.mapType === "labyrinth"
        ? `monsterNames.${record.mapHrid}`
        : `actionNames.${record.mapHrid}`;
    const fallback = record.mapHrid?.split("/").pop()?.replaceAll("_", " ") || record.mapHrid;
    return getLocalizedHistoryValue(translationKey, fallback);
}

function getSimulationHistoryDifficulty(record) {
    return record.mapType === "labyrinth"
        ? `Lv. ${formatSimulationHistoryNumber(record.difficulty, 0)}`
        : `T${formatSimulationHistoryNumber(record.difficulty, 0)}`;
}

function getCurrentSimulationHistoryMapKey() {
    if (document.getElementById("simLabyrinthToggle")?.checked) {
        const hrid = document.getElementById("selectLabyrinth")?.value;
        return hrid ? `labyrinth:${hrid}` : "";
    }
    if (document.getElementById("simDungeonToggle")?.checked) {
        const hrid = document.getElementById("selectDungeon")?.value;
        return hrid ? `dungeon:${hrid}` : "";
    }
    const hrid = document.getElementById("selectZone")?.value;
    return hrid ? `zone:${hrid}` : "";
}

function captureSimulationHistoryContext(selectedPlayerNumbers) {
    const players = selectedPlayerNumbers.map((playerNumber) => {
        const playerKey = `player${playerNumber}`;
        const tabName = document.getElementById(`${playerKey}-tab`)?.textContent?.trim();
        return {
            slot: String(playerNumber),
            playerKey,
            name: tabName || `Player ${playerNumber}`,
        };
    });

    return {
        startedAt: new Date().toISOString(),
        teamPresetName: document.getElementById("inputTeamPresetName")?.value?.trim() ?? "",
        players,
    };
}

function setSimulationHistoryStatus(message = "", style = "muted") {
    const status = document.getElementById("simulationHistoryStatus");
    if (!status) {
        return;
    }
    status.textContent = message;
    status.className = `small mt-2 text-${style}`;
}

function updateSimulationHistoryCount() {
    const count = document.getElementById("simulationHistoryCount");
    if (count) {
        count.textContent = simulationHistoryRecords.length.toLocaleString();
    }
}

async function saveCompletedSimulationHistory(simResult) {
    const context = pendingSimulationHistoryContext;
    pendingSimulationHistoryContext = null;
    if (!context) {
        return;
    }

    const expectedDropsByPlayer = {};
    if (!simResult.isDungeon) {
        for (const playerContext of context.players) {
            if (!simResult.dropRateMultiplier?.[playerContext.playerKey]) {
                continue;
            }
            expectedDropsByPlayer[playerContext.playerKey] = Object.fromEntries(
                calcExpectedDropMap(simResult, playerContext.playerKey),
            );
        }
    }

    const record = buildSimulationHistoryRecord({
        simResult,
        players: context.players,
        expectedDropsByPlayer,
        teamPresetName: context.teamPresetName,
        startedAt: context.startedAt,
    });

    try {
        await saveSimulationHistoryRecord(record);
        simulationHistoryRecords = await loadSimulationHistoryRecords();
        updateSimulationHistoryCount();
        if (document.getElementById("simulationHistoryModal")?.classList.contains("show")) {
            renderSimulationHistory({ preferredMapKey: record.mapKey });
        }
        const message = getSimulationHistoryText(
            "saved",
            "Simulation history saved: {{map}} {{difficulty}}",
            {
                map: getSimulationHistoryMapName(record),
                difficulty: getSimulationHistoryDifficulty(record),
            },
        );
        setSimulationHistoryStatus(message, "success");
        document.getElementById("buttonSimulationHistory")?.setAttribute("title", message);
    } catch (error) {
        console.warn("Unable to save simulation history.", error);
        setSimulationHistoryStatus(
            getSimulationHistoryText(
                "saveError",
                "The simulation completed, but its history could not be saved.",
            ),
            "danger",
        );
    }
}

function createSimulationHistoryCell(text, className = "") {
    const cell = document.createElement("td");
    cell.textContent = text;
    if (className) {
        cell.className = className;
    }
    return cell;
}

function getSimulationHistoryRecordOptionText(record) {
    const preset = record.teamPresetName || getSimulationHistoryText("unknownPreset", "Unnamed team");
    return `${formatSimulationHistoryDate(record.createdAt)} · ${getSimulationHistoryDifficulty(record)} · ${preset}`;
}

function fillSimulationHistoryRecordSelect(select, records, preferredValue, fallbackIndex) {
    select.replaceChildren();
    select.add(new Option(getSimulationHistoryText("selectRecord", "Select a record"), ""));
    records.forEach((record) => select.add(new Option(getSimulationHistoryRecordOptionText(record), record.id)));

    if (records.some((record) => record.id === preferredValue)) {
        select.value = preferredValue;
    } else if (records[fallbackIndex]) {
        select.value = records[fallbackIndex].id;
    }
}

function renderSimulationHistoryRecordRows(records) {
    const rows = document.getElementById("simulationHistoryRecordRows");
    rows.replaceChildren();

    if (records.length === 0) {
        const row = document.createElement("tr");
        const cell = createSimulationHistoryCell(
            getSimulationHistoryText("emptyMap", "There are no records for this map."),
            "text-center text-muted py-4",
        );
        cell.colSpan = 7;
        row.appendChild(cell);
        rows.appendChild(row);
        return;
    }

    for (const record of records) {
        const row = document.createElement("tr");
        row.appendChild(createSimulationHistoryCell(formatSimulationHistoryDate(record.createdAt)));
        row.appendChild(createSimulationHistoryCell(getSimulationHistoryDifficulty(record)));
        row.appendChild(createSimulationHistoryCell(
            record.teamPresetName || getSimulationHistoryText("unknownPreset", "Unnamed team"),
        ));
        row.appendChild(createSimulationHistoryCell(record.playerNames.join(", ")));
        row.appendChild(createSimulationHistoryCell(
            getSimulationHistoryText("hours", "{{hours}} hours", {
                hours: formatSimulationHistoryNumber(record.simulationHours),
            }),
            "text-end",
        ));
        row.appendChild(createSimulationHistoryCell(
            formatSimulationHistoryNumber(record.encountersPerHour),
            "text-end",
        ));

        const actionCell = document.createElement("td");
        actionCell.className = "text-nowrap";
        const detailButton = document.createElement("button");
        detailButton.type = "button";
        detailButton.className = "btn btn-outline-primary btn-sm me-2";
        detailButton.dataset.historyAction = "details";
        detailButton.dataset.recordId = record.id;
        detailButton.textContent = getSimulationHistoryText("details", "Details");
        actionCell.appendChild(detailButton);

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "btn btn-outline-danger btn-sm";
        deleteButton.dataset.historyAction = "delete";
        deleteButton.dataset.recordId = record.id;
        deleteButton.textContent = getSimulationHistoryText("delete", "Delete");
        actionCell.appendChild(deleteButton);
        row.appendChild(actionCell);
        rows.appendChild(row);
    }
}

function renderSimulationHistory({ preferredMapKey = null, clearResults = true } = {}) {
    const mapSelect = document.getElementById("selectSimulationHistoryMap");
    const previousMapKey = mapSelect.value;
    const baselineSelect = document.getElementById("selectSimulationHistoryBaseline");
    const comparisonSelect = document.getElementById("selectSimulationHistoryComparison");
    const previousBaseline = baselineSelect.value;
    const previousComparison = comparisonSelect.value;

    const groups = new Map();
    for (const record of simulationHistoryRecords) {
        if (!groups.has(record.mapKey)) {
            groups.set(record.mapKey, []);
        }
        groups.get(record.mapKey).push(record);
    }

    const groupEntries = [...groups.entries()].sort(
        (left, right) => right[1][0].createdAt.localeCompare(left[1][0].createdAt),
    );
    mapSelect.replaceChildren();
    if (groupEntries.length === 0) {
        mapSelect.add(new Option(getSimulationHistoryText("selectMap", "Select a map"), ""));
    } else {
        for (const [mapKey, records] of groupEntries) {
            mapSelect.add(new Option(
                `${getSimulationHistoryMapName(records[0])} (${records.length})`,
                mapKey,
            ));
        }
    }

    const requestedMapKey = preferredMapKey
        ?? previousMapKey
        ?? getCurrentSimulationHistoryMapKey();
    const selectedMapKey = groups.has(requestedMapKey)
        ? requestedMapKey
        : (groups.has(getCurrentSimulationHistoryMapKey())
            ? getCurrentSimulationHistoryMapKey()
            : (groupEntries[0]?.[0] ?? ""));
    mapSelect.value = selectedMapKey;

    const records = groups.get(selectedMapKey) ?? [];
    renderSimulationHistoryRecordRows(records);
    fillSimulationHistoryRecordSelect(baselineSelect, records, previousBaseline, records.length > 1 ? 1 : 0);
    fillSimulationHistoryRecordSelect(comparisonSelect, records, previousComparison, 0);

    const storage = getSimulationHistoryStorageSummary(simulationHistoryRecords);
    document.getElementById("simulationHistoryStorageSummary").textContent = getSimulationHistoryText(
        "recordCount",
        "{{count}} records, about {{size}}",
        {
            count: storage.count.toLocaleString(),
            size: formatSimulationHistorySize(storage.bytes),
        },
    );
    document.getElementById("buttonCompareSimulationHistory").disabled = records.length < 2;
    document.getElementById("buttonDeleteSimulationHistoryMap").disabled = records.length === 0;
    document.getElementById("buttonClearSimulationHistory").disabled = simulationHistoryRecords.length === 0;
    updateSimulationHistoryCount();

    if (clearResults) {
        document.getElementById("simulationHistoryRecordDetails").replaceChildren();
        document.getElementById("simulationHistoryComparisonResults").replaceChildren();
        if (simulationHistoryRecords.length === 0) {
            setSimulationHistoryStatus(
                getSimulationHistoryText(
                    "empty",
                    "There is no simulation history yet. Complete a single-map simulation to save one automatically.",
                ),
                "muted",
            );
        } else {
            setSimulationHistoryStatus();
        }
    }
}

async function reloadSimulationHistory({ preferredMapKey = null, clearResults = true } = {}) {
    try {
        simulationHistoryRecords = await loadSimulationHistoryRecords();
        renderSimulationHistory({ preferredMapKey, clearResults });
    } catch (error) {
        console.warn("Unable to load simulation history.", error);
        simulationHistoryRecords = [];
        renderSimulationHistory({ preferredMapKey, clearResults });
        setSimulationHistoryStatus(
            getSimulationHistoryText("loadError", "Simulation history could not be read from this browser."),
            "danger",
        );
    }
}

function getSimulationHistoryMetricDefinitions() {
    return [
        { key: "dps", fallback: "DPS", digits: 2 },
        { key: "damageTakenPerSecond", fallback: "Damage Taken per Second", digits: 2, lowerIsBetter: true },
        { key: "deathsPerHour", fallback: "Deaths per Hour", digits: 2, lowerIsBetter: true },
        { key: "totalExperiencePerHour", fallback: "Total Experience per Hour", digits: 0 },
        { key: "hitpointsSpentPerHour", fallback: "HP Spent per Hour", digits: 2, lowerIsBetter: true },
        { key: "manaUsedPerHour", fallback: "Mana Used per Hour", digits: 2, lowerIsBetter: true },
        { key: "hitpointsRestoredPerSecond", fallback: "HP Restored per Second", digits: 2 },
        { key: "manapointsRestoredPerSecond", fallback: "MP Restored per Second", digits: 2 },
        { key: "ranOutOfManaPercent", fallback: "Out-of-Mana Time", digits: 2, suffix: "%", lowerIsBetter: true },
    ];
}

function createSimulationHistoryTable(headers = []) {
    const table = document.createElement("table");
    table.className = "table table-sm table-bordered align-middle";
    if (headers.length > 0) {
        const head = document.createElement("thead");
        head.className = "table-light";
        const row = document.createElement("tr");
        headers.forEach((header, index) => {
            const cell = document.createElement("th");
            cell.textContent = header;
            if (index > 0) {
                cell.className = "text-end history-value-column";
            }
            row.appendChild(cell);
        });
        head.appendChild(row);
        table.appendChild(head);
    }
    table.appendChild(document.createElement("tbody"));
    return table;
}

function appendSimulationHistoryValueRow(table, label, value) {
    const row = document.createElement("tr");
    const labelCell = document.createElement("td");
    labelCell.textContent = label;
    row.appendChild(labelCell);
    row.appendChild(createSimulationHistoryCell(value, "text-end history-value-column"));
    table.tBodies[0].appendChild(row);
}

function getSimulationHistorySkillName(skill) {
    return getLocalizedHistoryValue(
        `leaderboardCategoryNames.${skill}`,
        skill.charAt(0).toUpperCase() + skill.slice(1),
    );
}

function getSimulationHistoryItemName(itemHrid) {
    const fallback = itemHrid?.split("/").pop()?.replaceAll("_", " ") || itemHrid;
    return getLocalizedHistoryValue(`itemNames.${itemHrid}`, fallback);
}

function createSimulationHistoryRateSection(title, values, labelResolver, maximumFractionDigits = 2) {
    const section = document.createElement("section");
    const heading = document.createElement("h6");
    heading.textContent = title;
    section.appendChild(heading);

    const entries = Object.entries(values ?? {}).sort((left, right) => right[1] - left[1]);
    if (entries.length === 0) {
        const empty = document.createElement("p");
        empty.className = "small text-muted";
        empty.textContent = getSimulationHistoryText("noItems", "None");
        section.appendChild(empty);
        return section;
    }

    const table = createSimulationHistoryTable([
        getSimulationHistoryText("entry", "Metric / Item"),
        getSimulationHistoryText("value", "Value"),
    ]);
    for (const [key, value] of entries) {
        const row = document.createElement("tr");
        row.appendChild(createSimulationHistoryCell(labelResolver(key), "history-item-name"));
        row.appendChild(createSimulationHistoryCell(
            formatSimulationHistoryNumber(value, maximumFractionDigits),
            "text-end history-value-column",
        ));
        table.tBodies[0].appendChild(row);
    }
    section.appendChild(table);
    return section;
}

function createSimulationHistoryPlayerDetail(playerEntry) {
    const card = document.createElement("section");
    card.className = "card history-player-card mb-3";

    const header = document.createElement("div");
    header.className = "card-header fw-bold";
    const slotLabel = getLocalizedHistoryValue(
        "common:teamComparison.slot",
        "Slot {{slot}}",
    ).replaceAll("{{slot}}", playerEntry.slot);
    header.textContent = `${playerEntry.name} · ${slotLabel}`;
    card.appendChild(header);

    const body = document.createElement("div");
    body.className = "card-body";
    const grid = document.createElement("div");
    grid.className = "row g-4";

    const overviewColumn = document.createElement("div");
    overviewColumn.className = "col-lg-6";
    const overviewHeading = document.createElement("h6");
    overviewHeading.textContent = getSimulationHistoryText("sections.overview", "Main Metrics");
    overviewColumn.appendChild(overviewHeading);
    const overviewTable = createSimulationHistoryTable();
    for (const metric of getSimulationHistoryMetricDefinitions()) {
        appendSimulationHistoryValueRow(
            overviewTable,
            getSimulationHistoryText(`metrics.${metric.key}`, metric.fallback),
            `${formatSimulationHistoryNumber(playerEntry[metric.key], metric.digits)}${metric.suffix ?? ""}`,
        );
    }
    overviewColumn.appendChild(overviewTable);
    grid.appendChild(overviewColumn);

    const experienceColumn = document.createElement("div");
    experienceColumn.className = "col-lg-6";
    experienceColumn.appendChild(createSimulationHistoryRateSection(
        getSimulationHistoryText("sections.experience", "Experience per Hour"),
        playerEntry.experiencePerHour,
        getSimulationHistorySkillName,
    ));
    grid.appendChild(experienceColumn);

    const consumablesColumn = document.createElement("div");
    consumablesColumn.className = "col-lg-6";
    consumablesColumn.appendChild(createSimulationHistoryRateSection(
        getSimulationHistoryText("sections.consumables", "Consumables per Hour"),
        playerEntry.consumablesPerHour,
        getSimulationHistoryItemName,
    ));
    grid.appendChild(consumablesColumn);

    const dropsColumn = document.createElement("div");
    dropsColumn.className = "col-lg-6";
    dropsColumn.appendChild(createSimulationHistoryRateSection(
        getSimulationHistoryText("sections.drops", "Expected Drops per Hour"),
        playerEntry.expectedDropsPerHour,
        getSimulationHistoryItemName,
        6,
    ));
    grid.appendChild(dropsColumn);

    body.appendChild(grid);
    card.appendChild(body);
    return card;
}

function renderSimulationHistoryRecordDetails(record) {
    const container = document.getElementById("simulationHistoryRecordDetails");
    document.getElementById("simulationHistoryComparisonResults").replaceChildren();
    container.replaceChildren();

    const title = document.createElement("h5");
    title.textContent = `${getSimulationHistoryText("recordDetails", "Record Details")} · ${getSimulationHistoryMapName(record)} · ${getSimulationHistoryDifficulty(record)}`;
    container.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "text-muted";
    subtitle.textContent = formatSimulationHistoryDate(record.createdAt);
    container.appendChild(subtitle);

    const overview = createSimulationHistoryTable();
    appendSimulationHistoryValueRow(
        overview,
        getSimulationHistoryText("teamPreset", "Team Preset"),
        record.teamPresetName || getSimulationHistoryText("unknownPreset", "Unnamed team"),
    );
    appendSimulationHistoryValueRow(
        overview,
        getSimulationHistoryText("duration", "Duration"),
        getSimulationHistoryText("hours", "{{hours}} hours", {
            hours: formatSimulationHistoryNumber(record.simulationHours),
        }),
    );
    appendSimulationHistoryValueRow(
        overview,
        getSimulationHistoryText("encountersPerHour", "Encounters per Hour"),
        formatSimulationHistoryNumber(record.encountersPerHour),
    );
    if (record.successRate !== null) {
        appendSimulationHistoryValueRow(
            overview,
            getSimulationHistoryText("metrics.successRate", "Success Rate"),
            `${formatSimulationHistoryNumber(record.successRate)}%`,
        );
    }
    if (record.averageMinutes !== null) {
        appendSimulationHistoryValueRow(
            overview,
            getSimulationHistoryText("metrics.averageMinutes", "Average Completion Minutes"),
            formatSimulationHistoryNumber(record.averageMinutes),
        );
    }
    const overviewWrapper = document.createElement("div");
    overviewWrapper.className = "mb-4";
    overviewWrapper.appendChild(overview);
    container.appendChild(overviewWrapper);

    record.players.forEach((playerEntry) => {
        container.appendChild(createSimulationHistoryPlayerDetail(playerEntry));
    });
    container.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatSimulationHistoryComparisonDelta(metric, digits = 2, suffix = "") {
    const sign = metric.delta > 0 ? "+" : "";
    const percent = metric.percent === null
        ? ""
        : ` (${metric.percent > 0 ? "+" : ""}${formatSimulationHistoryNumber(metric.percent, 1)}%)`;
    return `${sign}${formatSimulationHistoryNumber(metric.delta, digits)}${suffix}${percent}`;
}

function appendSimulationHistoryComparisonRow(
    table,
    label,
    metric,
    digits = 2,
    suffix = "",
    lowerIsBetter = false,
) {
    const row = document.createElement("tr");
    row.appendChild(createSimulationHistoryCell(label, "history-item-name"));
    row.appendChild(createSimulationHistoryCell(
        `${formatSimulationHistoryNumber(metric.baseline, digits)}${suffix}`,
        "text-end history-value-column",
    ));
    row.appendChild(createSimulationHistoryCell(
        `${formatSimulationHistoryNumber(metric.comparison, digits)}${suffix}`,
        "text-end history-value-column",
    ));
    const improvementDelta = lowerIsBetter ? -metric.delta : metric.delta;
    const deltaClass = improvementDelta > 0
        ? "text-success"
        : (improvementDelta < 0 ? "text-danger" : "text-muted");
    row.appendChild(createSimulationHistoryCell(
        formatSimulationHistoryComparisonDelta(metric, digits, suffix),
        `text-end history-value-column ${deltaClass}`,
    ));
    table.tBodies[0].appendChild(row);
}

function createSimulationHistoryComparisonTable() {
    return createSimulationHistoryTable([
        getSimulationHistoryText("entry", "Metric / Item"),
        getSimulationHistoryText("baselineShort", "Baseline A"),
        getSimulationHistoryText("comparisonShort", "Comparison B"),
        getSimulationHistoryText("delta", "Change B-A"),
    ]);
}

function createSimulationHistoryRateComparisonSection(
    title,
    rows,
    labelResolver,
    maximumFractionDigits = 2,
    lowerIsBetter = false,
) {
    const section = document.createElement("section");
    const heading = document.createElement("h6");
    heading.textContent = title;
    section.appendChild(heading);
    if (rows.length === 0) {
        const empty = document.createElement("p");
        empty.className = "small text-muted";
        empty.textContent = getSimulationHistoryText("noItems", "None");
        section.appendChild(empty);
        return section;
    }
    const table = createSimulationHistoryComparisonTable();
    rows.forEach((row) => appendSimulationHistoryComparisonRow(
        table,
        labelResolver(row.key),
        row,
        maximumFractionDigits,
        "",
        lowerIsBetter,
    ));
    section.appendChild(table);
    return section;
}

function createSimulationHistoryPlayerComparison(playerComparison) {
    const baselinePlayer = playerComparison.baseline;
    const comparisonPlayer = playerComparison.comparison;
    const playerName = comparisonPlayer?.name ?? baselinePlayer?.name ?? "Player";
    const card = document.createElement("section");
    card.className = "card history-player-card mb-3";

    const header = document.createElement("div");
    header.className = "card-header d-flex justify-content-between align-items-center";
    const name = document.createElement("strong");
    name.textContent = playerName;
    header.appendChild(name);
    if (!baselinePlayer || !comparisonPlayer) {
        const badge = document.createElement("span");
        badge.className = "badge bg-secondary";
        badge.textContent = !baselinePlayer
            ? getSimulationHistoryText("missingBaseline", "Only in comparison")
            : getSimulationHistoryText("missingComparison", "Only in baseline");
        header.appendChild(badge);
    }
    card.appendChild(header);

    const body = document.createElement("div");
    body.className = "card-body";
    const grid = document.createElement("div");
    grid.className = "row g-4";

    const overviewColumn = document.createElement("div");
    overviewColumn.className = "col-12";
    const overviewHeading = document.createElement("h6");
    overviewHeading.textContent = getSimulationHistoryText("sections.overview", "Main Metrics");
    overviewColumn.appendChild(overviewHeading);
    const overviewTable = createSimulationHistoryComparisonTable();
    for (const definition of getSimulationHistoryMetricDefinitions()) {
        appendSimulationHistoryComparisonRow(
            overviewTable,
            getSimulationHistoryText(`metrics.${definition.key}`, definition.fallback),
            playerComparison.metrics[definition.key],
            definition.digits,
            definition.suffix ?? "",
            definition.lowerIsBetter === true,
        );
    }
    overviewColumn.appendChild(overviewTable);
    grid.appendChild(overviewColumn);

    const sections = [
        {
            className: "col-lg-6",
            title: getSimulationHistoryText("sections.experience", "Experience per Hour"),
            rows: playerComparison.experience,
            resolver: getSimulationHistorySkillName,
        },
        {
            className: "col-lg-6",
            title: getSimulationHistoryText("sections.consumables", "Consumables per Hour"),
            rows: playerComparison.consumables,
            resolver: getSimulationHistoryItemName,
            lowerIsBetter: true,
        },
        {
            className: "col-12",
            title: getSimulationHistoryText("sections.drops", "Expected Drops per Hour"),
            rows: playerComparison.drops,
            resolver: getSimulationHistoryItemName,
            maximumFractionDigits: 6,
        },
    ];
    for (const sectionData of sections) {
        const column = document.createElement("div");
        column.className = sectionData.className;
        column.appendChild(createSimulationHistoryRateComparisonSection(
            sectionData.title,
            sectionData.rows,
            sectionData.resolver,
            sectionData.maximumFractionDigits ?? 2,
            sectionData.lowerIsBetter === true,
        ));
        grid.appendChild(column);
    }

    body.appendChild(grid);
    card.appendChild(body);
    return card;
}

function renderSimulationHistoryComparison(baseline, comparison) {
    const result = compareSimulationHistoryRecords(baseline, comparison);
    const container = document.getElementById("simulationHistoryComparisonResults");
    document.getElementById("simulationHistoryRecordDetails").replaceChildren();
    container.replaceChildren();

    const title = document.createElement("h5");
    title.textContent = `${getSimulationHistoryText("comparisonResults", "Comparison Results")} · ${getSimulationHistoryMapName(comparison)}`;
    container.appendChild(title);

    const direction = document.createElement("p");
    direction.className = "text-muted";
    direction.textContent = `A: ${formatSimulationHistoryDate(baseline.createdAt)} ${getSimulationHistoryDifficulty(baseline)} → B: ${formatSimulationHistoryDate(comparison.createdAt)} ${getSimulationHistoryDifficulty(comparison)}`;
    container.appendChild(direction);

    const summaryTable = createSimulationHistoryComparisonTable();
    appendSimulationHistoryComparisonRow(
        summaryTable,
        getSimulationHistoryText("encountersPerHour", "Encounters per Hour"),
        result.summary.encountersPerHour,
    );
    if (baseline.successRate !== null || comparison.successRate !== null) {
        appendSimulationHistoryComparisonRow(
            summaryTable,
            getSimulationHistoryText("metrics.successRate", "Success Rate"),
            result.summary.successRate,
            2,
            "%",
        );
    }
    if (baseline.averageMinutes !== null || comparison.averageMinutes !== null) {
        appendSimulationHistoryComparisonRow(
            summaryTable,
            getSimulationHistoryText("metrics.averageMinutes", "Average Completion Minutes"),
            result.summary.averageMinutes,
            2,
            "",
            true,
        );
    }
    const summaryWrapper = document.createElement("div");
    summaryWrapper.className = "mb-4";
    summaryWrapper.appendChild(summaryTable);
    container.appendChild(summaryWrapper);

    result.players.forEach((playerComparison) => {
        container.appendChild(createSimulationHistoryPlayerComparison(playerComparison));
    });
    container.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleSimulationHistoryRecordAction(event) {
    const button = event.target.closest("button[data-history-action]");
    if (!button) {
        return;
    }
    const record = simulationHistoryRecords.find((entry) => entry.id === button.dataset.recordId);
    if (!record) {
        return;
    }

    if (button.dataset.historyAction === "details") {
        renderSimulationHistoryRecordDetails(record);
        return;
    }

    if (button.dataset.historyAction === "delete") {
        if (!confirm(getSimulationHistoryText("deleteRecordConfirm", "Delete this simulation history record?"))) {
            return;
        }
        button.disabled = true;
        try {
            await deleteSimulationHistoryRecord(record.id);
            await reloadSimulationHistory({ preferredMapKey: record.mapKey });
        } catch (error) {
            console.warn("Unable to delete simulation history record.", error);
            setSimulationHistoryStatus(
                getSimulationHistoryText("loadError", "Simulation history could not be updated."),
                "danger",
            );
            button.disabled = false;
        }
    }
}

async function deleteCurrentSimulationHistoryMap() {
    const mapKey = document.getElementById("selectSimulationHistoryMap").value;
    const records = simulationHistoryRecords.filter((record) => record.mapKey === mapKey);
    if (records.length === 0) {
        return;
    }
    const message = getSimulationHistoryText(
        "deleteMapConfirm",
        "Delete all {{count}} records for the current map?",
        { count: records.length },
    );
    if (!confirm(message)) {
        return;
    }
    try {
        await deleteSimulationHistoryMap(mapKey);
        await reloadSimulationHistory();
    } catch (error) {
        console.warn("Unable to delete simulation history map.", error);
        setSimulationHistoryStatus(
            getSimulationHistoryText("loadError", "Simulation history could not be updated."),
            "danger",
        );
    }
}

async function clearAllSimulationHistoryRecords() {
    if (simulationHistoryRecords.length === 0) {
        return;
    }
    if (!confirm(getSimulationHistoryText(
        "clearAllConfirm",
        "Clear all simulation history? This cannot be undone.",
    ))) {
        return;
    }
    try {
        await clearSimulationHistory();
        await reloadSimulationHistory();
    } catch (error) {
        console.warn("Unable to clear simulation history.", error);
        setSimulationHistoryStatus(
            getSimulationHistoryText("loadError", "Simulation history could not be updated."),
            "danger",
        );
    }
}

function compareSelectedSimulationHistoryRecords() {
    const baselineId = document.getElementById("selectSimulationHistoryBaseline").value;
    const comparisonId = document.getElementById("selectSimulationHistoryComparison").value;
    if (!baselineId || !comparisonId) {
        setSimulationHistoryStatus(
            getSimulationHistoryText("selectTwo", "Select two records to compare."),
            "warning",
        );
        return;
    }
    if (baselineId === comparisonId) {
        setSimulationHistoryStatus(
            getSimulationHistoryText("sameRecord", "The baseline and comparison records must be different."),
            "warning",
        );
        return;
    }

    const baseline = simulationHistoryRecords.find((record) => record.id === baselineId);
    const comparison = simulationHistoryRecords.find((record) => record.id === comparisonId);
    if (!baseline || !comparison) {
        setSimulationHistoryStatus(
            getSimulationHistoryText("selectTwo", "Select two records to compare."),
            "warning",
        );
        return;
    }

    setSimulationHistoryStatus();
    renderSimulationHistoryComparison(baseline, comparison);
}

function initSimulationHistory() {
    document.getElementById("simulationHistoryModal").addEventListener("show.bs.modal", () => {
        document.getElementById("selectSimulationHistoryBaseline").value = "";
        document.getElementById("selectSimulationHistoryComparison").value = "";
        void reloadSimulationHistory({ preferredMapKey: getCurrentSimulationHistoryMapKey() });
    });
    document.getElementById("selectSimulationHistoryMap").addEventListener("change", (event) => {
        renderSimulationHistory({ preferredMapKey: event.target.value });
    });
    document.getElementById("simulationHistoryRecordRows").addEventListener(
        "click",
        (event) => void handleSimulationHistoryRecordAction(event),
    );
    document.getElementById("buttonCompareSimulationHistory").addEventListener(
        "click",
        compareSelectedSimulationHistoryRecords,
    );
    document.getElementById("buttonDeleteSimulationHistoryMap").addEventListener(
        "click",
        () => void deleteCurrentSimulationHistoryMap(),
    );
    document.getElementById("buttonClearSimulationHistory").addEventListener(
        "click",
        () => void clearAllSimulationHistoryRecords(),
    );

    if (typeof i18next?.on === "function") {
        i18next.on("languageChanged", () => {
            renderSimulationHistory({
                preferredMapKey: document.getElementById("selectSimulationHistoryMap").value,
                clearResults: true,
            });
        });
    }
    void reloadSimulationHistory();
}

// #endregion

function getPlayerFragmentProductionData(playerToDisplay) {
    const playerNumber = playerToDisplay.replace("player", "");
    try {
        const importData = JSON.parse(playerDataMap[playerNumber]);
        const productionProfile = importData.productionProfile ?? {};
        return {
            profile: {
                ...productionProfile,
                complete: productionProfile.complete === true,
                characterSkills: productionProfile.characterSkills ?? importData.characterSkills,
                characterSkillMap: productionProfile.characterSkillMap ?? importData.characterSkillMap,
                characterItems: productionProfile.characterItems ?? importData.characterItems,
                actionTypeDrinkSlotsMap: productionProfile.actionTypeDrinkSlotsMap
                    ?? importData.actionTypeDrinkSlotsMap,
                characterHouseRoomMap: productionProfile.characterHouseRoomMap
                    ?? importData.characterHouseRoomMap,
                buffs: productionProfile.buffs ?? importData.productionBuffs,
                effectiveBuffsCaptured: productionProfile.effectiveBuffsCaptured === true,
                effectiveActionTypeBuffs: productionProfile.effectiveActionTypeBuffs
                    ?? importData.effectiveActionTypeBuffs,
                effectiveActionHridBuffs: productionProfile.effectiveActionHridBuffs
                    ?? importData.effectiveActionHridBuffs,
            },
            houseRooms: importData.houseRooms ?? {},
        };
    } catch (error) {
        console.warn("Unable to read production data for fragment time cost.", error);
        return { profile: {}, houseRooms: {} };
    }
}

function setFragmentTimeCostTranslation(element, key, fallback) {
    const translationKey = `common:fragmentTimeCost.${key}`;
    element.setAttribute("data-i18n", translationKey);
    try {
        const translated = i18next.t(translationKey);
        element.textContent = translated === translationKey ? fallback : translated;
    } catch {
        element.textContent = fallback;
    }
}

function formatFragmentTimeCost(value) {
    return value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function createFragmentTimeMetric(minutesPerFragment, fragmentsPerDay) {
    const column = createElement("div", "col-6 text-end");
    const minutesLine = createElement("div");
    minutesLine.append(`${formatFragmentTimeCost(minutesPerFragment)} `);
    const minutesUnit = createElement("span", "small text-muted", "min/fragment");
    minutesUnit.setAttribute("data-i18n", "common:fragmentTimeCost.minutesPerFragment");
    minutesLine.appendChild(minutesUnit);

    const dailyLine = createElement("div", "small text-success fw-semibold");
    dailyLine.append(`${formatFragmentTimeCost(fragmentsPerDay)} `);
    const dailyUnit = createElement("span", "", "fragments/day");
    dailyUnit.setAttribute("data-i18n", "common:fragmentTimeCost.fragmentsPerDay");
    dailyLine.appendChild(dailyUnit);

    column.append(minutesLine, dailyLine);
    return column;
}

function showFragmentTimeCosts(simResult, playerToDisplay, expectedDropMap, simulatedHours) {
    const section = document.getElementById("fragmentTimeCostSection");
    const resultDiv = document.getElementById("simulationResultFragmentTimeCost");
    const modeBadge = document.getElementById("fragmentTimeCostMode");
    const note = document.getElementById("fragmentTimeCostNote");
    const craftMinutes = document.getElementById("fragmentTimeCostCraftMinutes");
    const productionData = getPlayerFragmentProductionData(playerToDisplay);
    const result = calculateFragmentTimeCosts({
        expectedDropMap,
        simulatedHours,
        consumablesUsed: simResult.consumablesUsed?.[playerToDisplay] ?? {},
        productionProfile: productionData.profile,
        fallbackHouseRooms: productionData.houseRooms,
        actionDetailMap,
        itemDetailMap,
    });

    if (result.fragments.length === 0) {
        section.classList.add("d-none");
        resultDiv.replaceChildren();
        note.replaceChildren();
        return;
    }

    const modeConfig = {
        exact: { key: "modeExact", fallback: "exact", className: "bg-success" },
        personalized: { key: "modePersonalized", fallback: "personal profile", className: "bg-success" },
        estimated: { key: "modeEstimated", fallback: "default estimate", className: "bg-warning text-dark" },
    }[result.mode];
    modeBadge.className = `badge ${modeConfig.className}`;
    setFragmentTimeCostTranslation(modeBadge, modeConfig.key, modeConfig.fallback);

    const rows = result.fragments.map((fragment) => {
        const wrapper = createElement("div", "py-1 border-bottom");
        const fragmentName = createElement(
            "div",
            "small",
            itemDetailMap[fragment.itemHrid]?.name ?? fragment.itemHrid,
        );
        fragmentName.setAttribute("data-i18n", `itemNames.${fragment.itemHrid}`);
        const values = createElement("div", "row");
        values.append(
            createFragmentTimeMetric(
                fragment.combatMinutesPerFragment,
                fragment.combatFragmentsPerDay,
            ),
            createFragmentTimeMetric(
                fragment.totalMinutesPerFragment,
                fragment.totalFragmentsPerDay,
            ),
        );
        wrapper.append(fragmentName, values);
        return wrapper;
    });
    resultDiv.replaceChildren(...rows);
    craftMinutes.textContent = formatFragmentTimeCost(result.craftMinutesPerSimHour);

    const noteDefinitions = result.mode === "exact"
        ? [["noteExact", "No consumables were used, so both values are identical."]]
        : result.mode === "personalized"
            ? [["notePersonalized", "Calculated with the complete production profile imported for this character."]]
            : [[
                "noteEstimated",
                "A complete production profile has not been imported, so default production assumptions are in use.",
            ]];
    if (result.issues.some((issue) => issue.startsWith("missingAction:"))) {
        noteDefinitions.push([
            "noteEstimatedMissing",
            "Some materials have no calculable production source, so the value including crafting may be underestimated.",
        ]);
    }
    const noteChildren = [];
    noteDefinitions.forEach(([key, fallback], index) => {
        if (index > 0) {
            noteChildren.push(document.createElement("br"));
        }
        const span = document.createElement("span");
        setFragmentTimeCostTranslation(span, key, fallback);
        noteChildren.push(span);
    });
    note.replaceChildren(...noteChildren);
    section.classList.remove("d-none");
}

function updateAllSimsModal(data) {
    const tableBody = document.getElementById('allZonesData').getElementsByTagName('tbody')[0];
    tableBody.innerHTML = '';
    data.forEach(item => {
        const row = document.createElement('tr');

        Object.keys(item).forEach(key => {
            const cell = document.createElement('td');
            cell.textContent = item[key];
            if (key === 'ZoneName') {
                if (cell.textContent.startsWith("/action")) {
                    cell.setAttribute("data-i18n", "actionNames." + item[key]);
                } else if (cell.textContent.startsWith("/monsters")) {
                    cell.setAttribute("data-i18n", "monsterNames." + item[key]);
                }

            }
            row.appendChild(cell);
        });

        tableBody.appendChild(row);
    });

}

let currentSortColumn = null;
let currentSortDirection = 'desc';

function sortTable(tableId, columnIndex, direction) {
    const table = document.getElementById(tableId);
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));

    const sortedRows = rows.sort((rowA, rowB) => {
        const cellA = rowA.children[columnIndex].textContent.trim().replace(/[\s,]/g, '');
        const cellB = rowB.children[columnIndex].textContent.trim().replace(/[\s,]/g, '');

        const valueA = parseFloat(cellA.replace(/,/g, ''));
        const valueB = parseFloat(cellB.replace(/,/g, ''));

        return direction === 'asc' ? valueA - valueB : valueB - valueA;
    });

    sortedRows.forEach(row => tbody.appendChild(row));
    updateSortIndicators(tableId, columnIndex, direction);
}

function updateSortIndicators(tableId, columnIndex, direction) {
    const headers = document.querySelectorAll(`#${tableId} th`);
    headers.forEach((header, index) => {
        header.classList.remove('sort-asc', 'sort-desc');
        if (index === columnIndex) {
            header.classList.add(direction === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

document.querySelectorAll('#allZonesData th').forEach((header, index) => {
    if (index === 0) return;
    if (index === 1) return;
    if (index === 2) return;

    header.addEventListener('click', () => {
        if (currentSortColumn === index) {
            currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortColumn = index;
            currentSortDirection = 'desc';
        }
        sortTable('allZonesData', currentSortColumn, currentSortDirection);
    });
});

document.getElementById('buttonExportResults').addEventListener('click', function () {
    var table = document.getElementById('allZonesData');
    var csv = [];
    var rows = table.querySelectorAll('tr');

    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var cols = row.querySelectorAll('th, td');
        var csvRow = [];

        cols.forEach(function (col) {
            csvRow.push('"' + col.innerText.replace(/"/g, '""') + '"');
        });

        csv.push(csvRow.join(','));
    }

    var csvFile = new Blob([csv.join('\n')], { type: 'text/csv' });
    var downloadLink = document.createElement('a');
    downloadLink.download = 'simData.csv';
    downloadLink.href = URL.createObjectURL(csvFile);
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
});

function showKills(simResult, playerToDisplay) {
    let resultDiv = document.getElementById("simulationResultKills");
    let dropsResultDiv = document.getElementById("simulationResultDrops");
    let newChildren = [];
    let newDropChildren = [];

    let hoursSimulated = simResult.simulatedTime / ONE_HOUR;
    if (simResult.isDungeon && simResult.lastDungeonFinishTime > 0) {
        hoursSimulated = simResult.lastDungeonFinishTime / ONE_HOUR;
    } else if (simResult.lastEncounterFinishTime > 0) {
        hoursSimulated = simResult.lastEncounterFinishTime / ONE_HOUR;
    }

    let encountersPerHour = 0;
    let encountersRow = null;
    if (simResult.isDungeon) {
        let wavesCompletedRow = createRow(["col-md-6", "col-md-6 text-end"], ["Max Wave Reached", simResult.maxWaveReached]);
        wavesCompletedRow.firstElementChild.setAttribute("data-i18n", "common:simulationResults.maxWaveReached");
        newChildren.push(wavesCompletedRow);
        let completedDungeonsRow = createRow(["col-md-6", "col-md-6 text-end"], ["Completed Dungeons", simResult.dungeonsCompleted]);
        completedDungeonsRow.firstElementChild.setAttribute("data-i18n", "common:simulationResults.dungeonsCompleted");
        newChildren.push(completedDungeonsRow);
        if (simResult.dungeonsFailed > 0) {
            let failedDungeonsRow = createRow(["col-md-6", "col-md-6 text-end"], ["Failed Dungeons", simResult.dungeonsFailed]);
            failedDungeonsRow.firstElementChild.setAttribute("data-i18n", "common:simulationResults.dungeonsFailed");
            newChildren.push(failedDungeonsRow);
        }
        encountersPerHour = (simResult.dungeonsCompleted / hoursSimulated).toFixed(1);
        let averageTime = (hoursSimulated * 60 / simResult.dungeonsCompleted).toFixed(1);
        encountersRow = createRow(["col-md-6", "col-md-6 text-end"], ["Average Time", averageTime]);
        encountersRow.firstElementChild.setAttribute("data-i18n", "common:simulationResults.averageTime");
        if (simResult.minDungenonTime > 0) {
            let minimumTime = (simResult.minDungenonTime / ONE_SECOND / 60).toFixed(1);
            let minimumTimeRow = createRow(["col-md-6", "col-md-6 text-end"], ["Minimum Time", minimumTime]);
            minimumTimeRow.firstElementChild.setAttribute("data-i18n", "common:simulationResults.minimumTime");
            newChildren.push(minimumTimeRow);
        }
        if (simResult.maxDungenonTime > 0) {
            let maximumTime = (simResult.maxDungenonTime / ONE_SECOND / 60).toFixed(1);
            let maximumTimeRow = createRow(["col-md-6", "col-md-6 text-end"], ["Maximum Time", maximumTime]);
            maximumTimeRow.firstElementChild.setAttribute("data-i18n", "common:simulationResults.maximumTime");
            newChildren.push(maximumTimeRow);
        }
    } else {
        encountersPerHour = (simResult.encounters / hoursSimulated).toFixed(1); 
        encountersRow = createRow(["col-md-6", "col-md-6 text-end"], ["Encounters", encountersPerHour]);
        encountersRow.firstElementChild.setAttribute("data-i18n", "common:simulationResults.encounters");
    }

    if (simResult.labyAttemptCount > 0) {
        let labyAttemptCountRow = createRow(["col-md-6", "col-md-6 text-end"], ["Labyrinth Attempt Count", (simResult.labyAttemptCount / hoursSimulated).toFixed(1)]);
        labyAttemptCountRow.firstElementChild.setAttribute("data-i18n", "common:simulationResults.labyAttemptCount");
        newChildren.push(labyAttemptCountRow);

        let labySuccessRateRow = createRow(["col-md-6", "col-md-6 text-end"], ["Labyrinth Success Rate", (simResult.encounters / simResult.labyAttemptCount * 100).toFixed(1) + "%"]);
        labySuccessRateRow.firstElementChild.setAttribute("data-i18n", "common:simulationResults.labySuccessRate");
        newChildren.push(labySuccessRateRow);
    }

    if (simResult.maxEnrageStack > 0) {
        let enrageRow = createRow(["col-md-6", "col-md-6 text-end"], ["Max Enrage Stack", simResult.maxEnrageStack]);
        enrageRow.firstElementChild.setAttribute("data-i18n", "common:simulationResults.maxEnrageStack");
        newChildren.push(enrageRow);
    }

    if (simResult.debuffOnLevelGap[playerToDisplay] != 0) {
        let debuffOnLevelGapRow = createRow(["col-md-6", "col-md-6 text-end"], ["Debuff on Level Gap", (simResult.debuffOnLevelGap[playerToDisplay] * 100).toFixed(1) + "%"]);
        debuffOnLevelGapRow.firstElementChild.setAttribute("data-i18n", "common:simulationResults.debuffOnLevelGap");
        newChildren.push(debuffOnLevelGapRow);
    }

    newChildren.push(encountersRow);

    Object.keys(simResult.deaths)
        .filter(enemy => enemy !== "player1" && enemy !== "player2" && enemy !== "player3" && enemy !== "player4" && enemy !== "player5")
        .sort()
        .forEach(monster => {
            let killsPerHour = (simResult.deaths[monster] / hoursSimulated).toFixed(1);
            let monsterRow = createRow(
                ["col-md-6", "col-md-6 text-end"],
                [combatMonsterDetailMap[monster].name, killsPerHour]
            );
            monsterRow.firstElementChild.setAttribute("data-i18n", "monsterNames." + monster);
            newChildren.push(monsterRow);
        });

    const expectedDropMap = !simResult.isDungeon
        ? calcExpectedDropMap(simResult, playerToDisplay)
        : new Map();

    for (let [name, dropAmount] of expectedDropMap.entries()) {
        let dropRow = createRow(
            ["col-md-6", "col-md-6 text-end"],
            [name, dropAmount.toLocaleString()]
        );
        dropRow.firstElementChild.setAttribute("data-i18n", "itemNames." + name);
        newDropChildren.push(dropRow);
    }

    resultDiv.replaceChildren(...newChildren);
    dropsResultDiv.replaceChildren(...newDropChildren);
    showFragmentTimeCosts(simResult, playerToDisplay, expectedDropMap, hoursSimulated);
}

function showDeaths(simResult, playerToDisplay) {
    let resultDiv = document.getElementById("simulationResultPlayerDeaths");

    let hoursSimulated = simResult.simulatedTime / ONE_HOUR;
    let playerDeaths = simResult.deaths[playerToDisplay] ?? 0;
    let deathsPerHour = (playerDeaths / hoursSimulated).toFixed(2);

    let deathRow = createRow(["col-md-6", "col-md-6 text-end"], ["Player", deathsPerHour]);
    deathRow.firstElementChild.setAttribute("data-i18n", "common:player");
    resultDiv.replaceChildren(deathRow);
}

function showExperienceGained(simResult, playerToDisplay) {
    let resultDiv = document.getElementById("simulationResultExperienceGain");
    let newChildren = [];

    let hoursSimulated = simResult.simulatedTime / ONE_HOUR;

    let totalExperience = 0;
    if (simResult.experienceGained[playerToDisplay]) {
        totalExperience = Object.values(simResult.experienceGained[playerToDisplay]).reduce((prev, cur) => prev + cur, 0);
    }
    let totalExperiencePerHour = (totalExperience / hoursSimulated).toFixed(0);
    let totalRow = createRow(["col-md-6", "col-md-6 text-end"], ["Total", totalExperiencePerHour]);
    totalRow.firstElementChild.setAttribute("data-i18n", "common:total");
    newChildren.push(totalRow);

    ["Stamina", "Intelligence", "Attack", "Melee", "Defense", "Ranged", "Magic"].forEach((skill) => {
        let experience = simResult.experienceGained[playerToDisplay]?.[skill.toLowerCase()] ?? 0;
        if (experience == 0) {
            return;
        }
        let experiencePerHour = (experience / hoursSimulated).toFixed(0);
        let experienceRow = createRow(["col-md-6", "col-md-6 text-end"], [skill, experiencePerHour]);
        experienceRow.firstElementChild.setAttribute("data-i18n", "leaderboardCategoryNames." + skill.toLowerCase());
        newChildren.push(experienceRow);
    });

    resultDiv.replaceChildren(...newChildren);
}

function showHpSpent(simResult, playerToDisplay) {
    let hpSpentHeadingDiv = document.getElementById("simulationHpSpentHeading");
    hpSpentHeadingDiv.classList.add("d-none");
    let hpSpentDiv = document.getElementById("simulationHpSpent");
    hpSpentDiv.classList.add("d-none");

    if (simResult.hitpointsSpent[playerToDisplay]) {
        let hoursSimulated = simResult.simulatedTime / ONE_HOUR;
        let hpSpentSources = [];
        for (const source of Object.keys(simResult.hitpointsSpent[playerToDisplay])) {
            let hpSpentPerHour = (simResult.hitpointsSpent[playerToDisplay][source] / hoursSimulated).toFixed(2);
            let hpSpentRow = createRow(["col-md-6", "col-md-6 text-end"], [abilityDetailMap[source].name, hpSpentPerHour]);
            hpSpentRow.firstElementChild.setAttribute("data-i18n", "abilityNames." + source);
            hpSpentSources.push(hpSpentRow);
        }
        hpSpentDiv.replaceChildren(...hpSpentSources);
        hpSpentHeadingDiv.classList.remove("d-none");
        hpSpentDiv.classList.remove("d-none");
    }
}

function showConsumablesUsed(simResult, playerToDisplay) {
    let resultDiv = document.getElementById("simulationResultConsumablesUsed");
    let newChildren = [];

    let hoursSimulated = simResult.simulatedTime / ONE_HOUR;

    if (!simResult.consumablesUsed[playerToDisplay]) {
        resultDiv.replaceChildren(...newChildren);
        return;
    }

    let consumablesUsed = Object.entries(simResult.consumablesUsed[playerToDisplay]).sort((a, b) => b[1] - a[1]);

    for (const [consumable, amount] of consumablesUsed) {
        let consumablesPerHour = (amount / hoursSimulated).toFixed(0);
        let consumableRow = createRow(
            ["col-md-6", "col-md-6 text-end"],
            [itemDetailMap[consumable].name, consumablesPerHour]
        );
        consumableRow.firstElementChild.setAttribute("data-i18n", "itemNames." + consumable);
        newChildren.push(consumableRow);
    }

    resultDiv.replaceChildren(...newChildren);
}

function showManaUsed(simResult, playerToDisplay) {
    let resultDiv = document.getElementById("simulationResultManaUsed");
    let newChildren = [];

    let hoursSimulated = simResult.simulatedTime / ONE_HOUR;

    if (!simResult.manaUsed || !simResult.manaUsed[playerToDisplay]) {
        resultDiv.replaceChildren(...newChildren);
        return;
    }

    let playerManaUsed = simResult.manaUsed[playerToDisplay];

    for (let ability in playerManaUsed) {
        let manaUsed = playerManaUsed[ability];
        let manaPerHour = (manaUsed / hoursSimulated).toFixed(0);
        let castsPerHour = (manaPerHour / abilityDetailMap[ability].manaCost).toFixed(2);
        castsPerHour = " (" + castsPerHour + ")";

        let manaRow = createRow(
            ["col-md-6", "col-md-2", "col-md-4 text-end"],
            [ability.split("/")[2].replaceAll("_", " "), castsPerHour, manaPerHour]
        );
        manaRow.firstElementChild.setAttribute("data-i18n", "abilityNames." + ability);
        newChildren.push(manaRow);
    }

    resultDiv.replaceChildren(...newChildren);
}

function showHitpointsGained(simResult, playerToDisplay) {
    let resultDiv = document.getElementById("simulationResultHealthRestored");
    let newChildren = [];

    let secondsSimulated = simResult.simulatedTime / ONE_SECOND;

    if (!simResult.hitpointsGained[playerToDisplay]) {
        resultDiv.replaceChildren(...newChildren);
        return;
    }

    let hitpointsGained = Object.entries(simResult.hitpointsGained[playerToDisplay]).sort((a, b) => b[1] - a[1]);

    let totalHitpointsGained = hitpointsGained.reduce((prev, cur) => prev + cur[1], 0);
    let totalHitpointsPerSecond = (totalHitpointsGained / secondsSimulated).toFixed(2);
    let totalRow = createRow(
        ["col-md-6", "col-md-3 text-end", "col-md-3 text-end"],
        ["Total", totalHitpointsPerSecond, "100%"]
    );
    totalRow.firstElementChild.setAttribute("data-i18n", "common:total");
    newChildren.push(totalRow);

    for (const [source, amount] of hitpointsGained) {
        if (amount == 0) {
            continue;
        }

        let sourceText;
        let sourceFullHrid;
        switch (source) {
            case "regen":
                sourceText = "Regen";
                sourceFullHrid = "combatStats.hpRegenPer10";
                break;
            case "lifesteal":
                sourceText = "Life Steal";
                sourceFullHrid = "combatStats.lifeSteal";
                break;
            case "bloom":
                sourceText = "Bloom";
                sourceFullHrid = "combatStats.bloom";
                break;
            default:
                if (itemDetailMap[source]) {
                    sourceText = itemDetailMap[source].name;
                    sourceFullHrid = "itemNames." + source;
                } else if (abilityDetailMap[source]) {
                    sourceText = abilityDetailMap[source].name;
                    sourceFullHrid = "abilityNames." + source;
                }
                break;
        }
        let hitpointsPerSecond = (amount / secondsSimulated).toFixed(2);
        let percentage = ((100 * amount) / totalHitpointsGained).toFixed(0);

        let row = createRow(
            ["col-md-6", "col-md-3 text-end", "col-md-3 text-end"],
            [sourceText, hitpointsPerSecond, percentage + "%"]
        );
        row.firstElementChild.setAttribute("data-i18n", sourceFullHrid);
        newChildren.push(row);
    }

    resultDiv.replaceChildren(...newChildren);
}

function showManapointsGained(simResult, playerToDisplay) {
    let resultDiv = document.getElementById("simulationResultManaRestored");
    let newChildren = [];

    let secondsSimulated = simResult.simulatedTime / ONE_SECOND;

    if (!simResult.manapointsGained[playerToDisplay]) {
        resultDiv.replaceChildren(...newChildren);
        return;
    }

    let manapointsGained = Object.entries(simResult.manapointsGained[playerToDisplay]).sort((a, b) => b[1] - a[1]);

    let totalManapointsGained = manapointsGained.reduce((prev, cur) => prev + cur[1], 0);
    let totalManapointsPerSecond = (totalManapointsGained / secondsSimulated).toFixed(2);
    let totalRow = createRow(
        ["col-md-6", "col-md-3 text-end", "col-md-3 text-end"],
        ["Total", totalManapointsPerSecond, "100%"]
    );
    totalRow.firstElementChild.setAttribute("data-i18n", "common:total");
    newChildren.push(totalRow);

    for (const [source, amount] of manapointsGained) {
        if (amount == 0) {
            continue;
        }

        let sourceText;
        let sourceFullHrid;
        switch (source) {
            case "regen":
                sourceText = "Regen";
                sourceFullHrid = "combatStats.mpRegenPer10";
                break;
            case "manaLeech":
                sourceText = "Mana Leech";
                sourceFullHrid = "combatStats.manaLeech";
                break;
            case "ripple":
                sourceText = "Ripple";
                sourceFullHrid = "combatStats.ripple";
                break;
            default:
                sourceText = itemDetailMap[source].name;
                sourceFullHrid = "itemNames." + source;
                break;
        }
        let manapointsPerSecond = (amount / secondsSimulated).toFixed(2);
        let percentage = ((100 * amount) / totalManapointsGained).toFixed(0);

        let row = createRow(
            ["col-md-6", "col-md-3 text-end", "col-md-3 text-end"],
            [sourceText, manapointsPerSecond, percentage + "%"]
        );
        row.firstElementChild.setAttribute("data-i18n", sourceFullHrid);
        newChildren.push(row);
    }

    let ranOutOfManaText = simResult.playerRanOutOfMana[playerToDisplay] ? "Yes" : "No";
    let ranOutOfManaRow = createRow(["col-md-6", "col-md-6 text-end"], ["Ran out of mana", ranOutOfManaText]);
    ranOutOfManaRow.firstElementChild.setAttribute("data-i18n", "common:simulationResults.ranOutOfMana");
    ranOutOfManaRow.lastElementChild.setAttribute("data-i18n", "common:simulationResults." + ranOutOfManaText);
    newChildren.push(ranOutOfManaRow);

    if (simResult.playerRanOutOfMana[playerToDisplay]) {
        let ranOutOfManaStat = simResult.playerRanOutOfManaTime[playerToDisplay]; // {isOutOfMana: false, startTimeForOutOfMana:0, totalTimeForOutOfMana:0};
        let totalTimeForOut = ranOutOfManaStat.totalTimeForOutOfMana + (ranOutOfManaStat.isOutOfMana ? (simResult.simulatedTime - ranOutOfManaStat.startTimeForOutOfMana) : 0);

        let ranOutOfManaStatRow = createRow(
            ["col-md-6", "col-md-6 text-end"],
            [
                "Run Out Ratio",
                (totalTimeForOut / simResult.simulatedTime * 100).toFixed(2) + "%"
            ]
        );
        ranOutOfManaStatRow.firstElementChild.setAttribute("data-i18n", "common:simulationResults.ranOutOfManaRatio");
        newChildren.push(ranOutOfManaStatRow);
    }

    resultDiv.replaceChildren(...newChildren);
}

function showDamageDone(simResult, playerToDisplay) {
    let totalDamageDone = {};
    let enemyIndex = 1;

    let totalSecondsSimulated = simResult.simulatedTime / ONE_SECOND;

    for (let i = 1; i <= 64; i++) {
        let accordion = document.getElementById("simulationResultDamageDoneAccordionEnemy" + i);
        hideElement(accordion);
    }

    let bossTimeHeadingDiv = document.getElementById("simulationBossTimeHeading");
    bossTimeHeadingDiv.classList.add("d-none");
    let bossTimeDiv = document.getElementById("simulationBossTime");
    bossTimeDiv.classList.add("d-none");

    if (!simResult.attacks[playerToDisplay]) {
        return;
    }

    for (const [target, abilities] of Object.entries(simResult.attacks[playerToDisplay])) {
        let targetDamageDone = {};

        const i = simResult.timeSpentAlive.findIndex(e => e.name === target);
        let aliveSecondsSimulated = simResult.timeSpentAlive[i].timeSpentAlive / ONE_SECOND;

        for (const [ability, abilityCasts] of Object.entries(abilities)) {
            let casts = Object.values(abilityCasts).reduce((prev, cur) => prev + cur, 0);
            let misses = abilityCasts["miss"] ?? 0;
            let damage = Object.entries(abilityCasts)
                .filter((entry) => entry[0] != "miss")
                .reduce((prev, cur) => prev + Number(cur[0]) * cur[1], 0);

            targetDamageDone[ability] = {
                casts,
                misses,
                damage,
            };
            if (totalDamageDone[ability]) {
                totalDamageDone[ability].casts += casts;
                totalDamageDone[ability].misses += misses;
                totalDamageDone[ability].damage += damage;
            } else {
                totalDamageDone[ability] = {
                    casts,
                    misses,
                    damage,
                };
            }
        }

        let resultDiv = document.getElementById("simulationResultDamageDoneEnemy" + enemyIndex);
        createDamageTable(resultDiv, targetDamageDone, aliveSecondsSimulated);

        let resultAccordion = document.getElementById("simulationResultDamageDoneAccordionEnemy" + enemyIndex);
        showElement(resultAccordion);
        showDamageDetailsEntry();

        let resultAccordionButton = document.getElementById(
            "buttonSimulationResultDamageDoneAccordionEnemy" + enemyIndex
        );
        let targetName = combatMonsterDetailMap[target].name;
        resultAccordionButton.innerHTML = "<b><span data-i18n=\"common:simulationResults.damageDone\">Damage Done</span> (" + "<span data-i18n=\"monsterNames." + target + "\">" + targetName + "</span>" + ")</b>";

        if (simResult.bossSpawns.includes(target)) {
            let hoursSpentOnBoss = (aliveSecondsSimulated / 60 / 60).toFixed(2);
            let percentSpentOnBoss = (aliveSecondsSimulated / totalSecondsSimulated * 100).toFixed(2);

            let bossRow = createRow(["col-md-6", "col-md-6 text-end"], [targetName, hoursSpentOnBoss + "h(" + percentSpentOnBoss + "%)"]);
            bossRow.firstElementChild.setAttribute("data-i18n", "monsterNames." + target);
            bossTimeDiv.replaceChildren(bossRow);

            bossTimeHeadingDiv.classList.remove("d-none");
            bossTimeDiv.classList.remove("d-none");
        }

        enemyIndex++;
    }

    if (simResult.isDungeon) {
        let newChildren = [];
        for (const waveName of simResult.bossSpawns) {
            // waveName is something like "#15,/monsters/jackalope,/monsters/butterjerry"
            let waveNumber = waveName.split(",")[0];
            const idx = simResult.timeSpentAlive.findIndex(e => e.name === waveNumber);
            if (idx == -1 || simResult.timeSpentAlive[idx].count == 0) {
                continue;
            }
            let aliveSecondsSimulated = simResult.timeSpentAlive[idx].timeSpentAlive / ONE_SECOND / simResult.timeSpentAlive[idx].count;
            let bossRow = createRow(["col-md-6", "col-md-2", "col-md-4 text-end"], [waveNumber, simResult.timeSpentAlive[idx].count, aliveSecondsSimulated.toFixed(1) + "s"]);
            newChildren.push(bossRow);
        }
        if (newChildren.length > 0) {
            bossTimeHeadingDiv.classList.remove("d-none");
            bossTimeDiv.classList.remove("d-none");
            bossTimeDiv.replaceChildren(...newChildren);
        }
    }

    let totalResultDiv = document.getElementById("simulationResultTotalDamageDone");
    createDamageTable(totalResultDiv, totalDamageDone, totalSecondsSimulated);
}

function showDamageTaken(simResult, playerToDisplay) {
    let totalDamageTaken = {};
    let enemyIndex = 1;

    let totalSecondsSimulated = simResult.simulatedTime / ONE_SECOND;

    for (let i = 1; i <= 64; i++) {
        let accordion = document.getElementById("simulationResultDamageTakenAccordionEnemy" + i);
        hideElement(accordion);
    }

    for (const [source, targets] of Object.entries(simResult.attacks)) {
        const validSources = ["player1", "player2", "player3", "player4", "player5"];
        if (validSources.includes(source)) {
            continue;
        }
        const i = simResult.timeSpentAlive.findIndex(e => e.name === source);
        let aliveSecondsSimulated = simResult.timeSpentAlive[i].timeSpentAlive / ONE_SECOND;
        let sourceDamageTaken = {};
        if (targets[playerToDisplay] && Object.keys(targets[playerToDisplay]).length > 0) {
            for (const [ability, abilityCasts] of Object.entries(targets[playerToDisplay])) {
                let casts = Object.values(abilityCasts).reduce((prev, cur) => prev + cur, 0);
                let misses = abilityCasts["miss"] ?? 0;
                let damage = Object.entries(abilityCasts)
                    .filter((entry) => entry[0] != "miss")
                    .reduce((prev, cur) => prev + Number(cur[0]) * cur[1], 0);

                sourceDamageTaken[ability] = {
                    casts,
                    misses,
                    damage,
                };
                if (totalDamageTaken[ability]) {
                    totalDamageTaken[ability].casts += casts;
                    totalDamageTaken[ability].misses += misses;
                    totalDamageTaken[ability].damage += damage;
                } else {
                    totalDamageTaken[ability] = {
                        casts,
                        misses,
                        damage,
                    };
                }
            }
        }

        let resultDiv = document.getElementById("simulationResultDamageTakenEnemy" + enemyIndex);
        createDamageTable(resultDiv, sourceDamageTaken, aliveSecondsSimulated);

        let resultAccordion = document.getElementById("simulationResultDamageTakenAccordionEnemy" + enemyIndex);
        showElement(resultAccordion);
        showDamageDetailsEntry();

        let resultAccordionButton = document.getElementById(
            "buttonSimulationResultDamageTakenAccordionEnemy" + enemyIndex
        );
        let sourceName = combatMonsterDetailMap[source].name;
        resultAccordionButton.innerHTML = "<b><span data-i18n=\"common:simulationResults.damageTaken\">Damage Taken</span> (" + "<span data-i18n=\"monsterNames." + source + "\">" + sourceName + "</span>" + ")</b>";

        enemyIndex++;
    }

    let totalResultDiv = document.getElementById("simulationResultTotalDamageTaken");
    createDamageTable(totalResultDiv, totalDamageTaken, totalSecondsSimulated);
}

function createDamageTable(resultDiv, damageDone, secondsSimulated) {
    let newChildren = [];

    let sortedDamageDone = Object.entries(damageDone).sort((a, b) => b[1].damage - a[1].damage);

    let totalCasts = sortedDamageDone.reduce((prev, cur) => prev + cur[1].casts, 0);
    let totalMisses = sortedDamageDone.reduce((prev, cur) => prev + cur[1].misses, 0);
    let totalDamage = sortedDamageDone.reduce((prev, cur) => prev + cur[1].damage, 0);
    let totalHitChance = ((100 * (totalCasts - totalMisses)) / totalCasts).toFixed(1);
    let totalDamagePerSecond = (totalDamage / secondsSimulated).toFixed(2);

    let totalRow = createRow(
        ["col-md-5", "col-md-3 text-end", "col-md-2 text-end", "col-md-2 text-end"],
        ["Total", totalHitChance + "%", totalDamagePerSecond, "100%"]
    );
    totalRow.firstElementChild.setAttribute("data-i18n", "common:total");
    newChildren.push(totalRow);

    for (const [ability, damageInfo] of sortedDamageDone) {
        let abilityText;
        let abilityFullHrid;
        switch (ability) {
            case "autoAttack":
                abilityText = "Auto Attack";
                abilityFullHrid = "combatUnit.autoAttack";
                break;
            case "parry":
                abilityText = "Parry Attack";
                abilityFullHrid = "common:simulationResults.parryAttack";
                break;
            case "damageOverTime":
                abilityText = "Damage Over Time";
                abilityFullHrid = "common:simulationResults.damageOverTime";
                break;
            case "physicalThorns":
                abilityText = "Physical Thorns";
                abilityFullHrid = "combatStats.physicalThorns";
                break;
            case "elementalThorns":
                abilityText = "Elemental Thorns";
                abilityFullHrid = "combatStats.elementalThorns";
                break;
            case "retaliation":
                abilityText = "Retaliation";
                abilityFullHrid = "combatStats.retaliation";
                break;
            case 'blaze':
                abilityText = "Blaze";
                abilityFullHrid = "combatStats.blaze";
                break;
            default:
                abilityText = abilityDetailMap[ability].name;
                abilityFullHrid = "abilityNames." + ability;
                break;
        }

        let hitChance = ((100 * (damageInfo.casts - damageInfo.misses)) / damageInfo.casts).toFixed(1);
        let damagePerSecond = (damageInfo.damage / secondsSimulated).toFixed(2);
        let percentage = ((100 * damageInfo.damage) / totalDamage).toFixed(0);

        let row = createRow(
            ["col-md-5", "col-md-3 text-end", "col-md-2 text-end", "col-md-2 text-end"],
            [abilityText, hitChance + "%", damagePerSecond, percentage + "%"]
        );
        row.firstElementChild.setAttribute("data-i18n", abilityFullHrid);
        newChildren.push(row);
    }

    resultDiv.replaceChildren(...newChildren);
}

function createRow(columnClassNames, columnValues) {
    let row = createElement("div", "row");

    for (let i = 0; i < columnClassNames.length; i++) {
        let column = createElement("div", columnClassNames[i], columnValues[i]);
        row.appendChild(column);
    }

    return row;
}

function createElement(tagName, className, innerHTML = "", id = "") {
    let element = document.createElement(tagName);
    element.className = className;
    element.innerHTML = innerHTML;
    if (id) element.id = id;
    return element;
}

// #endregion

// #region Simulation Controls

function getPlayerSlotFromTab(tab) {
    const match = tab?.id?.match(/^player([1-5])-tab$/);
    return match?.[1] ?? null;
}

function getPlayerFormationOrder() {
    const visibleOrder = [...document.querySelectorAll("#playerTab .nav-link")]
        .map(getPlayerSlotFromTab)
        .filter(Boolean);
    return normalizePlayerFormation(visibleOrder);
}

function loadPlayerFormationOrder() {
    try {
        const storedFormation = JSON.parse(
            window.localStorage.getItem(PLAYER_FORMATION_STORAGE_KEY) || "null",
        );
        return normalizePlayerFormation(storedFormation);
    } catch (error) {
        console.warn("Unable to load the saved player formation.", error);
        return normalizePlayerFormation([]);
    }
}

function savePlayerFormationOrder(formation) {
    try {
        window.localStorage.setItem(
            PLAYER_FORMATION_STORAGE_KEY,
            JSON.stringify(normalizePlayerFormation(formation)),
        );
    } catch (error) {
        console.warn("Unable to save the player formation.", error);
    }
}

function syncPlayerCheckboxOrder(formation) {
    const playerContainer = document.getElementById("playerCheckBox");
    if (!playerContainer) {
        return;
    }

    for (const slot of normalizePlayerFormation(formation)) {
        const checkboxRow = document.getElementById(`player${slot}`)?.closest(".form-check");
        if (checkboxRow) {
            playerContainer.appendChild(checkboxRow);
        }
    }
}

function applyPlayerFormationOrder(formation, { persist = true } = {}) {
    const normalizedFormation = normalizePlayerFormation(formation);
    const playerTab = document.getElementById("playerTab");
    if (!playerTab) {
        return normalizedFormation;
    }

    for (const slot of normalizedFormation) {
        const tabItem = document.getElementById(`player${slot}-tab`)?.closest(".nav-item");
        if (tabItem) {
            playerTab.appendChild(tabItem);
        }
    }

    playerTab.dataset.playerFormation = normalizedFormation.join(",");
    syncPlayerCheckboxOrder(normalizedFormation);
    updateTeamPresetPlayerLabels();
    if (persist) {
        savePlayerFormationOrder(normalizedFormation);
    }
    return normalizedFormation;
}

function initPlayerTabReordering() {
    const playerTab = document.getElementById("playerTab");
    if (!playerTab) {
        return;
    }

    applyPlayerFormationOrder(loadPlayerFormationOrder(), { persist: false });
    let draggedTabItem = null;

    const commitFormation = () => {
        applyPlayerFormationOrder(getPlayerFormationOrder());
    };
    const finishDragging = () => {
        if (!draggedTabItem) {
            return;
        }
        draggedTabItem.classList.remove("player-tab-dragging");
        draggedTabItem = null;
        commitFormation();
    };
    const moveDraggedTab = (clientX, clientY) => {
        if (!draggedTabItem) {
            return;
        }
        const targetTabItem = document.elementFromPoint(clientX, clientY)
            ?.closest("#playerTab .player-tab-item");
        if (!targetTabItem || targetTabItem === draggedTabItem) {
            return;
        }

        const bounds = targetTabItem.getBoundingClientRect();
        if (clientX < bounds.left + bounds.width / 2) {
            targetTabItem.before(draggedTabItem);
        } else {
            targetTabItem.after(draggedTabItem);
        }
    };

    document.addEventListener("mousemove", (event) => {
        if (!draggedTabItem) {
            return;
        }
        event.preventDefault();
        moveDraggedTab(event.clientX, event.clientY);
    });
    document.addEventListener("mouseup", finishDragging);
    document.addEventListener("touchmove", (event) => {
        if (!draggedTabItem || event.touches.length === 0) {
            return;
        }
        event.preventDefault();
        moveDraggedTab(event.touches[0].clientX, event.touches[0].clientY);
    }, { passive: false });
    document.addEventListener("touchend", finishDragging);
    document.addEventListener("touchcancel", finishDragging);

    for (const tabLink of playerTab.querySelectorAll(".nav-link")) {
        const tabItem = tabLink.closest(".nav-item");
        const slot = getPlayerSlotFromTab(tabLink);
        if (!tabItem || !slot) {
            continue;
        }

        tabItem.classList.add("player-tab-item");
        if (tabItem.querySelector(".player-tab-drag-handle")) {
            continue;
        }

        const dragHandle = document.createElement("button");
        dragHandle.type = "button";
        dragHandle.className = "player-tab-drag-handle";
        dragHandle.textContent = "↔";
        dragHandle.title = "Drag to change formation / 拖动调整站位";
        dragHandle.setAttribute("aria-label", dragHandle.title);
        dragHandle.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
        dragHandle.addEventListener("mousedown", (event) => {
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            draggedTabItem = tabItem;
            tabItem.classList.add("player-tab-dragging");
            dragHandle.focus({ preventScroll: true });
        });
        dragHandle.addEventListener("touchstart", (event) => {
            if (event.touches.length === 0) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            draggedTabItem = tabItem;
            tabItem.classList.add("player-tab-dragging");
            dragHandle.focus({ preventScroll: true });
        });
        dragHandle.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                return;
            }

            const tabItems = [...playerTab.querySelectorAll(".player-tab-item")];
            const currentIndex = tabItems.indexOf(tabItem);
            const targetIndex = event.key === "ArrowLeft" ? currentIndex - 1 : currentIndex + 1;
            if (targetIndex < 0 || targetIndex >= tabItems.length) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            if (event.key === "ArrowLeft") {
                tabItems[targetIndex].before(tabItem);
            } else {
                tabItems[targetIndex].after(tabItem);
            }
            commitFormation();
            dragHandle.focus();
        });
        tabItem.appendChild(dragHandle);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const simDungeonToggle = document.getElementById('simDungeonToggle');
    const playerContainer = document.getElementById('playerCheckBox');

    const player4Input = document.getElementById('player4');
    const player5Input = document.getElementById('player5');

    function addPlayers() {
        player4Input.parentElement.style.display = 'block';
        player5Input.parentElement.style.display = 'block';
    }

    function removePlayers() {
        player4Input.parentElement.style.display = 'none';
        player5Input.parentElement.style.display = 'none';
    }

    function updatePlayerNames() {
        updateTeamPresetPlayerLabels();
    }

    function updatePlayersCheckbox(isCheck) {
        const boxes = playerContainer.querySelectorAll('.player-checkbox');
        boxes.forEach((checkBox) => { checkBox.checked = isCheck });
    }

    function updateDifficultySelect(isCheck) {
        const difficultySelect = document.getElementById('selectDifficulty');
        // disable last four option
        if (isCheck && Number(difficultySelect.value) >= 3) {
            difficultySelect.value = 0;
        }
        for (let i = 3; i < difficultySelect.options.length; i++) {
            difficultySelect.options[i].disabled = isCheck;
        }
    }

    simDungeonToggle.addEventListener('change', function () {
        if (simDungeonToggle.checked) {
            addPlayers();
            updatePlayersCheckbox(true);
            updateDifficultySelect(true);
        } else {
            removePlayers();
            updatePlayersCheckbox(false);
            updateDifficultySelect(false);
        }
        updatePlayerNames();
    });

    document.getElementById('buttonSimulationSetup').addEventListener('click', function () {
        updatePlayerNames();
    });
});

function onTabChange(event) {
    const nextPlayerTabId = event.target.getAttribute('href').substring(7);
    savePreviousPlayer(currentPlayerTabId);
    updateNextPlayer(nextPlayerTabId);
    currentPlayerTabId = nextPlayerTabId;
    updateState();
    updateUI();
    if (Object.keys(currentSimResults).length !== 0) {
        showSimulationResult(currentSimResults);
    }

    updateContent();
}

document.querySelectorAll('#playerTab .nav-link').forEach(tab => {
    tab.addEventListener('shown.bs.tab', onTabChange);
});

initPlayerTabReordering();

function initSimulationControls() {
    let simulationTimeInput = document.getElementById("inputSimulationTime");
    simulationTimeInput.value = 24;

    buttonStartSimulation.addEventListener("click", (event) => {
        let invalidElements = document.querySelectorAll(":invalid");
        if (invalidElements.length > 0) {
            invalidElements.forEach((element) => element.reportValidity());
            return;
        }
        savePreviousPlayer(currentPlayerTabId);

        const simDungeonToggle = document.getElementById("simDungeonToggle");
        const checkedPlayerSlots = [...document.querySelectorAll('.player-checkbox:checked')]
            .map((checkbox) => checkbox.id.replace('player', ''));
        selectedPlayers = orderSelectedPlayerSlots(
            getPlayerFormationOrder(),
            checkedPlayerSlots,
        ).map(Number);

        if (selectedPlayers.length === 0) {
            alert("You need to select at least one player to sim.");
            return;
        }
        autoSaveCurrentTeamPreset(selectedPlayers);
        // buttonStartSimulation.disabled = true;
        buttonStopSimulation.style.display = 'block';
        startSimulation(selectedPlayers);
    });

    buttonStopSimulation.style.display = 'none';
    buttonStopSimulation.addEventListener("click", (event) => {
        pendingSimulationHistoryContext = null;
        progressbar.style.width = "0%";
        progressbar.innerHTML = "0%";
        if (worker) {
            worker.terminate();
        }
        worker = new Worker(new URL("worker.js", import.meta.url));

        if (multiWorker) {
            multiWorker.terminate();
        }
        multiWorker = new Worker(new URL("multiWorker.js", import.meta.url));

        for (let worker of workerPool) {
            worker.worker.terminate();
        }

        buttonStartSimulation.disabled = false;
        buttonStopSimulation.style.display = 'none';
    });
}

function startSimulation(selectedPlayers) {
    pendingSimulationHistoryContext = null;
    let simLabyrinthToggle = document.getElementById("simLabyrinthToggle");
    let simAllLabyrinthsToggle = document.getElementById("simAllLabyrinthsToggle");

    let playersToSim = [];
    for (const selectedPlayer of selectedPlayers) {
        const j = Number(selectedPlayer);
        if (Number.isInteger(j) && j >= 1 && j <= 5) {
            updateNextPlayer(j);
            updateState();
            updateUI();
            player.hrid = "player" + j.toString();
            if (!simLabyrinthToggle.checked && !simAllLabyrinthsToggle.checked) {
                for (let i = 0; i < 3; i++) {
                    if (food[i] && i < player.combatDetails.combatStats.foodSlots) {
                        let consumable = new Consumable(food[i], triggerMap[food[i]]);
                        player.food[i] = consumable;
                    } else {
                        player.food[i] = null;
                    }

                    if (drinks[i] && i < player.combatDetails.combatStats.drinkSlots) {
                        let consumable = new Consumable(drinks[i], triggerMap[drinks[i]]);
                        player.drinks[i] = consumable;
                    } else {
                        player.drinks[i] = null;
                    }
                }
            }

            for (let i = 0; i < 5; i++) {
                if (abilities[i] && player.intelligenceLevel >= abilitySlotsLevelRequirementList[i + 1]) {
                    let abilityLevelInput = document.getElementById("inputAbilityLevel_" + i);
                    let ability = new Ability(abilities[i], Number(abilityLevelInput.value), triggerMap[abilities[i]]);
                    player.abilities[i] = ability;
                } else {
                    player.abilities[i] = null;
                }
            }

            playersToSim.push(structuredClone(player));
        }
    }
    updateNextPlayer(currentPlayerTabId);
    updateState();
    updateUI();

    let maxPlayerCombatLevel = 1;
    for (let player of playersToSim) {
        player.combatLevel = calcCombatLevel(player.staminaLevel, player.intelligenceLevel, player.defenseLevel, player.attackLevel, player.meleeLevel, player.rangedLevel, player.magicLevel);
        maxPlayerCombatLevel = Math.max(maxPlayerCombatLevel, player.combatLevel);
    }

    for (let player of playersToSim) {
        if ((maxPlayerCombatLevel / player.combatLevel) > 1.2) {
            const maxDebuffOnLevelGap = 0.9;
            let levelPercent = (maxPlayerCombatLevel / player.combatLevel) - 1.2;

            player.debuffOnLevelGap = -1 * Math.min(maxDebuffOnLevelGap, 3 * levelPercent);

            console.log("player " + player.hrid + " debuff on level gap: " + player.debuffOnLevelGap * 100 + "% for " + (maxPlayerCombatLevel / player.combatLevel));
        }
        else {
            player.debuffOnLevelGap = 0;
        }
    }

    let extra = {};
    extra.mooPass = document.getElementById("mooPassToggle").checked;
    extra.comExp = 0;
    if (document.getElementById("comExpToggle").checked) {
        extra.comExp = Number(document.getElementById("comExpInput").value);
    }
    extra.comDrop = 0;
    if (document.getElementById("comDropToggle").checked) {
        extra.comDrop = Number(document.getElementById("comDropInput").value);
    }
    extra.enableHpMpVisualization = document.getElementById("hpMpVisualizationToggle").checked;
    extra.personalBuffs = [];
    if (document.getElementById("personalBuffsToggle").checked) {
        let personalBuffs = document.getElementById("personalBuffsBox").querySelectorAll("input");
        for (let buff of personalBuffs) {
            if (buff.checked) {
                extra.personalBuffs.push(buff.value);
            }
        }
    }

    let simAllZonesToggle = document.getElementById("simAllZoneToggle");
    let simAllSoloToggle = document.getElementById("simAllSoloToggle");
    let simDungeonToggle = document.getElementById("simDungeonToggle");
    let zoneSelect = document.getElementById("selectZone");
    let dungeonSelect = document.getElementById("selectDungeon");
    let difficultySelect = document.getElementById("selectDifficulty");
    let labyrinthSelect = document.getElementById("selectLabyrinth");
    let roomLevelInput = document.getElementById("inputRoomLevel");
    let simulationTimeInput = document.getElementById("inputSimulationTime");
    let simulationTimeLimit = Number(simulationTimeInput.value) * ONE_HOUR;
    buttonStopSimulation.style.display = 'block';

    let crates = [];
    Object.keys(LabyrinthSupplyItems).forEach((categoryKey, index) => {
        const categorySelect = document.getElementById('select'+categoryKey);
        if (!categorySelect) return;

        if (categorySelect.value !== "") crates.push(categorySelect.value);
    });

    if (!simAllZonesToggle.checked && !simAllSoloToggle.checked && !simAllLabyrinthsToggle.checked) {
        let simZone = null;
        let simLabyrinth = null;
        if (simLabyrinthToggle.checked) {
            let labyrinthHrid = labyrinthSelect.value;
            let roomLevel = Number(roomLevelInput.value);
            simLabyrinth = { labyrinthHrid: labyrinthHrid, roomLevel: roomLevel, crates: crates };
        } else {
            let zoneHrid = zoneSelect.value;
            let difficultyTier = Number(difficultySelect.value);
            if (simDungeonToggle.checked) {
                zoneHrid = dungeonSelect.value;
            }
            simZone = { zoneHrid: zoneHrid, difficultyTier: difficultyTier };
        }

        let workerMessage = {
            type: "start_simulation",
            workerId: Math.floor(Math.random() * 1e9).toString(),
            players: playersToSim,
            zone: simZone,
            labyrinth: simLabyrinth,
            simulationTimeLimit: simulationTimeLimit,
            extra : extra
        };
        pendingSimulationHistoryContext = captureSimulationHistoryContext(selectedPlayers);
        simStartTime = Date.now();
        if (!worker) {
            worker = new Worker(new URL("multiWorker.js", import.meta.url));
        }
        worker.onmessage = onWorkerMessage;
        worker.postMessage(workerMessage);
    } else if (simAllLabyrinthsToggle.checked) {
        let gameLabyrinths = Object.values(combatMonsterDetailMap)
        .filter((monster) => monster.isLabyrinthMonster === true)
        .sort((a, b) => a.sortIndex - b.sortIndex);

        let simHrids = gameLabyrinths
            .map(action => {
                let result = [];
                // floor 1 is room level 20-40, +20 level per floor
                for (let roomLevel = 40; roomLevel <= 220; roomLevel+=20) {
                    result.push({ labyrinthHrid: action.hrid, roomLevel: roomLevel, crates: crates });
                }
                return result;
            })
            .flat();

        let workerMessage = {
            type: "start_simulation_all_labyrinths",
            workerId: Math.floor(Math.random() * 1e9).toString(),
            players: playersToSim,
            labyrinths: simHrids,
            simulationTimeLimit: simulationTimeLimit,
            extra: extra
        };
        simStartTime = Date.now();
        if (!multiWorker) {
            multiWorker = new Worker(new URL("multiWorker.js", import.meta.url));
        }
        multiWorker.onmessage = onMultiWorkerMessage;
        multiWorker.postMessage(workerMessage);
    } else if (simAllZonesToggle.checked || simAllSoloToggle.checked) {
        let targetHrids = {};

        if (simAllZonesToggle.checked) {
            Object.values(actionDetailMap)
                .filter(a =>
                    a.type === "/action_types/combat" &&
                    a.category !== "/action_categories/combat/dungeons" &&
                    a.combatZoneInfo.fightInfo.randomSpawnInfo.maxSpawnCount > 1 &&
                    document.getElementById(a.hrid)?.checked
                )
                .forEach(a => { targetHrids[a.hrid] = a; });
        }

        if (simAllSoloToggle.checked) {
            Object.values(actionDetailMap)
                .filter(a =>
                    a.type === "/action_types/combat" &&
                    a.category !== "/action_categories/combat/dungeons" &&
                    a.combatZoneInfo.fightInfo.randomSpawnInfo.maxSpawnCount === 1 &&
                    document.getElementById(a.hrid)?.checked
                )
                .forEach(a => { targetHrids[a.hrid] = a; });
        }

        let simHrids = Object.values(targetHrids)
            .sort((a, b) => a.sortIndex - b.sortIndex)
            .map(action => {
                let result = [];
                for (let difficultyTier = 0; difficultyTier <= action.maxDifficulty; difficultyTier++) {
                    result.push({ zoneHrid: action.hrid, difficultyTier: difficultyTier });
                }
                return result;
            })
            .flat();

        let workerMessage = {
            type: "start_simulation_all_zones",
            workerId: Math.floor(Math.random() * 1e9).toString(),
            players: playersToSim,
            zones: simHrids,
            simulationTimeLimit: simulationTimeLimit,
            extra: extra
        };
        simStartTime = Date.now();
        if (!multiWorker) {
            multiWorker = new Worker(new URL("multiWorker.js", import.meta.url));
        }
        multiWorker.onmessage = onMultiWorkerMessage;
        multiWorker.postMessage(workerMessage);
    }
}

function parsePlayerJson(playerJson, hrid) {
    const guildCombatBuffs = Array.isArray(playerJson.guildCombatBuffs)
        ? playerJson.guildCombatBuffs
        : [];
    let playerData = {
        hrid: hrid,
        food: [],
        drinks: [],
        abilities: [],
        ...playerJson.player,
        houseRooms: playerJson.houseRooms,
        guildCombatBuffs,
        guildCombatBuffLevels: resolveGuildCombatShrineLevels(
            playerJson.guildCombatBuffLevels ?? playerJson.guildShrineLevels,
            guildCombatBuffs,
        ),
    };
    playerData.equipment = {};
    const triggerMap = playerJson.triggerMap;
    ["head", "body", "legs", "feet", "hands", "off_hand", "pouch", "neck", "earrings", "ring", "back", "main_hand", "two_hand", "charm"].forEach((type) => {
        let currentEquipment = playerJson.player.equipment.find(item => item.itemLocationHrid === "/item_locations/" + type);
        if (currentEquipment){
            playerData.equipment[`/equipment_types/${type}`] = new Equipment(currentEquipment.itemHrid, currentEquipment.enhancementLevel);
        }
    });

    for (const foodHrid of playerJson.food["/action_types/combat"]) {
        if (foodHrid.itemHrid === "") continue;
        const food = new Consumable(foodHrid.itemHrid, triggerMap[foodHrid.itemHrid]);
        playerData.food.push(food);
    }
    for (const drinkHrid of playerJson.drinks["/action_types/combat"]) {
        if (drinkHrid.itemHrid === "") continue;
        const drink = new Consumable(drinkHrid.itemHrid, triggerMap[drinkHrid.itemHrid]);
        playerData.drinks.push(drink);
    }
    for (const ability of playerJson.abilities) {
        if (ability.abilityHrid === "") continue;
        const abilityLevel = Number(ability.level);
        const abilityHrid = ability.abilityHrid;
        if (abilityLevel > 0) {
            const abilityObj = new Ability(abilityHrid, abilityLevel, triggerMap[abilityHrid]);
            playerData.abilities.push(abilityObj);
        }
    }
    const player = Player.createFromDTO(playerData)
    player.updateCombatDetails();
    player.houseRooms = playerJson.houseRooms;
    player.achievements = playerJson.achievements ?? {};
    return player;
}
// read JSON file to simulate
document.getElementById("buttonUploadJSONSimulate").addEventListener("click", (event) => {
    let extra = {};
    extra.mooPass = document.getElementById("mooPassToggle").checked;
    extra.comExp = 0;
    if (document.getElementById("comExpToggle").checked) {
        extra.comExp = Number(document.getElementById("comExpInput").value);
    }
    extra.comDrop = 0;
    if (document.getElementById("comDropToggle").checked) {
        extra.comDrop = Number(document.getElementById("comDropInput").value);
    }

    let fileInput = document.getElementById("inputUploadJSONSimulation");
    let file = fileInput.files[0];
    if (!file) {
        alert("Please select a file to upload.");
        return;
    }

    let reader = new FileReader();
    reader.onload = function (event) {
        let fileContent = event.target.result;
        const jsonDataList = JSON.parse(fileContent);
        try {
            const simDataList = [];
            for (const key in jsonDataList) {
                if (jsonDataList[key].cases) {
                    const cases = getProductCases(jsonDataList[key], jsonDataList[key].cases);
                    simDataList.push(...cases);
                } else {
                    simDataList.push(jsonDataList[key]);
                }
            }
            for (const key in simDataList) {
                const jsonData = simDataList[key];
                if (!jsonData || !jsonData.zone || !jsonData.players) {
                    alert("Invalid JSON file format. Please ensure it contains a 'simulationResult' property.");
                    return;
                }
                const playersToSim = Object.values(jsonData.players).map(
                    (player, index) => parsePlayerJson(player, `player${index + 1}`)
                );

                let maxPlayerCombatLevel = 1.0;
                for (let player of playersToSim) {
                    player.combatLevel = calcCombatLevel(player.staminaLevel, player.intelligenceLevel, player.defenseLevel, player.attackLevel, player.meleeLevel, player.rangedLevel, player.magicLevel);
                    maxPlayerCombatLevel = Math.max(maxPlayerCombatLevel, player.combatLevel);
                }

                for (let player of playersToSim) {
                    if ((maxPlayerCombatLevel / player.combatLevel) > 1.2) {
                        const maxDebuffOnLevelGap = 0.9;
                        let levelPercent = Math.floor(((maxPlayerCombatLevel / player.combatLevel) - 1.2) * 100) / 100;
                        player.debuffOnLevelGap = -1 * Math.min(maxDebuffOnLevelGap, 3 * levelPercent);
                        console.log("player " + player.hrid + " debuff on level gap: " + player.debuffOnLevelGap * 100 + "% for " + (maxPlayerCombatLevel / player.combatLevel));
                    }
                    else {
                        player.debuffOnLevelGap = 0;
                    }
                }

                const simulationTimeLimit = (jsonData.simulationTimeLimit || 24) * ONE_HOUR;
                const simName = jsonData.name || `Json ${key}`;
                const zoneHrid = jsonData.zone;
                if (zoneHrid === "all") {
                    let targetHrids = {};

                    if (simAllZonesToggle.checked) {
                        Object.values(actionDetailMap)
                            .filter(a =>
                                a.type === "/action_types/combat" &&
                                a.category !== "/action_categories/combat/dungeons" &&
                                a.combatZoneInfo.fightInfo.randomSpawnInfo.maxSpawnCount > 1
                            )
                            .forEach(a => { targetHrids[a.hrid] = a; });
                    }

                    let simHrids = Object.values(targetHrids)
                        .sort((a, b) => a.sortIndex - b.sortIndex)
                        .map(action => {
                            let result = [];
                            for (let difficultyTier = 0; difficultyTier <= action.maxDifficulty; difficultyTier++) {
                                result.push({ zoneHrid: action.hrid, difficultyTier: difficultyTier });
                            }
                            return result;
                        })
                        .flat();

                    let workerMessage = {
                        simulationName: simName,
                        type: "start_simulation_all_zones",
                        workerId: Math.floor(Math.random() * 1e9).toString(),
                        players: playersToSim,
                        zones: simHrids,
                        simulationTimeLimit: simulationTimeLimit,
                        extra : extra
                    };
                    const worker = new Worker(new URL("worker.js", import.meta.url)); 
                    worker.onmessage = mainWorkerOnMessage;
                    worker.postMessage(workerMessage);
                    customAlert("Simulation task Created", "info")
                    workerPool.push({
                        workerId: workerMessage.workerId,
                        worker: worker,
                    });
                } else {
                    let difficultyTier = jsonData.difficultyTier || 0;
                    let workerMessage = {
                        simulationName: simName,
                        type: "start_simulation",
                        workerId: Math.floor(Math.random() * 1e9).toString(),
                        players: playersToSim,
                        zone: { zoneHrid: zoneHrid, difficultyTier: difficultyTier },
                        simulationTimeLimit: simulationTimeLimit,
                        extra : extra
                    };
                    const worker = new Worker(new URL("worker.js", import.meta.url)); 
                    worker.onmessage = mainWorkerOnMessage;
                    worker.postMessage(workerMessage);
                    customAlert("Simulation task Created", "info")
                    workerPool.push({
                        workerId: workerMessage.workerId,
                        worker: worker,
                    });
                }
            }
        } catch (error) {
            // alert("Error parsing JSON file: " + error.message);
            customAlert("Error parsing JSON file: " + error.message, "danger");
        }
    }
    reader.readAsText(file);
});


// #endregion

// #region WipeEvents

function renderWipeEvents(simResult) {
    const selector = document.getElementById('wipeEventSelector');
    const logsContainer = document.getElementById('wipeLogsContainer');
    const waveBadge = document.getElementById('wipeWaveBadge');
    const timeInfo = document.getElementById('wipeTimeInfo');

    selector.innerHTML = '';
    logsContainer.innerHTML = '';

    if (!simResult.wipeEvents || simResult.wipeEvents.length === 0) {
        selector.innerHTML = `<option value="-1" data-i18n="common:noWipeEvents">No Wipe Events</option>`;
        logsContainer.innerHTML = `<div class="text-center py-4" data-i18n="common:noWipeEventsDetected">No Wipe Events Detected</div>`;
        waveBadge.textContent = '';
        timeInfo.textContent = '';
        return;
    }

    simResult.wipeEvents.forEach((event, index) => {
        const wave = event.wave || '?';
        // const time = (event.simulationTime / 1e9).toFixed(2);
        // const timestamp = new Date(event.timestamp).toLocaleTimeString();

        const option = document.createElement('option');
        option.value = index;
        option.textContent = `#${index + 1} - 波次: ${wave}`;
        selector.appendChild(option);
    });

    selector.value = 0;
    renderSelectedWipeEvent(0, simResult);

    selector.addEventListener('change', () => {
        renderSelectedWipeEvent(selector.value, simResult);
    });
}

// 渲染选中的团灭事件
function renderSelectedWipeEvent(index, simResult) {
    const logsContainer = document.getElementById('wipeLogsContainer');
    const waveBadge = document.getElementById('wipeWaveBadge');
    const timeInfo = document.getElementById('wipeTimeInfo');

    logsContainer.innerHTML = '';

    if (index < 0 || index >= simResult.wipeEvents.length) {
        logsContainer.innerHTML = `<div class="text-center py-4" data-i18n="common:noWipeEvents">No Wipe Events</div>`;
        waveBadge.textContent = '';
        timeInfo.textContent = '';
        return;
    }

    const wipeEvent = simResult.wipeEvents[index];
    const wave = wipeEvent.wave || '?';
    const time = (wipeEvent.simulationTime / 1e9).toFixed(2);
    const timestamp = new Date(wipeEvent.timestamp).toLocaleString();

    waveBadge.textContent = `波次: ${wave}`;
    timeInfo.textContent = `模拟时间: ${time}s | 记录时间: ${timestamp}`;

    const logsByTime = groupLogsByTime(wipeEvent.logs);

    const baseTime = logsByTime.length > 0 ? logsByTime[0].time : 0;

    logsByTime.forEach(group => {
        const timeGroupElement = document.createElement('div');
        timeGroupElement.className = 'log-time-group';

        const relativeTime = (group.time - baseTime) / 1e9;

        // 时间标题
        const timeHeader = document.createElement('div');
        timeHeader.className = 'log-time-header';
        timeHeader.textContent = `[${relativeTime.toFixed(2)}s] [Wave#${group.wave}]`;
        timeGroupElement.appendChild(timeHeader);

        // 事件列表
        const eventsList = document.createElement('div');
        eventsList.className = 'log-events';

        const damagedPlayers = new Set();

        group.logs.forEach(log => {
            const eventElement = document.createElement('div');
            eventElement.className = 'log-event';

            damagedPlayers.add(log.target);

            const sourceSpan = document.createElement('span');
            sourceSpan.className = 'log-source';
            if (log.ability === "damageOverTime") {
                sourceSpan.textContent = log.target;
            } else if(log.source == 'UNKNOWN_SOURCE') {
                sourceSpan.textContent = 'UNKNOWN';
            } else {
                sourceSpan.setAttribute('data-i18n', `monsterNames.${log.source}`);
                sourceSpan.textContent = log.source;
            }

            const castSpan = document.createElement('span');
            castSpan.className = 'log-cast';
            castSpan.setAttribute('data-i18n', `common:cast`);
            castSpan.textContent = ' cast ';

            const abilitySpan = document.createElement('span');
            abilitySpan.className = 'log-ability';
            if (log.ability === "autoAttack") {
                abilitySpan.setAttribute('data-i18n', 'combatUnit.autoAttack');
                abilitySpan.textContent = 'Auto Attack';
            } else if (log.ability === "physicalThorns") {
                abilitySpan.setAttribute('data-i18n', `combatStats.physicalThorns`);
                abilitySpan.textContent = 'Physical Thorns';
            } else if (log.ability === "elementalThorns") {
                abilitySpan.setAttribute('data-i18n', `combatStats.elementalThorns`);
                abilitySpan.textContent = 'Elemental Thorns';
            } else if (log.ability === "retaliation") {
                abilitySpan.setAttribute('data-i18n', `combatStats.retaliation`);
                abilitySpan.textContent = 'Retaliation';
            } else if (log.ability === "damageOverTime") {
                abilitySpan.setAttribute('data-i18n', `common:simulationResults.damageOverTime`);
                abilitySpan.textContent = 'Damage Over Time';
            } else {
                abilitySpan.setAttribute('data-i18n', `abilityNames.${log.ability}`);
                abilitySpan.textContent = log.ability;
            }

            const toSpan = document.createElement('span');
            toSpan.className = 'log-to';
            toSpan.setAttribute('data-i18n', `common:to`);
            toSpan.textContent = ' to ';

            const targetSpan = document.createElement('span');
            targetSpan.className = 'log-target';
            targetSpan.textContent = log.target;

            const dealDamageSpan = document.createElement('span');
            dealDamageSpan.className = 'log-deal-damage';
            dealDamageSpan.setAttribute('data-i18n', `common:dealDamage`);
            dealDamageSpan.textContent = ' deal damage ';

            const damageDoneSpan = document.createElement('span');
            damageDoneSpan.className = 'log-damage-done';
            damageDoneSpan.textContent = log.damage;
            if (log.isCrit) {
                damageDoneSpan.style.fontWeight = 'bold';
                damageDoneSpan.textContent += '!!!';
            }

            eventElement.appendChild(sourceSpan);
            eventElement.appendChild(castSpan);
            eventElement.appendChild(abilitySpan);
            eventElement.appendChild(toSpan);
            eventElement.appendChild(targetSpan);
            eventElement.appendChild(dealDamageSpan);
            eventElement.appendChild(damageDoneSpan);
            eventElement.appendChild(document.createTextNode(` , HP ${log.beforeHp} → ${log.afterHp}`));

            eventsList.appendChild(eventElement);
        });

        timeGroupElement.appendChild(eventsList);

        const lastLog = group.logs[group.logs.length - 1];
        const playersHpElement = document.createElement('div');

        const playerHpTitle = document.createElement('span');
        playerHpTitle.className = 'log-players-hp';
        playerHpTitle.setAttribute('data-i18n', `common:playersHp`);
        playerHpTitle.textContent = 'Players HP: ';
        playersHpElement.appendChild(playerHpTitle);

        lastLog.playersHp.forEach((player, idx) => {
            const playerElement = document.createElement('span');
            playerElement.className = 'log-player-hp';
            playerElement.textContent = `${player.hrid}: ${player.current}/${player.max}`;

            if (player.current <= 0) {
                playerElement.style.color = darkModeToggle.checked ? '#FF6347' : '#CC0000';
            } else if (damagedPlayers.has(player.hrid)) {
                playerElement.style.color = darkModeToggle.checked ? '#00BFFF' : '#007BFF';
            }

            if (idx > 0) {
                playersHpElement.appendChild(document.createTextNode(' | '));
            }
            playersHpElement.appendChild(playerElement);
        });
        const spacer = document.createElement('div');
        spacer.style.height = '15px';
        logsContainer.appendChild(spacer);
        timeGroupElement.appendChild(playersHpElement);
        logsContainer.appendChild(timeGroupElement);
    });

    // 更新汉化
    updateContent()
}

// 按时间分组日志
function groupLogsByTime(logs) {
    const groups = [];
    let currentGroup = null;

    logs.forEach(log => {
        if (!currentGroup || currentGroup.time !== log.time) {
            currentGroup = {
                time: log.time,
                wave: log.wave,
                logs: [log]
            };
            groups.push(currentGroup);
        } else {
            currentGroup.logs.push(log);
        }
    });

    groups.forEach(group => {
        let hpMap = {};
        if (group.logs.length > 0) {
            group.logs[0].playersHp.forEach(p => {
                hpMap[p.hrid] = { current: p.current, max: p.max };
            });
        }
        group.logs.forEach(log => {
            if (hpMap[log.target]) {
                hpMap[log.target].current = log.afterHp;
            }
        });
        group.logs.forEach(log => {
            log.playersHp = Object.entries(hpMap).map(([hrid, val]) => ({
                hrid,
                current: val.current,
                max: val.max
            }));
        });
    });

    return groups;
}

// #endregion


// #region Equipment Sets

function initEquipmentSetsModal() {
    let equipmentSetsModal = document.getElementById("equipmentSetsModal");
    equipmentSetsModal.addEventListener("show.bs.modal", equipmentSetsModalShownHandler);

    let equipmentSetNameInput = document.getElementById("inputEquipmentSetName");
    equipmentSetNameInput.addEventListener("input", (event) => equipmentSetNameChangedHandler(event));

    let createEquipmentSetButton = document.getElementById("buttonCreateNewEquipmentSet");
    createEquipmentSetButton.addEventListener("click", createNewEquipmentSetHandler);
}

function equipmentSetsModalShownHandler() {
    resetNewEquipmentSetControls();
    updateEquipmentSetList();
}

function resetNewEquipmentSetControls() {
    let equipmentSetNameInput = document.getElementById("inputEquipmentSetName");
    equipmentSetNameInput.value = "";

    let createEquipmentSetButton = document.getElementById("buttonCreateNewEquipmentSet");
    createEquipmentSetButton.disabled = true;
}

function updateEquipmentSetList() {
    let newChildren = [];
    let equipmentSets = loadEquipmentSets();

    for (const equipmentSetName of Object.keys(equipmentSets)) {
        let row = createElement("div", "row mb-2");

        let nameCol = createElement("div", "col align-self-center", equipmentSetName);
        row.appendChild(nameCol);

        let loadButtonCol = createElement("div", "col-md-auto");
        let loadButton = createElement("button", "btn btn-primary", "Load");
        loadButton.setAttribute("data-i18n", "common:controls.load");
        loadButton.setAttribute("type", "button");
        loadButton.addEventListener("click", (_) => loadEquipmentSetHandler(equipmentSetName));
        loadButtonCol.appendChild(loadButton);
        row.appendChild(loadButtonCol);

        let saveButtonCol = createElement("div", "col-md-auto");
        let saveButton = createElement("button", "btn btn-primary", "Save");
        saveButton.setAttribute("data-i18n", "common:controls.save");
        saveButton.setAttribute("type", "button");
        saveButton.addEventListener("click", (_) => updateEquipmentSetHandler(equipmentSetName));
        saveButtonCol.appendChild(saveButton);
        row.appendChild(saveButtonCol);

        let deleteButtonCol = createElement("div", "col-md-auto");
        let deleteButton = createElement("button", "btn btn-danger", "Delete");
        deleteButton.setAttribute("data-i18n", "common:controls.delete");
        deleteButton.setAttribute("type", "button");
        deleteButton.addEventListener("click", (_) => deleteEquipmentSetHandler(equipmentSetName));
        deleteButtonCol.appendChild(deleteButton);
        row.appendChild(deleteButtonCol);

        newChildren.push(row);
    }

    let equipmentSetList = document.getElementById("equipmentSetList");
    equipmentSetList.replaceChildren(...newChildren);

    updateContent();
}

function equipmentSetNameChangedHandler(event) {
    let invalid = false;

    if (event.target.value.length == 0) {
        invalid = true;
    }

    let equipmentSets = loadEquipmentSets();
    if (equipmentSets[event.target.value]) {
        invalid = true;
    }

    let createEquipmentSetButton = document.getElementById("buttonCreateNewEquipmentSet");
    createEquipmentSetButton.disabled = invalid;
}

function createNewEquipmentSetHandler() {
    let equipmentSetNameInput = document.getElementById("inputEquipmentSetName");
    let equipmentSetName = equipmentSetNameInput.value;

    let equipmentSet = getEquipmentSetFromUI();
    let equipmentSets = loadEquipmentSets();
    equipmentSets[equipmentSetName] = equipmentSet;
    saveEquipmentSets(equipmentSets);

    resetNewEquipmentSetControls();
    updateEquipmentSetList();
}

function loadEquipmentSetHandler(name) {
    let equipmentSets = loadEquipmentSets();
    loadEquipmentSetIntoUI(equipmentSets[name]);
}

function updateEquipmentSetHandler(name) {
    let equipmentSet = getEquipmentSetFromUI();
    let equipmentSets = loadEquipmentSets();
    equipmentSets[name] = equipmentSet;
    saveEquipmentSets(equipmentSets);
}

function deleteEquipmentSetHandler(name) {
    let equipmentSets = loadEquipmentSets();
    delete equipmentSets[name];
    saveEquipmentSets(equipmentSets);

    updateEquipmentSetList();
}

function loadEquipmentSets() {
    return JSON.parse(localStorage.getItem("equipmentSets")) ?? {};
}

function saveEquipmentSets(equipmentSets) {
    localStorage.setItem("equipmentSets", JSON.stringify(equipmentSets));
}

function getEquipmentSetFromUI() {
    let equipmentSet = {
        levels: {},
        equipment: {},
        food: {},
        drinks: {},
        abilities: {},
        triggerMap: {},
        houseRooms: {},
        achievements: {},
        guildCombatBuffLevels: {},
    };

    ["stamina", "intelligence", "attack", "melee", "defense", "ranged", "magic"].forEach((skill) => {
        let levelInput = document.getElementById("inputLevel_" + skill);
        equipmentSet.levels[skill] = Number(levelInput.value);
    });

    ["head", "body", "legs", "feet", "hands", "weapon", "off_hand", "pouch", "neck", "earrings", "ring", "back", "charm"].forEach((type) => {
        let equipmentSelect = document.getElementById("selectEquipment_" + type);
        let enhancementLevelInput = document.getElementById("inputEquipmentEnhancementLevel_" + type);

        equipmentSet.equipment[type] = {
            equipment: equipmentSelect.value,
            enhancementLevel: Number(enhancementLevelInput.value),
        };
    });

    for (let i = 0; i < 3; i++) {
        let foodSelect = document.getElementById("selectFood_" + i);
        equipmentSet.food[i] = foodSelect.value;
    }

    for (let i = 0; i < 3; i++) {
        let drinkSelect = document.getElementById("selectDrink_" + i);
        equipmentSet.drinks[i] = drinkSelect.value;
    }

    for (let i = 0; i < 5; i++) {
        let abilitySelect = document.getElementById("selectAbility_" + i);
        let abilityLevelInput = document.getElementById("inputAbilityLevel_" + i);
        equipmentSet.abilities[i] = {
            ability: abilitySelect.value,
            level: Number(abilityLevelInput.value),
        };
    }

    equipmentSet.triggerMap = triggerMap;

    equipmentSet.houseRooms = player.houseRooms;
    equipmentSet.achievements = player.achievements;
    equipmentSet.guildCombatBuffLevels = player.guildCombatBuffLevels;

    return equipmentSet;
}

function fixTriggerMap(triggerMap) {
    let delKeys = []
    for (const key of Object.keys(triggerMap)) {
        let err = false;
        if (null == triggerMap[key]) {
            triggerMap[key] = [];
        }
        for (const trigger of triggerMap[key]) {
            if (!combatTriggerConditionDetailMap[trigger.conditionHrid]) {
                err = true;
                break;
            }
        }
        if (err) {
            delKeys.push(key);
        }
    }
    for (const key of delKeys) {
        delete triggerMap[key];
    }
}

function loadEquipmentSetIntoUI(equipmentSet) {
    ["stamina", "intelligence", "attack", "melee", "defense", "ranged", "magic"].forEach((skill) => {
        let levelInput = document.getElementById("inputLevel_" + skill);
        if (skill == "melee" && !equipmentSet.levels["meleeLevel"] && equipmentSet.levels["powerLevel"]) {
            equipmentSet.levels["meleeLevel"] = equipmentSet.levels["powerLevel"];
        }
        levelInput.value = equipmentSet.levels[skill] ?? 1;
    });

    ["head", "body", "legs", "feet", "hands", "weapon", "off_hand", "pouch", "neck", "earrings", "ring", "back", "charm"].forEach((type) => {
        let equipmentSelect = document.getElementById("selectEquipment_" + type);
        let enhancementLevelInput = document.getElementById("inputEquipmentEnhancementLevel_" + type);

        let currentEquipment = equipmentSet.equipment[type];
        if (currentEquipment !== undefined) {
            equipmentSelect.value = currentEquipment.equipment;
            enhancementLevelInput.value = currentEquipment.enhancementLevel;
        } else {
            equipmentSelect.value = "";
            enhancementLevelInput.value = 0;
        }
    });

    for (let i = 0; i < 3; i++) {
        let foodSelect = document.getElementById("selectFood_" + i);
        foodSelect.value = equipmentSet.food[i];
    }

    for (let i = 0; i < 3; i++) {
        let drinkSelect = document.getElementById("selectDrink_" + i);
        drinkSelect.value = equipmentSet.drinks[i].replace("power", "melee");
    }

    let hasSpecial = false;
    if (equipmentSet.abilities && Object.keys(equipmentSet.abilities).length == 5) {
        hasSpecial = true;
    }

    for (let i = 0; i < (hasSpecial ? 5 : 4); i++) {
        let abilitySlot = hasSpecial ? i : (i + 1);
        let abilitySelect = document.getElementById("selectAbility_" + abilitySlot);
        let abilityLevelInput = document.getElementById("inputAbilityLevel_" + abilitySlot);

        if (hasSpecial && i == 0 && (
            equipmentSet.abilities[i].ability == "/abilities/aqua_aura" ||
            equipmentSet.abilities[i].ability == "/abilities/flame_aura" ||
            equipmentSet.abilities[i].ability == "/abilities/sylvan_aura"
        )
        ) {
            equipmentSet.abilities[i].ability = "/abilities/mystic_aura";
        }

        if (equipmentSet.abilities[i].ability == "/abilities/arcane_reflection") {
            equipmentSet.abilities[i].ability = "/abilities/retribution";
        }

        abilitySelect.value = equipmentSet.abilities[i].ability;
        abilityLevelInput.value = equipmentSet.abilities[i].level;
    }

    triggerMap = equipmentSet.triggerMap;
    fixTriggerMap(triggerMap);

    if (equipmentSet.houseRooms) {
        for (const room in equipmentSet.houseRooms) {
            const field = document.querySelector('[data-house-hrid="' + room + '"]');
            if (equipmentSet.houseRooms[room]) {
                field.value = equipmentSet.houseRooms[room];
            } else {
                field.value = '';
            }
        }
        player.houseRooms = equipmentSet.houseRooms;
    } else {
        let houseRooms = Object.values(houseRoomDetailMap);
        for (const room of Object.values(houseRooms)) {
            const field = document.querySelector('[data-house-hrid="' + room.hrid + '"]');
            field.value = '';
            player.houseRooms[room.hrid] = 0;
        }
    }

    if (equipmentSet.achievements) {
        for (const achievement in equipmentSet.achievements) {
            const field = document.querySelector('[data-achievement-hrid="' + achievement + '"]');
            if (!field) continue;
            if (equipmentSet.achievements[achievement]) {
                field.checked = true;
            } else {
                field.checked = false;
            }
            player.achievements[achievement] = field.checked;
        }
    } else {
        let achievements = Object.values(achievementDetailMap);
        for (const detail of Object.values(achievements)) {
            const field = document.querySelector('[data-achievement-hrid="' + detail.hrid + '"]');
            field.checked = false;
            player.achievements[detail.hrid] = false;
        }
    }
    refreshAchievementStatics();
    setGuildCombatBuffLevels(equipmentSet.guildCombatBuffLevels ?? {});

    updateState();
    updateUI();

    updateContent();
}

// #endregion

// #region Error Handling

function initErrorHandling() {
    window.addEventListener("error", (event) => {
        showErrorModal(event.message);
    });

    let copyErrorButton = document.getElementById("buttonCopyError");
    copyErrorButton.addEventListener("click", (event) => {
        let errorInput = document.getElementById("inputError");
        navigator.clipboard.writeText(errorInput.value);
    });
}

function initImportExportModal() {
    let exportSetButton = document.getElementById("buttonExportSet");
    exportSetButton.addEventListener("click", (event) => {
        savePreviousPlayer(currentPlayerTabId);
        const activeTab = document.querySelector('#importTab .nav-link.active');
        if (activeTab.id === 'group-combat-tab') {
            doGroupExport();
        } else if (activeTab.id === 'solo-tab') {
            doSoloExport();
        }
    });

    let importSetButton = document.getElementById("buttonImportSet");
    importSetButton.addEventListener("click", (event) => {
        const activeTab = document.querySelector('#importTab .nav-link.active');
        if (activeTab.id === 'group-combat-tab') {
            doGroupImport();
        } else if (activeTab.id === 'solo-tab') {
            doSoloImport();
        }
        updateState();
        updateUI();
        resetImportInputs();
    });
}

function resetImportInputs() {
    document.getElementById('inputSetGroupCombatAll').value = '';
    document.getElementById('inputSetGroupCombatplayer1').value = '';
    document.getElementById('inputSetGroupCombatplayer2').value = '';
    document.getElementById('inputSetGroupCombatplayer3').value = '';
    document.getElementById('inputSetGroupCombatplayer4').value = '';
    document.getElementById('inputSetGroupCombatplayer5').value = '';
    document.getElementById('inputSetSolo').value = '';
}

function doGroupExport() {
    try {
        navigator.clipboard.writeText(JSON.stringify(playerDataMap)).then(() => alert("Current Group has been copied to clipboard."));
    } catch (err) {
        alert('Error copying to clipboard: ' + err);
    }
}

function doSoloExport() {
    let zoneSelect = document.getElementById("selectZone");
    let simulationTimeInput = document.getElementById("inputSimulationTime");
    let equipmentArray = [];
    for (const item in player.equipment) {
        if (player.equipment[item] != null) {
            equipmentArray.push({
                "itemLocationHrid": player.equipment[item].gameItem.equipmentDetail.type.replaceAll("equipment_types", "item_locations"),
                "itemHrid": player.equipment[item].hrid,
                "enhancementLevel": player.equipment[item].enhancementLevel
            });
        }
    }
    let playerArray = {
        "attackLevel": player.attackLevel,
        "magicLevel": player.magicLevel,
        "meleeLevel": player.meleeLevel,
        "rangedLevel": player.rangedLevel,
        "defenseLevel": player.defenseLevel,
        "staminaLevel": player.staminaLevel,
        "intelligenceLevel": player.intelligenceLevel,
        "equipment": equipmentArray
    };
    let abilitiesArray = [];
    for (let i = 0; i < 5; i++) {
        let abilityLevelInput = document.getElementById("inputAbilityLevel_" + i);
        let abilityName = document.getElementById("selectAbility_" + i);
        abilitiesArray[i] = { "abilityHrid": abilityName.value, "level": abilityLevelInput.value };
    }
    let drinksArray = [];
    for (let i = 0; i < drinks?.length; i++) {
        drinksArray.push({ "itemHrid": drinks[i] });
    }
    let foodArray = [];
    for (let i = 0; i < food?.length; i++) {
        foodArray.push({ "itemHrid": food[i] });
    }
    let state = {
        player: playerArray,
        food: { "/action_types/combat": foodArray },
        drinks: { "/action_types/combat": drinksArray },
        abilities: abilitiesArray,
        triggerMap: triggerMap,
        zone: zoneSelect.value,
        simulationTime: simulationTimeInput.value,
        houseRooms: player.houseRooms,
        achievements: player.achievements,
        guildCombatBuffLevels: player.guildCombatBuffLevels,
    };
    try {
        navigator.clipboard.writeText(JSON.stringify(state)).then(() => alert("Current set has been copied to clipboard."));
    } catch (err) {
        alert('Error copying to clipboard: ' + err);
    }
}

function getPlayerTabName(playerId) {
    const playerName = document.getElementById(`player${playerId}-tab`)?.textContent?.trim() ?? "";
    return /^Player\s*\d+$/i.test(playerName) ? "" : playerName;
}

function normalizePlayerImportData(playerId, value) {
    const importData = JSON.parse(value);
    const pendingLoadout = pendingImporterLoadoutNames.get(String(playerId));
    pendingImporterLoadoutNames.delete(String(playerId));

    if (
        !importData.loadoutName &&
        pendingLoadout &&
        Date.now() - pendingLoadout.capturedAt < 10000
    ) {
        importData.loadoutName = pendingLoadout.name;
    }

    if (!importData.characterName) {
        const playerName = getPlayerTabName(playerId);
        if (playerName) {
            importData.characterName = playerName;
        }
    }

    if (typeof importData.characterName === "string" && importData.characterName.trim()) {
        const playerTab = document.getElementById(`player${playerId}-tab`);
        if (playerTab) {
            playerTab.textContent = importData.characterName.trim();
        }
    }

    return JSON.stringify(importData);
}

function setPlayerData(playerId, inputElementId) {
    const inputElement = document.getElementById(inputElementId);
    const value = inputElement ? inputElement.value.trim() : "";

    // Only set the value in the map if it's not null, undefined, or empty
    if (value) {
        playerDataMap[playerId] = normalizePlayerImportData(playerId, value);
        return true;
    }
    return false;
}

function doGroupImport() {
    let needUpdateCurrentTab = false;
    const value = document.getElementById("inputSetGroupCombatAll")?.value || "";
    if (!value.trim()) {
        for (let i of ['1', '2', '3', '4', '5']) {
            if (setPlayerData(i, "inputSetGroupCombatplayer" + i) && currentPlayerTabId == i) {
                needUpdateCurrentTab = true;
            }
        }
    } else {
        playerDataMap = JSON.parse(value);
        for (let i of ['1', '2', '3', '4', '5']) {
            if (typeof playerDataMap[i] === "string") {
                playerDataMap[i] = normalizePlayerImportData(i, playerDataMap[i]);
            }
        }
        needUpdateCurrentTab = true;
    }

    if (needUpdateCurrentTab) {
        updateNextPlayer(currentPlayerTabId);
    }
    updateTeamPresetPlayerLabels();
}

function doSoloImport() {
    let importSet = document.getElementById("inputSetSolo").value;
    importSet = JSON.parse(importSet);
    player.guildCombatBuffs = Array.isArray(importSet.guildCombatBuffs)
        ? structuredClone(importSet.guildCombatBuffs)
        : [];
    setGuildCombatBuffLevels(resolveGuildCombatShrineLevels(
        importSet.guildCombatBuffLevels ?? importSet.guildShrineLevels,
        player.guildCombatBuffs,
    ));
    ["stamina", "intelligence", "attack", "melee", "defense", "ranged", "magic"].forEach((skill) => {
        let levelInput = document.getElementById("inputLevel_" + skill);
        if (skill == "melee" && !importSet.player["meleeLevel"] && importSet.player["powerLevel"]) {
            importSet.player["meleeLevel"] = importSet.player["powerLevel"];
        }
        levelInput.value = importSet.player[skill + "Level"];
    });

    ["head", "body", "legs", "feet", "hands", "off_hand", "pouch", "neck", "earrings", "ring", "back", "charm"].forEach((type) => {
        let equipmentSelect = document.getElementById("selectEquipment_" + type);
        let enhancementLevelInput = document.getElementById("inputEquipmentEnhancementLevel_" + type);
        let currentEquipment = importSet.player.equipment.find(item => item.itemLocationHrid === "/item_locations/" + type);
        if (currentEquipment !== undefined) {
            equipmentSelect.value = currentEquipment.itemHrid;
            enhancementLevelInput.value = currentEquipment.enhancementLevel;
        } else {
            equipmentSelect.value = "";
            enhancementLevelInput.value = 0;
        }
    });

    let weaponSelect = document.getElementById("selectEquipment_weapon");
    let weaponEnhancementLevelInput = document.getElementById("inputEquipmentEnhancementLevel_weapon");
    let mainhandWeapon = importSet.player.equipment.find(item => item.itemLocationHrid === "/item_locations/main_hand");
    let twohandWeapon = importSet.player.equipment.find(item => item.itemLocationHrid === "/item_locations/two_hand");
    if (mainhandWeapon !== undefined) {
        weaponSelect.value = mainhandWeapon.itemHrid;
        weaponEnhancementLevelInput.value = mainhandWeapon.enhancementLevel;
    } else if (twohandWeapon !== undefined) {
        weaponSelect.value = twohandWeapon.itemHrid;
        weaponEnhancementLevelInput.value = twohandWeapon.enhancementLevel;
    } else {
        weaponSelect.value = "";
        weaponEnhancementLevelInput.value = 0;
    }
    importSet.drinks = importSet.drinks["/action_types/combat"];
    importSet.food = importSet.food["/action_types/combat"];
    for (let i = 0; i < 3; i++) {
        let drinkSelect = document.getElementById("selectDrink_" + i);
        let foodSelect = document.getElementById("selectFood_" + i);
        if (importSet.drinks[i] != null) {
            drinkSelect.value = importSet.drinks[i].itemHrid.replace('power', 'melee');
        } else {
            drinkSelect.value = "";
        }
        if (importSet.food[i] != null) {
            foodSelect.value = importSet.food[i].itemHrid;
        } else {
            foodSelect.value = "";
        }
    }

    let hasSpecial = false;
    if (importSet.abilities && Object.keys(importSet.abilities).length == 5) {
        hasSpecial = true;
    }

    for (let i = 0; i < (hasSpecial ? 5 : 4); i++) {
        let abilitySlot = hasSpecial ? i : (i + 1);
        let abilitySelect = document.getElementById("selectAbility_" + abilitySlot);
        let abilityLevelInput = document.getElementById("inputAbilityLevel_" + abilitySlot);

        if (hasSpecial && i == 0 && (
            importSet.abilities[i].abilityHrid == "/abilities/aqua_aura" ||
            importSet.abilities[i].abilityHrid == "/abilities/flame_aura" ||
            importSet.abilities[i].abilityHrid == "/abilities/sylvan_aura"
        )
        ) {
            importSet.abilities[i].abilityHrid = "/abilities/mystic_aura";
        }

        if (importSet.abilities[i].abilityHrid == "/abilities/arcane_reflection") {
            importSet.abilities[i].abilityHrid = "/abilities/retribution";
        }

        if (importSet.abilities[i] != null) {
            abilitySelect.value = importSet.abilities[i].abilityHrid;
            abilityLevelInput.value = String(importSet.abilities[i].level);
        } else {
            abilitySelect.value = "";
            abilityLevelInput.value = "1";
        }
    }

    if (importSet.triggerMap) {
        triggerMap = importSet.triggerMap;
        fixTriggerMap(triggerMap);
    }

    if (importSet.houseRooms) {
        for (const room in importSet.houseRooms) {
            const field = document.querySelector('[data-house-hrid="' + room + '"]');
            if (importSet.houseRooms[room]) {
                field.value = importSet.houseRooms[room];
            } else {
                field.value = '';
            }
        }
        player.houseRooms = importSet.houseRooms;
    } else {
        let houseRooms = Object.values(houseRoomDetailMap);
        for (const room of Object.values(houseRooms)) {
            const field = document.querySelector('[data-house-hrid="' + room.hrid + '"]');
            field.value = '';
            player.houseRooms[room.hrid] = 0;
        }
    }

    if (importSet.achievements) {
        for (const achievement in importSet.achievements) {
            const field = document.querySelector('[data-achievement-hrid="' + achievement + '"]');
            if (!field) continue;
            if (importSet.achievements[achievement]) {
                field.checked = true;
            } else {
                field.checked = false;
            }
            player.achievements[achievement] = field.checked;
        }
    } else {
        let achievements = Object.values(achievementDetailMap);
        for (const detail of Object.values(achievements)) {
            const field = document.querySelector('[data-achievement-hrid="' + detail.hrid + '"]');
            field.checked = false;
            player.achievements[detail.hrid] = false;
        }
    }
    refreshAchievementStatics();

    if ("zone" in importSet) {
        let zoneSelect = document.getElementById("selectZone");
        zoneSelect.value = importSet["zone"];
    }

    if ("simulationTime" in importSet) {
        let simulationDuration = document.getElementById("inputSimulationTime");
        simulationDuration.value = importSet["simulationTime"];
    }
}

function savePreviousPlayer(playerId) {
    // Keep the serialized slot in sync even when a control has not emitted its
    // change event yet (for example, when Save is clicked while an input is focused).
    updateState();
    let zoneSelect = document.getElementById("selectZone");
    let simulationTimeInput = document.getElementById("inputSimulationTime");
    let equipmentArray = [];
    for (const item in player.equipment) {
        if (player.equipment[item] != null) {
            equipmentArray.push({
                "itemLocationHrid": player.equipment[item].gameItem.equipmentDetail.type.replaceAll("equipment_types", "item_locations"),
                "itemHrid": player.equipment[item].hrid,
                "enhancementLevel": player.equipment[item].enhancementLevel
            });
        }
    }
    let playerArray = {
        "attackLevel": player.attackLevel,
        "magicLevel": player.magicLevel,
        "meleeLevel": player.meleeLevel,
        "rangedLevel": player.rangedLevel,
        "defenseLevel": player.defenseLevel,
        "staminaLevel": player.staminaLevel,
        "intelligenceLevel": player.intelligenceLevel,
        "equipment": equipmentArray
    };
    let abilitiesArray = [];
    for (let i = 0; i < 5; i++) {
        let abilityLevelInput = document.getElementById("inputAbilityLevel_" + i);
        let abilityName = document.getElementById("selectAbility_" + i);
        abilitiesArray[i] = { "abilityHrid": abilityName.value, "level": abilityLevelInput.value };
    }
    let drinksArray = [];
    for (let i = 0; i < drinks?.length; i++) {
        drinksArray.push({ "itemHrid": drinks[i] });
    }
    let foodArray = [];
    for (let i = 0; i < food?.length; i++) {
        foodArray.push({ "itemHrid": food[i] });
    }
    let importMetadata = {};
    try {
        const previousImportData = JSON.parse(playerDataMap[playerId]);
        const simulatorStateKeys = new Set([
            "player",
            "food",
            "drinks",
            "abilities",
            "triggerMap",
            "zone",
            "simulationTime",
            "houseRooms",
            "achievements",
            "guildCombatBuffLevels",
            "guildShrineLevels",
        ]);
        for (const [key, value] of Object.entries(previousImportData)) {
            if (!simulatorStateKeys.has(key)) {
                importMetadata[key] = value;
            }
        }
    } catch (error) {
        console.warn("Unable to preserve player import metadata.", error);
    }

    let state = {
        ...importMetadata,
        player: playerArray,
        food: { "/action_types/combat": foodArray },
        drinks: { "/action_types/combat": drinksArray },
        abilities: abilitiesArray,
        triggerMap: triggerMap,
        zone: zoneSelect.value,
        simulationTime: simulationTimeInput.value,
        houseRooms: player.houseRooms,
        achievements: player.achievements,
        guildCombatBuffLevels: player.guildCombatBuffLevels,
    };
    try {
        playerDataMap[playerId] = JSON.stringify(state);
    } catch (err) {
        alert('Error copying to clipboard: ' + err);
    }
}

function updateNextPlayer(currentPlayerNumber) {
    let playerImportData = playerDataMap[currentPlayerNumber];
    let importSet = JSON.parse(playerImportData);
    player.guildCombatBuffs = Array.isArray(importSet.guildCombatBuffs)
        ? structuredClone(importSet.guildCombatBuffs)
        : [];
    setGuildCombatBuffLevels(resolveGuildCombatShrineLevels(
        importSet.guildCombatBuffLevels ?? importSet.guildShrineLevels,
        player.guildCombatBuffs,
    ));
    ["stamina", "intelligence", "attack", "melee", "defense", "ranged", "magic"].forEach((skill) => {
        let levelInput = document.getElementById("inputLevel_" + skill);
        if (skill == "melee" && !importSet.player["meleeLevel"] && importSet.player["powerLevel"]) {
            importSet.player["meleeLevel"] = importSet.player["powerLevel"];
        }
        levelInput.value = importSet.player[skill + "Level"];
    });

    ["head", "body", "legs", "feet", "hands", "off_hand", "pouch", "neck", "earrings", "ring", "back", "charm"].forEach((type) => {

        let equipmentSelect = document.getElementById("selectEquipment_" + type);
        let enhancementLevelInput = document.getElementById("inputEquipmentEnhancementLevel_" + type);
        let currentEquipment = importSet.player.equipment.find(item => item.itemLocationHrid === "/item_locations/" + type);
        if (currentEquipment !== undefined) {
            equipmentSelect.value = currentEquipment.itemHrid;
            enhancementLevelInput.value = currentEquipment.enhancementLevel;
        } else {
            equipmentSelect.value = "";
            enhancementLevelInput.value = 0;
        }
    });

    let weaponSelect = document.getElementById("selectEquipment_weapon");
    let weaponEnhancementLevelInput = document.getElementById("inputEquipmentEnhancementLevel_weapon");
    let mainhandWeapon = importSet.player.equipment.find(item => item.itemLocationHrid === "/item_locations/main_hand");
    let twohandWeapon = importSet.player.equipment.find(item => item.itemLocationHrid === "/item_locations/two_hand");
    if (mainhandWeapon !== undefined) {
        weaponSelect.value = mainhandWeapon.itemHrid;
        weaponEnhancementLevelInput.value = mainhandWeapon.enhancementLevel;
    } else if (twohandWeapon !== undefined) {
        weaponSelect.value = twohandWeapon.itemHrid;
        weaponEnhancementLevelInput.value = twohandWeapon.enhancementLevel;
    } else {
        weaponSelect.value = "";
        weaponEnhancementLevelInput.value = 0;
    }
    importSet.drinks = importSet.drinks["/action_types/combat"];
    importSet.food = importSet.food["/action_types/combat"];
    for (let i = 0; i < 3; i++) {
        let drinkSelect = document.getElementById("selectDrink_" + i);
        let foodSelect = document.getElementById("selectFood_" + i);
        if (importSet.drinks[i] != null) {
            drinkSelect.value = importSet.drinks[i].itemHrid.replace('power', 'melee');
        } else {
            drinkSelect.value = "";
        }
        if (importSet.food[i] != null) {
            foodSelect.value = importSet.food[i].itemHrid;
        } else {
            foodSelect.value = "";
        }
    }

    let hasSpecial = false;
    if (importSet.abilities && Object.keys(importSet.abilities).length == 5) {
        hasSpecial = true;
    }

    for (let i = 0; i < (hasSpecial ? 5 : 4); i++) {
        let abilitySlot = hasSpecial ? i : (i + 1);
        let abilitySelect = document.getElementById("selectAbility_" + abilitySlot);
        let abilityLevelInput = document.getElementById("inputAbilityLevel_" + abilitySlot);

        if (hasSpecial && i == 0 && (
            importSet.abilities[i].abilityHrid == "/abilities/aqua_aura" ||
            importSet.abilities[i].abilityHrid == "/abilities/flame_aura" ||
            importSet.abilities[i].abilityHrid == "/abilities/sylvan_aura"
        )
        ) {
            importSet.abilities[i].abilityHrid = "/abilities/mystic_aura";
        }

        if (importSet.abilities[i].abilityHrid == "/abilities/arcane_reflection") {
            importSet.abilities[i].abilityHrid = "/abilities/retribution";
        }

        if (importSet.abilities[i] != null) {
            abilitySelect.value = importSet.abilities[i].abilityHrid;
            abilityLevelInput.value = String(importSet.abilities[i].level);
        } else {
            abilitySelect.value = "";
            abilityLevelInput.value = "1";
        }
    }

    if (importSet.triggerMap) {
        triggerMap = importSet.triggerMap;
        fixTriggerMap(triggerMap);
    }

    { // reset all houseRooms
        let houseRooms = Object.values(houseRoomDetailMap);
        for (const room of Object.values(houseRooms)) {
            const field = document.querySelector('[data-house-hrid="' + room.hrid + '"]');
            field.value = '';
            player.houseRooms[room.hrid] = 0;
        }
    }
    if (importSet.houseRooms) {
        for (const room in importSet.houseRooms) {
            const field = document.querySelector('[data-house-hrid="' + room + '"]');
            if (importSet.houseRooms[room]) {
                field.value = importSet.houseRooms[room];
            } else {
                field.value = '';
            }
        }
        player.houseRooms = importSet.houseRooms;
    }

    { // reset all achievements
        let achievements = Object.values(achievementDetailMap);
        for (const detail of Object.values(achievements)) {
            const field = document.querySelector('[data-achievement-hrid="' + detail.hrid + '"]');
            field.checked = false;
            player.achievements[detail.hrid] = false;
        }
    }
    if (importSet.achievements) {
        for (const achievement in importSet.achievements) {
            const field = document.querySelector('[data-achievement-hrid="' + achievement + '"]');
            if (!field) continue;
            if (importSet.achievements[achievement]) {
                field.checked = true;
                player.achievements[achievement] = true;
            } else {
                field.checked = false;
                player.achievements[achievement] = false;
            }
        }
    }
    refreshAchievementStatics();
}

// #region Team Presets

function interpolateTeamPresetFallback(fallback, values = {}) {
    return Object.entries(values).reduce(
        (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
        fallback,
    );
}

function getTeamPresetText(key, fallback, values = {}) {
    try {
        if (typeof i18next !== "undefined" && i18next.isInitialized) {
            const translationKey = `common:teamPresets.${key}`;
            const translated = i18next.t(translationKey, values);
            if (translated && translated !== translationKey) {
                return translated;
            }
        }
    } catch (error) {
        console.warn("Unable to translate team preset text.", error);
    }
    return interpolateTeamPresetFallback(fallback, values);
}

function setTeamPresetStatus(message = "", style = "muted") {
    const status = document.getElementById("teamPresetStatus");
    status.textContent = message;
    status.classList.remove("text-muted", "text-success", "text-danger");
    status.classList.add(`text-${style}`);
}

function getCurrentTeamPresetTarget() {
    const unsupportedToggleIds = [
        "simAllZoneToggle",
        "simAllSoloToggle",
        "simLabyrinthToggle",
        "simAllLabyrinthsToggle",
    ];
    if (unsupportedToggleIds.some((id) => document.getElementById(id)?.checked)) {
        return null;
    }

    const isDungeon = document.getElementById("simDungeonToggle")?.checked === true;
    const select = document.getElementById(isDungeon ? "selectDungeon" : "selectZone");
    const difficultyTier = Number(document.getElementById("selectDifficulty")?.value ?? 0);
    if (!select?.value) {
        return null;
    }

    return {
        kind: isDungeon ? "dungeon" : "zone",
        hrid: select.value,
        difficultyTier,
    };
}

function getTeamPresetTargetLabel(target) {
    const selectId = target.kind === "dungeon" ? "selectDungeon" : "selectZone";
    const targetSelect = document.getElementById(selectId);
    const targetName = targetSelect?.selectedOptions?.[0]?.textContent?.trim() || target.hrid;
    const kindName = target.kind === "dungeon"
        ? getTeamPresetText("dungeon", "Dungeon")
        : getTeamPresetText("zone", "Zone");
    return `${kindName}: ${targetName} · T${target.difficultyTier}`;
}

function updateTeamPresetPlayerLabels() {
    for (let playerNumber = 1; playerNumber <= 5; playerNumber++) {
        const tab = document.getElementById(`player${playerNumber}-tab`);
        const playerName = tab?.textContent?.trim() || `Player ${playerNumber}`;
        document.querySelectorAll(`label[for="player${playerNumber}"]`).forEach((label) => {
            label.textContent = playerName;
        });
    }
}

function updateTeamPresetActionButtons() {
    const target = getCurrentTeamPresetTarget();
    const presetId = document.getElementById("selectTeamPreset").value;
    const hasPreset = Boolean(target && presetId);

    document.getElementById("selectTeamPreset").disabled = !target;
    document.getElementById("inputTeamPresetName").disabled = !target;
    document.getElementById("buttonSaveTeamPreset").disabled = !target;
    document.getElementById("buttonLoadTeamPreset").disabled = !hasPreset;
    document.getElementById("buttonDefaultTeamPreset").disabled = !hasPreset;
    document.getElementById("buttonDeleteTeamPreset").disabled = !hasPreset;
}

function refreshTeamPresetControls({ allowAutoLoad = false, preferredPresetId = null } = {}) {
    const target = getCurrentTeamPresetTarget();
    const presetSelect = document.getElementById("selectTeamPreset");
    const presetNameInput = document.getElementById("inputTeamPresetName");
    const targetLabel = document.getElementById("teamPresetTargetLabel");
    const store = loadTeamPresetStore();
    document.getElementById("autoLoadTeamPreset").checked = store.autoLoad;

    presetSelect.replaceChildren();
    if (!target) {
        if (allowAutoLoad) {
            lastAutoLoadedTeamPresetTargetKey = null;
        }
        const unsupportedOption = new Option(
            getTeamPresetText("unsupported", "Presets currently support one zone or dungeon at a time."),
            "",
        );
        presetSelect.add(unsupportedOption);
        targetLabel.textContent = getTeamPresetText(
            "unsupported",
            "Presets currently support one zone or dungeon at a time.",
        );
        presetNameInput.value = "";
        updateTeamPresetActionButtons();
        refreshTeamPresetComparisonControls({ preferredPresetId: "" });
        return;
    }

    const targetKey = createTeamPresetTargetKey(target);
    const targetChanged = lastAutoLoadedTeamPresetTargetKey !== targetKey;
    if (allowAutoLoad) {
        lastAutoLoadedTeamPresetTargetKey = targetKey;
    }
    const presets = getTeamPresetsForTarget(store, targetKey);
    const defaultPreset = getDefaultTeamPreset(store, targetKey);
    const previousSelection = preferredPresetId ?? presetSelect.dataset.selectedPresetId ?? "";

    presetSelect.add(new Option(getTeamPresetText("newPreset", "+ New preset..."), ""));
    for (const preset of presets) {
        const isDefault = preset.id === defaultPreset?.id;
        const defaultBadge = getTeamPresetText("defaultBadge", "default");
        const optionLabel = isDefault ? `${preset.name} ★ (${defaultBadge})` : preset.name;
        presetSelect.add(new Option(optionLabel, preset.id));
    }

    const selectionExists = presets.some((preset) => preset.id === previousSelection);
    presetSelect.value = selectionExists ? previousSelection : (defaultPreset?.id ?? "");
    presetSelect.dataset.selectedPresetId = presetSelect.value;
    const selectedPreset = presets.find((preset) => preset.id === presetSelect.value);
    presetNameInput.value = selectedPreset?.name ?? "";
    targetLabel.textContent = getTeamPresetText(
        "currentTarget",
        "Current: {{target}}",
        { target: getTeamPresetTargetLabel(target) },
    );
    updateTeamPresetActionButtons();
    refreshTeamPresetComparisonControls({ preferredPresetId: presetSelect.value });

    if (
        allowAutoLoad &&
        store.autoLoad &&
        defaultPreset &&
        targetChanged
    ) {
        loadTeamPreset(defaultPreset.id);
    }
}

function normalizeTeamPresetNamePart(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function captureCurrentTeamPreset(selectedPlayerNumbers) {
    const selectedPlayerData = {};
    const selectedPlayerNames = {};
    const generatedNameParts = [];

    for (const playerNumber of selectedPlayerNumbers.map(String)) {
        const serializedPlayerData = playerDataMap[playerNumber];
        const playerImportData = JSON.parse(serializedPlayerData);
        const tabName = normalizeTeamPresetNamePart(
            document.getElementById(`player${playerNumber}-tab`)?.textContent,
        );
        const characterName = normalizeTeamPresetNamePart(playerImportData.characterName)
            || tabName
            || `Player ${playerNumber}`;
        const loadoutName = normalizeTeamPresetNamePart(playerImportData.loadoutName)
            || getTeamPresetText("manualLoadout", "Manual loadout");

        selectedPlayerData[playerNumber] = serializedPlayerData;
        selectedPlayerNames[playerNumber] = characterName;
        generatedNameParts.push(`${characterName}-${loadoutName}`);
    }

    const loadoutReferences = Object.fromEntries(buildPrivateLoadoutReferences({
        selectedPlayers: selectedPlayerNumbers,
        playerDataMap: selectedPlayerData,
        playerNames: selectedPlayerNames,
    }).map((reference) => [reference.slot, reference]));

    return {
        selectedPlayers: selectedPlayerNumbers.map(String),
        playerDataMap: selectedPlayerData,
        playerNames: selectedPlayerNames,
        loadoutReferences,
        generatedName: generatedNameParts.join(" "),
    };
}

function persistTeamPreset(target, name, snapshot, existingPresetId = "") {
    const store = loadTeamPresetStore();
    const targetKey = createTeamPresetTargetKey(target);
    const existingPreset = store.presets.find((preset) =>
        preset.id === existingPresetId && preset.targetKey === targetKey
    );
    const duplicatePreset = store.presets.find((preset) =>
        preset.targetKey === targetKey &&
        preset.id !== existingPreset?.id &&
        preset.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    );
    if (duplicatePreset) {
        return { status: "duplicate", preset: duplicatePreset };
    }

    const now = new Date().toISOString();
    const presetId = existingPreset?.id ?? createTeamPresetId();
    const preset = {
        id: presetId,
        name,
        targetKey,
        target,
        selectedPlayers: snapshot.selectedPlayers,
        playerDataMap: snapshot.playerDataMap,
        playerNames: snapshot.playerNames,
        loadoutReferences: snapshot.loadoutReferences,
        createdAt: existingPreset?.createdAt ?? now,
        updatedAt: now,
    };

    if (existingPreset) {
        store.presets[store.presets.findIndex((candidate) => candidate.id === existingPreset.id)] = preset;
    } else {
        store.presets.push(preset);
    }
    if (!store.defaults[targetKey]) {
        store.defaults[targetKey] = presetId;
    }

    try {
        saveTeamPresetStore(store);
    } catch (error) {
        console.error("Unable to save team preset.", error);
        return { status: "error", error };
    }

    return { status: "saved", preset };
}

function saveCurrentTeamPreset() {
    const target = getCurrentTeamPresetTarget();
    if (!target) {
        setTeamPresetStatus(
            getTeamPresetText("unsupported", "Presets currently support one zone or dungeon at a time."),
            "danger",
        );
        return;
    }

    const selectedPlayerNumbers = [...document.querySelectorAll(".player-checkbox:checked")]
        .map((checkbox) => checkbox.id.replace("player", ""));
    if (selectedPlayerNumbers.length === 0) {
        setTeamPresetStatus(
            getTeamPresetText("selectPlayers", "Select at least one player before saving."),
            "danger",
        );
        return;
    }

    savePreviousPlayer(currentPlayerTabId);
    let snapshot;
    try {
        snapshot = captureCurrentTeamPreset(selectedPlayerNumbers);
    } catch (error) {
        console.error("Invalid player data while saving a team preset.", error);
        setTeamPresetStatus(
            getTeamPresetText("invalidData", "One of the selected player loadouts is invalid."),
            "danger",
        );
        return;
    }

    const name = document.getElementById("inputTeamPresetName").value.trim() || snapshot.generatedName;
    const selectedPresetId = document.getElementById("selectTeamPreset").value;
    const result = persistTeamPreset(target, name, snapshot, selectedPresetId);
    if (result.status === "duplicate") {
        setTeamPresetStatus(
            getTeamPresetText("duplicateName", "A preset with that name already exists for this target."),
            "danger",
        );
        return;
    }
    if (result.status === "error") {
        setTeamPresetStatus(
            getTeamPresetText("storageError", "The preset could not be saved in this browser."),
            "danger",
        );
        return;
    }

    lastAutoLoadedTeamPresetTargetKey = result.preset.targetKey;
    refreshTeamPresetControls({ preferredPresetId: result.preset.id });
    setTeamPresetStatus(
        getTeamPresetText("saved", "Saved preset: {{name}}", { name }),
        "success",
    );
}

function autoSaveCurrentTeamPreset(selectedPlayerNumbers) {
    const target = getCurrentTeamPresetTarget();
    if (!target) {
        return;
    }

    let snapshot;
    try {
        snapshot = captureCurrentTeamPreset(selectedPlayerNumbers);
    } catch (error) {
        console.warn("Unable to automatically save the current team preset.", error);
        return;
    }

    const result = persistTeamPreset(target, snapshot.generatedName, snapshot);
    if (result.status === "error") {
        setTeamPresetStatus(
            getTeamPresetText("storageError", "The preset could not be saved in this browser."),
            "danger",
        );
        return;
    }

    lastAutoLoadedTeamPresetTargetKey = result.preset.targetKey;
    refreshTeamPresetControls({ preferredPresetId: result.preset.id });
    if (result.status === "duplicate") {
        setTeamPresetStatus(
            getTeamPresetText("alreadySaved", "Preset already exists; skipped: {{name}}", { name: result.preset.name }),
        );
        return;
    }

    setTeamPresetStatus(
        getTeamPresetText("autoSaved", "Automatically saved: {{name}}", { name: result.preset.name }),
        "success",
    );
}

function loadTeamPreset(presetId) {
    const target = getCurrentTeamPresetTarget();
    if (!target) {
        return;
    }

    const targetKey = createTeamPresetTargetKey(target);
    const store = loadTeamPresetStore();
    const preset = store.presets.find((candidate) =>
        candidate.id === presetId && candidate.targetKey === targetKey
    );
    if (!preset) {
        refreshTeamPresetControls();
        return;
    }

    const validatedPlayerData = {};
    try {
        for (const playerNumber of preset.selectedPlayers) {
            const playerImportData = preset.playerDataMap[playerNumber];
            JSON.parse(playerImportData);
            validatedPlayerData[playerNumber] = playerImportData;
        }
    } catch (error) {
        console.error("Invalid player data while loading a team preset.", error);
        setTeamPresetStatus(
            getTeamPresetText("invalidData", "One of the selected player loadouts is invalid."),
            "danger",
        );
        return;
    }

    savePreviousPlayer(currentPlayerTabId);
    for (const playerNumber of preset.selectedPlayers) {
        playerDataMap[playerNumber] = validatedPlayerData[playerNumber];

        const tab = document.getElementById(`player${playerNumber}-tab`);
        if (tab) {
            tab.textContent = preset.playerNames[playerNumber] || `Player ${playerNumber}`;
        }
    }

    applyPlayerFormationOrder(mergeSelectedPlayerFormation(
        preset.selectedPlayers,
        getPlayerFormationOrder(),
    ));

    document.querySelectorAll(".player-checkbox").forEach((checkbox) => {
        checkbox.checked = preset.selectedPlayers.includes(checkbox.id.replace("player", ""));
    });
    updateTeamPresetPlayerLabels();

    const playerToShow = preset.selectedPlayers.includes(currentPlayerTabId)
        ? currentPlayerTabId
        : preset.selectedPlayers[0];
    if (playerToShow === currentPlayerTabId) {
        updateNextPlayer(currentPlayerTabId);
        updateState();
        updateUI();
    } else {
        const tabElement = document.getElementById(`player${playerToShow}-tab`);
        if (tabElement && typeof bootstrap !== "undefined" && bootstrap.Tab) {
            bootstrap.Tab.getOrCreateInstance(tabElement).show();
        } else {
            currentPlayerTabId = playerToShow;
            updateNextPlayer(currentPlayerTabId);
            updateState();
            updateUI();
        }
    }

    lastAutoLoadedTeamPresetTargetKey = targetKey;
    refreshTeamPresetControls({ preferredPresetId: preset.id });
    setTeamPresetStatus(
        getTeamPresetText("loaded", "Loaded preset: {{name}}", { name: preset.name }),
        "success",
    );
}

function setDefaultTeamPreset() {
    const target = getCurrentTeamPresetTarget();
    const presetId = document.getElementById("selectTeamPreset").value;
    if (!target || !presetId) {
        return;
    }

    const targetKey = createTeamPresetTargetKey(target);
    const store = loadTeamPresetStore();
    const preset = store.presets.find((candidate) =>
        candidate.id === presetId && candidate.targetKey === targetKey
    );
    if (!preset) {
        return;
    }

    store.defaults[targetKey] = preset.id;
    try {
        saveTeamPresetStore(store);
    } catch (error) {
        console.error("Unable to set the default team preset.", error);
        setTeamPresetStatus(
            getTeamPresetText("storageError", "The preset could not be saved in this browser."),
            "danger",
        );
        return;
    }

    refreshTeamPresetControls({ preferredPresetId: preset.id });
    setTeamPresetStatus(
        getTeamPresetText("defaultSet", "Default preset: {{name}}", { name: preset.name }),
        "success",
    );
}

function deleteTeamPreset() {
    const target = getCurrentTeamPresetTarget();
    const presetId = document.getElementById("selectTeamPreset").value;
    if (!target || !presetId) {
        return;
    }

    const targetKey = createTeamPresetTargetKey(target);
    const store = loadTeamPresetStore();
    const preset = store.presets.find((candidate) =>
        candidate.id === presetId && candidate.targetKey === targetKey
    );
    if (!preset) {
        return;
    }

    const confirmationMessage = getTeamPresetText(
        "deleteConfirm",
        "Delete preset '{{name}}'?",
        { name: preset.name },
    );
    if (!confirm(confirmationMessage)) {
        return;
    }

    store.presets = store.presets.filter((candidate) => candidate.id !== preset.id);
    if (store.defaults[targetKey] === preset.id) {
        delete store.defaults[targetKey];
    }
    try {
        saveTeamPresetStore(store);
    } catch (error) {
        console.error("Unable to delete team preset.", error);
        setTeamPresetStatus(
            getTeamPresetText("storageError", "The preset could not be saved in this browser."),
            "danger",
        );
        return;
    }

    refreshTeamPresetControls();
    setTeamPresetStatus(
        getTeamPresetText("deleted", "Deleted preset: {{name}}", { name: preset.name }),
        "success",
    );
}

const TEAM_COMPARISON_SECTION_ORDER = [
    "team",
    "levels",
    "equipment",
    "abilities",
    "food",
    "drinks",
    "triggers",
    "houseRooms",
    "achievements",
];

const TEAM_COMPARISON_LEVEL_LABELS = {
    staminaLevel: ["skillNames./skills/stamina", "Stamina"],
    intelligenceLevel: ["skillNames./skills/intelligence", "Intelligence"],
    attackLevel: ["skillNames./skills/attack", "Attack"],
    meleeLevel: ["skillNames./skills/melee", "Melee"],
    defenseLevel: ["skillNames./skills/defense", "Defense"],
    rangedLevel: ["skillNames./skills/ranged", "Ranged"],
    magicLevel: ["skillNames./skills/magic", "Magic"],
};

const TEAM_COMPARISON_EQUIPMENT_LABELS = {
    head: ["characterItemsUtil.head", "Head"],
    neck: ["characterItemsUtil.neck", "Neck"],
    earrings: ["characterItemsUtil.earrings", "Earrings"],
    body: ["characterItemsUtil.body", "Body"],
    legs: ["characterItemsUtil.legs", "Legs"],
    feet: ["characterItemsUtil.feet", "Feet"],
    hands: ["characterItemsUtil.hands", "Hands"],
    ring: ["characterItemsUtil.ring", "Ring"],
    weapon: ["characterItemsUtil.mainHand", "Weapon"],
    off_hand: ["characterItemsUtil.offHand", "Offhand"],
    pouch: ["characterItemsUtil.pouch", "Pouch"],
    back: ["characterItemsUtil.back", "Back"],
    charm: ["characterItemsUtil.charm", "Charm"],
};

function getTeamComparisonText(key, fallback, values = {}) {
    try {
        if (typeof i18next !== "undefined" && i18next.isInitialized) {
            const translationKey = `common:teamComparison.${key}`;
            const translated = i18next.t(translationKey, values);
            if (typeof translated === "string" && translated !== translationKey) {
                return translated;
            }
        }
    } catch (error) {
        console.warn("Unable to translate team comparison text.", error);
    }
    return interpolateTeamPresetFallback(fallback, values);
}

function getLocalizedGameText(key, fallback) {
    try {
        if (typeof i18next !== "undefined" && i18next.isInitialized) {
            const translated = i18next.t(key);
            if (typeof translated === "string" && translated !== key) {
                return translated;
            }
        }
    } catch (error) {
        console.warn("Unable to translate game data text.", error);
    }
    return fallback;
}

function humanizeHrid(hrid) {
    const text = String(hrid || "").split("/").filter(Boolean).pop() || "";
    return text
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function setTeamPresetComparisonStatus(message = "", style = "muted") {
    const status = document.getElementById("teamPresetComparisonStatus");
    if (!status) {
        return;
    }
    status.textContent = message;
    status.classList.remove("text-muted", "text-success", "text-danger", "text-warning");
    status.classList.add(`text-${style}`);
}

function refreshTeamPresetComparisonControls({ preferredPresetId = null } = {}) {
    const comparisonSelect = document.getElementById("selectTeamPresetComparison");
    const compareButton = document.getElementById("buttonCompareTeamPreset");
    if (!comparisonSelect || !compareButton) {
        return;
    }

    const target = getCurrentTeamPresetTarget();
    const previousSelection = comparisonSelect.dataset.selectedPresetId || "";
    comparisonSelect.replaceChildren();

    if (!target) {
        comparisonSelect.add(new Option(
            getTeamComparisonText("unsupported", "Select one combat zone or dungeon first."),
            "",
        ));
        comparisonSelect.disabled = true;
        compareButton.disabled = true;
        comparisonSelect.dataset.selectedPresetId = "";
        setTeamPresetComparisonStatus(
            getTeamComparisonText("unsupported", "Select one combat zone or dungeon first."),
        );
        return;
    }

    const store = loadTeamPresetStore();
    const targetKey = createTeamPresetTargetKey(target);
    const presets = getTeamPresetsForTarget(store, targetKey);
    const defaultPreset = getDefaultTeamPreset(store, targetKey);
    comparisonSelect.add(new Option(
        getTeamComparisonText("selectBaseline", "Baseline: select a team preset"),
        "",
    ));

    for (const preset of presets) {
        const defaultBadge = getTeamComparisonText("defaultBadge", "default");
        const optionLabel = preset.id === defaultPreset?.id
            ? `${preset.name} ★ (${defaultBadge})`
            : preset.name;
        comparisonSelect.add(new Option(optionLabel, preset.id));
    }

    const mainPresetSelection = document.getElementById("selectTeamPreset")?.value || "";
    const requestedSelection = preferredPresetId ?? mainPresetSelection ?? previousSelection;
    const candidates = [requestedSelection, previousSelection, mainPresetSelection, defaultPreset?.id]
        .filter(Boolean);
    const selectedPresetId = candidates.find((presetId) =>
        presets.some((preset) => preset.id === presetId)
    ) || "";

    comparisonSelect.value = selectedPresetId;
    comparisonSelect.dataset.selectedPresetId = selectedPresetId;
    comparisonSelect.disabled = presets.length === 0;
    compareButton.disabled = !selectedPresetId;
    setTeamPresetComparisonStatus(
        presets.length === 0
            ? getTeamComparisonText("noPresets", "There are no team presets for the current target.")
            : "",
    );
}

function syncTeamPresetSelectionFromComparison(presetId) {
    const comparisonSelect = document.getElementById("selectTeamPresetComparison");
    comparisonSelect.dataset.selectedPresetId = presetId;
    document.getElementById("buttonCompareTeamPreset").disabled = !presetId;
    setTeamPresetComparisonStatus();

    const teamPresetSelect = document.getElementById("selectTeamPreset");
    if (!teamPresetSelect || ![...teamPresetSelect.options].some((option) => option.value === presetId)) {
        return;
    }
    teamPresetSelect.value = presetId;
    teamPresetSelect.dataset.selectedPresetId = presetId;
    const target = getCurrentTeamPresetTarget();
    const store = loadTeamPresetStore();
    const targetKey = target ? createTeamPresetTargetKey(target) : "";
    const selectedPreset = store.presets.find((preset) =>
        preset.id === presetId && preset.targetKey === targetKey
    );
    document.getElementById("inputTeamPresetName").value = selectedPreset?.name ?? "";
    updateTeamPresetActionButtons();
}

function getSelectedTeamPresetForComparison() {
    const presetId = document.getElementById("selectTeamPresetComparison")?.value || "";
    const target = getCurrentTeamPresetTarget();
    if (!presetId || !target) {
        return null;
    }
    const targetKey = createTeamPresetTargetKey(target);
    return loadTeamPresetStore().presets.find((preset) =>
        preset.id === presetId && preset.targetKey === targetKey
    ) ?? null;
}

function getCurrentComparisonPlayerSlots(preset) {
    const checkedPlayerSlots = [...document.querySelectorAll(".player-checkbox:checked")]
        .filter((checkbox) => checkbox.closest(".form-check")?.style.display !== "none")
        .map((checkbox) => checkbox.id.replace("player", ""));
    return checkedPlayerSlots.length > 0 ? checkedPlayerSlots : preset.selectedPlayers;
}

function createPrivateLoadoutBaselineRequestId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function requestPrivateLoadoutBaselines(references, timeoutMs = 20000) {
    if (document.documentElement.dataset[PRIVATE_LOADOUT_BASELINE_BRIDGE_ATTRIBUTE] !== "1") {
        return Promise.resolve({ errorCode: "bridge-unavailable", results: [] });
    }

    const requestId = createPrivateLoadoutBaselineRequestId();
    return new Promise((resolve) => {
        let timeoutId;
        const cleanup = () => {
            clearTimeout(timeoutId);
            document.removeEventListener(PRIVATE_LOADOUT_BASELINE_RESPONSE_EVENT, handleResponse);
        };
        const handleResponse = (event) => {
            let response;
            try {
                response = typeof event.detail === "string" ? JSON.parse(event.detail) : null;
            } catch {
                return;
            }
            if (response?.requestId !== requestId) {
                return;
            }
            cleanup();
            resolve(response);
        };

        document.addEventListener(PRIVATE_LOADOUT_BASELINE_RESPONSE_EVENT, handleResponse);
        timeoutId = setTimeout(() => {
            cleanup();
            resolve({ requestId, errorCode: "timeout", results: [] });
        }, timeoutMs);

        document.dispatchEvent(new CustomEvent(PRIVATE_LOADOUT_BASELINE_REQUEST_EVENT, {
            detail: JSON.stringify({ requestId, references }),
        }));
    });
}

function getPrivateLoadoutFallbackReason(reason) {
    const reasons = {
        "bridge-unavailable": "未检测到新版私有同步脚本",
        "server-error": "服务器数据读取失败",
        timeout: "等待服务器配装超时",
        "missing-reference": "预设快照中缺少角色名或配装名",
        "missing-character": "服务器中找不到该角色",
        "ambiguous-character": "服务器中有多个同名角色，无法确定",
        "missing-loadout": "该角色在服务器中没有这个配装",
        "ambiguous-loadout": "该角色有多个同名配装，无法确定",
        "invalid-server-data": "服务器上的配装数据不完整",
        "invalid-response": "私有同步脚本返回了无效配装",
    };
    const fallback = reasons[reason] || "未能匹配服务器配装";
    return getTeamComparisonText(`fallbackReasons.${reason}`, fallback);
}

function getPrivateLoadoutReferenceLabel(reference) {
    const character = reference.characterName || reference.characterId
        || getTeamComparisonText("unknownCharacter", "Unknown character");
    const loadout = reference.loadoutName || reference.loadoutId
        || getTeamComparisonText("unknownLoadout", "Unknown loadout");
    return `${character}-${loadout}`;
}

function appendPrivateLoadoutResolutionSummary(summary, resolution) {
    const notice = document.createElement("div");
    notice.className = resolution.allMatched
        ? "alert alert-info py-2 mt-2 mb-0"
        : "alert alert-warning py-2 mt-2 mb-0";

    const message = document.createElement("div");
    if (resolution.allMatched) {
        message.textContent = getTeamComparisonText(
            "serverMatched",
            "Matched {{count}} latest game loadouts from the private server using this preset.",
            { count: resolution.matchedSlots.length },
        );
    } else if (resolution.usesServerData) {
        message.textContent = getTeamComparisonText(
            "serverPartiallyMatched",
            "Matched {{matched}} server loadouts; {{fallback}} slots use the saved preset snapshot.",
            {
                matched: resolution.matchedSlots.length,
                fallback: resolution.fallbackSlots.length,
            },
        );
    } else {
        message.textContent = getTeamComparisonText(
            "serverNotMatched",
            "No server loadouts could be matched. The saved preset snapshot is used as the fallback baseline.",
        );
    }
    notice.appendChild(message);

    if (resolution.fallbackSlots.length > 0) {
        const list = document.createElement("ul");
        list.className = "mb-0 mt-1 ps-4 small";
        for (const fallback of resolution.fallbackSlots) {
            const item = document.createElement("li");
            const slot = getTeamComparisonText("slot", "Slot {{slot}}", { slot: fallback.slot });
            item.textContent = `${slot} · ${getPrivateLoadoutReferenceLabel(fallback.reference)}: ${getPrivateLoadoutFallbackReason(fallback.reason)}`;
            list.appendChild(item);
        }
        notice.appendChild(list);
    }
    summary.appendChild(notice);
}

function resolveItemName(itemHrid) {
    if (!itemHrid) {
        return getTeamComparisonText("none", "None");
    }
    return getLocalizedGameText(
        `itemNames.${itemHrid}`,
        itemDetailMap[itemHrid]?.name || humanizeHrid(itemHrid),
    );
}

function resolveAbilityName(abilityHrid) {
    if (!abilityHrid) {
        return getTeamComparisonText("none", "None");
    }
    return getLocalizedGameText(
        `abilityNames.${abilityHrid}`,
        abilityDetailMap[abilityHrid]?.name || humanizeHrid(abilityHrid),
    );
}

function resolveHouseRoomName(roomHrid) {
    return getLocalizedGameText(
        `houseRoomNames.${roomHrid}`,
        houseRoomDetailMap[roomHrid]?.name || humanizeHrid(roomHrid),
    );
}

function resolveAchievementName(achievementHrid) {
    return getLocalizedGameText(
        `achievementNames.${achievementHrid}`,
        achievementDetailMap[achievementHrid]?.name || humanizeHrid(achievementHrid),
    );
}

function resolveEquipmentLocationName(locationHrid) {
    const location = String(locationHrid || "").split("/").filter(Boolean).pop() || "";
    const [translationKey, fallback] = TEAM_COMPARISON_EQUIPMENT_LABELS[location]
        || ["", humanizeHrid(location)];
    return translationKey ? getLocalizedGameText(translationKey, fallback) : fallback;
}

function formatEquipmentComparisonValue(value) {
    if (!value?.itemHrid) {
        return getTeamComparisonText("none", "None");
    }
    return `${resolveItemName(value.itemHrid)} +${Number(value.enhancementLevel) || 0}`;
}

function formatAbilityComparisonValue(value) {
    if (!value?.abilityHrid) {
        return getTeamComparisonText("none", "None");
    }
    return `${resolveAbilityName(value.abilityHrid)} Lv${Number(value.level) || 1}`;
}

function formatCharacterIdentity(identity) {
    if (identity?.name) {
        return identity.name;
    }
    if (identity?.id) {
        return `#${identity.id}`;
    }
    return getTeamComparisonText("none", "None");
}

function formatTeamComparisonValue(change, side) {
    const value = change[side];
    switch (change.kind) {
        case "membership":
            return getTeamComparisonText(value ? "present" : "absent", value ? "Selected" : "Not selected");
        case "character":
            return formatCharacterIdentity(value);
        case "level":
        case "houseRoom":
            return String(value);
        case "equipment":
            return formatEquipmentComparisonValue(value);
        case "ability":
            return formatAbilityComparisonValue(value);
        case "consumable":
            return resolveItemName(value);
        case "triggers":
            return getTeamComparisonText(
                "triggerCount",
                "{{count}} trigger groups",
                { count: side === "before" ? change.beforeCount : change.afterCount },
            );
        case "achievement":
            return getTeamComparisonText(value ? "completed" : "notCompleted", value ? "Completed" : "Not completed");
        default:
            return String(value ?? "");
    }
}

function formatNumericDifference(before, after) {
    const difference = Number(after) - Number(before);
    return difference > 0 ? `+${difference}` : String(difference);
}

function formatTeamComparisonDifference(change) {
    switch (change.kind) {
        case "membership":
            return getTeamComparisonText(change.after ? "added" : "removed", change.after ? "Added" : "Removed");
        case "level":
        case "houseRoom":
            return formatNumericDifference(change.before, change.after);
        case "equipment":
            if (!change.before) return getTeamComparisonText("added", "Added");
            if (!change.after) return getTeamComparisonText("removed", "Removed");
            if (change.before.itemHrid === change.after.itemHrid) {
                return formatNumericDifference(change.before.enhancementLevel, change.after.enhancementLevel);
            }
            return getTeamComparisonText("replaced", "Replaced");
        case "ability":
            if (!change.before?.abilityHrid) return getTeamComparisonText("added", "Added");
            if (!change.after?.abilityHrid) return getTeamComparisonText("removed", "Removed");
            if (change.before.abilityHrid === change.after.abilityHrid) {
                return formatNumericDifference(change.before.level, change.after.level);
            }
            return getTeamComparisonText("adjusted", "Adjusted");
        case "consumable":
            if (!change.before) return getTeamComparisonText("added", "Added");
            if (!change.after) return getTeamComparisonText("removed", "Removed");
            return getTeamComparisonText("replaced", "Replaced");
        case "triggers":
            return getTeamComparisonText(
                "differenceCount",
                "{{count}} adjustments",
                { count: change.differenceCount },
            );
        case "achievement":
            return getTeamComparisonText(
                change.after ? "completedChange" : "cancelledChange",
                change.after ? "Completed" : "Removed",
            );
        case "character":
            return getTeamComparisonText("replaced", "Replaced");
        default:
            return getTeamComparisonText("adjusted", "Adjusted");
    }
}

function resolveTeamComparisonItemLabel(change) {
    switch (change.kind) {
        case "membership":
            return getTeamComparisonText("membership", "Party Status");
        case "character":
            return getTeamComparisonText("character", "Character");
        case "level": {
            const [translationKey, fallback] = TEAM_COMPARISON_LEVEL_LABELS[change.field]
                || ["", change.field];
            return translationKey ? getLocalizedGameText(translationKey, fallback) : fallback;
        }
        case "equipment":
            return resolveEquipmentLocationName(change.locationHrid);
        case "ability":
            return getTeamComparisonText(
                "abilitySlot",
                "Ability Slot {{slot}}",
                { slot: change.index + 1 },
            );
        case "consumable":
            return getTeamComparisonText(
                "consumableSlot",
                "Slot {{slot}}",
                { slot: change.index + 1 },
            );
        case "triggers":
            return getTeamComparisonText("sections.triggers", "Triggers");
        case "houseRoom":
            return resolveHouseRoomName(change.hrid);
        case "achievement":
            return resolveAchievementName(change.hrid);
        default:
            return change.kind;
    }
}

function getTeamComparisonCharacterName(playerComparison, preset, side) {
    const isBaseline = side === "baseline";
    const playerData = isBaseline ? playerComparison.baselineData : playerComparison.currentData;
    const serializedName = playerData?.characterName || playerData?.characterMeta?.name;
    if (typeof serializedName === "string" && serializedName.trim()) {
        return serializedName.trim();
    }
    if (isBaseline && preset.playerNames?.[playerComparison.slot]) {
        return preset.playerNames[playerComparison.slot];
    }
    if (!isBaseline) {
        const tabName = document.getElementById(`player${playerComparison.slot}-tab`)?.textContent?.trim();
        if (tabName) {
            return tabName;
        }
    }
    return `Player ${playerComparison.slot}`;
}

function appendTeamComparisonTableCell(row, tagName, text, className = "") {
    const cell = document.createElement(tagName);
    cell.textContent = text;
    if (className) {
        cell.className = className;
    }
    row.appendChild(cell);
    return cell;
}

function renderTeamPresetComparison(preset, comparison, resolution) {
    const summary = document.getElementById("teamPresetComparisonSummary");
    const results = document.getElementById("teamPresetComparisonResults");
    summary.replaceChildren();
    results.replaceChildren();

    const direction = document.createElement("div");
    direction.className = "fw-semibold";
    const directionKey = resolution.allMatched
        ? "serverDirection"
        : (resolution.usesServerData ? "mixedDirection" : "fallbackDirection");
    const directionFallback = resolution.allMatched
        ? "Latest game loadouts located by preset '{{name}}' → current team"
        : (resolution.usesServerData
            ? "Server game loadouts plus preset snapshot fallbacks from '{{name}}' → current team"
            : "Saved snapshot of preset '{{name}}' → current team");
    direction.textContent = getTeamComparisonText(directionKey, directionFallback, { name: preset.name });
    summary.appendChild(direction);

    const totals = document.createElement("div");
    totals.className = "text-muted small mt-1";
    totals.textContent = getTeamComparisonText(
        "summary",
        "{{players}} players, {{changes}} differences found.",
        { players: comparison.players.length, changes: comparison.totalChanges },
    );
    summary.appendChild(totals);
    appendPrivateLoadoutResolutionSummary(summary, resolution);

    if (comparison.totalChanges === 0) {
        const noChanges = document.createElement("div");
        noChanges.className = "alert alert-success mb-0";
        noChanges.textContent = getTeamComparisonText(
            resolution.allMatched ? "noChangesFromServer" : "noChanges",
            resolution.allMatched
                ? "The current team exactly matches the game loadouts found on the private server."
                : "The current team exactly matches the selected baseline.",
        );
        results.appendChild(noChanges);
        return;
    }

    for (const playerComparison of comparison.players) {
        const card = document.createElement("div");
        card.className = "card team-comparison-player-card mb-3";
        const cardHeader = document.createElement("div");
        cardHeader.className = "card-header d-flex flex-wrap justify-content-between align-items-center gap-2";
        const playerTitle = document.createElement("strong");
        const slotLabel = getTeamComparisonText(
            "slot",
            "Slot {{slot}}",
            { slot: playerComparison.slot },
        );
        const baselineName = getTeamComparisonCharacterName(playerComparison, preset, "baseline");
        const currentName = getTeamComparisonCharacterName(playerComparison, preset, "current");
        const playerName = baselineName === currentName
            ? currentName
            : `${baselineName} → ${currentName}`;
        const baselineLoadoutName = playerComparison.baselineData?.loadoutName
            || resolution.matchedSlots.find((match) => match.slot === playerComparison.slot)?.loadoutName
            || "";
        playerTitle.textContent = baselineLoadoutName
            ? `${slotLabel} · ${playerName} · ${baselineLoadoutName}`
            : `${slotLabel} · ${playerName}`;
        cardHeader.appendChild(playerTitle);

        const badge = document.createElement("span");
        badge.className = playerComparison.changes.length > 0
            ? "badge text-bg-warning"
            : "badge text-bg-success";
        badge.textContent = playerComparison.changes.length > 0
            ? getTeamComparisonText(
                "changeCount",
                "{{count}} changes",
                { count: playerComparison.changes.length },
            )
            : getTeamComparisonText("playerNoChanges", "No changes for this player.");
        cardHeader.appendChild(badge);
        card.appendChild(cardHeader);

        const cardBody = document.createElement("div");
        cardBody.className = "card-body p-0";
        if (playerComparison.changes.length === 0) {
            const unchanged = document.createElement("div");
            unchanged.className = "p-3 text-success";
            unchanged.textContent = getTeamComparisonText(
                "playerNoChanges",
                "No changes for this player.",
            );
            cardBody.appendChild(unchanged);
        } else {
            const tableWrapper = document.createElement("div");
            tableWrapper.className = "table-responsive";
            const table = document.createElement("table");
            table.className = "table table-sm table-striped table-bordered align-middle";
            const tableHead = document.createElement("thead");
            const headingRow = document.createElement("tr");
            appendTeamComparisonTableCell(
                headingRow,
                "th",
                getTeamComparisonText("columns.item", "Item"),
            );
            appendTeamComparisonTableCell(
                headingRow,
                "th",
                resolution.matchedSlots.some((match) => match.slot === playerComparison.slot)
                    ? getTeamComparisonText("columns.gameLoadout", "Game loadout")
                    : getTeamComparisonText("columns.presetSnapshot", "Preset snapshot"),
            );
            appendTeamComparisonTableCell(
                headingRow,
                "th",
                getTeamComparisonText("columns.current", "Current"),
            );
            appendTeamComparisonTableCell(
                headingRow,
                "th",
                getTeamComparisonText("columns.change", "Change"),
            );
            tableHead.appendChild(headingRow);
            table.appendChild(tableHead);

            const tableBody = document.createElement("tbody");
            for (const section of TEAM_COMPARISON_SECTION_ORDER) {
                const sectionChanges = playerComparison.changes.filter((change) => change.section === section);
                if (sectionChanges.length === 0) {
                    continue;
                }
                const sectionRow = document.createElement("tr");
                const sectionCell = appendTeamComparisonTableCell(
                    sectionRow,
                    "th",
                    getTeamComparisonText(`sections.${section}`, humanizeHrid(section)),
                    "table-secondary",
                );
                sectionCell.colSpan = 4;
                tableBody.appendChild(sectionRow);

                for (const change of sectionChanges) {
                    const row = document.createElement("tr");
                    appendTeamComparisonTableCell(row, "th", resolveTeamComparisonItemLabel(change));
                    appendTeamComparisonTableCell(
                        row,
                        "td",
                        formatTeamComparisonValue(change, "before"),
                        "team-comparison-value",
                    );
                    appendTeamComparisonTableCell(
                        row,
                        "td",
                        formatTeamComparisonValue(change, "after"),
                        "team-comparison-value",
                    );
                    appendTeamComparisonTableCell(
                        row,
                        "td",
                        formatTeamComparisonDifference(change),
                        "text-nowrap fw-semibold",
                    );
                    tableBody.appendChild(row);
                }
            }
            table.appendChild(tableBody);
            tableWrapper.appendChild(table);
            cardBody.appendChild(tableWrapper);
        }
        card.appendChild(cardBody);
        results.appendChild(card);
    }
}

async function compareCurrentTeamToSelectedPreset() {
    const preset = getSelectedTeamPresetForComparison();
    if (!preset) {
        refreshTeamPresetComparisonControls();
        return;
    }

    const compareButton = document.getElementById("buttonCompareTeamPreset");
    if (compareButton?.dataset.loading === "true") {
        return;
    }
    if (compareButton) {
        compareButton.dataset.loading = "true";
        compareButton.disabled = true;
    }
    setTeamPresetComparisonStatus(
        getTeamComparisonText(
            "loadingServer",
            "Finding the latest game loadouts on the private server...",
        ),
    );

    savePreviousPlayer(currentPlayerTabId);
    try {
        const references = buildPrivateLoadoutReferences(preset);
        const response = await requestPrivateLoadoutBaselines(references);
        const resolution = resolvePrivateLoadoutBaseline(
            preset,
            response,
            response?.errorCode || "bridge-unavailable",
        );
        const comparison = compareTeamPresetWithCurrent(
            resolution.baselinePreset,
            playerDataMap,
            getCurrentComparisonPlayerSlots(preset),
        );
        renderTeamPresetComparison(preset, comparison, resolution);
        setTeamPresetComparisonStatus(
            resolution.allMatched
                ? getTeamComparisonText(
                    "serverMatchedShort",
                    "Using the latest game loadouts matched from the private server.",
                )
                : (resolution.usesServerData
                    ? getTeamComparisonText(
                        "usingFallbackShort",
                        "Some baselines use the saved preset snapshot; see the comparison details.",
                    )
                    : getTeamComparisonText(
                        "usingSnapshotShort",
                        "No server loadout was matched; the saved preset snapshot is being used.",
                    )),
            resolution.allMatched ? "success" : "warning",
        );
        bootstrap.Modal.getOrCreateInstance(
            document.getElementById("teamPresetComparisonModal"),
        ).show();
    } catch (error) {
        console.error("Unable to compare the current team with its preset.", error);
        setTeamPresetComparisonStatus(
            getTeamComparisonText(
                "invalidData",
                "Player data in slot {{slot}} is invalid and cannot be compared.",
                { slot: error.slot || "?" },
            ),
            "danger",
        );
    } finally {
        if (compareButton) {
            compareButton.dataset.loading = "false";
            compareButton.disabled = !document.getElementById("selectTeamPresetComparison")?.value;
        }
    }
}

function retireLegacyLoadoutControls() {
    const legacySelect = document.getElementById("selectLoadout");
    if (!legacySelect || legacySelect.closest("#teamPresetComparisonBar")) {
        return false;
    }
    const legacyRow = legacySelect.closest(".row");
    if (legacyRow) {
        legacyRow.remove();
    } else {
        legacySelect.remove();
    }
    return true;
}

function initLegacyLoadoutControlRetirement() {
    if (retireLegacyLoadoutControls()) {
        return;
    }
    const observer = new MutationObserver(() => {
        if (retireLegacyLoadoutControls()) {
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
}

function initImporterLoadoutNameCapture() {
    document.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) {
            return;
        }

        const loadoutButton = event.target.closest("#mwi-load-row .mwi-item-btn");
        if (!loadoutButton) {
            return;
        }

        const slotButtons = [...document.querySelectorAll("#mwi-slot-row .mwi-slot-btn")];
        const selectedSlotButton = slotButtons.find((button) => button.classList.contains("selected"));
        if (!selectedSlotButton) {
            return;
        }

        const slotFromLabel = selectedSlotButton.textContent?.trim();
        const playerNumber = /^[1-5]$/.test(slotFromLabel)
            ? slotFromLabel
            : String(slotButtons.indexOf(selectedSlotButton) + 1);
        const loadoutName = normalizeTeamPresetNamePart(loadoutButton.textContent);
        if (!loadoutName || !/^[1-5]$/.test(playerNumber)) {
            return;
        }

        pendingImporterLoadoutNames.set(playerNumber, {
            name: loadoutName,
            capturedAt: Date.now(),
        });
    }, true);
}

function initTeamPresets() {
    initImporterLoadoutNameCapture();
    initLegacyLoadoutControlRetirement();
    const targetControlIds = [
        "selectZone",
        "selectDungeon",
        "selectDifficulty",
        "simAllZoneToggle",
        "simAllSoloToggle",
        "simDungeonToggle",
        "simLabyrinthToggle",
        "simAllLabyrinthsToggle",
    ];
    targetControlIds.forEach((id) => {
        document.getElementById(id)?.addEventListener("change", () => {
            setTeamPresetStatus();
            refreshTeamPresetControls({ allowAutoLoad: true });
        });
    });

    document.getElementById("selectTeamPreset").addEventListener("change", (event) => {
        event.target.dataset.selectedPresetId = event.target.value;
        const store = loadTeamPresetStore();
        const selectedPreset = store.presets.find((preset) => preset.id === event.target.value);
        document.getElementById("inputTeamPresetName").value = selectedPreset?.name ?? "";
        updateTeamPresetActionButtons();
        refreshTeamPresetComparisonControls({ preferredPresetId: event.target.value });
        setTeamPresetStatus();
    });
    document.getElementById("selectTeamPresetComparison").addEventListener("change", (event) => {
        syncTeamPresetSelectionFromComparison(event.target.value);
    });
    document.getElementById("buttonCompareTeamPreset").addEventListener(
        "click",
        compareCurrentTeamToSelectedPreset,
    );
    document.getElementById("buttonLoadTeamPreset").addEventListener("click", () => {
        loadTeamPreset(document.getElementById("selectTeamPreset").value);
    });
    document.getElementById("buttonSaveTeamPreset").addEventListener("click", saveCurrentTeamPreset);
    document.getElementById("buttonDefaultTeamPreset").addEventListener("click", setDefaultTeamPreset);
    document.getElementById("buttonDeleteTeamPreset").addEventListener("click", deleteTeamPreset);
    document.getElementById("autoLoadTeamPreset").addEventListener("change", (event) => {
        const store = loadTeamPresetStore();
        store.autoLoad = event.target.checked;
        try {
            saveTeamPresetStore(store);
        } catch (error) {
            console.error("Unable to update team preset auto-load.", error);
            event.target.checked = !event.target.checked;
            setTeamPresetStatus(
                getTeamPresetText("storageError", "The preset could not be saved in this browser."),
                "danger",
            );
            return;
        }

        if (event.target.checked) {
            lastAutoLoadedTeamPresetTargetKey = null;
            refreshTeamPresetControls({ allowAutoLoad: true });
        }
    });
    document.getElementById("buttonSimulationSetup").addEventListener("click", () => {
        refreshTeamPresetControls();
    });

    if (typeof i18next !== "undefined" && typeof i18next.on === "function") {
        const refreshLocalizedTeamPresetControls = () => refreshTeamPresetControls();
        i18next.on("languageChanged", refreshLocalizedTeamPresetControls);
        i18next.on("initialized", refreshLocalizedTeamPresetControls);
    }
    refreshTeamPresetControls({ allowAutoLoad: true });
}

// #endregion

function showErrorModal(error) {
    let zoneSelect = document.getElementById("selectZone");
    let simulationTimeInput = document.getElementById("inputSimulationTime");

    let state = {
        error: error,
        player: player,
        food: food,
        drinks: drinks,
        abilities: abilities,
        triggerMap: triggerMap,
        modalTriggers: modalTriggers,
        zone: zoneSelect.value,
        simulationTime: simulationTimeInput.value,
    };

    for (let i = 0; i < 5; i++) {
        let abilityLevelInput = document.getElementById("inputAbilityLevel_" + i);
        state["abilityLevel" + i] = abilityLevelInput.value;
    }

    let errorInput = document.getElementById("inputError");
    errorInput.value = JSON.stringify(state);

    let errorModal = new bootstrap.Modal(document.getElementById("errorModal"));
    errorModal.show();
}

// #endregion

function initPatchNotes() {
    const patchNotesRows = document.getElementById("patchNotes");
    for (const pn in patchNote) {
        const patchNoteContainer = document.createElement("div");
        patchNotesRows.setAttribute('class', 'col-12 mb-4');

        const patchNoteElement = document.createElement("h6");
        patchNoteElement.innerHTML = pn;
        const patchNoteList = document.createElement("ul");
        for (const note of patchNote[pn]) {
            const noteElement = document.createElement("li");
            noteElement.innerHTML = note;
            patchNoteList.appendChild(noteElement);
        }
        patchNoteContainer.appendChild(patchNoteElement);
        patchNoteContainer.appendChild(patchNoteList);

        patchNotesRows.appendChild(patchNoteContainer);
    }
}

function initExtraBuffSection() {
    // mooPass
    let mooPassToggle = document.getElementById("mooPassToggle");
    let mooPass = localStorage.getItem('mooPass');
    if (mooPass) {
        mooPassToggle.checked = Boolean(mooPass);
    }
    mooPassToggle.onchange = () => {
        localStorage.setItem('mooPass', mooPassToggle.checked);
    }
    
    // comExp
    let comExpToggle = document.getElementById("comExpToggle");
    let comExpInput = document.getElementById("comExpInput");
    let comExp = localStorage.getItem('comExp');
    if (comExp) {
        let comExpNumber = Number(comExp);
        if (comExpNumber > 0) {
            comExpToggle.checked = true;
            comExpInput.value = comExpNumber;
        } else {
            comExpToggle.checked = false;
            comExpInput.disabled = true;
        }
    }
    const updateComExp = () => {
        if (comExpToggle.checked) {
            let comExp = Number(comExpInput.value);
            localStorage.setItem('comExp', comExp); 
            comExpInput.disabled = false;
        } else {
            localStorage.setItem('comExp', 0);
            comExpInput.disabled = true;
        }
    }
    comExpToggle.onchange = updateComExp;
    comExpInput.onchange = updateComExp;

    // comDrop
    let comDropToggle = document.getElementById("comDropToggle");
    let comDropInput = document.getElementById("comDropInput");
    let comDrop = localStorage.getItem('comDrop');
    if (comDrop) {
        let comDropNumber = Number(comDrop);
        if (comDropNumber > 0) {
            comDropToggle.checked = true;
            comDropInput.value = comDropNumber;
        } else {
            comDropToggle.checked = false;
            comDropInput.disabled = true;
        }
    }
    const updateComDrop = () => {
        if (comDropToggle.checked) {
            let comDrop = Number(comDropInput.value);
            localStorage.setItem('comDrop', comDrop); 
            comDropInput.disabled = false;
        } else {
            localStorage.setItem('comDrop', 0);
            comDropInput.disabled = true;
        }
    }
    comDropToggle.onchange = updateComDrop;
    comDropInput.onchange = updateComDrop;

    // personalBuffs
    const personalBuffKeys = [
        "/items/seal_of_combat_drop",
        "/items/seal_of_attack_speed",
        "/items/seal_of_cast_speed",
        "/items/seal_of_damage",
        "/items/seal_of_critical_rate",
        "/items/seal_of_wisdom",
        "/items/seal_of_rare_find",
    ];
    const personalBuffsTable = document.getElementById('personalBuffsBox');
    for (const buff of personalBuffKeys) {
        const buffDiv = document.createElement('div');
        buffDiv.className = 'form-check form-switch mb-1';
        const buffInput = document.createElement('input');
        buffInput.className = 'form-check-input';
        buffInput.type = 'checkbox';
        buffInput.id = buff.split('/').pop() + 'Toggle';
        buffInput.value = buff;
        buffDiv.appendChild(buffInput);
        const buffLabel = document.createElement('label');
        buffLabel.className = 'form-check-label';
        buffLabel.setAttribute('for', buffInput.id);
        buffLabel.innerHTML = buff;
        buffLabel.setAttribute("data-i18n", "itemNames." +buff);
        buffDiv.appendChild(buffLabel);

        personalBuffsTable.appendChild(buffDiv);
    }

    let personalBuffsToggle = document.getElementById("personalBuffsToggle");
    personalBuffsToggle.onchange = () => {
        personalBuffsTable.classList.toggle('d-none');
    }
    
}


function updateState() {
    updateEquipmentState();
    updateLevels();
    updateFoodState();
    updateDrinksState();
    updateAbilityState();
    updateGuildCombatBuffLevels();
}

function updateUI() {
    updateCombatStatsUI();
    updateFoodUI();
    updateDrinksUI();
    updateAbilityUI();

    updateContent();
}

const darkModeToggle = document.getElementById('darkModeToggle');
const body = document.body;

if (localStorage.getItem('darkModeEnabled') === 'true') {
    body.classList.add('dark-mode');
    darkModeToggle.checked = true;
}

darkModeToggle.addEventListener('change', () => {
    body.classList.toggle('dark-mode');
    localStorage.setItem('darkModeEnabled', darkModeToggle.checked);
});

function updateContent() {
    document.querySelectorAll('[data-i18n]').forEach(function (element) {
        const key = element.getAttribute('data-i18n');
        if (key) {
            element.textContent = i18next.t(key);
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (element) {
        const key = element.getAttribute('data-i18n-placeholder');
        if (key) {
            element.placeholder = i18next.t(key);
        }
    });

    document.querySelectorAll('option[data-i18n]').forEach(function (element) {
        const key = element.getAttribute('data-i18n');
        if (key) {
            element.textContent = i18next.t(key);
        }
    });
}

initEquipmentSection();
initHouseRoomsModal();
initGuildCombatBuffLevels();
initAchievementsModal();
initLevelSection();
initFoodSection();
initDrinksSection();
initAbilitiesSection();
initZones();
initDungeons();
initLabyrinth();
initTriggerModal();
initSimulationControls();
initSimulationHistory();
initEquipmentSetsModal();
initErrorHandling();
initImportExportModal();
document.addEventListener("DOMContentLoaded", initTeamPresets);
initDamageDoneTaken();
initPatchNotes();
initExtraBuffSection();
initHpMpVisualization();

updateState();
updateUI();
