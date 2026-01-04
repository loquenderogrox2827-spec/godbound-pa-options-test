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
            this.parent.items
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
        this.resources.dominion.spent = dominionSpent
        const { level, idx } = tables.advancement.reduce(
            (acc, r, idx) => {
                if (
                    r.requirements.xp <= this.details.level.xp &&
                    r.requirements.dominionSpent <=
                        this.resources.dominion.spent &&
                    r.level >= acc.level
                ) {
                    return { level: r.level, idx }
                } else {
                    return acc
                }
            },
            { level: 1, idx: 0 }
        ) ?? { level: 1, idx: 0 }
        this.details.level.value = level
        if (level < 10) {
            this.advancement = tables.advancement[idx + 1].requirements
        } else {
            this.advancement = false
        }
        this.resources.effort.max =
            this.details.level.value - 1 + 2 + bonusEffort
        this.resources.influence.max =
            this.details.level.value - 1 + 2 + bonusInfluence
        this.resources.effort.value = this.parent.items.reduce(
            (acc, i) =>
                ['word', 'gift'].includes(i.type)
                    ? Math.max(acc - i.system.effort, 0)
                    : acc,
            this.resources.effort.max
        )
        this.resources.influence.value =
            this.resources.influence.max - influenceUsed
        if (game.settings.get("godbound-pa-options", "paradoxHp")) {
            this.health.max =
            this.attributes.con.value * 2 +
            (this.details.level.value - 1) *
                (this.attributes.con.mod + Math.ceil(this.attributes.con.value / 2))
          }
        else {
            this.health.max =
            8 +
            this.attributes.con.mod +
            (this.details.level.value - 1) *
                (4 + Math.ceil(this.attributes.con.mod / 2))
          }
        this.health.value = fns.bound(this.health.value, 0, this.health.max)
        this.prepareSaves()
    

  }, "OVERRIDE");
});
