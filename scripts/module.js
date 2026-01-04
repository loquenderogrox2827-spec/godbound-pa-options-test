Hooks.once("init", () => {
  // General refresh function for sheets
  const refreshCharacters = () => {
    const characters = game.actors.filter(a => a.type === "character");
    characters.forEach(a => {
      a.prepareData();
      if (a.sheet?.rendered) a.sheet.render(true);
    });
  };

  // Specific handler for Paradox HP toggle — one-time proportional grant on enable
  const handleParadoxHpChange = async (enabled) => {
    const characters = game.actors.filter(a => a.type === "character");

    let updatedCount = 0;

    for (const actor of characters) {
      const data = actor.system; // Persistent data — no need to prepare first
      const level = data.details?.level?.value ?? 1;
      const conValue = data.attributes?.con?.value ?? 10;
      const conMod = data.attributes?.con?.mod ?? 0;

      // Hardcoded system default max (exact match to original formula)
      const oldMax = 8 + conMod + (level - 1) * (4 + Math.ceil(conMod / 2));

      // Your custom max
      let newMax = conValue * 2;
      if (level > 1) {
        newMax += (level - 1) * (conMod + Math.ceil(conValue / 2));
      }

      const currentValue = data.health?.value ?? 0;

      if (enabled) {
        const difference = Math.max(0, newMax - oldMax);
        const newValue = Math.min(currentValue + difference, newMax);

        if (newValue !== currentValue) {
          await actor.update({ "system.health.value": newValue });
          updatedCount++;
        }
      } else {
        // When disabling, clamp down to old system max
        const clampValue = Math.min(currentValue, oldMax);
        if (clampValue < currentValue) {
          await actor.update({ "system.health.value": clampValue });
          updatedCount++;
        }
      }
    }

    refreshCharacters();
    ui.notifications.info(`Paradoxical Archive HP ${enabled ? "enabled" : "disabled"} — ${updatedCount} character(s) adjusted and refreshed.`);
  };

  // Register settings
  game.settings.register("godbound-pa-options", "paradoxHp", {
    name: "Paradoxical Archive HP",
    hint: "Double Con value as base HP + per-level bonus. On enable: grants proportional extra current HP (preserves relative health). On disable: clamps excess.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: handleParadoxHpChange
  });

  game.settings.register("godbound-pa-options", "paradoxDamage", {
    name: "Paradoxical Archive Damage",
    hint: "Placeholder checkbox for damage changes (not yet implemented).",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: refreshCharacters
  });

  game.settings.register("godbound-pa-options", "startingEffort", {
    name: "Starting Effort Override",
    hint: "Set custom Effort at level 1 (0 = no override).",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
    range: { min: 0, max: 20, step: 1 },
    onChange: refreshCharacters
  });

  // override prepareDerivedData — override max HP + Effort (do NOT touch health.value here)
  libWrapper.register("godbound-pa-options", "CONFIG.Actor.documentClass.prototype.prepareDerivedData", function (...args) {

    const { dominionSpent, influenceUsed, bonusEffort, bonusInfluence } =
            data.parent.items
                .filter((i) => i.type == 'project' || i.type == 'word')
                .reduce(
                    (acc, i) => ({
                        dominionSpent:
                            acc.dominionSpent + (i.system?.cost?.dominion || 0),
                        influenceUsed:
                            acc.influenceUsed +
                            (i.system?.cost?.influence || 0),
                        bonusEffort:
                            acc.bonusEffort +
                            (i.system?.effortOfTheWord ? 1 : 0),
                        bonusInfluence:
                            acc.bonusInfluence +
                            (i.system?.influenceOfTheWord ? 1 : 0),
                    }),
                    {
                        dominionSpent: 0,
                        influenceUsed: 0,
                        bonusEffort: 0,
                        bonusInfluence: 0,
                    }
                )
        data.resources.dominion.spent = dominionSpent
        const { level, idx } = tables.advancement.reduce(
            (acc, r, idx) => {
                if (
                    r.requirements.xp <= data.details.level.xp &&
                    r.requirements.dominionSpent <=
                        data.resources.dominion.spent &&
                    r.level >= acc.level
                ) {
                    return { level: r.level, idx }
                } else {
                    return acc
                }
            },
            { level: 1, idx: 0 }
        ) ?? { level: 1, idx: 0 }
        data.details.level.value = level
        if (level < 10) {
            data.advancement = tables.advancement[idx + 1].requirements
        } else {
            data.advancement = false
        }
        data.resources.effort.max =
            data.details.level.value - 1 + 2 + bonusEffort
        data.resources.influence.max =
            data.details.level.value - 1 + 2 + bonusInfluence
        data.resources.effort.value = data.parent.items.reduce(
            (acc, i) =>
                ['word', 'gift'].includes(i.type)
                    ? Math.max(acc - i.system.effort, 0)
                    : acc,
            data.resources.effort.max
        )
        data.resources.influence.value =
            data.resources.influence.max - influenceUsed
        if (game.settings.get("godbound-pa-options", "paradoxHp")) {
            data.health.max =
            data.attributes.con.value * 2 +
            (data.details.level.value - 1) *
                (data.attributes.con.mod + Math.ceil(data.attributes.con.value / 2))
          }
        else {
            data.health.max =
            8 +
            data.attributes.con.mod +
            (data.details.level.value - 1) *
                (4 + Math.ceil(data.attributes.con.mod / 2))
          }
        data.health.value = fns.bound(data.health.value, 0, data.health.max)
        data.prepareSaves()
    

  }, "OVERRIDE");
});
