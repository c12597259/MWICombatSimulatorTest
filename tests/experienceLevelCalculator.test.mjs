import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const calculatorSource = await readFile(
    new URL("../src/experienceLevelCalculator.js", import.meta.url),
    "utf8",
);
const calculatorModuleUrl = `data:text/javascript;base64,${Buffer.from(calculatorSource).toString("base64")}`;
const {
    EXPERIENCE_TOTAL_BY_LEVEL,
    calculateLevelAfterExperience,
    calculateLevelAfterDuration,
    calculateSkillLevelsAfterDuration,
    calculateTimeToLevel,
    getTotalExperienceForLevel,
} = await import(calculatorModuleUrl);

test("contains the supplied cumulative experience thresholds from level 1 through 200", () => {
    assert.equal(EXPERIENCE_TOTAL_BY_LEVEL.length, 200);
    assert.equal(getTotalExperienceForLevel(1), 0);
    assert.equal(getTotalExperienceForLevel(50), 93311);
    assert.equal(getTotalExperienceForLevel(100), 10000000);
    assert.equal(getTotalExperienceForLevel(125), 100000000);
    assert.equal(getTotalExperienceForLevel(150), 1376277458);
    assert.equal(getTotalExperienceForLevel(200), 100000000000);

    for (let index = 1; index < EXPERIENCE_TOTAL_BY_LEVEL.length; index += 1) {
        assert.ok(EXPERIENCE_TOTAL_BY_LEVEL[index] > EXPERIENCE_TOTAL_BY_LEVEL[index - 1]);
    }
});

test("calculates experience and time from the current level threshold to a target level", () => {
    const result = calculateTimeToLevel({
        currentLevel: 99,
        targetLevel: 100,
        experiencePerHour: 1000,
    });

    assert.equal(result.requiredExperience, 823463);
    assert.equal(result.hours, 823.463);
});

test("treats a target at or below the current level as already reached", () => {
    const result = calculateTimeToLevel({
        currentLevel: 80,
        targetLevel: 75,
        experiencePerHour: 0,
    });

    assert.equal(result.requiredExperience, 0);
    assert.equal(result.hours, 0);
});

test("projects the resulting level and in-level progress after a number of days", () => {
    const result = calculateLevelAfterDuration({
        currentLevel: 1,
        days: 1,
        experiencePerHour: 100,
    });

    assert.equal(result.gainedExperience, 2400);
    assert.equal(result.level, 16);
    assert.ok(Math.abs(result.levelProgress - (208 / 333)) < 1e-12);
    assert.equal(result.experienceToNextLevel, 125);
    assert.equal(result.atMaximumLevel, false);
});

test("caps projections at level 200", () => {
    const result = calculateLevelAfterDuration({
        currentLevel: 199,
        days: 1,
        experiencePerHour: 1000000000,
    });

    assert.equal(result.level, 200);
    assert.equal(result.levelProgress, 1);
    assert.equal(result.experienceToNextLevel, 0);
    assert.equal(result.atMaximumLevel, true);
});

test("projects a final level from a direct experience gain", () => {
    const result = calculateLevelAfterExperience({
        currentLevel: 1,
        gainedExperience: 3300,
    });

    assert.equal(result.level, 19);
    assert.equal(result.levelProgress, 0);
});

test("projects every skill that gains experience over the same duration", () => {
    const results = calculateSkillLevelsAfterDuration({
        skills: ["melee", "attack", "defense"],
        currentLevels: { melee: 1, attack: 1, defense: 50 },
        experiencePerHourBySkill: { melee: 100, attack: 50, defense: 0 },
        days: 1,
    });

    assert.deepEqual(results.map(({ skill, level, gainedExperience }) => ({
        skill,
        level,
        gainedExperience,
    })), [
        { skill: "melee", level: 16, gainedExperience: 2400 },
        { skill: "attack", level: 12, gainedExperience: 1200 },
    ]);
});

test("rejects a negative duration", () => {
    assert.throws(
        () => calculateLevelAfterDuration({
            currentLevel: 1,
            days: -1,
            experiencePerHour: 100,
        }),
        /Days must be a non-negative finite number/,
    );
});
