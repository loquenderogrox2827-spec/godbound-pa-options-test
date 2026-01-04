Hooks.once("init", () => {
  const refreshCharacters = () => {
    game.actors.filter(a => a.type === "character").forEach(a => {
      a.prepareData();
      if (a.sheet?.rendered) a.sheet.render(true);
    });
    ui.notifications.info("Paradoxical Archive options applied — character sheets refreshed.");
  };

  // Register your settings (keep onChange for instant refresh on toggle/slider)
  game.settings.register("godbound-pa-options", "paradoxHp", {
    name: "Paradoxical Archive HP",
    hint: "Double Con value as base HP + per-level bonus. Automatically grants proportional extra current HP when max increases.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: refreshCharacters
  });

  game.settings.register("godbound-pa-options", "paradoxDamage", {
    name: "Paradoxical Archive Damage",
    hint: "Placeholder — not yet implemented.",
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

  // Primary wrapper: target the exact DataModel method that sets HP max and clamps current HP
  // Path confirmed from Godbound system structure: game.system.model.Actor.character.prototype.prepareLevelValues
  libWrapper.register(
    "godbound-pa-options",
    "game.system.model.Actor.character.prototype.prepareLevelValues",
    function (wrapped, ...args) {
      // Run the original method first — it sets default HP max and clamps current HP to that default
      wrapped(...args);

      // Safeguard
      if (this.parent.type !== "character") return;

      const data = this;
      const level = data.details?.level?.value ?? 1;

      // Starting Effort Override (level 1 only) — do this first if you want it to take priority
      const effortOverride = game.settings.get("godbound-pa-options", "startingEffort");
      if (effortOverride > 0 && level === 1) {
        // Re-compute committed Effort (mirrors original logic but uses parent.items)
        const committed = data.parent.items.reduce((acc, item) => {
          if (["word", "gift"].includes(item.type)) {
            return acc + (item.system.effort || 0);
          }
          return acc;
        }, 0);

        data.resources.effort.max = effortOverride;
        data.resources.effort.value = Math.max(0, effortOverride - committed);
      }

      // Paradoxical Archive HP override
      const paradoxHpEnabled = game.settings.get("godbound-pa-options", "paradoxHp");
      if (!paradoxHpEnabled) return; // When disabled, keep the original default max/clamp

      const conValue = data.attributes?.con?.value ?? 10;
      const conMod = data.attributes?.con?.mod ?? 0;

      // Capture the old/default max that the original code just set
      const oldMax = data.health.max;

      // Your custom max formula
      let newMax = conValue * 2;
      if (level > 1) {
        newMax += (level - 1) * (conMod + Math.ceil(conValue / 2));
      }

      // Apply custom max
      data.health.max = newMax;

      // Proportional grant: add the gained HP buffer (preserves relative health)
      // Safe because it only adds when newMax > oldMax (e.g., on enable, level up, Con increase)
      const difference = Math.max(0, newMax - oldMax);
      if (difference > 0) {
        data.health.value += difference;
      }

      // Final clamp — mirrors the system's fns.bound but ensures nothing exceeds new max
      data.health.value = Math.max(0, Math.min(data.health.value, data.health.max));
    },
    "WRAPPER"
  );
});
