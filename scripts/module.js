Hooks.once("ready", () => {
  // Override the specific method containing the HP calculation and clamp
  libWrapper.register("godbound-pa-options", "game.system.model.Actor.character.prototype.prepareLevelValues", function () {
    const { dominionSpent, influenceUsed, bonusEffort, bonusInfluence } =
      this.parent.items
        .filter((i) => i.type == 'project' || i.type == 'word')
        .reduce(
          (acc, i) => ({
            dominionSpent: acc.dominionSpent + (i.system?.cost?.dominion || 0),
            influenceUsed: acc.influenceUsed + (i.system?.cost?.influence || 0),
            bonusEffort: acc.bonusEffort + (i.system?.effortOfTheWord ? 1 : 0),
            bonusInfluence: acc.bonusInfluence + (i.system?.influenceOfTheWord ? 1 : 0),
          }),
          { dominionSpent: 0, influenceUsed: 0, bonusEffort: 0, bonusInfluence: 0 }
        );

    this.resources.dominion.spent = dominionSpent;

    const { level, idx } =
      tables.advancement.reduce(
        (acc, r, idx) => {
          if (
            r.requirements.xp <= this.details.level.xp &&
            r.requirements.dominionSpent <= this.resources.dominion.spent &&
            r.level >= acc.level
          ) {
            return { level: r.level, idx };
          } else {
            return acc;
          }
        },
        { level: 1, idx: 0 }
      ) ?? { level: 1, idx: 0 };

    this.details.level.value = level;

    if (level < 10) {
      this.advancement = tables.advancement[idx + 1].requirements;
    } else {
      this.advancement = false;
    }

    this.resources.effort.max = this.details.level.value - 1 + 2 + bonusEffort;
    this.resources.influence.max = this.details.level.value - 1 + 2 + bonusInfluence;

    this.resources.effort.value = this.parent.items.reduce(
      (acc, i) =>
        ['word', 'gift'].includes(i.type)
          ? Math.max(acc - i.system.effort, 0)
          : acc,
      this.resources.effort.max
    );

    this.resources.influence.value = this.resources.influence.max - influenceUsed;

    // Branched HP max — custom when enabled
    if (game.settings.get("godbound-pa-options", "paradoxHp")) {
      const conValue = this.attributes?.con?.value ?? 10;
      const conMod = this.attributes?.con?.mod ?? 0;
      let customMax = conValue * 2;
      if (this.details.level.value > 1) {
        customMax += (this.details.level.value - 1) * (conMod + Math.ceil(conValue / 2));
      }
      this.health.max = customMax;
    } else {
      // Original system formula
      this.health.max =
        8 +
        this.attributes.con.mod +
        (this.details.level.value - 1) *
          (4 + Math.ceil(this.attributes.con.mod / 2));
    }

    // Clamp now uses the (possibly custom) max — higher values stick!
    this.health.value = fns.bound(this.health.value, 0, this.health.max);

    this.prepareSaves();
  }, "OVERRIDE");
});

Hooks.once("init", () => {
  const refreshCharacters = () => {
    const characters = game.actors.filter(a => a.type === "character");
    characters.forEach(a => {
      a.prepareData();
      if (a.sheet?.rendered) a.sheet.render(true);
    });
  };

  // onChange handler — grants proportional extra current HP on enable
  const handleParadoxHpChange = async (enabled) => {
    const characters = game.actors.filter(a => a.type === "character");
    let updatedCount = 0;

    for (const actor of characters) {
      const data = actor.system;
      const level = data.details?.level?.value ?? 1;
      const conValue = data.attributes?.con?.value ?? 10;
      const conMod = data.attributes?.con?.mod ?? 0;

      const oldMax = 8 + conMod + (level - 1) * (4 + Math.ceil(conMod / 2));

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
      }
      // Disable handled automatically by clamp in prepareLevelValues
    }

    refreshCharacters();
    ui.notifications.info(`Paradoxical Archive HP ${enabled ? "enabled" : "disabled"} — ${updatedCount} character(s) adjusted.`);
  };

  // Settings registration (keep your other ones)
  game.settings.register("godbound-pa-options", "paradoxHp", {
    name: "Paradoxical Archive HP",
    hint: "Double Con value as base HP + per-level bonus. On enable: proportional current HP grant.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: handleParadoxHpChange
  });

  // ... your other settings with onChange: refreshCharacters

  // Keep your Actor prepareDerivedData wrapper for Effort override only (remove HP part)
  libWrapper.register("godbound-pa-options", "CONFIG.Actor.documentClass.prototype.prepareDerivedData", function (wrapped, ...args) {
    wrapped(...args);

    if (this.type !== "character") return;

    const data = this.system;
    const level = data.details?.level?.value ?? 1;

    // Effort override only
    const effortOverride = game.settings.get("godbound-pa-options", "startingEffort");
    if (effortOverride > 0 && level === 1) {
      const committed = this.items.reduce((acc, item) => {
        if (["word", "gift"].includes(item.type)) {
          return acc + (item.system.effort || 0);
        }
        return acc;
      }, 0);

      data.resources.effort.max = effortOverride;
      data.resources.effort.value = Math.max(0, effortOverride - committed);
    }
  }, "WRAPPER");
});
